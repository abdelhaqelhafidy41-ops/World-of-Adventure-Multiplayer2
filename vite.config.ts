import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), '');
  const publicAppUrl =
    process.env.VITE_PUBLIC_APP_URL ||
    process.env.PUBLIC_APP_URL ||
    env.VITE_PUBLIC_APP_URL ||
    env.PUBLIC_APP_URL ||
    '';

  return {
    base: process.env.VITE_BASE_PATH || './',
    plugins: [react(), tailwindcss()],
    define: {
      'import.meta.env.PUBLIC_APP_URL': JSON.stringify(publicAppUrl),
    },
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      emptyOutDir: true,
      sourcemap: false,
      chunkSizeWarningLimit: 900,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/three')) {
              return 'three-vendor';
            }
            if (
              id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/lucide-react') ||
              id.includes('node_modules/motion')
            ) {
              return 'ui-vendor';
            }
          },
        },
      },
    },
    preview: {
      port: 4173,
      strictPort: false,
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
