import { defineConfig } from "astro/config";

export default defineConfig({
  site: "https://chadwickkeith.com",
  trailingSlash: "ignore",
  build: {
    format: "file",
  },
});
