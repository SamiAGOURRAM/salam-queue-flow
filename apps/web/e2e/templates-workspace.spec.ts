import { expect, test } from '@playwright/test';

test('templates workspace supports filtering, create, edit, and delete flows', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('i18nextLng', 'en');
  });

  await page.goto('/e2e/templates');

  await expect(page.getByRole('heading', { name: 'Templates E2E Harness' })).toBeVisible();
  await expect(page.getByTestId('clinic-templates-page')).toBeVisible();

  await page.getByTestId('templates-scope-filter-trigger').click();
  await page.getByRole('option', { name: 'Personal scope' }).click();
  await expect(page.getByTestId('template-list-item-tpl-personal-1')).toBeVisible();
  await expect(page.getByTestId('template-list-item-tpl-clinic-1')).toHaveCount(0);

  await page.getByTestId('templates-scope-filter-trigger').click();
  await page.getByRole('option', { name: 'All scopes' }).click();

  await page.getByTestId('templates-search-input').fill('intake');
  await expect(page.getByTestId('template-list-item-tpl-system-1')).toBeVisible();
  await page.getByTestId('templates-search-input').fill('');

  await page.getByTestId('templates-new-template-btn').click();
  await page.locator('#template-create-title').fill('E2E Follow-up Template');
  await page.locator('#template-create-description').fill('Created by Playwright to validate template creation.');
  await page.locator('#template-create-tags').fill('e2e,follow-up');

  const createEditor = page.getByTestId('templates-create-editor').locator('.ProseMirror');
  await createEditor.click();
  await createEditor.press('Control+A');
  await createEditor.fill('E2E generated follow-up content block.');

  await page.getByTestId('templates-create-save-btn').click();
  const createdTemplateItem = page
    .locator('[data-testid^="template-list-item-"]')
    .filter({ hasText: 'E2E Follow-up Template' })
    .first();
  await expect(createdTemplateItem).toBeVisible();
  await expect(page.getByTestId('templates-e2e-events')).toContainText('create:tpl-new-');

  await createdTemplateItem.click();
  await page.getByTestId('templates-edit-btn').click();
  await page.locator('#template-edit-title').fill('E2E Follow-up Template Updated');

  const editEditor = page.getByTestId('templates-edit-editor').locator('.ProseMirror');
  await editEditor.click();
  await editEditor.press('Control+A');
  await editEditor.fill('Updated E2E content for this reusable template.');

  await page.getByTestId('templates-save-edit-btn').click();
  const updatedTemplateItem = page
    .locator('[data-testid^="template-list-item-"]')
    .filter({ hasText: 'E2E Follow-up Template Updated' })
    .first();
  await expect(updatedTemplateItem).toBeVisible();
  await expect(page.getByTestId('templates-e2e-events')).toContainText('update:');

  await page.getByTestId('templates-delete-btn').click();
  await page.getByTestId('templates-confirm-delete-btn').click();
  await expect(updatedTemplateItem).toHaveCount(0);
  await expect(page.getByTestId('templates-e2e-events')).toContainText('delete:');
});
