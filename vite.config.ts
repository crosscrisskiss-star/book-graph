import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs/promises'
import path from 'node:path'

const syncDir = path.resolve(process.cwd(), '.sync-data')

function syncFilePath(code: string) {
  const safeCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16)
  return path.join(syncDir, `${safeCode}.json`)
}

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'book-graph-local-sync',
      configureServer(server) {
        server.middlewares.use('/api/sync', async (req, res) => {
          const url = new URL(req.url ?? '', 'http://localhost')
          const code = url.searchParams.get('code')?.trim()

          if (!code) {
            res.statusCode = 400
            res.end('missing code')
            return
          }

          const file = syncFilePath(code)

          if (req.method === 'GET') {
            try {
              const data = await fs.readFile(file, 'utf-8')
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(data)
            } catch {
              res.statusCode = 404
              res.end('not found')
            }
            return
          }

          if (req.method === 'POST') {
            let body = ''
            req.setEncoding('utf-8')
            req.on('data', (chunk) => {
              body += chunk
            })
            req.on('end', async () => {
              try {
                const parsed = JSON.parse(body)
                await fs.mkdir(syncDir, { recursive: true })
                await fs.writeFile(file, JSON.stringify(parsed.data ?? parsed, null, 2), 'utf-8')
                res.statusCode = 204
                res.end()
              } catch (error) {
                console.error('[sync] save failed', error)
                res.statusCode = 500
                res.end('save failed')
              }
            })
            return
          }

          res.statusCode = 405
          res.end('method not allowed')
        })
      },
    },
  ],
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
      '/api/ol-cover': {
        target: 'https://covers.openlibrary.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/ol-cover/, ''),
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
      '/api/booklog': {
        target: 'https://api.booklog.jp',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/booklog/, ''),
      },
    },
  },
})
