-- ==============================================================================
-- Migration: FnO Copilot Persistence Layer
-- Description: Adds tables for Watchlists, Alerts, Paper Trades, and Journals
-- ==============================================================================

-- 1. Watchlists
CREATE TABLE IF NOT EXISTS public.fno_user_watchlists (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Default Watchlist',
    symbols JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of instrument symbols
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Alerts
CREATE TABLE IF NOT EXISTS public.fno_user_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    instrument_symbol TEXT NOT NULL,
    alert_type TEXT NOT NULL CHECK (alert_type IN ('PRICE_ABOVE', 'PRICE_BELOW', 'IV_SPIKE', 'VOLUME_SPIKE')),
    target_value NUMERIC NOT NULL,
    is_active BOOLEAN DEFAULT true,
    triggered_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Paper Portfolios and Trades
CREATE TABLE IF NOT EXISTS public.fno_paper_portfolios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    initial_capital NUMERIC NOT NULL DEFAULT 1000000,
    current_capital NUMERIC NOT NULL DEFAULT 1000000,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.fno_paper_trades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    portfolio_id UUID REFERENCES public.fno_paper_portfolios(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    strategy_name TEXT,
    instrument_symbol TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('OPEN', 'CLOSED', 'CANCELLED')),
    entry_time TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    exit_time TIMESTAMP WITH TIME ZONE,
    margin_blocked NUMERIC NOT NULL DEFAULT 0,
    realized_pnl NUMERIC NOT NULL DEFAULT 0,
    legs JSONB NOT NULL DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Trade Journals
CREATE TABLE IF NOT EXISTS public.fno_trade_journals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    paper_trade_id UUID REFERENCES public.fno_paper_trades(id) ON DELETE SET NULL,
    thesis TEXT NOT NULL,
    mistakes TEXT,
    learnings TEXT,
    mood_before TEXT,
    mood_after TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.fno_user_watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fno_user_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fno_paper_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fno_paper_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fno_trade_journals ENABLE ROW LEVEL SECURITY;

-- Basic Policies (Users can only see their own data)
CREATE POLICY "Users can view own watchlists" ON public.fno_user_watchlists FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own watchlists" ON public.fno_user_watchlists FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own alerts" ON public.fno_user_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own alerts" ON public.fno_user_alerts FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own portfolios" ON public.fno_paper_portfolios FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own portfolios" ON public.fno_paper_portfolios FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own trades" ON public.fno_paper_trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own trades" ON public.fno_paper_trades FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view own journals" ON public.fno_trade_journals FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own journals" ON public.fno_trade_journals FOR ALL USING (auth.uid() = user_id);
