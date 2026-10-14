import * as THREE from 'three'

// 塔吊动画：回转 + 小车变幅 + 吊钩升降，三个动作都靠 update(dt) 缓动

const DEG = 180 / Math.PI

// 模型里各节点的基准尺寸，单位 m
const ROPE_BASE = 11.0 // 钢丝绳基准长度（沿局部 Z）
const ROPE_TOP_Y = 0.35 // 绳顶在 Slew 局部里的高度
const SLEW_AXIS = 'y' // 回转轴 = 节点局部 Y

// 绳长上下限，避免吊钩插地或顶到小车
const ROPE_MIN = 3.0
const ROPE_MAX = 28.0

// 小车内侧极限距塔身 2.5m，外侧取大臂臂尖（按模型几何实测）
const TROLLEY_MIN = 2.5

// 回转额定 4°/s，起停各 2s 匀加减速
const SLEW_VMAX = 4.0
const SLEW_RAMP = 2.0

// 升降 / 变幅目标平滑的时间常数，秒
const HOIST_TAU = 0.4
const TROLLEY_TAU = 0.5

// 自动变幅一个往复的时长，秒
const TROLLEY_PERIOD = 24.0

// 速度倍率范围
const SPEED_MIN = 0.2
const SPEED_MAX = 3.0

