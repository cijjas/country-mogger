import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OgCard } from "./og-card";

export const alt = "Country Mogger: how many countries fit inside yours?";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const serif = await readFile(join(process.cwd(), "assets/InstrumentSerif-Regular.ttf"));
  const logo = await readFile(join(process.cwd(), "public/logo.svg"));
  const logoSrc = `data:image/svg+xml;base64,${logo.toString("base64")}`;
  return new ImageResponse(<OgCard logoSrc={logoSrc} />, {
    ...size,
    fonts: [{ name: "InstrumentSerif", data: serif, style: "normal", weight: 400 }],
  });
}
