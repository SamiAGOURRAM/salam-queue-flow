import { expect, test } from '@playwright/test';

test('consultation write flow saves sections, tracks print state, and surfaces stale-write conflicts', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('i18nextLng', 'en');
  });

  await page.goto('/e2e/consultation');

  await expect(page.getByRole('heading', { name: 'Consultation E2E Harness' })).toBeVisible();
  await expect(page.getByTestId('consultation-reason-for-visit-input')).toHaveValue('Persistent headache for 3 days');

  await page.getByTestId('consultation-reason-for-visit-input').fill('Follow-up for migraines and nausea.');
  const notesEditor = page.getByTestId('consultation-clinical-notes-editor').locator('.ProseMirror');
  await notesEditor.click();
  await notesEditor.press('Control+A');
  await notesEditor.fill('Neurological exam stable. Continue hydration and monitor symptoms.');
  await page.getByTestId('consultation-save-notes-btn').click();

  await expect(page.getByTestId('consultation-event-log-list')).toContainText('save-notes:');

  await page.getByTestId('consultation-tab-ordonnance').click();
  await page.getByTestId('consultation-medication-input-0').fill('Ibuprofen');
  await page.getByTestId('consultation-save-ordonnance-btn').click();

  await expect(page.getByTestId('consultation-event-log-list')).toContainText('save-prescriptions:');
  await expect(page.getByTestId('consultation-pending-print-state')).toHaveText('pending');

  await page.getByTestId('consultation-print-ordonnance-btn').click();
  await expect(page.getByTestId('consultation-event-log-list')).toContainText('print-triggered');

  await page.getByTestId('simulate-consultation-conflict-btn').click();
  await page.getByTestId('consultation-tab-notes').click();
  await notesEditor.click();
  await notesEditor.press('Control+A');
  await notesEditor.fill('This update should conflict due to stale revision.');
  await page.getByTestId('consultation-save-notes-btn').click();

  await expect(page.getByTestId('consultation-error-banner')).toContainText(
    'Consultation notes changed in another session. Reload before saving.'
  );
});
