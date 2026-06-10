import { expect, test } from '@playwright/test';

test('medication catalog workspace supports search, edit, and active-state toggles', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('i18nextLng', 'en');
  });

  await page.goto('/e2e/medications');

  await expect(page.getByRole('heading', { name: 'Medication Catalog E2E Harness' })).toBeVisible();
  await expect(page.getByTestId('clinic-medication-catalog-page')).toBeVisible();

  await expect(page.getByTestId('medication-catalog-row-medcat-1')).toBeVisible();
  await expect(page.getByTestId('medication-catalog-row-medcat-2')).toBeVisible();
  await expect(page.getByTestId('medication-catalog-row-medcat-3')).toHaveCount(0);

  await page.getByTestId('medication-catalog-search-input').fill('tylenol');
  await expect(page.getByTestId('medication-catalog-row-medcat-1')).toBeVisible();
  await expect(page.getByTestId('medication-catalog-row-medcat-2')).toHaveCount(0);

  await page.getByTestId('medication-catalog-search-input').fill('');

  const medOneRow = page.getByTestId('medication-catalog-row-medcat-1');
  await medOneRow.locator('input').nth(1).fill('Acetaminophen, Tylenol, Panadol');
  await page.getByTestId('medication-catalog-save-medcat-1').click();

  await page.getByTestId('medication-catalog-search-input').fill('panadol');
  await expect(page.getByTestId('medication-catalog-row-medcat-1')).toBeVisible();
  await expect(page.getByTestId('medication-e2e-events')).toContainText('update:medcat-1');

  await page.getByTestId('medication-catalog-search-input').fill('');
  await page
    .getByTestId('medication-catalog-row-medcat-1')
    .getByRole('button', { name: 'Deactivate' })
    .click();

  await expect(
    page.getByTestId('medication-catalog-row-medcat-1').getByRole('button', { name: 'Activate' })
  ).toBeVisible();

  await page.getByRole('switch').first().click();
  await expect(page.getByTestId('medication-catalog-row-medcat-1')).toBeVisible();

  await page
    .getByTestId('medication-catalog-row-medcat-1')
    .getByRole('button', { name: 'Activate' })
    .click();

  await expect(
    page.getByTestId('medication-catalog-row-medcat-1').getByRole('button', { name: 'Deactivate' })
  ).toBeVisible();
  await expect(page.getByTestId('medication-e2e-events')).toContainText('update:medcat-1');
});
