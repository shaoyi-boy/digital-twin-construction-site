import * as THREE from 'three'

// 视角切换：相机和视点一起插值，约 1.1s 飞到预设机位，由 main.js 每帧驱动

// 一次飞行时长（秒）
const DURATION = 1.1

// easeInOutCubic
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

// 六个预设视角，坐标按 110×110 场地、原点居中
// 相机 y 要高于 target y，否则被 OrbitControls 的俯仰限制拦住
const PRESETS = [
  { key: 'overview', label: '全景俯瞰', position: [78, 62, 96], target: [0, 4, 0] },
  { key: 'structure', label: '主体结构', position: [-6, 26, 46], target: [-8, 8, 8] },
  { key: 'pit', label: '基坑开挖', position: [8, 24, -8], target: [0, -1, -44] },
  { key: 'crane', label: '塔吊作业', position: [46, 36, 10], target: [25, 24, -11] },
  { key: 'gate', label: '工地大门', position: [-39, 9, 70], target: [-39, 3.5, 52] },
  { key: 'camp', label: '生活区', position: [35, 12, -8], target: [35, 3, -40] },
]

export class Views {
  // viewer 是 core/Viewer 实例
  constructor(viewer) {
    this.viewer = viewer
    // 默认视角：自动取景后的机位，复位时用
    this.home = {
      position: viewer.camera.position.clone(),
      target: viewer.controls.target.clone(),
    }
    this.activeKey = 'home'
    this.anim = null
  }

  // 面板用列表；默认视角由 main.js 单列，不在这里
  get list() {
    return PRESETS.map((p) => ({ key: p.key, label: p.label }))
  }

  has(key) {
    return PRESETS.some((p) => p.key === key)
  }

  setHomeFromCamera() {
    this.home.position.copy(this.viewer.camera.position)
    this.home.target.copy(this.viewer.controls.target)
  }

  go(key) {
    const preset = PRESETS.find((p) => p.key === key)
    if (preset) {
      this.activeKey = key
      this.flyTo(preset.position, preset.target)
    } else {
      this.activeKey = 'home'
      this.flyTo(this.home.position.toArray(), this.home.target.toArray())
    }
    return this.activeKey
  }

  flyTo(position, target, duration = DURATION) {
    this.anim = {
      fromPos: this.viewer.camera.position.clone(),
      fromTarget: this.viewer.controls.target.clone(),
      toPos: new THREE.Vector3(position[0], position[1], position[2]),
      toTarget: new THREE.Vector3(target[0], target[1], target[2]),
      elapsed: 0,
      duration,
    }
  }

  get flying() {
    return this.anim !== null
  }

  // 每帧推进飞行，由 viewer.onUpdate 调用
  update(dt) {
    const a = this.anim
    if (!a) return

    a.elapsed += dt
    const t = Math.min(a.elapsed / a.duration, 1)
    const e = easeInOut(t)

    this.viewer.camera.position.lerpVectors(a.fromPos, a.toPos, e)
    this.viewer.controls.target.lerpVectors(a.fromTarget, a.toTarget, e)
    this.viewer.controls.update()

    if (t >= 1) {
      this.viewer.camera.position.copy(a.toPos)
      this.viewer.controls.target.copy(a.toTarget)
      this.viewer.controls.update()
      this.anim = null
    }
  }
}
