/* TH sider – Vejr, Sikkerhed og Teknik i samme eksklusive stil som forsiden
 * custom:th-weather-page-card · custom:th-security-card · custom:th-tech-card
 * Everything household-specific comes from each card's config; see README.md.
 */
import { ThWeatherPageCard } from './weather-page.js';
import { ThSecurityCard } from './security.js';
import { ThTechCard } from './tech.js';

const VP_VER = '1.1.0';

const CARDS = [
  ['th-weather-page-card', ThWeatherPageCard, 'TH Vejrside', 'Vejrside: vejrkort, radar, 7 dage og målinger'],
  ['th-security-card', ThSecurityCard, 'TH Sikkerhed', 'Alarm, lås, døre og advarsler'],
  ['th-tech-card', ThTechCard, 'TH Teknik', 'Strøm til udstyr, Home Assistant, relæer, printere og backup'],
];
for (const [n, c] of CARDS) if (!customElements.get(n)) customElements.define(n, c);
window.customCards = window.customCards || [];
for (const [type, , name, description] of CARDS)
  if (!window.customCards.some(c => c.type === type)) window.customCards.push({ type, name, description, preview: false });
console.info(`%c TH-PAGES %c ${VP_VER} `, 'background:#e8c37e;color:#111;font-weight:700', 'background:#222;color:#fff');
