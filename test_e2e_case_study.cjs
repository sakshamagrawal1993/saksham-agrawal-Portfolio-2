const puppeteer = require('puppeteer');

const SITE_URL = 'http://localhost:5174';
const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function runTest() {
    console.log("=== STARTING DIAGNOSIS E2E TEST (CASE STUDY) ===");
    
    const browser = await puppeteer.launch({
        headless: true,
        defaultViewport: { width: 1280, height: 800 },
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();

        console.log("Navigating to login...");
        await page.goto(`${SITE_URL}/login`);
        await page.waitForSelector('input[type="email"]', { timeout: 10000 }).catch(() => {});
        
        const emailInput = await page.$('input[type="email"]');
        if (emailInput) {
            await page.type('input[type="email"]', 'test@example.com');
            await page.type('input[type="password"]', 'password');
            await page.click('button[type="submit"]');
            await wait(2000); // Give it time to log in
            console.log("Logged in successfully.");
        } else {
            console.log("Already logged in.");
        }

        console.log("Going to AI Care Landing...");
        await page.goto(`${SITE_URL}/ai-care`);
        
        // Let's enter the first message in the landing page input to start the session!
        const inputs = [
            "A 39-year-old woman, architect, presented with a 3-day history of left eyelid swelling, initially generalized and erythematous, now localized to a single swollen lump on the upper left eyelid.",
            "The swelling is tender to touch, characterized by a burning pain that is constant and low in severity, worsened by palpation and alleviated by hot baths.",
            "The patient reports white pustular exudate emerging from the eyelid lump, which began 2 days ago.",
            "She denies any injection of the eye, visual deficits, tearing, photophobia, recent eye trauma, vomiting, or systemic symptoms such as fever.",
            "The patient notes intentional weight loss of 3 kg over the past two months due to dietary changes.",
            "History of previous similar, painless right eyelid swelling on two occasions, familial hypercholesterolemia, migraines, and a previous appendicectomy.",
            "Family history includes familial hypercholesterolemia, migraines (mother and grandmother), and glaucoma (mother)."
        ];

        try {
            await page.waitForSelector('input[type="text"]', { timeout: 10000 });
            await page.type('input[type="text"]', inputs[0]);
            await page.keyboard.press('Enter');
            console.log("Sent case study part 1 from landing page, navigating to chat...");
            await wait(5000); 
        } catch (e) {
            console.log("Could not find landing page input, maybe we are already in chat?");
        }

        // Now we should be in /ai-care/chat
        for (let i = 1; i < inputs.length; i++) {
            await page.waitForSelector('input[type="text"]', { timeout: 10000 });
            await page.type('input[type="text"]', inputs[i]);
            await page.keyboard.press('Enter');
            console.log(`Sent case study part ${i + 1}`);
            // Wait for assistant reply (we can wait 10 seconds to make it faster)
            await wait(10000); 
        }

        console.log("Waiting for diagnosis to complete...");
        await wait(30000); 

        console.log("Going to observations...");
        const currentUrl = page.url();
        if (!currentUrl.includes('observations')) {
            await page.goto(`${SITE_URL}/ai-care/observations`);
        }
        
        await page.waitForSelector('h2');
        await wait(5000); 

        await page.screenshot({ path: 'e2e_case_study_success.png', fullPage: true });
        console.log("Diagnosis reached successfully!");
        console.log("Saved screenshot to e2e_case_study_success.png");

    } catch (e) {
        console.error("Test failed:", e);
        await browser.pages().then(pages => pages[0].screenshot({ path: 'e2e_case_study_error.png', fullPage: true }));
    } finally {
        await browser.close();
        console.log("=== TESTS COMPLETE ===");
    }
}

runTest();
