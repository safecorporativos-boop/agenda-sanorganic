import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // Compila el código a una versión más compatible con navegadores/WebViews
    // más antiguos (por ejemplo Brave desactualizado en celulares gama media).
    target: "es2015",
  },
});
