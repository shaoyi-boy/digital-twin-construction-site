/**
 * 土方作业交互动画
 *
 * 场景里每一台带 interactive 标记的机械都拥有自己独立的时间轴与开关，
 * 控制面板里可以单独启停，也允许多台同时动作（默认全部动起来，
 * 但各自相位错开，不会整齐划一地同步）。
 *
 * 关节约定（Blender 里建模时已把工作姿态烘进顶点，静止转角为 0）：
 *   回转平台 绕 Y 轴（垂直轴）摆动
 *   动臂 / 斗杆 / 铲斗 在竖直平面内绕 Z 轴俯仰
 *   翻斗车车厢 绕 Z 轴（尾部铰点）翻起
 *   搅拌车滚筒 绕自身局部 Z 轴连续旋转（只有这一种是「持续转」，不是循环作业）
 * 因此这里直接改对应节点的 rotation 即可，不需要额外的枢轴补偿。
 */

/** 一个完整作业循环的时长（秒） */
const CYCLE_EXCAVATOR = 20
const CYCLE_TRUCK = 14

/** 搅拌车滚筒的额定转速（弧度 / 秒，取绝对值） */
const MIXER_SPIN = 1.1

/**
 * 滚筒转向：+1 为模型原始方向，−1 为反向。
 * 真实搅拌车搅拌（进料）时滚筒朝一个方向转，卸料时才反转；
 * 现场实拍看原始方向是「反的」（像在往外倒料），所以这里整体取反。
 */
const MIXER_DIR = -1

/**
 * 「一边搅拌一边蠕动」的周期性调速：
 * 每转一圈的角速度围绕额定值做低频起伏，让滚筒不像刚性匀速转，
 * 而像料在里面被带着走、时快时慢。
 *   CREEP_GAIN —— 速度起伏幅度（比例）
 *   CREEP_FREQ —— 起伏频率（rad/s，很慢，约 20s 一个来回）
 */
const MIXER_CREEP_GAIN = 0.22
const MIXER_CREEP_FREQ = 0.32

/** 单台速度倍率的范围 */
const SPEED_MIN = 0.2
const SPEED_MAX = 3.0

const clampSpeed = (v) => Math.min(SPEED_MAX, Math.max(SPEED_MIN, v))

/** 挖掘机关节关键帧，t 为归一化时间 */
const EXC_KEYS = [
  { t: 0.00, yaw: 0.0, boom: 0.00, stick: 0.00, bucket: 0.00 },
  { t: 0.14, yaw: 0.0, boom: -0.06, stick: 0.16, bucket: 0.55 },
  { t: 0.30, yaw: 0.0, boom: 0.34, stick: -0.30, bucket: 0.55 },
  { t: 0.44, yaw: -1.45, boom: 0.36, stick: -0.32, bucket: 0.55 },
  { t: 0.56, yaw: -1.45, boom: 0.36, stick: -0.32, bucket: -0.80 },
  { t: 0.70, yaw: -1.45, boom: 0.28, stick: -0.18, bucket: 0.10 },
  { t: 0.86, yaw: -0.50, boom: 0.10, stick: -0.04, bucket: 0.00 },
  { t: 1.00, yaw: 0.0, boom: 0.00, stick: 0.00, bucket: 0.00 },
]

/** 翻斗车关键帧：bed 为车厢举升角，dirt 为车斗内土的残留比例 */
const TRUCK_KEYS = [
  { t: 0.00, bed: 0.00, dirt: 1.00 },
  { t: 0.30, bed: 0.00, dirt: 1.00 },
  { t: 0.44, bed: 0.95, dirt: 1.00 },
  { t: 0.56, bed: 0.95, dirt: 0.10 },
  { t: 0.78, bed: 0.18, dirt: 0.10 },
  { t: 0.88, bed: 0.00, dirt: 1.00 },
  { t: 1.00, bed: 0.00, dirt: 1.00 },
]

