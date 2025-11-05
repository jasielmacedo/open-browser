import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import path from 'path';

export default defineConfig({
  root: './src/renderer',
  base: './',
  plugins: [
    react(),
    electron([
      {
        entry: '../../src/main/index.ts',
        vite: {
          build: {
            outDir: '../../dist/main',
            rollupOptions: {
              external: ['better-sqlite3', 'electron'],
              output: {
                entryFileNames: 'index.js',
                format: 'cjs'
              }
            }
          }
        }
      },
      {
        entry: '../../src/main/preload.ts',
        vite: {
          build: {
            outDir: '../../dist/main',
            rollupOptions: {
              output: {
                format: 'cjs'
              }
            }
          }
        }
      }
    ])
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@renderer': path.resolve(__dirname, './src/renderer'),
      '@shared': path.resolve(__dirname, './src/shared')
    }
  },
  build: {
    outDir: path.resolve(__dirname, 'dist/renderer'),
    emptyOutDir: true
  },
  server: {
    port: 5173
  }
});
