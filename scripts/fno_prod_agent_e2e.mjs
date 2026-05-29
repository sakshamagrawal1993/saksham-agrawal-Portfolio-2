import { chromium } from 'playwright';

const url = 'https://saksham-experiments.com/fno-copilot?fno_debug=1';

const prompts = [
  "I am a newbie options trader. Help me build a momentum strategy that makes good gains in up moves and also benefits in down moves.",
  "Use only liquid instruments and include strict risk controls. Keep it beginner friendly.",
  "Choose the best underlying for this strategy and explain why. Decide expiry selection logic too.",
  "Convert this into clear indicators, entry conditions, exit conditions, and legs with risk adjustment.",
  "Please finalize all missing fields so this strategy is ready for validation and backtesting."
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const textOrEmpty = async (locator) => {
  try {
    const count = await locator.count();
    if (!count) return '';
    return (await locator.first().innerText()).trim();
  } catch {
    return '';
  }
};

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1560, height: 980 } });
  const transcript = [];

  try {
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.error('PAGE_ERROR:', msg.text());
      }
    });

    await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });

    const agentButton = page.getByRole('button', { name: /Agent/i }).first();
    await agentButton.click();
    await page.waitForSelector('.agent-shell', { timeout: 20000 });

    await page.getByRole('button', { name: /Create Algo/i }).first().click();
    await page.waitForTimeout(500);

    for (const prompt of prompts) {
      const assistantBefore = await page.locator('.agent-thread-message.assistant').count();
      await page.locator('.agent-prompt-card input').fill(prompt);
      await page.locator('.agent-prompt-card button').last().click();
      await page.waitForFunction(
        (previous) => document.querySelectorAll('.agent-thread-message.assistant').length > previous,
        assistantBefore,
        { timeout: 90000 },
      );
      await sleep(800);

      const assistantText = await textOrEmpty(page.locator('.agent-thread-message.assistant p').last());
      const status = await textOrEmpty(page.locator('.agent-artifact-header .status-pill'));
      transcript.push({ user: prompt, assistant: assistantText, status });

      const normalized = status.toLowerCase();
      if (normalized.includes('ready')) break;
    }

    // Artifact edit pass in agent mode (no mode switch)
    const setupTab = page.getByRole('button', { name: '1. Setup' });
    if (await setupTab.count()) {
      await setupTab.click();
      await page.locator('.agent-algo-editor label:has-text("Run Name") input').fill('Beginner Momentum Dual Direction Algo');
      await page.locator('.agent-algo-editor label:has-text("Symbol") input').fill('RELIANCE');
      await page.locator('.agent-algo-editor label:has-text("Instrument Segment") input').fill('Future & Options');
      await page.locator('.agent-algo-editor label:has-text("Trade Type") input').fill('Intraday');
      await page.locator('.agent-algo-editor label:has-text("Total Margin Limit") input').fill('150000');
    }

    const signalsTab = page.getByRole('button', { name: '2. Signals' });
    if (await signalsTab.count()) {
      await signalsTab.click();
      await page.locator('.agent-algo-editor label:has-text("Indicators") textarea').fill('EMA 20\nEMA 50\nRSI 14\nADX 14');
      await page.locator('.agent-algo-editor label:has-text("Entry Rules") textarea').fill('Bull: EMA20 crosses above EMA50 and RSI > 55 and ADX > 20\nBear: EMA20 crosses below EMA50 and RSI < 45 and ADX > 20');
      await page.locator('.agent-algo-editor label:has-text("Exit Rules") textarea').fill('Exit on opposite crossover\nExit on SL/TP hit\nTime stop at 15:15');
    }

    const legsTab = page.getByRole('button', { name: '3. Legs and Risk' });
    if (await legsTab.count()) {
      await legsTab.click();
      await page.locator('.agent-algo-editor label:has-text("Legs") textarea').fill('Bull setup: Buy ATM CE current week\nBear setup: Buy ATM PE current week');
      await page.locator('.agent-algo-editor label:has-text("Max Loss per Trade") input').fill('3000');
      await page.locator('.agent-algo-editor label:has-text("Daily Stop Loss") input').fill('9000');
      await page.locator('.agent-algo-editor label:has-text("Daily Take Profit") input').fill('18000');
      const liquidityCheckbox = page.locator('.agent-algo-check input[type="checkbox"]');
      if (!(await liquidityCheckbox.isChecked())) {
        await liquidityCheckbox.check();
      }
    }

    // Final prompt to force a backtest-ready completion
    const finalPrompt = 'Use the artifact values now and mark this strategy ready for validation/backtest. Fill any remaining missing inputs.';
    const assistantBefore = await page.locator('.agent-thread-message.assistant').count();
    await page.locator('.agent-prompt-card input').fill(finalPrompt);
    await page.locator('.agent-prompt-card button').last().click();
    await page.waitForFunction(
      (previous) => document.querySelectorAll('.agent-thread-message.assistant').length > previous,
      assistantBefore,
      { timeout: 90000 },
    );
    await sleep(1200);

    transcript.push({
      user: finalPrompt,
      assistant: await textOrEmpty(page.locator('.agent-thread-message.assistant p').last()),
      status: await textOrEmpty(page.locator('.agent-artifact-header .status-pill')),
    });

    const debugStatus = await textOrEmpty(page.locator('.fno-debug-panel p:has-text("artifact_status") strong'));
    const debugBackend = await textOrEmpty(page.locator('.fno-debug-panel p:has-text("backend") strong'));
    const debugMode = await textOrEmpty(page.locator('.fno-debug-panel p:has-text("active_mode") strong'));
    const sessionText = await textOrEmpty(page.locator('.fno-debug-row.active span').nth(1));

    const result = {
      ran_at: new Date().toISOString(),
      url,
      debug: {
        active_mode: debugMode,
        backend: debugBackend,
        artifact_status: debugStatus,
        active_session: sessionText,
      },
      transcript,
    };

    console.log(JSON.stringify(result, null, 2));
  } finally {
    await page.screenshot({ path: 'tmp/fno_prod_agent_e2e_last.png', fullPage: true }).catch(() => {});
    await browser.close();
  }
}

run().catch((error) => {
  console.error('E2E run failed:', error);
  process.exit(1);
});
