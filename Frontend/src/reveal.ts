// v0.1.4.0 D5 (D.1): staggered reveal — IntersectionObserver fade/lift on
// [data-reveal] elements. HARD rules: initial opacity 0 ONLY when motion is
// allowed (reduced-motion users see everything immediately); one-shot per
// element; once per VIEW per SESSION (module-level seen-flags — view
// switches remount Overview/Changes and must NOT re-stagger, review R9).

import { useEffect } from "react";
import { prefersReducedMotion } from "./theme";

const seenViews = new Set<string>();

export function useReveal (view: string, deps: unknown[]): void {
  useEffect(() => {
    if (prefersReducedMotion() || seenViews.has(view)) return;
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]")];
    if (els.length === 0) return; // data not rendered yet — retry on next dep change
    seenViews.add(view);
    els.forEach((el, i) => {
      const delay = Math.min(0.3, i * 0.05); // D5 stagger window 0.05-0.3s
      el.style.opacity = "0";
      el.style.transform = "translateY(10px)";
      el.style.transition =
        `opacity 0.4s ease ${delay}s, transform 0.4s ease ${delay}s`;
    });
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const el = e.target as HTMLElement;
        el.style.opacity = "1";
        el.style.transform = "none";
        io.unobserve(el); // one-shot — no re-animate on scroll-back
      }
    }, { threshold: 0.05 });
    els.forEach((el) => io.observe(el));
    // Safety net: whatever never intersects still becomes visible.
    const show = () =>
      els.forEach((el) => { el.style.opacity = "1"; el.style.transform = "none"; });
    const timer = window.setTimeout(show, 4000);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
      // T4: cleanup may run BEFORE the observer ever fired (StrictMode
      // double-mount; fast unmount) — the seen-flag then blocks a re-run,
      // so anything still hidden must be revealed here (HARD rule).
      show();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}
