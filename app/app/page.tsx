import type { Metadata } from "next";
import MapExplorer from "@/components/map-explorer";

export const metadata: Metadata = {
  title: "Country Mogger · Map",
};

export default function AppPage() {
  return <MapExplorer />;
}
