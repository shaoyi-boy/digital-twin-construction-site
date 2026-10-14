import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'

// 三维视口：渲染器、场景、相机和渲染循环都在这里，上层只管往 scene 加东西
export class Viewer {
  constructor(canvas) {
    this.canvas = canvas
    this.updaters = []
    this.lastTime = performance.now()

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

    this.scene = new THREE.Scene()

    // 初始机位在东南方向，俯视整个工地
    this.camera = new THREE.PerspectiveCamera(
      50,
      window.innerWidth / window.innerHeight,
      0.1,
      2000
    )
    this.camera.position.set(62, 52, 78)

    this.controls = new OrbitControls(this.camera, this.renderer.domElement)
    this.controls.target.set(0, 4, 0)
    this.controls.enableDamping = true
    this.controls.dampingFactor = 0.06
    this.controls.minDistance = 6
    this.controls.maxDistance = 340
    // 限制俯仰角，别让相机钻到地面下
    this.controls.maxPolarAngle = Math.PI * 0.495

    window.addEventListener('resize', () => this.resize())
  }

  // fn 的参数是距上一帧的秒数
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

  // 自动取景：按包围盒 8 个角点算距离，比包围球更贴合这种又扁又宽的场地
  frameBounds(box, padding = 1.08) {
    const center = box.getCenter(new THREE.Vector3())

    // 视点压低一些，塔吊 36m 会把几何中心抬太高
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

  // 相机平滑飞到指定位置和视点
  flyTo(position, target, duration = 1.2) {
    const fromPos = this.camera.position.clone()
    const fromTarget = this.controls.target.clone()
    const toPos = new THREE.Vector3(...position)
    const toTarget = new THREE.Vector3(...target)
    const start = performance.now()

    const step = () => {
      const t = Math.min((performance.now() - start) / (duration * 1000), 1)
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
      // dt 上限 0.1s，切标签页回来时时间差很大，不截会跳帧
      const dt = Math.min((now - this.lastTime) / 1000, 0.1)
      this.lastTime = now

      // 漫游时相机交给 RoamController，否则 OrbitControls.update 会把朝向拽回去
      if (this.controls.enabled) this.controls.update()
      for (const fn of this.updaters) fn(dt)
      this.renderer.render(this.scene, this.camera)
    })
  }

  stop() {
    this.renderer.setAnimationLoop(null)
  }
}
