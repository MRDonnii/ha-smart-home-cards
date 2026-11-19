// "Klar kl." next-run logic in the Danish time zone (clock changes included). Change by Claude AI.
process.env.TZ = "Europe/Copenhagen";
import assert from "node:assert/strict";
import { RS_COLLISION_S, rsDateInput, rsDayWord, rsDays, rsEpoch, rsLabel, rsNext, rsNearestAt, rsOnceAt, rsQuickDate, rsWeeklyGoal } from "../src/shared/ready-schedule.js";

const at = (text) => Math.floor(new Date(text).getTime() / 1000);
const WORK = "1,2,3,4,5";
const ALL = "1,2,3,4,5,6,7";

assert.deepEqual(rsDays("5, 1,1,9,x"), [1, 5], "days are cleaned");
assert.equal(rsEpoch(""), 0); assert.equal(rsEpoch("unknown"), 0); assert.equal(rsEpoch("1800000000"), 1800000000);

// Weekdays: Thursday evening goes to Friday, Friday evening skips the weekend.
assert.equal(rsWeeklyGoal({ nowS: at("2026-11-19T20:00:00+01:00"), time: "06:45", days: WORK }), at("2026-11-20T06:45:00+01:00"));
assert.equal(rsWeeklyGoal({ nowS: at("2026-11-20T20:00:00+01:00"), time: "06:45", days: WORK }), at("2026-11-23T06:45:00+01:00"));
assert.equal(rsWeeklyGoal({ nowS: at("2026-11-20T06:45:00+01:00"), time: "06:45", days: ALL }), at("2026-11-21T06:45:00+01:00"), "the minute itself has passed");
assert.equal(rsWeeklyGoal({ nowS: at("2026-11-20T06:44:00+01:00"), time: "06:45", days: ALL }), at("2026-11-20T06:45:00+01:00"));
assert.equal(rsWeeklyGoal({ nowS: at("2026-11-20T06:00:00+01:00"), time: "06:45", days: "" }), 0, "no days, no run");

// Midnight: the start falls on the evening before, and the weekday is the ready day's.
let next = rsNext({ nowS: at("2026-11-19T23:40:00+01:00"), weeklyOn: true, time: "00:10", days: "5", leadMin: 20 });
assert.equal(next.goal, at("2026-11-20T00:10:00+01:00")); assert.equal(next.start, at("2026-11-19T23:50:00+01:00"));
assert.equal(rsNext({ nowS: at("2026-11-19T23:40:00+01:00"), weeklyOn: true, time: "00:10", days: "4", leadMin: 20 }).goal, at("2026-11-26T00:10:00+01:00"));

// Spring forward 2027-03-28: 02:30 does not exist and moves to 03:30; the lead is real minutes across the jump.
next = rsNext({ nowS: at("2027-03-28T00:00:00+01:00"), weeklyOn: true, time: "02:30", days: ALL, leadMin: 20 });
assert.equal(next.goal, at("2027-03-28T03:30:00+02:00"));
next = rsNext({ nowS: at("2027-03-28T00:00:00+01:00"), weeklyOn: true, time: "03:10", days: ALL, leadMin: 20 });
assert.equal(next.goal, at("2027-03-28T03:10:00+02:00")); assert.equal(next.goal - next.start, 1200);
assert.equal(next.start, at("2027-03-28T01:50:00+01:00"));
// Fall back 2026-10-25: 02:30 happens twice and counts the first time only.
next = rsNext({ nowS: at("2026-10-25T00:00:00+02:00"), weeklyOn: true, time: "02:30", days: ALL, leadMin: 20 });
assert.equal(next.goal, at("2026-10-25T02:30:00+02:00"));
assert.equal(rsWeeklyGoal({ nowS: at("2026-10-25T02:40:00+01:00"), time: "02:30", days: ALL, lastS: next.goal }), at("2026-10-26T02:30:00+01:00"), "not again in the repeated hour");
// Same wall clock on both sides of a clock change.
assert.equal(rsWeeklyGoal({ nowS: at("2027-03-27T12:00:00+01:00"), time: "06:45", days: ALL }), at("2027-03-28T06:45:00+02:00"));

// One-time: independent of the weekly plan, and shown as such.
const now = at("2026-11-19T20:00:00+01:00"); const once = at("2026-11-20T06:45:00+01:00");
next = rsNext({ nowS: now, weeklyOn: false, time: "07:30", days: ALL, onceS: once, leadMin: 20 });
assert.equal(next.kind, "once"); assert.equal(rsLabel(next, now), "Engang: i morgen kl. 06.45");
assert.equal(rsLabel(null, now), "Ikke planlagt");
assert.equal(rsLabel(rsNext({ nowS: now, weeklyOn: true, time: "06:45", days: "1", leadMin: 20 }), now), "Næste: mandag kl. 06.45");
assert.equal(rsDayWord(at("2026-12-04T06:45:00+01:00"), now), "fredag 4. dec.");

