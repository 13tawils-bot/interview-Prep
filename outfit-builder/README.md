# Full Look: build me an entire outfit for £X

An MVP of idea 1 from the brief. You set a budget, occasion, aesthetic, range,
weather and colour preference. The app assembles **complete outfits across
several retailers** that fit the budget with delivery included, explains why each
one works, and lets you swap any piece for alternatives that keep you in budget.

It runs entirely in the browser with no build step and no server.

```bash
open outfit-builder/index.html           # or serve the folder with any static server
node --test outfit-builder/engine.test.js
```

## How it works

| File | Role |
| --- | --- |
| `catalogue.js` | Product feed + retailer delivery terms. **Demo data**: fictional shops and illustrative prices. |
| `engine.js` | Pure outfit-assembly logic, shared by the page and the tests. |
| `index.html` | The interface. |
| `engine.test.js` | Budget, completeness, gender range, diversity, delivery and swap rules. |

1. **Templates per occasion.** Each occasion has a few outfit shapes (e.g. wedding
   guest: dress + shoes + bag + accessory, or top + bottoms + shoes + bag; menswear
   adds a blazer). Cold weather adds an outer layer.
2. **Item scoring.** Each product is scored on aesthetic (exact or adjacent style),
   occasion fit, colour preference and seasonal warmth.
3. **Search.** A beam search fills each slot from the best candidates (plus a few
   cheap ones so tight budgets still work), pruning anything that can't finish
   under budget.
4. **Outfit scoring.** Item fit, colour harmony (one statement colour or print,
   neutrals anchor), budget use, and a penalty for paying delivery.
   Delivery is charged per retailer unless that basket reaches the free threshold,
   so a multi-shop outfit has to earn its postage.
5. **Diversity.** The top looks share at most one piece where possible.
6. **Explanations** are generated from the same data, and anything outside the
   occasion's dress code is flagged.

## Going live: plugging in a real product feed

Replace `catalogue.js` with data in the same shape. Each product needs:

```js
{ id, retailer, name, category /* top|bottom|dress|outer|shoes|bag|acc */,
  gender /* w|m|u */, price, colour, family /* neutral|earth|pastel|bold|print */,
  aesthetics: ["min", ...], occasions: ["wed", ...], warmth /* 0-3, outerwear */,
  swatch /* CSS colour */, url, image }
```

and each retailer needs `{ name, delivery, freeOver }`.

Most feeds give you name, price, colour, category, image and a link, but not
aesthetic, occasion or colour family. Those need to be tagged once per product,
either by rules (keywords like "satin", "cargo", "blazer") or by an LLM pass
over the title, description and image. That tagging step is the core of the product.

Feed sources worth looking at:
- **Affiliate networks** (Awin, Rakuten Advertising, CJ, Impact): official product
  feeds from many UK retailers in one format, with commission on each sale.
  This is the most direct route to "across multiple retailers".
- **Retailer APIs on RapidAPI** (e.g. ASOS, Zalando, H&M wrappers): quick to
  prototype with, but unofficial and not suitable for production.
- **Shopping aggregators** (Google Shopping via SerpAPI, Lyst/ShopStyle Collective
  for affiliates): broad coverage, priced per request.

## Extending to the other ideas

- **Complete my wardrobe**: add owned items to the catalogue with `price: 0`,
  a `retailer` of "Your wardrobe" and a constraint that each outfit uses at least
  one. The engine then recommends the fewest purchases that unlock the most looks.
- **Body-type fit**: add size/fit attributes to products and a fit term to
  `scoreItem`, with a matching line in `explain`.
- **Recreate an aesthetic for less**: tag an uploaded photo with an image model
  into the same `aesthetics`/`colour`/`category` vocabulary, then reuse the
  search with those as the target.
