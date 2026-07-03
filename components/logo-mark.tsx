/* eslint-disable @next/next/no-img-element -- static same-origin SVG; next/image adds
   config overhead for a decorative 28px mark */

/** The Country Mogger mark: a landmass split by the app's organic cut. */
export function LogoMark({ className }: { className?: string }) {
  return <img src="/logo.svg" alt="" className={className} />;
}
