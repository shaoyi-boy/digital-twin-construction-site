import * as THREE from 'three'

/**
 * 视角切换
 *
 * 每个预设是一组世界坐标（相机位置 + 视点），切换时把 OrbitControls 的
 * 相机位置与 target 一起做 easeInOut 插值，约 1.1 秒平滑飞过去。
 *
 * 动画由主循环驱动：main.js 里 viewer.onUpdate(dt => views.update(dt))，
 * 每帧同时写 camera.position 和 controls.target 并调用 controls.update()，
 * 因此飞的过程中依然和现有 OrbitControls 共存、结束后不留任何残留状态。
 */

/** 一次飞行的时长（秒） */
const DURATION = 1.1

/** easeInOutCubic：起步慢、中间快、收尾慢 */
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

/** 六个预设视角，坐标与场地布置一致（110×110 场地、原点居中）
 *  注意：OrbitControls 限制相机不能低于视点水平面，所以每个预设的相机 y 都要高于 target y */
const PRESETS = [
  { key: 'overview', label: '全景俯瞰', position: [78, 62, 96], target: [0, 4, 0] },
  { key: 'structure', label: '主体结构', position: [-6, 26, 46], target: [-8, 8, 8] },
  { key: 'pit', label: '基坑开挖', position: [8, 24, -8], target: [0, -1, -44] },
  { key: 'crane', label: '塔吊作业', position: [46, 36, 10], target: [25, 24, -11] },
  { key: 'gate', label: '工地大门', position: [-39, 9, 70], target: [-39, 3.5, 52] },
  { key: 'camp', label: '生活区', position: [35, 12, -8], target: [35, 3, -40] },
]

export class Views {
  /** @param {import('../core/Viewer.js').Viewer} viewer */
  constructor(viewer) {
    this.viewer = viewer
    /** 默认视角：自动取景后的机位，用于「默认视角」复位 */
    this.home = {
      position: viewer.camera.position.clone(),
      target: viewer.controls.target.clone(),
    }
    this.activeKey = 'home'
    this.anim = null
  }

  /** 面板用：预设列表（不含「默认视角」，它由 main.js 单独排在最前） */
  get list() {
    return PRESETS.map((p) => ({ key: p.key, label: p.label }))
  }

  /** 判断某个 key 是否是预设视角 */
  has(key) {
    return PRESETS.some((p) => p.key === key)
  }

  /** 记录当前机位为默认视角 */
  setHomeFromCamera() {
    this.home.position.copy(this.viewer.camera.position)
    this.home.target.copy(this.viewer.controls.target)
  }

  /** 切到某个视角（预设没有时回落到默认视角） */
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

  /** 开始一段飞行 */
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

  /** 每帧推进飞行（由 viewer.onUpdate 调用） */
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
