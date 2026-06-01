# PDF visual baseline

`pef-visual-baseline.png` is generated from the fixed 14-day visual test mock dataset in `src/pdf-visual.test.ts` using the real HUS/HYKS template.

Refresh after an intentional PDF layout change:

```sh
PEF_UPDATE_VISUAL_BASELINE=1 npm test -- src/pdf-visual.test.ts
```

Then inspect the changed PNG before committing it.
