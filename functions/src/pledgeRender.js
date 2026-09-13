import { fileURLToPath } from 'node:url';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const FORM_HTML = path.join(path.dirname(fileURLToPath(import.meta.url)), 'pledgeForm.html');

let browserPromise;

async function launchBrowser() {
  return puppeteer.launch({
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath(),
    headless: chromium.headless,
  });
}

async function resetBrowser() {
  const existing = browserPromise;
  browserPromise = undefined;
  if (!existing) return;
  try {
    const browser = await existing;
    await browser.close().catch(() => {});
  } catch {
    // The browser was already gone.
  }
}

async function getBrowser() {
  if (browserPromise) {
    const browser = await browserPromise.catch(() => undefined);
    if (browser && browser.connected) return browser;
    await resetBrowser();
  }
  browserPromise = launchBrowser().catch((error) => {
    browserPromise = undefined;
    throw error;
  });
  return browserPromise;
}

async function newPageWithRecovery() {
  const browser = await getBrowser();
  try {
    return await browser.newPage();
  } catch {
    // The browser may have crashed; relaunch once and try again.
    await resetBrowser();
    const relaunched = await getBrowser();
    return relaunched.newPage();
  }
}

export async function closeBrowser() {
  await resetBrowser();
}

const FILL_SCRIPT = (fields) => `
  const fields = ${JSON.stringify(fields)};
  const form = document.querySelector('#pledge-form');
  if (!form) throw new Error('Pledge form not found in page');
  const apply = (name, value) => {
    const input = form.querySelector('[name="' + name + '"]');
    if (!input) return;
    if (input.type === 'checkbox') {
      input.checked = value === 'on';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (input.type === 'radio') {
      const radio = form.querySelector('[name="' + name + '"][value="' + value + '"]');
      if (radio) {
        radio.checked = true;
        radio.dispatchEvent(new Event('change', { bubbles: true }));
      }
    } else {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  for (const [name, value] of Object.entries(fields)) apply(name, value);
`;

export async function buildPledgePdf(pledge) {
  const page = await newPageWithRecovery();
  try {
    const query = pledge.startDate ? `?startDate=${encodeURIComponent(pledge.startDate)}` : '';
    await page.goto(`file://${FORM_HTML}${query}`, { waitUntil: 'load', timeout: 30000 });
    await page.evaluate(FILL_SCRIPT(pledge));
    await new Promise((resolve) => setTimeout(resolve, 250));
    return Buffer.from(await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '14mm', right: '14mm', bottom: '14mm', left: '14mm' },
    }));
  } finally {
    await page.close().catch(() => {});
  }
}
