import { defineConfig } from "vite";

export default defineConfig({
  // относительные пути — чтобы сборка открывалась и с file:// , и с любого подпути
  base: "./",
  server: { host: true, port: 5173 },
  build: { target: "esnext", sourcemap: true },
});
