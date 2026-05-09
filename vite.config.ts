import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/ndl': {
        target: 'https://ndlsearch.ndl.go.jp',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ndl/, '/api'),
      },
      '/api/calil': {
        target: 'https://api.calil.jp',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/calil/, ''),
      },
      '/api/openbd-cover': {
        target: 'https://cover.openbd.jp',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/openbd-cover/, ''),
      },
      '/api/ndl-thumbnail': {
        target: 'https://ndlsearch.ndl.go.jp',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ndl-thumbnail/, '/thumbnail'),
      },
      '/api/google-cover': {
        target: 'https://books.google.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/google-cover/, ''),
      },
      '/api/books-cover': {
        target: 'https://thumbnail-s.images.books.or.jp',
        changeOrigin: true,
        headers: {
          Referer: 'https://www.books.or.jp/',
          'User-Agent': 'Mozilla/5.0',
        },
        rewrite: (path) => path.replace(/^\/api\/books-cover/, ''),
      },
    },
  },
})
