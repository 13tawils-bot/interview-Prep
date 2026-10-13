# Fuel Log

A personal tracker for weight, food and what to eat next, tuned to either
losing fat or building muscle.

- **Weight**: daily weigh-ins with a smoothed trend line, weekly rate against
  your target pace, and history.
- **Food logging**: scan a barcode from a photo, look the product up on
  Open Food Facts, or have Claude read a photo of the nutrition label. Every
  product goes into your own food library, so the second scan is instant.
- **Targets**: calories from the Mifflin-St Jeor formula at first. After about
  two weeks of logging food and weight, maintenance is *measured* from your
  intake and weight trend, so targets fit your real metabolism.
  Protein is 2.0 g/kg when cutting, 1.8 when building, 1.6 when maintaining.
- **Eat next**: ranks foods you already eat for what's left today.
  Protein density, calories remaining, fibre and volume when cutting, energy when
  building, how often you eat it and at which meal.
- **What your log says**: protein hit rate, calorie average, high-calorie
  low-protein foods with a leaner swap you already eat, and whether your trend
  matches your goal (with a concrete calorie adjustment if not).
- **Ask Claude**: sends a two-week summary for specific, food-by-food advice.

## Running it

**As a Claude artifact** (how it's published): your log is saved to your
Claude account and syncs across devices. Label reading and coaching use Claude.
Claude artifacts can't call outside websites, so Open Food Facts lookups don't
run there: new barcodes are filled from a label photo instead, then remembered.

**Self-hosted** (e.g. GitHub Pages, Netlify): open `index.html` from any static
host. Open Food Facts lookups work; the log is saved in that browser (use
Plan → Backup to move it); Claude features are hidden.

```bash
node --test gym-tracker/nutrition.test.js
```

| File | Role |
| --- | --- |
| `nutrition.js` | Targets, trend, measured maintenance, suggestions, insights. Pure functions. |
| `index.html` | The app: Today, Weight, Foods and Plan tabs, the add-food sheet, storage. |
| `nutrition.test.js` | Unit tests for the maths and recommendation logic. |

Barcode decoding uses the browser's `BarcodeDetector` where available and
falls back to ZXing. It reads EAN-13, EAN-8 and UPC codes.

Not medical advice: the floors (1,200 kcal women, 1,500 kcal men) and pace
limits are conservative defaults.
