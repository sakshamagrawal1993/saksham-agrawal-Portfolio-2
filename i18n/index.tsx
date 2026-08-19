import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// English is bundled statically (source of truth + synchronous fallback).
// All other locales are lazy-loaded on demand so they add ZERO weight to the
// initial bundle — a visitor who never switches language never downloads them.
import en from './locales/en.json';
import registry from './registry.json';

/** Locale code derived from `i18n/registry.json` — add a locale without editing a TS allowlist. */
export type Language = string;
export type Region = 'US' | 'MX' | 'BR' | 'IN' | 'FR' | 'DE' | 'GB' | 'ES' | 'PT' | 'EU';

export type LocaleRegistryEntry = {
  code: string;
  label: string;
  nativeLabel: string;
  flag: string;
};

/** Data-driven chrome locale list (AC6). Editing this file + dropping a locale JSON adds a language. */
export const SUPPORTED_LANGUAGES: LocaleRegistryEntry[] = (registry as { locales: LocaleRegistryEntry[] }).locales;

type Bundle = Record<string, unknown> & { _meta?: { status?: string; version?: string } };

// Vite turns each locale into its own tiny async chunk.
const localeLoaders = (import.meta as any).glob('./locales/*.json') as Record<string, () => Promise<{ default: Bundle }>>;
const loadedBundles: Partial<Record<string, Bundle>> = { en };

const isSupported = (code: string | null | undefined): boolean =>
  !!code && SUPPORTED_LANGUAGES.some(l => l.code === code);

/** Read language from the URL query. Deep links like ?lang-es or ?lang=es win over everything. */
function langFromQuery(): Language | null {
  if (typeof window === 'undefined') return null;
  const search = window.location.search;
  const params = new URLSearchParams(search);
  const q = params.get('lang');

  if (isSupported(q) && q) return q;
  if (q === 'es' || q === 'lang-es' || params.has('lang-es') || search.includes('lang-es') || search.includes('lang=es')) {
    return 'es';
  }
  return null;
}

/** Write query parameter into the URL without adding history entries, preserving other params. */
function writeLangToQuery(lang: Language) {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  if (lang === 'es') {
    url.searchParams.set('lang-es', 'true');
    url.searchParams.delete('lang');
  } else if (lang !== 'en') {
    url.searchParams.set('lang', lang);
  } else {
    url.searchParams.delete('lang');
    url.searchParams.delete('lang-es');
    if (url.search.includes('lang-es')) {
      const cleanSearch = url.search.replace(/([?&])lang-es(=[^&]*)?(&|$)/, '$1').replace(/[?&]$/, '');
      url.search = cleanSearch;
    }
  }
  window.history.replaceState(window.history.state, '', url.toString());
}

/** 'es-ES' -> 'es'; 'es' -> null (no parent). */
const baseOf = (lang: Language): Language | null => {
  const base = lang.split('-')[0];
  return base !== lang && isSupported(base) ? base : null;
};

/** P3-07 — preferred chrome after exiting a clinically locked surface. */
const STORAGE_PREFERRED_LANDING_KEY = 'libertymd.lang.preferred';

/**
 * Detect active language.
 * Priority order:
 * 1. URL query (?lang-es, ?lang=es, ?lang=<code>)
 * 2. Stored preferred landing language in localStorage
 * 3. Stored active language in localStorage
 * 4. Browser navigator.language
 * 5. Fallback: English ('en')
 */
export function detectLanguage(): Language {
  const fromQuery = langFromQuery();
  if (fromQuery) return fromQuery;
  const preferred = typeof localStorage !== 'undefined'
    ? localStorage.getItem(STORAGE_PREFERRED_LANDING_KEY)
    : null;
  if (isSupported(preferred) && preferred) return preferred;
  const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
  if (isSupported(saved) && saved) return saved;
  const nav = (typeof navigator !== 'undefined' ? navigator.language : 'en');
  if (isSupported(nav)) return nav;
  const base = nav.toLowerCase().split('-')[0];
  return isSupported(base) ? base : 'en';
}

export function chromeCodeForClinicalLanguage(clinical: string | null | undefined): Language {
  const s = String(clinical || 'en').trim();
  if (isSupported(s)) return s;
  const lower = s.toLowerCase();
  if (lower === 'hinglish' || lower === 'hi-latn') return 'hi-Latn';
  if (isSupported(lower)) return lower;
  return 'en';
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
  /**
   * P3-07 — store post-exit landing chrome preference without changing active
   * clinical chrome (used when clinicalLock is on).
   */
  setPreferredLandingLanguage: (lang: Language) => void;
  /**
   * Translate a key with {placeholder} interpolation.
   * Fallback: language → base → English → safe empty (never raw key — AC5).
   */
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
  const [loadedTick, setLoadedTick] = useState(0); // re-render trigger once a locale chunk arrives

  const needsLoad = language !== 'en' && !loadedBundles[language];

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, language);
      localStorage.setItem(STORAGE_PREFERRED_LANDING_KEY, language);
    } catch { /* private mode */ }
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
      const ownHit = lookup(bundle, key);
      const baseHit = lookup(baseBundle, key);
      const englishHit = lookup(loadedBundles.en, key);
      // es-ES is a delta over Spanish. Historical delta entries sometimes
      // copied the English source value; those are untranslated, not genuine
      // Peninsular-Spanish overrides, so inherit the Spanish value instead.
      // Stable English keys are unaffected; this only changes rendered values.
      const ownHitIsUntranslatedRegionValue = language === 'es-ES'
        && ownHit !== undefined
        && baseHit !== undefined
        && ownHit === englishHit;
      const hit = (ownHitIsUntranslatedRegionValue ? undefined : ownHit) ?? baseHit ?? englishHit;
      if (hit === undefined) {
        if ((import.meta as any).env?.DEV) console.warn(`[i18n] missing key: ${key}`);
        // AC5: never render raw keys to the user.
        return '';
      }
      return interpolate(hit, vars);
    };
    const setPreferredLandingLanguage = (lang: Language) => {
      if (!isSupported(lang)) return;
      try { localStorage.setItem(STORAGE_PREFERRED_LANDING_KEY, lang); } catch { /* private mode */ }
    };
    return {
      language,
      region,
      setLanguage: setLanguageState,
      setRegion: setRegionState,
      setPreferredLandingLanguage,
      t,
      isBeta: (bundle ?? baseBundle) ? (bundle ?? baseBundle)!._meta?.status !== 'approved' : false,
      isLoadingLocale: needsLoad,
    };
    // `loadedTick` bumps whenever ANY locale chunk lands — including the base
    // bundle of a region-qualified locale (es-ES → es). Without it the memo kept
    // a `t` closure whose `baseBundle` was still undefined, so every key missing
    // from es-ES fell straight past Spanish to English depending on which chunk
    // won the race in the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, region, needsLoad, loadedTick, loadedBundles[language]]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}
