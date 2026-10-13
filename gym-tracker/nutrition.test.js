// Run with: node --test gym-tracker/nutrition.test.js
const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("./nutrition.js");

const profile = { sex: "male", age: 30, heightCm: 180, activity: "moderate", goal: "lose", ratePct: 0.5, startWeight: 85 };
const foods = {
  chicken: { id: "chicken", name: "Chicken breast", per100: { kcal: 106, p: 24, c: 0, f: 1.1, fibre: 0 }, servingG: 150 },
  yog: { id: "yog", name: "Greek yoghurt 0%", per100: { kcal: 57, p: 10, c: 3.6, f: 0.2, fibre: 0 }, servingG: 170 },
  crisps: { id: "crisps", name: "Crisps", per100: { kcal: 530, p: 6, c: 53, f: 32, fibre: 4 }, servingG: 40 },
  oats: { id: "oats", name: "Oats", per100: { kcal: 375, p: 11, c: 60, f: 8, fibre: 9 }, servingG: 50 },
};
const entry = (food, grams, meal) => ({ foodId: food.id, name: food.name, grams, meal, ...N.portion(food, grams) });

function history(today, n, kcalFood, startKg, perDayKg) {
  const days = {}, weights = {};
  for (let i = n; i >= 1; i--) {
    const d = N.addDays(today, -i);
    days[d] = { entries: [entry(foods.oats, 80, "breakfast"), entry(foods.chicken, 200, "dinner"), entry(foods.crisps, kcalFood, "snacks"), entry(foods.yog, 170, "snacks")] };
    weights[d] = Math.round((startKg + perDayKg * (n - i)) * 10) / 10;
  }
  return { days, weights };
}

test("Mifflin-St Jeor estimate and fat-loss target", () => {
  assert.equal(N.estimatedMaintenance(profile, 85), 2840);
  const t = N.targets(profile, { "2026-10-01": 85 }, {}, "2026-10-13");
  assert.equal(t.maintenance, 2840);
  assert.equal(t.kcal, 2370); // 0.5%/wk of 85 kg ≈ 468 kcal/day deficit
  assert.equal(t.p, 170);
  assert.ok(Math.abs(t.p * 4 + t.c * 4 + t.f * 9 - t.kcal) < 15);
});

test("calorie floor applies to aggressive cuts", () => {
  const t = N.targets({ ...profile, sex: "female", heightCm: 150, age: 60, activity: "sedentary", ratePct: 1 }, { "2026-10-01": 50 }, {}, "2026-10-13");
  assert.equal(t.kcal, 1200);
});

test("trend smooths noise and weekly change reads the slope", () => {
  const w = {};
  for (let i = 0; i < 28; i++) w[N.addDays("2026-09-01", i)] = 85 - i * 0.1 + (i % 2 ? 0.6 : -0.6);
  const rate = N.weeklyChange(w);
  assert.ok(rate < -0.4 && rate > -0.9, `rate ${rate}`);
});

test("measured maintenance comes from intake and weight change", () => {
  const today = "2026-10-13";
  const { days, weights } = history(today, 28, 60, 85, -0.05); // losing 0.35 kg/week
  const m = N.measuredMaintenance(weights, days, today);
  assert.ok(m, "needs 14+ logged days");
  // 0.35 kg/week ≈ 385 kcal/day deficit on top of intake
  assert.ok(Math.abs(m.kcal - (m.avgIntake + 385)) < 120, JSON.stringify(m));
  assert.equal(N.targets(profile, weights, days, today).measured.kcal, m.kcal);
});

test("suggestions favour lean, familiar foods that fit what's left", () => {
  const today = "2026-10-13";
  const { days } = history(today, 10, 60, 85, 0);
  days[today] = { entries: [entry(foods.oats, 80, "breakfast")] };
  const target = { kcal: 2300, p: 170, fibre: 30 };
  const s = N.suggest({ foods, days, today, target, goal: "lose", meal: "dinner" });
  assert.equal(s.items[0].food.id, "chicken");
  assert.ok(s.items.findIndex((i) => i.food.id === "crisps") > s.items.findIndex((i) => i.food.id === "yog"));
  assert.ok(!s.items.some((i) => i.food.id === "oats" && i.score > s.items[0].score));
});

test("no suggestions once calories are used up", () => {
  const today = "2026-10-13";
  const days = { [today]: { entries: [entry(foods.crisps, 500, "snacks")] } };
  const s = N.suggest({ foods, days, today, target: { kcal: 2000, p: 150, fibre: 30 }, goal: "lose" });
  assert.equal(s.items.length, 0);
  assert.match(s.note, /over/);
});

test("insights flag a low-protein calorie source and a stalled cut", () => {
  const today = "2026-10-13";
  const { days, weights } = history(today, 14, 150, 85, 0.01);
  const target = N.targets(profile, weights, days, today);
  const text = N.insights({ foods, days, weights, today, target, goal: "lose" }).map((i) => i.text).join("\n");
  assert.match(text, /Crisps made up \d+% of your calories but \d+% of your protein/);
  assert.match(text, /Greek yoghurt 0% is a leaner option/);
  assert.match(text, /slower than your target/);
  const bulk = N.insights({ foods, days, weights, today, target: { ...target, p: 50 }, goal: "gain" }).map((i) => i.text).join("\n");
  assert.doesNotMatch(bulk, /made up/, "no swaps in a bulk with protein covered");
});

