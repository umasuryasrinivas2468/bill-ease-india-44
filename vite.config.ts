import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    proxy: {
      // Forward API requests to the local backend server running on port 3001
      '/payments': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/create-vpa': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/collect': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      },
      '/status': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
      }
    }
  },
  plugins: [
    react(),
    mode === 'development' &&
    componentTagger(),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
}));
