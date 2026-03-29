import { defineConfig } from 'vite-plus/pack'

export default defineConfig({
  dts: {
    tsgo: true,
  },
  exports: true,
  // ...config options
})
