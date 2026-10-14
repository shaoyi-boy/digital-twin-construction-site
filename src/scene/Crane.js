import * as THREE from 'three'

/**
 * 塔吊动画（回转 + 小车变幅 + 吊钩升降）
 *
 * 在 Blender 里塔吊拆成 5 个命名节点：
 *
 *   TowerCrane          —— 不动（基础 / 塔身 / 爬升套架 / 附墙 / 爬梯平台 / 主电缆）
 *     └ TowerCrane_Slew —— 回转体（回转支承 / 司机室 / 塔帽 / 大臂 / 平衡臂 / 配重 …）
 *         ├ TowerCrane_Trolley   —— 变幅小车（局部 +X 沿大臂）
 *         ├ TowerCrane_HookRope  —— 起升钢丝绳（原点在绳顶，scale.z 控制绳长）
 *         └ TowerCrane_HookBlock —— 吊钩总成（原点在滑轮组顶面）
 *
 * 小车 / 钢丝绳 / 吊钩都是 Slew 的子节点，回转时被一起带走，无需单独补偿。
 * 变幅时三者必须一直待在同一个局部 X 上，否则绳子和吊钩会和小车脱开：
 * 本文件在每一帧统一调用 applyPose()，把小车、绳、钩的 X 一次性写到一起。
 *
 * 轴向：导出的 glTF 是 Y-up，Blender 里「节点局部 Z（塔身竖直轴）」经逐节点
 * swizzle 后变成 three.js 里「节点局部 Y」，所以回转写 rotation.y；
 * 钢丝绳节点在 Blender 里特意绕 X 转了 -90°，使它在 three.js 里局部 Z 恰好竖直，
 * 于是 scale.z 正好是绳长（沿节点自身原点缩放，绳顶保持不动）。
 *
 * 本文件做三件事，且都由同一条 update(dt) 驱动、都用缓动插值而非硬赋值：
 *   1) 回转：匀加减速平滑起停，额定角速度 ≈4°/s（0.0698 rad/s，整圈 ≈90s）
 *   2) 变幅：小车沿大臂局部 +X 移动，内侧 2.5m、外侧到大臂臂尖，可为自动往复
 *   3) 升降：绳长在上下限之间平滑变化，绳顶固定，吊钩块顶面始终贴住绳底
 * 三个动作各有一个速度倍率（0.2× ~ 3×），只缩放推进快慢、不改相位。
 */

const DEG = 180 / Math.PI

// —— 与 blender/scripts/parts_structure.py 建模几何一致的常量（单位 m）——
const ROPE_BASE = 11.0                   // 钢丝绳节点在模型里的基准长度（局部 Z）
const ROPE_TOP_Y = 0.35                  // 绳顶（节点原点）在 Slew 局部坐标里的高度
const SLEW_AXIS = 'y'                    // 回转轴 = 节点局部 Y

// 绳长上下限：上限保证吊钩块最低点仍在地面以上，下限保证吊钩块顶面远低于变幅小车
const ROPE_MIN = 3.0
const ROPE_MAX = 28.0

// 小车变幅内侧极限：距塔身轴线 2.5m；外侧极限 = 大臂臂尖（构造时按模型几何实测）
const TROLLEY_MIN = 2.5

// 回转：额定 4°/s（≈0.07 rad/s），起停各用 2s 匀加减速，绝不硬起硬停
const SLEW_VMAX = 4.0
const SLEW_RAMP = 2.0

// 升降 / 变幅：目标指数平滑逼近（时间常数 0.4/0.5s），无跳变
const HOIST_TAU = 0.4
const TROLLEY_TAU = 0.5

// 自动变幅一个完整往复的时长（秒）
const TROLLEY_PERIOD = 24.0

// 速度倍率范围
const SPEED_MIN = 0.2
const SPEED_MAX = 3.0

