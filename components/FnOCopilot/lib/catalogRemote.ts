import { SignalCatalogRow, applySignalRows } from './signalCatalog';
import { StrategyCatalogRow, applyStrategyRows } from './strategyTemplates';

/**
 * Loads the signal + strategy catalogs from Supabase at app start.
 * The TypeScript catalog compiled into the bundle stays the fallback: if the
 * fetch fails, times out, or returns nothing, the app behaves exactly as
 * before. Rows override in place, so descriptions/thresholds can be tuned in
 * the DB without a redeploy.
 *
 * Uses plain REST (no SDK dependency); the anon key is public by design and
 * the tables are read-only for anon via RLS.
 */
const SUPABASE_URL = (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_URL ?? 'https://ralhkmpbslsdkwnqzqen.supabase.co';
const SUPABASE_ANON_KEY =
  (import.meta as { env?: Record<string, string> }).env?.VITE_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJhbGhrbXBic2xzZGt3bnF6cWVuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1OTk2NzYsImV4cCI6MjA4MDE3NTY3Nn0.1iSyjdsWsy-FQdyg-hq6te2st_J_YkbpnhULPDSFsxk';

const fetchRows = async <T>(table: string): Promise<T[]> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const response = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?select=*&active=eq.true&order=sort_order.asc`,
      {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
        signal: controller.signal
      }
    );
    if (!response.ok) return [];
    const rows = (await response.json()) as T[];
    return Array.isArray(rows) ? rows : [];
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
};

export type CatalogHydrationResult = {
  source: 'supabase' | 'local-fallback';
  signalsApplied: number;
  strategiesApplied: number;
};

export const hydrateCatalogsFromSupabase = async (): Promise<CatalogHydrationResult> => {
  const [signalRows, strategyRows] = await Promise.all([
    fetchRows<SignalCatalogRow>('algo_signal_catalog'),
    fetchRows<StrategyCatalogRow>('algo_strategy_catalog')
  ]);
  const signalsApplied = signalRows.length ? applySignalRows(signalRows) : 0;
  const strategiesApplied = strategyRows.length ? applyStrategyRows(strategyRows) : 0;
  return {
    source: signalsApplied || strategiesApplied ? 'supabase' : 'local-fallback',
    signalsApplied,
    strategiesApplied
  };
};
