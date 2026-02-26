const { test, expect } = require('@playwright/test');

async function openVideoAsStoredUser(page, user) {
  await page.addInitScript((payload) => {
    localStorage.setItem('user', JSON.stringify(payload));
    localStorage.setItem('token', 'e2e-token');
  }, user);

  await page.goto('/login');
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.history.pushState({}, '', '/video');
    window.dispatchEvent(new PopStateEvent('popstate'));
  });
}

test('video flow: create instant room, toggle media controls, and leave', async ({ page }) => {
  const roomId = `e2e-room-${Date.now()}`;

  await openVideoAsStoredUser(page, {
    id: 101,
    name: 'Host User',
    email: 'host@example.com',
  });

  await page.route('**/api/instant', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        message: 'Instant meeting created',
        roomId,
        meetingId: 999,
        meetingTitle: 'Instant Meeting',
        creatorName: 'Host User',
        creatorEmail: 'host@example.com',
      }),
    });
  });

  await expect(page.getByRole('button', { name: 'Join Meeting' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Create Meeting' }).click();
  await page.getByRole('button', { name: 'Create & Start' }).click();

  await expect(page.getByRole('heading', { name: /Meeting ID:/ })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByRole('heading', { name: new RegExp(roomId) })).toBeVisible({
    timeout: 30000,
  });

  await page.getByTitle('Turn off camera').click();
  await expect(page.getByTitle('Turn on camera')).toBeVisible();

  await page.getByTitle('Mute').click();
  await expect(page.getByTitle('Unmute')).toBeVisible();

  await page.getByRole('contentinfo').getByTitle('Leave meeting').click();
  await expect(page.getByRole('button', { name: 'Create Meeting' })).toBeVisible({
    timeout: 15000,
  });
});
