import * as THREE from 'three'
import { ZONES, rectArea, ASSEMBLY } from './zones.js'

// 工地人员：克隆低模工人成一支施工队，按 zones.js 的分区撒点，程序化走路/跑动（无骨骼）。
// 状态 work/evac/safe/return，与风险联动由 main 按 Risks 的分区调 setHazard()，解除后 returnAll()。

// 工人模型清单（key 内部用，file 为 public/models 下的文件名）
export const WORKER_MODELS = [
  { key: 'worker', file: 'worker.glb', label: '普通工人' },
  { key: 'hoe', file: 'worker_hoe.glb', label: '持镐工人' },
  { key: 'plan', file: 'worker_plan.glb', label: '看图工人' },
  { key: 'cement', file: 'worker_cement.glb', label: '搬水泥工人' },
  { key: 'tech', file: 'worker_tech.glb', label: '技术员' },
  { key: 'foreman', file: 'worker_foreman.glb', label: '包工头' },
]

// main.js 需要加载的模型文件清单
export const MODEL_FILES = WORKER_MODELS.map((m) => m.file)

// 分区 → 人员构成，每区总数与 zones.js 的 headcount 一致
const ZONE_ALLOC = {
  structure: [['plan', 5], ['worker', 2], ['tech', 2], ['foreman', 1]],
  crane: [['plan', 2], ['worker', 1], ['cement', 1], ['tech', 1]],
  pit: [['hoe', 3], ['cement', 2], ['worker', 1]],
  material: [['hoe', 2], ['cement', 2], ['worker', 1]],
  warehouse: [['worker', 3]],
  camp: [['worker', 4]],
  gate: [['worker', 2], ['foreman', 1]],
}

// 撤离 / 归位的移动速度（m/s）
const WALK_SPEED = 6.0
// 到位判定（m）
const ARRIVE_EPS = 0.5
// 集合点排布参数
const SLOT_COLS = 6
const SLOT_SPACING = 1.6

// 站立↔移动的混合时长（s）
const BLEND_TIME = 0.4
// 步态摆幅（rad）= 基值 + 速度系数 × 速度
const LEG_AMP_BASE = 0.3
const LEG_AMP_SPEED = 0.085
// 手臂摆幅相对腿的比例
const ARM_RATIO = 0.75
// 行进时手臂前抬偏置
const ARM_BIAS_BASE = 0.1
const ARM_BIAS_SPEED = 0.045
// 行进时躯干前倾角（rad）
const LEAN_BASE = 0.03
const LEAN_SPEED = 0.02
// 行进时上下起伏幅度（m）
const WALK_BOB = 0.055

// 安全帽 / 反光背心配色，避免一队人长得一样
const HELMET_COLORS = [0xf7c948, 0xffd21e, 0xff7a1a, 0x2f6bff, 0x36c94f, 0xf2f2f2]
const VEST_COLORS = [0xff6a13, 0xffc515, 0xcdf24a, 0x35d0c0, 0xff4d3d]

// 工具 / 道具类材质：保持原色，不做随机偏色（镐柄、水泥袋、图纸等）
const TOOL_MATERIAL = /wood|timber|handle|bag|sack|cement|concrete|paper|blueprint|drawing|hoe|clipboard|roll|board/i

