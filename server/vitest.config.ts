import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./src/test/setup.ts"],
    coverage: {
      include: ["src/**/*.ts"],
      // index.ts binds a port and installs signal handlers; app.ts and db.ts are
      // wiring with no branches worth asserting. Testing them needs a live
      // server and Mongo, which is integration surface, not unit.
      exclude: ["src/**/*.test.ts", "src/test/**", "src/index.ts", "src/app.ts", "src/config/db.ts"],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
