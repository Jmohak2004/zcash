import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
let missing = 0;
const check = (name, ok) => { console.log(`${ok ? 'OK' : 'MISSING'}  ${name}`); if (!ok) missing++; };
check('Node >=22.13', Number(process.versions.node.split('.')[0]) >= 22);
for (const path of ['apps/backend/.env', 'apps/frontend/.env.local', 'apps/frontend/public/sdk/build.json', '.cache/snap/dist/bundle.js']) check(path, existsSync(resolve(root, path)));
const envPath = resolve(root, 'apps/backend/.env');
if (existsSync(envPath)) {
  const content = readFileSync(envPath, 'utf8');
  for (const key of ['OPENAI_API_KEY','MERCHANT_Z_ADDRESS','MERCHANT_WHATSAPP_NUMBER','TWILIO_AUTH_TOKEN','MERCHANT_ADMIN_TOKEN']) check(`${key} configured`, new RegExp(`^${key}=.+`, 'm').test(content));
}
console.log('No secret values were printed. Network connectivity and wallet approval must be tested separately.');
process.exitCode = missing ? 1 : 0;
