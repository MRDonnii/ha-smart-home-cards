const VERSION = "0.10.3";

/* ha-navbar-card
 * Erstatning for decluttering-templaten "global_navbar_front_responsive".
 *
 * Kortet laeser SAMME config-struktur som custom:navbar-card (routes med
 * icon / icon_selected / label / url / popup / badge) og evaluerer badge-
 * udtrykkene i "[[[ ... ]]]"-form uaendret. Dermed er badge-adfaerden ikke
 * skrevet om, men genbrugt - der er ingen risiko for afskrivningsfejl i de
 * 20 udtryk.
 *
 * Ud over det oprindelige:
 *   - glidende aktiv-markering i stedet for et spring
 *   - notifikationscenter der samler alle aktive badges
 *   - pulserende badges naar farven signalerer en advarsel
 *   - popup med ikon, titel og valgfri statuslinje
 *
 * Ydelse: kortet abonnerer ikke paa alt. Det udleder hvilke entiteter der
 * naevnes i udtrykkene, og genberegner kun naar en af DEM aendrer state.
 */

const PULSE_FARVER = ["--error-color", "--warning-color"];

// config-noegle -> CSS-variabel. Alle er rene pixelvaerdier, saa de kan
// haandteres ens - baade ved saetning og ved oprydning.
const NB_STOERRELSER = {
  max_width: "--nb-maxbredde",
  bottom_offset: "--nb-bund",
  height: "--nb-hoejde",
  icon_size: "--nb-ikon",
  radius: "--nb-radius",
  gap: "--nb-mellemrum",
  item_min_width: "--nb-knapbredde",
  item_height: "--nb-knaphoejde",
  item_radius: "--nb-knapradius",
  indicator_inset: "--nb-indikator-luft",
  badge_size: "--nb-badge",
  label_size: "--nb-etiket",
};

// Een hentning pr. url pr. browserfane, delt af alle kort paa alle sider.
// Uden den ville navbaren hente filen forfra ved hver eneste navigation.
const NB_DELT_CACHE = new Map();

// Sidst kendte indhold gemmes i localStorage, saa det kan laeses SYNKRONT
// naar kortet bygges foerste gang paa en side. Uden det skal kortet vente paa
// et netvaerkskald foer det kan tegne noget som helst - paa mobil er baren
// derfor helt vaek i starten. Hentningen sker stadig i baggrunden bagefter og
// opdaterer kun hvis filen faktisk har aendret sig.
const NB_GEM_NOEGLE = "ha-navbar-card:";

function nbLaesGemt(url) {
  try {
    const raa = window.localStorage.getItem(NB_GEM_NOEGLE + url);
    return raa ? JSON.parse(raa) : null;
  } catch (e) {
    return null; // privat browsing, fyldt kvote eller oedelagt JSON
  }
}

function nbGem(url, data) {
  try {
    window.localStorage.setItem(NB_GEM_NOEGLE + url, JSON.stringify(data));
  } catch (e) {
    /* ikke kritisk - vi mister blot den hurtige start naeste gang */
  }
}

// ha-icon slaar hvert ikon op i Home Assistants MDI-saet asynkront. Med otte
// ikoner i baren betyder det otte opslag foer noget er synligt - tydeligt paa
// mobil. Naar et ikon foerst ER tegnet, hoester vi dets SVG-sti og gemmer den,
// saa den kan tegnes synkront som ren <svg> naeste gang.
const NB_IKON_NOEGLE = "ha-navbar-card:ikoner";
let NB_IKONER = null;

function nbIkoner() {
  if (NB_IKONER) return NB_IKONER;
  try {
    NB_IKONER = JSON.parse(window.localStorage.getItem(NB_IKON_NOEGLE) || "{}");
  } catch (e) {
    NB_IKONER = {};
  }
  return NB_IKONER;
}

let nbGemTimer = null;
function nbGemIkoner() {
  // Saml skrivningerne - hoestningen sker ikon for ikon.
  if (nbGemTimer) return;
  nbGemTimer = setTimeout(() => {
    nbGemTimer = null;
    try {
      window.localStorage.setItem(NB_IKON_NOEGLE, JSON.stringify(NB_IKONER || {}));
    } catch (e) { /* ikke kritisk */ }
  }, 1200);
}

function nbHentDeltConfig(url) {
  if (!NB_DELT_CACHE.has(url)) {
    const hentning = fetch(url, { cache: "no-cache" })
      .then((svar) => {
        if (!svar.ok) throw new Error(`HTTP ${svar.status}`);
        return svar.json();
      })
      .catch((e) => {
        // Fjern den fejlede hentning igen, ellers arver hvert efterfoelgende
        // kort fejlen uden nogensinde at proeve om filen er kommet tilbage.
        NB_DELT_CACHE.delete(url);
        throw e;
      });
    NB_DELT_CACHE.set(url, hentning);
  }
  return NB_DELT_CACHE.get(url);
}

class HaNavbarCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._bygget = false;
    this._aabenIndex = null;
    this._sidsteSignatur = "";
    this._sidsteSti = "";
    this._udtrykCache = new Map();
    this._sporedeEntiteter = [];
    this._notifikationerAabne = false;
    this._sidsteAntalNotifikationer = 0;
    this._onNavigation = () => this._opdaterAktiv();
  }

  setConfig(config) {
    if (!config) throw new Error("ha-navbar-card: config mangler");
    const url = config.config_url || config.routes_url;
    if (!Array.isArray(config.routes) && !url) {
      throw new Error("ha-navbar-card: angiv enten 'routes', 'config_url' eller 'routes_url'");
    }

    // Kortets egne vaerdier er overstyringer oven paa den faelles fil. Tomme
    // felter taeller ikke med, saa et blankt felt i GUI'en falder tilbage paa
    // filen i stedet for at nulstille den.
    this._egen = {};
    Object.keys(config).forEach((noegle) => {
      const v = config[noegle];
      if (v !== undefined && v !== null && v !== "") this._egen[noegle] = v;
    });

    // Laes sidst kendte udgave synkront, saa baren kan tegnes med det samme.
    const gemt = url ? nbLaesGemt(url) : null;
    this._delt = gemt ? this._normaliser(gemt) : null;
    this._sidsteRaa = gemt ? JSON.stringify(gemt) : null;

    // Kun foerste gang nogensinde paa denne browser er der intet at tegne.
    this._venter = Boolean(url) && !Array.isArray(config.routes) && !gemt;
    this._anvend();

    if (url) {
      nbHentDeltConfig(url)
        .then((data) => {
          this._venter = false;
          const raa = JSON.stringify(data);
          nbGem(url, data);
          // Er indholdet uaendret, skal baren ikke bygges om - det ville give
          // netop det glimt vi forsoeger at undgaa.
          if (raa === this._sidsteRaa && this._bygget) return;
          this._sidsteRaa = raa;
          this._delt = this._normaliser(data);
          this._anvend();
        })
        .catch((e) => {
          this._venter = false;
          console.error("[ha-navbar-card] kunne ikke hente", url, e);
          // Har kortet egne ruter, er filen kun et supplement - saa lad vaere
          // med at erstatte en fungerende navbar med en fejlbesked.
          if (this.shadowRoot && !(this.config.routes || []).length) {
            this.shadowRoot.innerHTML =
              `<ha-card style="padding:16px;color:var(--error-color)">
                 ha-navbar-card: kunne ikke hente ${url} (${e.message})
               </ha-card>`;
          }
        });
    }
  }

  // Kendt sti -> synkron <svg>. Ukendt -> <ha-icon>, som bliver hoestet
  // bagefter. Begge fylder noejagtig det samme, saa der er ingen ryk.
  _ikon(navn, klasse) {
    const n = navn || "mdi:circle";
    const sti = nbIkoner()[n];
    const k = klasse ? ` ${klasse}` : "";
    if (sti) {
      return `<svg class="nbikon${k}" viewBox="0 0 24 24" aria-hidden="true"><path d="${sti}"></path></svg>`;
    }
    return `<ha-icon class="nbikon${k}" icon="${n}" data-hoest="${n}"></ha-icon>`;
  }

  // Laeser den faerdige sti ud af de ha-icon'er der maatte vaere tegnet, og
  // gemmer den. Fejler opslaget - fx fordi ha-icon's indre opbygning aendrer
  // sig i en fremtidig HA-version - sker der ingenting, og kortet bliver
  // simpelthen ved med at bruge ha-icon.
  _hoestIkoner() {
    if (!this.shadowRoot) return;
    const rest = this.shadowRoot.querySelectorAll("ha-icon[data-hoest]");
    if (!rest.length) return;
    setTimeout(() => {
      let nye = false;
      rest.forEach((el) => {
        try {
          const svg = el.shadowRoot && el.shadowRoot.querySelector("ha-svg-icon");
          const sti = svg && (svg.path || (svg.shadowRoot
            && svg.shadowRoot.querySelector("path")
            && svg.shadowRoot.querySelector("path").getAttribute("d")));
          const navn = el.getAttribute("data-hoest");
          if (sti && navn && !nbIkoner()[navn]) { NB_IKONER[navn] = sti; nye = true; }
        } catch (e) { /* springes over */ }
      });
      if (nye) nbGemIkoner();
    }, 900);
  }

  // Filen maa gerne vaere bare en liste af ruter (det gamle format) eller et
  // helt config-objekt med baade ruter og indstillinger.
  _normaliser(data) {
    const d = Array.isArray(data) ? { routes: data } : { ...data };
    delete d.type;
    delete d.config_url;
    delete d.routes_url;
    return d;
  }

  // Fletter den faelles fil med kortets egne vaerdier og bygger op igen.
  // Kaldes baade med det samme og igen naar filen er hentet.
  _anvend() {
    const delt = this._delt || {};
    const egen = this._egen || {};
    const flettet = { ...delt, ...egen };

    // Ruter fra kortet vinder kun hvis der faktisk ER nogen - ellers ville en
    // tom liste fra et nyoprettet kort skjule hele den faelles navbar.
    const egneRuter = Array.isArray(egen.routes) ? egen.routes : [];
    flettet.routes = egneRuter.length
      ? egneRuter
      : Array.isArray(delt.routes) ? delt.routes : [];

    this.config = flettet;
    this._sporedeEntiteter = this._findEntiteter(flettet.routes);
    this._udtrykCache.clear();

    if (flettet.fixed === false) this.removeAttribute("fastgjort");
    else this.setAttribute("fastgjort", "");

    // Placering styrer om baren ligger vandret i bunden eller lodret i en side.
    const placering = ["left", "right"].indexOf(flettet.position) !== -1 ? flettet.position : "bottom";
    this.setAttribute("placering", placering);

    // Ryd foerst alt: fjerner man en vaerdi, skal kortet falde tilbage til
    // standarden i CSS i stedet for at beholde den gamle vaerdi.
    Object.values(NB_STOERRELSER).forEach((v) => this.style.removeProperty(v));
    Object.keys(NB_STOERRELSER).forEach((noegle) => {
      const raa = flettet[noegle];
      if (raa === undefined || raa === null || raa === "") return;
      const tal = parseInt(raa, 10);
      if (Number.isFinite(tal)) this.style.setProperty(NB_STOERRELSER[noegle], `${tal}px`);
    });
    this.style.removeProperty("--nb-accent");
    if (flettet.accent) this.style.setProperty("--nb-accent", String(flettet.accent));

    this.style.removeProperty("--nb-flade-farve");
    if (flettet.background_color) this.style.setProperty("--nb-flade-farve", String(flettet.background_color));

    this.style.removeProperty("--nb-ikonfarve");
    if (flettet.icon_color) this.style.setProperty("--nb-ikonfarve", String(flettet.icon_color));

    this.style.removeProperty("--nb-baggrund-alpha");
    if (flettet.opacity !== undefined && flettet.opacity !== null && flettet.opacity !== "") {
      const a = Math.max(0, Math.min(100, parseInt(flettet.opacity, 10)));
      if (Number.isFinite(a)) this.style.setProperty("--nb-baggrund-alpha", String(a / 100));
    }

    this._bygget = false;
    this._sidsteSignatur = "";
    this._sidsteMaal = null;
    if (this.shadowRoot) this.shadowRoot.innerHTML = "";
    // Ingen ruter endnu og filen er undervejs: bliv tom indtil den lander,
    // saa baren dukker op faerdig i stedet for at blive bygget om.
    if (this._venter && !flettet.routes.length) return;
    if (this._hass) {
      this._byg();
      this._bygget = true;
      this.hass = this._hass;
    }
  }

  getCardSize() { return 1; }

  static getStubConfig() {
    return { routes: [{ url: "/lovelace/0", icon: "mdi:home", label: "Hjem" }] };
  }

  static getConfigElement() {
    return document.createElement("ha-navbar-card-editor");
  }

  connectedCallback() {
    window.addEventListener("location-changed", this._onNavigation);
    window.addEventListener("popstate", this._onNavigation);

    // Baren kan skifte bredde efter at markeringen er placeret - ved
    // vinduesskift, zoom, eller naar ha-icon'erne foerst er faerdige med at
    // loade og knapperne vokser. Uden dette bliver markeringen liggende
    // under den forkerte knap.
    if (!this._resizeObs && typeof ResizeObserver !== "undefined") {
      this._resizeObs = new ResizeObserver(() => {
        if (this._aktivKnap) this._flytIndikator(this._aktivKnap);
      });
      this._observerBar();
    }
  }

  _observerBar() {
    if (!this._resizeObs || !this.shadowRoot) return;
    const bar = this.shadowRoot.querySelector(".bar");
    if (bar && bar !== this._observeretBar) {
      if (this._observeretBar) this._resizeObs.unobserve(this._observeretBar);
      this._resizeObs.observe(bar);
      this._observeretBar = bar;
    }
  }

  disconnectedCallback() {
    window.removeEventListener("location-changed", this._onNavigation);
    window.removeEventListener("popstate", this._onNavigation);
    if (this._resizeObs) { this._resizeObs.disconnect(); this._resizeObs = null; this._observeretBar = null; }
    if (this._indikatorRaf) { cancelAnimationFrame(this._indikatorRaf); this._indikatorRaf = null; }
  }

  /* ---------- udtryk ---------- */

  // Samler alle entity_id'er der naevnes i konfigurationen, saa vi kun
  // reagerer paa dem i stedet for paa hver eneste state-aendring i huset.
  _findEntiteter(routes, fundet) {
    fundet = fundet || new Set();
    const tekst = JSON.stringify(routes);
    const m = tekst.match(/states\[\\?['"]([a-z_]+\.[a-z0-9_]+)\\?['"]\]/g) || [];
    for (const t of m) {
      const id = t.match(/([a-z_]+\.[a-z0-9_]+)/);
      if (id) fundet.add(id[1]);
    }
    return [...fundet];
  }

  _erUdtryk(v) {
    return typeof v === "string" && v.trim().startsWith("[[[") && v.trim().endsWith("]]]");
  }

  // Kompilerer og cacher "[[[ ... ]]]" praecis som button-card/navbar-card
  // goer det, saa de eksisterende udtryk virker uaendret.
  _evaluer(udtryk, standard) {
    if (!this._erUdtryk(udtryk)) return udtryk === undefined ? standard : udtryk;
    const krop = udtryk.trim().slice(3, -3);
    let fn = this._udtrykCache.get(krop);
    if (!fn) {
      try {
        fn = new Function("states", "user", "hass", `"use strict";${krop}`);
      } catch (e) {
        console.warn("[ha-navbar-card] kunne ikke kompilere udtryk:", e);
        fn = () => standard;
      }
      this._udtrykCache.set(krop, fn);
    }
    try {
      const v = fn(this._hass.states, this._hass.user, this._hass);
      return v === undefined || v === null ? standard : v;
    } catch (e) {
      return standard;
    }
  }

  _badgeInfo(rute) {
    const b = rute.badge;
    if (!b) return null;
    // _badgeCache nulstilles i starten af hver _opdaterBadges(), saa den
    // holder kun inden for een opdatering - den kan ikke give forael'dede
    // vaerdier naar en entitet aendrer sig.
    if (this._badgeCache && this._badgeCache.has(rute)) return this._badgeCache.get(rute);
    const gem = (v) => { if (this._badgeCache) this._badgeCache.set(rute, v); return v; };
    if (!this._evaluer(b.show, false)) return gem(null);
    const tekst = b.count !== undefined
      ? String(this._evaluer(b.count, "") || "")
      : String(this._evaluer(b.text, "") || "");
    const farve = String(this._evaluer(b.color, "var(--dashboard-accent)"));
    return gem({
      tekst,
      farve,
      tekstFarve: String(this._evaluer(b.textColor, "var(--white, #fff)")),
      // Pulsering kun naar farven faktisk signalerer et problem - ellers
      // ville en rolig blaa "info"-prik ogsaa blinke.
      puls: PULSE_FARVER.some((f) => farve.includes(f)),
    });
  }

  /* ---------- hass ---------- */

  set hass(hass) {
    this._hass = hass;
    if (!this.config) return;
    // Samme vagt som i _anvend(): byg ikke en tom bar mens den faelles fil
    // stadig er undervejs.
    if (this._venter && !(this.config.routes || []).length) return;
    if (!this._bygget) { this._byg(); this._bygget = true; }

    // Sikkerhedsnet: naar Home Assistant navigerer internt naar
    // location-changed ikke altid frem til os. En strengsammenligning er
    // billig nok til at koere paa hver hass-opdatering, og uden den kan
    // markeringen blive haengende under den forrige knap.
    if (window.location.pathname !== this._sidsteSti) this._opdaterAktiv();

    // Kun genberegn badges hvis en sporet entitet har aendret sig.
    let sig = "";
    for (let i = 0; i < this._sporedeEntiteter.length; i++) {
      const s = hass.states[this._sporedeEntiteter[i]];
      sig += (s ? s.state : "~") + "|";
    }
    if (sig === this._sidsteSignatur) return;
    this._sidsteSignatur = sig;
    this._opdaterBadges();
  }

  /* ---------- opbygning ---------- */

  _byg() {
    const r = this.shadowRoot;
    r.innerHTML = `<style>${this._css()}</style>
      <nav class="bar" part="bar">
        <div class="indikator" aria-hidden="true"></div>
        <div class="ruter"></div>
      </nav>
      <div class="overlay" hidden></div>
      <div class="ark" hidden role="dialog" aria-modal="true"></div>`;

    const ruter = r.querySelector(".ruter");
    this.config.routes.forEach((rute, i) => {
      const knap = document.createElement("button");
      knap.className = "rute";
      knap.type = "button";
      knap.dataset.index = String(i);
      knap.setAttribute("aria-label", rute.label || "");
      knap.innerHTML =
        `<span class="ikonboks">
           ${this._ikon(rute.icon).replace('class="nbikon"', `class="nbikon" data-navn="${rute.icon || 'mdi:circle'}"`)}
           <span class="badge" hidden></span>
         </span>
         ${this.config.show_labels ? `<span class="etiket">${rute.label || ""}</span>` : ""}`;
      knap.addEventListener("click", () => this._klik(rute, i));
      ruter.appendChild(knap);
    });

    // Notifikationsknap sidst i baren - kan slaas fra i opsaetningen.
    if (this.config.show_notifications !== false) {
      const notif = document.createElement("button");
      notif.className = "rute notif";
      notif.type = "button";
      notif.setAttribute("aria-label", "Notifikationer");
      notif.innerHTML =
        `<span class="ikonboks">
           ${this._ikon("mdi:bell-outline")}
           <span class="badge" hidden></span>
         </span>`;
      notif.addEventListener("click", () => { this._haptik(); this._visNotifikationer(); });
      ruter.appendChild(notif);
    }

    r.querySelector(".overlay").addEventListener("click", () => this._luk());
    // +1 for notifikationsknappen. Bruges af --nb-plads til at regne ud
    // hvor meget plads hver knap kan faa uden at baren loeber ud over
    // skaermkanten.
    this.style.setProperty("--nb-antal", String((this.config.routes || []).length + 1));
    this._observerBar();
    this._opdaterAktiv();
    this._hoestIkoner();
    if (this.config.show_notifications !== false) this._bindSwipe(r.querySelector(".bar"));
    this._bindPiletaster(ruter);
  }

  // Swip op paa selve baren aabner notifikationscenteret - hurtigere end at
  // ramme klokke-ikonet praecist paa en touchskaerm. Vandret bevaegelse over
  // taersklen afbryder genkendelsen, saa det ikke fejlfortolker et sidelaengs
  // strejf hen over baren.
  _bindSwipe(bar) {
    if (!bar) return;
    let startX = null, startY = null;
    const taerskel = 42;
    bar.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    }, { passive: true });
    bar.addEventListener("touchend", (e) => {
      if (startY === null) return;
      const t = e.changedTouches[0];
      const dy = startY - t.clientY, dx = Math.abs(startX - t.clientX);
      startY = null;
      if (dy > taerskel && dx < taerskel) { this._haptik(); this._visNotifikationer(); }
    }, { passive: true });
  }

  // Piletaster flytter fokus mellem ruterne, som en rigtig tablist - naturligt
  // for alle der styrer et vaegpanel med tastatur/fjernbetjening i stedet for
  // touch.
  _bindPiletaster(ruterEl) {
    if (!ruterEl) return;
    ruterEl.addEventListener("keydown", (e) => {
      const lodret = ["left", "right"].includes(this.getAttribute("placering"));
      const frem = lodret ? "ArrowDown" : "ArrowRight", tilbage = lodret ? "ArrowUp" : "ArrowLeft";
      if (e.key !== frem && e.key !== tilbage) return;
      const knapper = [...ruterEl.querySelectorAll(".rute")];
      const idx = knapper.indexOf(document.activeElement);
      if (idx === -1) return;
      e.preventDefault();
      const naeste = (idx + (e.key === frem ? 1 : -1) + knapper.length) % knapper.length;
      knapper[naeste].focus();
    });
  }

  /* ---------- interaktion ---------- */

  _klik(rute, i) {
    this._haptik();
    if (Array.isArray(rute.popup) && rute.popup.length) {
      this._visPopup(rute, i);
      return;
    }
    if (rute.url) this._naviger(rute.url);
  }

  // Kort, diskret vibration ved tryk. navigator.vibrate findes ikke paa
  // iOS/Safari - fejler stille der, ingen skade sket.
  _haptik() {
    try { navigator.vibrate && navigator.vibrate(10); } catch (e) { /* ikke understoettet */ }
  }

  _naviger(url) {
    this._luk();
    history.pushState(null, "", url);
    window.dispatchEvent(new CustomEvent("location-changed", { bubbles: true, composed: true }));
  }

  _luk() {
    clearTimeout(this._inaktivTimer);
    const r = this.shadowRoot;
    const ark = r.querySelector(".ark");
    ark.classList.remove("vis");
    r.querySelector(".overlay").classList.remove("vis");
    // vent paa udtoning foer hidden, ellers forsvinder den uden animation
    setTimeout(() => {
      if (!ark.classList.contains("vis")) {
        ark.hidden = true;
        r.querySelector(".overlay").hidden = true;
      }
    }, 190);
    this._notifikationerAabne = false;
  }

  _aabn(indhold) {
    const r = this.shadowRoot;
    const ark = r.querySelector(".ark");
    const ov = r.querySelector(".overlay");
    ark.innerHTML = indhold;
    ark.hidden = false; ov.hidden = false;
    requestAnimationFrame(() => { ark.classList.add("vis"); ov.classList.add("vis"); });
    // Sikkerhedsnet paa kiosk-skaerme: gaar nogen fra skaermen med en aaben
    // menu, lukker den selv i stedet for at staa lysende resten af dagen.
    clearTimeout(this._inaktivTimer);
    this._inaktivTimer = setTimeout(() => this._luk(), 45000);
  }

  _visPopup(rute, i) {
    const punkter = rute.popup.map((p, j) => {
      const b = this._badgeInfo(p);
      const status = p.status !== undefined ? String(this._evaluer(p.status, "")) : "";
      return `<button class="punkt" type="button" data-parent="${i}" data-j="${j}">
        <span class="p-ikon"><ha-icon icon="${p.icon || "mdi:circle"}"></ha-icon></span>
        <span class="p-tekst">
          <b>${p.label || ""}</b>
          ${status ? `<small>${status}</small>` : ""}
        </span>
        ${b ? `<span class="p-badge${b.puls ? " puls" : ""}"
                style="background:${b.farve};color:${b.tekstFarve}">${b.tekst || "!"}</span>` : ""}
      </button>`;
    }).join("");

    this._aabn(`<div class="ark-hoved">
        <ha-icon icon="${rute.icon || "mdi:circle"}"></ha-icon>
        <h2>${rute.label || ""}</h2>
        <button class="luk" type="button" aria-label="Luk"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="ark-krop">${punkter}</div>`);

    const ark = this.shadowRoot.querySelector(".ark");
    ark.querySelector(".luk").addEventListener("click", () => this._luk());
    ark.querySelectorAll(".punkt").forEach((el) => {
      el.addEventListener("click", () => {
        const p = rute.popup[Number(el.dataset.j)];
        if (p && p.url) this._naviger(p.url);
      });
    });
  }

  // Samler alle aktive badges paa tvaers af hele traeet til een liste.
  _samlNotifikationer() {
    const ud = [];
    const gaa = (ruter, forael) => {
      for (const r of ruter) {
        const b = this._badgeInfo(r);
        if (b) ud.push({ rute: r, badge: b, forael });
        if (Array.isArray(r.popup)) gaa(r.popup, r.label);
      }
    };
    gaa(this.config.routes, null);
    // Et forael-badge gentager typisk det boernene allerede viser.
    return ud.filter((n) => !Array.isArray(n.rute.popup) || !n.rute.popup.length);
  }

  _visNotifikationer() {
    this._notifikationerAabne = true;
    const n = this._samlNotifikationer();
    const krop = n.length
      ? n.map((x) => `<button class="punkt" type="button" data-url="${x.rute.url || ""}">
            <span class="p-ikon"><ha-icon icon="${x.rute.icon || "mdi:bell"}"></ha-icon></span>
            <span class="p-tekst">
              <b>${x.rute.label || ""}</b>
              ${x.forael ? `<small>${x.forael}</small>` : ""}
            </span>
            <span class="p-badge${x.badge.puls ? " puls" : ""}"
                  style="background:${x.badge.farve};color:${x.badge.tekstFarve}">${x.badge.tekst || "!"}</span>
          </button>`).join("")
      : `<div class="tom"><ha-icon icon="mdi:check-circle-outline"></ha-icon><p>Alt ser normalt ud</p></div>`;

    this._aabn(`<div class="ark-hoved">
        <ha-icon icon="mdi:bell-outline"></ha-icon>
        <h2>Notifikationer</h2>
        <button class="luk" type="button" aria-label="Luk"><ha-icon icon="mdi:close"></ha-icon></button>
      </div>
      <div class="ark-krop">${krop}</div>`);

    const ark = this.shadowRoot.querySelector(".ark");
    ark.querySelector(".luk").addEventListener("click", () => this._luk());
    ark.querySelectorAll(".punkt").forEach((el) => {
      el.addEventListener("click", () => { if (el.dataset.url) this._naviger(el.dataset.url); });
    });
  }

  /* ---------- opdatering ---------- */

  _opdaterBadges() {
    // Hvert badge evalueres EEN gang pr. opdatering og genbruges baade til
    // knappen i baren og til notifikationslisten. Foer blev de 20 udtryk
    // koert to gange: en gang her og en gang inde i _samlNotifikationer().
    this._badgeCache = new Map();

    const knapper = this.shadowRoot.querySelectorAll(".ruter .rute:not(.notif)");
    knapper.forEach((knap, i) => {
      const rute = this.config.routes[i];
      const el = knap.querySelector(".badge");
      const b = this._badgeInfo(rute);
      if (!b) {
        el.hidden = true;
        el.classList.remove("puls", "pop");
        knap.style.removeProperty("--nb-accent-rute");
        return;
      }
      knap.style.setProperty("--nb-accent-rute", b.farve);
      this._visBadge(el, b.tekst, b.farve, b.tekstFarve, b.puls);
    });

    const antal = this._samlNotifikationer().length;
    const nb = this.shadowRoot.querySelector(".notif .badge");
    if (nb) {
      if (antal > this._sidsteAntalNotifikationer) {
        const klokke = this.shadowRoot.querySelector(".notif");
        if (klokke) { klokke.classList.remove("ring"); void klokke.offsetWidth; klokke.classList.add("ring"); }
      }
      if (antal === 0) { nb.hidden = true; nb.classList.remove("puls", "pop"); }
      else this._visBadge(nb, String(antal), "var(--error-color)", "var(--white, #fff)", antal > 0);
    }
    this._sidsteAntalNotifikationer = antal;
    if (this._notifikationerAabne) this._visNotifikationer();
  }

  // Faelles for rute- og notifikationsbadges: et badge der lige er blevet
  // synligt (gik fra hidden -> vist) faar et kort "pop", og den vedvarende
  // pulsering venter til poppet er faerdigt - saa de to animationer aldrig
  // rykker samtidigt i den samme transform og modarbejder hinanden.
  _visBadge(el, tekst, farve, tekstFarve, skalPulsere) {
    const blevSynlig = el.hidden;
    el.hidden = false;
    el.textContent = tekst;
    el.classList.toggle("tom", !tekst);
    el.style.background = farve;
    el.style.color = tekstFarve;
    if (blevSynlig) {
      el.classList.remove("puls");
      el.classList.remove("pop");
      void el.offsetWidth;
      el.classList.add("pop");
      setTimeout(() => { el.classList.remove("pop"); el.classList.toggle("puls", skalPulsere); }, 320);
    } else {
      el.classList.toggle("puls", skalPulsere);
    }
  }

  _opdaterAktiv() {
    if (!this.shadowRoot || !this.config) return;
    const sti = window.location.pathname;
    this._sidsteSti = sti;
    const knapper = [...this.shadowRoot.querySelectorAll(".ruter .rute:not(.notif)")];
    let aktiv = -1;
    this.config.routes.forEach((r, i) => {
      if (r.url && sti === r.url) aktiv = i;
      if (aktiv === -1 && Array.isArray(r.popup) && r.popup.some((p) => p.url === sti)) aktiv = i;
    });
    knapper.forEach((k, i) => {
      const er = i === aktiv;
      k.classList.toggle("aktiv", er);
      if (er) k.setAttribute("aria-current", "page"); else k.removeAttribute("aria-current");
      const r = this.config.routes[i];
      const oensket = er ? (r.icon_selected || r.icon) : r.icon;
      // Ikonet kan vaere et <ha-icon> eller en cachet inline <svg>. For det
      // foerste raekker et attributskift; for det andet skal elementet
      // erstattes, og da navnet ikke staar i markup'en foelger vi det paa
      // data-navn.
      const boks = k.querySelector(".ikonboks");
      const ikon = boks && boks.querySelector(".nbikon");
      if (ikon && ikon.dataset.navn !== oensket) {
        const badge = boks.querySelector(".badge");
        ikon.outerHTML = this._ikon(oensket);
        const nyt = boks.querySelector(".nbikon");
        if (nyt) nyt.dataset.navn = oensket;
        if (badge) boks.appendChild(badge);
        this._hoestIkoner();
      }
    });
    this._aktivKnap = aktiv >= 0 ? knapper[aktiv] : null;
    this._flytIndikator(this._aktivKnap);
  }

  // Maalingen udskydes til efter naeste layout. Kaldes _opdaterAktiv() fra
  // _byg() - altsaa lige efter innerHTML er sat - har browseren endnu ikke
  // lavet layout, og getBoundingClientRect() giver 0 i bredde. Foer denne
  // udskydelse endte markeringen derfor skjult, og intet kaldte den igen.
  _flytIndikator(knap) {
    if (this._indikatorRaf) cancelAnimationFrame(this._indikatorRaf);
    // Er knappen allerede maalbar, har browseren lavet layout, og saa kan vi
    // flytte med det samme. Udskydelsen er kun noedvendig ved allerfoerste
    // opbygning, hvor bredden endnu er 0 - foer koerte den ved HVER
    // navigation og lagde to frames ren ventetid foran bevaegelsen.
    if (knap && knap.isConnected && knap.getBoundingClientRect().width) {
      this._indikatorRaf = null;
      this._flytIndikatorNu(knap);
      return;
    }
    this._indikatorRaf = requestAnimationFrame(() => {
      this._indikatorRaf = requestAnimationFrame(() => {
        this._indikatorRaf = null;
        this._flytIndikatorNu(knap);
      });
    });
  }

  // Den glidende markering. Den flyttes med transform, saa den animerer paa
  // GPU'en uden at udloese layout paa resten af baren.
  _flytIndikatorNu(knap) {
    if (!this.shadowRoot) return;
    const ind = this.shadowRoot.querySelector(".indikator");
    if (!ind) return;
    if (!knap || !knap.isConnected) { ind.style.opacity = "0"; return; }
    const b = knap.getBoundingClientRect();
    const bar = this.shadowRoot.querySelector(".bar").getBoundingClientRect();
    const p = this.getAttribute("placering");
    const lodret = p === "left" || p === "right";
    if (lodret ? !b.height : !b.width) { ind.style.opacity = "0"; return; }

    // Rund af til hele pixels. Uden det giver browserens subpixel-maalinger
    // mikroskopiske forskelle mellem to kald, og hver forskel starter en ny
    // 180ms-overgang - det er dem der ses som et lille hop frem og tilbage.
    const maal = lodret
      ? `Y|${Math.round(b.height)}|${Math.round(b.top - bar.top)}`
      : `X|${Math.round(b.width)}|${Math.round(b.left - bar.left)}`;
    if (maal === this._sidsteMaal) return;
    const foerste = this._sidsteMaal === null;
    this._sidsteMaal = maal;

    // Hvert view har sit EGET navbar-kort, saa der bygges et nyt ved hver
    // navigation. Markeringen starter derfor paa translateX(0) med bredde 0,
    // og med overgangen slaaet til glider den ind fra venstre kant og vokser
    // - paa hvert eneste sideskift. Foerste placering skal vaere oejeblikkelig;
    // overgangen giver kun mening ved flytninger inden for det samme kort.
    if (foerste) ind.style.transition = "none";
    ind.style.opacity = "1";
    if (lodret) {
      // Lad den anden akse styres af CSS, ellers laaser en gammel inline-
      // vaerdi stoerrelsen fast naar man skifter placering.
      ind.style.width = "";
      ind.style.height = `${Math.round(b.height)}px`;
      ind.style.transform = `translateY(${Math.round(b.top - bar.top)}px)`;
    } else {
      ind.style.height = "";
      ind.style.width = `${Math.round(b.width)}px`;
      ind.style.transform = `translateX(${Math.round(b.left - bar.left)}px)`;
    }

    if (foerste) {
      // Tving en reflow, saa placeringen ovenfor er gennemfoert FOER
      // overgangen slaas til igen. Uden den ville browseren samle de to
      // aendringer og alligevel animere.
      void ind.offsetWidth;
      ind.style.transition = "";
    }
  }

  _css() {
    const auto = this.config?.auto_size === true;
    return `
:host{display:block;--nb-ikon:28px;--nb-hoejde:64px;--nb-bund:18px;
  --nb-antal:8;
  --nb-plads:calc((min(92vw, var(--nb-maxbredde,900px)) - 24px
    - (var(--nb-antal) - 1) * var(--nb-mellemrum,4px)) / var(--nb-antal));
  --nb-radius:22px;--nb-mellemrum:4px;--nb-knapbredde:56px;--nb-badge:18px;--nb-etiket:12px;
  --nb-knaphoejde:48px;--nb-knapradius:16px;--nb-indikator-luft:8px;
  --nb-accent:var(--dashboard-accent,var(--primary-color,#38bdf8));
  --nb-ikonfarve:var(--secondary-text-color);
  --nb-baggrund-alpha:1;
  --nb-flade-farve:var(--surface,var(--ha-card-background,var(--card-background-color,#171b22)));
  /* Temaernes --surface er en linear-gradient, ikke en farve. color-mix()
     accepterer kun farver, saa det tidligere udtryk blev ugyldigt og
     browseren fjernede baggrunden helt - og gennemsigtighed havde ingen
     effekt. Gennemsigtigheden ligger nu i stedet paa .bar::before. */
  --nb-flade:var(--nb-flade-farve)}
/* Fastgjort tilstand: baren tages ud af flowet og laegges i bunden af
   viewporten. Vaerten kollapser til 0 i hoejden, saa den ikke efterlader et
   hul i den sektion kortet er placeret i. */
:host([fastgjort]){height:0;overflow:visible}
.bar{position:relative;display:flex;justify-content:center;align-items:center;
  /* max-content i stedet for fuld bredde - ellers straekker baren sig over
     hele sektionen og bliver bredere end den navbar den skal afloese. */
  width:max-content;max-width:min(92vw, var(--nb-maxbredde, 900px));
  margin:0 auto;box-sizing:border-box;
  height:var(--nb-hoejde);padding:0 10px;border-radius:var(--nb-radius);
  border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--nb-accent);
  background:none;isolation:isolate;
  box-shadow:var(--dashboard-shadow-strong,var(--ha-card-box-shadow,0 8px 22px rgba(0,0,0,.18)));
  overflow:hidden}
/* Baggrunden som eget lag: opacity virker paa baade farver og gradienter,
   og ikoner, badges og markering forbliver fuldt synlige ovenpaa. */
.bar::before{content:"";position:absolute;inset:0;z-index:-1;border-radius:inherit;
  background:var(--nb-flade-farve);opacity:var(--nb-baggrund-alpha,1);pointer-events:none}
:host([fastgjort]) .bar{position:fixed;left:50%;bottom:var(--nb-bund);
  transform:translateX(-50%);z-index:120;margin:0}
/* Lodret placering: baren bliver en soejle. --nb-hoejde er nu dens tykkelse,
   og max-content/--nb-maxbredde gaelder hoejden i stedet for bredden. */
:host([placering="left"]) .bar,:host([placering="right"]) .bar{
  flex-direction:column;width:var(--nb-hoejde);height:max-content;
  max-width:none;max-height:min(92vh,var(--nb-maxbredde,900px));padding:10px 0}
:host([placering="left"]) .ruter,:host([placering="right"]) .ruter{flex-direction:column}
:host([fastgjort][placering="left"]) .bar{left:var(--nb-bund);right:auto;bottom:auto;
  top:50%;transform:translateY(-50%)}
:host([fastgjort][placering="right"]) .bar{right:var(--nb-bund);left:auto;bottom:auto;
  top:50%;transform:translateY(-50%)}
/* Markeringen skifter fra at vaere en vandret bjaelke til en lodret. */
:host([placering="left"]) .indikator,:host([placering="right"]) .indikator{
  top:0;bottom:auto;left:var(--nb-indikator-luft,8px);right:var(--nb-indikator-luft,8px)}
/* Menuen folder ud ved siden af baren i stedet for over den. */
:host([placering="left"]) .ark{left:calc(var(--nb-hoejde) + var(--nb-bund) + 12px);right:auto;
  bottom:auto;top:50%;transform:translate(-16px,-50%) scale(.97)}
:host([placering="left"]) .ark.vis{transform:translate(0,-50%) scale(1)}
:host([placering="right"]) .ark{right:calc(var(--nb-hoejde) + var(--nb-bund) + 12px);left:auto;
  bottom:auto;top:50%;transform:translate(16px,-50%) scale(.97)}
:host([placering="right"]) .ark.vis{transform:translate(0,-50%) scale(1)}
.ruter{position:relative;z-index:1;display:flex;align-items:center;gap:var(--nb-mellemrum)}
.indikator{position:absolute;top:var(--nb-indikator-luft,8px);bottom:var(--nb-indikator-luft,8px);left:0;border-radius:var(--nb-knapradius,16px);
  background:color-mix(in srgb,var(--nb-accent) 18%,transparent);opacity:0;
  transition:transform .18s cubic-bezier(.2,0,0,1),width .18s cubic-bezier(.2,0,0,1),
    height .18s cubic-bezier(.2,0,0,1),opacity .12s ease;
  will-change:transform,width,height}
.rute{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;
  gap:3px;box-sizing:border-box;
  /* Vaerdien fra config er et LOFT, ikke en fast bredde. --nb-plads er
     den plads hver knap kan faa naar baren holdes inden for skaermen,
     saa otte ikoner paa en smal telefon skalerer ned i stedet for at
     blive skubbet ud til kanten. */
  min-width:0;width:${auto ? "var(--nb-plads)" : "min(var(--nb-knapbredde,56px), var(--nb-plads))"};
  height:${auto ? "calc(var(--nb-plads) * 1.05)" : "min(var(--nb-knaphoejde,48px), calc(var(--nb-plads) * 1.05))"};
  padding:0;border:0;border-radius:var(--nb-knapradius,16px);
  background:transparent;color:var(--nb-ikonfarve);cursor:pointer;
  transition:color .1s ease,transform .16s ease}
.rute:hover{color:var(--primary-text-color)}
.rute:active{transform:scale(.94)}
.rute:focus-visible{outline:2px solid var(--nb-accent);outline-offset:2px;border-radius:var(--nb-knapradius,16px)}
.rute.aktiv{color:var(--nb-accent-rute, var(--nb-accent))}
.ikonboks{position:relative;display:flex}
.rute ha-icon,.rute .nbikon{--mdc-icon-size:${auto ? "calc(var(--nb-plads) - 14px)" : "min(var(--nb-ikon,26px), calc(var(--nb-plads) - 14px))"};width:${auto ? "calc(var(--nb-plads) - 14px)" : "min(var(--nb-ikon,26px), calc(var(--nb-plads) - 14px))"};height:${auto ? "calc(var(--nb-plads) - 14px)" : "min(var(--nb-ikon,26px), calc(var(--nb-plads) - 14px))"}}
svg.nbikon{display:block;fill:currentColor}
.etiket{font-size:var(--nb-etiket);font-weight:700;letter-spacing:.02em}
.badge{position:absolute;top:-3px;right:-6px;min-width:var(--nb-badge);height:var(--nb-badge);padding:0 5px;
  display:flex;align-items:center;justify-content:center;border-radius:9px;
  font-size:11px;font-weight:800;line-height:1;box-sizing:border-box;
  box-shadow:0 0 0 2px var(--nb-flade)}
.badge.tom{min-width:10px;width:10px;height:10px;padding:0;border-radius:5px;font-size:0}
.badge.puls{animation:nbPuls 1.8s ease-in-out infinite}
.badge.pop{animation:nbBadgePop .32s cubic-bezier(.34,1.56,.64,1)}
@keyframes nbPuls{0%,100%{transform:scale(1);filter:brightness(1)}
  50%{transform:scale(1.18);filter:brightness(1.25)}}
@keyframes nbBadgePop{from{transform:scale(0)}to{transform:scale(1)}}
.notif.ring .ikonboks{animation:nbRing .5s ease-in-out}
@keyframes nbRing{0%,100%{transform:rotate(0)}15%{transform:rotate(-14deg)}30%{transform:rotate(11deg)}
  45%{transform:rotate(-8deg)}60%{transform:rotate(5deg)}75%{transform:rotate(-3deg)}}
.overlay{position:fixed;inset:0;z-index:200;background:rgba(0,0,0,.55);
  opacity:0;transition:opacity .2s ease;backdrop-filter:blur(2px)}
.overlay.vis{opacity:1}
.ark{position:fixed;left:50%;bottom:calc(var(--nb-hoejde) + var(--nb-bund) + 12px);z-index:201;
  /* Bredden foelger det bredeste punkt i menuen i stedet for en fast vaerdi.
     min-width holder de korteste menuer fra at blive for smalle til at ramme,
     max-width er loftet paa lange labels og smalle skaerme. */
  width:max-content;min-width:260px;max-width:min(440px,92vw);
  max-height:62vh;overflow:auto;box-sizing:border-box;
  transform:translate(-50%,16px) scale(.97);opacity:0;
  transition:transform .32s cubic-bezier(.34,1.56,.64,1),opacity .22s ease;
  border-radius:var(--nb-radius);padding:14px;background:var(--nb-flade);
  border-left:calc(var(--dashboard-left-accent-width, 1) * 3px) solid var(--nb-accent);
  box-shadow:var(--dashboard-shadow-deep,0 18px 44px rgba(0,0,0,.5))}
.ark.vis{transform:translate(-50%,0) scale(1);opacity:1}
.ark-hoved{display:flex;align-items:center;gap:10px;margin:2px 2px 12px}
.ark-hoved ha-icon{--mdc-icon-size:22px;color:var(--nb-accent)}
.ark-hoved h2{flex:1;margin:0;font-size:15px;font-weight:800;letter-spacing:.02em;
  text-transform:uppercase;color:var(--primary-text-color)}
.luk{display:flex;border:0;border-radius:10px;padding:5px;cursor:pointer;
  background:transparent;color:var(--secondary-text-color)}
.luk:hover{color:var(--primary-text-color)}
.ark-krop{display:flex;flex-direction:column;gap:5px}
/* Ingen width:100% her - den ville indgaa i max-content-beregningen paa .ark
   og goere bredden cirkulaer. Flex-kolonnen straekker dem alligevel. */
.punkt{display:flex;align-items:center;gap:11px;padding:10px 11px;
  border:0;border-radius:14px;background:color-mix(in srgb,var(--primary-text-color) 4%,transparent);
  color:var(--primary-text-color);cursor:pointer;text-align:left;
  transition:background .14s ease,transform .14s ease}
.punkt:hover{background:color-mix(in srgb,var(--nb-accent) 12%,transparent);transform:translateX(2px)}
.p-ikon{display:flex;flex:0 0 34px;width:34px;height:34px;align-items:center;justify-content:center;
  border-radius:11px;background:color-mix(in srgb,var(--nb-accent) 14%,transparent);color:var(--nb-accent)}
.p-ikon ha-icon{--mdc-icon-size:20px}
.p-tekst{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.p-tekst b{font-size:14px;font-weight:700}
.p-tekst small{font-size:11px;color:var(--secondary-text-color)}
.p-badge{flex:0 0 auto;min-width:20px;height:20px;padding:0 6px;display:flex;
  align-items:center;justify-content:center;border-radius:10px;
  font-size:11px;font-weight:800;box-sizing:border-box}
.p-badge.puls{animation:nbPuls 1.8s ease-in-out infinite}
.tom{display:flex;flex-direction:column;align-items:center;gap:8px;padding:22px 0;
  color:var(--secondary-text-color)}
.tom ha-icon{--mdc-icon-size:34px;color:var(--success-color,#20e3a2)}
.tom p{margin:0;font-size:13px}
@media(max-width:700px){:host{--nb-ikon:24px;--nb-hoejde:58px;--nb-knapbredde:46px}
  .rute{padding:0 6px}}
@media(prefers-reduced-motion:reduce){
  .indikator,.punkt,.ark,.overlay{transition:none}
  .badge.puls,.p-badge.puls,.badge.pop,.notif.ring .ikonboks{animation:none}}
`;
  }
}


