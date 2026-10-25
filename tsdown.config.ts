import { defineConfig } from "tsdown";

const entry = {
	index: "src/index.ts",
	report: "src/report/index.ts",
	"providers/github": "src/providers/github.ts",
};

export default defineConfig({
	entry,
	exports: true,
	publint: true,
	dts: { entry: Object.values(entry) },
});
