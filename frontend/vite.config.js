import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const rawBase = String(env.VITE_APP_BASE || '/').trim() || '/';
  const withLeadingSlash = rawBase.startsWith('/') ? rawBase : `/${rawBase}`;
  const appBase = withLeadingSlash.endsWith('/') ? withLeadingSlash : `${withLeadingSlash}/`;

  return {
    base: appBase,
    plugins: [react()],
    server: {
      host: true,
      port: 5173,
      proxy: {
        '/api': {
          target: 'http://localhost/nikhilwealthmanager',
          changeOrigin: true,
          secure: false
        }
      }
    }
  };
});
