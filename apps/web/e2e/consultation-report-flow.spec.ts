import { expect, test } from '@playwright/test';
import { Document, Packer, Paragraph } from 'docx';

const ONE_PIXEL_PNG = Buffer.from([
  137, 80, 78, 71, 13, 10, 26, 10,
  0, 0, 0, 13, 73, 72, 68, 82,
  0, 0, 0, 1, 0, 0, 0, 1,
  8, 6, 0, 0, 0, 31, 21, 196,
  137, 0, 0, 0, 10, 73, 68, 65,
  84, 120, 156, 99, 0, 1, 0, 0,
  5, 0, 1, 13, 10, 45, 180, 0,
  0, 0, 0, 73, 69, 78, 68, 174,
  66, 96, 130,
]);

async function createDocxFixture(): Promise<Buffer> {
  const document = new Document({
    sections: [
      {
        children: [new Paragraph('DOCX imported content for report flow.')],
      },
    ],
  });

  return Buffer.from(await Packer.toBuffer(document));
}

test('consultation report flow supports template insert, image upload, draft save, and finalize', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('i18nextLng', 'en');
  });

  await page.goto('/e2e/consultation');

  await expect(page.getByRole('heading', { name: 'Consultation E2E Harness' })).toBeVisible();

  await page.getByTestId('consultation-tab-report').click();

  await page.getByTestId('procedure-report-title-input').fill('Arthrocentesis follow-up report');

  const reportEditor = page.getByTestId('consultation-procedure-report-editor').locator('.ProseMirror');
  await reportEditor.click();
  await reportEditor.fill('Initial report content.');

  await page.getByRole('button', { name: 'Templates' }).click();
  await expect(page.getByRole('dialog')).toContainText('Insert Template');
  await page.getByText('Procedure report baseline', { exact: true }).click();

  await expect(page.getByTestId('consultation-event-log-list')).toContainText('template-used:');

  await expect(page.getByRole('button', { name: 'DOCX' })).toBeVisible();

  const docxFixture = await createDocxFixture();
  await page.getByRole('button', { name: 'DOCX' }).click();
  await page.getByTestId('consultation-procedure-report-editor-docx-input').setInputFiles({
    name: 'procedure-report.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    buffer: docxFixture,
  });
  await expect(reportEditor).toContainText('DOCX imported content for report flow.');

  await page.getByRole('button', { name: 'Image' }).click();
  await page.getByTestId('consultation-procedure-report-editor-image-input').setInputFiles({
    name: 'wound.png',
    mimeType: 'image/png',
    buffer: ONE_PIXEL_PNG,
  });

  await expect(page.getByTestId('consultation-event-log-list')).toContainText('upload-report-image:wound.png');
  await expect(reportEditor.locator('img')).toHaveCount(1);

  await page.getByTestId('procedure-report-save-draft-btn').click();
  await expect(page.getByTestId('consultation-event-log-list')).toContainText('save-report-draft:');

  await page.getByTestId('procedure-report-finalize-btn').click();
  await expect(page.getByTestId('consultation-event-log-list')).toContainText('finalize-report:');
});
