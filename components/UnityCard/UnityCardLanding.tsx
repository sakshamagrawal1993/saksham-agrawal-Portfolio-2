import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ExternalLink } from 'lucide-react';

// ─── Inline SVG icons matching the Figma design style ─────────────────────────

const IconZeroFee = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <text x="20" y="26" textAnchor="middle" fontSize="18" fill="#F57C00">₹</text>
    <circle cx="30" cy="10" r="7" fill="#F57C00" />
    <text x="30" y="14" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">0</text>
  </svg>
);

const IconAnnualCharge = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <rect x="8" y="12" width="24" height="18" rx="3" stroke="#F57C00" strokeWidth="2" fill="none"/>
    <line x1="8" y1="18" x2="32" y2="18" stroke="#F57C00" strokeWidth="2"/>
    <circle cx="30" cy="10" r="7" fill="#F57C00" />
    <text x="30" y="14" textAnchor="middle" fontSize="10" fontWeight="bold" fill="white">0</text>
  </svg>
);

const IconShop = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <path d="M10 16h20l-2 14H12L10 16z" stroke="#F57C00" strokeWidth="2" fill="none" strokeLinejoin="round"/>
    <path d="M15 16v-3a5 5 0 0110 0v3" stroke="#F57C00" strokeWidth="2" strokeLinecap="round"/>
  </svg>
);

const IconCalendar = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <rect x="8" y="12" width="24" height="20" rx="3" stroke="#F57C00" strokeWidth="2" fill="none"/>
    <line x1="8" y1="18" x2="32" y2="18" stroke="#F57C00" strokeWidth="2"/>
    <line x1="15" y1="8" x2="15" y2="16" stroke="#F57C00" strokeWidth="2" strokeLinecap="round"/>
    <line x1="25" y1="8" x2="25" y2="16" stroke="#F57C00" strokeWidth="2" strokeLinecap="round"/>
    <circle cx="20" cy="26" r="3" fill="#F57C00" />
  </svg>
);

const IconZeroProcess = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <path d="M12 20h16M12 20l4-4M12 20l4 4" stroke="#F57C00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="30" cy="14" r="6" fill="#F57C00" />
    <text x="30" y="18" textAnchor="middle" fontSize="9" fontWeight="bold" fill="white">0%</text>
  </svg>
);

const IconPercent = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <text x="20" y="26" textAnchor="middle" fontSize="20" fontWeight="bold" fill="#F57C00">%</text>
  </svg>
);

const IconCoin = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <circle cx="18" cy="20" r="9" stroke="#F57C00" strokeWidth="2" fill="none"/>
    <text x="18" y="24" textAnchor="middle" fontSize="10" fontWeight="bold" fill="#F57C00">₹</text>
    <circle cx="30" cy="14" r="5" fill="#4CAF50" />
    <text x="30" y="18" textAnchor="middle" fontSize="8" fontWeight="bold" fill="white">↑</text>
  </svg>
);

const IconUnlimited = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <path d="M8 20c0-4 3-7 6-7s6 7 10 7 6-3 6-7" stroke="#F57C00" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
    <path d="M8 20c0 4 3 7 6 7s6-7 10-7 6 3 6 7" stroke="#F57C00" strokeWidth="2.5" strokeLinecap="round" fill="none"/>
  </svg>
);

const IconRedeem = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <path d="M10 28l6-8 5 4 5-7 4 5" stroke="#F57C00" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
    <circle cx="10" cy="28" r="2.5" fill="#F57C00"/>
    <circle cx="30" cy="22" r="2.5" fill="#F57C00"/>
  </svg>
);

