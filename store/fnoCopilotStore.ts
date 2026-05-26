import { create } from 'zustand';

export interface Watchlist {
  id: string;
  name: string;
  symbols: string[];
}

export interface Alert {
  id: string;
  instrument_symbol: string;
  alert_type: string;
  target_value: number;
  is_active: boolean;
}

export interface PaperTrade {
  id: string;
  instrument_symbol: string;
  status: 'OPEN' | 'CLOSED' | 'CANCELLED';
  margin_blocked: number;
  realized_pnl: number;
}

export interface JournalEntry {
  id: string;
  paper_trade_id?: string;
  thesis: string;
  learnings?: string;
}

interface FnOCopilotState {
  watchlists: Watchlist[];
  alerts: Alert[];
  paperTrades: PaperTrade[];
  journals: JournalEntry[];

  addWatchlist: (watchlist: Watchlist) => void;
  addAlert: (alert: Alert) => void;
  addPaperTrade: (trade: PaperTrade) => void;
  addJournalEntry: (entry: JournalEntry) => void;
}

export const useFnOCopilotStore = create<FnOCopilotState>((set) => ({
  watchlists: [],
  alerts: [],
  paperTrades: [],
  journals: [],

  addWatchlist: (watchlist) => set((state) => ({ watchlists: [...state.watchlists, watchlist] })),
  addAlert: (alert) => set((state) => ({ alerts: [...state.alerts, alert] })),
  addPaperTrade: (trade) => set((state) => ({ paperTrades: [...state.paperTrades, trade] })),
  addJournalEntry: (entry) => set((state) => ({ journals: [...state.journals, entry] })),
}));
