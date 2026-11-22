// The 3D section (section: 3d): a drawn diorama of the site (config `site`) with live energy flows, built with
// three.js from the CDN on first use. Mixed into the card class.
import { STYLE3D } from './styles.js';
import { esc, fmtW, fmtN, kwh, ic } from './util.js';

/* ---------- geometry helpers ---------- */
function pip(x, z, poly) { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, zi] = poly[i], [xj, zj] = poly[j]; if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) c = !c; } return c; }
function closest(x, z, poly) {
  let best = null, bd = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], dx = bx - ax, dz = bz - az, L = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / L)), qx = ax + t * dx, qz = az + t * dz, d = (x - qx) ** 2 + (z - qz) ** 2;
    if (d < bd) { bd = d; best = [qx, qz]; }
  }
  return [best, Math.sqrt(bd)];
}
function polyArea(p) { let a = 0; for (let i = 0; i < p.length; i++) { const j = (i + 1) % p.length; a += p[i][0] * p[j][1] - p[j][0] * p[i][1]; } return Math.abs(a) / 2; }

/* hipped roof from the distance to the facade – works for any floor plan */
function roofGeometry(THREE, poly, base, pitch, cap, uvOf) {
  const xs = poly.map(p => p[0]), zs = poly.map(p => p[1]);
  const minx = Math.min(...xs) - .3, maxx = Math.max(...xs) + .3, minz = Math.min(...zs) - .3, maxz = Math.max(...zs) + .3;
  const step = Math.max(.35, Math.min(.8, Math.sqrt((maxx - minx) * (maxz - minz)) / 60));
  const nx = Math.ceil((maxx - minx) / step) + 1, nz = Math.ceil((maxz - minz) / step) + 1, k = Math.tan(pitch);
  const pos = [], uv = [], inside = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    const x = minx + i * step, z = minz + j * step, ins = pip(x, z, poly);
    const [q, d] = closest(x, z, poly);
    const px = ins ? x : q[0], pz = ins ? z : q[1], y = base + (ins ? Math.min(d * k, cap) : 0);
    pos.push(px, y, pz); const t = uvOf(px, pz); uv.push(t[0], t[1]); inside.push(ins);
  }
  const idx = [];
  for (let j = 0; j < nz - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    const cx = minx + (i + .5) * step, cz = minz + (j + .5) * step;
    if (!pip(cx, cz, poly) && !(inside[a] || inside[b] || inside[c] || inside[d])) continue;
    if (!pip(cx, cz, poly) && [a, b, c, d].filter(v => inside[v]).length < 2) continue;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function wallGeometry(THREE, poly, h) {
  const pos = [], uv = [], idx = []; let u = 0;
  { let s = 0; for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; s += poly[i][0] * poly[j][1] - poly[j][0] * poly[i][1]; } if (s < 0) poly = poly.slice().reverse(); }
  for (let i = 0; i < poly.length; i++) {
    const [ax, az] = poly[i], [bx, bz] = poly[(i + 1) % poly.length], L = Math.hypot(bx - ax, bz - az), n = pos.length / 3;
    pos.push(ax, 0, az, bx, 0, bz, bx, h, bz, ax, h, az); uv.push(u / 3, 0, (u + L) / 3, 0, (u + L) / 3, 1, u / 3, 1); u += L;
    idx.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); return g;
}
function canvasTex(THREE, w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; }
function glowTex(THREE) { return canvasTex(THREE, 64, 64, (g) => { const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.25, 'rgba(255,255,255,.75)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }); }

let THREE_P = null;
const loadThree = () => THREE_P || (THREE_P = import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js'));

export const Scene3D = {
  _sceneHTML() {
    const sign = (k, pop, col, icon, name) => `<button class="sign" id="lab-${k}" data-pop="${pop}" data-focus="${k}" style="--c:${col};opacity:0">
      <div class="sh"><span class="ic2">${ic(icon, 12)}</span>${name}</div><div class="sv" id="lv-${k}">–</div><div class="ss" id="ls-${k}">&nbsp;</div><div class="sb"><i id="lb-${k}"></i></div><span class="stem"></span></button>`;
    const it = (cls, k, lbl) => `<div class="${cls}"><small>${lbl}</small><b id="${k}">–</b></div>`;
    return `
    <div class="card scene" id="scene3d" style="--glow:var(--sun)">
      <div class="stage" id="stage" style="${this.config.fill ? 'aspect-ratio:auto;height:calc(100dvh - 300px);min-height:440px' : ''}">
        <div class="loading" id="loading"><div>Bygger 3D‑overblik<i></i></div></div>
        <div class="labs" id="labs">
          ${sign('pv', 'solar', 'var(--sun)', 'panel', 'Solceller')}${sign('home', 'home', 'var(--home)', 'home', 'Huset')}
          ${sign('bat', 'battery', 'var(--bat)', 'battery', 'Batteri')}${sign('grid', 'grid', 'var(--grid)', 'grid', 'Elnet')}${sign('ev', 'ev', 'var(--ev)', 'ev', 'Elbil')}
        </div>
        <div class="hud"><div style="min-width:0"><div class="eb">${esc(this._plant.name)} · live</div><div class="ttl" id="summary3">&nbsp;</div></div>
          <div class="rt"><span class="wx" id="wx3"></span><span class="pill" id="live3"><span class="d"></span>Live</span></div></div>
        <div class="info">${it('x1', 'i3pv', 'I dag')}${it('x2', 'i3use', 'Forbrug')}${it('x3', 'i3aut', 'Selvforsynet')}${it('x4', 'i3price', 'Elpris')}${it('x5', 'i3save', 'Sparet')}</div>
        <div class="foot"><span>${esc(this._site.attribution)}</span><div class="btns3"><button id="b3top">Ovenfra</button><button id="b3tour">Rundtur</button></div></div>
      </div>
    </div>`;
  },

  async _init3d() {
    const stage = this.$('stage'); if (!stage || this._3d) return;
    const SITE = this._site, px2m = (px, py) => [(px - SITE.tiles.ox) * SITE.tiles.res, (py - SITE.tiles.oy) * SITE.tiles.res];
    let THREE;
    try { THREE = await loadThree(); } catch (e) { this.$('loading').innerHTML = '3D kunne ikke indlæses'; return; }
    const S = this._3d = { THREE, t: 0, flows: {}, labels: {}, panels: [], clouds: [], visible: true, values: {} };
    const W = () => stage.clientWidth || 600, H = () => stage.clientHeight || 375;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' }); renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setSize(W(), H(), false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    stage.insertBefore(renderer.domElement, stage.firstChild);
    S.renderer = renderer;

    const scene = S.scene = new THREE.Scene();
    const cam = S.cam = new THREE.PerspectiveCamera(36, W() / H(), .5, 900);

    // lights
    S.hemi = new THREE.HemisphereLight('#e8f3ff', '#6f7f4a', .9); scene.add(S.hemi);
    const sun = S.sun = new THREE.DirectionalLight('#fff3df', 2.4);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0004; sun.shadow.normalBias = .04;
    Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 400 });
    sun.target.position.set(0, 0, -10); scene.add(sun, sun.target);

    // toon gradient
    const grad = new THREE.DataTexture(new Uint8Array([110, 110, 110, 255, 175, 175, 175, 255, 228, 228, 228, 255, 255, 255, 255, 255]), 4, 1, THREE.RGBAFormat);
    grad.minFilter = grad.magFilter = THREE.NearestFilter; grad.needsUpdate = true; S.grad = grad;
    const toon = (color, extra = {}) => new THREE.MeshToonMaterial({ color, gradientMap: grad, ...extra });

    /* ---- drawn diorama island ---- */
    const I = SITE.island, ix0 = I.x - I.size / 2, iz0 = I.z - I.size / 2, CS = 2048, k = CS / I.size;
    const cv = document.createElement('canvas'); cv.width = cv.height = CS; const g = cv.getContext('2d');
    const P = (px, py) => { const [x, z] = px2m(px, py); return [(x - ix0) * k, (z - iz0) * k]; };
    const poly = (pts, fill, stroke, lw) => { g.beginPath(); pts.forEach((q, i) => { const [a, b] = P(q[0], q[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.closePath(); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = lw * k; g.stroke(); } };
    const line = (pts, color, w, dash) => { g.beginPath(); pts.forEach((q, i) => { const [a, b] = P(q[0], q[1]); i ? g.lineTo(a, b) : g.moveTo(a, b); }); g.strokeStyle = color; g.lineWidth = w * k; g.lineCap = g.lineJoin = 'round'; g.setLineDash(dash ? dash.map(d => d * k) : []); g.stroke(); g.setLineDash([]); };
    const rnd = (a => () => (a = (a * 16807) % 2147483647) / 2147483647)(42);
    // grass with light speckles
    g.fillStyle = '#86b85c'; g.fillRect(0, 0, CS, CS);
    for (let i = 0; i < 1400; i++) { g.fillStyle = rnd() > .5 ? 'rgba(255,255,220,.045)' : 'rgba(30,70,20,.06)'; g.beginPath(); g.arc(rnd() * CS, rnd() * CS, (.8 + rnd() * 2.4) * k, 0, 7); g.fill(); }
    for (let i = 0; i < 9000; i++) { g.fillStyle = rnd() > .5 ? 'rgba(60,110,40,.35)' : 'rgba(170,215,120,.35)'; g.fillRect(rnd() * CS, rnd() * CS, 2, 4); }
    // fields with rows
    const field = (pts, base, row, ang) => { g.save(); poly(pts, base); g.clip(); g.translate(CS / 2, CS / 2); g.rotate(ang); g.strokeStyle = row; g.lineWidth = .9 * k;
      for (let y = -CS; y < CS; y += 2.2 * k) { g.beginPath(); g.moveTo(-CS, y); g.lineTo(CS, y); g.stroke(); } g.restore(); poly(pts, null, 'rgba(60,60,20,.25)', .4); };
    for (const f of SITE.paint.fields) field(f.p, f.c, f.r, f.a);
    // lawn with mowing stripes
    if (SITE.paint.lawn) { g.save(); poly(SITE.paint.lawn, '#8fc463'); g.clip(); g.translate(CS / 2, CS / 2); g.rotate(-.42);
    for (let y = -CS; y < CS; y += 3 * k) { g.fillStyle = (Math.round(y / (3 * k)) % 2) ? 'rgba(255,255,255,.07)' : 'rgba(0,40,0,.05)'; g.fillRect(-CS, y, CS * 2, 3 * k); } g.restore(); }
    // gravel, yard, driveways
    for (const a of SITE.paint.gravel) poly(a, '#d8c9a3', 'rgba(120,100,60,.35)', .35);
    for (const a of SITE.paint.paved) poly(a, '#9a9ca3', 'rgba(60,62,70,.5)', .35);
    if (SITE.paint.lane) { line(SITE.paint.lane, '#9a9ca3', 4.2); line(SITE.paint.lane, 'rgba(60,62,70,.35)', 4.6); line(SITE.paint.lane, '#9a9ca3', 4.0); }
    // road
    if (SITE.paint.road) { line(SITE.paint.road, '#3e4350', 7.4); line(SITE.paint.road, '#575d6b', 6.6); line(SITE.paint.road, '#f4f1e8', .18, [3, 4]);
    line(SITE.paint.road, 'rgba(244,241,232,.0)', 0); }
    // garden plot
    if (SITE.paint.plot) poly(SITE.paint.plot, '#a98d62', 'rgba(90,70,40,.45)', .3);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = renderer.capabilities.getMaxAnisotropy();

    // island shape (rounded square) + soil edge
    const R = 9, hs = I.size / 2, shape = new THREE.Shape();
    shape.moveTo(-hs + R, -hs); shape.lineTo(hs - R, -hs); shape.quadraticCurveTo(hs, -hs, hs, -hs + R); shape.lineTo(hs, hs - R); shape.quadraticCurveTo(hs, hs, hs - R, hs);
    shape.lineTo(-hs + R, hs); shape.quadraticCurveTo(-hs, hs, -hs, hs - R); shape.lineTo(-hs, -hs + R); shape.quadraticCurveTo(-hs, -hs, -hs + R, -hs);
    const topG = new THREE.ShapeGeometry(shape, 10); topG.rotateX(-Math.PI / 2);
    const tp = topG.attributes.position, tuv = topG.attributes.uv;
    for (let i = 0; i < tp.count; i++) { tp.setX(i, tp.getX(i) + I.x); tp.setZ(i, tp.getZ(i) + I.z); tuv.setXY(i, (tp.getX(i) - ix0) / I.size, 1 - (tp.getZ(i) - iz0) / I.size); }
    const top = new THREE.Mesh(topG, toon('#ffffff', { map: tex })); top.receiveShadow = true; scene.add(top);
    const rim = shape.getPoints(10).map(p => [p.x + I.x, -p.y + I.z]); rim.pop();
    const soilTex = canvasTex(THREE, 8, 256, (c, w, h) => { const gr = c.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, '#6fa34a'); gr.addColorStop(.09, '#6fa34a'); gr.addColorStop(.1, '#8a5f3c'); gr.addColorStop(.55, '#76502f'); gr.addColorStop(.56, '#6a4a2e'); gr.addColorStop(1, '#4e3826'); c.fillStyle = gr; c.fillRect(0, 0, w, h); });
    const sideG = wallGeometry(THREE, rim.slice().reverse(), I.depth); sideG.translate(0, -I.depth, 0);
    const suv = sideG.attributes.uv; for (let i = 0; i < suv.count; i++) suv.setY(i, suv.getY(i));
    const side = new THREE.Mesh(sideG, toon('#ffffff', { map: soilTex, side: THREE.DoubleSide })); scene.add(side);
    const bottom = new THREE.Mesh(new THREE.ShapeGeometry(shape, 10).rotateX(Math.PI / 2).translate(I.x, -I.depth, I.z), toon('#4e3826')); scene.add(bottom);
    scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(rim.map(p => new THREE.Vector3(p[0], .02, p[1]))), new THREE.LineBasicMaterial({ color: '#2c3a1e', transparent: true, opacity: .5 })));
    // soft shadow under the island
    const sh = new THREE.Mesh(new THREE.PlaneGeometry(I.size * 1.7, I.size * 1.7), new THREE.MeshBasicMaterial({ map: canvasTex(THREE, 128, 128, (c) => { const r = c.createRadialGradient(64, 64, 10, 64, 64, 64); r.addColorStop(0, 'rgba(0,0,0,.45)'); r.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = r; c.fillRect(0, 0, 128, 128); }), transparent: true, depthWrite: false }));
    sh.rotation.x = -Math.PI / 2; sh.position.set(I.x, -I.depth - 7, I.z); scene.add(sh);
    const inIsland = (x, z) => Math.abs(x - I.x) < hs - 1.5 && Math.abs(z - I.z) < hs - 1.5;

    // hedges (bushy balls along the boundaries)
    const hedgeM = toon('#4f8a3c'), hedgeG = new THREE.IcosahedronGeometry(1, 1), hp = [];
    for (const h of SITE.paint.hedges) for (let i = 0; i < h.length - 1; i++) {
      const [ax, az] = px2m(...h[i]), [bx, bz] = px2m(...h[i + 1]), L = Math.hypot(bx - ax, bz - az), n = Math.ceil(L / 1.1);
      for (let j = 0; j <= n; j++) { const x = ax + (bx - ax) * j / n, z = az + (bz - az) * j / n; if (inIsland(x, z)) hp.push([x, z]); }
    }
    const hedge = new THREE.InstancedMesh(hedgeG, hedgeM, hp.length); const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3();
    hp.forEach(([x, z], i) => { const s = .75 + rnd() * .3; sc.set(s, s * (1 + rnd() * .3), s); m4.compose(new THREE.Vector3(x, .75, z), q, sc); hedge.setMatrixAt(i, m4); });
    hedge.castShadow = hedge.receiveShadow = true; scene.add(hedge); S.hedge = hedge;

    // buildings – drawn facades and coloured roofs
    const winTex = canvasTex(THREE, 256, 128, (c, w, h) => { c.fillStyle = '#f6efe2'; c.fillRect(0, 0, w, h); c.fillStyle = '#e2d6c2'; c.fillRect(0, h * .88, w, h * .12);
      c.fillStyle = '#4a6a8c'; c.fillRect(w * .36, h * .3, w * .28, h * .42); c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(w * .38, h * .32, w * .08, h * .38);
      c.strokeStyle = '#ffffff'; c.lineWidth = 7; c.strokeRect(w * .36, h * .3, w * .28, h * .42); c.beginPath(); c.moveTo(w * .5, h * .3); c.lineTo(w * .5, h * .72); c.stroke(); });
    winTex.wrapS = THREE.RepeatWrapping;
    const nightTex = canvasTex(THREE, 256, 128, (c, w, h) => { c.fillStyle = '#000'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffcf7a'; c.fillRect(w * .37, h * .31, w * .26, h * .4); });
    nightTex.wrapS = THREE.RepeatWrapping;
    const mainWall = toon('#ffffff', { map: winTex, emissiveMap: nightTex, emissive: '#ffcf7a', emissiveIntensity: 0, side: THREE.DoubleSide });
    const otherWall = toon('#f3ead9', { map: winTex, emissiveMap: nightTex, emissive: '#ffcf7a', emissiveIntensity: 0, side: THREE.DoubleSide });
    const lineMat = new THREE.LineBasicMaterial({ color: '#1d222c', transparent: true, opacity: .5 });
    S.walls = [mainWall, otherWall];
    const ROOFS = ['#b4553a', '#5d6673', '#8a5a44', '#4f5a68', '#a24b3a', '#6d6f75'];
    const noUV = () => [0, 0];
    SITE.blds.forEach((b, bi) => {
      const bc = b.p.reduce((a, q2) => [a[0] + q2[0] / b.p.length, a[1] + q2[1] / b.p.length], [0, 0]); if (!inIsland(bc[0], bc[1])) return;
      const area = polyArea(b.p), isMain = b.main === true || (SITE.main != null && b.id === SITE.main), wallH = isMain ? 3.4 : area < 25 ? 2.3 : area < 70 ? 2.6 : 3;
      const w = new THREE.Mesh(wallGeometry(THREE, b.p, wallH), isMain ? mainWall : otherWall); w.castShadow = w.receiveShadow = true; scene.add(w);
      const roofC = b.roof || SITE.roofColors[b.id] || ROOFS[bi % ROOFS.length];
      const r = new THREE.Mesh(roofGeometry(THREE, b.p, wallH, area < 25 ? .35 : .62, isMain ? 4.6 : 3.4, noUV), toon(roofC)); r.castShadow = r.receiveShadow = true; scene.add(r);
      scene.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(b.p.map(p => new THREE.Vector3(p[0], wallH + .02, p[1]))), lineMat));
      for (const p of b.p) scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(p[0], 0, p[1]), new THREE.Vector3(p[0], wallH, p[1])]), lineMat));
      if (area > 80) { const ch = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.6, .6), toon('#c9b8a6')); const [x, z] = b.p[1]; ch.position.set(bc[0] * .7 + x * .3, wallH + 3, bc[1] * .7 + z * .3); ch.castShadow = true; scene.add(ch); if (isMain) S.chim = ch.position.clone().setY(wallH + 3.9); }
    });

    // parked cars
    const car = (x, z, rot, col) => { const c = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, .6, 4.2), toon(col)); body.position.y = .55; c.add(body);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(1.6, .55, 2.2), toon('#cfe2f2')); cab.position.set(0, 1.12, -.2); c.add(cab);
      for (const [wx, wz] of [[-.85, 1.3], [.85, 1.3], [-.85, -1.3], [.85, -1.3]]) { const wh = new THREE.Mesh(new THREE.CylinderGeometry(.34, .34, .25, 12), toon('#24272e')); wh.rotation.z = Math.PI / 2; wh.position.set(wx, .34, wz); c.add(wh); }
      c.traverse(o => o.castShadow = true); c.position.set(x, 0, z); c.rotation.y = rot; scene.add(c); };
    for (const [px, py, rot, col] of SITE.cars) { const [x, z] = px2m(px, py); car(x, z, rot, col); }

    // birds flying around
    S.birds = [];
    const wingG = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, -.25), new THREE.Vector3(.9, 0, 0), new THREE.Vector3(0, 0, .25)]); wingG.setIndex([0, 1, 2]); wingG.computeVertexNormals();
    for (let i = 0; i < 4; i++) { const b = new THREE.Group(), m = new THREE.MeshBasicMaterial({ color: '#2b2f38', side: THREE.DoubleSide });
      const l = new THREE.Mesh(wingG, m), r2 = new THREE.Mesh(wingG, m); r2.scale.x = -1; b.add(l, r2); b.userData = { l, r: r2, ph: i * 1.3, rad: 26 + i * 5, h: 22 + i * 2.5, sp: .16 + i * .02 }; scene.add(b); S.birds.push(b); }

    // trees (drawn, swaying slightly)
    const leaf = toon('#4d9444'), leaf2 = toon('#6aae4e');
    const trunkM = new THREE.MeshToonMaterial({ color: '#6b4a32', gradientMap: grad });
    S.trees = [];
    SITE.trees.forEach(([px, py, r], i) => {
      const [x, z] = px2m(px, py), t = new THREE.Group(); if (!inIsland(x, z)) return;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .26, r * 1.1, 6), trunkM); trunk.position.y = r * .55; t.add(trunk);
      const crown = new THREE.Group(); crown.position.y = r * 1.25;
      for (let k = 0; k < 4; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (.55 + Math.random() * .25), 1), k % 2 ? leaf : leaf2);
        s.position.set((Math.random() - .5) * r * .8, Math.random() * r * .5, (Math.random() - .5) * r * .8); s.castShadow = true; crown.add(s); }
      t.add(crown); t.position.set(x, 0, z); t.userData = { crown, ph: i * 1.7 }; scene.add(t); S.trees.push(t);
    });

    // solar array: one row of site.array.n panels
    const cellTex = canvasTex(THREE, 96, 168, (c, w, h) => { const gr = c.createLinearGradient(0, 0, w, h); gr.addColorStop(0, '#1d2f5c'); gr.addColorStop(1, '#101a36'); c.fillStyle = gr; c.fillRect(0, 0, w, h);
      c.strokeStyle = 'rgba(170,195,240,.32)'; c.lineWidth = 1; for (let i = 1; i < 6; i++) { c.beginPath(); c.moveTo(i * w / 6, 0); c.lineTo(i * w / 6, h); c.stroke(); }
      for (let j = 1; j < 10; j++) { c.beginPath(); c.moveTo(0, j * h / 10); c.lineTo(w, j * h / 10); c.stroke(); } c.strokeStyle = '#d6dde8'; c.lineWidth = 4; c.strokeRect(0, 0, w, h); });
    const A = SITE.array, rdx = A.x1 - A.x0, rdz = A.z1 - A.z0, rlen = Math.hypot(rdx, rdz), pitch = rlen / A.n;
    const arr = new THREE.Group(); arr.position.set(A.x0, 0, A.z0); arr.rotation.y = -Math.atan2(rdz, rdx); scene.add(arr); S.arr = arr;
    const legM = toon('#a7afb9'), pg = new THREE.BoxGeometry(pitch - .03, .035, 1.66), lift = .55, cy = lift + .83 * Math.sin(A.tilt);
    for (let c = 0; c < A.n; c++) {
      const m = new THREE.MeshStandardMaterial({ map: cellTex, metalness: .5, roughness: .25, emissive: '#3b6cff', emissiveIntensity: 0 });
      const pnl = new THREE.Mesh(pg, m); pnl.position.set(pitch * (c + .5), cy, 0); pnl.rotation.x = A.tilt; pnl.castShadow = pnl.receiveShadow = true; arr.add(pnl);
      S.panels.push({ m, c, r: 0, mesh: pnl });
    }
    const zf = .83 * Math.cos(A.tilt), hb = lift + 1.66 * Math.sin(A.tilt);
    for (let x = .3; x < rlen; x += 2.9) {
      const f = new THREE.Mesh(new THREE.BoxGeometry(.07, lift, .07), legM); f.position.set(x, lift / 2, zf); f.castShadow = true; arr.add(f);
      const bk = new THREE.Mesh(new THREE.BoxGeometry(.07, hb, .07), legM); bk.position.set(x, hb / 2, -zf); bk.castShadow = true; arr.add(bk);
    }
    for (const [yy, zz] of [[lift, zf], [hb, -zf]]) { const r = new THREE.Mesh(new THREE.BoxGeometry(rlen, .06, .06), legM); r.position.set(rlen / 2, yy, zz); arr.add(r); }
    S.rowCenter = new THREE.Vector3(A.x0 + rdx / 2, 1.2, A.z0 + rdz / 2);
    // glints on the panels
    const starTex = canvasTex(THREE, 64, 64, (c) => { c.translate(32, 32); c.fillStyle = '#fff'; for (let i = 0; i < 4; i++) { c.rotate(Math.PI / 4); c.beginPath(); c.moveTo(0, -30); c.lineTo(3, 0); c.lineTo(0, 30); c.lineTo(-3, 0); c.fill(); }
      const r = c.createRadialGradient(0, 0, 0, 0, 0, 12); r.addColorStop(0, '#fff'); r.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = r; c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fill(); });
    S.sparks = [];
    for (let i = 0; i < 7; i++) { const sp2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, color: '#fff7dd', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 })); sp2.scale.set(1.4, 1.4, 1); scene.add(sp2); S.sparks.push({ s: sp2, ph: Math.random() * 6, idx: Math.floor(Math.random() * A.n) }); }

    // garden with 8 raised beds (site.garden)
    const G = SITE.garden; if (G) { const gg = new THREE.Group(); gg.position.set(G.x, 0, G.z); gg.rotation.y = -(G.rot || 0); scene.add(gg);
    const plank = toon('#9a6a43'), soil = toon('#5a3d28'), veg = [toon('#5fae4a'), toon('#7cc35a'), toon('#4b9a3f')], flower = [toon('#f2c14e'), toon('#e8697a'), toon('#b58cf0')];
    for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) {
      const bx = (i - 1.5) * 2.4, bz = (j - .5) * 3.2, bed = new THREE.Group(); bed.position.set(bx, 0, bz); gg.add(bed);
      const fr = new THREE.Mesh(new THREE.BoxGeometry(1.3, .42, 2.3), plank); fr.position.y = .21; fr.castShadow = fr.receiveShadow = true; bed.add(fr);
      const so = new THREE.Mesh(new THREE.BoxGeometry(1.12, .05, 2.12), soil); so.position.y = .43; bed.add(so);
      for (let k2 = 0; k2 < 6; k2++) { const isF = (i + j + k2) % 5 === 0, pl = new THREE.Mesh(new THREE.IcosahedronGeometry(isF ? .14 : .22 + rnd() * .08, 0), isF ? flower[(i + k2) % 3] : veg[(i + j + k2) % 3]);
        pl.position.set((k2 % 2 - .5) * .5, .55 + rnd() * .08, (Math.floor(k2 / 2) - 1) * .62); pl.castShadow = true; bed.add(pl); }
    } }
    // trampoline with a bouncing ball (site.trampoline)
    if (SITE.trampoline) { const tr = new THREE.Group(); tr.position.set(SITE.trampoline.x, 0, SITE.trampoline.z); scene.add(tr);
    const mat2 = new THREE.Mesh(new THREE.CylinderGeometry(1.9, 1.9, .05, 32), toon('#1f232b')); mat2.position.y = .9; mat2.receiveShadow = true; tr.add(mat2);
    const rim2 = new THREE.Mesh(new THREE.TorusGeometry(1.95, .13, 8, 40), toon('#3d8fd6')); rim2.rotation.x = Math.PI / 2; rim2.position.y = .92; rim2.castShadow = true; tr.add(rim2);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2, lg = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, .9, 6), legM); lg.position.set(Math.cos(a) * 1.85, .45, Math.sin(a) * 1.85); tr.add(lg); }
    S.ball = new THREE.Mesh(new THREE.SphereGeometry(.32, 16, 12), toon('#ef5a4c')); S.ball.castShadow = true; tr.add(S.ball); }
    // a row of conifers (site.conifers: [from px, to px, count])
    S.pines = [];
    if (SITE.conifers) { const [[ca, cb], [cc, cd], cn] = SITE.conifers, [c0x, c0z] = px2m(ca, cb), [c1x, c1z] = px2m(cc, cd), pine = toon('#2f6b3f'), pine2 = toon('#3b7d47');
    for (let i = 0; i < cn; i++) { const u = i / (cn - 1), x = c0x + (c1x - c0x) * u + (rnd() - .5) * .8, z = c0z + (c1z - c0z) * u, hgt = 6 + rnd() * 2.5, t2 = new THREE.Group();
      const tk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .24, 1.2, 6), trunkM); tk.position.y = .6; t2.add(tk);
      for (let k2 = 0; k2 < 3; k2++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7 - k2 * .4, hgt * .45, 9), k2 % 2 ? pine2 : pine); cone.position.y = 1.2 + k2 * hgt * .24 + hgt * .2; cone.castShadow = true; t2.add(cone); }
      t2.position.set(x, 0, z); t2.userData = { ph: i }; scene.add(t2); S.pines.push(t2); } }

    // inverter + battery, EV charger, grid pole
    const white = new THREE.MeshToonMaterial({ color: '#f4f4f2', gradientMap: grad }), dark = new THREE.MeshToonMaterial({ color: '#2a2f38', gradientMap: grad });
    const cab = new THREE.Group(); cab.position.set(SITE.cab.x, 0, SITE.cab.z); scene.add(cab);
    const inv = new THREE.Mesh(new THREE.BoxGeometry(.55, .75, .22), white); inv.position.set(-.5, 1.35, 0); inv.castShadow = true; cab.add(inv);
    S.batUnits = [];
    for (let k = 0; k < 2; k++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(.68, 1.15, .18), white); b.position.set(.25 + k * .8, .6, 0); b.castShadow = true; cab.add(b);
      const bar = new THREE.Mesh(new THREE.BoxGeometry(.05, 1, .02), new THREE.MeshBasicMaterial({ color: '#6fd6a6' })); bar.position.set(.25 + k * .8, .1, .1); bar.geometry.translate(0, .5, 0); cab.add(bar); S.batUnits.push(bar);
    }
    S.led = new THREE.Mesh(new THREE.SphereGeometry(.035, 8, 8), new THREE.MeshBasicMaterial({ color: '#6fd6a6' })); S.led.position.set(-.5, 1.6, .12); cab.add(S.led);
    const ev = new THREE.Group(); ev.position.set(SITE.ev.x, 0, SITE.ev.z); scene.add(ev);
    const post = new THREE.Mesh(new THREE.BoxGeometry(.32, 1.35, .22), dark); post.position.y = .68; post.castShadow = true; ev.add(post);
    S.evRing = new THREE.Mesh(new THREE.TorusGeometry(.1, .025, 8, 24), new THREE.MeshBasicMaterial({ color: '#e690bb' })); S.evRing.position.set(0, 1.08, .12); ev.add(S.evRing);
    const pole = new THREE.Group(); pole.position.set(SITE.pole.x, 0, SITE.pole.z); scene.add(pole);
    const wood = new THREE.MeshToonMaterial({ color: '#7a5a3e', gradientMap: grad });
    const pm = new THREE.Mesh(new THREE.CylinderGeometry(.13, .17, 8, 8), wood); pm.position.y = 4; pm.castShadow = true; pole.add(pm);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, .12, .12), wood); arm.position.y = 7.4; pole.add(arm);
    // overhead cable from the pole to the house (site.wire)
    const wire = new THREE.QuadraticBezierCurve3(new THREE.Vector3(SITE.pole.x + .8, 7.4, SITE.pole.z), new THREE.Vector3((SITE.pole.x + SITE.cab.x) / 2, 3.5, (SITE.pole.z + SITE.cab.z) / 2 - 6), new THREE.Vector3(...SITE.wire));
    scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(wire.getPoints(40)), new THREE.LineBasicMaterial({ color: '#1b1f27' })));

    // energy flows (site.via)
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const hub = V(SITE.cab.x - .5, 1.4, SITE.cab.z + .3);
    const curves = {
      pv: new THREE.CatmullRomCurve3([S.rowCenter.clone().setY(1.6), ...SITE.via.pv.map(p => V(...p)), hub]),
      grid: new THREE.CatmullRomCurve3([hub, ...SITE.via.grid.map(p => V(...p)), V(SITE.pole.x + .8, 7.4, SITE.pole.z)]),
      home: new THREE.CatmullRomCurve3([hub, ...SITE.via.home.map(p => V(...p)), V(SITE.house.x, 7.5, SITE.house.z)]),
      bat: new THREE.CatmullRomCurve3([hub, V(SITE.cab.x + .2, 1.9, SITE.cab.z + .4), V(SITE.cab.x + .65, 1.25, SITE.cab.z + .2)]),
      ev: new THREE.CatmullRomCurve3([hub, ...SITE.via.ev.map(p => V(...p)), V(SITE.ev.x, 1.1, SITE.ev.z + .2)]),
    };
    const gl = glowTex(THREE), COLORS = { pv: '#e9b85c', grid: '#a99cf0', home: '#86c8ea', bat: '#6fd6a6', ev: '#e690bb', exp: '#ee9b6c' };
    for (const k in curves) {
      const n = 26, geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      const mat = new THREE.PointsMaterial({ map: gl, color: COLORS[k], size: 1.1, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; scene.add(pts);
      const tube = new THREE.Mesh(new THREE.TubeGeometry(curves[k], 60, .045, 6), new THREE.MeshBasicMaterial({ color: COLORS[k], transparent: true, opacity: 0, depthWrite: false }));
      scene.add(tube);
      S.flows[k] = { curve: curves[k], pts, tube, n, w: 0, dir: 1, ph: Math.random(), vis: 0, len: curves[k].getLength() };
    }
    S.COLORS = COLORS;

    // clouds + rain + stars
    const cloudM = new THREE.MeshToonMaterial({ color: '#ffffff', gradientMap: grad, transparent: true, opacity: .92 });
    for (let i = 0; i < 7; i++) {
      const c = new THREE.Group();
      for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(3 + Math.random() * 2.5, 1), cloudM); s.position.set(k * 3.2 - 6, Math.random() * 1.5, (Math.random() - .5) * 4); s.castShadow = true; c.add(s); }
      c.position.set(-120 + Math.random() * 240, 42 + Math.random() * 10, -90 + Math.random() * 150); c.visible = false; scene.add(c); S.clouds.push(c);
    }
    const starG = new THREE.BufferGeometry(), sp = [];
    for (let i = 0; i < 500; i++) { const a = Math.random() * Math.PI * 2, e = Math.random() * .9 + .1, r = 380; sp.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r); }
    starG.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    S.stars = new THREE.Points(starG, new THREE.PointsMaterial({ color: '#ffffff', size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false })); scene.add(S.stars);
    const rg = new THREE.BufferGeometry(), rp = []; for (let i = 0; i < 1400; i++) rp.push((Math.random() - .5) * 140, Math.random() * 50, (Math.random() - .5) * 140 - 10);
    rg.setAttribute('position', new THREE.Float32BufferAttribute(rp, 3));
    S.rain = new THREE.Points(rg, new THREE.PointsMaterial({ color: '#b9cbe6', size: .18, transparent: true, opacity: .7 })); S.rain.visible = false; scene.add(S.rain);
    S.yard = new THREE.PointLight('#ffcf8a', 0, 26, 1.6); S.yard.position.set(...SITE.yard); scene.add(S.yard);

    // signs on posts
    S.labelPos = {}; S.signBob = {};
    const postM = toon('#f2efe8'), capM = toon('#3a3f4a');
    for (const [k, sgn] of Object.entries(SITE.signs)) {
      S.labelPos[k] = V(sgn.x, sgn.y1, sgn.z); S.labels[k] = this.$('lab-' + k);
      const ph = new THREE.Mesh(new THREE.CylinderGeometry(.07, .09, sgn.y1 - sgn.y0, 8), postM); ph.position.set(sgn.x, (sgn.y0 + sgn.y1) / 2, sgn.z); ph.castShadow = true; scene.add(ph);
      const cap = new THREE.Mesh(new THREE.SphereGeometry(.16, 12, 8), capM); cap.position.set(sgn.x, sgn.y1, sgn.z); scene.add(cap);
      if (!sgn.y0) { const ft = new THREE.Mesh(new THREE.CylinderGeometry(.35, .45, .12, 12), capM); ft.position.set(sgn.x, .06, sgn.z); scene.add(ft); }
    }
    // chimney smoke, coins when exporting, a bolt at the battery
    S.smoke = [];
    for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: gl, color: '#eef1f5', transparent: true, depthWrite: false, opacity: 0 })); scene.add(s); S.smoke.push({ s, age: i / 9 * 4.5 }); }
    const coinM = toon('#f2c14e', { emissive: '#7a5a10', emissiveIntensity: .35 }), coinG = new THREE.CylinderGeometry(.42, .42, .09, 20);
    S.coins = []; for (let i = 0; i < 10; i++) { const m = new THREE.Mesh(coinG, coinM.clone()); m.material.transparent = true; m.visible = false; m.rotation.x = Math.PI / 2; scene.add(m); S.coins.push({ m, life: 0 }); }
    S.coinT = 0;
    const boltTex = canvasTex(THREE, 64, 64, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(36, 4); c.lineTo(14, 36); c.lineTo(30, 36); c.lineTo(24, 60); c.lineTo(50, 24); c.lineTo(33, 24); c.closePath(); c.fill(); });
    S.bolt = new THREE.Sprite(new THREE.SpriteMaterial({ map: boltTex, color: '#6fd6a6', transparent: true, depthWrite: false })); S.bolt.scale.set(1.1, 1.1, 1); S.bolt.position.set(SITE.cab.x + .7, 2.6, SITE.cab.z); scene.add(S.bolt);
    S.defTarget = new THREE.Vector3(SITE.island.x + 2, -1, SITE.island.z + 1);

    // camera: flies in from a top view
    S.target = S.defTarget.clone();
    S.orbit = { az: -.72, el: .52, dist: 150, tAz: -.72, tEl: .52, tDist: 150 };
    S.intro = { t: 0, from: { el: 1.45, dist: 240 } };
    S.orbit.el = 1.45; S.orbit.dist = 240;
    this._controls3d(renderer.domElement);
    this.$('b3top').onclick = () => { S.focus = null; S.orbit.tEl = 1.5; S.orbit.tDist = 170; S.orbit.tAz = 0; S.idleAt = performance.now() + 8000; };
    this.$('b3tour').onclick = () => { S.focus = null; S.orbit.tEl = .52; S.orbit.tDist = 150; S.tour = !S.tour; S.idleAt = 0; this.$('b3tour').textContent = S.tour ? 'Stop' : 'Rundtur'; };

    // pause when not visible
    S.io = new IntersectionObserver(en => { S.visible = en[0].isIntersecting; }, { threshold: .02 }); S.io.observe(stage);
    S.ro = new ResizeObserver(() => { renderer.setSize(W(), H(), false); cam.aspect = W() / H(); cam.updateProjectionMatrix(); }); S.ro.observe(stage);

    const ld = this.$('loading'); ld.style.opacity = 0; setTimeout(() => ld.remove(), 900);
    S.started = performance.now();
    this._update();
    const loop = t => { if (!this._3d || this._3d.dead) return; requestAnimationFrame(loop); this._frame3d(t); };
    requestAnimationFrame(loop);
  },

  _controls3d(el) {
    const S = this._3d, ptrs = new Map(); let pinch0 = 0;
    el.addEventListener('pointerdown', e => { el.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]); S.idleAt = performance.now() + 9000; S.tour = false; this.$('b3tour').textContent = 'Rundtur'; });
    el.addEventListener('pointermove', e => {
      if (!ptrs.has(e.pointerId)) return; const [px, py] = ptrs.get(e.pointerId); ptrs.set(e.pointerId, [e.clientX, e.clientY]);
      if (ptrs.size === 1) { S.orbit.tAz -= (e.clientX - px) * .006; S.orbit.tEl = Math.max(.18, Math.min(1.52, S.orbit.tEl + (e.clientY - py) * .005)); }
      else if (ptrs.size === 2) { const p = [...ptrs.values()], d = Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1]); if (pinch0) S.orbit.tDist = Math.max(40, Math.min(240, S.orbit.tDist * pinch0 / d)); pinch0 = d; }
      S.idleAt = performance.now() + 9000;
    });
    const up = e => { ptrs.delete(e.pointerId); pinch0 = 0; };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    el.addEventListener('wheel', e => { e.preventDefault(); S.orbit.tDist = Math.max(40, Math.min(240, S.orbit.tDist * (1 + Math.sign(e.deltaY) * .1))); S.idleAt = performance.now() + 9000; }, { passive: false });
    el.addEventListener('dblclick', () => { S.focus = null; S.orbit.tDist = S.orbit.tDist > 90 ? 60 : 150; });
  },

  _frame3d(t) {
    const S = this._3d; if (!S.visible || document.hidden || !this.isConnected) { S.last = t; return; }
    const SITE = this._site, MAXW = this._plant.max_power;
    const { THREE } = S, dt = Math.min(.05, (t - (S.last || t)) / 1000); S.last = t; S.t += dt;
    const o = S.orbit;
    // intro flight
    if (S.intro) { S.intro.t = Math.min(1, (t - S.started) / 4200); const e = 1 - Math.pow(1 - S.intro.t, 3);
      o.el = S.intro.from.el + (o.tEl - S.intro.from.el) * e; o.dist = S.intro.from.dist + (o.tDist - S.intro.from.dist) * e; o.az = o.tAz - (1 - e) * .6; if (S.intro.t >= 1) S.intro = null; }
    else {
      const idle = !S.idleAt || t > S.idleAt;
      if (S.tour) o.tAz += dt * .22; else if (idle) o.tAz += dt * .028;
      o.az += (o.tAz - o.az) * Math.min(1, dt * 4); o.el += (o.tEl - o.el) * Math.min(1, dt * 4); o.dist += (o.tDist - o.dist) * Math.min(1, dt * 4);
    }
    S.target.lerp(S.focus || S.defTarget, Math.min(1, dt * 2.5));
    S.cam.position.set(S.target.x + Math.sin(o.az) * Math.cos(o.el) * o.dist, S.target.y + Math.sin(o.el) * o.dist, S.target.z + Math.cos(o.az) * Math.cos(o.el) * o.dist);
    S.cam.lookAt(S.target);

    // flows
    for (const k in S.flows) {
      const f = S.flows[k], on = f.w > 25 ? 1 : 0; f.vis += (on - f.vis) * Math.min(1, dt * 2);
      const kk = Math.sqrt(Math.min(f.w, MAXW) / MAXW);
      f.ph = (f.ph + dt * (2.5 + kk * 9) / f.len) % 1; if (!Number.isFinite(f.ph)) f.ph = 0;
      const a = f.pts.geometry.attributes.position.array;
      for (let i = 0; i < f.n; i++) { let u = (f.ph + i / f.n) % 1; if (f.dir < 0) u = 1 - u; const p = f.curve.getPointAt(Math.min(1, Math.max(0, u))); a[i * 3] = p.x; a[i * 3 + 1] = p.y; a[i * 3 + 2] = p.z; }
      f.pts.geometry.attributes.position.needsUpdate = true;
      f.pts.material.opacity = f.vis * .95; f.pts.material.size = .7 + kk * 1.1; f.tube.material.opacity = f.vis * .22;
    }
    // panels: a light wave while producing
    const pvK = Math.min(1, (S.values.pv || 0) / (this._plant.pv_capacity * 9 / 10));
    for (const p of S.panels) p.m.emissiveIntensity = pvK * (.12 + .5 * Math.max(0, Math.sin(S.t * 2.2 - p.c * .55 - p.r * .9)) ** 6);
    // glints on the panels
    for (const g3 of S.sparks) { g3.ph += dt * (1.3 + Math.random() * .2); const v3 = Math.max(0, Math.sin(g3.ph)) ** 8 * Math.min(1, (S.values.pv || 0) / 1500) * (S.day || 0);
      if (g3.ph > Math.PI * 2) { g3.ph = 0; g3.idx = Math.floor(Math.random() * S.panels.length); }
      const pm2 = S.panels[g3.idx].mesh; pm2.getWorldPosition(g3.s.position); g3.s.position.y += .5; g3.s.material.opacity = v3; g3.s.scale.setScalar(.6 + v3 * 1.4); }
    // ball on the trampoline
    if (S.ball) { const hop = Math.abs(Math.sin(S.t * 2.6)); S.ball.position.set(Math.sin(S.t * .7) * .4, 1.25 + hop * 2.4, Math.cos(S.t * .9) * .3); S.ball.scale.set(1, hop < .12 ? .78 : 1, 1); S.ball.visible = (S.day || 0) > .3; }
    // smoke
    if (S.chim) for (const sm of S.smoke) { sm.age += dt; if (sm.age > 4.5) sm.age = 0; const u = sm.age / 4.5;
      sm.s.position.set(S.chim.x + u * 2.2 * (S.wind || 1), S.chim.y + u * 5, S.chim.z - u * .8); sm.s.scale.setScalar(.6 + u * 2.6); sm.s.material.opacity = Math.sin(u * Math.PI) * .45; }
    // coins while exporting
    const expW = S.values.grid < -100 && !S.values.offline ? -S.values.grid : 0; S.coinT -= dt;
    if (expW && S.coinT <= 0) { const c2 = S.coins.find(c => c.life <= 0); if (c2) { c2.life = 2.4; c2.vx = (Math.random() - .5) * 1.2; c2.m.position.set(SITE.pole.x + .8, 7.6, SITE.pole.z); c2.m.visible = true; } S.coinT = 1.4 - Math.min(1, expW / 7000) * 1.05; }
    for (const c2 of S.coins) { if (c2.life <= 0) continue; c2.life -= dt; c2.m.position.y += dt * 2.6; c2.m.position.x += dt * c2.vx; c2.m.rotation.z += dt * 6;
      c2.m.material.opacity = Math.min(1, c2.life / .8); if (c2.life <= 0) c2.m.visible = false; }
    // bolt above the battery
    const bw2 = S.values.bat || 0; S.bolt.visible = Math.abs(bw2) > 25 && !S.values.offline;
    S.bolt.material.color.setStyle(bw2 > 0 ? '#6fd6a6' : '#ee9b6c'); S.bolt.position.y = 2.6 + Math.sin(S.t * 3) * .18; S.bolt.material.opacity = .6 + .4 * Math.abs(Math.sin(S.t * 3));
    // trees sway, clouds drift, rain falls
    for (const pn of S.pines) pn.rotation.z = Math.sin(S.t * .8 + pn.userData.ph) * .012 * (S.wind || 1);
    for (const tr of S.trees) { tr.userData.crown.rotation.z = Math.sin(S.t * .9 + tr.userData.ph) * .025 * (S.wind || 1); tr.userData.crown.rotation.x = Math.cos(S.t * .7 + tr.userData.ph) * .02 * (S.wind || 1); }
    for (const c of S.clouds) { if (!c.visible) continue; c.position.x += dt * (1.2 + (S.wind || 1) * .8); if (c.position.x > 140) c.position.x = -140; }
    for (const b of S.birds) { const u = b.userData, a = S.t * u.sp + u.ph; b.position.set(SITE.island.x + Math.cos(a) * u.rad, u.h + Math.sin(S.t * .7 + u.ph) * 1.5, SITE.island.z + Math.sin(a) * u.rad);
      b.rotation.y = -a; const f = Math.sin(S.t * 9 + u.ph * 3) * .6; u.l.rotation.z = f; u.r.rotation.z = -f; b.visible = S.day > .2; }
    if (S.rain.visible) { const a = S.rain.geometry.attributes.position.array; for (let i = 1; i < a.length; i += 3) { a[i] -= dt * 28; if (a[i] < 0) a[i] += 50; } S.rain.geometry.attributes.position.needsUpdate = true; }
    if (S.evRing) S.evRing.material.color.setStyle(S.evOn ? (Math.sin(S.t * 4) > 0 ? '#ff9ccc' : '#b0507e') : '#4a3440');
    S.led.material.color.setStyle(S.fault ? (Math.sin(S.t * 6) > 0 ? '#ef6b7b' : '#401016') : (Math.sin(S.t * 2) > -.6 ? '#6fd6a6' : '#1c3a2c'));

    // signs
    const w = S.renderer.domElement.clientWidth, h = S.renderer.domElement.clientHeight, v = new THREE.Vector3();
    const keys = Object.keys(S.labels), introK = S.intro ? S.intro.t : 1;
    const L = [];
    keys.forEach((k, i) => {
      const el = S.labels[k]; if (!el) return;
      v.copy(S.labelPos[k]).project(S.cam);
      const vis = v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
      const d2 = S.cam.position.distanceTo(S.labelPos[k]), sc = Math.max(.72, Math.min(1.08, 105 / d2));
      el.classList.toggle('far', d2 > 115);
      const appear = Math.max(0, Math.min(1, (introK - .55 - i * .06) / .25)), spring = appear < 1 ? 1 - Math.cos(appear * Math.PI * 2.5) * (1 - appear) * .35 : 1;
      const s2 = sc * spring * (.6 + .4 * appear);
      L.push({ el, i, vis, appear, d2, s2, x: (v.x * .5 + .5) * w, y: (-v.y * .5 + .5) * h + Math.sin(S.t * 1.4 + i) * 2.5, bw: el.offsetWidth * s2, bh: (el.offsetHeight + 10) * s2 });
    });
    // spread overlapping signs: the ones further back are lifted
    L.sort((a, b) => a.d2 - b.d2);
    const placed = [];
    for (const s of L) {
      let lift = 0;
      for (let it = 0; it < 8; it++) {
        const top = s.y - s.bh - lift, hit = placed.find(q => q.vis && Math.abs(q.x - s.x) < (q.bw + s.bw) / 2 + 4 && top < q.y - q.lift && top + s.bh > q.y - q.bh - q.lift);
        if (!hit || !s.vis) break; lift = (s.y - (hit.y - hit.bh - hit.lift)) + 4 - 0;
        lift = Math.max(lift, 0);
      }
      s.lift = s.lift === undefined ? lift : lift; s.el._lift = (s.el._lift || 0) + (lift - (s.el._lift || 0)) * Math.min(1, dt * 6);
      placed.push({ ...s, lift: s.el._lift });
      s.el.style.opacity = s.vis ? s.appear : 0; s.el.style.zIndex = String(1000 - Math.round(s.d2));
      s.el.style.setProperty('--stem', `${s.el._lift / s.s2}px`);
      s.el.style.transform = `translate(${s.x}px,${s.y - s.el._lift}px) translate(-50%,calc(-100% - 10px)) scale(${s.s2})`;
    }
    S.renderer.render(S.scene, S.cam);
  },

  _update3d(d) {
    const S = this._3d; if (!S) return;
    const { THREE } = S;
    S.values = d; S.evOn = d.evOn; S.fault = d.fault || d.offline;
    const imp = d.grid > 0, off = d.offline;
    const set = (k, w, dir, col) => { const f = S.flows[k]; f.w = off ? 0 : w; f.dir = dir; if (col) { f.pts.material.color.setStyle(col); f.tube.material.color.setStyle(col); } };
    set('pv', d.pv, 1); set('home', d.load, 1); set('grid', Math.abs(d.grid), imp ? -1 : 1, imp ? S.COLORS.grid : S.COLORS.exp);
    set('bat', Math.abs(d.bat), d.bat > 0 ? 1 : -1); set('ev', d.evOn ? 2500 : 0, 1);
    S.batUnits.forEach(b => b.scale.y = Math.max(.02, d.soc / 100));
    // sun, sky and night
    const sun = this.s('sun'), el = sun ? sun.attributes.elevation : 30, az = sun ? sun.attributes.azimuth : 180;
    const er = THREE.MathUtils.degToRad(Math.max(el, -6)), ar = THREE.MathUtils.degToRad(az);
    if (el > -3) S.sun.position.set(Math.sin(ar) * Math.cos(er) * 160, Math.max(4, Math.sin(er) * 160), -Math.cos(ar) * Math.cos(er) * 160 - 10);
    else S.sun.position.set(-Math.sin(ar) * 90, 120, Math.cos(ar) * 90 - 10); // moon opposite the sun
    const day = S.day = THREE.MathUtils.clamp((el + 4) / 14, 0, 1), dusk = THREE.MathUtils.clamp(1 - Math.abs(el - 2) / 10, 0, 1);
    const sky = new THREE.Color('#1a2440').lerp(new THREE.Color('#9cc7ea'), day).lerp(new THREE.Color('#e9a27a'), dusk * .45);
    const cloud = this.n('cloud') / 100, rain = this.n('rain') > 0;
    sky.lerp(new THREE.Color('#8e99a6'), cloud * .35 * day);
    const top = new THREE.Color('#070b18').lerp(new THREE.Color('#5d9be0'), day).lerp(new THREE.Color('#7a6aa8'), dusk * .45).lerp(new THREE.Color('#8793a1'), cloud * .5 * day);
    const low = sky.clone().lerp(new THREE.Color('#ffffff'), .25 * day);
    this.$('stage').style.background = `radial-gradient(120% 90% at 50% 100%, #${low.getHexString()} 0%, #${sky.getHexString()} 45%, #${top.getHexString()} 100%)`;
    S.sun.intensity = el > -3 ? 2.6 * day * (1 - cloud * .55) + .15 : .7 * (1 - cloud * .5); S.sun.color.setStyle(el <= -3 ? '#9fb6ff' : dusk > .4 ? '#ffc08a' : '#fff3df');
    S.hemi.intensity = .65 + .75 * day; S.hemi.color.setStyle(day > .3 ? '#dfefff' : '#7d93d6');
    S.walls.forEach(m => m.emissiveIntensity = (1 - day) * .9); S.yard.intensity = (1 - day) * 9;
    S.stars.material.opacity = (1 - day) * .9;
    S.renderer.toneMappingExposure = .95 + .15 * day;
    const nC = Math.round(cloud * S.clouds.length); S.clouds.forEach((c, i) => { c.visible = i < nC; c.children.forEach(m => m.material.color && m.material.color.setStyle(rain ? '#9aa3ad' : '#ffffff')); });
    S.rain.visible = rain; S.wind = Math.max(.5, this.n('wind') / 4);

    // signs
    const sg = (k, val, sub, frac) => { const e = this.$('lab-' + k); if (!e) return; const old = this.$('lv-' + k).textContent;
      this.txt('lv-' + k, val); this.txt('ls-' + k, sub); this.width('lb-' + k, frac);
      if (old !== '–' && old !== val && /[0-9]/.test(val) && Math.abs(parseFloat(old.replace(/[^0-9,]/g, '').replace(',', '.')) - parseFloat(val.replace(/[^0-9,]/g, '').replace(',', '.'))) > .3) { e.classList.remove('pulse'); void e.offsetWidth; e.classList.add('pulse'); } };
    const selfPct = Math.round(Math.min(1, d.pv / Math.max(d.load, 1)) * 100), P = this._plant;
    sg('pv', off ? '–' : fmtW(d.pv), `I dag ${fmtN(d.pvDay, 1)} kWh · ${this._site.array.n} paneler`, d.pv / P.pv_capacity);
    sg('home', off ? '–' : fmtW(d.load), off ? 'Offline' : `${selfPct} % fra solen lige nu`, d.load / P.max_power);
    sg('bat', `${Math.round(d.soc)} %`, off ? 'Offline' : Math.abs(d.bat) < 25 ? 'Hviler' : `${d.bat > 0 ? 'Lader +' : 'Aflader −'}${fmtW(d.bat)}`, d.soc / 100);
    sg('grid', off ? '–' : Math.abs(d.grid) < 25 ? 'I balance' : (imp ? '↓ ' : '↑ ') + fmtW(d.grid), d.hasPrice ? `${Math.abs(d.grid) < 25 ? '' : imp ? 'Køber · ' : 'Sælger · '}${fmtN(d.priceNow, 2)} kr/kWh` : Math.abs(d.grid) < 25 ? '' : imp ? 'Køber' : 'Sælger', Math.abs(d.grid) / P.max_power);
    sg('ev', d.evOn ? 'Lader' : 'Standby', `${fmtN(this.n('evTemp'), 0)} °C · ${kwh(d.evTot)} kWh i alt`, d.evOn ? 1 : 0);
    const lg = this.$('lab-grid'); if (lg) lg.style.setProperty('--c', imp ? 'var(--grid)' : 'var(--exp)');
    for (const k of ['pv', 'home', 'grid', 'ev']) { const e = this.$('lab-' + k); if (e) e.classList.toggle('dim', S.flows[k].w < 25); }
    // info bar
    this.html('i3pv', `${fmtN(d.pvDay, 1)}<em>kWh</em>`); this.html('i3use', `${fmtN(d.cons, 1)}<em>kWh</em>`); this.html('i3aut', `${Math.round(d.aut)}<em>%</em>`);
    this.html('i3price', d.hasPrice ? `${fmtN(d.priceNow, 2)}<em>kr</em>` : '–'); this.html('i3save', d.hasPrice ? `${fmtN(d.selfUse * d.mean, 0)}<em>kr</em>` : '–');
    const tmp = this.n('temp'), wnd = this.n('wind');
    const wx = [this.has('temp') ? `${fmtN(tmp, 1)}°` : null, this.has('wind') ? `${fmtN(wnd, 0)} m/s` : null].filter(Boolean);
    this.html('wx3', wx.length ? `${ic(rain ? 'rain' : cloud > .6 ? 'cloud' : 'sun', 13).replace('class="i"', 'class="i" style="opacity:.85"')}${wx.join(' · ')}` : '');
    const wxEl = this.$('wx3'); if (wxEl && !wx.length) wxEl.style.display = 'none'; else if (wxEl && wxEl.style.display === 'none') wxEl.style.display = '';
    this.txt('summary3', this.$('summary') ? this.$('summary').textContent : this._summaryText(d));
    this.pill('live3', off ? 'Offline' : 'Live', off ? 'var(--bad)' : 'var(--bat)');
  },

  _focus3d(k, pop) {
    const S = this._3d, sg = this._site.signs[k]; if (!S || !sg) { this.openPopup(pop); return; }
    const tgt = k === 'pv' ? S.rowCenter.clone().setY(0) : new S.THREE.Vector3(sg.x, 0, sg.z);
    S.focus = tgt; S.orbit.tDist = k === 'pv' ? 62 : 46; S.orbit.tEl = .55; S.tour = false; S.idleAt = performance.now() + 15000;
    clearTimeout(this._focusT); this._focusT = setTimeout(() => this.openPopup(pop), 750);
  },

  _summaryText(d) {
    if (d.offline) return 'Ingen forbindelse til anlægget.';
    const pv = d.pv, load = d.load, imp = d.grid > 25, exp = d.grid < -25;
    if (pv > 50 && exp) return 'Solen dækker huset, og overskuddet sælges.';
    if (pv > 50 && d.bat > 25 && !imp) return 'Solen dækker huset og lader batteriet.';
    if (pv > 50 && imp) return `Solen dækker ${Math.round(Math.min(1, pv / Math.max(load, 1)) * 100)} % af forbruget lige nu.`;
    if (pv > 50) return 'Solen dækker forbruget lige nu.';
    if (d.bat < -25) return 'Batteriet forsyner huset.';
    return imp ? 'Huset forsynes fra elnettet.' : 'Anlægget er i ro.';
  },
};
