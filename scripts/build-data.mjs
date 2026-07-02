// Regenerates lib/metric-data.ts from the World Bank API and the world-countries
// ISO tables. Run with: npm run build-data
//
// Every metric is an additive total. Per-capita rates in the source data are
// converted to totals via population so countries can be summed.

import { writeFileSync } from "node:fs";

const YEARS = "2015:2023";
const OUT = new URL("../lib/metric-data.ts", import.meta.url);

const INDICATORS = {
  gdp: "NY.GDP.MKTP.CD",        // current US$
  pop: "SP.POP.TOTL",           // people
  cbr: "SP.DYN.CBRT.IN",        // crude birth rate per 1000 (converted to births/yr)
  cdr: "SP.DYN.CDRT.IN",        // crude death rate per 1000 (converted to deaths/yr)
  co2mt: "EN.GHG.CO2.MT.CE.AR5",// Mt CO2
  co2kt: "EN.ATM.CO2E.KT",      // kt CO2, legacy fallback
  homr: "VC.IHR.PSRC.P5",       // homicides per 100k (converted to homicides/yr)
  mil: "MS.MIL.XPND.CD",        // military expenditure, current US$
  army: "MS.MIL.TOTL.P1",       // armed forces personnel
  forest: "AG.LND.FRST.K2",     // forest area, km2
  net: "IT.NET.USER.ZS",        // internet users % (converted to users)
  tour: "ST.INT.ARVL",          // international tourist arrivals
  exports: "NE.EXP.GNFS.CD",    // exports of goods and services, current US$
  reserves: "FI.RES.TOTL.CD",   // total reserves incl. gold, current US$
  healthpc: "SH.XPD.CHEX.PC.CD",// health spend per capita US$ (converted to total)
  sci: "IP.JRN.ARTC.SC",        // scientific and technical journal articles
  patents: "IP.PAT.RESD",       // patent applications, residents
  airpax: "IS.AIR.PSGR",        // air passengers carried
  mobile: "IT.CEL.SETS",        // mobile subscriptions
  migrants: "SM.POP.TOTL",      // international migrant stock
  cereal: "AG.PRD.CREL.MT",     // cereal production, tonnes
  elecpc: "EG.USE.ELEC.KH.PC",  // electricity use kWh per capita (converted to total)
  agri: "AG.LND.AGRI.K2",       // agricultural land, km2
  ghg: "EN.GHG.ALL.MT.CE.AR5",  // total greenhouse gas, Mt CO2e
};

async function fetchIndicator(indicator) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000&date=${YEARS}`;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const json = await fetch(url).then((r) => r.json());
      const best = new Map(); // iso3 -> { year, value }: keep each country's latest value
      for (const row of json[1] || []) {
        if (row.value == null || !row.countryiso3code) continue;
        const year = +row.date;
        const cur = best.get(row.countryiso3code);
        if (!cur || year > cur.year) best.set(row.countryiso3code, { year, value: +row.value });
      }
      return best;
    } catch {
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  throw new Error(`failed to fetch ${indicator}`);
}

const val = (m, iso) => m.get(iso)?.value ?? null;

console.error("fetching world-countries ISO tables...");
const wc = await fetch("https://cdn.jsdelivr.net/npm/world-countries@5.1.0/countries.json").then((r) => r.json());
const iso3ToNum = new Map();
const numToIso2 = {};
for (const c of wc) {
  if (c.cca3 && c.ccn3) iso3ToNum.set(c.cca3, c.ccn3);
  if (c.ccn3 && c.cca2) numToIso2[c.ccn3] = c.cca2;
}

console.error("fetching World Bank indicators...");
const keys = Object.keys(INDICATORS);
const fetched = await Promise.all(keys.map((k) => fetchIndicator(INDICATORS[k])));
const M = Object.fromEntries(keys.map((k, i) => [k, fetched[i]]));

const allIso3 = new Set();
for (const k of keys) for (const iso of M[k].keys()) allIso3.add(iso);

const out = {};
let count = 0;
for (const iso of allIso3) {
  const num = iso3ToNum.get(iso);
  if (!num) continue;
  const p = val(M.pop, iso);
  const perCap = (rate, divisor) => (p != null && rate != null ? Math.round((p * rate) / divisor) : null);
  const co2 = M.co2mt.has(iso) ? M.co2mt.get(iso).value * 1e6
    : M.co2kt.has(iso) ? M.co2kt.get(iso).value * 1e3 : null;
  const round = (v) => (v != null ? Math.round(v) : null);
  out[num] = {
    gdp: val(M.gdp, iso),
    pop: p,
    births: perCap(val(M.cbr, iso), 1000),
    deaths: perCap(val(M.cdr, iso), 1000),
    co2,
    homicides: perCap(val(M.homr, iso), 1e5),
    internet: perCap(val(M.net, iso), 100),
    milspend: val(M.mil, iso),
    military: round(val(M.army, iso)),
    forest: val(M.forest, iso),
    tourists: round(val(M.tour, iso)),
    exports: val(M.exports, iso),
    reserves: val(M.reserves, iso),
    health: p != null && val(M.healthpc, iso) != null ? Math.round(p * val(M.healthpc, iso)) : null,
    sci: round(val(M.sci, iso)),
    patents: round(val(M.patents, iso)),
    airpax: round(val(M.airpax, iso)),
    mobile: round(val(M.mobile, iso)),
    migrants: round(val(M.migrants, iso)),
    cereal: round(val(M.cereal, iso)),
    elec: p != null && val(M.elecpc, iso) != null ? Math.round(p * val(M.elecpc, iso)) : null,
    agri: val(M.agri, iso),
    ghg: val(M.ghg, iso) != null ? Math.round(val(M.ghg, iso) * 1e6) : null,
  };
  count++;
}

const ts = `// AUTO-GENERATED by scripts/build-data.mjs. Do not edit by hand; run \`npm run build-data\` instead.
//
// METRIC_DATA: per-country metric snapshot (each country's latest value, 2015-2023),
// keyed by zero-padded ISO 3166-1 numeric code (= world-atlas feature id).
// Values are additive totals; see lib/metrics.ts for units and sources.
// ISO2: ISO numeric -> ISO 3166-1 alpha-2, used for flag images.

export const METRIC_DATA: Record<string, Record<string, number | null>> = ${JSON.stringify(out)};

export const ISO2: Record<string, string> = ${JSON.stringify(numToIso2)};
`;
writeFileSync(OUT, ts);
console.error(`wrote lib/metric-data.ts with ${count} countries`);
