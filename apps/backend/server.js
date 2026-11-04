import express from 'express';
import twilio from 'twilio';
import { v4 as uuid, validate as validUuid } from 'uuid';
import { timingSafeEqual } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { extractInvoice } from './src/extract.js';
import { Store } from './src/store.js';
import { createVerifier, reconcile } from './src/verifier.js';

export function createApp({ env = process.env, extract = extractInvoice, store = new Store(), verify = createVerifier(env) } = {}) {
  const app = express();
  const messages = new Map();
  const requests = new Map();
  let observerBusy = false;
  app.locals.store = store;
  app.locals.reconcile = async () => {
    if (observerBusy) return;
    observerBusy = true;
    try { await reconcile(store, verify, Number(env.MIN_CONFIRMATIONS || 3)); }
    finally { observerBusy = false; }
  };
  app.disable('x-powered-by');
  app.use(express.urlencoded({ extended: false, limit: '8kb' }));
  app.use(express.json({ limit: '8kb' }));
  app.use((_req, res, next) => { res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); next(); });
  const reply = (res, message) => {
    const response = new twilio.twiml.MessagingResponse(); response.message(message);
    res.type('text/xml').send(response.toString());
  };
  app.post('/webhook/twilio', async (req, res) => {
    if (env.NODE_ENV === 'production' || env.TWILIO_VALIDATE_SIGNATURE !== 'false') {
      if (!env.TWILIO_AUTH_TOKEN || !env.TWILIO_WEBHOOK_URL) return res.status(503).send('Webhook not configured');
      if (!twilio.validateRequest(env.TWILIO_AUTH_TOKEN, req.get('X-Twilio-Signature') || '', env.TWILIO_WEBHOOK_URL, req.body)) return res.status(403).send('Invalid signature');
    }
    if (!env.MERCHANT_WHATSAPP_NUMBER || req.body.From !== env.MERCHANT_WHATSAPP_NUMBER) return res.status(403).send('Unknown merchant');
    const sid = req.body.MessageSid;
    if (typeof sid !== 'string' || !sid || typeof req.body.Body !== 'string' || !req.body.Body.trim() || req.body.Body.length > 2000) return reply(res, 'Send: Create a checkout for 0.5 ZEC for Website Design.');
    if (store.reply(sid)) return reply(res, store.reply(sid));
    const recent = (requests.get(req.body.From) || []).filter(t => Date.now() - t < 60000);
    if (!messages.has(sid) && recent.length >= 10) return reply(res, 'Please wait a minute before creating more invoices.');
    if (!messages.has(sid)) {
      requests.set(req.body.From, [...recent, Date.now()]);
      const pending = (async () => {
        try {
          if (!env.MERCHANT_Z_ADDRESS) throw new Error('Merchant address missing');
          const base = new URL(env.CHECKOUT_BASE_URL || 'http://localhost:3000');
          if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Invalid checkout URL');
          let invoice = store.byMessage(sid);
          if (!invoice) {
            const { amount, memo } = await extract(req.body.Body);
            const session_id = uuid();
            const payment_memo = `${memo}\nZPAY:${session_id}`;
            if (Buffer.byteLength(payment_memo) > 512) throw new Error('Memo too long');
            invoice = { session_id, amount, amount_zatoshis: Math.round(amount * 1e8), memo, payment_memo, merchant_z_address: env.MERCHANT_Z_ADDRESS, network: 'test', status: 'open', confirmations: 0, created_at: Date.now(), expires_at: Date.now() + 86400000 };
            store.put(invoice, sid);
          }
          return `Z-Pay TESTNET checkout: ${invoice.amount} ZEC for ${invoice.memo}\n${base.origin}/checkout/${invoice.session_id}`;
        } catch { return 'Could not create your checkout. Check the amount and description (up to 470 UTF-8 bytes), then send a new message. Example: Create a checkout for 0.5 ZEC for Website Design.'; }
      })();
      messages.set(sid, pending);
    }
    try { const text = await messages.get(sid); store.reply(sid, text); return reply(res, text); }
    finally { messages.delete(sid); }
  });
  app.get('/api/session/:id', (req, res) => {
    const invoice = validUuid(req.params.id) ? store.get(req.params.id) : undefined;
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    const { attempt_token, ...safe } = invoice;
    res.json({ ...safe, status: invoice.status === 'open' && invoice.expires_at < Date.now() ? 'expired' : invoice.status, verification_enabled: !!verify });
  });
  // A durable reservation serializes checkout attempts across tabs/restarts.
  // Once broadcast begins, never automatically unlock: a timeout may have sent it.
  app.post('/api/session/:id/attempt', (req, res) => {
    const invoice = store.get(req.params.id);
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    if (invoice.status !== 'open') return res.status(409).json({ error: 'Invoice already has an active payment attempt.' });
    if (invoice.expires_at < Date.now()) return res.status(410).json({ error: 'Invoice expired.' });
    const token = uuid(); store.update({ ...invoice, status: 'preparing', attempt_token: token });
    res.json({ token });
  });
  app.post('/api/session/:id/attempt/:action', (req, res) => {
    const invoice = store.get(req.params.id);
    if (!invoice || !invoice.attempt_token || req.body.token !== invoice.attempt_token) return res.status(403).json({ error: 'Invalid attempt.' });
    const action = req.params.action;
    if (action === 'cancel' && invoice.status === 'preparing') {
      store.update({ ...invoice, status: 'open', attempt_token: undefined }); return res.json({ ok: true });
    }
    if (action === 'broadcast' && invoice.status === 'preparing') {
      store.update({ ...invoice, status: 'broadcasting' }); return res.json({ ok: true });
    }
    if (action === 'submitted' && ['broadcasting', 'submitted'].includes(invoice.status) && /^[0-9a-f]{64}$/i.test(req.body.txid || '')) {
      if (invoice.txid && invoice.txid !== req.body.txid) return res.status(409).json({ error: 'Transaction mismatch.' });
      store.update({ ...invoice, status: 'submitted', txid: req.body.txid.toLowerCase() }); return res.json({ ok: true });
    }
    return res.status(409).json({ error: 'Invalid payment transition.' });
  });
  app.get('/api/merchant/invoices', (req, res) => {
    const token = req.get('Authorization')?.replace(/^Bearer /, '') || '';
    const expected = env.MERCHANT_ADMIN_TOKEN || '';
    if (!expected || Buffer.byteLength(token) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return res.status(403).json({ error: 'Unauthorized' });
    res.json(store.all().map(({ attempt_token, ...invoice }) => invoice));
  });
  app.get('/health', (_req, res) => res.json({ ok: true, network: 'test', verification_enabled: !!verify }));
  app.use((err, _req, res, _next) => res.status(err.status === 413 ? 413 : 400).json({ error: 'Invalid request.' }));
  return app;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const store = new Store(process.env.DATABASE_PATH || './data/zpay.sqlite');
  const app = createApp({ store });
  const server = app.listen(Number(process.env.PORT || 3001), () => console.log('Z-Pay testnet API listening'));
  const tick = () => app.locals.reconcile().catch(() => console.warn('Receipt observer unavailable; settlement unchanged.'));
  const timer = setInterval(tick, 20000); timer.unref(); void tick();
  process.on('SIGTERM', () => { clearInterval(timer); server.close(() => { store.close(); process.exit(0); }); });
}
