import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';
import { useI18n } from '../../i18n';
import { motion, useReducedMotion, useScroll, useTransform } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  Check,
  CircleDollarSign,
  Clock3,
  Globe2,
  HeartPulse,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

const libertyMDAssetBase = `${String(
  (import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_SUPABASE_URL
    || 'https://ralhkmpbslsdkwnqzqen.supabase.co',
).replace(/\/$/, '')}/storage/v1/object/public/libertymd-assets`;

const homepagePhoto = (id: string) => `${libertyMDAssetBase}/homepage/photos/${id}.jpg`;

const phoneImages = {
  doctor: homepagePhoto('photo-1559839734-2b71ea197ec2'),
  patientLeft: homepagePhoto('photo-1500648767791-00dcc994a43e'),
  patientRight: homepagePhoto('photo-1494790108377-be9c29b29330'),
  caller: homepagePhoto('photo-1507003211169-0a1dd7228f2d'),
};

const healthArticles = [
  {
    category: 'Everyday care',
    title: 'When a fever needs more than rest',
    description: 'A practical guide to duration, hydration, warning signs, and when to seek an evaluation.',
    image: homepagePhoto('photo-1505751172876-fa1923c5c528'),
  },
  {
    category: 'Heart health',
    title: 'Chest discomfort: the details that matter',
    description: 'Learn how timing, exertion, breathing, and associated symptoms change the urgency of care.',
    image: homepagePhoto('photo-1532938911079-1b06ac7ceec7'),
  },
  {
    category: 'Preparing for care',
    title: 'How to build a useful symptom timeline',
    description: 'Turn scattered observations into a concise story that is easier for a clinician to assess.',
    image: homepagePhoto('photo-1576091160399-112ba8d25d1d'),
  },
];

interface MarketingSectionProps {
  onStartChat: () => void;
}

