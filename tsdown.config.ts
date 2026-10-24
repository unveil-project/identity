import { defineConfig } from "tsdown";

const entry = {
	index: "src/index.ts",
	"providers/codeberg": "src/providers/codeberg.ts",
	"providers/github": "src/providers/github.ts",
	"providers/gitlab": "src/providers/gitlab.ts",
	"providers/tangled": "src/providers/tangled.ts",
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
