import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backendPort = process.env.PORT || 5001;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