test("Open Food Facts mapping", () => {
  const f = N.fromOpenFoodFacts("5000159484695", { product_name: "Twix", brands: "Twix, Mars", serving_quantity: "43", nutriments: { "energy-kcal_100g": 495, proteins_100g: 4.5, carbohydrates_100g: 64, fat_100g: 24, fiber_100g: 1.5 } });
  assert.deepEqual(f.per100, { kcal: 495, p: 4.5, c: 64, f: 24, fibre: 1.5 });
  assert.equal(f.servingG, 43);
  assert.equal(f.brand, "Twix");
  assert.equal(N.fromOpenFoodFacts("1", { nutriments: {} }), null);
});

test("Health import reads the shortcut's text in any common format", () => {
  assert.deepEqual(N.parseHealth("Fuel Log\nsteps: 8,423\nactive: 512 kcal\nsleep: 7 hr 12 min\nweight: 83.4 kg", "2026-10-13"),
    { date: "2026-10-13", steps: 8423, active: 512, sleepH: 7.2, weight: 83.4 });
  const b = N.parseHealth("FUELLOG\ndate: 13/10/2026\nactive: 2100 kJ\nsleep: 25920\nweight: 13 st 2 lb", "x");
  assert.equal(b.date, "2026-10-13");
  assert.equal(b.active, 502);
  assert.equal(b.sleepH, 7.2);
  assert.equal(b.weight, 83.5);
  assert.equal(N.parseHealth("sleep: 7", "d"), null, "needs the Fuel Log header");
});

test("plan for the rest of the day hits protein within calories", () => {
  const today = "2026-10-13";
  const { days } = history(today, 10, 60, 85, 0);
  days[today] = { entries: [entry(foods.oats, 80, "breakfast")] };
  const target = { kcal: 2000, p: 170 };
  const { remaining, plans } = N.planRest({ foods, days, today, target, goal: "lose" });
  assert.ok(plans.length >= 1);
  for (const pl of plans) {
    assert.ok(pl.kcal <= remaining.kcal * 1.05 + 30, `over: ${pl.kcal}`);
    assert.ok(pl.items.length >= 1 && pl.items.length <= 3);
  }
  assert.ok(plans[0].p >= remaining.p * 0.8, `protein ${plans[0].p} of ${remaining.p}`);
  assert.ok(plans[0].items.some((i) => i.food.id === "chicken"));
  if (plans[1]) assert.notEqual(plans[0].lead, plans[1].lead);
});

test("check-in lowers calories when a cut stalls, but not if over-eating explains it", () => {
  const today = "2026-10-13";
  const p = { ...profile, kcal: 2300 };
  const stalled = history(today, 10, 300, 85, 0.005); // flat weight, ~2.2k kcal logged, close to target
  const c = N.checkIn({ profile: p, weights: stalled.weights, days: stalled.days, today });
  assert.equal(c.daysLogged, 7);
  assert.equal(c.proposed, 2150);
  const over = history(today, 10, 400, 85, 0.005); // ~2.7k kcal logged
  const c2 = N.checkIn({ profile: p, weights: over.weights, days: over.days, today });
  assert.equal(c2.proposed, null);
  assert.match(c2.reason, /Eat to the current target/);
  const under = history(today, 20, 0, 85, 0); // ~1.4k kcal logged, flat weight, measured maintenance would read low
  const c3 = N.checkIn({ profile: p, weights: under.weights, days: under.days, today });
  assert.equal(c3.proposed, null);
  assert.match(c3.reason, /isn't being logged/);
  const sparse = N.checkIn({ profile: p, weights: {}, days: {}, today });
  assert.equal(sparse.proposed, null);
  assert.match(sparse.reason, /at least 4 days/);
});

test("approved target overrides the computed one", () => {
  const t = N.targets({ ...profile, kcal: 2100 }, { "2026-10-01": 85 }, {}, "2026-10-13");
  assert.equal(t.kcal, 2100);
  assert.equal(t.recommended, 2370);
  assert.ok(Math.abs(t.p * 4 + t.c * 4 + t.f * 9 - 2100) < 15);
});

test("health insights flag falling steps and eating more after short sleep", () => {
  const today = "2026-10-13";
  const { days, weights } = history(today, 14, 60, 85, 0);
  const health = {};
  for (let i = 14; i >= 1; i--) {
    const d = N.addDays(today, -i), short = i % 2 === 0;
    health[d] = { steps: i > 7 ? 11000 : 7000, sleepH: short ? 5.5 : 7.8 };
    if (short) days[d].entries.push(entry(foods.crisps, 60, "snacks"));
  }
  const text = N.healthInsights({ days, weights, health, today }).map((i) => i.text).join("\n");
  assert.match(text, /down 4,000 on last week/);
  assert.match(text, /After nights under 6½ hours you ate 3\d0 kcal more/);
});

test("common foods are complete and internally consistent", () => {
  const common = require("./commonfoods.js");
  assert.ok(common.length > 100);
  const ids = new Set();
  for (const f of common) {
    assert.ok(!ids.has(f.id), f.id); ids.add(f.id);
    const n = f.per100, est = n.p * 4 + n.c * 4 + n.f * 9 + n.fibre * 2;
    if (!/Lager|wine/i.test(f.name) && n.kcal > 30) assert.ok(Math.abs(est - n.kcal) / n.kcal < 0.2, f.name);
    assert.ok(f.units.every((u) => u.g > 0 && u.label));
  }
});
