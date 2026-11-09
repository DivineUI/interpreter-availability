const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const A = require("../public/js/availability.js");

const read = (f) => JSON.parse(fs.readFileSync(path.join(__dirname, "../public/data", f), "utf8"));
const schedule = read("schedule.json");
const config = read("config.json");
const overrides = read("overrides.json").overrides;

const at = (text) => A.parseAt(text);
const status = (name, when, ov = overrides) => A.statusFor(name, at(when), schedule, ov, config);
const mins = (w) => (w ? A.fmtRange(w[0], w[1]) : null);

test("Monday 09:40: Nick is free until 11:30", () => {
  const s = status("Nick", "Monday 09:40");
  assert.strictEqual(s.state, "free");
  assert.strictEqual(mins(s.current), "9:30 AM - 11:30 AM");
});

test("Monday 09:40: Elsie is busy, next free 11:45 AM - 3:00 PM", () => {
  const s = status("Elsie", "Monday 09:40");
  assert.strictEqual(s.state, "busy");
  assert.strictEqual(mins(s.next), "11:45 AM - 3:00 PM");
});

test("15-minute gaps are ignored (Francis Monday 9:30-9:45)", () => {
  const s = status("Francis", "Monday 09:35");
  assert.strictEqual(s.state, "busy");
});

test("Monday 12:00: Nick busy, next free 1:00 PM? gap is 15 min so skipped to 2:45 PM", () => {
  const s = status("Nick", "Monday 12:00");
  assert.strictEqual(s.state, "busy");
  assert.strictEqual(mins(s.next), "2:45 PM - 5:00 PM");
});

test("Saturday is off", () => {
  assert.strictEqual(status("Nick", "Saturday 10:00").state, "off");
});

test("Before 8am on a weekday", () => {
  const s = status("Nick", "Monday 07:30");
  assert.strictEqual(s.state, "before");
  assert.ok(s.later.length > 0);
});

test("After 5pm is off", () => {
  assert.strictEqual(status("Elsie", "Monday 17:10").state, "off");
});

test("Overrides block time on their date only", () => {
  const ov = [{ interpreter: "Nick", date: "2026-11-09", start: "09:30", end: "11:30" }];
  assert.strictEqual(status("Nick", "2026-11-09T10:00", ov).state, "busy");
  assert.strictEqual(status("Nick", "2026-11-16T10:00", ov).state, "free");
});

test("Last free window runs to end of day", () => {
  const s = status("Mustapha", "Monday 15:00");
  assert.strictEqual(s.state, "free");
  assert.strictEqual(mins(s.current), "2:45 PM - 5:00 PM");
});

test("Every weekday has no zero-length or reversed windows", () => {
  for (const day of config.workDays) {
    for (const name of schedule.interpreters) {
      const s = A.statusFor(name, { day, date: null, minutes: 8 * 60 }, schedule, [], config);
      s.windows.forEach((w) => assert.ok(w[1] - w[0] >= config.minGapMinutes));
    }
  }
});

test("Known double-bookings are detected", () => {
  const found = A.findConflicts(schedule).map((c) => c.interpreter + " " + c.day);
  assert.ok(found.includes("Mustapha Thursday"));
  assert.ok(found.includes("Francis Friday"));
});
