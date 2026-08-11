import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, GitBranch, MessageSquare, Stethoscope } from 'lucide-react';
import { useI18n } from '../../i18n';

/**
 * "How LibertyMD works" — four phases held in a pinned frame, lit one at a time by scroll.
 *
 * The section is PIN_VIEWPORTS tall and holds a sticky, viewport-height pane. Phase position is
 * derived from the wrapper's live rect, not accumulated from wheel deltas, so a jump-scroll, a
 * resize, or a scroll back up all land on the correct phase for free.
 *
 * Two things go through React (the active index, four times over the whole section) and one does
 * not: the rule that draws under the active headline is written straight to the node as a
 * transform. Re-rendering this subtree every frame is what made the hero logo stutter.
 *
 * The centre stack is an inline SVG on a fixed axonometric projection rather than CSS 3D:
 * nested `preserve-3d` children flatten unpredictably in Safari, shadows do not participate in
 * 3D, and four near-coplanar slabs make z-ordering a per-browser lottery. Arithmetic is the same
 * everywhere, stays crisp at any DPR, and a highlight change repaints only fill and opacity.
 */

const PHASE_COUNT = 4;
/** Wrapper height in viewports. One is the pinned pane, so the highlight travels over 2.5. */
const PIN_VIEWPORTS = 3.5;

// --- Isometric geometry, in viewBox units -----------------------------------------------------
const VIEW_W = 320;
/**
 * The viewBox starts above the origin so the top plate has room to rise without being clipped
 * or colliding with the heading. Headroom here rather than a bigger FIRST_CY keeps the plate
 * arithmetic honest — every cy stays a plain multiple of GAP.
 */
const VIEW_MIN_Y = -48;
const VIEW_H = 520;
/**
 * A flat ~3.2:1 projection, not a textbook 2:1. Steeper plates read as chunky boxes at this
 * size; flattening them is what makes the stack look like laid-out sheets.
 */
const RX = 132;
const RY = 41;
/** Slab thickness — the extruded side under each top face. */
const DEPTH = 17;
/**
 * Plate-centre spacing. Must exceed 2·RY + DEPTH or adjacent slabs collide instead of stacking;
 * the surplus is the visible air between them.
 */
const GAP = 110;
const CX = 160;
const FIRST_CY = 58;
/** Corner rounding. Sharp vertices are what made the plates read as flat vector shapes. */
const TOP_RADIUS = 13;
const SIDE_RADIUS = 7;

const plateCy = (index: number) => FIRST_CY + index * GAP;

type Point = [number, number];

/**
 * Rounds every corner of a closed polygon: back off along both edges by `r` (never past an
 * edge's midpoint) and sweep through the original vertex with a quadratic.
 */
function roundedPath(points: Point[], r: number) {
  const n = points.length;
  let d = '';
  for (let i = 0; i < n; i += 1) {
    const [px, py] = points[i];
    const [ax, ay] = points[(i - 1 + n) % n];
    const [bx, by] = points[(i + 1) % n];
    const inLen = Math.hypot(px - ax, py - ay);
    const outLen = Math.hypot(bx - px, by - py);
    const inT = Math.min(r, inLen / 2);
    const outT = Math.min(r, outLen / 2);
    const start: Point = [px + ((ax - px) / inLen) * inT, py + ((ay - py) / inLen) * inT];
    const end: Point = [px + ((bx - px) / outLen) * outT, py + ((by - py) / outLen) * outT];
    d += `${i === 0 ? 'M' : 'L'}${start[0].toFixed(2)},${start[1].toFixed(2)}`;
    d += ` Q${px.toFixed(2)},${py.toFixed(2)} ${end[0].toFixed(2)},${end[1].toFixed(2)}`;
  }
  return `${d}Z`;
}

/** The rhombus the plate's face occupies. */
const topFacePath = (cy: number) =>
  roundedPath(
    [
      [CX, cy - RY],
      [CX + RX, cy],
      [CX, cy + RY],
      [CX - RX, cy],
    ],
    TOP_RADIUS,
  );

