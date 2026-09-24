// Shared indoor-unit + airflow visual used by ha-ac-climate-card and
// ha-radiator-overview-card, so both cards animate the same AC unit instead
// of drifting into two look-alike implementations.
export const AC_UNIT_VISUAL_STYLE = `
.ac-unit-visual{position:relative;width:134px;height:100px}
.ac-unit-visual .indoor{position:absolute;left:0;top:0;width:132px;height:58px;border:2px solid color-mix(in srgb,var(--tone) 35%,rgba(255,255,255,.25));border-radius:10px 10px 15px 15px;background:linear-gradient(160deg,rgba(255,255,255,.18),rgba(0,0,0,.12));box-shadow:0 9px 20px rgba(0,0,0,.2)}
.ac-unit-visual .display{position:absolute;right:9px;top:8px;color:var(--tone);font-size:9px;font-weight:800}
.ac-unit-visual .vent{position:absolute;left:11px;right:11px;bottom:13px;display:flex;gap:3px}
.ac-unit-visual .vent i{flex:1;height:2px;border-radius:3px;background:color-mix(in srgb,var(--tone) 60%,transparent)}
.ac-unit-visual .flap{position:absolute;left:13px;right:13px;bottom:5px;height:4px;border-radius:5px;background:var(--tone);opacity:.55;transform-origin:center;animation:acUnitSwing 3s ease-in-out infinite}
.ac-unit-visual.off .flap{animation:none;opacity:.18}
.ac-unit-visual .airflow{position:absolute;left:19px;top:58px;width:115px;height:42px}
.ac-unit-visual .airflow i{display:none;position:absolute;left:0;width:80px;height:2px;border-radius:50%;background:linear-gradient(90deg,var(--tone),transparent);transform:rotate(9deg);animation:acUnitAir 1.8s ease-out infinite}
.ac-unit-visual.active .airflow i{display:block}
.ac-unit-visual .airflow i:nth-child(2){top:9px;animation-delay:.4s}
.ac-unit-visual .airflow i:nth-child(3){top:18px;animation-delay:.8s}
.ac-unit-visual .airflow i:nth-child(4){top:27px;animation-delay:1.2s}
@keyframes acUnitSwing{50%{transform:rotateX(55deg)}}
@keyframes acUnitAir{0%{opacity:0;transform:translate(0,0) rotate(9deg)}25%{opacity:.75}100%{opacity:0;transform:translate(40px,16px) rotate(9deg)}}
`;

export function acUnitVisualMarkup(label, active) {
  return `<div class="ac-unit-visual ${active ? "active" : "off"}">
    <div class="indoor">
      <div class="display" data-role="ac-unit-display">${label}</div>
      <div class="vent"><i></i><i></i><i></i><i></i><i></i></div>
      <div class="flap"></div>
    </div>
    <div class="airflow"><i></i><i></i><i></i><i></i></div>
  </div>`;
}