const IconLounge = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <path d="M8 28h24M10 28V18a2 2 0 012-2h16a2 2 0 012 2v10" stroke="#F57C00" strokeWidth="2" fill="none"/>
    <rect x="14" y="22" width="4" height="6" rx="1" stroke="#F57C00" strokeWidth="1.5" fill="none"/>
    <rect x="22" y="22" width="4" height="6" rx="1" stroke="#F57C00" strokeWidth="1.5" fill="none"/>
    <path d="M16 16v-2M20 16v-3M24 16v-2" stroke="#F57C00" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconVisits = () => (
  <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
    <rect width="40" height="40" rx="10" fill="#FFF3E0" />
    <circle cx="20" cy="16" r="5" stroke="#F57C00" strokeWidth="2" fill="none"/>
    <path d="M10 32c0-6 4-9 10-9s10 3 10 9" stroke="#F57C00" strokeWidth="2" fill="none" strokeLinecap="round"/>
    <path d="M25 22l2 3 4-4" stroke="#4CAF50" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// ─── Highlight Card Component ─────────────────────────────────────────────────

function HighlightCard({
  title,
  items,
  link,
  linkLabel,
}: {
  title: string;
  items: { icon: React.ReactNode; label: string }[];
  link?: boolean;
  linkLabel?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4"
    >
      <div className="px-5 py-4 border-b border-gray-100">
        <h3 className="text-center text-[17px] font-black text-[#1A1A1A]">{title}</h3>
      </div>
      <div className="flex items-start divide-x divide-gray-100 px-2 py-4">
        {items.map((item, i) => (
          <div key={i} className="flex flex-col items-center text-center flex-1 px-2 gap-2">
            {item.icon}
            <p className="text-[11px] font-semibold text-gray-500 leading-tight">{item.label}</p>
          </div>
        ))}
      </div>
      {link && (
        <div className="px-5 pb-4 text-center">
          <button className="text-[#F57C00] text-xs font-semibold underline underline-offset-2 flex items-center gap-1 mx-auto">
            {linkLabel} <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function UnityCardLanding() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-[#F5F5F5] font-sans pb-28">

      {/* ── Dark Gradient Hero Header ── */}
      <div className="relative pb-14 pt-6 px-5 overflow-hidden" style={{background: 'linear-gradient(160deg, #1A0A00 0%, #3D1200 35%, #7A2800 65%, #C84800 100%)'}}>

        {/* Ambient background particles */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {/* Large blurred orbs */}
          <div className="absolute -top-10 -right-10 w-56 h-56 bg-orange-500/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 -left-10 w-40 h-40 bg-amber-400/15 rounded-full blur-2xl" />
          <div className="absolute bottom-0 right-1/4 w-32 h-32 bg-red-600/20 rounded-full blur-2xl" />
          {/* Star dots */}
          {[
            {top:'12%',left:'8%',size:'2px',opacity:'0.6'},
            {top:'25%',left:'85%',size:'3px',opacity:'0.5'},
            {top:'55%',left:'12%',size:'2px',opacity:'0.4'},
            {top:'70%',left:'78%',size:'2px',opacity:'0.6'},
            {top:'40%',left:'55%',size:'1.5px',opacity:'0.5'},
            {top:'18%',left:'45%',size:'2px',opacity:'0.4'},
            {top:'80%',left:'30%',size:'3px',opacity:'0.3'},
          ].map((star, i) => (
            <motion.div
              key={i}
              animate={{ opacity: [parseFloat(star.opacity), parseFloat(star.opacity)*0.2, parseFloat(star.opacity)] }}
              transition={{ duration: 2 + i * 0.4, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute rounded-full bg-white"
              style={{ top: star.top, left: star.left, width: star.size, height: star.size }}
            />
          ))}
          {/* Diagonal light ray */}
          <div className="absolute top-0 right-10 w-px h-full bg-gradient-to-b from-orange-400/0 via-orange-300/10 to-orange-400/0" style={{transform:'rotate(15deg)', transformOrigin:'top'}} />
        </div>

        {/* Back button */}
        <button
          onClick={() => navigate('/')}
          className="absolute left-4 top-6 w-9 h-9 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center text-white border border-white/20 z-10"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {/* Brand logos */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-3 mb-4 relative z-10"
        >
          <span className="text-white font-black text-sm tracking-widest flex items-center gap-1.5">
            <svg viewBox="0 0 20 20" className="w-4 h-4 fill-orange-400"><polygon points="10,2 18,18 2,18"/></svg>
            UNITY
          </span>
          <span className="text-white/30 text-sm">|</span>
          <span className="text-orange-300 font-bold text-sm">BharatPe</span>
        </motion.div>

        {/* Title */}
        <motion.div
          initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="text-center mb-8 relative z-10"
        >
          <h1 className="text-white text-3xl font-black leading-tight tracking-tight">EMI Credit Card</h1>
          <p className="text-orange-300/80 text-sm font-medium mt-1.5">Flex your finances like a pro</p>
        </motion.div>

        {/* ── Exciting Card on Pedestal ── */}
        <div className="relative flex flex-col items-center z-10">
          {/* Glow halo behind card */}
          <motion.div
            animate={{ scale: [1, 1.08, 1], opacity: [0.5, 0.8, 0.5] }}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
            className="absolute top-4 w-[180px] h-[110px] rounded-2xl bg-orange-500/30 blur-2xl"
          />
          <div className="absolute top-4 w-[140px] h-[80px] rounded-2xl bg-amber-400/20 blur-xl" />

          {/* Floating Card */}
          <motion.div
            animate={{ y: [-8, 8, -8], rotate: [-1, 1, -1] }}
            transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
            className="relative z-10 w-[230px]"
          >
            {/* Card body — premium dark glassmorphism */}
            <div className="w-full aspect-[1.586/1] rounded-[20px] relative overflow-hidden shadow-[0_25px_60px_rgba(0,0,0,0.7)] border border-white/15"
              style={{background: 'linear-gradient(135deg, #0D0D1A 0%, #1A1040 40%, #2A0A30 70%, #1A0A00 100%)'}}>
              
              {/* Holographic sheen sweep */}
              <motion.div
                animate={{ x: ['-100%', '200%'] }}
                transition={{ duration: 3, repeat: Infinity, repeatDelay: 2, ease: 'easeInOut' }}
                className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/12 to-transparent skew-x-12"
              />

              {/* Top gradient accent */}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-orange-400/60 to-transparent" />
              
              {/* Glowing circle decoration */}
              <div className="absolute -top-8 -right-8 w-28 h-28 rounded-full border border-orange-400/20" />
              <div className="absolute -top-4 -right-4 w-16 h-16 rounded-full bg-orange-500/10 blur-md" />
              <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-purple-900/30 to-transparent" />

              {/* Chip */}
              <div className="absolute top-[22px] left-[16px] w-9 h-7 rounded-[4px] overflow-hidden shadow-md"
                style={{background:'linear-gradient(135deg,#d4a017,#f5c842,#b8860b)'}}>
                <div className="absolute inset-x-0 top-1/2 h-px bg-black/30" />
                <div className="absolute inset-y-0 left-1/3 w-px bg-black/20" />
                <div className="absolute inset-y-0 right-1/3 w-px bg-black/20" />
              </div>

              {/* Contactless wave icon */}
              <div className="absolute top-[22px] right-[14px] text-white/50 text-[10px]">
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12.55a11 11 0 0 1 14.08 0" strokeLinecap="round"/>
                  <path d="M1.42 9a16 16 0 0 1 21.16 0" strokeLinecap="round"/>
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" strokeLinecap="round"/>
                  <circle cx="12" cy="20" r="1" fill="currentColor"/>
                </svg>
              </div>

              {/* Brand name — top left, below chip */}
              <div className="absolute top-[22px] left-[60px]">
                <div className="text-orange-400 font-black text-[11px] tracking-wider leading-tight">BharatPe</div>
                <div className="text-white/40 text-[8px] tracking-widest uppercase leading-tight">Unity Card</div>
              </div>

              {/* Card number — middle */}
              <div className="absolute top-1/2 left-[16px] -translate-y-1/2 text-white/40 text-[11px] font-mono tracking-[0.18em]">
                •••• •••• •••• 4321
              </div>

              {/* RuPay logo — bottom right */}
              <div className="absolute bottom-[12px] right-[14px] flex items-center gap-1">
                <div className="w-5 h-5 rounded-full bg-orange-500/80 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full bg-red-700/80" />
                </div>
                <span className="text-white/70 text-[9px] font-black">RuPay</span>
              </div>

              {/* Cardholder name — bottom left */}
              <div className="absolute bottom-[12px] left-[16px] text-white/40 text-[9px] tracking-wider uppercase font-medium">Dhruv Kumar</div>

              {/* Bottom glow line */}
              <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-orange-400/40 to-transparent" />
            </div>

            {/* Sparkle effects around card */}
            <motion.div
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0 }}
              className="absolute -top-2 -right-2 w-3 h-3"
            >
              <svg viewBox="0 0 12 12" fill="#FFA500"><path d="M6 0l1.5 4.5L12 6l-4.5 1.5L6 12 4.5 7.5 0 6l4.5-1.5z"/></svg>
            </motion.div>
            <motion.div
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2, repeat: Infinity, delay: 0.7 }}
              className="absolute -bottom-2 -left-2 w-2 h-2"
            >
              <svg viewBox="0 0 12 12" fill="#FFD700"><path d="M6 0l1.5 4.5L12 6l-4.5 1.5L6 12 4.5 7.5 0 6l4.5-1.5z"/></svg>
            </motion.div>
            <motion.div
              animate={{ scale: [0.8, 1.2, 0.8], opacity: [0.3, 0.9, 0.3] }}
              transition={{ duration: 1.8, repeat: Infinity, delay: 1.2 }}
              className="absolute top-1/2 -left-4 w-2 h-2"
            >
              <svg viewBox="0 0 12 12" fill="#FF8C00"><path d="M6 0l1.5 4.5L12 6l-4.5 1.5L6 12 4.5 7.5 0 6l4.5-1.5z"/></svg>
            </motion.div>
          </motion.div>

          {/* Pedestal platform */}
          <div className="relative -mt-1 z-0">
            <div className="w-[200px] h-[16px] rounded-full shadow-2xl" style={{background:'linear-gradient(180deg,#FF9A3C 0%,#C85A00 100%)'}} />
            <div className="w-[160px] h-[10px] rounded-full mx-auto opacity-70" style={{background:'linear-gradient(180deg,#B04A00 0%,#7A2E00 100%)'}} />
            <div className="w-[120px] h-[6px] rounded-full mx-auto opacity-40" style={{background:'#5A1E00'}} />
          </div>
        </div>
      </div>

      {/* ── Limit Text — animated glow banner ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
        className="relative text-center py-7 overflow-hidden border-b border-gray-100"
        style={{ background: 'linear-gradient(135deg, #fff8f0 0%, #ffffff 40%, #fff3e0 100%)' }}
      >
        {/* Animated glow orb */}
        <motion.div
          animate={{ scale: [1, 1.3, 1], opacity: [0.15, 0.35, 0.15] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="absolute inset-0 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(ellipse at 50% 50%, #FF8C00 0%, transparent 70%)' }}
        />
        <p className="relative text-[#F57C00] text-xs font-bold uppercase tracking-[0.2em] mb-1">Enjoy limit of up to</p>
        <motion.h2
          animate={{ textShadow: ['0 0 0px #FF8C00', '0 0 20px #FF8C0055', '0 0 0px #FF8C00'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          className="relative text-[42px] font-black text-[#1A1A1A] tracking-tighter leading-none"
        >₹3,00,000</motion.h2>
        {/* Subtle side lines */}
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-12 h-px bg-gradient-to-r from-transparent to-orange-300" />
        <div className="absolute right-0 top-1/2 -translate-y-1/2 w-12 h-px bg-gradient-to-l from-transparent to-orange-300" />
      </motion.div>

      {/* ── Highlights Section ── */}
      <div className="px-4 pt-6">
        {/* Section heading */}
        <div className="flex items-center gap-3 mb-5">
          <div className="h-[1px] bg-gray-300 flex-1" />
          <h2 className="text-gray-600 text-sm font-bold tracking-widest uppercase">Highlights</h2>
          <div className="h-[1px] bg-gray-300 flex-1" />
        </div>

        <HighlightCard
          title="Lifetime free"
          items={[
            { icon: <IconZeroFee />, label: "Zero joining fee" },
            { icon: <IconAnnualCharge />, label: "Zero annual charges" },
            { icon: <IconShop />, label: "Shop anytime anywhere" },
          ]}
        />

        <HighlightCard
          title="Spends on EMI"
          items={[
            { icon: <IconCalendar />, label: "Repay spends in 3–12 months" },
            { icon: <IconZeroProcess />, label: "No processing & foreclosure fee" },
            { icon: <IconPercent />, label: "Low interest of 2% per month" },
          ]}
          link
          linkLabel="See how EMI conversion works?"
        />

        <HighlightCard
          title="Limitless reward"
          items={[
            { icon: <IconCoin />, label: "Up to 2% cashback worth of Zillion coins" },
            { icon: <IconUnlimited />, label: "Uncapped rewards on all transactions" },
            { icon: <IconRedeem />, label: "Redeem coins on repayments (4 coins= ₹1)" },
          ]}
          link
          linkLabel="See how rewards works?"
        />
      </div>

      {/* ── Other Benefits Section ── */}
      <div className="mt-4">
        {/* Section heading on orange strip */}
        <div className="bg-gradient-to-r from-[#FF8C00]/10 via-[#FF8C00]/20 to-[#FF8C00]/10 py-3 px-4 flex items-center gap-3">
          <div className="h-[1px] bg-[#FF8C00]/40 flex-1" />
          <h2 className="text-[#F57C00] text-sm font-black tracking-widest uppercase">Other benefits</h2>
          <div className="h-[1px] bg-[#FF8C00]/40 flex-1" />
        </div>

        {/* Lounge access card */}
        <div className="px-4 mt-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mb-4"
          >
            <div className="px-5 py-4 border-b border-gray-100">
              <h3 className="text-[16px] font-black text-[#1A1A1A]">Complimentary Lounge Access</h3>
            </div>
            <div className="px-5 py-4 space-y-4">
              {/* Armchair icon — dark fill matching Figma */}
              <div className="flex items-start gap-4">
                <svg viewBox="0 0 44 44" className="w-10 h-10 shrink-0" fill="none">
                  <rect width="44" height="44" rx="10" fill="#F0F0F0"/>
                  <path d="M9 28h26v4H9z" fill="#2C2C2E" rx="2"/>
                  <path d="M11 20c0-2 1.5-3 3.5-3h15c2 0 3.5 1 3.5 3v8H11v-8z" fill="#2C2C2E"/>
                  <rect x="6" y="22" width="5" height="10" rx="2" fill="#2C2C2E"/>
                  <rect x="33" y="22" width="5" height="10" rx="2" fill="#2C2C2E"/>
                  <path d="M15 24h14v4H15z" fill="#3C3C3E"/>
                  <rect x="12" y="32" width="3" height="4" rx="1" fill="#2C2C2E"/>
                  <rect x="29" y="32" width="3" height="4" rx="1" fill="#2C2C2E"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-gray-700">Complimentary visits under RuPay Common Lounge Access Program</p>
                </div>
              </div>
              {/* Calendar+check icon — dark fill matching Figma */}
              <div className="flex items-start gap-4">
                <svg viewBox="0 0 44 44" className="w-10 h-10 shrink-0" fill="none">
                  <rect width="44" height="44" rx="10" fill="#F0F0F0"/>
                  <rect x="7" y="12" width="24" height="22" rx="3" fill="#2C2C2E"/>
                  <rect x="7" y="12" width="24" height="7" rx="3" fill="#1A1A1A"/>
                  <line x1="14" y1="8" x2="14" y2="15" stroke="#555" strokeWidth="2.5" strokeLinecap="round"/>
                  <line x1="22" y1="8" x2="22" y2="15" stroke="#555" strokeWidth="2.5" strokeLinecap="round"/>
                  <circle cx="13" cy="23" r="1.5" fill="white" opacity="0.6"/>
                  <circle cx="19" cy="23" r="1.5" fill="white" opacity="0.6"/>
                  <circle cx="13" cy="29" r="1.5" fill="white" opacity="0.6"/>
                  <circle cx="19" cy="29" r="1.5" fill="white" opacity="0.6"/>
                  <circle cx="34" cy="30" r="8" fill="#22C55E"/>
                  <path d="M30 30l3 3 5-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <div>
                  <p className="text-sm font-semibold text-gray-700">2 visits/quarter at domestic lounges</p>
                  <p className="text-sm font-semibold text-gray-700">2 visits/year at international lounges</p>
                </div>
              </div>
              {/* Wallet+arrow icon — dark fill matching Figma */}
              <div className="flex items-start gap-4">
                <svg viewBox="0 0 44 44" className="w-10 h-10 shrink-0" fill="none">
                  <rect width="44" height="44" rx="10" fill="#F0F0F0"/>
                  <rect x="7" y="18" width="28" height="18" rx="3" fill="#2C2C2E"/>
                  <path d="M7 24h28" stroke="#3C3C3E" strokeWidth="1.5"/>
                  <path d="M7 20l22-6" stroke="#3C3C3E" strokeWidth="2" strokeLinecap="round"/>
                  <circle cx="29" cy="27" r="3" fill="#3C3C3E"/>
                  <circle cx="36" cy="14" r="7" fill="#F57C00"/>
                  <path d="M36 18v-6M33 15l3-3 3 3" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                <p className="text-sm font-semibold text-gray-700 pt-1">No minimum spends required</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ── Fixed CTA ── */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t border-gray-100 shadow-[0_-8px_24px_rgba(0,0,0,0.06)] z-50">
        <div className="max-w-md mx-auto">
          <button
            onClick={() => navigate('/unity-card/onboarding')}
            className="w-full bg-[#1A1A1A] text-white font-bold text-lg py-4 rounded-2xl hover:bg-black transition-colors tracking-wide"
          >
            Apply now
          </button>
        </div>
      </div>
    </div>
  );
}
