import tsdownConfig from "./tsdown.config.ts";

import { defineConfig } from "vite-plus";

export default defineConfig({
  staged: {
    "*": "vp check --fix",
  },
  pack: tsdownConfig,
  lint: { options: { typeAware: true, typeCheck: true } },
});
