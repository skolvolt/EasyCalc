import { useEffect, useState } from 'react';

/**
 * Average luminance (0 black – 255 white) of a logo's non-transparent pixels.
 * Transparent areas are ignored so the backdrop is chosen by the ink, not the
 * empty canvas around it.
 */
function logoLuminance(img: HTMLImageElement): number {
  const c = document.createElement('canvas');
  const w = (c.width = Math.max(1, Math.min(img.naturalWidth || 1, 80)));
  const h = (c.height = Math.max(1, Math.min(img.naturalHeight || 1, 80)));
  const ctx = c.getContext('2d');
  if (!ctx) return 255;
  ctx.drawImage(img, 0, 0, w, h);
  let sum = 0, weight = 0;
  try {
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 0; i < data.length; i += 4) {
      const a = data[i + 3] / 255;
      if (a < 0.06) continue; // effectively transparent
      sum += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * a;
      weight += a;
    }
  } catch {
    return 255; // tainted canvas — fall back to a light backdrop
  }
  return weight ? sum / weight : 255;
}

/**
 * Client logo on a backdrop that auto-picks light or dark for best contrast:
 * a mostly-dark logo gets a white backdrop, a mostly-light logo a dark one.
 */
export default function ClientLogo({
  src, className = 'brand-neutral', alt = 'Client logo',
}: { src: string; className?: string; alt?: string }) {
  const [bg, setBg] = useState('');
  useEffect(() => {
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      // Dark logo (low luminance) → white; light logo → near-black.
      setBg(logoLuminance(img) < 128 ? '#ffffff' : '#141821');
    };
    img.src = src;
    return () => { cancelled = true; };
  }, [src]);

  return (
    <div className={className} style={bg ? { background: bg } : undefined}>
      <img src={src} alt={alt} />
    </div>
  );
}
