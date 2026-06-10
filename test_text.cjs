const puppeteer = require('puppeteer');
const SITE_URL = 'http://localhost:5174';

async function run() {
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    
    await page.goto(`${SITE_URL}/login`);
    await page.waitForSelector('input[type="email"]', { timeout: 5000 }).catch(()=>{});
    if (await page.$('input[type="email"]')) {
        await page.type('input[type="email"]', 'test@example.com');
        await page.type('input[type="password"]', 'password');
        await page.click('button[type="submit"]');
        await new Promise(r => setTimeout(r, 2000));
    }
    
    await page.goto(`${SITE_URL}/ai-care/observations`);
    await new Promise(r => setTimeout(r, 5000));
    const text = await page.evaluate(() => document.body.innerText);
    console.log(text);
    await browser.close();
}
run();
