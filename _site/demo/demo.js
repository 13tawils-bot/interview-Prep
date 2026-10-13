// Example data for the Fuel Log demo: four weeks of a lean-bulk log, built
// relative to today so the demo always looks current. Loaded only by the demo page.
(function () {
  const N = window.Nutrition, C = window.COMMON_FOODS;
  const today = N.iso(new Date());
  const DAY = 86400000;
  // Small deterministic noise so the demo looks the same on every load.
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

  const foods = {};
  const use = (id) => { const f = C.find((x) => x.id === id); foods[f.id] = f; return f; };
  const own = (id, name, brand, per100, servingG) => (foods[id] = { id, name, brand, barcode: "", per100, servingG, source: "label" });
  const oats = use("g-porridge-oats"), milk = use("g-milk-semi-skimmed"), banana = use("g-banana"), egg = use("g-egg-whole"),
    bread = use("g-bread-wholemeal"), chicken = use("g-chicken-breast-grilled"), rice = use("g-rice-white-cooked"),
    broccoli = use("g-broccoli-boiled"), salmon = use("g-salmon-fillet-baked"), potato = use("g-jacket-potato-with-skin"),
    mince = use("g-beef-mince-5-fat-raw"), pasta = use("g-pasta-cooked"), yog = use("g-greek-yoghurt-0-fat"),
    berries = use("g-blueberries"), almonds = use("g-almonds"), pb = use("g-peanut-butter"), whey = use("g-whey-protein-powder"),
    crisps = use("g-crisps-ready-salted"), thigh = use("g-chicken-thigh-skinless-cooked"), wrap = use("g-tortilla-wrap");
  const bar = own("f-demo-bar", "Protein bar, cookie dough", "", { kcal: 380, p: 33, c: 32, f: 13, fibre: 6 }, 60);
  const sandwich = own("f-demo-sandwich", "Chicken and bacon sandwich", "", { kcal: 245, p: 14, c: 24, f: 10, fibre: 2 }, 190);

  const e = (f, g, meal) => ({ foodId: f.id, name: f.name, grams: g, meal, t: 0, ...N.portion(f, g) });
  const breakfasts = [
    () => [e(oats, 100, "breakfast"), e(milk, 300, "breakfast"), e(banana, 100, "breakfast"), e(whey, 30, "breakfast")],
    () => [e(egg, 174, "breakfast"), e(bread, 108, "breakfast"), e(yog, 170, "breakfast"), e(banana, 100, "breakfast")],
  ];
  const lunches = [
    () => [e(chicken, 200, "lunch"), e(rice, 300, "lunch"), e(broccoli, 80, "lunch")],
    () => [e(sandwich, 190, "lunch"), e(banana, 100, "lunch"), e(bar, 60, "lunch")],
    () => [e(wrap, 124, "lunch"), e(chicken, 160, "lunch"), e(yog, 170, "lunch")],
  ];
  const dinners = [
    () => [e(salmon, 160, "dinner"), e(potato, 300, "dinner"), e(broccoli, 80, "dinner")],
    () => [e(mince, 200, "dinner"), e(pasta, 320, "dinner")],
    () => [e(thigh, 200, "dinner"), e(rice, 320, "dinner")],
  ];
  const snacks = [
    () => [e(yog, 170, "snacks"), e(berries, 80, "snacks")],
    () => [e(bar, 60, "snacks"), e(almonds, 30, "snacks")],
    () => [e(pb, 32, "snacks"), e(bread, 36, "snacks")],
    () => [e(crisps, 50, "snacks"), e(yog, 170, "snacks")],
  ];

  const days = {}, weights = {}, health = {};
  for (let i = 28; i >= 1; i--) {
    const d = N.addDays(today, -i);
    if (i % 9 !== 4) days[d] = { entries: [...pick(breakfasts)(), ...pick(lunches)(), ...pick(dinners)(), ...pick(snacks)(), ...pick(snacks)()] };
    if (rnd() > 0.12) weights[d] = Math.round((78 + (28 - i) * 0.032 + (rnd() - 0.5) * 0.9) * 10) / 10;
    const sleep = Math.round((6.1 + rnd() * 2.1) * 100) / 100;
    health[d] = { steps: Math.round(6000 + rnd() * 6500), active: Math.round(380 + rnd() * 320), sleepH: sleep };
  }
  weights[today] = 78.9;
  days[today] = { entries: [...breakfasts[0](), ...lunches[0]()] };
  health[today] = { steps: 4210, active: 190, sleepH: 7.4 };

  // Push / pull / legs, four days a week, with steady progression.
  const S = (kg, reps, type = "n") => ({ kg, reps, type, done: true });
  const BW = (reps) => ({ reps, type: "n", done: true });
  const plans = {
    "Push day": (k) => [
      ["x-bench-press-barbell", [S(40, 10, "w"), S(70 + k * 2.5, 8), S(70 + k * 2.5, 8), S(70 + k * 2.5, 7)], [6, 10], 150],
      ["x-overhead-press-barbell", [S(40 + k * 1.25, 8), S(40 + k * 1.25, 7), S(40 + k * 1.25, 6)], [6, 10], 120],
      ["x-incline-bench-press-dumbbell", [S(24 + (k > 1 ? 2 : 0), 10), S(24 + (k > 1 ? 2 : 0), 9), S(24 + (k > 1 ? 2 : 0), 8)], [8, 12], 90],
      ["x-lateral-raise-dumbbell", [S(10, 15), S(10, 14), S(10, 12)], [12, 15], 60],
      ["x-rope-pushdown-cable", [S(25 + k * 2.5, 12), S(25 + k * 2.5, 11), S(25 + k * 2.5, 10)], [10, 15], 60],
    ],
    "Pull day": (k) => [
      ["x-deadlift-barbell", [S(60, 5, "w"), S(120 + k * 5, 5), S(120 + k * 5, 5), S(120 + k * 5, 4)], [3, 6], 180],
      ["x-pull-up", [BW(8 + k), BW(7 + k), BW(6 + k)], [6, 12], 120],
      ["x-seated-cable-row-cable", [S(55 + k * 2.5, 10), S(55 + k * 2.5, 10), S(55 + k * 2.5, 9)], [8, 12], 90],
      ["x-face-pull-cable", [S(20, 15), S(20, 15), S(20, 14)], [12, 15], 60],
      ["x-bicep-curl-dumbbell", [S(12 + (k > 2 ? 2 : 0), 12), S(12 + (k > 2 ? 2 : 0), 11), S(12 + (k > 2 ? 2 : 0), 10)], [8, 12], 60],
    ],
    "Leg day": (k) => [
      ["x-squat-barbell", [S(60, 8, "w"), S(95 + k * 5, 6), S(95 + k * 5, 6), S(95 + k * 5, 5)], [5, 8], 180],
      ["x-romanian-deadlift-barbell", [S(80 + k * 2.5, 10), S(80 + k * 2.5, 9), S(80 + k * 2.5, 8)], [8, 12], 120],
      ["x-leg-press-machine", [S(160 + k * 10, 12), S(160 + k * 10, 11), S(160 + k * 10, 10)], [10, 15], 90],
      ["x-seated-leg-curl-machine", [S(45 + k * 2.5, 12), S(45 + k * 2.5, 11)], [10, 15], 60],
      ["x-standing-calf-raise-machine", [S(70, 15), S(70, 14), S(70, 12)], [10, 15], 60],
    ],
  };
  const workouts = {};
  const schedule = [[27, "Push day"], [26, "Pull day"], [24, "Leg day"], [22, "Push day"], [20, "Pull day"], [19, "Leg day"], [17, "Push day"], [15, "Pull day"],
    [13, "Leg day"], [12, "Push day"], [10, "Pull day"], [8, "Leg day"], [6, "Push day"], [5, "Pull day"], [3, "Leg day"], [1, "Push day"]];
  schedule.forEach(([ago, name], n) => {
    const k = Math.floor(n / 3);
    const start = new Date(N.addDays(today, -ago) + "T18:05:00").getTime();
    workouts["wk-demo-" + n] = {
      id: "wk-demo-" + n, name, start, end: start + (58 + Math.round(rnd() * 20)) * 60000, date: N.addDays(today, -ago), routineId: "rt-" + name.split(" ")[0].toLowerCase(),
      exercises: plans[name](k).map(([exId, sets, range, rest]) => ({ exId, sets, range, rest, note: "" })),
    };
  });
  const routines = {};
  for (const name of Object.keys(plans)) {
    const id = "rt-" + name.split(" ")[0].toLowerCase();
    routines[id] = { id, name, exercises: plans[name](0).map(([exId, sets, range, rest]) => ({ exId, sets: sets.filter((s) => s.type !== "w").length, range, rest })) };
  }

  window.FUEL_DEMO = {
    profile: { goal: "gain", ratePct: 0.25, sex: "male", age: 28, heightCm: 180, startWeight: 78, activity: "moderate", unit: "kg", kcal: 2800, lastCheckIn: N.addDays(today, -7) },
    weights, foods, days, health, workouts, routines,
    meals: { "m-demo-1": { id: "m-demo-1", name: "Usual breakfast", meal: "breakfast", items: breakfasts[0]().map((x) => ({ foodId: x.foodId, name: x.name, grams: x.grams, per100: foods[x.foodId].per100 })) } },
    exercises: {}, photos: {},
  };
})();
