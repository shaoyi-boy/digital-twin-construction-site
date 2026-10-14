import * as THREE from 'three'

/**
 * 大门开合动画（对开蓝门）
 *
 * Blender 里两扇蓝门是独立导出的节点：
 *
 *   SiteGate_LeafL —— 左扇，物体原点在门洞西端铰链轴上，局部 +X 伸向门洞正中
 *   SiteGate_LeafR —— 右扇，物体原点在门洞东端铰链轴上，局部 -X 伸向门洞正中
 *
 * 两扇的几何都是「闭合」姿态（两扇在门洞正中相接、填满车道），所以：
 *   0°  = 关门（默认）；转到 OPEN_DEG 就是开门，两扇各自绕自身竖直轴（three.js 局部 Y）
 *   反向摆开，始终关于门洞中线对称。门柱在门洞两端之外，围挡在 Δz=0 那条线上，
 *   两扇朝场内摆到 OPEN_DEG（<90°）都不会碰到门柱，也不会扫到围挡。
 *
 * 本类只做一件事：把「开合进度 k ∈ [0,1]」按 smoothstep 缓动后写到两扇的 rotation.y。
 * k 以恒定速度线性推进（1.0× 时约 2 秒走完 0→1），因此：
 *   · 起、停都平滑，不跳变；
 *   · 两个方向都能走，可反复切换、幂等；
 *   · 到端点严格夹在 0 / 1，两扇永远对称，停在极限角度上不会抖。
 */

/** 开门极限角度（度）：接近 90° 但不贴平，避免与门柱/围挡产生视觉穿插 */
const OPEN_DEG = 88
/** 进度 0→1 的基准时长（秒），速度倍率按比例缩放到时间轴上 */
const DURATION = 2.0
/** 速度倍率范围 */
const SPEED_MIN = 0.2
const SPEED_MAX = 3.0

const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export class SiteGate {
  /** @param {THREE.Object3D} root 场地上那座大门对象（site_gate.glb 的克隆） */
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

    this.open = false        // 目标状态：false 关 / true 开
    this.k = 0               // 开合进度 0(关) ~ 1(开)
    this.speed = 1           // 速度倍率

    this.applyPose()
    this.available = true
  }

  /** 面板状态（供 Hud 渲染） */
  get state() {
    return {
      available: this.available,
      open: this.open,
      deg: OPEN_DEG * smooth(this.k),
      maxDeg: OPEN_DEG,
      speed: this.speed,
    }
  }

  /** 开 / 关切换：幂等，重复点击只是把目标翻到另一侧 */
  toggle() {
    this.open = !this.open
    return this.open
  }

  /** 设定开合速度倍率（0.2× ~ 3×）：只缩放推进快慢，不改当前相位，动画不会跳 */
  setSpeed(v) {
    this.speed = clamp(v, SPEED_MIN, SPEED_MAX)
    return this.speed
  }

  /** 复位：关门 + 速度倍率回 1.0×（交给 update 缓动走到 0°，不会硬切） */
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

  /** 两扇对称开合：左扇 +θ、右扇 −θ（都朝场内摆，互不干涉、也不碰门柱） */
  applyPose() {
    const rad = THREE.MathUtils.degToRad(OPEN_DEG * smooth(this.k))
    this.leafL.rotation.y = rad
    this.leafR.rotation.y = -rad
  }
}