const lerp = (a, b, k) => a + (b - a) * k

/** 在关键帧序列上取样，段内用 smoothstep 过渡，动作更自然 */
function sample(keys, p, fields) {
  const out = {}
  for (let i = 0; i < keys.length - 1; i += 1) {
    const a = keys[i]
    const b = keys[i + 1]
    if (p >= a.t && p <= b.t) {
      const k = b.t === a.t ? 0 : (p - a.t) / (b.t - a.t)
      const e = k * k * (3 - 2 * k)
      for (const f of fields) out[f] = lerp(a[f], b[f], e)
      return out
    }
  }
  const last = keys[keys.length - 1]
  for (const f of fields) out[f] = last[f]
  return out
}

/** 从模型里按名字取出关节节点 */
function collectParts(root) {
  const parts = {}
  root.traverse((child) => {
    if (child.name) parts[child.name] = child
  })
  return parts
}

export class Machines {
  constructor(machines) {
    /** 每台机械：{ key, kind, label, rig, cycle, time, running, speed } */
    this.rigs = []

    for (const obj of machines) {
      const kind = obj.userData?.interactive
      const rig =
        kind === 'excavator' ? buildExcavatorRig(obj)
          : kind === 'truck' ? buildTruckRig(obj)
            : kind === 'mixer' ? buildMixerRig(obj)
              : null
      if (!rig) continue
      this.rigs.push({
        key: `${kind}:${obj.name}`,
        kind,
        label: obj.userData?.label || obj.name,
        short: shortLabel(obj.userData?.label || obj.name),
        rig,
        cycle: kind === 'truck' ? CYCLE_TRUCK : CYCLE_EXCAVATOR,
        time: 0,
        angle: 0, // 搅拌车滚筒累计转角（rad，带正负方向）
        mixerPhase: Math.random() * Math.PI * 2, // 每台滚筒的调速相位错开
        mixerTime: 0, // 搅拌车滚筒的调速计时
        mixerSpeed: 0, // 最近一帧的瞬时转速（rad/s，带方向），供面板 / 调试读取
        running: true,
        speed: 1, // 该台的速度倍率（0.2× ~ 3×），只缩放时间、不改相位
      })
    }

    // 相位错开：几台同类机械不会同时抬手、同时卸土
    this.rigs.forEach((r, i) => {
      r.time = (i * 0.37) % 1
    })

    this.apply()
  }

  /** 场景里是否有可驱动的机械 */
  get available() {
    return this.rigs.length > 0
  }

  /** 控制面板用：每台机械的 键 / 名称 / 是否在动 / 速度倍率 */
  get list() {
    return this.rigs.map((r) => ({
      key: r.key,
      kind: r.kind,
      label: r.label,
      short: r.short,
      running: r.running,
      speed: r.speed,
      // 搅拌车滚筒的累计转角（rad）与瞬时转速（rad/s，含方向），供面板/调试读取
      drumAngle: r.kind === 'mixer' ? r.angle : undefined,
      mixerSpeed: r.kind === 'mixer' ? r.mixerSpeed : undefined,
    }))
  }

  get runningCount() {
    return this.rigs.filter((r) => r.running).length
  }

  /** 单台启停 */
  toggle(key) {
    const rig = this.rigs.find((r) => r.key === key)
    if (!rig) return
    rig.running = !rig.running
    this.apply()
    return rig.running
  }

  /**
   * 设定单台的速度倍率（0.2× ~ 3×）。
   * 倍率只作用于 update 里的时间步长，因此改变倍率不会重置或跳变当前相位。
   */
  setSpeed(key, v) {
    const rig = this.rigs.find((r) => r.key === key)
    if (!rig) return
    rig.speed = clampSpeed(v)
    return rig.speed
  }

  /** 一台也不停 */
  startAll() {
    for (const r of this.rigs) r.running = true
    this.apply()
  }

