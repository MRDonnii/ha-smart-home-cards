import assert from "node:assert/strict";
import { installFakeDom, mockHass, renderCard, disconnect } from "./helpers/fake-dom.mjs";
installFakeDom();
const { rer, goalOf, recommendedKcal, feedingRow, ageMonths, kcalFor } = await import("../src/cards/ha-pet-nutrition-card/ha-pet-nutrition-card.js");
assert.equal(Math.round(rer(24)), 759);
assert.equal(goalOf("Tabe sig").key, "lose"); assert.equal(goalOf("Holde vægten").key, "keep"); assert.equal(goalOf("Aktiv").key, "active"); assert.equal(goalOf("?").key, "keep");
assert.equal(recommendedKcal(24, 23, "Tabe sig"), 880);
assert.equal(recommendedKcal(24, 0, "Tabe sig"), 910);        // no goal weight → current weight
assert.equal(recommendedKcal(24, 23, "Holde vægten"), 1060);
assert.ok(Number.isNaN(recommendedKcal(5, 0, "Aktiv")));       // not weighed yet
assert.deepEqual(feedingRow(24, 1.2, 386, 6, 3), { kg: 24, kcal: 910, grams: 235, portions: 13 });
assert.equal(ageMonths("2025-09-15", new Date(2026, 10, 23)), 14);
assert.equal(ageMonths("2025-09-30", new Date(2026, 10, 23)), 13);
assert.equal(kcalFor("A", { A: 380 }, 1), 380); assert.equal(kcalFor("Food (346)", null, 1), 346); assert.equal(kcalFor("B", null, 385), 385);
// render smoke test with example data
const st = (state, attributes = {}) => ({ state: String(state), attributes });
const hass = mockHass({ states: {
  "input_select.dog_food": st("Puppy Original", { options: ["Puppy Original", "Adult Chicken (voksen)"] }),
  "input_select.dog_goal": st("Tabe sig", { options: ["Tabe sig", "Holde vægten", "Aktiv"] }),
  "input_number.portions": st(14, { min: 5, max: 30 }), "number.portion_weight": st(6),
  "input_number.weight": st(24, { min: 5, max: 60 }), "input_number.goal_weight": st(23, { min: 5, max: 60 }),
  "input_datetime.birthday": st("2025-09-15"), "input_number.container": st(600) }, ws: { "history/history_during_period": {} } });
const card = await renderCard("ha-pet-nutrition-card", { name: "Buddy", food: "input_select.dog_food", food_kcal: { "Puppy Original": 386, "Adult Chicken (voksen)": 382 },
  portions: "input_number.portions", portion_weight: "number.portion_weight", meals_count: 3, weight: "input_number.weight",
  goal_weight: "input_number.goal_weight", goal: "input_select.dog_goal", birthday: "input_datetime.birthday", container: "input_number.container" }, hass);
const html = card.shadowRoot.innerHTML;
assert.match(html, /973/);            // 14 × 6 g × 3 × 3.86 kcal
assert.match(html, /mål 880/);
assert.match(html, /11 % for meget/);
assert.match(html, /Anbefalet <b>13<\/b>/);
assert.match(html, /Tid til voksenfoder/);
assert.match(html, /2 dage i beholder/);
disconnect(card);
console.log("pet nutrition card tests passed");
