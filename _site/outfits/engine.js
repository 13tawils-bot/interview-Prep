// Outfit assembly engine. Pure functions over a catalogue of products, so it
// runs the same in the browser and under `node --test`.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.OutfitEngine = api;
})(typeof self !== "undefined" ? self : this, function () {
  const AESTHETICS = {
    min: { label: "Minimal", near: ["cla"] },
    cla: { label: "Classic", near: ["min", "rom"] },
    str: { label: "Streetwear", near: ["edg", "min"] },
    boh: { label: "Boho", near: ["rom"] },
    edg: { label: "Edgy", near: ["str", "min"] },
    rom: { label: "Romantic", near: ["boh", "cla"] },
  };

  // Each template is one way to dress for the occasion. `g` limits it to
  // womenswear (w) or menswear (m); "any" works for everyone.
  const OCCASIONS = {
    cas: { label: "Casual weekend", templates: [
      { g: "any", slots: ["top", "bottom", "shoes"] },
      { g: "w", slots: ["dress", "shoes"] },
    ] },
    wrk: { label: "Office", templates: [
      { g: "w", slots: ["top", "bottom", "shoes", "bag"] },
      { g: "w", slots: ["dress", "shoes", "bag"] },
      { g: "m", slots: ["top", "bottom", "shoes", "acc"] },
    ] },
    int: { label: "Interview", templates: [
      { g: "w", slots: ["top", "bottom", "outer", "shoes", "bag"] },
      { g: "w", slots: ["dress", "outer", "shoes", "bag"] },
      { g: "m", slots: ["top", "bottom", "outer", "shoes"] },
    ] },
    dat: { label: "Date night", templates: [
      { g: "w", slots: ["dress", "shoes", "bag"] },
      { g: "w", slots: ["top", "bottom", "shoes", "bag"] },
      { g: "m", slots: ["top", "bottom", "shoes"] },
    ] },
    wed: { label: "Wedding guest", templates: [
      { g: "w", slots: ["dress", "shoes", "bag", "acc"] },
      { g: "w", slots: ["top", "bottom", "shoes", "bag"] },
      { g: "m", slots: ["top", "bottom", "outer", "shoes", "acc"] },
    ] },
    par: { label: "Party", templates: [
      { g: "w", slots: ["dress", "shoes", "bag"] },
      { g: "w", slots: ["top", "bottom", "shoes", "bag"] },
      { g: "m", slots: ["top", "bottom", "shoes", "acc"] },
    ] },
  };

  const SLOT_LABELS = { top: "Top", bottom: "Bottoms", dress: "Dress", outer: "Outerwear", shoes: "Shoes", bag: "Bag", acc: "Accessory" };

  const DEFAULTS = { budget: 200, occasion: "wed", aesthetic: "rom", gender: "w", season: "mild", palette: "any", count: 3 };

  const round2 = (n) => Math.round(n * 100) / 100;

  function fitsGender(product, gender) {
    if (gender === "all") return true;
    return product.gender === "u" || product.gender === gender;
  }

  function templatesFor(prefs) {
    const occ = OCCASIONS[prefs.occasion] || OCCASIONS.cas;
    return occ.templates
      .filter((t) => t.g === "any" || prefs.gender === "all" || t.g === prefs.gender)
      .map((t) => {
        const slots = t.slots.slice();
        // Cold weather needs a layer on top.
        if (prefs.season === "cold" && !slots.includes("outer")) slots.splice(slots.indexOf("shoes"), 0, "outer");
        return slots;
      });
  }

  // How well one product suits the brief, ignoring price.
  function scoreItem(p, prefs) {
    let s = 0;
    if (p.aesthetics.includes(prefs.aesthetic)) s += p.aesthetics[0] === prefs.aesthetic ? 3.5 : 3;
    else if ((AESTHETICS[prefs.aesthetic]?.near || []).some((a) => p.aesthetics.includes(a))) s += 1.2;
    s += p.occasions.includes(prefs.occasion) ? 3 : -4;
    if (prefs.palette === "neutral") s += p.family === "neutral" ? 1 : -1;
    else if (prefs.palette === "earthy") s += p.family === "earth" ? 1.2 : p.family === "neutral" ? 0.4 : -1;
    else if (prefs.palette === "colour") s += p.family === "bold" || p.family === "print" || p.family === "pastel" ? 1.2 : 0;
    if (p.category === "outer") {
      if (prefs.season === "cold") s += p.warmth >= 3 ? 2 : p.warmth === 2 ? 0.5 : -1;
      if (prefs.season === "warm") s += p.warmth >= 2 ? -2 : 0.5;
    }
    if (prefs.season === "cold" && /sandal/i.test(p.name)) s -= 2;
    if (prefs.season === "warm" && /boots|beanie/i.test(p.name)) s -= 1;
    return s;
  }

  // Delivery charged per retailer, waived once that basket reaches its threshold.
  function delivery(items, retailers) {
    const baskets = {};
    for (const p of items) baskets[p.retailer] = (baskets[p.retailer] || 0) + p.price;
    return Object.entries(baskets).map(([code, subtotal]) => {
      const r = retailers[code];
      const free = r.freeOver != null && subtotal >= r.freeOver;
      return { code, name: r.name, subtotal: round2(subtotal), delivery: free ? 0 : r.delivery, freeOver: r.freeOver, items: items.filter((p) => p.retailer === code) };
    });
  }

  // Colour rules of thumb: one statement colour, one print, neutrals anchor.
  function harmony(items, prefs) {
    const fam = (f) => items.filter((p) => p.family === f).length;
    const bold = fam("bold"), print = fam("print"), pastel = fam("pastel"), earth = fam("earth");
    let s = 0;
    if (bold > 1) s -= 2.5 * (bold - 1);
    if (print > 1) s -= 2.5 * (print - 1);
    if (bold && print) s -= 1.5;
    if (pastel && earth) s -= 0.5;
    if (bold + print === 1) s += prefs.palette === "neutral" ? 0 : 0.8; // a single focal point
    if (bold + print + pastel === 0 && prefs.palette !== "colour") s += 0.6;
    return s;
  }

  function evaluate(items, prefs, catalogue) {
    const baskets = delivery(items, catalogue.retailers);
    const itemsTotal = round2(items.reduce((a, p) => a + p.price, 0));
    const deliveryTotal = round2(baskets.reduce((a, b) => a + b.delivery, 0));
    const total = round2(itemsTotal + deliveryTotal);
    const fit = items.reduce((a, p) => a + scoreItem(p, prefs), 0) / items.length;
    // Mild preference for using the budget well, plus a nudge against paying for postage.
    const use = Math.min(total / prefs.budget, 1);
    const score = fit * 3 + harmony(items, prefs) + use * 1.5 - deliveryTotal * 0.15;
    return { items, baskets, itemsTotal, deliveryTotal, total, remaining: round2(prefs.budget - total), score: round2(score) };
  }

  function candidatesFor(slot, prefs, catalogue, perSlot) {
    const pool = catalogue.products
      .filter((p) => p.category === slot && fitsGender(p, prefs.gender))
      .map((p) => ({ p, s: scoreItem(p, prefs) }))
      .sort((a, b) => b.s - a.s || a.p.price - b.p.price);
    const best = pool.slice(0, perSlot);
    // Keep a few cheap but relevant options so tight budgets still find a look.
    const cheap = pool.filter((c) => c.s > 0 && !best.includes(c)).sort((a, b) => a.p.price - b.p.price).slice(0, 4);
    return best.concat(cheap);
  }

  function search(slots, prefs, catalogue, beamWidth) {
    const cands = slots.map((slot) => candidatesFor(slot, prefs, catalogue, 10));
    const minRest = cands.map((_, i) => cands.slice(i + 1).reduce((a, c) => a + Math.min(...c.map((x) => x.p.price)), 0));
    let beam = [{ items: [], cost: 0, s: 0 }];
    cands.forEach((options, i) => {
      const next = [];
      for (const st of beam) {
        for (const { p, s } of options) {
          const cost = st.cost + p.price;
          if (cost + minRest[i] > prefs.budget) continue;
          next.push({ items: st.items.concat(p), cost, s: st.s + s });
        }
      }
      next.sort((a, b) => b.s - a.s);
      beam = next.slice(0, beamWidth);
    });
    return beam.map((st) => evaluate(st.items, prefs, catalogue)).filter((o) => o.total <= prefs.budget);
  }

  function overlap(a, b) {
    const ids = new Set(a.items.map((p) => p.id));
    return b.items.filter((p) => ids.has(p.id)).length;
  }

  // Build several complete, distinct outfits within the budget (delivery included).
  function buildOutfits(input, catalogue) {
    const prefs = { ...DEFAULTS, ...input };
    prefs.budget = Number(prefs.budget);
    let all = [];
    for (const slots of templatesFor(prefs)) all = all.concat(search(slots, prefs, catalogue, 250));
    all.sort((a, b) => b.score - a.score);
    const picked = [];
    for (const maxShared of [1, 2, Infinity]) {
      for (const o of all) {
        if (picked.length >= prefs.count) break;
        if (picked.includes(o)) continue;
        if (picked.every((q) => overlap(q, o) <= maxShared && q.items[0].id !== o.items[0].id)) picked.push(o);
      }
    }
    return picked.map((o) => ({ ...o, notes: explain(o, prefs) }));
  }

  // Alternatives for one piece that keep the whole outfit within budget.
  function alternatives(outfit, index, input, catalogue, limit = 6) {
    const prefs = { ...DEFAULTS, ...input };
    const current = outfit.items[index];
    return candidatesFor(current.category, prefs, catalogue, 14)
      .map((c) => c.p)
      .filter((p) => !outfit.items.some((q) => q.id === p.id))
      .map((p) => {
        const items = outfit.items.slice();
        items[index] = p;
        return { product: p, outfit: evaluate(items, prefs, catalogue) };
      })
      .filter((a) => a.outfit.total <= prefs.budget)
      .sort((a, b) => b.outfit.score - a.outfit.score)
      .slice(0, limit)
      .map((a) => ({ ...a, outfit: { ...a.outfit, notes: explain(a.outfit, prefs) } }));
  }

  function list(words) {
    return words.length < 2 ? words.join("") : words.slice(0, -1).join(", ") + " and " + words[words.length - 1];
  }

  const cap = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // Cheapest complete look for the brief, ignoring style, so the UI can say how far off a budget is.
  function minimumBudget(input, catalogue) {
    const prefs = { ...DEFAULTS, ...input };
    let best = Infinity;
    for (const slots of templatesFor(prefs)) {
      const items = [];
      for (const slot of slots) {
        const pool = catalogue.products.filter((p) => p.category === slot && fitsGender(p, prefs.gender));
        if (!pool.length) { items.length = 0; break; }
        items.push(pool.reduce((a, p) => (p.price < a.price ? p : a)));
      }
      if (items.length) best = Math.min(best, evaluate(items, prefs, catalogue).total);
    }
    return best;
  }

  function explain(o, prefs) {
    const notes = [];
    const hero = o.items.reduce((a, p) => (p.price > a.price ? p : a));
    const accents = o.items.filter((p) => p.family !== "neutral");
    const neutrals = [...new Set(o.items.filter((p) => p.family === "neutral").map((p) => p.colour))];
    const heroName = hero.name.toLowerCase().includes(hero.colour) ? hero.name.toLowerCase() : `${hero.colour} ${hero.name.toLowerCase()}`;
    notes.push(`Built around the ${heroName}, the biggest spend at £${hero.price}.`);
    if (!accents.length) notes.push(`An all-neutral palette (${list(neutrals)}) keeps it easy to re-wear.`);
    else if (!neutrals.length) notes.push(`A colour-led look: ${list(accents.map((p) => p.colour))}.`);
    else notes.push(`${cap(list(neutrals))} ${neutrals.length > 1 ? "anchor" : "anchors"} it, with ${list(accents.map((p) => p.colour))} as the focal ${accents.length > 1 ? "colours" : "colour"}.`);
    const style = AESTHETICS[prefs.aesthetic]?.label.toLowerCase();
    const off = o.items.filter((p) => !p.occasions.includes(prefs.occasion));
    const onStyle = o.items.filter((p) => p.aesthetics.includes(prefs.aesthetic)).length;
    notes.push(`${onStyle} of ${o.items.length} pieces are tagged ${style}.`);
    if (off.length) notes.push(`Closest available match for the ${list(off.map((p) => SLOT_LABELS[p.category].toLowerCase()))}: check it suits the dress code.`);
    const paid = o.baskets.filter((b) => b.delivery > 0);
    if (o.baskets.length > 1) notes.push(`Shops ${o.baskets.length} retailers; ${paid.length ? `£${o.deliveryTotal.toFixed(2)} delivery included` : "free delivery on every basket"}.`);
    else notes.push(paid.length ? `One retailer, £${o.deliveryTotal.toFixed(2)} delivery included.` : "One retailer with free delivery.");
    if (o.remaining >= 5) notes.push(`£${o.remaining.toFixed(2)} left for tailoring or a backup size.`);
    return notes;
  }

  return { AESTHETICS, OCCASIONS, SLOT_LABELS, DEFAULTS, buildOutfits, alternatives, minimumBudget, evaluate, scoreItem, delivery, templatesFor };
});
