import { defineConfig } from "tsdown";

export default defineConfig({
  exports: true,
  noExternal: ["dayjs", "dayjs/plugin/minMax", "dayjs/plugin/utc"],
  minify: true,
  publint: true,
  dts: true,
});
