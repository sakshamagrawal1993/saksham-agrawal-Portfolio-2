import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Fix: Cast process to any because 'cwd' might be missing on the 'Process' interface in some TS environments
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    define: {
      // This ensures process.env.API_KEY in your code is replaced by the actual value during build
      'process.env.API_KEY': JSON.stringify(env.API_KEY)
    }
  }
})