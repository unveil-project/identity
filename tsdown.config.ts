import { defineConfig } from "vite-plus/pack";

export default defineConfig({
  exports: true,
  minify: true,
  publint: true,
  clean: true,
  dts: {
    tsgo: true,
  },
});
