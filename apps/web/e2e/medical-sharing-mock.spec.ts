import { expect, test, type Page } from '@playwright/test';

async function fillOtp(page: Page, code: string) {
  const otpInput = page
    .locator('input[autocomplete="one-time-code"], input[data-input-otp], input[inputmode="numeric"]')
    .first();

  await otpInput.click();
  await otpInput.press('Control+A');
  await otpInput.type(code);
  await expect(otpInput).toHaveValue(code);
}

test('medical sharing dialog supports sequential OTP flow with mocked data', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('i18nextLng', 'en');
  });

  await page.goto('/e2e/medical-sharing');

  await expect(page.getByRole('heading', { name: 'Medical Sharing E2E Harness' })).toBeVisible();
  await expect(page.getByTestId('mock-otp-code')).toHaveText('123456');
  await expect(page.getByTestId('mock-requested-scope-type')).toHaveText('not-requested');

  await page.getByTestId('open-request-dialog-btn').click();
  await page.getByTestId('scope-radio-full_history').click();
  await page.getByRole('button', { name: 'Send Access Code' }).click();
  await expect(page.getByTestId('mock-requested-scope-type')).toHaveText('full_history');

  await expect(page.getByRole('button', { name: 'Verify and Open History' })).toBeVisible();

  // Step 1: validate an incorrect code and confirm proper error handling.
  await fillOtp(page, '111111');
  await page.getByRole('button', { name: 'Verify and Open History' }).click();
  await expect(page.getByText('Invalid code', { exact: true }).first()).toBeVisible();

  // Step 2: validate the mocked OTP and continue to shared history panel.
  await fillOtp(page, '123456');
  await page.getByRole('button', { name: 'Verify and Open History' }).click();

  await expect(page.getByText('Shared Medical History')).toBeVisible();
  await expect(page.getByText('Expires in', { exact: false }).first()).toBeVisible();

  await page.getByRole('button', { name: 'Salam Queue Clinic' }).click();

  await expect(page.getByText('Reason for visit')).toBeVisible();
  await expect(page.getByText('Follow-up for chronic headaches.')).toBeVisible();
  await expect(page.getByText('Paracetamol 500mg')).toBeVisible();
  await expect(page.getByText('CRP')).toBeVisible();
  await expect(page.getByText('Procedure report baseline')).toBeVisible();
  await expect(page.getByRole('img', { name: 'post-procedure.jpg' })).toBeVisible();
});
