import { expect, test } from '@playwright/test';

test('patient in-app approval path is sequentially consistent', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('i18nextLng', 'en');
  });

  await page.goto('/e2e/patient-medical-sharing');

  await expect(page.getByRole('heading', { name: 'Patient Medical Sharing E2E Harness' })).toBeVisible();

  await expect(page.getByText('Dr. Nadia Atlas')).toBeVisible();
  await expect(page.getByText('Dr. Youssef Zahra')).toBeVisible();

  // 1) Review and approve first pending request.
  await page.getByTestId('review-request-00000000-0000-0000-0000-00000000pa01').click();

  await expect(page.getByRole('heading', { name: 'Medical records access request' })).toBeVisible();

  await page.getByLabel('24 hours').click();
  await page.getByRole('button', { name: 'Approve' }).click();

  await expect(page.getByTestId('event-log-list')).toContainText('approved:00000000-0000-0000-0000-00000000pa01:86400');

  // 2) Review and deny second pending request.
  await page.getByTestId('review-request-00000000-0000-0000-0000-00000000pa02').click();

  await page.getByRole('button', { name: 'Deny' }).click();

  await expect(page.getByTestId('event-log-list')).toContainText('denied:00000000-0000-0000-0000-00000000pa02');

  // 3) Revoke active share and verify empty state.
  await page.getByTestId('revoke-share-00000000-0000-0000-0000-00000000pa01').click();

  await expect(page.getByTestId('event-log-list')).toContainText('revoked:00000000-0000-0000-0000-00000000pa01');
  await expect(page.getByText('No active medical record shares.')).toBeVisible();
});
