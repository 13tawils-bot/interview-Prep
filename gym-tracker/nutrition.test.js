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
});

test("Open Food Facts mapping", () => {
  const f = N.fromOpenFoodFacts("5000159484695", { product_name: "Twix", brands: "Twix, Mars", serving_quantity: "43", nutriments: { "energy-kcal_100g": 495, proteins_100g: 4.5, carbohydrates_100g: 64, fat_100g: 24, fiber_100g: 1.5 } });
  assert.deepEqual(f.per100, { kcal: 495, p: 4.5, c: 64, f: 24, fibre: 1.5 });
  assert.equal(f.servingG, 43);
  assert.equal(f.brand, "Twix");
  assert.equal(N.fromOpenFoodFacts("1", { nutriments: {} }), null);
});
