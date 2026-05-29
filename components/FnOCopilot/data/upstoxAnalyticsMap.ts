export type UpstoxFeedStatus = 'covered' | 'partial' | 'planned';

export type UpstoxFeedCategory =
  | 'Market Quote'
  | 'Historical Data'
  | 'Realtime Feed'
  | 'Option Chain'
  | 'Market Information'
  | 'Risk and Cost'
  | 'Discovery';

export type UpstoxDashboardArea =
  | 'Dashboard'
  | 'Contract Overview'
  | 'Option Chain'
  | 'Combined OI'
  | 'Technicals'
  | 'Build Up'
  | 'Find Trades'
  | 'Analyse Trade'
  | 'Create Algo'
  | 'Option Screener'
  | 'New Screen';

export type UpstoxAnalyticsFeed = {
  id: string;
  name: string;
  category: UpstoxFeedCategory;
  status: UpstoxFeedStatus;
  cadence: string;
  sourceUrl: string;
  primaryFields: string[];
  derivedMetrics: string[];
  mappedScreens: UpstoxDashboardArea[];
  dashboardUse: string;
  implementationNote: string;
};

export type UpstoxScreenSuggestion = {
  title: string;
  parent: UpstoxDashboardArea;
  priority: 'MVP' | 'Next' | 'Later';
  feeds: string[];
  purpose: string;
};