/**
 * The slab's whole extruded silhouette drawn as one hexagon rather than two quads. Separate
 * left/right faces leave a hairline seam down the middle at fractional device pixels.
 */
const slabPath = (cy: number) =>
  roundedPath(
    [
      [CX - RX, cy],
      [CX, cy + RY],
      [CX + RX, cy],
      [CX + RX, cy + DEPTH],
      [CX, cy + RY + DEPTH],
      [CX - RX, cy + DEPTH],
    ],
    SIDE_RADIUS,
  );

/**
 * Projects an upright glyph drawn around the origin onto a plate's face: unit x runs down-right
 * and unit y down-left, squashed by the same RY/RX the plates use.
 */
const ICON_SCALE = 1.05;
const isoMatrix = (cy: number) => {
  const k = ICON_SCALE;
  const squash = (k * RY) / RX;
  return `matrix(${k},${squash},${-k},${squash},${CX},${cy})`;
};

/**
 * One glyph per phase, drawn upright around the origin at roughly ±14 units, then projected.
 * Kept to a few commands each — detail does not survive the squash.
 */
const GLYPHS = [
  // Share your symptoms — a speech bubble
  'M-15,-11 h30 v18 h-19 l-8,7 v-7 h-3 z',
  // Focussed follow-up — one question branching into two
  'M0,-13 v10 M0,-3 h-11 v9 M0,-3 h11 v9',
  // Doctor-ready report — a document with lines
  'M-11,-14 h16 l6,6 v22 h-22 z M-6,-3 h12 M-6,4 h12',
  // Doctor consultation — a stethoscope
  'M-11,-13 v8 a8,8 0 0 0 16,0 v-8 M-3,3 v5 a7,7 0 0 0 14,0 v-4',
];

/**
 * Highlight motion, taken from the reference's own Lottie (`result-v3.json`, 30fps):
 *   · the lit plate's null travels y −117.134 → −197.485 = 80.4 units
 *   · plate-to-plate spacing in the same space is 121 × 2.01 = 243.2 units
 *     → the lift is 33% of the gap, not a nudge
 *   · t 59.5 → 72 and t 242 → 254.5 = 12.5 frames each way = 417ms, rise and fall alike
 *   · both keyframe pairs carry o {x .672 y 0} / i {x .272 y 1} = cubic-bezier(.672,0,.272,1)
 *   · scale never changes; only y moves
 */
const LIFT_RATIO = 0.33;
const LIFT = Math.round(GAP * LIFT_RATIO);
const LIFT_MS = 417;
const LIFT_EASE = 'cubic-bezier(0.672, 0, 0.272, 1)';
/**
 * Colour is sequenced, not crossfaded — see the note at the render site. Measured off the
 * reference: the whole swap lands in ~466ms, so a 210ms fade either side of a 210ms stagger
 * matches without a lit plate ever overlapping another.
 */
const FADE_MS = 210;
const FADE_STAGGER = 210;

/**
 * Shadows are CSS `drop-shadow`, not SVG `<filter>` elements. Swapping a `filter="url(#…)"`
 * attribute is a discrete change — the shadow popped. CSS filter lists interpolate, but only
 * when both sides have the SAME function list, so the idle state carries a fully transparent
 * blue shadow rather than one function fewer.
 */
const IDLE_SHADOW = 'drop-shadow(0 7px 7px rgba(29,78,216,0)) drop-shadow(0 8px 10px rgba(23,50,95,0.26))';
const ACTIVE_SHADOW = 'drop-shadow(0 16px 16px rgba(29,78,216,0.34)) drop-shadow(0 5px 4px rgba(23,50,95,0.2))';

