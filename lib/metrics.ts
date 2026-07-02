import { ISO2, METRIC_DATA } from "@/lib/metric-data";

export { METRIC_DATA, ISO2 };

export type MetricKey =
  | "area" | "gdp" | "pop" | "births" | "deaths" | "homicides" | "co2" | "milspend" | "military"
  | "internet" | "forest" | "tourists" | "exports" | "reserves" | "health" | "sci" | "patents"
  | "airpax" | "mobile" | "migrants" | "cereal" | "elec" | "agri" | "ghg";

export interface MetricDef {
  label: string;
  fmt: (v: number) => string;
  /** provenance shown in the UI; indicator codes are World Bank API ids */
  source: string;
}

/** Compact SI-style number formatting: 27292170793214 -> "27.29T". */
export function fmtSI(v: number | null): string {
  if (v == null) return "n/a";
  const a = Math.abs(v);
  if (a >= 1e12) return (v / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return (v / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (v / 1e3).toFixed(1) + "k";
  return Math.round(v).toString();
}

const WB = "World Bank Open Data";

/**
 * Every metric is an additive total, so countries can be summed to fill a budget.
 * Rates in the source data (births, deaths, homicides per capita) were converted
 * to totals via population at build time; see scripts/build-data.mjs.
 */
export const METRICS: Record<MetricKey, MetricDef> = {
  area:      { label: "Area",            fmt: (v) => fmtSI(v) + " km²",             source: "Natural Earth 1:50m · computed area" },
  gdp:       { label: "GDP",             fmt: (v) => "$" + fmtSI(v),                source: `${WB} · NY.GDP.MKTP.CD` },
  pop:       { label: "Population",      fmt: (v) => fmtSI(v) + " people",          source: `${WB} · SP.POP.TOTL` },
  births:    { label: "Births / yr",     fmt: (v) => fmtSI(v) + " births/yr",       source: `${WB} · SP.DYN.CBRT.IN × population` },
  deaths:    { label: "Deaths / yr",     fmt: (v) => fmtSI(v) + " deaths/yr",       source: `${WB} · SP.DYN.CDRT.IN × population` },
  homicides: { label: "Homicides / yr",  fmt: (v) => fmtSI(v) + " homicides/yr",    source: `UNODC via ${WB} · VC.IHR.PSRC.P5 × population` },
  co2:       { label: "CO₂ / yr",        fmt: (v) => fmtSI(v) + " t CO₂/yr",        source: `${WB} · EN.GHG.CO2.MT.CE.AR5` },
  ghg:       { label: "Greenhouse gas",  fmt: (v) => fmtSI(v) + " t CO₂e/yr",       source: `${WB} · EN.GHG.ALL.MT.CE.AR5` },
  milspend:  { label: "Military $",      fmt: (v) => "$" + fmtSI(v),                source: `SIPRI via ${WB} · MS.MIL.XPND.CD` },
  military:  { label: "Armed forces",    fmt: (v) => fmtSI(v) + " troops",          source: `IISS via ${WB} · MS.MIL.TOTL.P1` },
  internet:  { label: "Internet users",  fmt: (v) => fmtSI(v) + " users",           source: `ITU via ${WB} · IT.NET.USER.ZS × population` },
  mobile:    { label: "Mobile subs",     fmt: (v) => fmtSI(v) + " subscriptions",   source: `ITU via ${WB} · IT.CEL.SETS` },
  forest:    { label: "Forest",          fmt: (v) => fmtSI(v) + " km² forest",      source: `FAO via ${WB} · AG.LND.FRST.K2` },
  agri:      { label: "Farmland",        fmt: (v) => fmtSI(v) + " km² farmland",    source: `FAO via ${WB} · AG.LND.AGRI.K2` },
  cereal:    { label: "Cereal output",   fmt: (v) => fmtSI(v) + " t/yr",            source: `FAO via ${WB} · AG.PRD.CREL.MT` },
  tourists:  { label: "Tourism / yr",    fmt: (v) => fmtSI(v) + " visitors/yr",     source: `UNWTO via ${WB} · ST.INT.ARVL` },
  exports:   { label: "Exports",         fmt: (v) => "$" + fmtSI(v),                source: `${WB} · NE.EXP.GNFS.CD` },
  reserves:  { label: "Reserves (incl. gold)", fmt: (v) => "$" + fmtSI(v),          source: `IMF via ${WB} · FI.RES.TOTL.CD` },
  health:    { label: "Health spending", fmt: (v) => "$" + fmtSI(v),                source: `WHO via ${WB} · SH.XPD.CHEX.PC.CD × population` },
  sci:       { label: "Science papers",  fmt: (v) => fmtSI(v) + " papers/yr",       source: `NSF via ${WB} · IP.JRN.ARTC.SC` },
  patents:   { label: "Patents",         fmt: (v) => fmtSI(v) + " applications/yr", source: `WIPO via ${WB} · IP.PAT.RESD` },
  airpax:    { label: "Air passengers",  fmt: (v) => fmtSI(v) + " passengers/yr",   source: `ICAO via ${WB} · IS.AIR.PSGR` },
  migrants:  { label: "Immigrants",      fmt: (v) => fmtSI(v) + " people",          source: `UN DESA via ${WB} · SM.POP.TOTL` },
  elec:      { label: "Electricity use", fmt: (v) => fmtSI(v) + " kWh/yr",          source: `IEA via ${WB} · EG.USE.ELEC.KH.PC × population` },
};

/** Dropdown grouping, in display order. */
export const METRIC_GROUPS: ReadonlyArray<readonly [string, readonly MetricKey[]]> = [
  ["Geography", ["area", "forest", "agri"]],
  ["Economy", ["gdp", "exports", "reserves", "health"]],
  ["People", ["pop", "births", "deaths", "migrants", "homicides"]],
  ["Military", ["milspend", "military"]],
  ["Environment & Food", ["co2", "ghg", "cereal"]],
  ["Technology & Science", ["internet", "mobile", "elec", "sci", "patents"]],
  ["Travel", ["tourists", "airpax"]],
];

/** Flag emoji from ISO numeric code, used only as a fallback when no flat flag exists. */
export function flagFromNum(num: string): string {
  const cc = ISO2[num];
  if (!cc) return "🏳️";
  return String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

/** Flat flag image URL (flagcdn.com) from ISO numeric code, or null when unmapped. */
export function flagUrl(num: string, size: "svg" | "w20" | "w40" | "w80" | "w160" | "w320" = "w40"): string | null {
  const cc = ISO2[num];
  if (!cc) return null;
  const lc = cc.toLowerCase();
  return size === "svg" ? `https://flagcdn.com/${lc}.svg` : `https://flagcdn.com/${size}/${lc}.png`;
}
