/**
 * Motion — one place for GSAP setup.
 *
 * Timings and easings are read from the design tokens (tokens.css), so CSS
 * transitions and GSAP animations share a single source of truth.
 *
 * Reduced motion: elements waiting to be revealed are only hidden when the
 * user hasn't asked for reduced motion (see base.css), and every helper here
 * returns early in that case — content simply appears.
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { CustomEase } from 'gsap/CustomEase';

gsap.registerPlugin(ScrollTrigger, CustomEase);

export { gsap, ScrollTrigger };

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const root = getComputedStyle(document.documentElement);
const token = (name: string) => root.getPropertyValue(name).trim();

/** '--dur-fold' → seconds, e.g. 0.52 */
export const duration = (name: string) => parseFloat(token(name)) / 1000;

/** '--ease-out' → a GSAP ease built from the token's cubic-bezier(). */
export function ease(name: string): string {
  const id = name.replace(/^--/, '');
  if (!CustomEase.get(id)) {
    const points = token(name).match(/cubic-bezier\(([^)]+)\)/)?.[1];
    CustomEase.create(id, points ? points.replace(/\s/g, '') : '0.22,1,0.36,1');
  }
  return id;
}

/**
 * Safety net: make pre-hidden elements visible without animating. CSS already
 * skips the pre-hide under reduced motion; this guarantees content shows even
 * if the CSS and JS ever disagree about the setting.
 */
export function showImmediately(targets: gsap.TweenTarget): void {
  gsap.set(targets, { opacity: 1, y: 0 });
}

export const revealDistance = () => parseFloat(token('--reveal-distance')) || 0;

/**
 * Fade-and-rise for anything marked in the HTML:
 *   data-reveal            → the element reveals when it scrolls into view
 *   data-reveal-group      → its [data-reveal-item] children reveal in sequence
 */
export function initReveals(scope: ParentNode = document): void {
  if (prefersReducedMotion()) {
    showImmediately(scope.querySelectorAll('[data-reveal], [data-reveal-item]'));
    return;
  }
  const base = { opacity: 1, y: 0, duration: duration('--dur-fold'), ease: ease('--ease-out') };

  scope.querySelectorAll<HTMLElement>('[data-reveal]').forEach((el) => {
    gsap.fromTo(el, { y: revealDistance() }, { ...base, scrollTrigger: { trigger: el, start: 'top 88%', once: true } });
  });

  scope.querySelectorAll<HTMLElement>('[data-reveal-group]').forEach((group) => {
    const items = group.querySelectorAll<HTMLElement>('[data-reveal-item]');
    gsap.fromTo(
      items,
      { y: revealDistance() * 1.5 },
      { ...base, stagger: 0.12, scrollTrigger: { trigger: group, start: 'top 85%', once: true } },
    );
  });
}
