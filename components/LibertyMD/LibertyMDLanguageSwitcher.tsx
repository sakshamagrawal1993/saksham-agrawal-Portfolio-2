import { useEffect, useRef, useState } from 'react';
import { Languages, ChevronDown, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES, useI18n } from '../../i18n';
import { emitClinicalLocaleBlocked } from './libertymd-analytics';

/**
 * Header language selector.
 * Trigger: bordered pill with translate glyph + current language (reference image 2).
 * Menu: rounded card of flag + native-name rows, active row highlighted (reference image 1).
 * Selecting a language also sets ?lang=<code> in the URL for shareable deep links.
 * Locale list comes from `i18n/registry.json` (AC6) — no TS allowlist edit to add a language.
 *
 * P3-07 Q1: when `clinicalLock` is set (active clinical surface), chrome stays on the
 * locked clinical language. Selecting another code stores a post-exit landing preference
 * and logs `clinical_locale_blocked` when Spanish is chosen under the closed clinical gate.
 */
export default function LibertyMDLanguageSwitcher({
  align = 'right',
  clinicalLock = null,
}: {
  align?: 'left' | 'right'
  /** Stored consultations.language — forces chrome while a consult is open. */
  clinicalLock?: string | null
}) {
  const { language, setLanguage, setPreferredLandingLanguage, t, isBeta } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const displayCode = clinicalLock || language;
  const current = SUPPORTED_LANGUAGES.find(l => l.code === displayCode) ?? SUPPORTED_LANGUAGES[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (code: string) => {
    if (clinicalLock) {
      // Post-exit landing may use this; clinical chrome stays locked.
      setPreferredLandingLanguage(code);
      const wantsEs = code === 'es' || code.startsWith('es-') || code.startsWith('es_');
      if (wantsEs && clinicalLock === 'en') {
        emitClinicalLocaleBlocked({ candidate: 'es', clinical_locale: 'en' });
      }
      setOpen(false);
      return;
    }
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(current => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label="Change language"
        className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-libertymd-slate-300 bg-white px-3.5 text-sm font-semibold text-libertymd-slate-700 shadow-sm transition hover:border-libertymd-slate-400 hover:text-libertymd-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-libertymd-blue-600"
      >
        <Languages className="h-4 w-4 text-libertymd-slate-600" aria-hidden />
        <span className="hidden sm:inline">{current.nativeLabel}</span>
        <span className="sm:hidden uppercase">{current.code}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-libertymd-slate-500 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select language"
          className={`absolute top-12 z-[80] w-56 overflow-hidden rounded-2xl border border-libertymd-slate-200 bg-white py-1 shadow-[0_18px_44px_rgba(15,23,42,0.16)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {SUPPORTED_LANGUAGES.map(lang => {
            const active = lang.code === displayCode;
            return (
              <li key={lang.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => choose(lang.code)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium transition ${
                    active ? 'bg-libertymd-blue-50 text-libertymd-ink' : 'text-libertymd-ink hover:bg-libertymd-slate-100'
                  }`}
                >
                  <span className="text-xl leading-none" aria-hidden>{lang.flag}</span>
                  <span className="flex-1">{lang.nativeLabel}</span>
                  {active && <Check className="h-4 w-4 text-libertymd-blue-600" aria-hidden />}
                </button>
              </li>
            );
          })}
          {isBeta && (
            <li className="border-t border-libertymd-slate-100 px-4 py-2 text-[11px] leading-snug text-amber-700">
              {t('common.betaLanguage')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
