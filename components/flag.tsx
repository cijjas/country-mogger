/* eslint-disable @next/next/no-img-element -- tiny external CDN flags; next/image adds
   remote-pattern config and per-image overhead for no gain at this size */
import { flagFromNum, flagUrl } from "@/lib/metrics";
import { cn } from "@/lib/utils";

/** Flat flag image keyed by ISO numeric code, with an emoji fallback for entities without ISO-2. */
export function Flag({ num, className }: { num: string; className?: string }) {
  const url = flagUrl(num, "w40");
  if (!url) {
    return <span className={cn("inline-block leading-none", className)} aria-hidden>{flagFromNum(num)}</span>;
  }
  return <img src={url} alt="" loading="lazy" className={cn("inline-block shrink-0 rounded-[1px] object-cover", className)} />;
}
