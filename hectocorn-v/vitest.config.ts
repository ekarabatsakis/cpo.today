import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    include: ["tests/engine/**/*.test.ts", "tests/unit/**/*.test.ts"],
    environment: "node",
    coverage: { reporter: ["text"] },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
