import { defineConfig } from "tsdown";

const entry = {
	index: "src/index.ts",
	explain: "src/explain/index.ts",
	"providers/github": "src/providers/github.ts",
};

export default defineConfig({
	entry,
	exports: true,
	deps: {
		alwaysBundle: ["dayjs", "dayjs/plugin/minMax", "dayjs/plugin/utc"],
	},
	publint: true,
	dts: { entry: Object.values(entry) },
});