// Collision: the same morning runs once and the one-time run wins, before and after the weekly time.
next = rsNext({ nowS: now, weeklyOn: true, time: "07:30", days: ALL, onceS: once, leadMin: 20 });
assert.equal(next.kind, "once"); assert.equal(next.goal, once);
next = rsNext({ nowS: now, weeklyOn: true, time: "06:00", days: ALL, onceS: once, leadMin: 20 });
assert.equal(next.kind, "once", "the earlier weekly time gives way too");
// After the one-time run the weekly time that morning stays away; the next morning it is back, plan unchanged.
const after = once + 60;
assert.equal(rsWeeklyGoal({ nowS: after, time: "07:30", days: ALL, lastS: once }), at("2026-11-21T07:30:00+01:00"));
// Far enough apart is not a collision.
next = rsNext({ nowS: now, weeklyOn: true, time: "06:45", days: ALL, onceS: at("2026-11-20T17:00:00+01:00"), leadMin: 20 });
assert.equal(next.kind, "week"); assert.equal(next.goal, once);
assert.equal(rsWeeklyGoal({ nowS: now, time: "09:45", days: ALL, onceS: once }), at("2026-11-20T09:45:00+01:00"), `exactly ${RS_COLLISION_S / 3600} h apart is no collision`);

// Cancel: without the one-time time the weekly run of that morning is simply back.
next = rsNext({ nowS: now, weeklyOn: true, time: "07:30", days: ALL, onceS: 0, leadMin: 20 });
assert.equal(next.kind, "week"); assert.equal(next.goal, at("2026-11-20T07:30:00+01:00"));

// Restart: only stored values count, so the same input gives the same plan; a time that passed while HA was down is gone.
assert.deepEqual(rsNext({ nowS: now, weeklyOn: true, time: "07:30", days: ALL, onceS: once, lastS: 0, leadMin: 20 }), rsNext({ nowS: now, weeklyOn: true, time: "07:30", days: ALL, onceS: once, lastS: 0, leadMin: 20 }));
next = rsNext({ nowS: once + 3600, weeklyOn: false, time: "07:30", days: ALL, onceS: once, leadMin: 20 });
assert.equal(next, null, "a passed one-time time is not a plan");

// The form: today/tomorrow by the calendar (also across a clock change), passed times refused in Danish.
assert.equal(rsQuickDate("today", now), "2026-11-19"); assert.equal(rsQuickDate("tomorrow", now), "2026-11-20");
assert.equal(rsQuickDate("tomorrow", at("2027-03-27T23:30:00+01:00")), "2027-03-28");
assert.equal(rsQuickDate("tomorrow", at("2026-12-31T23:30:00+01:00")), "2027-01-01", "new year");
assert.equal(rsDateInput(at("2026-11-19T23:59:00+01:00")), "2026-11-19");
assert.deepEqual(rsOnceAt("2026-11-20", "06:45", now), { ok: true, goal: once });
let refused = rsOnceAt("2026-11-19", "19:30", now);
assert.equal(refused.ok, false); assert.match(refused.error, /allerede passeret/); assert.match(refused.error, /19\.30/);
assert.equal(rsOnceAt("2026-11-19", "20:00", now).ok, false, "this very minute has passed");
assert.equal(rsOnceAt("", "06:45", now).ok, false); assert.equal(rsOnceAt("2026-11-20", "", now).ok, false);
assert.equal(rsOnceAt("2027-03-28", "02:30", at("2027-03-27T12:00:00+01:00")).goal, at("2027-03-28T03:30:00+02:00"));

console.log("ready-schedule tests passed");

// "Næste gang": the nearest coming time – set at 01.00 for 06.45 it is the same morning, after 06.45 it is tomorrow.
assert.deepEqual(rsNearestAt("06:45", at("2026-11-19T01:00:00+01:00")), { ok: true, goal: at("2026-11-19T06:45:00+01:00") });
assert.deepEqual(rsNearestAt("06:45", at("2026-11-19T06:45:00+01:00")), { ok: true, goal: at("2026-11-20T06:45:00+01:00") }, "this very minute has passed");
assert.equal(rsNearestAt("06:45", at("2026-11-19T20:00:00+01:00")).goal, at("2026-11-20T06:45:00+01:00"));
assert.equal(rsNearestAt("06:45", at("2026-12-31T23:30:00+01:00")).goal, at("2027-01-01T06:45:00+01:00"), "new year");
assert.equal(rsNearestAt("", at("2026-11-19T01:00:00+01:00")).ok, false);
