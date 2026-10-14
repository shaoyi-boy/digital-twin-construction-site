import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

/**
 * 模型资源管理器
 *
 * 每个 .glb 只从网络加载一次，之后都从缓存里 clone。
 * 围挡这种要铺十几段的模型，靠的就是 clone 复用同一份几何体和材质，
 * 显存占用不会随段数增长。
 */
export class AssetLoader {
  constructor(onProgress) {
    this.cache = new Map()
    this.total = 0
    this.loaded = 0
    this.onProgress = onProgress

    // 进度直接用 LoadingManager 自己的计数，不要手动累加：
    // GLTFLoader 内部会为同一个文件多次 itemStart/itemEnd，手动计数会翻倍
    const manager = new THREE.LoadingManager()
    manager.onProgress = (url, itemsLoaded, itemsTotal) => {
      this.loaded = itemsLoaded
      this.total = itemsTotal
      this.onProgress?.(itemsLoaded, itemsTotal)
    }
    this.loader = new GLTFLoader(manager)
  }

  /**
   * 批量加载
   * @param {string[]} files 形如 ['tower_crane.glb', ...]
   * @returns {Promise<void>}
   */
  loadAll(files) {
    this.total = files.length
    this.loaded = 0
    return Promise.all(files.map((f) => this.load(f))).then(() => undefined)
  }

  load(file) {
    if (this.cache.has(file)) {
      return Promise.resolve(this.cache.get(file))
    }

    // Vite 下 BASE_URL 是 '/'，public 目录映射到站点根，所以走 '/models/...'；
    // 而用 Live Server 这类静态服务器直接打开时没有 import.meta.env，
    // 站点根就是工程根目录，得走相对路径 './public/models/...'。
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

  /**
   * 取一份模型副本。
   * Object3D.clone() 会共享几何体和材质，只复制节点变换，正是我们要的。
   * @returns {THREE.Object3D|null}
   */
  clone(file) {
    const source = this.cache.get(file)
    if (!source) {
      console.warn(`[AssetLoader] 模型未加载：${file}`)
      return null
    }
    return source.clone(true)
  }
}