export function LibertyMDPhoneCareSection({ onStartChat }: MarketingSectionProps) {
  const { t } = useI18n();
  const visualRef = useRef<HTMLDivElement | null>(null);
  const reduceMotion = useReducedMotion();
  const [isMobileVisual, setIsMobileVisual] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches,
  );

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 639px)');
    const updateLayout = () => setIsMobileVisual(mediaQuery.matches);

    updateLayout();
    mediaQuery.addEventListener('change', updateLayout);
    return () => mediaQuery.removeEventListener('change', updateLayout);
  }, []);

  const { scrollYProgress } = useScroll({
    target: visualRef,
    offset: ['start 0.96', 'center 0.45'],
  });
  const revealEnd = isMobileVisual ? 0.62 : 0.82;
  const leftX = useTransform(scrollYProgress, [0, revealEnd], [isMobileVisual ? '115%' : '175%', isMobileVisual ? '-18%' : '-8%']);
  const rightX = useTransform(scrollYProgress, [0, revealEnd], [isMobileVisual ? '-105%' : '-160%', isMobileVisual ? '18%' : '6%']);
  const leftY = useTransform(scrollYProgress, [0, revealEnd], [isMobileVisual ? 70 : 110, 0]);
  const rightY = useTransform(scrollYProgress, [0, revealEnd], [isMobileVisual ? 32 : 52, 0]);
  const leftRotate = useTransform(scrollYProgress, [0, revealEnd], [-14, -4]);
  const rightRotate = useTransform(scrollYProgress, [0, revealEnd], [14, 5]);
  const photoOpacity = useTransform(
    scrollYProgress,
    isMobileVisual ? [0, 0.45] : [0, 0.78],
    [0, 1]
  );
  const photoScale = useTransform(
    scrollYProgress,
    isMobileVisual ? [0, 0.55] : [0, 0.78],
    isMobileVisual ? [0.9, 1] : [0.86, 1]
  );
  const pillY = useTransform(scrollYProgress, isMobileVisual ? [0.36, 0.76] : [0.55, 0.95], [24, 0]);
  const pillOpacity = useTransform(scrollYProgress, isMobileVisual ? [0.36, 0.76] : [0.55, 0.95], [0, 1]);
  const unfoldedPhotoStyle = reduceMotion ? { opacity: 1, scale: 1 } : undefined;
  const revealedPhoneStyle = { opacity: 1, scale: 1, y: 0, rotate: 0 };
  const revealedPillStyle = reduceMotion ? { opacity: 1, y: 0 } : undefined;

  return (
    <section
      className="libertymd-page-gutter libertymd-section-spacing relative overflow-hidden border-t border-libertymd-green-sage bg-libertymd-green-sage/40"
    >
      <div className="libertymd-shell grid items-center gap-[var(--libertymd-layout-gap)] lg:min-h-[720px] lg:grid-cols-[minmax(17rem,0.72fr)_minmax(34rem,1.28fr)]">
        <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
          <p className="text-xs font-bold uppercase text-libertymd-blue-600">{t('marketing.care.kicker')}</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-serif text-4xl font-semibold leading-tight text-libertymd-ink sm:text-5xl lg:mx-0">
            {t('marketing.care.title')}
          </h2>
          <p className="mt-7 text-lg font-bold leading-8 text-libertymd-ink sm:text-xl">
            {t('marketing.care.aiLine')}<br />
            <span className="text-libertymd-blue-600">{t('marketing.care.doctorsHighlight')}</span> {t('marketing.care.doctorsRest')}
          </p>
          <p className="mx-auto mt-7 max-w-lg border-t border-dashed border-libertymd-green-sage pt-7 text-sm leading-7 text-libertymd-slate-muted sm:text-base lg:mx-0">
            {t('marketing.care.body')}
          </p>
          <p className="mt-7 text-sm font-semibold text-libertymd-slate-600 sm:text-base">
            {t('marketing.care.priceLead')}
          </p>
          <button
            type="button"
            onClick={onStartChat}
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-libertymd-blue-600 px-6 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] transition hover:bg-libertymd-blue-700"
          >
            {t('marketing.care.cta')} <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div ref={visualRef} className="relative mx-auto h-[500px] w-full max-w-[720px] sm:h-[650px] lg:h-[clamp(680px,47vw,760px)] lg:max-w-[clamp(44rem,54vw,54rem)]">
          <motion.div
            style={unfoldedPhotoStyle || { x: leftX, y: leftY, rotate: leftRotate, opacity: photoOpacity, scale: photoScale }}
            className="absolute left-[1%] top-[39%] z-0 h-52 w-36 overflow-hidden rounded-lg shadow-[0_24px_70px_rgba(15,23,42,0.16)] sm:left-[5%] sm:top-[35%] sm:h-72 sm:w-48 lg:h-[clamp(19rem,22vw,23rem)] lg:w-[clamp(13rem,15vw,15.5rem)]"
          >
            <img src={phoneImages.patientLeft} alt="Patient preparing for a LibertyMD visit" className="h-full w-full object-cover" />
          </motion.div>

          <motion.div
            style={unfoldedPhotoStyle || { x: rightX, y: rightY, rotate: rightRotate, opacity: photoOpacity, scale: photoScale }}
            className="absolute right-[1%] top-[17%] z-0 h-52 w-36 overflow-hidden rounded-lg shadow-[0_24px_70px_rgba(15,23,42,0.16)] sm:right-[3%] sm:top-[12%] sm:h-72 sm:w-48 lg:h-[clamp(20rem,23vw,24rem)] lg:w-[clamp(13rem,15vw,15.5rem)]"
          >
            <img src={phoneImages.patientRight} alt="Patient connecting with LibertyMD" className="h-full w-full object-cover" />
          </motion.div>

          <div className="absolute left-1/2 top-0 z-10 h-[420px] w-[208px] -translate-x-1/2 sm:h-[620px] sm:w-[306px] lg:left-[54%] lg:h-[clamp(660px,45vw,740px)] lg:w-[clamp(326px,22.3vw,366px)]">
            <motion.div
              style={revealedPhoneStyle}
              className="h-full w-full overflow-hidden rounded-[42px] border-[9px] border-libertymd-ink bg-libertymd-ink shadow-[0_34px_90px_rgba(15,23,42,0.24)] sm:rounded-[50px] sm:border-[11px]"
            >
              <div className="relative h-full w-full overflow-hidden rounded-[31px] bg-libertymd-slate-200 sm:rounded-[38px]">
                <img src={phoneImages.doctor} alt="LibertyMD physician on a video visit" className="h-full w-full object-cover object-center" />
                <div className="absolute left-1/2 top-3 h-6 w-20 -translate-x-1/2 rounded-full bg-libertymd-slate-900 sm:h-7 sm:w-24" />
                <div className="absolute inset-x-3 top-12 rounded-lg bg-libertymd-ink/70 px-3 py-2 text-left text-[10px] font-semibold text-white backdrop-blur-md sm:top-14 sm:text-xs">
                  <span className="block">{t('marketing.care.previewLabel')}</span>
                  <span className="font-normal text-white/75">{t('marketing.care.drRole')}</span>
                </div>
                <div className="absolute bottom-5 right-4 h-20 w-16 overflow-hidden rounded-lg border-2 border-white shadow-lg sm:h-24 sm:w-20">
                  <img src={phoneImages.caller} alt="Patient video preview" className="h-full w-full object-cover" />
                </div>
                <div className="absolute bottom-4 left-1/2 h-1 w-24 -translate-x-1/2 rounded-full bg-black/75" />
              </div>
            </motion.div>
          </div>

          <motion.div
            style={revealedPillStyle || { opacity: pillOpacity, y: pillY }}
            className="absolute -top-8 left-[1%] z-20 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-libertymd-green-sage px-4 py-2 text-xs font-bold text-libertymd-ink shadow-sm sm:left-[7%] sm:top-[6%] sm:px-5 sm:text-sm lg:left-[2%] lg:top-[16%]"
          >
            <CalendarClock className="h-4 w-4" /> ASAP or schedule ahead
          </motion.div>
          <motion.div
            style={revealedPillStyle || { opacity: pillOpacity, y: pillY }}
            className="absolute right-0 top-[48%] z-20 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-libertymd-green-sage px-4 py-2 text-xs font-bold text-libertymd-ink shadow-sm sm:right-[1%] sm:px-5 sm:text-sm"
          >
            <HeartPulse className="h-4 w-4" /> Doctors who know the context
          </motion.div>
          <div className="absolute inset-x-0 bottom-[1%] z-20 flex justify-center lg:justify-start lg:pl-[22%]">
            <motion.div
              style={revealedPillStyle || { opacity: pillOpacity, y: pillY }}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-libertymd-green-sage px-4 py-2 text-xs font-bold text-libertymd-ink shadow-sm sm:px-5 sm:text-sm"
            >
              <Clock3 className="h-4 w-4" /> {t('marketing.care.pillAvailability')}
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LibertyMDPricingSection({ onStartChat }: MarketingSectionProps) {
  const { t } = useI18n();
  const reduceMotion = useReducedMotion();
  const pricingCardRef = useRef<HTMLDivElement | null>(null);
  const pricingCardActiveRef = useRef(false);
  // P3-03 — drop live bookable visit-price invent (P2-15 deferred).
  const rows = [
    ['Private AI care chat', 'Free'],
    ['Urgency and red-flag screening', 'Free'],
    ['Doctor-ready health report', 'Free'],
    ['Unlimited follow-up questions', 'Free'],
    ['Prescription support', 'From $0'],
    ['Physician visit (when network is live)', 'Ask in chat'],
  ];

  const resetPricingCard = (card: HTMLDivElement) => {
    pricingCardActiveRef.current = false;
    card.style.transition = 'transform 700ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 700ms cubic-bezier(0.23, 1, 0.32, 1)';
    card.style.setProperty('--pricing-rotate-x', '0deg');
    card.style.setProperty('--pricing-rotate-y', '0deg');
    card.style.setProperty('--pricing-glare-x', '50%');
    card.style.setProperty('--pricing-glare-y', '50%');
    card.style.setProperty('--pricing-holo-x', '50%');
    card.style.setProperty('--pricing-holo-y', '50%');
    card.style.setProperty('--pricing-shadow-x', '0px');
    card.style.setProperty('--pricing-shadow-y', '26px');
    card.style.setProperty('--pricing-holo-opacity', '0.35');
    card.style.setProperty('--pricing-glare-opacity', '0');
  };

  const movePricingCard = (card: HTMLDivElement, clientX: number, clientY: number, intensity = 1) => {
    if (reduceMotion) return;

    const rect = card.getBoundingClientRect();
    const x = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
    const y = Math.min(Math.max((clientY - rect.top) / rect.height, 0), 1);

    pricingCardActiveRef.current = true;
    card.style.transition = 'transform 100ms ease-out, box-shadow 100ms ease-out';
    card.style.setProperty('--pricing-rotate-x', `${(0.5 - y) * 9 * intensity}deg`);
    card.style.setProperty('--pricing-rotate-y', `${(x - 0.5) * 11 * intensity}deg`);
    card.style.setProperty('--pricing-glare-x', `${x * 100}%`);
    card.style.setProperty('--pricing-glare-y', `${y * 100}%`);
    card.style.setProperty('--pricing-holo-x', `${(1 - x) * 100}%`);
    card.style.setProperty('--pricing-holo-y', `${(1 - y) * 100}%`);
    card.style.setProperty('--pricing-shadow-x', `${(0.5 - x) * 20}px`);
    card.style.setProperty('--pricing-shadow-y', `${18 + y * 16}px`);
    card.style.setProperty('--pricing-holo-opacity', '1');
    card.style.setProperty('--pricing-glare-opacity', '0.9');
  };

  const handlePricingPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'touch') return;
    movePricingCard(event.currentTarget, event.clientX, event.clientY);
  };

  const handlePricingTouch = (event: ReactTouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    movePricingCard(event.currentTarget, touch.clientX, touch.clientY, 0.72);
  };

  useEffect(() => {
    if (reduceMotion) return undefined;

    const handleDocumentPointerMove = (event: PointerEvent) => {
      const card = pricingCardRef.current;
      if (!card || !pricingCardActiveRef.current || event.pointerType === 'touch') return;

      const rect = card.getBoundingClientRect();
      const isOutside =
        event.clientX < rect.left ||
        event.clientX > rect.right ||
        event.clientY < rect.top ||
        event.clientY > rect.bottom;

      if (isOutside) resetPricingCard(card);
    };

    document.addEventListener('pointermove', handleDocumentPointerMove, { passive: true });
    return () => document.removeEventListener('pointermove', handleDocumentPointerMove);
  }, [reduceMotion]);

  const pricingCardStyle = {
    '--pricing-rotate-x': '0deg',
    '--pricing-rotate-y': '0deg',
    '--pricing-glare-x': '50%',
    '--pricing-glare-y': '50%',
    '--pricing-holo-x': '50%',
    '--pricing-holo-y': '50%',
    '--pricing-shadow-x': '0px',
    '--pricing-shadow-y': '26px',
    '--pricing-holo-opacity': '0.35',
    '--pricing-glare-opacity': '0',
    transform: reduceMotion
      ? 'none'
      : 'perspective(1100px) rotateX(var(--pricing-rotate-x)) rotateY(var(--pricing-rotate-y)) translateZ(0)',
    boxShadow:
      'var(--pricing-shadow-x) var(--pricing-shadow-y) 54px -20px rgba(15,23,42,0.28), var(--pricing-separation-shadow, 0 0 0 0 transparent), inset 0 1px 1px rgba(255,255,255,0.9), inset 0 -1px 1px rgba(15,23,42,0.06)',
    transformStyle: 'preserve-3d',
    transition: 'transform 700ms cubic-bezier(0.23, 1, 0.32, 1), box-shadow 700ms cubic-bezier(0.23, 1, 0.32, 1)',
  } as CSSProperties;

  return (
    <section className="libertymd-page-gutter libertymd-section-spacing border-t border-libertymd-green-sage bg-[color:var(--libertymd-blue-50)] text-center">
      <div className="libertymd-content-shell grid items-center gap-[var(--libertymd-layout-gap)] lg:grid-cols-[minmax(19rem,0.74fr)_minmax(32rem,1.26fr)]">
        <div>
          <p className="text-xs font-bold uppercase text-libertymd-blue-600">{t('marketing.pricing.kicker')}</p>
          <h2 className="mx-auto mt-3 max-w-lg font-serif text-4xl font-semibold leading-tight text-libertymd-ink sm:text-5xl">
            {t('marketing.pricing.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-libertymd-slate-muted sm:text-base">
            {t('marketing.pricing.body')}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 text-sm font-bold text-libertymd-ink">
            <span className="inline-flex items-center gap-2 rounded-full bg-libertymd-slate-200 px-4 py-2">
              <Globe2 className="h-4 w-4" /> {t('marketing.pricing.nationwide')}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-libertymd-slate-200 px-4 py-2">
              <ShieldCheck className="h-4 w-4" /> {t('marketing.pricing.insurance')}
            </span>
          </div>
          <button
            type="button"
            onClick={onStartChat}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-libertymd-blue-600 px-7 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] transition hover:bg-libertymd-blue-700"
          >
            {t('marketing.care.cta')} <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div className="relative px-1 py-4 sm:px-4 sm:py-8 [perspective:1100px]">
          <div
            ref={pricingCardRef}
            data-testid="libertymd-pricing-card"
            onPointerDown={handlePricingPointerMove}
            onPointerMove={handlePricingPointerMove}
            onPointerUp={(event) => resetPricingCard(event.currentTarget)}
            onPointerLeave={(event) => {
              resetPricingCard(event.currentTarget);
            }}
            onPointerCancel={(event) => resetPricingCard(event.currentTarget)}
            onTouchStart={handlePricingTouch}
            onTouchMove={handlePricingTouch}
            onTouchEnd={(event) => resetPricingCard(event.currentTarget)}
            onTouchCancel={(event) => resetPricingCard(event.currentTarget)}
            style={pricingCardStyle}
            className="libertymd-pricing-card relative isolate touch-pan-y select-none overflow-hidden rounded-[28px] border border-white/90 bg-white p-4 text-center will-change-transform sm:rounded-[34px] sm:p-9"
          >
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 bg-[linear-gradient(115deg,transparent_0%,transparent_24%,rgba(255,154,209,0.24)_35%,rgba(128,208,255,0.24)_45%,rgba(255,228,153,0.22)_55%,rgba(216,180,254,0.24)_65%,transparent_76%,transparent_100%)] bg-[length:300%_300%] transition-opacity duration-500"
              style={{
                backgroundPosition: 'var(--pricing-holo-x) var(--pricing-holo-y)',
                opacity: 'var(--pricing-holo-opacity)',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-500"
              style={{
                background:
                  'radial-gradient(circle at var(--pricing-glare-x) var(--pricing-glare-y), rgba(255,255,255,0.92) 6%, rgba(255,255,255,0.42) 22%, transparent 52%)',
                opacity: 'var(--pricing-glare-opacity)',
              }}
            />
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 z-0 opacity-[0.13] mix-blend-multiply"
              style={{
                backgroundImage:
                  'url("data:image/svg+xml,%3Csvg viewBox=%270 0 180 180%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cfilter id=%27n%27%3E%3CfeTurbulence type=%27fractalNoise%27 baseFrequency=%270.9%27 numOctaves=%274%27 stitchTiles=%27stitch%27/%3E%3C/filter%3E%3Crect width=%27100%25%27 height=%27100%25%27 filter=%27url(%23n)%27 opacity=%270.35%27/%3E%3C/svg%3E")',
              }}
            />

            <div className="relative z-10" style={{ transform: reduceMotion ? undefined : 'translateZ(18px)' }}>
              <div className="flex items-center justify-center gap-2 font-serif text-2xl font-semibold text-libertymd-ink">
                <Sparkles className="h-5 w-5 text-libertymd-blue-600" /> LibertyMD
              </div>
              <div className="mt-8 space-y-5">
                {rows.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs sm:gap-3 sm:text-sm xl:text-base">
                    <div className="flex min-w-0 items-center gap-2 text-left sm:gap-3">
                      <span className="shrink-0 whitespace-nowrap font-bold text-libertymd-slate-700">{label}</span>
                      <span className="mb-1 min-w-3 flex-1 border-b-2 border-dotted border-libertymd-slate-400/70 sm:min-w-5" />
                    </div>
                    <span className="whitespace-nowrap text-right font-black uppercase text-libertymd-blue-600">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-libertymd-slate-300/70 pt-6 text-sm font-bold text-libertymd-slate-500 sm:flex-row">
                <span className="inline-flex items-center gap-2"><CircleDollarSign className="h-5 w-5" /> FSA + HSA accepted</span>
                <span className="inline-flex items-center gap-2 text-libertymd-blue-600"><Check className="h-5 w-5" /> No subscription required</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** P3-03 — rail removed (named likeness invent; empty permission inventory). */
export function LibertyMDPatientStoriesSection() {
  return null;
}

export function LibertyMDHealthLibrarySection() {
  const { t } = useI18n();
  const articles = healthArticles.map((a, i) => ({
    ...a,
    category: t(`marketing.library.items.${i}.category`),
    title: t(`marketing.library.items.${i}.title`),
    description: t(`marketing.library.items.${i}.description`),
  }));
  return (
    <section className="libertymd-page-gutter libertymd-section-spacing border-t border-libertymd-green-sage bg-white text-center">
      <div className="libertymd-content-shell flex flex-col items-center gap-5 border-b border-libertymd-green-sage pb-8">
        <div className="text-center">
          <p className="text-xs font-bold uppercase text-libertymd-blue-600">{t('marketing.library.kicker')}</p>
          <h2 className="mt-3 font-serif text-4xl font-semibold text-libertymd-ink sm:text-5xl">{t('marketing.library.title')}</h2>
        </div>
        <button type="button" className="inline-flex items-center gap-2 text-sm font-bold text-libertymd-blue-600 hover:text-libertymd-ink">
          {t('marketing.library.explore')} <BookOpen className="h-4 w-4" />
        </button>
      </div>

      <div className="libertymd-content-shell mt-10 grid gap-[clamp(2rem,3.5vw,4rem)] md:grid-cols-3">
        {articles.map((article) => (
          <article key={article.title} className="group text-center">
            <div className="aspect-[4/3] overflow-hidden rounded-lg bg-libertymd-slate-200">
              <img src={article.image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase text-libertymd-blue-600">{article.category}</p>
            <h3 className="mt-3 text-xl font-black leading-snug text-libertymd-ink">{article.title}</h3>
            <p className="mt-3 text-sm leading-7 text-libertymd-slate-muted">{article.description}</p>
            <button type="button" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-libertymd-blue-600 group-hover:text-libertymd-ink">
              {t('marketing.library.read')} <ArrowRight className="h-4 w-4" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
