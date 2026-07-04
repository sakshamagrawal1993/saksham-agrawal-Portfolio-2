import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from "path"

// https://vitejs.dev/config/
export default defineConfig(() => {
  return {
    plugins: [react()],
    base: '/',
    resolve: {
      dedupe: ['react', 'react-dom'],
      alias: {
        "@": path.resolve(__dirname, "./"),
      },
    },
    optimizeDeps: {
      entries: ['index.html'],
      include: ['react', 'react-dom', 'react-router-dom', 'zustand'],
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