export const upstoxAnalyticsFeeds: UpstoxAnalyticsFeed[] = [
  {
    id: 'full_market_quotes',
    name: 'Full market quotes',
    category: 'Market Quote',
    status: 'partial',
    cadence: 'Poll 5-15s for selected instruments',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-full-market-quote/',
    primaryFields: ['ltp', 'ohlc', 'volume', 'oi', 'bid/ask depth', 'last traded quantity', 'timestamp'],
    derivedMetrics: ['spread percentage', 'liquidity score', 'slippage estimate', 'quote age'],
    mappedScreens: ['Dashboard', 'Contract Overview', 'Option Chain', 'Find Trades', 'Option Screener'],
    dashboardUse: 'Use as the primary dynamic quote layer for contract cards, active option tables, liquidity filters, and trade quality checks.',
    implementationNote: 'Option-chain rows already accept bid, ask, volume, OI, buy quantity, and sell quantity; expand proxy polling to hydrate the broader quote fields for all active contracts.'
  },
  {
    id: 'ohlc_quotes_v3',
    name: 'OHLC quotes V3',
    category: 'Market Quote',
    status: 'planned',
    cadence: 'Poll 30-60s for selected underlyings',
    sourceUrl: 'https://upstox.com/developer/api-documentation/v3/get-market-quote-ohlc/',
    primaryFields: ['open', 'high', 'low', 'close', 'instrument key'],
    derivedMetrics: ['day range position', 'gap from previous close', 'range expansion'],
    mappedScreens: ['Dashboard', 'Contract Overview', 'Technicals', 'Build Up', 'Create Algo'],
    dashboardUse: 'Power simple day-range visuals, candle context, and condition-builder fields without requiring a full chart feed.',
    implementationNote: 'Add as a low-cost fallback when historical candles or websocket candles are unavailable.'
  },
  {
    id: 'ltp_quotes_v3',
    name: 'LTP quotes V3',
    category: 'Market Quote',
    status: 'partial',
    cadence: 'Poll 2-5s for selected watchlist',
    sourceUrl: 'https://upstox.com/developer/api-documentation/v3/get-market-quote-ltp/',
    primaryFields: ['last price', 'instrument key'],
    derivedMetrics: ['spot drift', 'premium drift', 'trigger proximity'],
    mappedScreens: ['Dashboard', 'Contract Overview', 'Find Trades', 'Analyse Trade', 'Create Algo'],
    dashboardUse: 'Keep prices, payoff current marker, and strategy triggers fresh for the chosen instrument.',
    implementationNote: 'The current live adapter updates spot and option LTP through option chain; use LTP for wider dashboards and watchlists.'
  },
  {
    id: 'historical_candles_v3',
    name: 'Historical candle data V3',
    category: 'Historical Data',
    status: 'planned',
    cadence: 'On demand + cached by instrument/timeframe',
    sourceUrl: 'https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/',
    primaryFields: ['timestamp', 'open', 'high', 'low', 'close', 'volume', 'open interest'],
    derivedMetrics: ['ADX', 'RSI', 'VWAP', 'moving averages', 'historical volatility', 'trend score'],
    mappedScreens: ['Technicals', 'Create Algo', 'Option Screener', 'Find Trades'],
    dashboardUse: 'Replace static technical cards with calculated indicators and make AI strategy conditions backtestable.',
    implementationNote: 'Persist normalized candles in Supabase by instrument, interval, and trading date so backtests and screeners do not repeatedly hit Upstox.'
  },
  {
    id: 'market_data_feed_v3',
    name: 'Market Data Feed V3',
    category: 'Realtime Feed',
    status: 'planned',
    cadence: 'Websocket stream',
    sourceUrl: 'https://upstox.com/developer/api-documentation/v3/get-market-data-feed',
    primaryFields: ['market status', 'ltp', 'ohlc', 'volume', 'oi', 'depth', 'feed timestamp'],
    derivedMetrics: ['live quote freshness', 'intraday buildup', 'spread shock', 'volume burst'],
    mappedScreens: ['Dashboard', 'Contract Overview', 'Option Chain', 'Build Up', 'Analyse Trade', 'Create Algo'],
    dashboardUse: 'Move the MVP from polling to live market-aware dashboards once the data service is stable.',
    implementationNote: 'Run websocket ingestion on VPS or Supabase Edge-compatible worker, not directly in the browser; publish compact snapshots to the frontend.'
  },
  {
    id: 'market_data_feed_authorize_v3',
    name: 'Market Data Feed Authorize V3',
    category: 'Realtime Feed',
    status: 'planned',
    cadence: 'Before websocket session',
    sourceUrl: 'https://upstox.com/developer/api-documentation/v3/get-market-data-feed-authorize/',
    primaryFields: ['authorized websocket URL', 'redirect metadata'],
    derivedMetrics: ['feed availability', 'session state'],
    mappedScreens: ['Dashboard'],
    dashboardUse: 'Support the backend live-stream connection status shown in data health panels.',
    implementationNote: 'Keep authorization server-side because the Analytics Token must never be exposed to the frontend.'
  },
  {
    id: 'option_contracts',
    name: 'Get option contracts',
    category: 'Option Chain',
    status: 'covered',
    cadence: 'On symbol change or daily expiry refresh',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-option-contracts/',
    primaryFields: ['instrument key', 'trading symbol', 'expiry', 'strike price', 'option type', 'lot size', 'tick size', 'freeze quantity', 'weekly flag'],
    derivedMetrics: ['expiry ladder', 'contract universe', 'allowed strike offsets'],
    mappedScreens: ['Dashboard', 'Option Chain', 'Find Trades', 'Create Algo', 'Option Screener'],
    dashboardUse: 'Populate contract selection, expiry selectors, option screener universe, and algo leg dropdowns.',
    implementationNote: 'The proxy already uses this to resolve nearest expiry for NIFTY/BANKNIFTY; generalize symbol-to-instrument-key support.'
  },
  {
    id: 'put_call_option_chain',
    name: 'Get Put/Call option chain',
    category: 'Option Chain',
    status: 'covered',
    cadence: 'Poll 15-30s for active contract',
    sourceUrl: 'https://upstox.com/developer/api-documentation/option-chain/',
    primaryFields: ['strike price', 'underlying spot', 'call market data', 'put market data', 'option greeks', 'premium values'],
    derivedMetrics: ['PCR', 'call wall', 'put wall', 'expected move', 'ATM IV', 'top 5 trades'],
    mappedScreens: ['Contract Overview', 'Option Chain', 'Combined OI', 'Find Trades', 'Analyse Trade'],
    dashboardUse: 'This is the core dynamic source for the selected contract detail page and trade recommendation engine.',
    implementationNote: 'Current live adapter flattens call/put legs into OptionQuote rows and computes chain analytics.'
  },
  {
    id: 'option_greeks',
    name: 'Option Greeks',
    category: 'Option Chain',
    status: 'covered',
    cadence: 'Poll with active option keys',
    sourceUrl: 'https://upstox.com/developer/api-documentation/option-greek/',
    primaryFields: ['last price', 'volume', 'previous close', 'IV', 'vega', 'gamma', 'theta', 'delta', 'OI'],
    derivedMetrics: ['portfolio Greeks', 'risk exposure', 'delta hedge', 'theta decay', 'vol sensitivity'],
    mappedScreens: ['Option Chain', 'Find Trades', 'Analyse Trade', 'Create Algo', 'Option Screener'],
    dashboardUse: 'Make every suggested trade explainable through delta, theta, vega, and gamma exposure.',
    implementationNote: 'Option-chain response already carries greeks; use dedicated Greek endpoint for batch refresh and non-chain instruments.'
  },
  {
    id: 'market_status',
    name: 'Market Status - Exchange status',
    category: 'Market Information',
    status: 'covered',
    cadence: 'Poll 30-60s',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-market-status/',
    primaryFields: ['exchange', 'status', 'last updated'],
    derivedMetrics: ['trading session state', 'freshness warning', 'market closed lock'],
    mappedScreens: ['Dashboard', 'Contract Overview', 'Create Algo'],
    dashboardUse: 'Show whether live analytics should be trusted and whether paper-trade triggers are session-valid.',
    implementationNote: 'Current edge bundle returns NSE market status and the top nav already shows it.'
  },
  {
    id: 'brokerage_details',
    name: 'Brokerage details',
    category: 'Risk and Cost',
    status: 'planned',
    cadence: 'On trade analysis',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-brokerage/',
    primaryFields: ['brokerage', 'taxes', 'charges', 'net payable/receivable'],
    derivedMetrics: ['net breakeven', 'cost adjusted payoff', 'minimum viable target'],
    mappedScreens: ['Analyse Trade', 'Find Trades'],
    dashboardUse: 'Stop showing theoretical payoff alone; include cost-adjusted payoff and realistic breakevens.',
    implementationNote: 'Analytics Token is read-only but can calculate charges; execution still needs a separate user trading flow.'
  },
  {
    id: 'margin_details',
    name: 'Margin details',
    category: 'Risk and Cost',
    status: 'planned',
    cadence: 'On trade leg changes',
    sourceUrl: 'https://upstox.com/developer/api-documentation/margin/',
    primaryFields: ['required margin', 'span', 'exposure', 'premium receivable/payable'],
    derivedMetrics: ['return on margin', 'capital at risk', 'position affordability'],
    mappedScreens: ['Find Trades', 'Analyse Trade', 'Create Algo'],
    dashboardUse: 'Rank suggested multi-leg trades by margin efficiency, not only payoff shape.',
    implementationNote: 'Use for education and paper trading simulation; live funds/positions are not available with Analytics Token.'
  },
  {
    id: 'instrument_search',
    name: 'Instrument search',
    category: 'Discovery',
    status: 'planned',
    cadence: 'On search and screener filters',
    sourceUrl: 'https://upstox.com/developer/api-documentation/search-instruments/',
    primaryFields: ['instrument key', 'exchange', 'segment', 'instrument type', 'expiry', 'strike', 'trading symbol'],
    derivedMetrics: ['search result quality', 'universe coverage', 'contract match confidence'],
    mappedScreens: ['Dashboard', 'Option Screener', 'Create Algo'],
    dashboardUse: 'Replace static Excel symbols with dynamic discoverability for F&O stocks, indices, and option contracts.',
    implementationNote: 'Keep Excel as fallback; prefer Upstox instrument keys once API credentials are enabled.'
  },
  {
    id: 'fii_data',
    name: 'FII activity data',
    category: 'Market Information',
    status: 'planned',
    cadence: 'Daily or monthly',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-fii/',
    primaryFields: ['buy amount', 'sell amount', 'buy contracts', 'sell contracts', 'open interest', 'long/short positions'],
    derivedMetrics: ['net FII flow', 'index option long-short bias', 'cash-vs-derivative divergence'],
    mappedScreens: ['Dashboard', 'Contract Overview', 'Find Trades'],
    dashboardUse: 'Upgrade the FII/DII activity card into a directional context panel for index and broad-market trades.',
    implementationNote: 'Use daily data as context only; do not let it override contract-level liquidity and risk checks.'
  },
  {
    id: 'dii_data',
    name: 'DII activity data',
    category: 'Market Information',
    status: 'planned',
    cadence: 'Daily or monthly',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-dii/',
    primaryFields: ['buy amount', 'sell amount', 'buy contracts', 'sell contracts'],
    derivedMetrics: ['net DII flow', 'institutional offset against FII flow'],
    mappedScreens: ['Dashboard', 'Contract Overview'],
    dashboardUse: 'Show whether domestic flows are absorbing or reinforcing FII movement.',
    implementationNote: 'Currently available for NSE cash context; map as market backdrop rather than option-specific signal.'
  },
  {
    id: 'oi_data',
    name: 'Open Interest data',
    category: 'Market Information',
    status: 'partial',
    cadence: 'Daily + intraday refresh where available',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-oi/',
    primaryFields: ['total puts', 'total calls', 'spot closing price', 'expiry', 'strike-level call OI', 'strike-level put OI'],
    derivedMetrics: ['support wall', 'resistance wall', 'PCR OI', 'OI concentration'],
    mappedScreens: ['Combined OI', 'Build Up', 'Find Trades', 'Option Screener'],
    dashboardUse: 'Back the Combined OI view with official strike-level OI aggregates rather than only option-chain snapshots.',
    implementationNote: 'The app already computes OI from option chain; add official OI endpoint as reconciliation and historical OI source.'
  },
  {
    id: 'change_oi_data',
    name: 'Change in OI data',
    category: 'Market Information',
    status: 'partial',
    cadence: 'Daily interval comparison',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-change-oi/',
    primaryFields: ['total put change OI', 'total call change OI', 'strike-level call change OI', 'strike-level put change OI'],
    derivedMetrics: ['long buildup', 'short buildup', 'covering', 'unwinding', 'strike migration'],
    mappedScreens: ['Build Up', 'Combined OI', 'Find Trades', 'Option Screener'],
    dashboardUse: 'Make buildup classification more reliable by comparing OI change across selected intervals.',
    implementationNote: 'Use this for the Build Up tab and dashboard activity blocks; the current MVP derives change from sample chain rows.'
  },
  {
    id: 'max_pain_data',
    name: 'Max Pain data',
    category: 'Market Information',
    status: 'partial',
    cadence: 'Bucketed intraday',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-max-pain/',
    primaryFields: ['max pain', 'spot closing price', 'expiry date', 'intraday max pain insights'],
    derivedMetrics: ['pin risk', 'spot-to-max-pain distance', 'max pain drift'],
    mappedScreens: ['Dashboard', 'Contract Overview', 'Combined OI', 'Find Trades'],
    dashboardUse: 'Show whether suggested range trades are near expiry pin zones or fighting positioning.',
    implementationNote: 'The app computes max pain locally today; use Upstox max-pain endpoint to show the intraday path and confidence.'
  },
  {
    id: 'pcr_data',
    name: 'Put-Call Ratio data',
    category: 'Market Information',
    status: 'partial',
    cadence: 'Bucketed intraday',
    sourceUrl: 'https://upstox.com/developer/api-documentation/get-pcr/',
    primaryFields: ['PCR', 'spot closing price', 'expiry date', 'intraday PCR insights'],
    derivedMetrics: ['sentiment regime', 'PCR trend', 'contrarian risk', 'bullish/bearish skew'],
    mappedScreens: ['Dashboard', 'Contract Overview', 'Find Trades', 'Option Screener'],
    dashboardUse: 'Upgrade PCR leaders and trade thesis explanations with official PCR history instead of one snapshot.',
    implementationNote: 'Keep pcrOi and pcrVolume from chain analytics, then add official PCR as the historical/intraday context source.'
  }
];

