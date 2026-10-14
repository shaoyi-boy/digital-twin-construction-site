import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

/**
 * 三维视口容器
 *
 * 负责渲染器、场景、相机、控制器和渲染循环这些「基础设施」，
 * 上层只要往 scene 里加东西、用 onUpdate 注册每帧回调就行。
 */
export class Viewer {
  constructor(canvas) {
    this.canvas = canvas
    this.updaters = []
    this.lastTime = performance.now()

    // ---------------- 渲染器 ----------------
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    this.renderer.setSize(window.innerWidth, window.innerHeight)
    this.renderer.shadowMap.enabled = true
    this.renderer.shadowMap.type = THREE.PCFShadowMap
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.05

    // ---------------- 场景 ----------------
    this.scene = new THREE.Scene()

    // ---------------- 相机 ----------------
    // 初始机位从东南方向俯视整个工地
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    )
    this.camera.position.set(62, 52, 78)

    // ---------------- 控制器 ----------------
    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 4, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.minDistance = 6
    this.controls.maxDistance = 340
    // 限制俯仰角，避免相机钻到地面以下
    this.controls.maxPolarAngle = Math.PI * 0.495

    window.addEventListener('resize', () => this.resize())
  }

  /** 注册每帧回调，参数是距上一帧的秒数 */
  onUpdate(fn) {
    this.updaters.push(fn)
  }

  resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    this.camera.aspect = w / h
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(w, h)
  }

  /**
   * 自动取景：把整个包围盒塞进画面。
   *
   * 思路是把包围盒 8 个角点投影到相机的「右 / 上 / 前」三个轴上，
   * 分别算出横向和纵向需要多远才装得下，取最大值。
   * 比直接用包围球半径准得多——工地这种又扁又宽的场地，
   * 用包围球会把相机推得特别远，场地只占屏幕中间一小块。
   */
  frameBounds(box, padding = 1.08) {
    const center = box.getCenter(new THREE.Vector3())

    // 视点别用几何中心：塔吊有 36m 高，会把中心抬到半空，
    // 结果画面上半屏全是天空、工地全挤在底部。压到接近地面的高度更耐看。
    center.y = box.min.y + (box.max.y - box.min.y) * 0.18

    const dir = new THREE.Vector3(0.78, 0.58, 0.95).normalize()

    const forward = dir.clone().negate()
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize()
    const up = new THREE.Vector3().crossVectors(right, forward).normalize()

    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)
    const tanH = tanV * this.camera.aspect

    let dist = 0
    for (let i = 0; i < 8; i += 1) {
      const corner = new THREE.Vector3(
        i & 1 ? box.max.x : box.min.x,
        i & 2 ? box.max.y : box.min.y,
        i & 4 ? box.max.z : box.min.z
      ).sub(center)

      const depth = corner.dot(forward)
      dist = Math.max(
        dist,
        depth + Math.abs(corner.dot(right)) / tanH,
        depth + Math.abs(corner.dot(up)) / tanV
      )
    }

    this.camera.position.copy(center).addScaledVector(dir, dist * padding)
    this.controls.target.copy(center)
    this.controls.update()
    return dist
  }

  /** 让相机平滑飞到指定位置和视点，界面里做定位跳转时用 */
  flyTo(position, target, duration = 1.2) {
    const fromPos = this.camera.position.clone()
    const fromTarget = this.controls.target.clone()
    const toPos = new THREE.Vector3(...position)
    const toTarget = new THREE.Vector3(...target)
    const start = performance.now()

    const step = () => {
      const t = Math.min((performance.now() - start) / (duration * 1000), 1)
      // easeInOutCubic，比线性看起来自然
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
      this.camera.position.lerpVectors(fromPos, toPos, e)
      this.controls.target.lerpVectors(fromTarget, toTarget, e)
      this.controls.update()
      if (t < 1) requestAnimationFrame(step)
    }
    step()
  }

  start() {
    this.renderer.setAnimationLoop(() => {
      const now = performance.now()
      // 限制单帧步长：切到别的标签页再切回来时，时间差会很大，直接算会跳帧
      const dt = Math.min((now - this.lastTime) / 1000, 0.1)
      this.lastTime = now

      // 漫游模式下相机交给 RoamController，这里必须跳过：
      // OrbitControls.update() 结尾会 lookAt(target)，会把朝向拽回去
      if (this.controls.enabled) this.controls.update()
      for (const fn of this.updaters) fn(dt)
      this.renderer.render(this.scene, this.camera)
    })
  }

  stop() {
    this.renderer.setAnimationLoop(null)
  }
}
