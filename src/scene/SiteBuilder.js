import * as THREE from 'three'
import {
  PLACEMENTS,
  FENCE_RUNS,
  FENCE_MODEL,
  FENCE_MODEL_LENGTH,
  LAMP_RUNS,
  LAMP_MODEL,
  LAMP_SPACING,
} from '../config/layout.js'

// 按 layout.js 的布置表把各 .glb 摆进场地，围挡和路灯沿走向自动铺
export class SiteBuilder {
  constructor(viewer, assets) {
    this.viewer = viewer
    this.assets = assets
    this.objects = []
    this.machines = [] // 带交互动画的机械
    this.lampKeys = new Set() // 四角灯位去重

    // 模型统一挂在 SiteRoot 下，方便整体取包围盒、也方便建碰撞世界
    this.root = new THREE.Group()
    this.root.name = 'SiteRoot'
    viewer.scene.add(this.root)
  }

  build() {
    for (const item of PLACEMENTS) this.place(item)

    // 路灯会落进东北角宿舍，先记下生活区范围，布灯时跳过
    this.lampExclude = this.objects
      .filter((obj) => obj.userData.source === 'labor_camp.glb')
      .map((obj) => new THREE.Box3().setFromObject(obj))

    for (const run of FENCE_RUNS) this.addFenceRun(run)
    for (const run of LAMP_RUNS) this.addLampRun(run)
    return this.objects
  }

  place({ file, label, position, rotationY = 0, rotationX = 0, rotationZ = 0,
          scale = null, castShadow = true, interactive = null }) {
    const obj = this.assets.clone(file)
    if (!obj) return null

    obj.name = label
    obj.position.set(position[0], position[1], position[2])
    // rotationX 侧倾、rotationZ 俯仰（搅拌车按地面坡度斜放）
    obj.rotation.set(rotationX, rotationY, rotationZ)
    // 土堆这类单位尺寸模型靠缩放定大小：x/z 底半径、y 堆高
    if (scale) obj.scale.set(scale[0], scale[1], scale[2])
    obj.userData.source = file
    obj.userData.label = label
    if (interactive) obj.userData.interactive = interactive

    applyShadowFlags(obj, castShadow)
    this.root.add(obj)
    this.objects.push(obj)
    if (interactive) this.machines.push(obj)
    return obj
  }

  // 铺一段围挡：单段 18m，按走向等分，沿 X 拉伸保证首尾严丝合缝
  addFenceRun({ from, to }) {
    // Vector2 当 XZ 平面用：x 是世界 X、y 是世界 Z
    const a = new THREE.Vector2(from[0], from[1])
    const b = new THREE.Vector2(to[0], to[1])
    const delta = b.clone().sub(a)
    const length = delta.length()
    if (length < 0.5) return

    const dir = delta.clone().normalize()
    const count = Math.max(1, Math.round(length / FENCE_MODEL_LENGTH))
    const spacing = length / count

    // 令局部 +X 对齐走向，反解出绕 Y 角
    const rotY = Math.atan2(-dir.y, dir.x)
    const scaleX = spacing / FENCE_MODEL_LENGTH

    for (let i = 0; i < count; i += 1) {
      const obj = this.assets.clone(FENCE_MODEL)
      if (!obj) return

      obj.name = '工地围挡'
      obj.position.set(a.x + dir.x * i * spacing, 0, a.y + dir.y * i * spacing)
      obj.rotation.y = rotY
      obj.scale.x = scaleX
      obj.userData.source = FENCE_MODEL
      obj.userData.label = '工地围挡'

      applyShadowFlags(obj, true)
      this.root.add(obj)
      this.objects.push(obj)
    }
  }

  // 沿走向等距布灯，灯臂朝场内
  addLampRun({ from, to }) {
    const a = new THREE.Vector2(from[0], from[1])
    const b = new THREE.Vector2(to[0], to[1])
    const delta = b.clone().sub(a)
    const length = delta.length()
    if (length < 1) return

    const dir = delta.clone().normalize()
    const count = Math.max(1, Math.round(length / LAMP_SPACING))
    const spacing = length / count

    // 走向的法线，取指向场地中心的一侧
    let nx = -dir.y
    let nz = dir.x
    const mid = a.clone().addScaledVector(dir, length / 2)
    if (nx * -mid.x + nz * -mid.y < 0) {
      nx = -nx
      nz = -nz
    }
    // 局部 +X 对齐法线，反解绕 Y 角
    const rotY = Math.atan2(-nz, nx)

    for (let i = 0; i <= count; i += 1) {
      const px = a.x + dir.x * i * spacing
      const pz = a.y + dir.y * i * spacing

      // 四角相邻两段共用点，只摆一盏
      const key = `${Math.round(px * 100)}|${Math.round(pz * 100)}`
      if (this.lampKeys.has(key)) continue
      this.lampKeys.add(key)

      // 落进生活区的灯位跳过，免得灯杆插进宿舍
      if (this.lampExclude?.some((b) => (
        px > b.min.x && px < b.max.x && pz > b.min.z && pz < b.max.z
      ))) continue

      const obj = this.assets.clone(LAMP_MODEL)
      if (!obj) return

      obj.name = '路灯'
      obj.position.set(px, 0, pz)
      obj.rotation.y = rotY
      obj.userData.source = LAMP_MODEL
      obj.userData.label = '路灯'

      applyShadowFlags(obj, true)
      this.root.add(obj)
      this.objects.push(obj)
    }
  }

  // 整个工地的包围盒，用来自动取景
  getBounds() {
    this.root.updateMatrixWorld(true)
    const box = new THREE.Box3()
    for (const obj of this.objects) box.expandByObject(obj)
    return box
  }
}

function applyShadowFlags(obj, castShadow) {
  obj.traverse((child) => {
    if (!child.isMesh) return
    child.castShadow = castShadow
    child.receiveShadow = true
  })
}