/** smoothstep：0→1 之间平滑过渡 */
const smooth = (t) => {
  const k = Math.min(1, Math.max(0, t))
  return k * k * (3 - 2 * k)
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

export class Crane {
  /**
   * @param {THREE.Object3D} root 场地上那台塔吊对象（tower_crane.glb 的克隆）
   */
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

    // 吊钩块最低点相对其原点（块顶）的距离，用于估算离地高度
    this.hookLow = hookLowLocal(this.hookBlock)
    this.slewY = this.slew.position.y          // 回转中心离地高度（≈31.4m）

    // 变幅小车的行程：内侧固定 2.5m，外侧取模型里大臂的真实臂尖 x
    this.trolleyMin = TROLLEY_MIN
    this.trolleyMax = jibTipX(root, this.slew)

    // 回转状态
    this.slewOn = false
    this.slewSpeed = 0                          // 当前角速度 °/s
    this.slewAngle = 0                          // 累计转角 rad

    // 变幅状态（小车在 Slew 局部里的 X = 幅度，单位 m）
    this.trolleyR = clamp(this.trolley.position.x, this.trolleyMin, this.trolleyMax)
    this.trolleyTarget = this.trolleyR
    this.trolleyAuto = false
    this.trolleyAutoTime = 0

    // 升降状态（绳长，单位 m）
    this.ropeLen = ROPE_MIN
    this.hoistTarget = ROPE_MIN

    // 自动升降
    this.hoistAuto = false
    this.hoistAutoTime = 0

    // 三个动作各自的速度倍率
    this.mul = { slew: 1, trolley: 1, hoist: 1 }

    // 记录初始幅度与绳长，作为「恢复默认」的复位目标
    this.trolleyHome = this.trolleyR
    this.ropeHome = this.ropeLen

    this.applyPose()
    this.available = true
  }

  /** 面板状态（供 Hud 渲染） */
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

  /** 吊钩最低点的离地高度（近似，塔吊底座在 y=0） */
  hookHeight() {
    return this.slewY + this.hookBlock.position.y - this.hookLow
  }

  /** 回转开关：与变幅 / 升降互不影响，可同时开启 */
  toggleSlew() {
    this.slewOn = !this.slewOn
    return this.slewOn
  }

  /** 手动设定绳长（m），会关掉自动升降；越界自动夹紧 */
  setHoist(m) {
    this.hoistAuto = false
    this.hoistTarget = clamp(m, this.ropeMin, this.ropeMax)
    return this.hoistTarget
  }

  /** 自动升降开关：在上下限之间连续往复 */
  toggleHoistAuto() {
    this.hoistAuto = !this.hoistAuto
    if (this.hoistAuto) this.hoistAutoTime = 0
    return this.hoistAuto
  }

  /** 手动设定小车幅度（m），会关掉自动变幅；越界自动夹紧 */
  setTrolley(m) {
    this.trolleyAuto = false
    this.trolleyTarget = clamp(m, this.trolleyMin, this.trolleyMax)
    return this.trolleyTarget
  }

  /** 自动变幅开关：小车在内外极限之间连续往复；关闭时停在当前幅度，不再漂移 */
  toggleTrolleyAuto() {
    this.trolleyAuto = !this.trolleyAuto
    if (this.trolleyAuto) {
      this.trolleyAutoTime = 0
    } else {
      this.trolleyTarget = this.trolleyR
    }
    return this.trolleyAuto
  }

  /**
   * 设定某个动作的速度倍率（0.2× ~ 3×）。
   * 只是把时间缩放打进 update，不重置任何相位，动画不会跳。
   * @param {'slew'|'trolley'|'hoist'} key
   */
  setSpeed(key, v) {
    if (!(key in this.mul)) return this.mul[key] ?? 1
    this.mul[key] = clamp(v, SPEED_MIN, SPEED_MAX)
    return this.mul[key]
  }

  /**
   * 复位到初始状态：回转停、自动变幅 / 自动升降关、小车回到初始幅度、
   * 吊钩回到初始绳长、三个速度倍率回 1.0×。
   * 只改目标值，实际位置 / 角速度都交给 update() 平滑逼近，因此不会跳变，
   * 正在进行的回转也会照常匀减速刹停，不会「打断」动画。
   */
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

    // 三个动作各自的时间缩放：倍率只改变推进快慢，重新设定倍率不会让相位跳变
    const dtSlew = dt * this.mul.slew
    const dtTrolley = dt * this.mul.trolley
    const dtHoist = dt * this.mul.hoist

    // ---------- 回转：匀加减速，2s 升到额定角速度，停机 2s 平滑刹停 ----------
    const vTarget = this.slewOn ? SLEW_VMAX : 0
    const step = (SLEW_VMAX / SLEW_RAMP) * dtSlew
    if (this.slewSpeed < vTarget) this.slewSpeed = Math.min(vTarget, this.slewSpeed + step)
    else if (this.slewSpeed > vTarget) this.slewSpeed = Math.max(vTarget, this.slewSpeed - step)
    this.slewAngle += (this.slewSpeed / DEG) * dtSlew
    this.slew.rotation[SLEW_AXIS] = this.slewAngle

    // ---------- 变幅：自动往复（两端各停顿一下），小车幅度指数平滑逼近目标 ----------
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

    // ---------- 升降：自动往复（两端各停顿一下），绳长指数平滑逼近目标 ----------
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

    // 小车 / 钢丝绳 / 吊钩一次性写到同一个局部 X 上，保证永远不脱开
    this.applyPose()
  }

  /**
   * 把当前姿态写到小车、钢丝绳与吊钩上。
   *   小车：局部 X = 幅度 r
   *   钢丝绳：原点在绳顶，局部 X 与小车的 X 相同，scale.z = 绳长 / 基准长
   *   吊钩块：原点在块顶，局部 X 与小车相同，y = 绳顶 - 绳长，块顶就永远贴住绳底
   */
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

/** 大臂臂尖在 Slew 局部坐标里的 X（模型里朝 +X 伸出的最远端），用于限定小车外极限 */
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

/** 吊钩块总成最低点相对其原点（块顶）的局部 y 距离 */
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