/* ---------------------------------------------------------------------------
 * Visuel editor
 *
 * Den faelles ha-card-list-editor kan kun flade lister. Navbarens struktur er
 * ruter -> popup[] -> badge{}, altsaa to niveauer af lister plus et indlejret
 * objekt, saa den faar sin egen editor her.
 *
 * Felter gemmes paa "change" (altsaa ved blur), ikke "input". Ellers ville
 * hver tast udloese en gen-rendering og stjaele fokus fra feltet.
 * ------------------------------------------------------------------------ */

const NB_BADGE_STANDARD = {
  show: "[[[ return true; ]]]",
  color: "var(--error-color)",
  textColor: "var(--white, #fff)",
  text: "!",
};

class HaNavbarCardEditor extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._config = {};
    this._aabne = {};
    this._besked = "";
  }

  setConfig(config) {
    this._config = JSON.parse(JSON.stringify(config || {}));
    if (!Array.isArray(this._config.routes)) this._config.routes = [];
    this._render();
  }

  set hass(hass) {
    this._hass = hass;
    this.shadowRoot?.querySelectorAll("ha-icon-picker").forEach((el) => { el.hass = hass; });
  }

  _emit() {
    this.dispatchEvent(new CustomEvent("config-changed", {
      detail: { config: JSON.parse(JSON.stringify(this._config)) },
      bubbles: true,
      composed: true,
    }));
  }

  _esc(v) {
    return String(v === undefined || v === null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ---------- mutationer ---------- */

  _node(ri, pi) {
    const rute = this._config.routes[ri];
    if (!rute) return null;
    if (pi === -1) return rute;
    return Array.isArray(rute.popup) ? rute.popup[pi] : null;
  }

  _saet(obj, key, value) {
    if (value === "" || value === undefined || value === null) delete obj[key];
    else obj[key] = value;
  }

  _saetRod(key, value) { this._saet(this._config, key, value); this._emit(); }

  _saetFelt(ri, pi, key, value) {
    const n = this._node(ri, pi);
    if (n) { this._saet(n, key, value); this._emit(); }
  }

  _saetBadge(ri, pi, key, value) {
    const n = this._node(ri, pi);
    if (!n) return;
    if (!n.badge) n.badge = {};
    this._saet(n.badge, key, value);
    if (!Object.keys(n.badge).length) delete n.badge;
    this._emit();
  }

  _skiftBadge(ri, pi, til) {
    const n = this._node(ri, pi);
    if (!n) return;
    if (til) n.badge = n.badge || JSON.parse(JSON.stringify(NB_BADGE_STANDARD));
    else delete n.badge;
    this._emit();
    this._render();
  }

  _flyt(liste, i, retning) {
    const j = i + retning;
    if (!liste || j < 0 || j >= liste.length) return;
    const tmp = liste[i];
    liste[i] = liste[j];
    liste[j] = tmp;
    this._emit();
    this._render();
  }

  async _importer() {
    const url = this._config.config_url || this._config.routes_url;
    if (!url) return;
    try {
      const svar = await fetch(url, { cache: "no-cache" });
      if (!svar.ok) throw new Error("HTTP " + svar.status);
      const data = await svar.json();
      const ruter = Array.isArray(data) ? data : data.routes;
      if (!Array.isArray(ruter) || !ruter.length) throw new Error("filen indeholder ingen ruter");
      this._config.routes = ruter;
      delete this._config.routes_url;
      delete this._config.config_url;
      this._besked = "Importerede " + ruter.length + " ruter. Rutefilen bruges ikke laengere.";
      this._emit();
      this._render();
    } catch (e) {
      this._besked = "Kunne ikke hente ruter: " + e.message;
      this._render();
    }
  }

  /* ---------- felter ---------- */

  _attr(kind, ri, pi, key) {
    return `data-kind="${kind}" data-ri="${ri}" data-pi="${pi}" data-key="${key}"`;
  }

  _tekst(label, key, value, kind, ri = -1, pi = -1, ph = "") {
    return `<label><span>${label}</span>
      <input type="text" ${this._attr(kind, ri, pi, key)}
        value="${this._esc(value)}" placeholder="${this._esc(ph)}"></label>`;
  }

  // Genbruger HA-frontendens egen ikonvaelger (allerede indlaest, ingen ny
  // afhaengighed) i stedet for et fritekstfelt hvor et tastefejl i et
  // mdi:-navn bare giver et tomt ikon uden nogen advarsel.
  _ikonVaelger(label, key, value, kind, ri = -1, pi = -1) {
    return `<label><span>${label}</span>
      <ha-icon-picker ${this._attr(kind, ri, pi, key)} value="${this._esc(value)}"></ha-icon-picker></label>`;
  }

  _tal(label, key, value, kind, ri = -1, pi = -1, disabled = false, min = null, max = null) {
    return `<label class="${disabled ? "deaktiveret" : ""}"><span>${label}</span>
      <input type="number" ${this._attr(kind, ri, pi, key)} ${disabled ? "disabled" : ""}
        ${min !== null ? `min="${min}"` : ""} ${max !== null ? `max="${max}"` : ""}
        value="${value === undefined ? "" : this._esc(value)}"></label>`;
  }

  _bool(label, key, checked, kind, ri = -1, pi = -1) {
    return `<label class="tjek"><input type="checkbox" ${this._attr(kind, ri, pi, key)}
      ${checked ? "checked" : ""}><span>${label}</span></label>`;
  }

  // Udtryk kan vaere flerlinjede, saa de faar et textarea - et input ville
  // klemme dem sammen til een linje og aedelegge formateringen.
  _udtryk(label, key, value, kind, ri = -1, pi = -1, ph = "") {
    return `<label class="bred"><span>${label}</span>
      <textarea rows="2" ${this._attr(kind, ri, pi, key)}
        placeholder="${this._esc(ph)}">${this._esc(value)}</textarea></label>`;
  }

  _valg(label, key, value, muligheder, kind, ri = -1, pi = -1) {
    const valgt = value || muligheder[0][0];
    return `<label><span>${label}</span>
      <select ${this._attr(kind, ri, pi, key)}>
        ${muligheder.map(([v, t]) =>
          `<option value="${v}" ${valgt === v ? "selected" : ""}>${t}</option>`).join("")}
      </select></label>`;
  }

  _badgeBlok(n, ri, pi) {
    const b = n.badge;
    return `<div class="badge">
      ${this._bool("Badge", "badge", !!b, "badge-toggle", ri, pi)}
      ${b ? `<div class="gitter">
          ${this._udtryk("Vis (udtryk)", "show", b.show, "badge", ri, pi, "[[[ return true; ]]]")}
          ${this._udtryk("Tal (udtryk)", "count", b.count, "badge", ri, pi, "[[[ return 3; ]]]")}
          ${this._tekst("Tekst", "text", b.text, "badge", ri, pi, "!")}
          ${this._tekst("Farve", "color", b.color, "badge", ri, pi, "var(--error-color)")}
          ${this._tekst("Tekstfarve", "textColor", b.textColor, "badge", ri, pi, "var(--white, #fff)")}
        </div>
        <p class="hj">Tomt <b>Tal</b> giver en prik. Roed eller orange farve pulserer automatisk.</p>` : ""}
    </div>`;
  }

  _punkt(p, ri, pj) {
    return `<div class="punkt">
      <div class="p-hoved">
        <ha-icon icon="${this._esc(p.icon || "mdi:circle")}"></ha-icon>
        <strong>${this._esc(p.label || "(uden navn)")}</strong>
        <span class="vaerktoej">
          <button class="mini" data-handling="pop-op" data-ri="${ri}" data-pi="${pj}" title="Flyt op">&#9650;</button>
          <button class="mini" data-handling="pop-ned" data-ri="${ri}" data-pi="${pj}" title="Flyt ned">&#9660;</button>
          <button class="mini fjern" data-handling="pop-slet" data-ri="${ri}" data-pi="${pj}" title="Fjern">&#10005;</button>
        </span>
      </div>
      <div class="gitter">
        ${this._tekst("Navn", "label", p.label, "field", ri, pj)}
        ${this._tekst("URL", "url", p.url, "field", ri, pj, "/hjem-overblik/side")}
        ${this._ikonVaelger("Ikon", "icon", p.icon, "field", ri, pj)}
        ${this._ikonVaelger("Ikon naar valgt", "icon_selected", p.icon_selected, "field", ri, pj)}
      </div>
      ${this._udtryk("Statuslinje (udtryk)", "status", p.status, "field", ri, pj, "[[[ return 'Tekst under navnet'; ]]]")}
      ${this._badgeBlok(p, ri, pj)}
    </div>`;
  }

  _rute(rute, i) {
    const pop = Array.isArray(rute.popup) ? rute.popup : [];
    return `<details class="rute" data-ri="${i}" ${this._aabne["r" + i] ? "open" : ""}>
      <summary>
        <ha-icon icon="${this._esc(rute.icon || "mdi:circle")}"></ha-icon>
        <span class="navn">${this._esc(rute.label || "(uden navn)")}</span>
        ${rute.badge ? `<span class="mrk">badge</span>` : ""}
        ${pop.length ? `<span class="mrk">${pop.length} i menu</span>` : ""}
        <span class="vaerktoej">
          <button class="mini" data-handling="rute-op" data-ri="${i}" title="Flyt op">&#9650;</button>
          <button class="mini" data-handling="rute-ned" data-ri="${i}" title="Flyt ned">&#9660;</button>
          <button class="mini fjern" data-handling="rute-slet" data-ri="${i}" title="Fjern">&#10005;</button>
        </span>
      </summary>
      <div class="krop">
        <div class="gitter">
          ${this._tekst("Navn", "label", rute.label, "field", i, -1)}
          ${this._tekst("URL", "url", rute.url, "field", i, -1, "/hjem-overblik/side")}
          ${this._ikonVaelger("Ikon", "icon", rute.icon, "field", i, -1)}
          ${this._ikonVaelger("Ikon naar valgt", "icon_selected", rute.icon_selected, "field", i, -1)}
        </div>
        ${pop.length ? `<p class="hj">Ruten har en undermenu, saa dens egen URL bruges ikke ved klik.</p>` : ""}
        ${this._badgeBlok(rute, i, -1)}
        <div class="under">
          <div class="hoved"><h4>Undermenu (${pop.length})</h4>
            <button class="knap" data-handling="pop-tilfoej" data-ri="${i}">+ Punkt</button></div>
          ${pop.map((p, j) => this._punkt(p, i, j)).join("")}
        </div>
      </div>
    </details>`;
  }

  _render() {
    if (!this.shadowRoot) return;
    const c = this._config;
    const harFil = !!(c.config_url || c.routes_url);
    this.shadowRoot.innerHTML = `<style>${this._css()}</style>
      <div class="ed">
        ${this._besked ? `<div class="besked">${this._esc(this._besked)}</div>` : ""}
        <section class="kort">
          <h3>Generelt</h3>
          <div class="gitter">
            ${this._valg("Placering", "position", c.position,
              [["bottom", "Bund"], ["left", "Venstre"], ["right", "Hoejre"]], "root")}
            ${this._tal("Afstand fra kant (px)", "bottom_offset", c.bottom_offset, "root")}
            ${this._tekst("Faelles opsaetning (fil)", "config_url", c.config_url, "root", -1, -1, "/local/ha-navbar-card/navbar.json")}
            ${this._tekst("Rutefil (gammelt format)", "routes_url", c.routes_url, "root", -1, -1, "/local/ha-navbar-card/routes.json")}
            ${this._tal("Maks laengde (px)", "max_width", c.max_width, "root")}
          </div>
          <div class="tjekrk">
            ${this._bool("Vis tekst under ikoner", "show_labels", c.show_labels === true, "root")}
            ${this._bool("Fastgjort til kanten", "fixed", c.fixed !== false, "root")}
          </div>
          ${harFil ? `<div class="note">
              <b>Opsaetningen kommer fra den faelles fil.</b>
              Alt du saetter her paa kortet overstyrer filen - tomme felter foelger den.
              Vil du redigere selve ruterne her i GUI'en, skal de hentes ind i kortet foerst;
              saa bruger denne side ikke laengere den faelles fil.
              <button class="knap" data-handling="importer">Hent ruter ind i kortet</button>
            </div>` : ""}
        </section>
        <section class="kort">
          <h3>Stoerrelse og udseende</h3>
          <div class="tjekrk">
            ${this._bool("Automatisk stoerrelse (knapper og ikoner fylder altid pladsen ud)", "auto_size", c.auto_size === true, "root")}
          </div>
          <div class="gitter">
            ${this._tal("Barens tykkelse (px)", "height", c.height, "root")}
            ${this._tal("Ikonstoerrelse (px)", "icon_size", c.icon_size, "root", -1, -1, c.auto_size === true)}
            ${this._tal("Hjoerneradius (px)", "radius", c.radius, "root")}
            ${this._tal("Knapbredde, min. (px)", "item_min_width", c.item_min_width, "root", -1, -1, c.auto_size === true)}
            ${this._tal("Mellemrum mellem knapper (px)", "gap", c.gap, "root")}
            ${this._tal("Badge-stoerrelse (px)", "badge_size", c.badge_size, "root")}
            ${this._tal("Tekststoerrelse (px)", "label_size", c.label_size, "root")}
            ${this._tekst("Accentfarve (aktiv fane)", "accent", c.accent, "root", -1, -1, "var(--dashboard-accent)")}
            ${this._tekst("Baggrundsfarve", "background_color", c.background_color, "root", -1, -1, "var(--card-background-color)")}
            ${this._tekst("Ikonfarve (inaktiv)", "icon_color", c.icon_color, "root", -1, -1, "var(--secondary-text-color)")}
            ${this._tal("Gennemsigtighed af baggrund (%)", "opacity", c.opacity, "root", -1, -1, false, 0, 100)}
          </div>
          <div class="tjekrk">
            ${this._bool("Vis notifikationsklokke", "show_notifications", c.show_notifications !== false, "root")}
          </div>
          <p class="hj">Tomme felter bruger kortets standard. En vaerdi her gaelder ogsaa
            paa mobil og tilsidesaetter den automatiske nedskalering. Naar "Automatisk stoerrelse"
            er slaaet til, ignoreres knapbredde og ikonstoerrelse, og knapperne/ikonerne fylder
            altid den ledige plads ud i stedet.</p>
        </section>
        <section class="kort">
          <div class="hoved"><h3>Ruter (${c.routes.length})</h3>
            <button class="knap" data-handling="rute-tilfoej">+ Tilfoej rute</button></div>
          ${c.routes.length ? c.routes.map((r, i) => this._rute(r, i)).join("")
            : `<p class="hj">Ingen ruter endnu.</p>`}
        </section>
      </div>`;
    this._besked = "";
    this._bind();
  }

  _bind() {
    const r = this.shadowRoot;
    r.querySelectorAll("input,textarea,select").forEach((el) => {
      if (!el.dataset.kind) return;
      el.addEventListener("change", () => {
        let v;
        if (el.type === "checkbox") v = el.checked;
        else if (el.type === "number") v = el.value === "" ? "" : Number(el.value);
        else v = el.value;
        this._aendret(el, v);
      });
    });
    r.querySelectorAll("ha-icon-picker").forEach((el) => {
      if (!el.dataset.kind) return;
      if (this._hass) el.hass = this._hass;
      el.addEventListener("value-changed", (e) => { e.stopPropagation(); this._aendret(el, e.detail.value); });
    });
    r.querySelectorAll("[data-handling]").forEach((el) => {
      el.addEventListener("click", (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        this._handling(el);
      });
    });
    // Husk hvilke ruter der er foldet ud, saa en gen-rendering ikke lukker dem.
    r.querySelectorAll("details.rute").forEach((d) => {
      d.addEventListener("toggle", () => { this._aabne["r" + d.dataset.ri] = d.open; });
    });
  }

  _aendret(el, value) {
    const kind = el.dataset.kind;
    const ri = Number(el.dataset.ri);
    const pi = Number(el.dataset.pi);
    const key = el.dataset.key;
    if (kind === "root") return this._saetRod(key, value);
    if (kind === "field") return this._saetFelt(ri, pi, key, value);
    if (kind === "badge") return this._saetBadge(ri, pi, key, value);
    if (kind === "badge-toggle") return this._skiftBadge(ri, pi, value);
  }

  _handling(el) {
    const h = el.dataset.handling;
    const ri = Number(el.dataset.ri);
    const pi = Number(el.dataset.pi);
    const ruter = this._config.routes;

    if (h === "importer") return this._importer();
    if (h === "rute-tilfoej") {
      ruter.push({ label: "Ny rute", icon: "mdi:circle-outline", url: "" });
      this._aabne["r" + (ruter.length - 1)] = true;
      this._emit(); return this._render();
    }
    if (h === "rute-op") return this._flyt(ruter, ri, -1);
    if (h === "rute-ned") return this._flyt(ruter, ri, 1);
    if (h === "rute-slet") { ruter.splice(ri, 1); this._emit(); return this._render(); }

    const rute = ruter[ri];
    if (!rute) return;
    if (h === "pop-tilfoej") {
      rute.popup = Array.isArray(rute.popup) ? rute.popup : [];
      rute.popup.push({ label: "Nyt punkt", icon: "mdi:circle-small", url: "" });
      this._aabne["r" + ri] = true;
      this._emit(); return this._render();
    }
    if (h === "pop-op") return this._flyt(rute.popup, pi, -1);
    if (h === "pop-ned") return this._flyt(rute.popup, pi, 1);
    if (h === "pop-slet") {
      rute.popup.splice(pi, 1);
      if (!rute.popup.length) delete rute.popup;
      this._emit(); return this._render();
    }
  }

  _css() {
    return `
*{box-sizing:border-box}
.ed{display:grid;gap:14px;padding:8px 0;color:var(--primary-text-color)}
.kort{display:grid;gap:10px;padding:14px;border:1px solid var(--divider-color);
  border-radius:14px;background:var(--card-background-color)}
h3{margin:0;font-size:14px}
h4{margin:0;font-size:12px;color:var(--secondary-text-color);
  text-transform:uppercase;letter-spacing:.06em}
.hoved{display:flex;align-items:center;justify-content:space-between;gap:10px}
.gitter{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
label>span{display:block;margin-bottom:5px;color:var(--secondary-text-color);font-size:11px}
label.bred{grid-column:1/-1}
input,textarea,select{width:100%;min-height:42px;padding:8px 10px;border:1px solid var(--divider-color);
  border-radius:9px;background:var(--input-fill-color,rgba(0,0,0,.05));
  color:var(--primary-text-color);font:inherit}
textarea{min-height:52px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;resize:vertical}
.tjekrk{display:flex;flex-wrap:wrap;gap:16px}
.tjek{display:flex;align-items:center;gap:8px}
.tjek input{width:18px;min-height:18px}
.tjek span{margin:0;font-size:12px;color:var(--primary-text-color)}
.deaktiveret{opacity:.45;pointer-events:none}
.deaktiveret input{cursor:not-allowed}
.knap{min-height:36px;padding:0 12px;border:1px solid var(--primary-color);border-radius:9px;
  background:transparent;color:var(--primary-color);font:inherit;font-weight:700;cursor:pointer}
.knap:hover{background:color-mix(in srgb,var(--primary-color) 12%,transparent)}
.mini{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;
  padding:0;border:1px solid var(--divider-color);border-radius:8px;background:transparent;
  color:var(--secondary-text-color);font-size:11px;cursor:pointer}
.mini:hover{color:var(--primary-text-color);border-color:var(--primary-color)}
.mini.fjern:hover{color:var(--error-color);border-color:var(--error-color)}
.vaerktoej{display:flex;gap:4px;margin-left:auto}
details.rute{border:1px solid var(--divider-color);border-radius:12px;overflow:hidden}
details.rute>summary{display:flex;align-items:center;gap:9px;padding:10px 12px;cursor:pointer;
  list-style:none;background:color-mix(in srgb,var(--primary-text-color) 3%,transparent)}
details.rute>summary::-webkit-details-marker{display:none}
details.rute[open]>summary{border-bottom:1px solid var(--divider-color)}
summary ha-icon{--mdc-icon-size:20px;color:var(--primary-color)}
.navn{font-weight:700;font-size:13px}
.mrk{padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700;
  background:color-mix(in srgb,var(--primary-color) 14%,transparent);color:var(--primary-color)}
.krop{display:grid;gap:12px;padding:12px}
.badge{display:grid;gap:9px;padding:10px;border:1px dashed var(--divider-color);border-radius:11px}
.under{display:grid;gap:9px}
.punkt{display:grid;gap:9px;padding:10px;border:1px solid var(--divider-color);border-radius:11px;
  background:color-mix(in srgb,var(--primary-text-color) 2%,transparent)}
.p-hoved{display:flex;align-items:center;gap:8px}
.p-hoved ha-icon{--mdc-icon-size:18px;color:var(--secondary-text-color)}
.p-hoved strong{font-size:12px}
.hj{margin:0;font-size:11px;color:var(--secondary-text-color);line-height:1.45}
.hj code{padding:1px 4px;border-radius:4px;
  background:color-mix(in srgb,var(--primary-text-color) 8%,transparent)}
.note{display:grid;gap:8px;justify-items:start;padding:10px;border-radius:11px;font-size:12px;
  line-height:1.45;background:color-mix(in srgb,var(--warning-color,#f59e0b) 12%,transparent)}
.besked{padding:10px;border-radius:11px;font-size:12px;
  background:color-mix(in srgb,var(--primary-color) 14%,transparent);color:var(--primary-text-color)}
@media(max-width:600px){.gitter{grid-template-columns:1fr}}
`;
  }
}

if (!customElements.get("ha-navbar-card-editor")) {
  customElements.define("ha-navbar-card-editor", HaNavbarCardEditor);
}

if (!customElements.get("ha-navbar-card")) customElements.define("ha-navbar-card", HaNavbarCard);

window.customCards = window.customCards || [];
window.customCards.push({
  type: "ha-navbar-card",
  name: "HA Navbar Card",
  description: "Navigationsbar med menu, notifikationscenter og badges",
  preview: true,
});

console.info(
  `%c HA NAVBAR CARD %c v${VERSION} `,
  "color:#fff;background:#38bdf8;font-weight:700",
  "color:#38bdf8;background:#222"
);