function PhaseStackArt({ activeIndex }: { activeIndex: number }) {
  return (
    <svg
      viewBox={`0 ${VIEW_MIN_Y} ${VIEW_W} ${VIEW_H}`}
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none h-full w-auto overflow-visible lg:h-auto lg:w-full"
    >
      <defs>
        <linearGradient id="lmd-plate-active" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="var(--libertymd-blue-500)" />
          <stop offset="45%" stopColor="var(--libertymd-blue-600)" />
          <stop offset="100%" stopColor="var(--libertymd-blue-700)" />
        </linearGradient>
        <linearGradient id="lmd-plate-idle" x1="0.1" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="50%" stopColor="var(--libertymd-blue-50)" />
          <stop offset="100%" stopColor="var(--libertymd-slate-200)" />
        </linearGradient>
        {/* The extruded side is always darker than the face it carries — that difference is
            what reads as thickness. */}
        <linearGradient id="lmd-slab-active" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--libertymd-blue-900)" />
          <stop offset="50%" stopColor="var(--libertymd-blue-700)" />
          <stop offset="100%" stopColor="var(--libertymd-blue-800)" />
        </linearGradient>
        <linearGradient id="lmd-slab-idle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#B8C6D8" />
          <stop offset="50%" stopColor="var(--libertymd-slate-300)" />
          <stop offset="100%" stopColor="var(--libertymd-slate-400)" />
        </linearGradient>
        <filter id="lmd-plate-glow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="12" />
        </filter>
      </defs>

      {/* Painter's order: the top plate is drawn first, so a lower plate always overlaps the one
          above it and no z-index reasoning is needed. */}
      {GLYPHS.map((glyph, index) => {
        const isActive = index === activeIndex;
        // The plate is always DRAWN at its resting cy. The lift is a CSS transform on the group,
        // because path `d` is not a transitionable property — folding the lift into the geometry
        // made the plate teleport between phases instead of travelling.
        const cy = plateCy(index);
        // The reference sequences the colour change rather than crossfading it: measured from
        // a screen recording, the outgoing plate's warm pixels decay to ~0 by rel 367ms and the
        // incoming plate only then ramps up, completing about 466ms in. There is a brief frame
        // where no plate is lit, and that is what keeps exactly one plate reading as "on".
        const fadeOut = { transition: `opacity ${FADE_MS}ms ${LIFT_EASE}` };
        const fadeIn = { transition: `opacity ${FADE_MS}ms ${LIFT_EASE} ${FADE_STAGGER}ms` };
        // Whichever layer is arriving waits for the other to clear.
        const restStyle = isActive ? fadeOut : fadeIn;
        const litStyle = isActive ? fadeIn : fadeOut;

        return (
          <g
            key={glyph}
            style={{
              transform: `translateY(${isActive ? -LIFT : 0}px)`,
              filter: isActive ? ACTIVE_SHADOW : IDLE_SHADOW,
              transition: `transform ${LIFT_MS}ms ${LIFT_EASE}, filter ${LIFT_MS}ms ${LIFT_EASE}`,
            }}
          >
            {/* Resting state */}
            <g style={{ ...restStyle, opacity: isActive ? 0 : 1 }}>
              <path d={slabPath(cy)} fill="url(#lmd-slab-idle)" />
              <path d={topFacePath(cy)} fill="url(#lmd-plate-idle)" stroke="var(--libertymd-slate-200)" strokeWidth="1" />
              <ellipse cx={CX} cy={cy} rx={RX * 0.3} ry={RY * 0.3} fill="var(--libertymd-slate-400)" opacity="0.14" />
              <path
                d={glyph}
                transform={isoMatrix(cy)}
                fill="none"
                stroke="var(--libertymd-slate-500)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.34"
                vectorEffect="non-scaling-stroke"
              />
            </g>

            {/* Lit state, crossfaded over the same 417ms. The reference hard-cuts between two
                copies of the plate at this moment; a crossfade costs nothing and avoids the pop. */}
            <g style={{ ...litStyle, opacity: isActive ? 1 : 0 }}>
              <ellipse
                cx={CX}
                cy={cy + RY + DEPTH + 18}
                rx={RX * 0.72}
                ry={RY * 0.6}
                fill="var(--libertymd-blue-500)"
                filter="url(#lmd-plate-glow)"
                opacity="0.3"
              />
              <path d={slabPath(cy)} fill="url(#lmd-slab-active)" />
              <path d={topFacePath(cy)} fill="url(#lmd-plate-active)" stroke="var(--libertymd-blue-600)" strokeWidth="1" />
              <ellipse cx={CX} cy={cy} rx={RX * 0.3} ry={RY * 0.3} fill="var(--libertymd-blue-900)" opacity="0.3" />
              <path
                d={glyph}
                transform={isoMatrix(cy)}
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.92"
                vectorEffect="non-scaling-stroke"
              />
            </g>

            {/* One-shot ripple as the plate lights up — the reference fires a sprite that scales
                up and fades over ~30 frames. It traces the plate's OWN outline rather than an
                ellipse: a circular ring read as a stray artefact and collided with the plate
                above. Keyed on the active index so it replays per arrival instead of looping. */}
            {isActive && (
              <path
                key={`pulse-${activeIndex}`}
                className="libertymd-plate-pulse"
                d={topFacePath(cy)}
                fill="none"
                stroke="var(--libertymd-blue-500)"
                strokeWidth="1.5"
              />
            )}
          </g>
        );
      })}
    </svg>
  );
}

