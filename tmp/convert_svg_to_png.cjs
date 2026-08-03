const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

async function convert() {
  const svgPath = path.join(__dirname, '../public/images/libertymd-logo-mark.svg');
  const pngPath = path.join(__dirname, '../public/images/libertymd-logo-mark.png');
  const svgContent = fs.readFileSync(svgPath, 'utf8');

  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 800, height: 800, deviceScaleFactor: 2 });
  await page.setContent(`<!DOCTYPE html><html><body style="margin:0;padding:20px;background:transparent;">${svgContent}</body></html>`);
  const svgElement = await page.$('svg');
  if (svgElement) {
    await svgElement.screenshot({ path: pngPath, omitBackground: true });
    console.log('Successfully generated high-resolution libertymd-logo-mark.png from libertymd-logo-mark.svg');
  } else {
    console.error('SVG element not found');
  }
  await browser.close();
}

convert().catch(console.error);
