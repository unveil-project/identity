import { defineConfig } from "tsdown";

export default defineConfig({
	exports: true,
	deps: {
		alwaysBundle: ["dayjs", "dayjs/plugin/minMax", "dayjs/plugin/utc"],
	},
	publint: true,
	dts: { entry: ["src/index.ts"] },
});
