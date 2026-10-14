import * as THREE from 'three'

// 大门开合。左扇 SiteGate_LeafL 原点在门洞西端铰链，局部 +X 伸向门洞正中，右扇对称。
// 模型按关门姿态建的，0° 关、转到 OPEN_DEG 开，两扇绕各自竖直轴反向摆开。

// 开门极限角度（度），不贴平免得插到门柱和围挡
const OPEN_DEG = 88
// 进度 0→1 的基准时长（秒）
const DURATION = 2.0
// 速度倍率范围
const SPEED_MIN = 0.2
const SPEED_MAX = 3.0

const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export class SiteGate {
  // root 是场地里那座大门对象
  constructor(root) {
    this.root = root
    this.available = false
    this.warning = ''

    const parts = {}
    root.traverse((o) => {
      if (o.name) parts[o.name] = o
    })
    this.leafL = parts.SiteGate_LeafL
    this.leafR = parts.SiteGate_LeafR

    if (!this.leafL || !this.leafR) {
      this.warning = '大门开合节点缺失（需要 SiteGate_LeafL / SiteGate_LeafR）'
      console.warn('[SiteGate]', this.warning, Object.keys(parts))
      return
    }

    this.open = false // 目标状态：false 关 true 开
    this.k = 0 // 开合进度 0 关 ~ 1 开
    this.speed = 1 // 速度倍率

    this.applyPose()
    this.available = true
  }

  // 给面板渲染用的状态
  get state() {
    return {
      available: this.available,
      open: this.open,
      deg: OPEN_DEG * smooth(this.k),
      maxDeg: OPEN_DEG,
      speed: this.speed,
    }
  }

  toggle() {
    this.open = !this.open
    return this.open
  }

  // 只改推进快慢，不改相位，不会跳
  setSpeed(v) {
    this.speed = clamp(v, SPEED_MIN, SPEED_MAX)
    return this.speed
  }

  // 关门 + 速度回 1，交给 update 缓动到 0°，不硬切
  reset() {
    this.open = false
    this.speed = 1
  }

  update(dt) {
    if (!this.available) return

    const target = this.open ? 1 : 0
    const step = (dt * this.speed) / DURATION
    if (this.k < target) this.k = Math.min(target, this.k + step)
    else if (this.k > target) this.k = Math.max(target, this.k - step)

    this.applyPose()
  }

  // 左扇 +θ、右扇 -θ，都朝场内摆
  applyPose() {
    const rad = THREE.MathUtils.degToRad(OPEN_DEG * smooth(this.k))
    this.leafL.rotation.y = rad
    this.leafR.rotation.y = -rad
  }
}
