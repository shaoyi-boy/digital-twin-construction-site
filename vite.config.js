import { defineConfig } from 'vite'

export default defineConfig({
  // 开发服务器：局域网可访问，方便手机/平板同步看大屏效果
  server: {
    host: true,
    port: 5173,
    strictPort: false,
  },
  build: {
    outDir: 'dist',
    // three.js 本身就有 600KB+，调高阈值免得构建时刷警告
    chunkSizeWarningLimit: 1600,
    rollupOptions: {
      output: {
        // Vite 8 底层换成了 rolldown，manualChunks 只能是函数写法
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three'
          return null
        },
      },
    },
  },
})
