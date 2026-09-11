import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import svgLoader from 'vite-svg-loader'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'

const scholarVersion = readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim()

export default defineConfig({
  plugins: [vue(), svgLoader()],
  define: {
    __SCHOLAR_VERSION__: JSON.stringify(scholarVersion),
  },
  build: {
    license: {
      fileName: 'third-party-licenses.md'
    },
    rolldownOptions: {
      output: {
        postBanner: '/* Third-party licenses: /third-party-licenses.md */',
        manualChunks: (id) => {
          if (id.includes('/node_modules/@arco-design/')) {
            return 'arco-vendor'
          }
          if (
            id.includes('/node_modules/vue/') ||
            id.includes('/node_modules/vue-i18n/') ||
            id.includes('/node_modules/vue-router/') ||
            id.includes('/node_modules/@vue/')
          ) {
            return 'vue-vendor'
          }
          return undefined
        }
      }
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler'
      },
      sass: {
        api: 'modern-compiler'
      }
    }
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  server: {
    port: 5173,
    proxy: {
      '/docs': {
        target: 'http://localhost:5174',
        changeOrigin: true,
        ws: true
      },
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, '')
      }
    }
  }
})
