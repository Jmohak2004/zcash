import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export class Store {
  constructor(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS invoices (id TEXT PRIMARY KEY, message_id TEXT UNIQUE NOT NULL, body TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS replies (id TEXT PRIMARY KEY, body TEXT NOT NULL);
    `);
  }
  get(id) { const row = this.db.prepare('SELECT body FROM invoices WHERE id=?').get(id); return row ? JSON.parse(row.body) : undefined; }
  byMessage(id) { const row = this.db.prepare('SELECT body FROM invoices WHERE message_id=?').get(id); return row ? JSON.parse(row.body) : undefined; }
  put(invoice, messageId) { this.db.prepare('INSERT INTO invoices VALUES (?, ?, ?)').run(invoice.session_id, messageId, JSON.stringify(invoice)); }
  update(invoice) { this.db.prepare('UPDATE invoices SET body=? WHERE id=?').run(JSON.stringify(invoice), invoice.session_id); }
  all() { return this.db.prepare('SELECT body FROM invoices ORDER BY rowid DESC LIMIT 1000').all().map(row => JSON.parse(row.body)); }
  reply(id, body) { if (body !== undefined) this.db.prepare('INSERT OR REPLACE INTO replies VALUES (?, ?)').run(id, body); return this.db.prepare('SELECT body FROM replies WHERE id=?').get(id)?.body; }
  close() { this.db.close(); }
}
