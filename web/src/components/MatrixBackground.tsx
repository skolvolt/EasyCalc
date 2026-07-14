import { useEffect, useRef } from 'react';

/** Digits + math/quoting symbols that trickle down the start page. */
const CHARS = '0123456789+−×÷=±∑∫√πΔλΩ∞≈≠≤≥%$€£¥ƒ<>'.split('');
const charFor = (row: number, col: number) =>
  CHARS[(((row * 31 + col * 17) % CHARS.length) + CHARS.length) % CHARS.length];

/**
 * Subtle bluish-grey "matrix rain" for the start page. Canvas-based, sits
 * behind the content, honours prefers-reduced-motion, and is throttled to keep
 * it light. Colours are static so it reads the same in light and dark themes.
 */
export default function MatrixBackground() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const fontSize = 16;
    const TRAIL = 16;
    let cols = 0;
    let drops: number[] = [];
    let speeds: number[] = [];
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.font = `${fontSize}px 'Courier New', monospace`;
      ctx.textBaseline = 'top';
      const next = Math.ceil(window.innerWidth / fontSize);
      // preserve existing drop positions on resize where possible
      drops = Array.from({ length: next }, (_, c) => drops[c] ?? Math.random() * -60);
      speeds = Array.from({ length: next }, (_, c) => speeds[c] ?? (0.12 + Math.random() * 0.35) * 1.05);
      cols = next;
    };
    resize();
    window.addEventListener('resize', resize);

    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const h = () => window.innerHeight;

    let raf = 0;
    let last = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      if (t - last < 33) return; // ~30fps is plenty and keeps it light
      last = t;
      // light mode needs darker, stronger characters to read on the pale bg
      const dark = document.body.classList.contains('dark');
      ctx.clearRect(0, 0, window.innerWidth, h());
      for (let c = 0; c < cols; c++) {
        const head = drops[c];
        const x = c * fontSize;
        for (let i = 0; i < TRAIL; i++) {
          const row = Math.floor(head) - i;
          if (row < 0) continue;
          const y = row * fontSize;
          if (y > h()) continue;
          const fade = 1 - i / TRAIL;
          if (i === 0) {
            ctx.fillStyle = dark
              ? `rgba(74, 118, 174, ${0.42 * fade + 0.12})`   // brighter blue head
              : `rgba(38, 72, 122, ${0.54 * fade + 0.18})`;   // darker blue head (light mode)
          } else {
            ctx.fillStyle = dark
              ? `rgba(103, 120, 142, ${0.26 * fade})`         // bluish-grey trail
              : `rgba(62, 80, 104, ${0.38 * fade})`;          // darker bluish-grey trail (light mode)
          }
          ctx.fillText(charFor(row, c), x, y);
        }
        drops[c] += speeds[c];
        if (drops[c] * fontSize > h() + TRAIL * fontSize) {
          drops[c] = Math.random() * -40;
          speeds[c] = (0.12 + Math.random() * 0.35) * 1.05;
        }
      }
    };

    if (reduce) {
      // one gentle static frame instead of animating
      draw(1000);
    } else {
      raf = requestAnimationFrame(draw);
    }

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={ref} className="matrix-bg" aria-hidden="true" />;
}