// 固定种子伪随机：站位随机但可复现
function mulberry32(seed) {
  let a = seed >>> 0
  return function rand() {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 在分区的某个矩形内随机取一点（按面积加权选矩形，四边各留 1m）
function sampleInZone(zone, rand) {
  const rects = zone.rects
  const totalW = rects.reduce((s, r) => s + rectArea(r), 0)
  let pick = rand() * totalW
  let rect = rects[rects.length - 1]
  for (const r of rects) {
    pick -= rectArea(r)
    if (pick <= 0) { rect = r; break }
  }
  const [cx, cz, hx, hz] = rect
  const mx = Math.max(0.2, hx - 1)
  const mz = Math.max(0.2, hz - 1)
  return { x: cx + (rand() * 2 - 1) * mx, z: cz + (rand() * 2 - 1) * mz }
}

// 某分区的人员构成；缺失或数量不符时用普通工人补齐 / 截断
function allocationFor(zone) {
  const spec = ZONE_ALLOC[zone.key]
  const out = []
  if (spec) {
    for (const [key, n] of spec) {
      for (let i = 0; i < n; i += 1) out.push(key)
    }
  }
  while (out.length < zone.headcount) out.push('worker')
  out.length = zone.headcount
  return out
}

export class People {
  constructor(viewer, assets) {
    this.viewer = viewer
    this.available = false
    this.warning = ''
    this.workers = []
    this.profiles = {}
    this.time = 0
    this._hazard = new Set()
    // 全部人员的显隐开关，默认可见
    this.visible = true
    // 实测每帧耗时（ms，指数平滑）
    this.costMs = 0

    this.root = new THREE.Group()
    this.root.name = 'PeopleRoot'
    viewer.scene.add(this.root)

    this._build(assets)
  }

  _build(assets) {
    if (!assets?.clone) {
      this.warning = '模型资源未就绪，人员系统暂不可用'
      console.warn('[People]', this.warning)
      return
    }

    // 逐个取模型副本：worker.glb 必需，其余缺失时该分区回退普通工人
    const bases = {}
    for (const m of WORKER_MODELS) {
      const b = assets.clone(m.file)
      if (b) bases[m.key] = b
    }
    if (!bases.worker) {
      this.warning = 'worker.glb 未加载，人员系统暂不可用'
      console.warn('[People]', this.warning)
      return
    }

    // 每个可用模型只算一次动画剖面
    for (const key of Object.keys(bases)) {
      this.profiles[key] = buildProfile(bases[key])
    }

    const rand = mulberry32(20241013)
    let index = 0
    this.modelCount = {}
    for (const zone of ZONES) {
      const alloc = allocationFor(zone)
      for (let i = 0; i < zone.headcount; i += 1) {
        const wantKey = alloc[i]
        const key = bases[wantKey] ? wantKey : 'worker'
        const base = bases[key]
        const prof = this.profiles[key]

        const obj = base.clone(true)
        obj.name = `工人 ${index + 1}`
        const p = sampleInZone(zone, rand)
        obj.position.set(p.x, 0, p.z) // 模型原点在脚下，y=0 即站在地面
        obj.rotation.y = rand() * Math.PI * 2
        obj.traverse((o) => {
          if (!o.isMesh) return
          o.castShadow = true
          o.receiveShadow = true
        })
        const mats = tintWorker(obj, rand)
        obj.visible = this.visible
        this.root.add(obj)

        // 取克隆上的躯干 / 四肢节点（名字一致，克隆后仍在）
        let body = null
        let legL = null
        let legR = null
        let armL = null
        let armR = null
        if (prof.haveLimbs) {
          obj.traverse((o) => {
            switch (o.name) {
              case 'Worker_Body': body = o; break
              case 'Worker_LegL': legL = o; break
              case 'Worker_LegR': legR = o; break
              case 'Worker_ArmL': armL = o; break
              case 'Worker_ArmR': armR = o; break
              default: break
            }
          })
        }
        const haveLimbs = prof.haveLimbs && !!(body && legL && legR && armL && armR)

        this.workers.push({
          obj,
          prof,
          haveLimbs,
          body, legL, legR, armL, armR,
          modelKey: key,
          home: new THREE.Vector3(p.x, 0, p.z),
          homeZone: zone.key,
          state: 'work',
          target: new THREE.Vector3(p.x, 0, p.z),
          phase: rand() * Math.PI * 2,  // 步态相位，随机错开
          phase0: rand() * Math.PI * 2, // 站立晃动相位
          bobSpeed: 1.0 + rand() * 0.7,
          speed: 0, // 实际行进速度（m/s，指数平滑）
          blend: 0, // 站立↔移动混合系数（0=站立，1=移动）
          mats,
        })
        this.modelCount[key] = (this.modelCount[key] || 0) + 1
        index += 1
      }
    }

    // 预分配集合点站位
    this.workers.forEach((w, i) => { w.slot = this._slotFor(i) })
    this.available = true
  }

  get total() {
    return this.workers.length
  }

  // 集合点站位：6 列网格，围绕 ASSEMBLY 居中排布
  _slotFor(i) {
    const col = i % SLOT_COLS
    const row = Math.floor(i / SLOT_COLS)
    const rows = Math.ceil(this.total / SLOT_COLS) || 1
    const x = ASSEMBLY.x - ((SLOT_COLS - 1) * SLOT_SPACING) / 2 + col * SLOT_SPACING
    const z = ASSEMBLY.z - ((rows - 1) * SLOT_SPACING) / 2 + row * SLOT_SPACING
    return new THREE.Vector3(x, 0, z)
  }

  // 设受影响分区：分区内工人立即撤离；传 'all' 表示全场疏散
  setHazard(zoneKeys) {
    const all = zoneKeys === 'all'
    this._hazard = new Set(all ? ZONES.map((z) => z.key) : zoneKeys)
    for (const w of this.workers) {
      const hit = all || this._hazard.has(w.homeZone)
      if (hit && (w.state === 'work' || w.state === 'return')) {
        w.state = 'evac'
        w.target.copy(w.slot)
      }
    }
  }

  // 风险解除：已撤离的工人走回自己的岗位
  returnAll() {
    this._hazard.clear()
    for (const w of this.workers) {
      if (w.state === 'evac' || w.state === 'safe') {
        w.state = 'return'
        w.target.copy(w.home)
      }
    }
  }

  // 恢复默认：所有人瞬回岗位并恢复显示（幂等）
  reset() {
    this._hazard.clear()
    this.setVisible(true)
    for (const w of this.workers) {
      w.state = 'work'
      w.target.copy(w.home)
      w.obj.position.copy(w.home)
      w.obj.position.y = 0
      w.speed = 0
      w.blend = 0
    }
  }

  // 显示 / 隐藏全部工人对象；只影响可见性，人数统计照常反映真实状态
  setVisible(visible) {
    this.visible = !!visible
    for (const w of this.workers) w.obj.visible = this.visible
    return this.visible
  }

  toggleVisible() {
    return this.setVisible(!this.visible)
  }

  update(dt) {
    if (!this.available) return
    const t0 = performance.now()
    this.time += dt
    const t = this.time
    const speedK = 1 - Math.exp(-dt / 0.12)

    for (let i = 0; i < this.workers.length; i += 1) {
      const w = this.workers[i]
      const pos = w.obj.position
      const moving = w.state === 'evac' || w.state === 'return'
      let inst = 0

      if (moving) {
        const dx = w.target.x - pos.x
        const dz = w.target.z - pos.z
        const dist = Math.hypot(dx, dz)
        if (dist < ARRIVE_EPS) {
          pos.x = w.target.x
          pos.z = w.target.z
          w.state = w.state === 'evac' ? 'safe' : 'work'
        } else {
          const step = Math.min(dist, WALK_SPEED * dt * (0.9 + 0.2 * Math.sin(t * 2 + w.phase0)))
          const px = pos.x
          const pz = pos.z
          pos.x += (dx / dist) * step
          pos.z += (dz / dist) * step
          // 朝行进方向转身（模型正面朝 +X）
          const yaw = Math.atan2(-dz, dx)
          w.obj.rotation.y = lerpAngle(w.obj.rotation.y, yaw, 1 - Math.exp(-dt * 8))
          if (dt > 0) inst = Math.hypot(pos.x - px, pos.z - pz) / dt
        }
      }

      // 实际速度，指数平滑
      w.speed += (inst - w.speed) * speedK

      // 站立↔移动混合，smoothstep 缓入缓出
      const targetB = moving ? 1 : 0
      if (w.blend < targetB) w.blend = Math.min(targetB, w.blend + dt / BLEND_TIME)
      else if (w.blend > targetB) w.blend = Math.max(targetB, w.blend - dt / BLEND_TIME)
      const b = w.blend * w.blend * (3 - 2 * w.blend)
      const idle = 1 - b

      // 步频由实际速度 / 腿长推出，步幅≈地面位移，脚不打滑；无四肢的模型也照样推进相位
      const ampFull = LEG_AMP_BASE + LEG_AMP_SPEED * w.speed
      const stride = Math.max(0.35, 2 * w.prof.legLen * Math.sin(Math.min(1.3, ampFull)))
      const omega = Math.PI * (w.speed / stride)
      w.phase += omega * dt

      if (w.haveLimbs) {
        const s = Math.sin(w.phase)
        const legAmp = ampFull * b
        const armAmp = legAmp * ARM_RATIO
        const bias = (ARM_BIAS_BASE + ARM_BIAS_SPEED * w.speed) * b
        const ax = w.prof.swingAxis
        const sg = w.prof.swingSign
        const lx = w.prof.leanAxis
        const ls = w.prof.leanSign
        const r = w.prof.rest

        // 左右腿反相；臂与同侧腿反相，行进时整体前抬
        w.legL.rotation[ax] = r.legL[ax] + sg * legAmp * s + idle * Math.sin(t * 0.8 + w.phase0) * 0.02
        w.legR.rotation[ax] = r.legR[ax] - sg * legAmp * s + idle * Math.sin(t * 0.8 + w.phase0 + 1.7) * 0.02
        w.armL.rotation[ax] = r.armL[ax] + sg * (bias - armAmp * s) + idle * Math.cos(t * 0.7 + w.phase0) * 0.02
        w.armR.rotation[ax] = r.armR[ax] + sg * (bias + armAmp * s) + idle * Math.cos(t * 0.7 + w.phase0 + 1.9) * 0.02

        // 躯干：行进前倾 + 站立微量重心移位
        if (w.body) {
          const lean = (LEAN_BASE + LEAN_SPEED * w.speed) * b
          w.body.rotation[lx] = r.body[lx] + ls * lean + idle * Math.sin(t * 0.6 + w.phase0) * 0.02
        }
      }

      // 上下起伏：站立慢呼吸，移动随步态
      pos.y = Math.sin(t * w.bobSpeed + w.phase0) * 0.012 * idle + Math.abs(Math.sin(w.phase)) * WALK_BOB * b

      // 站立偶发微转
      if (idle > 0) w.obj.rotation.y += Math.sin(t * 0.35 + w.phase0) * 0.0012 * idle
    }

    // 实测每帧耗时
    this.costMs = this.costMs * 0.9 + (performance.now() - t0) * 0.1
  }

  // 连续跑若干帧取平均耗时（ms/帧），供验证脚本读
  benchmark(frames = 120, dt = 1 / 60) {
    if (!this.available) return 0
    const t0 = performance.now()
    for (let i = 0; i < frames; i += 1) this.update(dt)
    return (performance.now() - t0) / frames
  }

  // 面板用：实时人数统计（含模型构成；与显隐无关）
  getStats() {
    let working = 0
    let returning = 0
    let evacuating = 0
    let safe = 0
    const zoneCount = new Map(ZONES.map((z) => [z.key, 0]))
    const modelCount = new Map()

    for (const w of this.workers) {
      modelCount.set(w.modelKey, (modelCount.get(w.modelKey) || 0) + 1)
      if (w.state === 'work') {
        working += 1
        zoneCount.set(w.homeZone, (zoneCount.get(w.homeZone) || 0) + 1)
      } else if (w.state === 'return') returning += 1
      else if (w.state === 'evac') evacuating += 1
      else if (w.state === 'safe') safe += 1
    }

    return {
      total: this.total,
      working,
      returning,
      // 在场只算在岗的；撤离与归位途中都算「疏散中」
      onSite: working,
      evacuating: evacuating + returning,
      evacMoving: evacuating,
      safe,
      visible: this.visible,
      zones: ZONES.map((z) => ({ key: z.key, label: z.label, count: zoneCount.get(z.key) || 0 })),
      models: WORKER_MODELS.map((m) => ({ key: m.key, label: m.label, count: modelCount.get(m.key) || 0 })),
    }
  }
}

// 角度插值（走最短弧）
function lerpAngle(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI
  if (d < -Math.PI) d += Math.PI * 2
  return a + d * k
}

// 动画剖面：从模型里读出腿长 / 摆动轴 / 前倾轴 / 静止姿态

// 建立某模型的动画剖面；子节点缺失时 haveLimbs=false，只做根节点呼吸起伏，不报错
function buildProfile(base) {
  const named = {}
  base.traverse((o) => { if (o.name) named[o.name] = o })
  const body = named.Worker_Body || null
  const legL = named.Worker_LegL || null
  const legR = named.Worker_LegR || null
  const armL = named.Worker_ArmL || null
  const armR = named.Worker_ArmR || null
  const haveLimbs = !!(body && legL && legR && armL && armR)

  let swingAxis = 'x'
  let swingSign = 1
  let legLen = 0.85
  if (legL) legLen = measureLeg(legL)

  const facing = detectFacing(base, legL, body)
  if (haveLimbs) {
    const cal = calibrateSwing(legL, facing)
    swingAxis = cal.axis
    swingSign = cal.sign
  }
  // 前倾轴 = 与朝向垂直的水平轴；符号取「上身倒向行进方向为正」
  const leanAxis = facing.axis === 'x' ? 'z' : 'x'
  const leanSign = (facing.axis === 'x' ? -1 : 1) * facing.sign

  const rest = {}
  for (const [k, n] of [['body', body], ['legL', legL], ['legR', legR], ['armL', armL], ['armR', armR]]) {
    if (n) rest[k] = { x: n.rotation.x, y: n.rotation.y, z: n.rotation.z }
  }

  return { haveLimbs, swingAxis, swingSign, legLen, leanAxis, leanSign, rest, facing }
}

// 腿长（髋关节原点到脚底的距离，m）
function measureLeg(legL) {
  const box = new THREE.Box3().setFromObject(legL)
  const hip = new THREE.Vector3()
  legL.getWorldPosition(hip)
  return Math.max(0.4, hip.y - box.min.y)
}

// 判断模型正面的水平轴：用腿判定（脚朝前伸得更远，腿的包围盒相对髋不对称），
// 可避开手里的镐 / 图纸把躯干包围盒撑歪；腿不明显时退回用躯干。
function detectFacing(base, legL, body) {
  base.updateMatrixWorld(true)

  if (legL) {
    const box = new THREE.Box3().setFromObject(legL)
    const hip = new THREE.Vector3()
    legL.getWorldPosition(hip)
    const dx = (box.max.x - hip.x) - (hip.x - box.min.x)
    const dz = (box.max.z - hip.z) - (hip.z - box.min.z)
    if (Math.max(Math.abs(dx), Math.abs(dz)) > 0.02) {
      if (Math.abs(dx) >= Math.abs(dz)) return { axis: 'x', sign: dx >= 0 ? 1 : -1 }
      return { axis: 'z', sign: dz >= 0 ? 1 : -1 }
    }
  }

  const box = new THREE.Box3().setFromObject(body || base)
  const sx = box.max.x - box.min.x
  const sz = box.max.z - box.min.z
  const axis = sx <= sz ? 'x' : 'z'
  const sign = box.max[axis] >= -box.min[axis] ? 1 : -1
  return { axis, sign }
}

// 自动标定四肢摆动轴：绕 X / Z 各试转一次，取让脚沿朝向轴移动更多的那个；
// 符号取「脚朝前为正」。这样摆动轴放在 X 还是 Z 都不用写死。
function calibrateSwing(legL, facing) {
  legL.updateMatrixWorld(true)
  const rx = legL.rotation.x
  const rz = legL.rotation.z
  legL.rotation.x = 0
  legL.rotation.z = 0
  legL.updateMatrixWorld(true)
  const neutral = boxCenterAxis(legL, facing.axis)

  let best = { axis: 'x', sign: 1, mag: 0 }
  for (const axis of ['x', 'z']) {
    legL.rotation.x = 0
    legL.rotation.z = 0
    legL.rotation[axis] = 0.5
    legL.updateMatrixWorld(true)
    const d = (boxCenterAxis(legL, facing.axis) - neutral) * facing.sign
    if (Math.abs(d) > best.mag) best = { axis, sign: d >= 0 ? 1 : -1, mag: Math.abs(d) }
  }

  legL.rotation.x = rx
  legL.rotation.z = rz
  legL.updateMatrixWorld(true)
  return best
}

// 包围盒在某一轴上的中心坐标
function boxCenterAxis(obj, axis) {
  const box = new THREE.Box3().setFromObject(obj)
  return (box.min[axis] + box.max[axis]) / 2
}

// 克隆工人身上每个材质并轻微上色：安全帽 / 反光背心按材质名上色，工具类保持原色，
// 其余只做细微色相抖动，这样一队人不像盖章盖出来的。
function tintWorker(obj, rand) {
  const helmet = HELMET_COLORS[(rand() * HELMET_COLORS.length) | 0]
  const vest = VEST_COLORS[(rand() * VEST_COLORS.length) | 0]
  const hueShift = (rand() - 0.5) * 0.06
  const mats = []

  obj.traverse((o) => {
    if (!o.isMesh || !o.material) return
    const isArray = Array.isArray(o.material)
    const src = isArray ? o.material : [o.material]
    const out = src.map((m) => {
      const c = m.clone()
      const nm = (m.name || '').toLowerCase()
      const col = c.color
      if (col) {
        if (/helmet|hat|hard|帽|hazard_yellow/.test(nm)) col.set(helmet)
        else if (/vest|reflect|反光|背心|cloth|shirt|suit|衣|machine_orange/.test(nm)) col.set(vest)
        else if (!TOOL_MATERIAL.test(nm)) {
          const hsl = { h: 0, s: 0, l: 0 }
          col.getHSL(hsl)
          col.setHSL((hsl.h + hueShift + 1) % 1, Math.min(1, hsl.s * 1.05), hsl.l)
        }
      }
      return c
    })
    o.material = isArray ? out : out[0]
    mats.push(...out)
  })
  return mats
}
