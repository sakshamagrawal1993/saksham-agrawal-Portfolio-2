import { useEffect, useRef, useState } from 'react';
import { Languages, ChevronDown, Check } from 'lucide-react';
import { SUPPORTED_LANGUAGES, useI18n, type Language } from '../../i18n';

/**
 * Header language selector.
 * Trigger: bordered pill with translate glyph + current language (reference image 2).
 * Menu: rounded card of flag + native-name rows, active row highlighted (reference image 1).
 * Selecting a language also sets ?lang=<code> in the URL for shareable deep links.
 */
export default function LibertyMDLanguageSwitcher({ align = 'right' }: { align?: 'left' | 'right' }) {
  const { language, setLanguage, t, isBeta } = useI18n();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const current = SUPPORTED_LANGUAGES.find(l => l.code === language) ?? SUPPORTED_LANGUAGES[0];

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

  const choose = (code: Language) => {
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
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-[#CBD5E1] bg-white px-3.5 text-sm font-semibold text-[#334155] shadow-sm transition hover:border-[#94A3B8] hover:text-[#111827] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#2563EB]"
      >
        <Languages className="h-4 w-4 text-[#475569]" aria-hidden />
        <span className="hidden sm:inline">{current.nativeLabel}</span>
        <span className="sm:hidden uppercase">{current.code}</span>
        <ChevronDown className={`h-3.5 w-3.5 text-[#64748B] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label="Select language"
          className={`absolute top-12 z-[80] w-56 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white py-1 shadow-[0_18px_44px_rgba(15,23,42,0.16)] ${align === 'right' ? 'right-0' : 'left-0'}`}
        >
          {SUPPORTED_LANGUAGES.map(lang => {
            const active = lang.code === language;
            return (
              <li key={lang.code} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => choose(lang.code)}
                  className={`flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] font-medium transition ${
                    active ? 'bg-[#DBE4FB] text-[#111827]' : 'text-[#1F2937] hover:bg-[#F1F5F9]'
                  }`}
                >
                  <span className="text-xl leading-none" aria-hidden>{lang.flag}</span>
                  <span className="flex-1">{lang.nativeLabel}</span>
                  {active && <Check className="h-4 w-4 text-[#2563EB]" aria-hidden />}
                </button>
              </li>
            );
          })}
          {isBeta && (
            <li className="border-t border-[#F1F5F9] px-4 py-2 text-[11px] leading-snug text-amber-700">
              {t('common.betaLanguage')}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
