// Nutrition maths for Fuel Log: targets, weight trend, measured maintenance,
// and food suggestions from your own history. Pure functions, no DOM.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Nutrition = api;
})(typeof self !== "undefined" ? self : this, function () {
  const KCAL_PER_KG = 7700; // energy in 1 kg of body mass change, roughly
  const ACTIVITY = { sedentary: 1.2, light: 1.375, moderate: 1.55, very: 1.725 };
  const GOALS = {
    lose: { label: "Lose fat", proteinPerKg: 2.0, weeklyRate: -0.005 },
    maintain: { label: "Maintain", proteinPerKg: 1.6, weeklyRate: 0 },
    gain: { label: "Build muscle", proteinPerKg: 1.8, weeklyRate: 0.0025 },
  };
  const MEALS = ["breakfast", "lunch", "dinner", "snacks"];

  const r1 = (n) => Math.round(n * 10) / 10;
  const DAY = 86400000;
  const toDate = (s) => new Date(s + "T12:00:00");
  const iso = (d) => {
    const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return z.toISOString().slice(0, 10);
  };
  const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);

  function mealForHour(h) {
    if (h < 11) return "breakfast";
    if (h < 15) return "lunch";
    if (h >= 17 && h < 22) return "dinner";
    return "snacks";
  }

  // Nutrition for a portion of a food, from its per-100g values.
  function portion(food, grams) {
    const f = grams / 100, n = food.per100;
    return { kcal: Math.round(n.kcal * f), p: r1(n.p * f), c: r1(n.c * f), f: r1(n.f * f), fibre: r1((n.fibre || 0) * f) };
  }

  function totals(entries) {
    const t = { kcal: 0, p: 0, c: 0, f: 0, fibre: 0 };
    for (const e of entries || []) for (const k in t) t[k] += e[k] || 0;
    for (const k in t) t[k] = k === "kcal" ? Math.round(t[k]) : r1(t[k]);
    return t;
  }

  // Exponentially smoothed weight, one value per calendar day, so a single
  // salty dinner or water swing doesn't read as progress or failure.
  function trend(weights, alpha = 0.15) {
    const dates = Object.keys(weights).sort();
    if (!dates.length) return [];
    const out = [];
    let t = weights[dates[0]];
    for (let d = dates[0]; d <= dates[dates.length - 1]; d = addDays(d, 1)) {
      if (weights[d] != null) t = t + alpha * (weights[d] - t);
      out.push({ date: d, trend: r1(t * 10) / 10, weight: weights[d] ?? null });
    }
    return out;
  }

  // Least-squares slope of the trend over the last `days`, in kg per week.
  function weeklyChange(weights, days = 21) {
    const tr = trend(weights);
    if (tr.length < 7) return null;
    const pts = tr.slice(-days);
    const n = pts.length, xs = pts.map((_, i) => i), ys = pts.map((p) => p.trend);
    const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) { num += (xs[i] - mx) * (ys[i] - my); den += (xs[i] - mx) ** 2; }
    return r1((num / den) * 7 * 100) / 100;
  }

  function latestWeight(weights) {
    const dates = Object.keys(weights).sort();
    return dates.length ? weights[dates[dates.length - 1]] : null;
  }

  // Maintenance measured from your own data: what you ate, minus what the
  // scale says that did. Needs a few weeks of logging to be trustworthy.
  function measuredMaintenance(weights, days, today, window = 28) {
    const start = addDays(today, -window);
    const logged = Object.entries(days).filter(([d, day]) => d >= start && d < today && (day.entries || []).length >= 2);
    const w = Object.fromEntries(Object.entries(weights).filter(([d]) => d >= start));
    if (logged.length < 14 || Object.keys(w).length < 6) return null;
    const avgIn = logged.reduce((a, [, day]) => a + totals(day.entries).kcal, 0) / logged.length;
    const slope = weeklyChange(w, window);
    if (slope == null) return null;
    return { kcal: Math.round((avgIn - (slope / 7) * KCAL_PER_KG) / 10) * 10, daysLogged: logged.length, avgIntake: Math.round(avgIn) };
  }

  function estimatedMaintenance(profile, kg) {
    const bmr = 10 * kg + 6.25 * profile.heightCm - 5 * profile.age + (profile.sex === "male" ? 5 : -161);
    return Math.round((bmr * (ACTIVITY[profile.activity] || 1.375)) / 10) * 10;
  }

  function targets(profile, weights, days, today) {
    const kg = latestWeight(weights) || profile.startWeight;
    const goal = GOALS[profile.goal] || GOALS.maintain;
    const measured = measuredMaintenance(weights, days, today);
    const estimate = estimatedMaintenance(profile, kg);
    const maintenance = measured ? measured.kcal : estimate;
    const ratePct = profile.goal === "lose" ? -(profile.ratePct ?? 0.5) / 100 : profile.goal === "gain" ? (profile.ratePct ?? 0.25) / 100 : 0;
    let adjust = (kg * ratePct * KCAL_PER_KG) / 7;
    adjust = Math.max(-750, Math.min(500, adjust));
    const floor = profile.sex === "male" ? 1500 : 1200;
    const kcal = Math.max(floor, Math.round((maintenance + adjust) / 10) * 10);
    const p = Math.round(goal.proteinPerKg * kg);
    const f = Math.round((kcal * 0.27) / 9);
    const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
    return { kcal, p, c, f, fibre: 30, maintenance, measured, estimate, weeklyTargetKg: Math.round(kg * ratePct * 100) / 100, kg };
  }

  // How you usually eat a food: average logged grams, meals, frequency.
  function habits(days, today, window = 60) {
    const start = addDays(today, -window), out = {};
    for (const [d, day] of Object.entries(days)) {
      if (d < start || d > today) continue;
      for (const e of day.entries || []) {
        const h = (out[e.foodId] ||= { uses: 0, grams: 0, meals: {}, kcal: 0, lastDate: d });
        h.uses++; h.grams += e.grams; h.kcal += e.kcal;
        h.meals[e.meal] = (h.meals[e.meal] || 0) + 1;
        if (d > h.lastDate) h.lastDate = d;
      }
    }
    for (const h of Object.values(out)) h.avgGrams = Math.round(h.grams / h.uses);
    return out;
  }

  // Foods from your own library that best close today's gap for your goal.
  function suggest({ foods, days, today, target, goal, meal, limit = 5 }) {
    const eaten = totals(days[today]?.entries);
    const rem = { kcal: target.kcal - eaten.kcal, p: target.p - eaten.p, fibre: target.fibre - eaten.fibre };
    if (rem.kcal < 80) return { remaining: rem, items: [], note: rem.kcal < -150 ? "You're over today's calories. Nothing else needed today." : "You've hit today's calories." };
    const hab = habits(days, today);
    const items = [];
    for (const food of Object.values(foods)) {
      const h = hab[food.id];
      const grams = h?.avgGrams || food.servingG || 100;
      const n = portion(food, grams);
      if (n.kcal <= 0 || n.kcal > rem.kcal + 60) continue;
      const density = (n.p * 4) / n.kcal; // share of calories from protein
      let s = 0;
      if (rem.p > 5) s += 3 * Math.min(n.p, rem.p) / rem.p + 4 * density;
      if (goal === "lose") s += food.per100.kcal < 150 ? 1 : food.per100.kcal > 400 ? -1.5 : 0;
      if (goal === "lose" && rem.fibre > 5) s += Math.min(n.fibre, rem.fibre) / 8;
      if (goal === "gain") s += Math.min(n.kcal, rem.kcal) / Math.max(rem.kcal, 300);
      s += h ? Math.log2(1 + h.uses) * 0.6 : 0;
      if (h && meal && h.meals[meal]) s += 0.8 * (h.meals[meal] / h.uses);
      if (days[today]?.entries?.some((e) => e.foodId === food.id)) s -= 1.5; // variety
      const why = [];
      if (density >= 0.35) why.push("very lean");
      if (goal === "lose" && food.per100.kcal < 150) why.push("filling for the calories");
      if (n.fibre >= 4) why.push(`${n.fibre}g fibre`);
      if (h && h.uses >= 3) why.push(`you've had it ${h.uses}× lately`);
      if (s > 0) items.push({ food, grams, n, score: s, why });
    }
    items.sort((a, b) => b.score - a.score);
    return { remaining: rem, items: items.slice(0, limit), note: null };
  }

  // Patterns in the last two weeks worth acting on.
  function insights({ foods, days, weights, today, target, goal }) {
    const out = [];
    const start = addDays(today, -14);
    const logged = Object.entries(days).filter(([d, day]) => d >= start && d < today && (day.entries || []).length);
    if (logged.length >= 3) {
      const t = logged.map(([, day]) => totals(day.entries));
      const avgK = Math.round(t.reduce((a, x) => a + x.kcal, 0) / t.length);
      const avgP = Math.round(t.reduce((a, x) => a + x.p, 0) / t.length);
      const hitP = t.filter((x) => x.p >= target.p * 0.9).length;
      out.push({ kind: avgP >= target.p * 0.9 ? "good" : "warn", text: `Protein averaged ${avgP}g against a ${target.p}g target; you hit it on ${hitP} of ${t.length} logged days.` });
      const off = avgK - target.kcal;
      out.push({ kind: Math.abs(off) <= 150 ? "good" : "warn", text: `Calories averaged ${avgK} a day, ${Math.abs(off)} ${off >= 0 ? "over" : "under"} target.` });

      // Biggest calorie sources that bring little protein, and a leaner swap you already eat.
      const by = {};
      for (const [, day] of logged) for (const e of day.entries) {
        const b = (by[e.foodId] ||= { kcal: 0, p: 0, meals: {} });
        b.kcal += e.kcal; b.p += e.p; b.meals[e.meal] = (b.meals[e.meal] || 0) + 1;
      }
      const total = Object.values(by).reduce((a, b) => a + b.kcal, 0) || 1;
      const totalP = Object.values(by).reduce((a, b) => a + b.p, 0) || 1;
      const ranked = Object.entries(by).sort((a, b) => b[1].kcal - a[1].kcal).slice(0, 5);
      for (const [id, b] of ranked) {
        const food = foods[id];
        if (!food || b.kcal / total < 0.08 || (b.p * 4) / b.kcal >= 0.15) continue;
        const meal = Object.entries(b.meals).sort((x, y) => y[1] - x[1])[0][0];
        const swap = Object.values(foods)
          .filter((f) => f.id !== id && by[f.id]?.meals[meal] && (f.per100.p * 4) / Math.max(f.per100.kcal, 1) > 0.25 && f.per100.kcal < food.per100.kcal)
          .sort((x, y) => y.per100.p / y.per100.kcal - x.per100.p / x.per100.kcal)[0];
        out.push({ kind: "swap", text: `${food.name} made up ${Math.round((b.kcal / total) * 100)}% of your calories but ${Math.round((b.p / totalP) * 100)}% of your protein.${swap ? ` At ${meal}, ${swap.name} is a leaner option you already eat.` : ""}` });
        if (out.length >= 5) break;
      }
    } else {
      out.push({ kind: "info", text: "Log food on three or more days to see patterns here." });
    }

    const rate = weeklyChange(weights);
    if (rate != null) {
      const kg = latestWeight(weights);
      const pct = (rate / kg) * 100;
      if (goal === "lose") {
        if (pct > -0.15) out.push({ kind: "warn", text: `Trend weight is ${rate >= 0 ? "up" : "down"} ${Math.abs(rate)} kg a week, slower than your target. Cutting about 150 kcal a day, or adding steps, should restart it.` });
        else if (pct < -1) out.push({ kind: "warn", text: `You're losing ${Math.abs(rate)} kg a week, over 1% of body weight. That pace risks muscle loss; eating a little more is fine.` });
        else out.push({ kind: "good", text: `Losing ${Math.abs(rate)} kg a week on trend. That's a sustainable pace that protects muscle.` });
      } else if (goal === "gain") {
        if (pct < 0.05) out.push({ kind: "warn", text: `Trend weight is flat or falling (${rate} kg a week). Add about 150 kcal a day to support muscle gain.` });
        else if (pct > 0.5) out.push({ kind: "warn", text: `Gaining ${rate} kg a week, faster than muscle can be built. Trim about 150 kcal a day to limit fat gain.` });
        else out.push({ kind: "good", text: `Gaining ${rate} kg a week on trend, in the lean-gain range.` });
      } else if (Math.abs(pct) > 0.25) out.push({ kind: "warn", text: `Trend weight is moving ${rate} kg a week while you're aiming to maintain.` });
    }
    return out;
  }

  // Map an Open Food Facts product to a library food.
  function fromOpenFoodFacts(code, product) {
    const n = product.nutriments || {};
    const kcal = n["energy-kcal_100g"] ?? (n["energy_100g"] != null ? n["energy_100g"] / 4.184 : null);
    if (kcal == null) return null;
    return {
      id: "bc-" + code, barcode: code,
      name: product.product_name || "Unnamed product", brand: (product.brands || "").split(",")[0].trim(),
      per100: { kcal: Math.round(kcal), p: r1(n.proteins_100g || 0), c: r1(n.carbohydrates_100g || 0), f: r1(n.fat_100g || 0), fibre: r1(n.fiber_100g || 0) },
      servingG: Number(product.serving_quantity) || null, source: "Open Food Facts",
    };
  }

  return { GOALS, ACTIVITY, MEALS, KCAL_PER_KG, iso, addDays, daysBetween, mealForHour, portion, totals, trend, weeklyChange, latestWeight, measuredMaintenance, estimatedMaintenance, targets, habits, suggest, insights, fromOpenFoodFacts };
});
