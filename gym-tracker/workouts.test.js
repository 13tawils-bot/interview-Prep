// Run with: node --test gym-tracker/workouts.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const W = require("./workouts.js");
const EX = require("./exercises.js");
const idx = Object.fromEntries(EX.map((e) => [e.id, e]));
const bench = idx["x-bench-press-barbell"], squat = idx["x-squat-barbell"], db = idx["x-lateral-raise-dumbbell"], pull = idx["x-pull-up"], plank = idx["x-plank"];
const DAY = 86400000, t0 = Date.UTC(2026, 8, 1, 18);
const set = (kg, reps, type = "n") => ({ kg, reps, type, done: true });
function wk(i, list) {
  return { id: "w" + i, start: t0 + i * 2 * DAY, end: t0 + i * 2 * DAY + 3600000, date: new Date(t0 + i * 2 * DAY).toISOString().slice(0, 10), exercises: list.map(([ex, sets]) => ({ exId: ex.id, sets })) };
}
const history = {
  w1: wk(1, [[bench, [set(40, 10, "w"), set(80, 8), set(80, 8), set(80, 7)]], [squat, [set(100, 8), set(100, 8)]]]),
  w2: wk(2, [[bench, [set(80, 10), set(80, 10), set(80, 10)]], [pull, [{ reps: 8, type: "n", done: true }, { reps: 7, type: "n", done: true }]]]),
  w3: wk(3, [[squat, [set(100, 12), set(100, 12)]], [db, [set(10, 15), set(10, 15)]], [plank, [{ sec: 60, type: "n", done: true }]]]),
};

test("Epley estimate", () => {
  assert.equal(W.e1rm(100, 1), 100);
  assert.equal(W.e1rm(80, 10), 106.7);
  assert.equal(W.e1rm(80, 20), W.e1rm(80, 12), "caps high reps");
  assert.equal(W.e1rm(0, 10), 0);
});

test("previous session and bests ignore warm-ups", () => {
  const p = W.previous(bench.id, history);
  assert.equal(p.workoutId, "w2");
  const b = W.bests(bench.id, history);
  assert.equal(b.kg.kg, 80);
  assert.equal(b.kg.reps, 10);
  assert.equal(b.e1rm.value, 106.7);
  assert.equal(b.sessionVolume.value, 2400);
  assert.equal(W.bests(bench.id, history, history.w2.start).kg.reps, 8, "history before a workout");
});

test("double progression: add weight once the top of the range is hit", () => {
  const up = W.nextTarget(bench, history, [8, 10]);
  assert.equal(up.kg, 82.5);
  assert.equal(up.reps, 8);
  assert.ok(up.up);
  const hold = W.nextTarget(bench, history, [8, 12]);
  assert.equal(hold.kg, 80);
  assert.equal(hold.reps, 11);
  assert.equal(W.nextTarget(squat, history, [8, 12]).kg, 105, "lower body barbell jumps 5 kg");
  assert.equal(W.nextTarget(db, history, [10, 15]).kg, 12, "dumbbells jump 2 kg");
  assert.match(W.nextTarget(pull, history, [6, 10]).text, /Aim for 8\+/);
  assert.equal(W.nextTarget(idx["x-deadlift-barbell"], history), null);
});

test("PR detection against earlier history only", () => {
  const before = t0 + 10 * DAY;
  assert.deepEqual(W.setPRs(set(85, 5), bench, history, before), ["weight"]);
  assert.deepEqual(W.setPRs(set(80, 12), bench, history, before), ["1RM"]);
  assert.deepEqual(W.setPRs(set(85, 5, "w"), bench, history, before), []);
  assert.deepEqual(W.setPRs({ reps: 9, type: "n", done: true }, pull, history, before), ["reps"]);
  assert.deepEqual(W.setPRs({ sec: 75, type: "n", done: true }, plank, history, before), ["time"]);
  assert.deepEqual(W.setPRs(set(60, 5), idx["x-deadlift-barbell"], history, before), [], "first ever session sets no PR");
});

test("summary counts working sets, volume and best PR per exercise", () => {
  const w = wk(5, [[bench, [set(60, 8, "w"), set(85, 6), set(85, 6)]]]);
  const s = W.summary(w, idx, history);
  assert.equal(s.sets, 2);
  assert.equal(s.volume, 1020);
  assert.equal(s.durationMin, 60);
  assert.deepEqual(s.prs.map((p) => p.kind), ["weight"]);
});

test("weekly sets per muscle", () => {
  const m = W.muscleSets(history, idx, t0 + 7 * DAY);
  assert.equal(m.chest, 6);
  assert.equal(m.quads, 4);
  assert.equal(m.triceps, 3);
  assert.equal(m.lats, 2);
  assert.equal(m.shoulders, 2 + 3);
});

test("exercise library", () => {
  assert.ok(EX.length >= 350);
  assert.equal(new Set(EX.map((e) => e.id)).size, EX.length);
  for (const e of EX) assert.ok(["wr", "bw", "as", "du", "cd"].includes(e.type), e.name);
  assert.equal(idx["x-pull-up-assisted"].type, "as");
  assert.equal(idx["x-running"].type, "cd");
});