  /** 全部停下（停在当前姿态） */
  stopAll() {
    for (const r of this.rigs) r.running = false
    this.apply()
  }

  update(dt) {
    let dirty = false
    for (const r of this.rigs) {
      if (!r.running) continue
      // 每台用各自的速度倍率缩放时间步长，多台互不影响
      const d = dt * r.speed
      if (r.kind === 'mixer') {
        // 真实搅拌：以额定转速反向转动，同时叠加一个很慢的周期性调速，
        // 于是滚筒「一边搅拌一边轻微蠕动」，不再像刚性匀速转。
        r.mixerTime += d
        const mod = 1 + MIXER_CREEP_GAIN * Math.sin(r.mixerTime * MIXER_CREEP_FREQ + r.mixerPhase)
        r.mixerSpeed = MIXER_SPIN * MIXER_DIR * mod
        r.angle += d * r.mixerSpeed
      } else {
        r.time = (r.time + d / r.cycle) % 1
      }
      dirty = true
    }
    if (dirty) this.apply()
  }

  /** 把各台机械的姿态写到关节上 */
  apply() {
    for (const r of this.rigs) {
      if (r.kind === 'excavator') applyExcavator(r.rig, r.time)
      else if (r.kind === 'truck') applyTruck(r.rig, r.time)
      else if (r.kind === 'mixer') applyMixer(r.rig, r.angle)
    }
  }

  /** 全部停在某一姿态（用于初始化展示 / 调试） */
  poseAt(t) {
    const p = ((t % 1) + 1) % 1
    for (const r of this.rigs) r.time = p
    this.apply()
  }
}

/** 面板按钮用的短名：去掉括号备注，「挖掘机」→「挖机」，「水泥搅拌车」→「搅拌车」 */
function shortLabel(label) {
  return label
    .replace(/（[^）]*）/g, '')
    .replace(/^挖掘机/, '挖机')
    .replace(/^自卸翻斗车/, '翻斗车')
    .replace(/^水泥搅拌车/, '搅拌车')
}

function applyExcavator(rig, t) {
  const s = sample(EXC_KEYS, t, ['yaw', 'boom', 'stick', 'bucket'])
  rig.house.rotation.y = s.yaw
  rig.boom.rotation.z = s.boom
  rig.stick.rotation.z = s.stick
  rig.bucket.rotation.z = s.bucket
}

function applyTruck(rig, t) {
  const s = sample(TRUCK_KEYS, t, ['bed', 'dirt'])
  rig.bed.rotation.z = s.bed
  if (rig.dirt) rig.dirt.scale.y = Math.max(0.02, s.dirt)
}

/** 搅拌车：滚筒绕自身 Z 轴持续旋转，角度由 update 累加 */
function applyMixer(rig, angle) {
  rig.drum.rotation.z = angle
}

function buildExcavatorRig(root) {
  const p = collectParts(root)
  const house = p.Excavator_House
  const boom = p.Excavator_Boom
  const stick = p.Excavator_Stick
  const bucket = p.Excavator_Bucket
  if (!house || !boom || !stick || !bucket) {
    console.warn('[Machines] 挖掘机关节节点缺失', Object.keys(p))
    return null
  }
  return { root, house, boom, stick, bucket }
}

function buildTruckRig(root) {
  const p = collectParts(root)
  const bed = p.DumpTruck_Bed
  if (!bed) {
    console.warn('[Machines] 翻斗车车厢节点缺失', Object.keys(p))
    return null
  }
  return { root, bed, dirt: p.DumpTruck_Dirt || null }
}

/** 搅拌车：滚筒节点固定叫 Mixer_Drum，缺失就跳过（不报错） */
function buildMixerRig(root) {
  const p = collectParts(root)
  const drum = p.Mixer_Drum
  if (!drum) {
    console.warn('[Machines] 搅拌车滚筒节点 Mixer_Drum 缺失', Object.keys(p))
    return null
  }
  return { root, drum }
}