export const upstoxDashboardCoverage = [
  {
    title: 'Live price and liquidity',
    feeds: ['full_market_quotes', 'ltp_quotes_v3', 'put_call_option_chain', 'option_greeks'],
    screens: ['Dashboard', 'Option Chain', 'Find Trades', 'Option Screener'],
    value: 'Dynamic premiums, bid/ask, volume, OI, Greeks, and quote freshness.'
  },
  {
    title: 'Positioning and sentiment',
    feeds: ['oi_data', 'change_oi_data', 'max_pain_data', 'pcr_data'],
    screens: ['Dashboard', 'Combined OI', 'Build Up', 'Find Trades'],
    value: 'Official OI walls, OI change, max pain drift, and PCR regime.'
  },
  {
    title: 'Market context',
    feeds: ['market_status', 'fii_data', 'dii_data', 'historical_candles_v3'],
    screens: ['Dashboard', 'Contract Overview', 'Technicals', 'Create Algo'],
    value: 'Session state, institutional flow, trend, volatility, and indicator calculations.'
  },
  {
    title: 'Trade realism',
    feeds: ['brokerage_details', 'margin_details', 'option_contracts'],
    screens: ['Find Trades', 'Analyse Trade', 'Create Algo'],
    value: 'Expiry, lot size, freeze quantity, margin, charges, and cost-adjusted payoff.'
  }
] as const;

