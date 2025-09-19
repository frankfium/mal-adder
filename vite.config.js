import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/login': 'http://localhost:3000',
      '/callback': 'http://localhost:3000',
      '/me': 'http://localhost:3000',
      '/logout': 'http://localhost:3000',
      '/preview-shows': 'http://localhost:3000',
      '/add-shows': 'http://localhost:3000',
      '/my-list': 'http://localhost:3000',
      '/rmtj.jpg': 'http://localhost:3000'
    }
  }
})