// 0→1 平滑过渡
const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export class Crane {
  constructor(root) {
    this.root = root
    this.available = false
    this.warning = ''
    this.ropeMin = ROPE_MIN
    this.ropeMax = ROPE_MAX

    const parts = {}
    root.traverse((o) => {
      if (o.name) parts[o.name] = o
    })
    this.slew = parts.TowerCrane_Slew
    this.trolley = parts.TowerCrane_Trolley
    this.hookBlock = parts.TowerCrane_HookBlock
    this.rope = parts.TowerCrane_HookRope

    if (!this.slew || !this.trolley || !this.hookBlock || !this.rope) {
      this.warning =
        '塔吊动画节点缺失（需要 TowerCrane_Slew / _Trolley / _HookRope / _HookBlock）'
      console.warn('[Crane]', this.warning, Object.keys(parts))
      return
    }

    // 吊钩块最低点到块顶的距离，用来估离地高度
    this.hookLow = hookLowLocal(this.hookBlock)
    this.slewY = this.slew.position.y // 回转中心离地高度（≈31.4m）

    // 小车行程：内侧 2.5m，外侧 = 模型里大臂的真实臂尖
    this.trolleyMin = TROLLEY_MIN
    this.trolleyMax = jibTipX(root, this.slew)

    // 回转状态
    this.slewOn = false
    this.slewSpeed = 0 // 当前角速度 °/s
    this.slewAngle = 0 // 累计转角 rad

    // 变幅状态，小车在 Slew 局部的 X 就是幅度，单位 m
    this.trolleyR = clamp(this.trolley.position.x, this.trolleyMin, this.trolleyMax)
    this.trolleyTarget = this.trolleyR
    this.trolleyAuto = false
    this.trolleyAutoTime = 0

    // 升降状态，绳长单位 m
    this.ropeLen = ROPE_MIN
    this.hoistTarget = ROPE_MIN

    // 自动升降
    this.hoistAuto = false
    this.hoistAutoTime = 0

    // 三个动作各自的速度倍率
    this.mul = { slew: 1, trolley: 1, hoist: 1 }

    // 记下初始幅度和绳长，留作「恢复默认」
    this.trolleyHome = this.trolleyR
    this.ropeHome = this.ropeLen

    this.applyPose()
    this.available = true
  }

  // 面板状态，给 Hud 渲染
  get state() {
    return {
      available: this.available,
      slewOn: this.slewOn,
      slewSpeed: this.slewSpeed,
      slewDeg: this.slewAngle * DEG,
      // 变幅
      trolleyR: this.trolleyR,
      trolleyMin: this.trolleyMin,
      trolleyMax: this.trolleyMax,
      trolleyAuto: this.trolleyAuto,
      // 升降
      ropeLen: this.ropeLen,
      ropeMin: this.ropeMin,
      ropeMax: this.ropeMax,
      hoistAuto: this.hoistAuto,
      hookHeight: this.hookHeight(),
      // 速度倍率
      mul: { slew: this.mul.slew, trolley: this.mul.trolley, hoist: this.mul.hoist },
    }
  }

  // 吊钩最低点离地高度，近似值，塔吊底座在 y=0
  hookHeight() {
    return this.slewY + this.hookBlock.position.y - this.hookLow
  }

  // 回转开关，和变幅 / 升降互不影响，可同时开
  toggleSlew() {
    this.slewOn = !this.slewOn
    return this.slewOn
  }

  // 手动设绳长（m），会关掉自动升降，越界自动夹紧
  setHoist(m) {
    this.hoistAuto = false
    this.hoistTarget = clamp(m, this.ropeMin, this.ropeMax)
    return this.hoistTarget
  }

  // 自动升降开关，在上下限之间连续往复
  toggleHoistAuto() {
    this.hoistAuto = !this.hoistAuto
    if (this.hoistAuto) this.hoistAutoTime = 0
    return this.hoistAuto
  }

  // 手动设小车幅度（m），会关掉自动变幅，越界自动夹紧
  setTrolley(m) {
    this.trolleyAuto = false
    this.trolleyTarget = clamp(m, this.trolleyMin, this.trolleyMax)
    return this.trolleyTarget
  }

  // 自动变幅开关，关掉时停在当前幅度，不再漂移
  toggleTrolleyAuto() {
    this.trolleyAuto = !this.trolleyAuto
    if (this.trolleyAuto) {
      this.trolleyAutoTime = 0
    } else {
      this.trolleyTarget = this.trolleyR
    }
    return this.trolleyAuto
  }

  // 设某个动作的速度倍率（0.2×~3×），只缩放时间、不重置相位
  // key 取 slew / trolley / hoist
  setSpeed(key, v) {
    if (!(key in this.mul)) return this.mul[key] ?? 1
    this.mul[key] = clamp(v, SPEED_MIN, SPEED_MAX)
    return this.mul[key]
  }

  // 复位：全停、小车和吊钩回初始位、倍率回 1×；只改目标值，位置交给 update 缓动
  reset() {
    if (!this.available) return
    this.slewOn = false
    this.trolleyAuto = false
    this.trolleyTarget = this.trolleyHome
    this.hoistAuto = false
    this.hoistTarget = this.ropeHome
    this.mul.slew = 1
    this.mul.trolley = 1
    this.mul.hoist = 1
  }

  update(dt) {
    if (!this.available) return

    // 倍率只缩放时间，重设不会让相位跳变
    const dtSlew = dt * this.mul.slew
    const dtTrolley = dt * this.mul.trolley
    const dtHoist = dt * this.mul.hoist

    // 回转：匀加减速
    const vTarget = this.slewOn ? SLEW_VMAX : 0
    const step = (SLEW_VMAX / SLEW_RAMP) * dtSlew
    if (this.slewSpeed < vTarget) this.slewSpeed = Math.min(vTarget, this.slewSpeed + step)
    else if (this.slewSpeed > vTarget) this.slewSpeed = Math.max(vTarget, this.slewSpeed - step)
    this.slewAngle += (this.slewSpeed / DEG) * dtSlew
    this.slew.rotation[SLEW_AXIS] = this.slewAngle

    // 变幅：自动往复，两端各停一下
    if (this.trolleyAuto) {
      this.trolleyAutoTime += dtTrolley
      const period = TROLLEY_PERIOD
      const p = (this.trolleyAutoTime % period) / period
      let k
      if (p < 0.42) k = smooth(p / 0.42)                        // 向外
      else if (p < 0.5) k = 1                                   // 外侧停顿
      else if (p < 0.92) k = 1 - smooth((p - 0.5) / 0.42)       // 向内
      else k = 0                                                // 内侧停顿
      this.trolleyTarget = this.trolleyMin + (this.trolleyMax - this.trolleyMin) * k
    }
    this.trolleyR += (this.trolleyTarget - this.trolleyR) * (1 - Math.exp(-dtTrolley / TROLLEY_TAU))
    if (Math.abs(this.trolleyTarget - this.trolleyR) < 1e-4) this.trolleyR = this.trolleyTarget
    this.trolleyR = clamp(this.trolleyR, this.trolleyMin, this.trolleyMax)

    // 升降：自动往复，两端各停一下
    if (this.hoistAuto) {
      this.hoistAutoTime += dtHoist
      const period = 20.0
      const p = (this.hoistAutoTime % period) / period
      let k
      if (p < 0.42) k = smooth(p / 0.42)                        // 下放
      else if (p < 0.5) k = 1                                    // 底部停顿
      else if (p < 0.92) k = 1 - smooth((p - 0.5) / 0.42)        // 提升
      else k = 0                                                 // 顶部停顿
      this.hoistTarget = this.ropeMin + (this.ropeMax - this.ropeMin) * k
    }
    this.ropeLen += (this.hoistTarget - this.ropeLen) * (1 - Math.exp(-dtHoist / HOIST_TAU))
    if (Math.abs(this.hoistTarget - this.ropeLen) < 1e-4) this.ropeLen = this.hoistTarget

    // 小车 / 钢丝绳 / 吊钩一次写到同一个局部 X 上，保证不脱开
    this.applyPose()
  }

  // 写姿态：小车局部 X = 幅度；绳原点在绳顶，scale.z = 绳长 / 基准长；钩块顶 y = 绳顶 - 绳长
  applyPose() {
    const r = this.trolleyR

    this.trolley.position.x = r
    this.trolley.position.z = 0

    this.rope.position.x = r
    this.rope.position.z = 0
    this.rope.scale.z = this.ropeLen / ROPE_BASE

    this.hookBlock.position.x = r
    this.hookBlock.position.z = 0
    this.hookBlock.position.y = ROPE_TOP_Y - this.ropeLen
  }
}

// 大臂臂尖在 Slew 局部坐标里的 X（模型朝 +X 伸出的最远端），用来定小车外极限
function jibTipX(root, slew) {
  root.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(slew.matrixWorld).invert()
  const tmp = new THREE.Matrix4()
  const box = new THREE.Box3()
  let has = false
  slew.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    const b = o.geometry.boundingBox.clone()
    tmp.multiplyMatrices(inv, o.matrixWorld)
    b.applyMatrix4(tmp)
    box.union(b)
    has = true
  })
  return has ? box.max.x : 38
}

// 吊钩块最低点相对其原点（块顶）的局部 y 距离
function hookLowLocal(group) {
  group.updateMatrixWorld(true)
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert()
  const box = new THREE.Box3()
  let has = false
  group.traverse((o) => {
    if (!o.isMesh || !o.geometry) return
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox()
    const b = o.geometry.boundingBox.clone()
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld)
    b.applyMatrix4(m)
    box.union(b)
    has = true
  })
  return has ? Math.abs(box.min.y) : 1.755
}
