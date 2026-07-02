# Country Mogger

**How many countries fit inside the one you picked?**

Pick a country, then click anywhere on the world map. Countries around that point light up, one by one, until together they add up to your country: by area, GDP, population, military spending, homicides, tourism, or any of 24 metrics. The last country is carved with an organic cut so the total lands exactly on 100%.

Built with Next.js, D3 and shadcn/ui. No backend, no accounts, no tracking: one static page and a pile of computational geometry.

## Features

- **24 additive metrics** across geography, economy, people, military, environment, technology and travel, each with its source attached in the UI
- **Nearest-first flood fill** that expands through shared land borders and jumps the narrowest stretch of water when a coastline runs out
- **Organic partial cut**: the final country is carved with an area-matched, seam-aware polygon cut instead of an arbitrary straight line
- **Flag donut** showing every contributor's share, linked to the map on hover
- **Surprise me**: a random heavyweight matchup on a random metric
- **Shareable URLs** (`?c=076&m=gdp` selects Brazil by GDP)
- Keyboard: `/` to search countries, `Esc` to reset

## How it works

1. The world is loaded once from a self-hosted [world-atlas](https://github.com/topojson/world-atlas) topology (Natural Earth 1:50m). Border adjacency, true areas, centroids, bounds and boundary samples are precomputed (`lib/geo/load-world.ts`).
2. When you drop the pin, a greedy flood fill starts at the country under it and consumes neighbours nearest-first until the selected country's metric value is reached (`lib/geo/fill-engine.ts`). Countries with no data are traversed but never counted. When land runs out the fill crosses to the nearest unreached country, measured edge to edge.
3. The country that would overshoot the budget is included partially: its main landmass is projected to screen space and an area-matched organic cut is binary-searched out of it with polygon boolean operations (`lib/geo/polygon.ts`).
4. Results are memoised per (metric, selection, seed country), so dragging the pin inside one country costs nothing.

The D3 renderer (`components/map/renderer.ts`) owns the SVG imperatively; React (`components/map-explorer.tsx`) owns selection and metric state and talks to the renderer through a narrow interface.

## Getting started

Requires Node 20.9+.

```bash
npm install
npm run dev
```

Open http://localhost:3000.

| Script | What it does |
| --- | --- |
| `npm run dev` | development server |
| `npm run build` | production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript, no emit |
| `npm test` | Vitest unit tests (fill engine, polygon math) |
| `npm run build-data` | regenerate `lib/metric-data.ts` from the World Bank API |

## Deploying

The app is a fully static Next.js site with zero configuration and no environment variables.

**Vercel:** import the repository at [vercel.com/new](https://vercel.com/new) and deploy; the defaults are correct. Or from the CLI:

```bash
npx vercel
```

Any other Next.js-capable host works the same way.

## Data, accuracy and attribution

- **Metrics:** [World Bank Open Data](https://data.worldbank.org/) (CC BY 4.0), one snapshot per country using its latest available value from 2015-2023. The exact indicator code for every metric is shown in the metric picker and in `lib/metrics.ts`. Per-capita rates (births, deaths, homicides, internet use, health spend, electricity) are converted to totals via population.
- **Geometry:** [Natural Earth](https://www.naturalearthdata.com/) (public domain) via [world-atlas](https://github.com/topojson/world-atlas).
- **Flags:** [flagcdn.com](https://flagcdn.com/).

Honest caveats: values are not from a single uniform year, partial-country cuts match the metric fraction by *visual area* (an approximation), and the across-water jump is a heuristic. This is a toy for building intuition, not a citation source.

## License

[MIT](LICENSE)