export const upstoxMissingScreenSuggestions: UpstoxScreenSuggestion[] = [
  {
    title: 'Data Health',
    parent: 'Dashboard',
    priority: 'MVP',
    feeds: ['market_status', 'market_data_feed_v3', 'full_market_quotes'],
    purpose: 'Show market session, token feed state, quote freshness, websocket/polling mode, and stale-data warnings.'
  },
  {
    title: 'Institutional Flow',
    parent: 'Dashboard',
    priority: 'MVP',
    feeds: ['fii_data', 'dii_data'],
    purpose: 'Separate FII/DII cash and derivative flow from contract-level signals so users understand broader market pressure.'
  },
  {
    title: 'Derivative Statistics',
    parent: 'Dashboard',
    priority: 'MVP',
    feeds: ['oi_data', 'change_oi_data', 'max_pain_data', 'pcr_data'],
    purpose: 'Centralize PCR, max pain, OI wall, and OI-change panels before the user enters a specific contract.'
  },
  {
    title: 'Cost and Margin Simulator',
    parent: 'Analyse Trade',
    priority: 'Next',
    feeds: ['brokerage_details', 'margin_details'],
    purpose: 'Convert theoretical payoff into margin-adjusted and charge-adjusted trade analysis.'
  },
  {
    title: 'Volatility and Greeks Lab',
    parent: 'Contract Overview',
    priority: 'Next',
    feeds: ['option_greeks', 'historical_candles_v3', 'put_call_option_chain'],
    purpose: 'Give experienced traders a focused surface for IV skew, Greeks exposure, expected move, and model confidence.'
  },
  {
    title: 'Backtest Data Coverage',
    parent: 'Create Algo',
    priority: 'Next',
    feeds: ['historical_candles_v3', 'option_contracts'],
    purpose: 'Show what data exists for an algo before the user trusts a backtest result.'
  }
];

export const getUpstoxCoverageCounts = () => {
  const initial = { covered: 0, partial: 0, planned: 0 };
  return upstoxAnalyticsFeeds.reduce((counts, feed) => {
    counts[feed.status] += 1;
    return counts;
  }, initial);
};
