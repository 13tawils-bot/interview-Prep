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
- **Common foods**: about 100 unpackaged UK foods (`commonfoods.js`, typical
  values, carbs excluding fibre) with real-world portions: 1 medium egg, 1 slice,
  1 banana. They join your library the first time you log them.
- **Saved meals and copy yesterday**: save any meal section as a named meal and log
  it in one tap; empty sections offer yesterday's version.
- **Plan the rest of today**: one to three foods you already eat, portioned to hit
  your remaining protein within your remaining calories.
- **Weekly check-in**: days logged, trend change, average calories, protein,
  steps and sleep, plus a proposed calorie change (at most 200 kcal a week) that
  you accept or keep. It won't cut calories when the log suggests over-eating or
  missing entries.
- **Apple Health via Shortcuts**: a *Health to Fuel Log* shortcut copies steps,
  active energy, last night's sleep and weight for the app to import. A *Fuel Log
  to Health* shortcut logs eaten calories and macros, sending only what's new.
  Step-by-step setup is on the Plan tab. Steps and sleep feed insights such as
  falling step counts and eating more after short nights.

## Running it

**As a Claude artifact** (how it's published): your log is saved to your
Claude account and syncs across devices. Label reading and coaching use Claude.
Claude artifacts can't call outside websites, so Open Food Facts lookups don't
run there: new barcodes are filled from a label photo instead, then remembered.

**As a phone app** (installable PWA on GitHub Pages): live camera barcode
scanning, Open Food Facts lookups from the barcode alone, works offline, and
installs to the home screen. The log is saved on the phone (use Plan → Backup
to move it); Claude features are hidden.

- Every push to `gym-tracker/` runs `.github/workflows/pages.yml`, which tests,
  builds with `site/build.mjs` and publishes to the `gh-pages` branch.
- One-time setup: repo **Settings → Pages → Build and deployment → Deploy from a
  branch → `gh-pages` / `(root)`**. The app is then at
  `https://13tawils-bot.github.io/interview-Prep/gym/`.
- Install on iPhone: open that link in **Safari** → Share → **Add to Home Screen**.
  On Android: open it in **Chrome** → menu → **Install app**.
- Build locally: `node site/build.mjs`, then serve `_site/` (camera access needs
  `https://` or `localhost`).

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
