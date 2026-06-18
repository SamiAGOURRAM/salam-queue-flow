// One-off portfolio screenshot capture. Run with the stack up on :8080:
//   pnpm --filter @queuemed/web exec node scripts/screenshots.mjs
import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../../../docs/screenshots');
mkdirSync(OUT, { recursive: true });

const BASE = process.env.SHOT_BASE_URL || 'http://localhost:8080';
const VIEWPORT = { width: 1440, height: 900 };

const shots = [];
async function shot(page, name, fn) {
  try {
    await fn();
    await page.waitForTimeout(600);
    await page.screenshot({ path: resolve(OUT, `${name}.png`) });
    shots.push(`OK   ${name}`);
  } catch (e) {
    shots.push(`FAIL ${name} -> ${e.message.split('\n')[0]}`);
  }
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
// Force English for consistent portfolio shots (i18next reads this key).
await context.addInitScript(() => {
  try { localStorage.setItem('i18nextLng', 'en'); } catch { /* ignore */ }
});
const page = await context.newPage();
const settle = async (ms = 1800) => page.waitForTimeout(ms);
// Wait for every <img> on the page to finish loading (the hero image is large).
const awaitImages = () =>
  page.evaluate(() =>
    Promise.all(
      Array.from(document.images)
        .filter((i) => !i.complete)
        .map((i) => new Promise((r) => { i.onload = i.onerror = r; })),
    ),
  );

// 1) Landing hero (the search + geolocation centerpiece)
await shot(page, '01-landing', async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').first().waitFor({ timeout: 15000 });
  await settle(1500); // let IP-location + clinic stats settle
  await awaitImages();
  await settle(600);
});

// 2) Live typeahead — clear the geo-filtered location, then type to show the dropdown
await shot(page, '02-typeahead', async () => {
  const inputs = page.locator('form input[type="text"]');
  await inputs.nth(1).fill('');       // clear the IP-prefilled city (else seed data is filtered out)
  const search = inputs.nth(0);
  await search.click();
  await search.fill('el'); // >=2 chars (typeahead is gated); matches seeded "El Mansouri"/"El Fassi"
  await page.getByRole('listbox').waitFor({ timeout: 8000 });
  await settle(800);
});

// 2b) Location picker — country selector + live city autocomplete (Morocco, on-brand)
await shot(page, '06-location', async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.locator('h1').first().waitFor({ timeout: 15000 });
  await awaitImages();
  // Pick Morocco explicitly so the city autocomplete is scoped to MA.
  await page.getByRole('button', { name: /select country/i }).click();
  await page.getByPlaceholder(/search country/i).fill('morocco');
  await page.getByRole('option', { name: /morocco/i }).first().click();
  await settle(400);
  const cityInput = page.locator('form input[type="text"]').nth(1);
  await cityInput.click();
  await cityInput.fill('cas');
  await page.getByRole('listbox').waitFor({ timeout: 8000 });
  await settle(800);
});

// 3) Doctors directory
await shot(page, '03-doctors', async () => {
  await page.goto(`${BASE}/doctors`, { waitUntil: 'domcontentloaded' });
  await settle();
});

// 4) Clinics directory
await shot(page, '04-clinics', async () => {
  await page.goto(`${BASE}/clinics`, { waitUntil: 'domcontentloaded' });
  await settle();
});

// 5) AI assistant — open the "Ask AI" chat widget
await shot(page, '05-chat', async () => {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await settle(1200);
  await page.getByRole('button', { name: /ask ai/i }).click({ timeout: 8000 });
  await settle(1800);
});

console.log('\nScreenshots ->', OUT);
console.log(shots.join('\n'));
await browser.close();