type Phase = { title: string; eyebrow: string; body: string };

const LABEL_ICONS = [MessageSquare, GitBranch, FileText, Stethoscope];

function PhaseLabel({
  phase,
  index,
  activeIndex,
  fillRef,
  onOpenSampleReport,
}: {
  phase: Phase;
  index: number;
  activeIndex: number;
  fillRef?: (node: HTMLSpanElement | null) => void;
  onOpenSampleReport?: () => void;
}) {
  const { t } = useI18n();
  const isActive = index === activeIndex;
  const isPassed = index < activeIndex;
  const Icon = LABEL_ICONS[index];

  return (
    <div className={`text-left transition-opacity duration-500 ${isActive ? 'opacity-100' : 'lg:opacity-40'}`}>
      <span
        className={`inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-500 ${
          isActive ? 'bg-libertymd-blue-600 text-white' : 'bg-libertymd-slate-100 text-libertymd-slate-400'
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="mt-4 text-xs font-bold uppercase tracking-wide text-libertymd-blue-600">
        {String(index + 1).padStart(2, '0')} · {phase.eyebrow}
      </p>
      <h3 className="mt-2 font-serif text-2xl font-semibold leading-tight text-libertymd-ink sm:text-3xl">
        {phase.title}
      </h3>
      {/* The rule is the active tell: it draws across as the phase's own scroll segment is
          consumed, holds full width once passed, and sits at zero before its turn. */}
      <span
        aria-hidden="true"
        className="mt-3 block h-px w-full max-w-[13rem] overflow-hidden bg-libertymd-slate-200"
      >
        <span
          ref={isActive ? fillRef : undefined}
          className="block h-full w-full origin-left bg-libertymd-blue-600"
          style={{ transform: `scaleX(${isPassed ? 1 : 0})` }}
        />
      </span>
      <p className="mt-3 max-w-sm text-sm leading-6 text-libertymd-slate-muted">{phase.body}</p>
      {/* The CTA keeps its slot whether or not this phase is lit. Mounting it on activation
          changed the column's height, which shunted every label below it as the scroll moved
          between phases — the jump read as the text failing to line up. */}
      {index === 2 && onOpenSampleReport && (
        <button
          type="button"
          data-libertymd-sample-report-entry="how-it-works"
          onClick={onOpenSampleReport}
          tabIndex={isActive ? 0 : -1}
          aria-hidden={isActive ? undefined : true}
          className={`mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-libertymd-blue-600 bg-white px-5 py-2.5 text-sm font-bold text-libertymd-blue-700 transition hover:bg-libertymd-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-libertymd-blue-600 focus-visible:ring-offset-2 ${
            isActive ? '' : 'pointer-events-none invisible'
          }`}
        >
          <FileText className="h-4 w-4" aria-hidden="true" />
          {t('sampleReport.entry')}
        </button>
      )}
    </div>
  );
}

export function LibertyMDPhaseStack({
  header,
  onOpenSampleReport,
}: {
  header?: React.ReactNode;
  onOpenSampleReport?: () => void;
}) {
  const { t } = useI18n();
  const phases: Phase[] = Array.from({ length: PHASE_COUNT }, (_, i) => ({
    title: t(`app.phases.${i}.title`),
    eyebrow: t(`app.phases.${i}.eyebrow`),
    body: t(`app.phases.${i}.body`),
  }));

  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const prevIndexRef = useRef(0);
  // Two independent registries. The desktop pair is `display:none` below `lg` and the mobile
  // single-phase column is `display:none` from `lg`, and the mobile column is last in DOM
  // order — with one shared array it overwrote the desktop slot on every commit, so the
  // visible desktop rule never received a write. Every tick writes the same scaleX to both.
  const desktopFillRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const mobileFillRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const [isPinned, setIsPinned] = useState(false);

  // Reduced motion is the only thing that drops the pin — unlike a carousel this is native
  // sticky scrolling, so it behaves on touch as well as it does with a wheel.
  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setIsPinned(!reduce.matches);
    update();
    reduce.addEventListener('change', update);
    return () => reduce.removeEventListener('change', update);
  }, []);

  const setFill = useCallback((index: number, value: number) => {
    const transform = `scaleX(${value})`;
    const desktop = desktopFillRefs.current[index];
    if (desktop) desktop.style.transform = transform;
    const mobile = mobileFillRefs.current[index];
    if (mobile) mobile.style.transform = transform;
  }, []);

  useEffect(() => {
    if (!isPinned) return;
    const wrapper = wrapperRef.current;
    if (!wrapper) return;

    let visible = false;

    const tick = () => {
      rafRef.current = null;
      const range = wrapper.offsetHeight - window.innerHeight;
      if (range <= 0) return;
      const progress = Math.min(1, Math.max(0, -wrapper.getBoundingClientRect().top / range));
      const spread = progress * PHASE_COUNT;
      const index = Math.min(PHASE_COUNT - 1, Math.floor(spread));
      if (prevIndexRef.current !== index) {
        // A phase that stops being active must drop its imperative fill back to 0 — the
        // React virtual DOM never changes future phases, so without this a fast reverse
        // scrub could leave a stale partial fill on the now-future rule.
        for (let i = 0; i < desktopFillRefs.current.length; i++) {
          if (i !== index && desktopFillRefs.current[i]) desktopFillRefs.current[i]!.style.transform = 'scaleX(0)';
        }
        for (let i = 0; i < mobileFillRefs.current.length; i++) {
          if (i !== index && mobileFillRefs.current[i]) mobileFillRefs.current[i]!.style.transform = 'scaleX(0)';
        }
        prevIndexRef.current = index;
      }
      setActiveIndex((current) => (current === index ? current : index));
      setFill(index, Math.min(1, spread - index));
    };

    const wake = () => {
      if (!visible || rafRef.current !== null) return;
      rafRef.current = window.requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) wake();
      },
      { rootMargin: '120px 0px' },
    );
    observer.observe(wrapper);

    tick();
    window.addEventListener('scroll', wake, { passive: true });
    window.addEventListener('resize', wake);
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', wake);
      window.removeEventListener('resize', wake);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [isPinned, setFill]);

  // Reduced motion: the same four phases as a plain list, nothing hidden, no pin.
  if (!isPinned) {
    return (
      <>
        {header}
        <div className="libertymd-content-shell mx-auto mt-12 grid gap-10 sm:grid-cols-2">
        {phases.map((phase, index) => (
          <PhaseLabel
            key={phase.title}
            phase={phase}
            index={index}
            activeIndex={index}
            onOpenSampleReport={onOpenSampleReport}
          />
        ))}
        </div>
      </>
    );
  }

  const activePhase = phases[activeIndex];

  return (
    <div ref={wrapperRef} className="relative" style={{ height: `${PIN_VIEWPORTS * 100}vh` }}>
      <div className="libertymd-content-shell sticky top-0 mx-auto flex h-screen flex-col justify-center gap-6 lg:gap-10">
        {header}
        {/* Below `lg` the stack is pushed half off the right edge and the copy owns the left,
            showing one phase at a time. From `lg` the stack is centred with two phases either
            side, as the reference does. */}
        {/* `overflow-x-clip`, not `hidden`: the mobile stack is deliberately translated past the
            right edge and would otherwise widen the document — measured 534px of content in a
            420px viewport, i.e. a horizontally scrollable page. `clip` contains it without
            creating a scroll container, so the sticky parent keeps working and the plates' glow
            can still bleed vertically. */}
        <div className="relative min-h-[46vh] overflow-x-clip lg:grid lg:min-h-0 lg:grid-cols-[1fr_auto_1fr] lg:items-center lg:gap-10 lg:overflow-x-visible">
          <div className="hidden flex-col gap-8 lg:flex xl:gap-10">
            {[0, 1].map((index) => (
              <PhaseLabel
                key={phases[index].title}
                phase={phases[index]}
                index={index}
                activeIndex={activeIndex}
                fillRef={(node) => { desktopFillRefs.current[index] = node; }}
                onOpenSampleReport={onOpenSampleReport}
              />
            ))}
          </div>

          <div
            aria-hidden="true"
            /* Below `lg` the art is sized from the row's HEIGHT and overflows horizontally, so
               it crops at the right edge instead of being shrunk to fit. The row carries a
               `min-h` for the same reason: sized purely by the copy it collapsed at tablet
               widths, leaving the plates small and floating mid-box rather than cropped. */
            className="pointer-events-none absolute inset-y-0 right-0 w-auto translate-x-[38%] [mask-image:linear-gradient(90deg,transparent,black_26%)] [-webkit-mask-image:linear-gradient(90deg,transparent,black_26%)] lg:static lg:w-[21rem] lg:translate-x-0 lg:[mask-image:none] lg:[-webkit-mask-image:none] xl:w-[23rem]"
          >
            <PhaseStackArt activeIndex={activeIndex} />
          </div>

          {/* The right pair is dropped half a block so the four labels read as a spiral around
              the stack rather than two rigid columns — the reference staggers them the same way. */}
          <div className="hidden flex-col gap-8 lg:flex lg:pt-14 xl:gap-10 xl:pt-20">
            {[2, 3].map((index) => (
              <PhaseLabel
                key={phases[index].title}
                phase={phases[index]}
                index={index}
                activeIndex={activeIndex}
                fillRef={(node) => { desktopFillRefs.current[index] = node; }}
                onOpenSampleReport={onOpenSampleReport}
              />
            ))}
          </div>

          {/* Mobile: only the lit phase is shown, keyed so it crossfades on change. Every other
              phase stays in the DOM for screen readers so none becomes unreachable.
              The min-height is the tallest phase's worth of copy: without it each swap resized
              the column, and the centred pane shifted the heading and stack with it. */}
          <div className="relative min-h-[19rem] w-[56%] min-w-[15rem] lg:hidden">
            <div key={activeIndex} className="libertymd-phase-swap absolute inset-x-0 top-0">
              <PhaseLabel
                phase={activePhase}
                index={activeIndex}
                activeIndex={activeIndex}
                fillRef={(node) => { mobileFillRefs.current[activeIndex] = node; }}
                onOpenSampleReport={onOpenSampleReport}
              />
            </div>
            <ul className="sr-only">
              {phases.map((phase, index) =>
                index === activeIndex ? null : (
                  <li key={phase.title}>
                    {phase.title}. {phase.body}
                  </li>
                ),
              )}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
