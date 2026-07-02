import path from "node:path";
import { Config } from "@remotion/cli/config";

// "@" resolves to the repo root so the demo reuses the app's real fill engine,
// metric data and world topology instead of mocking them.
Config.overrideWebpackConfig((config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    alias: {
      ...(config.resolve?.alias ?? {}),
      // process.cwd() is demo/ when the CLI runs; __dirname is unreliable here
      // because the config is transpiled and evaluated inside the CLI package
      "@": path.join(process.cwd(), ".."),
    },
  },
}));

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
