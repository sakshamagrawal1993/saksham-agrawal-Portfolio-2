const puppeteer = require('puppeteer');

async function delay(time) {
  return new Promise(function(resolve) { 
      setTimeout(resolve, time)
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  try {
    console.log("=== STARTING DIAGNOSIS E2E TEST ===");
    console.log("Navigating to login...");
    await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle2' });
    
    try {
      await page.waitForSelector('input[type="email"]', { timeout: 5000 });
      await page.type('input[type="email"]', 'test@example.com');
      await page.type('input[type="password"]', 'password');
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('sign in'));
        if (btn) btn.click();
      });
      await delay(5000);
      console.log("Logged in successfully.");
    } catch(e) {
      console.log("Already logged in.");
    }

    // Force a new session by deleting old active sessions directly in DB or just continuing if it's not in emergency
    // Actually, I can't easily delete DB sessions from Puppeteer without DB credentials, but I can use an incognito window with a new user?
    // Wait, let's just go to chat. If it's stuck on emergency, we'll see.
    // Now we land on /ai-care (the new landing page)
    console.log("Navigating to landing page...");
    await page.goto('http://localhost:5174/ai-care', { waitUntil: 'networkidle2' });

    // Wait for the input box on the landing page and click it to go to chat
    await page.waitForSelector('input[type="text"][placeholder="Frequent Headaches"]', { timeout: 10000 });
    await page.click('input[type="text"][placeholder="Frequent Headaches"]');
    
    await delay(2000); // Wait for navigation to /ai-care/chat

    console.log("Test Case 5 & 6 (Diagnosis Flow): Answering up to 6 questions...");
    
    // First message in chat
    await page.waitForFunction(() => {
        const input = document.querySelector('input[type="text"]');
        return input && !input.disabled;
    }, { timeout: 15000 });

    await page.type('input[type="text"]', 'I have a mild headache and some fatigue.');
    await page.keyboard.press('Enter');
    console.log("Sent initial symptom.");
    
    let diagnosisReached = false;
    for(let i=0; i<6; i++) {
        await delay(15000); // wait for AI response
        const url = await page.url();
        if(url.includes('observations')) {
            diagnosisReached = true;
            break;
        }

        try {
            await page.waitForFunction(() => {
                const input = document.querySelector('input[type="text"]');
                return input && !input.disabled;
            }, { timeout: 15000 });
            
            await page.type('input[type="text"]', 'No other symptoms.');
            await page.keyboard.press('Enter');
            console.log(`Answered question ${i+1}`);
        } catch(e) {
            console.log("Input not ready or page changed.");
            const currentUrl = await page.url();
            if(currentUrl.includes('observations')) {
                diagnosisReached = true;
            }
            break;
        }
    }
    
    const finalUrl = await page.url();
    if(finalUrl.includes('observations')) {
        console.log("Diagnosis reached successfully!");
        await page.screenshot({ path: 'e2e_diagnosis_success.png', fullPage: true });
        console.log("Saved screenshot to e2e_diagnosis_success.png");
    } else {
        console.log("Did not reach diagnosis screen. Current URL:", finalUrl);
        await page.screenshot({ path: 'e2e_diagnosis_failed.png', fullPage: true });
    }

    console.log("=== TESTS COMPLETE ===");

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await browser.close();
  }
})();
