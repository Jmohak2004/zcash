import { test, expect } from '@playwright/test';
import { existsSync } from 'node:fs';

test('mobile invoice preview is readable and cannot send a payment', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/checkout/demo');
  await expect(page.getByText('Website Design', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Pay Privately/ })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/private/tmp/zpay-checkout-mobile.png', fullPage: true });
});

test('missing invoice gives a recoverable error', async ({ page }) => {
  await page.route('**/api/session/missing', route => route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'Not found' }) }));
  await page.goto('/checkout/missing');
  await expect(page.getByRole('main').getByRole('alert')).toContainText('not found');
  await expect(page.getByRole('button', { name: /Pay Privately/ })).toHaveCount(0);
});

test('real SDK initializes shared-memory WASM and worker pool', async ({ page }) => {
  test.skip(!existsSync('apps/frontend/public/sdk/build.json'), 'Run npm run sdk:build first');
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const sdk = await import('/sdk/webzjs_wallet.js');
    await sdk.default();
    await sdk.initThreadPool(2);
    const wallet = new sdk.WebWallet('test', 'http://localhost:9067', 1, 3);
    return { isolated: crossOriginIsolated, create: typeof wallet.pczt_create, send: typeof wallet.pczt_send };
  });
  expect(result).toEqual({ isolated: true, create: 'function', send: 'function' });
});

test('checkout refuses a mainnet Snap before transaction construction', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'ethereum', { value: {
      isMetaMask: true,
      request: async ({ method }: { method: string }) => method === 'wallet_requestSnaps' ? {} : { network: 'main', adapter: 'zpay-v1' },
    } });
  });
  await page.route('**/api/session/network-check', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ session_id: 'network-check', amount: 0.5, memo: 'Design', merchant_z_address: 'test-only', network: 'test', status: 'open' }) }));
  await page.goto('/checkout/network-check');
  await page.getByRole('button', { name: /Pay Privately/ }).click();
  await expect(page.getByRole('main').getByRole('alert')).toContainText('not the Z-Pay testnet build');
});
