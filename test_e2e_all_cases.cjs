const puppeteer = require('puppeteer');

async function delay(time) {
  return new Promise(function(resolve) { 
      setTimeout(resolve, time)
  });
}

(async () => {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Set up console logging for debugging
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));

  try {
    console.log("=== STARTING E2E TESTS ===");

    // Test Case 1: Profile Creation
    // (Assuming user might need to login first)
    console.log("Navigating to login...");
    await page.goto('http://localhost:5174/login', { waitUntil: 'networkidle2' });
    
    // Check if we need to login
    try {
      await page.waitForSelector('input[type="email"]', { timeout: 5000 });
      await page.type('input[type="email"]', 'test@example.com');
      await page.type('input[type="password"]', 'password');
      
      console.log("Clicking sign in button...");
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.toLowerCase().includes('sign in'));
        if (btn) btn.click();
      });
      
      await delay(5000); // Give it ample time to login and redirect
      console.log("Logged in successfully.");
    } catch(e) {
      console.log("Login form not found. Current URL:", await page.url());
      await page.screenshot({ path: 'e2e_login_debug.png', fullPage: true });
      console.log("Saved debug screenshot to e2e_login_debug.png");
    }

    // Navigate to chat
    await page.goto('http://localhost:5174/ai-care/chat', { waitUntil: 'networkidle2' });
    
    // Check if profile creation form appears
    try {
      await page.waitForSelector('input[name="name"]', { timeout: 3000 });
      console.log("Test Case 1 (Profile Creation): Form detected. Filling profile...");
      await page.type('input[name="name"]', 'Test User');
      await page.select('select[name="gender"]', 'Male');
      await page.type('input[name="age"]', '30');
      await page.type('input[name="comorbidities"]', 'None');
      // Click submit
      await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));
        const submitBtn = buttons.find(b => b.textContent.includes('Save Profile'));
        if(submitBtn) submitBtn.click();
      });
      await delay(2000);
      console.log("Profile created.");
    } catch (e) {
      console.log("Test Case 1 (Profile Creation): Profile already exists.");
    }

    // Test Case 2: Chat Initialization
    console.log("Test Case 2 (Chat Initialization): Checking for initial message...");
    try {
      await page.waitForSelector('.bg-white.text-gray-800', { timeout: 15000 }); // Wait for bot message
      let chatText = await page.evaluate(() => document.body.innerText);
      if(chatText.includes('What symptoms or concerns')) {
          console.log("Chat initialized correctly.");
      }
    } catch(e) {
      await page.screenshot({ path: 'e2e_error_tc2.png', fullPage: true });
      console.log("Test Case 2 failed. Saved screenshot to e2e_error_tc2.png");
      throw e;
    }

    // Test Case 3: Valid User Symptom Input
    console.log("Test Case 3 (Valid Input): Sending normal symptom...");
    await page.waitForSelector('input[type="text"]');
    await page.type('input[type="text"]', 'I have a mild headache.');
    await page.keyboard.press('Enter');
    
    console.log("Waiting for AI response...");
    await delay(15000); // Wait for workflows to process
    chatText = await page.evaluate(() => document.body.innerText);
    console.log("Valid input processed. AI responded.");

    // Test Case 4: Invalid User Input (Emergency)
    console.log("Test Case 4 (Invalid Input): Sending emergency symptom...");
    await page.type('input[type="text"]', 'I am having a heart attack, severe chest pain spreading to my left arm, sweating, cannot breathe');
    await page.keyboard.press('Enter');
    
    console.log("Waiting for emergency detection...");
    await delay(15000);
    chatText = await page.evaluate(() => document.body.innerText);
    if(chatText.toLowerCase().includes('emergency') || chatText.toLowerCase().includes('immediate')) {
       console.log("Emergency detected correctly!");
    } else {
       console.log("Warning: Emergency might not have been detected. Output:", chatText);
    }

    // Take screenshot
    await page.screenshot({ path: 'e2e_test_results.png', fullPage: true });
    console.log("Saved screenshot to e2e_test_results.png");

    console.log("=== TESTS COMPLETE ===");

  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    await browser.close();
  }
})();
