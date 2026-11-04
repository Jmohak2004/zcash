import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, cpSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '..');
const source = resolve(process.env.WEBZJS_SOURCE || `${root}/.cache/WebZjs`);
const commit = 'a50df944c32243cb8da9f86e7d52cb65ac926439';
function run(command, args, cwd = source) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env: process.env });
  if (result.error || result.status !== 0) throw result.error || new Error(`${command} failed (${result.status})`);
}
if (!existsSync(source)) {
  mkdirSync(resolve(source, '..'), { recursive: true });
  run('git', ['clone', 'https://github.com/ChainSafe/WebZjs.git', source], root);
  run('git', ['checkout', commit]);
}
const revision = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).stdout.trim();
if (revision !== commit) throw new Error(`Expected pinned WebZjs ${commit}, got ${revision}`);
const patch = resolve(root, 'patches/webzjs-checkout.patch');
const applied = spawnSync('git', ['apply', '--reverse', '--check', patch], { cwd: source });
if (applied.status !== 0) run('git', ['apply', patch]);
const pack = process.env.WASM_PACK || 'wasm-pack';
for (const name of ['wallet', 'keys']) {
  run(pack, ['build', '-t', 'web', '--release', '--scope', 'chainsafe', '--out-dir', `../../packages/webzjs-${name}`, '--no-default-features', ...(name === 'wallet' ? ['--features', 'wasm wasm-parallel no-bundler'] : []), '-Z', 'build-std=panic_abort,std'], resolve(source, `crates/webzjs-${name}`));
}
const destination = resolve(root, 'apps/frontend/public/sdk');
mkdirSync(destination, { recursive: true });
cpSync(resolve(source, 'packages/webzjs-wallet'), destination, { recursive: true });
writeFileSync(resolve(destination, 'build.json'), JSON.stringify({ commit, network: 'test', adapter: 'zpay-v1' }));
console.log(`SDK built into ${destination}. Next: npm run snap:prepare`);
