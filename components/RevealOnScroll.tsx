import { useEffect, useRef, useState, type ElementType, type ReactNode } from 'react';

/**
 * RevealOnScroll — the meetaugust.ai recipe, no scroll library required.
 *
 * Why this stays smooth:
 *  - Native scroll is left untouched (no Lenis/GSAP hijack → matches trackpad physics).
 *  - Animates ONLY transform + opacity → GPU-composited, no layout/paint during scroll.
 *  - Fires once via IntersectionObserver → no per-frame scroll handler competing for the main thread.
 *  - Respects prefers-reduced-motion → renders instantly for users who opt out of motion.
 *
 * Uses Tailwind utilities only (no raw hex/px), so it passes the design-guard and works
 * in both design systems. Wrap any block you want to fade/slide in on entry.
 *
 * @example
 *   <RevealOnScroll from="up" className="…">
 *     <h2 className="libertymd-type-section-title">Healthcare that works for you</h2>
 *   </RevealOnScroll>
 *
 *   // stagger children by passing an increasing delay
 *   {items.map((it, i) => (
 *     <RevealOnScroll key={it.id} from="up" delay={i * 80}>
 *       <Card {...it} />
 *     </RevealOnScroll>
 *   ))}
 */

type Direction = 'up' | 'down' | 'left' | 'right' | 'none';

type RevealOnScrollProps = {
  children: ReactNode;
  /** Element/component to render as the wrapper. Default: 'div'. */
  as?: ElementType;
  /** Classes applied to the wrapper (layout, spacing, etc.). */
  className?: string;
  /** Direction the content slides in from. Default: 'up'. */
  from?: Direction;
  /** Delay before animating in, in ms (use to stagger siblings). Default: 0. */
  delay?: number;
  /** Animate only the first time it enters (true) or every entry (false). Default: true. */
  once?: boolean;
  /** Fraction of the element that must be visible to trigger (0–1). Default: 0.15. */
  threshold?: number;
  /** Observer root margin; the default triggers reveals slightly before full entry. */
  rootMargin?: string;
};

// Hidden-state offset per direction (Tailwind classes → no raw px).
const HIDDEN_OFFSET: Record<Direction, string> = {
  up: 'translate-y-6',
  down: '-translate-y-6',
  left: 'translate-x-6',
  right: '-translate-x-6',
  none: '',
};

export function RevealOnScroll({
  children,
  as,
  className = '',
  from = 'up',
  delay = 0,
  once = true,
  threshold = 0.15,
  rootMargin = '0px 0px -10% 0px', // design-ok — IntersectionObserver margin, not a design token
}: RevealOnScrollProps) {
  const Tag = (as ?? 'div') as ElementType;
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Honor reduced-motion: show immediately, skip the observer entirely.
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) {
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true);
            if (once) observer.unobserve(entry.target);
          } else if (!once) {
            setVisible(false);
          }
        });
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [once, threshold, rootMargin]);

  const base =
    'transition-[opacity,transform] duration-700 ease-out will-change-transform motion-reduce:transition-none';
  const state = visible
    ? 'opacity-100 translate-x-0 translate-y-0'
    : `opacity-0 ${HIDDEN_OFFSET[from]}`;

  return (
    <Tag
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`${base} ${state} ${className}`.trim()}
    >
      {children}
    </Tag>
  );
}

export default RevealOnScroll;
