import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Fix: Cast process to any because 'cwd' might be missing on the 'Process' interface in some TS environments
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [react()],
    base: '/',
    define: {
      // This ensures process.env.GEMINI_API_KEY in your code is replaced by the actual value during build
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
    },
    build: {
      chunkSizeWarningLimit: 1600,
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-utils': ['framer-motion', 'lucide-react', 'clsx', 'tailwind-merge', 'date-fns'],
            'vendor-supabase': ['@supabase/supabase-js', '@tanstack/react-query'],
            'three-vendor': ['three', '@react-three/fiber', '@react-three/drei']
          }
        }
      }
    }
  }
})