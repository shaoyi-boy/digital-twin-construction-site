import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

// 模型资源管理：每个 glb 只下一次，之后 clone 复用几何体和材质
export class AssetLoader {
  constructor(onProgress) {
    this.cache = new Map()
    this.total = 0
    this.loaded = 0
    this.onProgress = onProgress

    // 进度用 LoadingManager 的计数；手动累加会因同一个文件多次 itemStart/End 翻倍
    const manager = new THREE.LoadingManager()
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
      this.loaded = itemsLoaded
      this.total = itemsTotal
      this.onProgress?.(itemsLoaded, itemsTotal)
    }
    this.loader = new GLTFLoader(manager)
  }

  // files 形如 ['tower_crane.glb', ...]
  loadAll(files) {
    this.total = files.length
    this.loaded = 0
    return Promise.all(files.map((f) => this.load(f))).then(() => undefined)
  }

  load(file) {
    if (this.cache.has(file)) {
      return Promise.resolve(this.cache.get(file))
    }

    // Vite 下 BASE_URL 是 '/'，其他静态服务器走 './public/'
    const base = import.meta.env?.BASE_URL ?? './public/'
    const url = `${base}models/${file}`
    return new Promise((resolve, reject) => {
      this.loader.load(
        url,
        (gltf) => {
          gltf.scene.name = file
          this.cache.set(file, gltf.scene)
          resolve(gltf.scene)
        },
        undefined,
        (err) => reject(new Error(`加载 ${file} 失败：${err?.message || err}`))
      )
    })
  }

  // clone 只复制节点变换，几何体和材质仍是共享的
  clone(file) {
    const source = this.cache.get(file)
    if (!source) {
      console.warn(`[AssetLoader] 模型未加载：${file}`)
      return null
    }
    return source.clone(true)
  }
}
