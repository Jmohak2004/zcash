export interface Pczt { serialize(): Uint8Array; }
export interface Wallet {
  create_account_ufvk(name: string, key: string, fingerprint: unknown, index: number, birthday: number): Promise<number>;
  sync(): Promise<void>;
  pczt_create(account: number, address: string, value: bigint, memo: Uint8Array): Promise<Pczt>;
  pczt_prove(pczt: Pczt): Promise<Pczt>;
  pczt_send(pczt: Pczt): Promise<string>;
  db_to_bytes(): Promise<Uint8Array>;
  get_current_address(account: number): Promise<string>;
}
export interface SDK {
  default(): Promise<unknown>;
  initThreadPool(count: number): Promise<void>;
  WebWallet: new (network: string, endpoint: string, trusted: number, untrusted: number, data?: Uint8Array) => Wallet;
  SeedFingerprint: { from_bytes(bytes: Uint8Array): unknown };
  Pczt: { from_bytes(bytes: Uint8Array): Pczt };
}
let loading: Promise<SDK> | undefined;
export function loadSdk(): Promise<SDK> {
  if (!loading) loading = (async () => {
    if (!crossOriginIsolated) throw new Error('WebZjs requires cross-origin isolation. Open the checkout directly over HTTPS or localhost.');
    const manifest = await fetch('/sdk/build.json', { cache: 'no-store' });
    if (!manifest.ok) throw new Error('The testnet SDK has not been built. Run npm run sdk:build first.');
    const build = await manifest.json();
    if (build.network !== 'test' || build.adapter !== 'zpay-v1') throw new Error('Incorrect SDK build.');
    const url = '/sdk/webzjs_wallet.js';
    const sdk: SDK = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ url);
    await sdk.default();
    await sdk.initThreadPool(Math.max(1, Math.min(4, navigator.hardwareConcurrency || 2)));
    return sdk;
  })();
  return loading;
}
export function fromHex(hex: string) {
  if (!hex || hex.length % 2 || !/^[\da-f]+$/i.test(hex)) throw new Error('Invalid response from Snap.');
  return Uint8Array.from(hex.match(/../g)!, byte => parseInt(byte, 16));
}
export const toHex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
