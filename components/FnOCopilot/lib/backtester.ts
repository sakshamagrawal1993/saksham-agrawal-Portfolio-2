import { CandidateTrade } from '../types';

export interface BacktestResult {
  totalTrades: number;
  winRate: number;
  maxDrawdownPct: number;
  profitFactor: number;
  expectancy: number;
  avgHoldingMinutes: number;
  equityCurve: { date: string; value: number }[];
}

export interface AlgoStrategyConfig {
  runName: string;
  instrument: string;
  indicators: string[];
  entryConditions: string[];
  exitConditions: string[];
  expiry: string;
}

/**
 * Core Backtesting Engine scaffolding.
 * In a real environment, this takes historical 1-minute or 5-minute ticks
 * and applies the AlgoStrategyConfig rules sequentially to simulate PnL.
 */
export class Backtester {
  
  constructor() {
    // Inject historical data provider here
  }

  /**
   * Run a backtest for a specific static trade over a period to see how it would have performed if entered in the past.
   */
  async runTradeBacktest(trade: CandidateTrade, startDate: string, endDate: string): Promise<BacktestResult> {
    console.log(`Running trade backtest for ${trade.title} from ${startDate} to ${endDate}`);
    // Simulate some logic
    return this.generateMockResult();
  }

  /**
   * Run a backtest for an Algo Strategy (dynamic entries/exits based on rules)
   */
  async runAlgoBacktest(strategy: AlgoStrategyConfig, startDate: string, endDate: string): Promise<BacktestResult> {
    console.log(`Running algo backtest for ${strategy.runName} from ${startDate} to ${endDate}`);
    // Simulate iterating over time series data
    return this.generateMockResult();
  }

  private generateMockResult(): BacktestResult {
    return {
      totalTrades: Math.floor(Math.random() * 50) + 10,
      winRate: 50 + Math.random() * 20, // 50 to 70%
      maxDrawdownPct: Math.random() * 15,
      profitFactor: 1.1 + Math.random(),
      expectancy: Math.random() * 1000,
      avgHoldingMinutes: Math.floor(Math.random() * 300),
      equityCurve: [
        { date: "2026-05-01", value: 100000 },
        { date: "2026-05-08", value: 101850 },
        { date: "2026-05-15", value: 100920 },
        { date: "2026-05-22", value: 105420 },
      ],
    };
  }
}

export const backtestEngine = new Backtester();
