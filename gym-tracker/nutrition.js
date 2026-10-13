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
    return Math.round((num / den) * 7 * 100) / 100;
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
    const recommended = Math.max(floor, Math.round((maintenance + adjust) / 10) * 10);
    const kcal = profile.kcal ? Math.max(floor, profile.kcal) : recommended;
    const p = Math.round(goal.proteinPerKg * kg);
    const f = Math.round((kcal * 0.27) / 9);
    const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4));
    return { kcal, recommended, p, c, f, fibre: 30, maintenance, measured, estimate, weeklyTargetKg: Math.round(kg * ratePct * 100) / 100, kg };
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
  function insights({ foods, days, weights, today, target, goal, health = {} }) {
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
      // Swaps only help when cutting or short on protein; in a bulk, carbs are fuel.
      const wantSwaps = goal === "lose" || avgP < target.p * 0.9;
      const total = Object.values(by).reduce((a, b) => a + b.kcal, 0) || 1;
      const totalP = Object.values(by).reduce((a, b) => a + b.p, 0) || 1;
      const ranked = Object.entries(by).sort((a, b) => b[1].kcal - a[1].kcal).slice(0, 5);
      for (const [id, b] of wantSwaps ? ranked : []) {
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
    return out.concat(healthInsights({ days, weights, health, today, goal }));
  }

  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const fmtSleep = (h) => `${Math.floor(h)}h ${String(Math.round((h % 1) * 60)).padStart(2, "0")}m`;

  // Steps and sleep from Apple Health, read against what you ate.
  function healthInsights({ days, weights, health, today, goal = "lose" }) {
    const out = [];
    const range = (a, b) => Object.entries(health).filter(([d]) => d >= addDays(today, -a) && d < addDays(today, -b));
    const stepsNow = avg(range(7, 0).map(([, h]) => h.steps).filter((x) => x != null));
    const stepsBefore = avg(range(14, 7).map(([, h]) => h.steps).filter((x) => x != null));
    if (stepsNow != null && stepsBefore != null && range(7, 0).length >= 3 && range(14, 7).length >= 3) {
      const diff = Math.round(stepsNow - stepsBefore);
      const kg = latestWeight(weights) || 75;
      const kcal = Math.round((Math.abs(diff) * 0.04 * kg) / 70 / 10) * 10; // ~0.04 kcal per step at 70 kg
      if (diff <= -1500) out.push({ kind: "warn", text: `Steps averaged ${Math.round(stepsNow).toLocaleString("en-GB")} this week, down ${Math.abs(diff).toLocaleString("en-GB")} on last week. That's about ${kcal} kcal a day less burned${goal === "lose" ? ", enough to slow a cut" : goal === "gain" ? ", so the same food now gives a bigger surplus" : ""}.` });
      else if (diff >= 1500) out.push({ kind: "good", text: `Steps are up ${diff.toLocaleString("en-GB")} a day on last week (about ${kcal} kcal more burned).` });
    }
    const sleep = range(14, -1).map(([d, h]) => [d, h.sleepH]).filter(([, x]) => x != null);
    if (sleep.length >= 5) {
      const a = avg(sleep.map(([, x]) => x));
      if (a < 6.5) out.push({ kind: "warn", text: `You've averaged ${fmtSleep(a)} of sleep. Under 7 hours tends to raise hunger and slow recovery from training.` });
      // Sleep logged on day D is the night before D: compare that day's eating.
      const short = [], ok = [];
      for (const [d, h] of sleep) {
        const e = days[d]?.entries;
        if (!e || e.length < 2 || d >= today) continue;
        (h < 6.5 ? short : ok).push(totals(e).kcal);
      }
      if (short.length >= 3 && ok.length >= 3) {
        const gap = Math.round((avg(short) - avg(ok)) / 10) * 10;
        if (gap >= 150) out.push({ kind: "warn", text: `After nights under 6½ hours you ate ${gap} kcal more on average (${short.length} days). Plan a high-protein breakfast for those mornings.` });
      }
    }
    return out;
  }

  // Read the text the "Health to Fuel Log" shortcut copies. Tolerates units,
  // thousands separators and durations written several ways.
  function parseHealth(text, today) {
    if (!text || !/fuel ?log/i.test(text)) return null;
    const get = (key) => { const m = text.match(new RegExp("^\\s*" + key + "\\s*[:=]\\s*(.+)$", "im")); return m ? m[1].trim() : null; };
    const num = (v) => { if (v == null) return null; const m = v.replace(/,(?=\d{3}\b)/g, "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };
    const out = { date: today };
    const d = get("date");
    if (d) {
      const iso = d.match(/\d{4}-\d{2}-\d{2}/);
      const uk = d.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (iso) out.date = iso[0];
      else if (uk) out.date = `${uk[3]}-${uk[2].padStart(2, "0")}-${uk[1].padStart(2, "0")}`;
    }
    const steps = num(get("steps")); if (steps != null) out.steps = Math.round(steps);
    const active = num(get("active")); if (active != null) out.active = Math.round(/kj/i.test(get("active")) ? active / 4.184 : active);
    const sl = get("sleep");
    if (sl) {
      const h = sl.match(/(\d+(?:\.\d+)?)\s*(h|hr|hrs|hour|hours)\b/i), m = sl.match(/(\d+)\s*(m|min|mins|minutes)\b/i);
      let hours = null;
      if (h || m) hours = (h ? Number(h[1]) : 0) + (m ? Number(m[1]) / 60 : 0);
      else if (sl.includes(":")) { const [a, b] = sl.split(":").map(Number); hours = a + b / 60; }
      else { const n = num(sl); if (n != null) hours = n > 1440 ? n / 3600 : n > 24 ? n / 60 : n; }
      if (hours != null && hours > 0 && hours < 20) out.sleepH = Math.round(hours * 100) / 100;
    }
    const wt = get("weight");
    if (wt) {
      let w = num(wt);
      if (w != null) {
        if (/st/i.test(wt)) { const lb = wt.match(/st\D*(\d+(?:\.\d+)?)/i); w = w * 6.35029 + (lb ? Number(lb[1]) * 0.453592 : 0); }
        else if (/lb/i.test(wt)) w = w * 0.453592;
        if (w > 25 && w < 350) out.weight = Math.round(w * 10) / 10;
      }
    }
    return Object.keys(out).length > 1 ? out : null;
  }

  // The rest of today as one to three foods you already eat: hit the protein
  // you still need within the calories you have left.
  function planRest({ foods, days, today, target, goal, meal, limit = 3 }) {
    const eaten = totals(days[today]?.entries);
    const rem = { kcal: target.kcal - eaten.kcal, p: target.p - eaten.p };
    if (rem.kcal < 150) return { remaining: rem, plans: [] };
    const hab = habits(days, today);
    const pool = Object.values(foods)
      .map((food) => ({ food, h: hab[food.id], base: hab[food.id]?.avgGrams || food.servingG || 100 }))
      .filter((x) => x.food.per100.kcal > 0)
      .map((x) => ({ ...x, rank: ((x.food.per100.p * 4) / x.food.per100.kcal) * 2 + (x.h ? Math.log2(1 + x.h.uses) * 0.5 : 0) }))
      .sort((a, b) => b.rank - a.rank).slice(0, 14);
    const opts = [];
    for (const x of pool) for (const m of [0.5, 1, 1.5, 2]) {
      const grams = Math.max(5, Math.round((x.base * m) / 5) * 5);
      const n = portion(x.food, grams);
      // Foods you only ever eat at breakfast don't belong in an evening plan.
      const offMeal = meal && x.h && !x.h.meals[meal] && Object.keys(x.h.meals).length === 1 && x.h.meals.breakfast ? 1 : 0;
      if (n.kcal <= rem.kcal) opts.push({ ...x, grams, n, usual: m === 1, big: m === 2, offMeal });
    }
    const ideal = goal === "gain" ? 1 : 0.9;
    const plans = [];
    const consider = (items) => {
      const k = items.reduce((a, i) => a + i.n.kcal, 0), p = items.reduce((a, i) => a + i.n.p, 0);
      if (k > rem.kcal * 1.05 + 30) return;
      const pHit = rem.p > 5 ? Math.min(p, rem.p) / rem.p : 1;
      const s = 5 * pHit - 3 * Math.abs(k / rem.kcal - ideal) + items.reduce((a, i) => a + (i.h ? Math.log2(1 + i.h.uses) * 0.3 : 0) - (i.usual ? 0 : 0.3) - (i.big ? 0.4 : 0) - i.offMeal * 1.2, 0) - 0.4 * (items.length - 1);
      plans.push({ items: items.map((i) => ({ food: i.food, grams: i.grams, n: i.n })), kcal: Math.round(k), p: Math.round(p * 10) / 10, score: s });
    };
    for (let a = 0; a < opts.length; a++) {
      consider([opts[a]]);
      for (let b = a + 1; b < opts.length; b++) {
        if (opts[b].food.id === opts[a].food.id) continue;
        consider([opts[a], opts[b]]);
        for (let c = b + 1; c < opts.length; c++) {
          if (opts[c].food.id === opts[a].food.id || opts[c].food.id === opts[b].food.id) continue;
          consider([opts[a], opts[b], opts[c]]);
        }
      }
    }
    plans.sort((x, y) => y.score - x.score);
    const picked = [], seen = new Set();
    for (const pl of plans) {
      if (picked.length && pl.score < picked[0].score - 2) break; // only offer genuinely good alternatives
      const key = pl.items.map((i) => i.food.id).sort().join("|");
      const lead = pl.items.slice().sort((a, b) => b.n.p - a.n.p)[0].food.id;
      if (seen.has(key) || picked.some((q) => q.lead === lead)) continue;
      seen.add(key); picked.push({ ...pl, lead });
      if (picked.length >= limit) break;
    }
    return { remaining: rem, plans: picked };
  }

  // Weekly review: how the week went and whether to move the calorie target.
  function checkIn({ profile, weights, days, health = {}, today }) {
    const from = addDays(today, -7);
    const logged = Object.entries(days).filter(([d, day]) => d >= from && d < today && (day.entries || []).length >= 2).map(([, day]) => totals(day.entries));
    const t = targets(profile, weights, days, today);
    const current = t.kcal;
    const rate = weeklyChange(weights, 14);
    const tr = trend(weights);
    const at = (d) => { let v = null; for (const p of tr) if (p.date <= d) v = p.trend; return v; };
    const a = at(addDays(today, -8)), b = at(addDays(today, -1));
    const hs = Object.entries(health).filter(([d]) => d >= from && d < today).map(([, h]) => h);
    const res = {
      from, to: addDays(today, -1), daysLogged: logged.length,
      avgKcal: logged.length ? Math.round(avg(logged.map((x) => x.kcal))) : null,
      avgP: logged.length ? Math.round(avg(logged.map((x) => x.p))) : null,
      weekChange: a != null && b != null ? Math.round((b - a) * 100) / 100 : null,
      rate, targetRate: t.weeklyTargetKg, current, targetP: t.p,
      avgSteps: hs.some((h) => h.steps != null) ? Math.round(avg(hs.map((h) => h.steps).filter((x) => x != null))) : null,
      avgSleep: hs.some((h) => h.sleepH != null) ? Math.round(avg(hs.map((h) => h.sleepH).filter((x) => x != null)) * 10) / 10 : null,
      proposed: null, reason: "",
    };
    const floor = profile.sex === "male" ? 1500 : 1200;
    if (logged.length < 4) { res.reason = "Log food on at least 4 days this week for a reliable check-in. Targets stay as they are."; return res; }
    let proposed = current, why = "";
    if (t.measured && Math.abs(t.recommended - current) >= 75) {
      proposed = t.recommended;
      why = `Your measured maintenance is ${t.measured.kcal} kcal, from ${t.measured.daysLogged} logged days and your weight trend.`;
    } else if (!t.measured && rate != null) {
      const tgt = t.weeklyTargetKg;
      if (profile.goal === "lose" && rate > tgt * 0.5) { proposed = current - 150; why = `You lost ${Math.abs(rate)} kg a week against a ${Math.abs(tgt)} kg target.`; }
      else if (profile.goal === "lose" && rate < tgt * 1.75) { proposed = current + 150; why = `You're losing ${Math.abs(rate)} kg a week, faster than the ${Math.abs(tgt)} kg target. A little more food protects muscle.`; }
      else if (profile.goal === "gain" && rate < tgt * 0.5) { proposed = current + 150; why = `Weight moved ${rate} kg a week against a +${tgt} kg target.`; }
      else if (profile.goal === "gain" && rate > tgt * 2) { proposed = current - 150; why = `You gained ${rate} kg a week, faster than muscle can be built.`; }
      else if (profile.goal === "maintain" && Math.abs(rate) > 0.25) { proposed = current - Math.sign(rate) * 150; why = `Weight moved ${rate} kg a week while maintaining.`; }
    }
    // Change gradually: at most 200 kcal a week.
    proposed = Math.max(floor, Math.round(Math.max(current - 200, Math.min(current + 200, proposed)) / 10) * 10);
    // Logging well under target while weight holds steady usually means food is going unlogged.
    if (proposed < current && res.avgKcal != null && res.avgKcal < current - 400 && (rate == null || Math.abs(rate) < Math.abs(t.weeklyTargetKg) * 0.5)) {
      res.reason = `You logged ${res.avgKcal} kcal a day, well under your ${current} target, yet your weight barely moved. That usually means some food or drink isn't being logged. Log everything for a week before changing targets.`;
      return res;
    }
    // Eating well over target explains a stall better than the target does.
    if (proposed < current && profile.goal === "lose" && res.avgKcal > current + 150) {
      res.reason = `You averaged ${res.avgKcal} kcal against a ${current} target. Eat to the current target for another week before lowering it.`;
      return res;
    }
    if (proposed !== current) { res.proposed = proposed; res.reason = why; }
    else res.reason = "You're on track. Keep the same targets this week.";
    return res;
  }

  function checkInDue(profile, days, today) {
    if (profile.lastCheckIn) return daysBetween(profile.lastCheckIn, today) >= 7;
    const first = Object.keys(days).sort()[0];
    return !!first && daysBetween(first, today) >= 7;
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

  return { GOALS, ACTIVITY, MEALS, KCAL_PER_KG, iso, addDays, daysBetween, mealForHour, portion, totals, trend, weeklyChange, latestWeight, measuredMaintenance, estimatedMaintenance, targets, habits, suggest, insights, healthInsights, parseHealth, planRest, checkIn, checkInDue, fromOpenFoodFacts };
});
