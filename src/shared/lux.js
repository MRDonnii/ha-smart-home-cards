// The navbar's glass look for active buttons in other cards (Claude AI, 2026-10-13): glass in the accent colour, a lit
// underline and a bubble-gum squash when a button turns active or is pressed. The colour is the theme's: `lux-accent`
// when the theme sets it, else its `dashboard-accent`.
export const LUX_ACCENT = "var(--lux-accent,var(--dashboard-accent,var(--primary-color,#62b5ff)))";

// base: every button of the kind; active: the active ones; icon: what inside them glows; underline: the lit line under
// an active button (off for round buttons).
export function luxCss({ base, active, icon = "ha-icon", underline = true }) {
  const a = LUX_ACCENT;
  return `
${base}{position:relative;transition:transform .25s cubic-bezier(.2,1.4,.4,1),background .3s ease,box-shadow .3s ease,color .3s ease}
${base}:active{transform:scale(.9);transition-duration:.08s}
${active}{background:linear-gradient(180deg,color-mix(in srgb,${a} 28%,transparent),color-mix(in srgb,${a} 7%,transparent))!important;
  color:color-mix(in srgb,${a} 70%,#fff)!important;border-color:color-mix(in srgb,${a} 45%,transparent)!important;
  box-shadow:inset 0 0 0 1px color-mix(in srgb,${a} 45%,transparent),inset 0 1px 0 rgba(255,255,255,.12),0 8px 24px -8px color-mix(in srgb,${a} 60%,transparent)!important;
  animation:luxGum .7s ease-out}
${underline ? `${active}::after{content:"";position:absolute;left:50%;bottom:3px;width:16px;height:2px;border-radius:2px;transform:translateX(-50%);background:${a};box-shadow:0 0 10px ${a};pointer-events:none}` : ""}
${active} ${icon}{color:color-mix(in srgb,${a} 80%,#fff)!important;filter:drop-shadow(0 0 6px color-mix(in srgb,${a} 60%,transparent))}
${LUX_KEYFRAMES}
@media (prefers-reduced-motion:reduce){${base},${active},${active} ${icon}{animation:none!important;transition:none!important}}`;
}

export const LUX_KEYFRAMES = `@keyframes luxGum{0%{transform:none}25%{transform:scale(1.12,.86)}50%{transform:scale(.93,1.08)}70%{transform:scale(1.04,.97)}100%{transform:none}}
@keyframes luxGumLoop{0%,58%,100%{transform:none}63%{transform:scale(1.24,.78)}68%{transform:translateY(-3px) scale(.82,1.2)}73%{transform:scale(1.12,.9)}78%{transform:translateY(-1px) scale(.95,1.06)}84%{transform:scale(1.03,.98)}90%{transform:none}}`;
