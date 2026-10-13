// Run with: node --test outfit-builder/
const test = require("node:test");
const assert = require("node:assert/strict");
const catalogue = require("./catalogue.js");
const E = require("./engine.js");

const briefs = [];
for (const occasion of Object.keys(E.OCCASIONS))
  for (const gender of ["w", "m", "all"])
    for (const season of ["warm", "cold"]) briefs.push({ occasion, gender, season, aesthetic: "cla", budget: 250 });

test("every outfit is complete and within budget, delivery included", () => {
  for (const brief of briefs) {
    const outfits = E.buildOutfits(brief, catalogue);
    assert.ok(outfits.length >= 1, `no outfit for ${JSON.stringify(brief)}`);
    for (const o of outfits) {
      assert.ok(o.total <= brief.budget, `over budget: ${o.total}`);
      const cats = o.items.map((p) => p.category);
      assert.ok(cats.includes("shoes"));
      assert.ok(cats.includes("dress") || (cats.includes("top") && cats.includes("bottom")));
      if (brief.season === "cold") assert.ok(cats.includes("outer"), "cold looks need a layer");
      const sum = o.items.reduce((a, p) => a + p.price, 0) + o.deliveryTotal;
      assert.equal(Math.round(sum * 100), Math.round(o.total * 100));
    }
  }
});

test("menswear briefs only use menswear or unisex pieces", () => {
  for (const o of E.buildOutfits({ occasion: "wed", gender: "m", budget: 400 }, catalogue))
    for (const p of o.items) assert.ok(p.gender === "m" || p.gender === "u", p.name);
});

test("outfits returned together are distinct", () => {
  const [a, b] = E.buildOutfits({ occasion: "dat", aesthetic: "edg", gender: "w", budget: 200 }, catalogue);
  const ids = new Set(a.items.map((p) => p.id));
  assert.ok(b.items.filter((p) => ids.has(p.id)).length <= 1);
});

test("delivery is waived once a retailer's basket reaches its threshold", () => {
  const ct = catalogue.products.filter((p) => p.retailer === "CT");
  const [small] = E.delivery([ct.find((p) => p.price < 25)], catalogue.retailers);
  assert.equal(small.delivery, catalogue.retailers.CT.delivery);
  const [big] = E.delivery(ct.slice(0, 3), catalogue.retailers);
  assert.equal(big.delivery, 0);
});

test("a budget below the cheapest look returns nothing and reports the minimum", () => {
  const brief = { occasion: "wed", gender: "m", budget: 60 };
  assert.equal(E.buildOutfits(brief, catalogue).length, 0);
  const min = E.minimumBudget(brief, catalogue);
  assert.ok(min > 60 && E.buildOutfits({ ...brief, budget: Math.ceil(min) + 40 }, catalogue).length > 0);
});

test("swap alternatives keep the outfit within budget", () => {
  const brief = { occasion: "wrk", gender: "w", budget: 150 };
  const [o] = E.buildOutfits(brief, catalogue);
  const alts = E.alternatives(o, 0, brief, catalogue);
  assert.ok(alts.length > 0);
  for (const a of alts) {
    assert.equal(a.product.category, o.items[0].category);
    assert.ok(a.outfit.total <= 150);
  }
});
