// Dominant colour of an album cover for the accent, hero gradient and mini player. Needs CORS on the image (Music
// Assistant's proxy and most streaming CDNs send it); without it the card keeps the theme colour. By Claude AI.
const cache = new Map();

export function sampleColor(url) {
  if (!url || typeof document === "undefined") return Promise.resolve(null);
  if (cache.has(url)) return cache.get(url);
  const p = new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    const done = (v) => { img.onload = img.onerror = null; resolve(v); };
    const timer = setTimeout(() => done(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      try {
        const c = document.createElement("canvas");
        c.width = c.height = 24;
        const g = c.getContext("2d", { willReadFrequently: true });
        g.drawImage(img, 0, 0, 24, 24);
        const px = g.getImageData(0, 0, 24, 24).data;
        let r = 0; let gr = 0; let b = 0; let w = 0;
        for (let i = 0; i < px.length; i += 4) {
          const [pr, pg, pb] = [px[i], px[i + 1], px[i + 2]];
          const max = Math.max(pr, pg, pb); const min = Math.min(pr, pg, pb);
          // Favour colourful mid-tones over black, white and grey.
          const weight = 0.08 + ((max - min) / 255) * (max > 30 && min < 235 ? 1 : 0.2);
          r += pr * weight; gr += pg * weight; b += pb * weight; w += weight;
        }
        done(w ? [r / w, gr / w, b / w].map(Math.round) : null);
      } catch (_e) { done(null); }
    };
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.src = url;
  });
  cache.set(url, p);
  if (cache.size > 80) cache.delete(cache.keys().next().value);
  return p;
}

// The same hue with saturation and lightness pulled into a range (readable accents, dark backgrounds).
export function tone([r, g, b], { minS = 0.4, l: [lo, hi] = [0.45, 0.6] } = {}) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  let h = 0; let s = 0; let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : (max === g ? (b - r) / d + 2 : (r - g) / d + 4);
    h /= 6;
  }
  if (s > 0.06) s = Math.max(s, minS);
  l = Math.min(hi, Math.max(lo, l));
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t) => {
    if (t < 0) t += 1; if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return (s === 0 ? [l, l, l] : [f(h + 1 / 3), f(h), f(h - 1 / 3)]).map((v) => Math.round(v * 255));
}
