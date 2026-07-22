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
  Quote,
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

const patientStories = [
  {
    category: 'Preparing for a visit',
    title: 'I arrived knowing what to explain.',
    quote: 'LibertyMD organized the timeline and warning signs, so my appointment started with the details that mattered.',
    name: 'Jordan, 34',
    image: homepagePhoto('photo-1534528741775-53994a69daeb'),
    format: 'portrait',
  },
  {
    category: 'Finding peace of mind',
    title: 'The next step finally felt clear.',
    quote: 'The conversation separated what I could monitor at home from the symptoms that would need urgent care.',
    name: 'Marcus, 41',
    image: homepagePhoto('photo-1506794778202-cad84cf45f1d'),
    format: 'quote',
  },
  {
    category: 'Understanding symptoms',
    title: 'I had better questions for my doctor.',
    quote: 'Instead of searching through dozens of pages, I left with a concise report and a focused list of questions.',
    name: 'Ana, 29',
    image: homepagePhoto('photo-1544005313-94ddf0286df2'),
    format: 'portrait',
  },
  {
    category: 'Recognizing urgency',
    title: 'It made the warning signs easy to understand.',
    quote: 'The safety questions were calm and direct. I understood why same-day care mattered and what to tell the clinician.',
    name: 'Priya, 38',
    image: homepagePhoto('photo-1488426862026-3ee34a7d66df'),
    format: 'quote',
  },
  {
    category: 'Following up',
    title: 'I could pick up without starting over.',
    quote: 'My timeline, medications, and next steps stayed together, which made the follow-up conversation much less scattered.',
    name: 'Daniel, 46',
    image: homepagePhoto('photo-1519345182560-3f2917c472ef'),
    format: 'portrait',
  },
  {
    category: 'Managing a fever',
    title: 'I knew what to watch overnight.',
    quote: 'The plan gave me practical checkpoints for hydration, temperature, and the changes that would mean getting help.',
    name: 'Leah, 32',
    image: homepagePhoto('photo-1508214751196-bcfd4ca60f91'),
    format: 'quote',
  },
  {
    category: 'Medication questions',
    title: 'The conversation made my options simpler.',
    quote: 'I could explain what I had already tried and understand which questions to take to my pharmacist and doctor.',
    name: 'Ethan, 52',
    image: homepagePhoto('photo-1519085360753-af0119f7cbe7'),
    format: 'portrait',
  },
  {
    category: 'After an injury',
    title: 'I stopped guessing about the swelling.',
    quote: 'LibertyMD helped me describe the injury clearly and understand when an examination or imaging could be appropriate.',
    name: 'Noah, 27',
    image: homepagePhoto('photo-1527980965255-d3b416303d12'),
    format: 'quote',
  },
  {
    category: 'Caring for family',
    title: 'I felt calmer making the decision.',
    quote: 'The questions helped me organize what had changed and decide what kind of care my mother needed next.',
    name: 'Maya, 44',
    image: homepagePhoto('photo-1531123897727-8f129e1688ce'),
    format: 'portrait',
  },
  {
    category: 'Recurring symptoms',
    title: 'The pattern finally became visible.',
    quote: 'Seeing the timing and triggers together gave me a much better starting point for a longer-term conversation.',
    name: 'Sofia, 36',
    image: homepagePhoto('photo-1524504388940-b1c1722653e1'),
    format: 'quote',
  },
  {
    category: 'Getting a second view',
    title: 'I could think before choosing the next step.',
    quote: 'The summary gave me language for my concerns without making the situation feel more frightening than it was.',
    name: 'James, 58',
    image: homepagePhoto('photo-1501196354995-cbb51c65aaea'),
    format: 'portrait',
  },
  {
    category: 'Preparing for follow-up',
    title: 'Nothing important slipped through the cracks.',
    quote: 'I had one place for the symptom changes, questions, and next steps I wanted to cover at my follow-up.',
    name: 'Amir, 40',
    image: homepagePhoto('photo-1535713875002-d1d0cf377fde'),
    format: 'quote',
  },
];

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
      className="libertymd-page-gutter libertymd-section-spacing relative overflow-hidden border-t border-[#E6EDE3] bg-[#F1F8F1]"
    >
      <div className="libertymd-shell grid items-center gap-[var(--libertymd-layout-gap)] lg:min-h-[720px] lg:grid-cols-[minmax(17rem,0.72fr)_minmax(34rem,1.28fr)]">
        <div className="mx-auto max-w-xl text-center lg:mx-0 lg:text-left">
          <p className="text-xs font-bold uppercase text-[#2563EB]">{t('marketing.care.kicker')}</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-serif text-4xl font-semibold leading-tight text-[#111827] sm:text-5xl lg:mx-0">
            {t('marketing.care.title')}
          </h2>
          <p className="mt-7 text-lg font-bold leading-8 text-[#111827] sm:text-xl">
            {t('marketing.care.aiLine')}<br />
            <span className="text-[#2563EB]">{t('marketing.care.doctorsHighlight')}</span> {t('marketing.care.doctorsRest')}
          </p>
          <p className="mx-auto mt-7 max-w-lg border-t border-dashed border-[#B9C9B5] pt-7 text-sm leading-7 text-[#5B6472] sm:text-base lg:mx-0">
            {t('marketing.care.body')}
          </p>
          <p className="mt-7 text-sm font-semibold text-[#475569] sm:text-base">
            {t('marketing.care.priceLead')} <span className="font-black text-[#2563EB]">{t('marketing.care.price')}</span>
          </p>
          <button
            type="button"
            onClick={onStartChat}
            className="mt-7 inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-6 py-3 text-sm font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] transition hover:bg-[#1D4ED8]"
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
              className="h-full w-full overflow-hidden rounded-[42px] border-[9px] border-[#111827] bg-[#111827] shadow-[0_34px_90px_rgba(15,23,42,0.24)] sm:rounded-[50px] sm:border-[11px]"
            >
              <div className="relative h-full w-full overflow-hidden rounded-[31px] bg-[#E8EEF3] sm:rounded-[38px]">
                <img src={phoneImages.doctor} alt="LibertyMD physician on a video visit" className="h-full w-full object-cover object-center" />
                <div className="absolute left-1/2 top-3 h-6 w-20 -translate-x-1/2 rounded-full bg-[#050505] sm:h-7 sm:w-24" />
                <div className="absolute inset-x-3 top-12 rounded-lg bg-[#111827]/70 px-3 py-2 text-left text-[10px] font-semibold text-white backdrop-blur-md sm:top-14 sm:text-xs">
                  <span className="block">{t('marketing.care.drName')}</span>
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
            className="absolute -top-8 left-[1%] z-20 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[#E5FFB8] px-4 py-2 text-xs font-bold text-[#111827] shadow-sm sm:left-[7%] sm:top-[6%] sm:px-5 sm:text-sm lg:left-[2%] lg:top-[16%]"
          >
            <CalendarClock className="h-4 w-4" /> ASAP or schedule ahead
          </motion.div>
          <motion.div
            style={revealedPillStyle || { opacity: pillOpacity, y: pillY }}
            className="absolute right-0 top-[48%] z-20 inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[#E5FFB8] px-4 py-2 text-xs font-bold text-[#111827] shadow-sm sm:right-[1%] sm:px-5 sm:text-sm"
          >
            <HeartPulse className="h-4 w-4" /> Doctors who know the context
          </motion.div>
          <div className="absolute inset-x-0 bottom-[1%] z-20 flex justify-center lg:justify-start lg:pl-[22%]">
            <motion.div
              style={revealedPillStyle || { opacity: pillOpacity, y: pillY }}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-full bg-[#E5FFB8] px-4 py-2 text-xs font-bold text-[#111827] shadow-sm sm:px-5 sm:text-sm"
            >
              <Clock3 className="h-4 w-4" /> Available 24/7
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
  const rows = [
    ['Private AI care chat', 'Free'],
    ['Urgency and red-flag screening', 'Free'],
    ['Doctor-ready health report', 'Free'],
    ['Unlimited follow-up questions', 'Free'],
    ['Prescription support', 'From $0'],
    ['Video visit with a physician', '$39 / visit'],
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
    <section className="libertymd-page-gutter libertymd-section-spacing border-t border-[#E6EDE3] bg-[#FBFCF8] text-center">
      <div className="libertymd-content-shell grid items-center gap-[var(--libertymd-layout-gap)] lg:grid-cols-[minmax(19rem,0.74fr)_minmax(32rem,1.26fr)]">
        <div>
          <p className="text-xs font-bold uppercase text-[#2563EB]">{t('marketing.pricing.kicker')}</p>
          <h2 className="mx-auto mt-3 max-w-lg font-serif text-4xl font-semibold leading-tight text-[#111827] sm:text-5xl">
            {t('marketing.pricing.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-md text-sm leading-7 text-[#5B6472] sm:text-base">
            {t('marketing.pricing.body')}
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3 text-sm font-bold text-[#111827]">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#E8EEF3] px-4 py-2">
              <Globe2 className="h-4 w-4" /> {t('marketing.pricing.nationwide')}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full bg-[#E8EEF3] px-4 py-2">
              <ShieldCheck className="h-4 w-4" /> {t('marketing.pricing.insurance')}
            </span>
          </div>
          <button
            type="button"
            onClick={onStartChat}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#2563EB] px-7 py-3.5 text-sm font-bold text-white shadow-[0_12px_28px_rgba(37,99,235,0.28)] transition hover:bg-[#1D4ED8]"
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
            className="libertymd-pricing-card relative isolate touch-pan-y select-none overflow-hidden rounded-[28px] border border-white/90 bg-[#FDFDF7] p-4 text-center will-change-transform sm:rounded-[34px] sm:p-9"
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
              <div className="flex items-center justify-center gap-2 font-serif text-2xl font-semibold text-[#111827]">
                <Sparkles className="h-5 w-5 text-[#2563EB]" /> LibertyMD
              </div>
              <div className="mt-8 space-y-5">
                {rows.map(([label, value]) => (
                  <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-xs sm:gap-3 sm:text-sm xl:text-base">
                    <div className="flex min-w-0 items-center gap-2 text-left sm:gap-3">
                      <span className="shrink-0 whitespace-nowrap font-bold text-[#334155]">{label}</span>
                      <span className="mb-1 min-w-3 flex-1 border-b-2 border-dotted border-[#94A3B8]/70 sm:min-w-5" />
                    </div>
                    <span className="whitespace-nowrap text-right font-black uppercase text-[#2563EB]">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-[#CBD5E1]/70 pt-6 text-sm font-bold text-[#64748B] sm:flex-row">
                <span className="inline-flex items-center gap-2"><CircleDollarSign className="h-5 w-5" /> FSA + HSA accepted</span>
                <span className="inline-flex items-center gap-2 text-[#2563EB]"><Check className="h-5 w-5" /> No subscription required</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function LibertyMDPatientStoriesSection() {
  const { t } = useI18n();
  const stories = patientStories.map((story, i) => ({
    ...story,
    category: t(`marketing.stories.items.${i}.category`),
    title: t(`marketing.stories.items.${i}.title`),
    quote: t(`marketing.stories.items.${i}.quote`),
  }));
  const [activeStory, setActiveStory] = useState(0);
  const [isInteracting, setIsInteracting] = useState(false);
  const railRef = useRef<HTMLDivElement | null>(null);
  const storyRefs = useRef<(HTMLElement | null)[]>([]);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const mostVisible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (mostVisible?.target instanceof HTMLElement) {
          setActiveStory(Number(mostVisible.target.dataset.storyIndex));
        }
      },
      { root: rail, threshold: [0.45, 0.7, 0.9] }
    );

    storyRefs.current.forEach((card) => card && observer.observe(card));
    return () => observer.disconnect();
  }, []);

  const goToStory = (index: number, behavior: ScrollBehavior = 'smooth') => {
    const nextIndex = (index + patientStories.length) % patientStories.length;
    const rail = railRef.current;
    const card = storyRefs.current[nextIndex];

    setActiveStory(nextIndex);
    if (rail && card) {
      const railRect = rail.getBoundingClientRect();
      const cardRect = card.getBoundingClientRect();
      rail.scrollTo({
        left: rail.scrollLeft + cardRect.left - railRect.left - (rail.clientWidth - cardRect.width) / 2,
        behavior,
      });
    }
  };

  useEffect(() => {
    if (isInteracting || reduceMotion) return;

    const timer = window.setTimeout(() => {
      const wrapsToStart = activeStory === patientStories.length - 1;
      goToStory(activeStory + 1, wrapsToStart ? 'auto' : 'smooth');
    }, 2000);

    return () => window.clearTimeout(timer);
  }, [activeStory, isInteracting, reduceMotion]);

  return (
    <section className="libertymd-section-spacing overflow-hidden border-t border-[#DCE8F4] bg-[#F5F9FD] text-center">
      <div className="libertymd-page-gutter libertymd-content-shell">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-bold uppercase text-[#2563EB]">{t('marketing.stories.kicker')}</p>
          <h2 className="mx-auto mt-3 max-w-2xl font-serif text-4xl font-semibold leading-tight text-[#111827] sm:text-5xl">
            {t('marketing.stories.title')}
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-[#5B6472] sm:text-base">
            {t('marketing.stories.body')}
          </p>
        </div>
      </div>

      <div
        ref={railRef}
        aria-label="Sample LibertyMD patient stories"
        onMouseEnter={() => setIsInteracting(true)}
        onMouseLeave={() => setIsInteracting(false)}
        onFocusCapture={() => setIsInteracting(true)}
        onBlurCapture={() => setIsInteracting(false)}
        onPointerDown={() => setIsInteracting(true)}
        onPointerUp={() => setIsInteracting(false)}
        onPointerCancel={() => setIsInteracting(false)}
        className="libertymd-story-rail mt-10 flex snap-x snap-proximity gap-4 overflow-x-auto px-[var(--libertymd-page-gutter)] pb-4 text-left sm:mt-12 sm:gap-5"
      >
        {stories.map((story, index) => {
          const isQuoteCard = story.format === 'quote';

          return (
            <article
              key={story.name}
              ref={(node) => { storyRefs.current[index] = node; }}
              data-story-index={index}
              aria-label={`${story.name}: ${story.title}`}
              className="relative aspect-[3/5] w-[76vw] max-w-[19rem] shrink-0 snap-center overflow-hidden rounded-xl bg-[#0B2E63] shadow-[0_22px_55px_rgba(15,46,84,0.14)] sm:w-[19rem]"
            >
              {isQuoteCard ? (
                <>
                  <div className="absolute inset-0 bg-[#0B2E63]" />
                  <img
                    src="/images/libertymd-logo-mark.svg"
                    alt=""
                    aria-hidden="true"
                    className="absolute -bottom-8 -right-10 w-64 opacity-[0.07]"
                  />
                  <div className="absolute inset-x-0 top-0 h-px bg-[#62D9CE]/70" />
                  <div className="relative flex h-full flex-col p-7 sm:p-8">
                    <div className="flex items-center justify-between gap-4">
                      <img
                        src={story.image}
                        alt=""
                        className="h-16 w-16 rounded-full border-2 border-white/80 object-cover shadow-lg"
                      />
                      <Quote className="h-8 w-8 text-[#62D9CE]" aria-hidden="true" />
                    </div>
                    <blockquote className="mt-7 text-lg font-semibold leading-[1.5] text-white sm:text-xl">
                      “{story.quote}”
                    </blockquote>
                    <div className="mt-auto pt-8">
                      <p className="font-serif text-2xl font-semibold text-white">{story.name}</p>
                      <p className="mt-2 text-xs font-bold uppercase text-[#9FE8E1]">{story.category}</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <img src={story.image} alt="" className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-b from-[#071B36]/5 via-[#071B36]/10 to-[#071B36]/95" />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between p-5 sm:p-6">
                    <span className="rounded-full border border-white/40 bg-[#071B36]/35 px-3 py-1.5 text-[11px] font-bold uppercase text-white backdrop-blur-md">
                      Patient story
                    </span>
                    <span className="h-2 w-2 rounded-full bg-[#62D9CE] shadow-[0_0_0_5px_rgba(98,217,206,0.18)]" />
                  </div>
                  <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
                    <p className="text-xs font-bold uppercase text-[#9FE8E1]">{story.category}</p>
                    <h3 className="mt-3 font-serif text-3xl font-semibold leading-tight text-white">{story.title}</h3>
                    <p className="mt-5 text-sm font-black text-white/90">{story.name}</p>
                  </div>
                </>
              )}
            </article>
          );
        })}
      </div>

      <p className="libertymd-page-gutter mt-5 text-center text-xs leading-5 text-[#718096]">
        Illustrative stories and imagery. Individual experiences and outcomes vary.
      </p>
    </section>
  );
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
    <section className="libertymd-page-gutter libertymd-section-spacing border-t border-[#E6EDE3] bg-white text-center">
      <div className="libertymd-content-shell flex flex-col items-center gap-5 border-b border-[#DDE7D8] pb-8">
        <div className="text-center">
          <p className="text-xs font-bold uppercase text-[#2563EB]">{t('marketing.library.kicker')}</p>
          <h2 className="mt-3 font-serif text-4xl font-semibold text-[#111827] sm:text-5xl">{t('marketing.library.title')}</h2>
        </div>
        <button type="button" className="inline-flex items-center gap-2 text-sm font-bold text-[#2563EB] hover:text-[#111827]">
          {t('marketing.library.explore')} <BookOpen className="h-4 w-4" />
        </button>
      </div>

      <div className="libertymd-content-shell mt-10 grid gap-[clamp(2rem,3.5vw,4rem)] md:grid-cols-3">
        {articles.map((article) => (
          <article key={article.title} className="group text-center">
            <div className="aspect-[4/3] overflow-hidden rounded-lg bg-[#E8EEF3]">
              <img src={article.image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
            </div>
            <p className="mt-5 text-xs font-bold uppercase text-[#2563EB]">{article.category}</p>
            <h3 className="mt-3 text-xl font-black leading-snug text-[#111827]">{article.title}</h3>
            <p className="mt-3 text-sm leading-7 text-[#5B6472]">{article.description}</p>
            <button type="button" className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-[#2563EB] group-hover:text-[#111827]">
              {t('marketing.library.read')} <ArrowRight className="h-4 w-4" />
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
