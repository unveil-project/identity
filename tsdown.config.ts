import { defineConfig } from "tsdown";

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/ai/index.ts',
  ],
  exports: true,
  noExternal: ["dayjs", "dayjs/plugin/minMax", "dayjs/plugin/utc"],
  minify: true,
  publint: true,
  dts: true,
});
