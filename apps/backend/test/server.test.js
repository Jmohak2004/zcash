import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import twilio from 'twilio';
import { createApp } from '../server.js';
import { validateInvoice } from '../src/extract.js';

const env = { TWILIO_VALIDATE_SIGNATURE: 'false', MERCHANT_WHATSAPP_NUMBER: 'whatsapp:+15551234567', MERCHANT_Z_ADDRESS: 'test-address-only', CHECKOUT_BASE_URL: 'https://checkout.example' };
const body = { From: env.MERCHANT_WHATSAPP_NUMBER, Body: 'Create 0.5 ZEC for Design', MessageSid: 'SM-test' };
test('creates a retrievable invoice and deduplicates concurrent retries', async () => {
  let calls = 0;
  const app = createApp({ env, extract: async () => { calls++; return { amount: 0.5, memo: 'Design & development' }; } });
  const responses = await Promise.all([1, 2].map(() => request(app).post('/webhook/twilio').type('form').send(body).expect(200)));
  assert.equal(calls, 1);
  assert.equal(responses[0].text, responses[1].text);
  assert.match(responses[0].text, /Design &amp; development/);
  const id = responses[0].text.match(/checkout\/([a-f0-9-]+)/)[1];
  const session = await request(app).get(`/api/session/${id}`).expect(200);
  assert.equal(session.body.amount, 0.5);
  assert.equal(session.body.merchant_z_address, env.MERCHANT_Z_ADDRESS);
  assert.equal(session.headers['cache-control'], 'no-store');
  await request(app).get('/api/session/not-a-uuid').expect(404);
});
test('bad input and extraction outages return TwiML without crashing', async () => {
  const app = createApp({ env, extract: async () => { throw new Error('upstream unavailable'); } });
  const result = await request(app).post('/webhook/twilio').type('form').send(body).expect(200);
  assert.match(result.text, /Could not create/);
  await request(app).get('/health').expect(200);
  await request(app).post('/webhook/twilio').type('form').send({ ...body, From: 'unknown' }).expect(403);
});
test('production requires valid Twilio signatures even if bypass is configured', async () => {
  const secureEnv = { ...env, NODE_ENV: 'production', TWILIO_AUTH_TOKEN: 'test-token', TWILIO_WEBHOOK_URL: 'https://api.example/webhook/twilio' };
  const app = createApp({ env: secureEnv, extract: async () => ({ amount: 1, memo: 'Work' }) });
  await request(app).post('/webhook/twilio').type('form').send(body).expect(403);
  const signature = twilio.getExpectedTwilioSignature(secureEnv.TWILIO_AUTH_TOKEN, secureEnv.TWILIO_WEBHOOK_URL, body);
  await request(app).post('/webhook/twilio').set('X-Twilio-Signature', signature).type('form').send(body).expect(200);
});
test('rejects invalid monetary values and oversized UTF-8 memos', () => {
  for (const amount_zec of [0, -1, Infinity, NaN, '0.5', 0.000000001, 21000001]) {
    assert.throws(() => validateInvoice({ amount_zec, memo: 'Work' }));
  }
  assert.throws(() => validateInvoice({ amount_zec: 1, memo: '😀'.repeat(129) }));
  assert.deepEqual(validateInvoice({ amount_zec: 0.00000001, memo: 'Work' }), { amount: 0.00000001, memo: 'Work' });
});

test('payment transitions prevent duplicate attempts and do not trust a submitted txid', async () => {
  const app = createApp({ env, extract: async () => ({ amount: 0.5, memo: 'Work' }) });
  const reply = await request(app).post('/webhook/twilio').type('form').send(body);
  const id = reply.text.match(/checkout\/([a-f0-9-]+)/)[1];
  const attempt = await request(app).post(`/api/session/${id}/attempt`).send({}).expect(200);
  await request(app).post(`/api/session/${id}/attempt`).send({}).expect(409);
  await request(app).post(`/api/session/${id}/attempt/broadcast`).send({ token: 'wrong' }).expect(403);
  await request(app).post(`/api/session/${id}/attempt/broadcast`).send(attempt.body).expect(200);
  await request(app).post(`/api/session/${id}/attempt/cancel`).send(attempt.body).expect(409);
  await request(app).post(`/api/session/${id}/attempt/submitted`).send({ ...attempt.body, txid: 'a'.repeat(64) }).expect(200);
  const invoice = await request(app).get(`/api/session/${id}`).expect(200);
  assert.equal(invoice.body.status, 'submitted');
  assert.equal(invoice.body.attempt_token, undefined);
});

test('observer matches amount, memo and shielded pool, and withdraws paid status on reorg', async () => {
  let receipts = [];
  const app = createApp({ env, verify: async () => receipts, extract: async () => ({ amount: 0.5, memo: 'Work' }) });
  const reply = await request(app).post('/webhook/twilio').type('form').send(body);
  const id = reply.text.match(/checkout\/([a-f0-9-]+)/)[1];
  const invoice = (await request(app).get(`/api/session/${id}`)).body;
  const memo = Buffer.from(invoice.payment_memo).toString('hex').padEnd(1024, '0');
  receipts = [{ pool: 'orchard', memo, amountZat: 49999999, confirmations: 3, txid: 'b'.repeat(64) }];
  await app.locals.reconcile();
  assert.equal(app.locals.store.get(id).status, 'open');
  receipts[0].amountZat = 50000000;
  receipts[0].memo = '00'.repeat(512);
  await app.locals.reconcile();
  assert.equal(app.locals.store.get(id).status, 'open');
  receipts[0].memo = memo;
  await app.locals.reconcile();
  assert.equal(app.locals.store.get(id).status, 'paid');
  receipts = [];
  await app.locals.reconcile();
  assert.equal(app.locals.store.get(id).status, 'submitted');
});

test('SQLite survives restart and Twilio retries reuse the persisted invoice', async () => {
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { Store } = await import('../src/store.js');
  const directory = mkdtempSync(join(tmpdir(), 'zpay-test-'));
  try {
    let store = new Store(join(directory, 'db.sqlite'));
    let app = createApp({ env, store, extract: async () => ({ amount: 0.5, memo: 'Work' }) });
    const first = await request(app).post('/webhook/twilio').type('form').send(body);
    store.close();
    store = new Store(join(directory, 'db.sqlite'));
    app = createApp({ env, store, extract: async () => { throw new Error('Must not call extraction'); } });
    const second = await request(app).post('/webhook/twilio').type('form').send(body);
    assert.equal(first.text, second.text);
    store.close();
  } finally { rmSync(directory, { recursive: true }); }
});
