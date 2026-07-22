import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// English is bundled statically (source of truth + synchronous fallback).
// All other locales are lazy-loaded on demand so they add ZERO weight to the
// initial bundle — a visitor who never switches language never downloads them.
import en from './locales/en.json';

export type Language = 'en' | 'es' | 'es-ES' | 'pt' | 'hi' | 'fr' | 'de';
export type Region = 'US' | 'MX' | 'BR' | 'IN' | 'FR' | 'DE' | 'GB' | 'ES' | 'PT' | 'EU';

export const SUPPORTED_LANGUAGES: { code: Language; label: string; nativeLabel: string; flag: string }[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', flag: '🇺🇸' },
  { code: 'es', label: 'Spanish (Latin America)', nativeLabel: 'Español (Latinoamérica)', flag: '🇲🇽' },
  { code: 'es-ES', label: 'Spanish (Spain)', nativeLabel: 'Español (España)', flag: '🇪🇸' },
  { code: 'pt', label: 'Portuguese', nativeLabel: 'Português', flag: '🇧🇷' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', flag: '🇮🇳' },
  { code: 'fr', label: 'French', nativeLabel: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'German', nativeLabel: 'Deutsch', flag: '🇩🇪' },
];

type Bundle = Record<string, unknown> & { _meta?: { status?: string; version?: string } };

// Vite turns each locale into its own tiny async chunk.
const localeLoaders = (import.meta as any).glob('./locales/*.json') as Record<string, () => Promise<{ default: Bundle }>>;
const loadedBundles: Partial<Record<Language, Bundle>> = { en };

const isSupported = (code: string | null | undefined): code is Language =>
  !!code && SUPPORTED_LANGUAGES.some(l => l.code === code);

/** Read ?lang= from the URL. Deep links like /liberty-md?lang=es win over everything. */
function langFromQuery(): Language | null {
  if (typeof window === 'undefined') return null;
  const q = new URLSearchParams(window.location.search).get('lang');
  return isSupported(q) ? q : null;
}

/** Write ?lang= into the URL without adding history entries, preserving other params. */
function writeLangToQuery(lang: Language) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  url.searchParams.set('lang', lang);
  window.history.replaceState(window.history.state, '', url.toString());
}

/** 'es-ES' -> 'es'; 'es' -> null (no parent). */
const baseOf = (lang: Language): Language | null => {
  const base = lang.split('-')[0];
  return base !== lang && isSupported(base) ? (base as Language) : null;
};

export function detectLanguage(): Language {
  const fromQuery = langFromQuery();
  if (fromQuery) return fromQuery;
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem('libertymd.lang') : null;
  if (isSupported(saved)) return saved;
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en');
  // Exact variant match first (es-ES), then base language (es-MX/es-AR/... -> es)
  if (isSupported(nav)) return nav;
  const base = nav.toLowerCase().split('-')[0];
  return isSupported(base) ? base : 'en';
}

export function detectRegion(): Region {
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en-US');
  const part = nav.split('-')[1]?.toUpperCase();
  const known: Region[] = ['US', 'MX', 'BR', 'IN', 'FR', 'DE', 'GB', 'ES', 'PT'];
  return (known.includes(part as Region) ? part : 'US') as Region;
}

function lookup(bundle: Bundle | undefined, key: string): string | undefined {
  if (!bundle) return undefined;
  const value = key.split('.').reduce<unknown>((node, part) => {
    if (node && typeof node === 'object') return (node as Record<string, unknown>)[part];
    return undefined;
  }, bundle);
  return typeof value === 'string' ? value : undefined;
}

function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name) => (vars[name] !== undefined ? String(vars[name]) : `{${name}}`));
}

interface I18nContextValue {
  language: Language;
  region: Region;
  setLanguage: (lang: Language) => void;
  setRegion: (region: Region) => void;
  /** Translate a key with {placeholder} interpolation. Fallback chain: language → English → key itself. */
  t: (key: string, vars?: Record<string, string | number>) => string;
  /** True when the active language bundle is machine-translated and not yet human-approved. */
  isBeta: boolean;
  /** True while a lazily loaded locale is still downloading (English shown meanwhile). */
  isLoadingLocale: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = 'libertymd.lang';
const STORAGE_REGION_KEY = 'libertymd.region';

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(detectLanguage);
  const [region, setRegionState] = useState<Region>(() => {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_REGION_KEY) : null;
    return (saved as Region) || detectRegion();
  });
  const [, setLoadedTick] = useState(0); // re-render trigger once a locale chunk arrives

  const needsLoad = language !== 'en' && !loadedBundles[language];

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, language); } catch { /* private mode */ }
    if (typeof document !== 'undefined') document.documentElement.lang = language;
    writeLangToQuery(language);
    const toLoad = [language, baseOf(language)].filter((l): l is Language => !!l && l !== 'en' && !loadedBundles[l]);
    for (const target of toLoad) {
      const loader = localeLoaders[`./locales/${target}.json`];
      if (loader) {
        loader().then(mod => {
          loadedBundles[target] = mod.default;
          setLoadedTick(t => t + 1);
        }).catch(() => { /* stay on fallback */ });
      }
    }
  }, [language]);

  // React to back/forward navigation changing ?lang=
  useEffect(() => {
    const onPop = () => { const q = langFromQuery(); if (q) setLanguageState(q); };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_REGION_KEY, region); } catch { /* private mode */ }
  }, [region]);

  const value = useMemo<I18nContextValue>(() => {
    const bundle = loadedBundles[language];
    const base = baseOf(language);
    const baseBundle = base ? loadedBundles[base] : undefined;
    const t = (key: string, vars?: Record<string, string | number>) => {
      const hit = lookup(bundle, key) ?? lookup(baseBundle, key) ?? lookup(loadedBundles.en, key);
      if (hit === undefined && (import.meta as any).env?.DEV) console.warn(`[i18n] missing key: ${key}`);
      return interpolate(hit ?? key, vars);
    };
    return {
      language,
      region,
      setLanguage: setLanguageState,
      setRegion: setRegionState,
      t,
      isBeta: (bundle ?? baseBundle) ? (bundle ?? baseBundle)!._meta?.status !== 'approved' : false,
      isLoadingLocale: needsLoad,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, region, needsLoad, loadedBundles[language]]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
