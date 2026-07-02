# Contributing

Thanks for taking a look. The project is small on purpose; keeping it easy to read matters more than adding features.

## Setup

```bash
npm install
npm run dev
```

## Before opening a PR

Run the same checks CI runs:

```bash
npm run lint && npm run typecheck && npm test && npm run build
```

## Conventions

- The fill engine and polygon math (`lib/geo/`) are pure and unit-tested; UI code lives in `components/`.
- `lib/metric-data.ts` is generated. Never edit it by hand; change `scripts/build-data.mjs` and run `npm run build-data`.
- New metrics must be additive totals (summable across countries). Rates need a conversion to totals at build time.
- UI copy: plain sentences, no em dashes.
