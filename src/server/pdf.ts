import { chromium, type Browser } from 'playwright-core';

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (browser?.isConnected()) return browser;
  // Use whichever Chromium-based browser the machine has (Edge ships with
  // Windows; Chrome is the common case on macOS).
  let lastErr: unknown;
  for (const channel of ['msedge', 'chrome', 'chromium'] as const) {
    try {
      browser = await chromium.launch({ channel, headless: true });
      return browser;
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    'PDF export needs Microsoft Edge or Google Chrome installed. ' + String(lastErr),
  );
}

export async function htmlToPdf(html: string): Promise<Buffer> {
  const b = await getBrowser();
  const page = await b.newPage();
  try {
    await page.setContent(html, { waitUntil: 'load' });
    return await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '12mm', bottom: '14mm', left: '10mm', right: '10mm' },
    });
  } finally {
    await page.close();
  }
}
