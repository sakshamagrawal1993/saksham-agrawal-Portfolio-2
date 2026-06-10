const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle2' });
  await page.type('input[type="email"]', 'test@example.com');
  await page.type('input[type="password"]', 'password');
  await page.keyboard.press('Enter');
  await page.waitForNavigation({ waitUntil: 'networkidle2' });
  await page.goto('http://localhost:5174/ai-care/observations', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 2000));
  await page.screenshot({ path: 'e2e_final_observations_2.png' });
  await browser.close();
})();
