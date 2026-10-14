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

/**
 * 工地场景装配
 *
 * 按 layout.js 的布置表把各个 .glb 摆到场地里，
 * 并把围挡、路灯按走向自动铺满。
 */
export class SiteBuilder {
  constructor(viewer, assets) {
    this.viewer = viewer
    this.assets = assets
    this.objects = []
    this.machines = []          // 带交互动画的机械（挖掘机 / 翻斗车）
    this.lampKeys = new Set()   // 路灯去重：四条围墙边的灯在四角会重合

    // 场地模型统一挂在一个根节点下：既能整体取包围盒，
    // 也方便后面一次性丢给八叉树建碰撞世界
    this.root = new THREE.Group()
    this.root.name = 'SiteRoot'
    viewer.scene.add(this.root)
  }

  build() {
    for (const item of PLACEMENTS) this.place(item)

    // 生活区占了东北角，围墙边的一圈路灯会落进宿舍里：
    // 布灯前先把生活区的占地范围记下来，落在其中的灯位直接跳过
    this.lampExclude = this.objects
      .filter((obj) => obj.userData.source === 'labor_camp.glb')
      .map((obj) => new THREE.Box3().setFromObject(obj))

    for (const run of FENCE_RUNS) this.addFenceRun(run)
    for (const run of LAMP_RUNS) this.addLampRun(run)
    return this.objects
  }

  /** 摆放单个模型 */
  place({ file, label, position, rotationY = 0, rotationX = 0, rotationZ = 0,
          scale = null, castShadow = true, interactive = null }) {
    const obj = this.assets.clone(file)
    if (!obj) return null

    obj.name = label
    obj.position.set(position[0], position[1], position[2])
    // rotationX 是横向侧倾、rotationZ 是前后俯仰（搅拌车要按地面坡度斜放）
    obj.rotation.set(rotationX, rotationY, rotationZ)
    // 土堆这类「单位尺寸」模型靠缩放摆成不同大小：x/z 按底半径、y 按堆高
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

  /**
   * 铺一段围挡。
   * fence.glb 单段长 18m，一段不够就把 N 段沿走向等分，
   * 再把每段沿 X 拉伸 spacing/18，保证首尾严丝合缝、不留缝也不重叠。
   */
  addFenceRun({ from, to }) {
    // 用 Vector2 做 XZ 平面上的二维运算：x 对应世界 X，y 对应世界 Z
    const a = new THREE.Vector2(from[0], from[1])
    const b = new THREE.Vector2(to[0], to[1])
    const delta = b.clone().sub(a)
    const length = delta.length()
    if (length < 0.5) return

    const dir = delta.clone().normalize()
    const count = Math.max(1, Math.round(length / FENCE_MODEL_LENGTH))
    const spacing = length / count

    // 绕 Y 旋转 θ 会把模型局部 +X 转到 (cosθ, 0, -sinθ)，
    // 令它等于走向向量即可反解出 θ
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

  /**
   * 沿走向等距布路灯。
   * 灯臂在模型里朝局部 +X，这里按走向算出一条指向场地中心的法线，
   * 再反解出绕 Y 的旋转角，让所有灯臂都朝向工地内部。
   */
  addLampRun({ from, to }) {
    const a = new THREE.Vector2(from[0], from[1])
    const b = new THREE.Vector2(to[0], to[1])
    const delta = b.clone().sub(a)
    const length = delta.length()
    if (length < 1) return

    const dir = delta.clone().normalize()
    const count = Math.max(1, Math.round(length / LAMP_SPACING))
    const spacing = length / count

    // 走向的法线，选指向原点的那一侧
    let nx = -dir.y
    let nz = dir.x
    const mid = a.clone().addScaledVector(dir, length / 2)
    if (nx * -mid.x + nz * -mid.y < 0) {
      nx = -nx
      nz = -nz
    }
    // 局部 +X -> (cosθ, 0, -sinθ)，令其等于法线即可
    const rotY = Math.atan2(-nz, nx)

    for (let i = 0; i <= count; i += 1) {
      const px = a.x + dir.x * i * spacing
      const pz = a.y + dir.y * i * spacing

      // 相邻两段围墙共用角点，同一位置只摆一盏
      const key = `${Math.round(px * 100)}|${Math.round(pz * 100)}`
      if (this.lampKeys.has(key)) continue
      this.lampKeys.add(key)

      // 落进生活区占地范围的灯位跳过，免得灯杆插进宿舍
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

  /** 整个工地的包围盒，用来做自动取景 */
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
