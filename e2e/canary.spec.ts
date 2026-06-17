import { expect, test } from './fixtures';

// canary does NOT call test.use({ userDataDir }), so it runs against the default
// fresh temp profile provided by the worker-scoped context fixture.

test('extension loads (service worker registered)', async ({ extensionId }) => {
  expect(extensionId).toBeTruthy();
});

test('popup renders', async ({ context, extensionId }) => {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/popup.html`);
  await expect(page.getByText(/SecureIntent/i)).toBeVisible();
});
