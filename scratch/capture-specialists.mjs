import puppeteer from '../node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer.js';

(async () => {
  const browser = await puppeteer.launch({
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 2 });

  await page.goto('http://127.0.0.1:5173/liberty-md', { waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const el = document.querySelector('[data-specialists-section]');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    else window.scrollBy(0, 1800);
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({
    path: '/Users/sakshamagrawal/.gemini/antigravity/brain/a6cea934-e3c5-49c6-9502-679c50108cee/specialists-desktop.png',
    fullPage: false,
  });

  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  await page.reload({ waitUntil: 'networkidle2' });
  await page.evaluate(() => {
    const el = document.querySelector('[data-specialists-section]');
    if (el) el.scrollIntoView({ behavior: 'instant', block: 'center' });
    else window.scrollBy(0, 2000);
  });
  await new Promise(r => setTimeout(r, 1000));

  await page.screenshot({
    path: '/Users/sakshamagrawal/.gemini/antigravity/brain/a6cea934-e3c5-49c6-9502-679c50108cee/specialists-mobile.png',
    fullPage: false,
  });

  await browser.close();
  console.log('Captured specialists-desktop.png and specialists-mobile.png successfully');
})();
