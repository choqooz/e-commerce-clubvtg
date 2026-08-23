/* eslint-disable @typescript-eslint/no-require-imports */
const { fileURLToPath, URL } = require("node:url");
const { defineConfig } = require("vitest/config");

module.exports = defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
  },
});
