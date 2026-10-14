import * as THREE from 'three'
import { ZONES, zoneByKey } from './zones.js'

// 风险模拟（失火 / 断电 / 机械故障）与处置措施，动效由主循环 update(dt) 驱动。
// 风险可同时开，关掉时把现场还原到开启前，不留残留网格或材质。

// 路灯标识，要和 SiteBuilder 生成的对象一致
const LAMP_SOURCE = 'lamp_post.glb'
const LAMP_LABEL = '路灯'
const LAMP_MATERIAL = 'lamp_white'

// 要停机的机械（Machines 里的 label）和它所在分区
const MACHINE_LABEL = '挖掘机 1 号（作业）'
const MACHINE_ZONE = 'material'

const RISK_DEFS = [
  { key: 'fire', label: '失火' },
  { key: 'power', label: '断电' },
  { key: 'machine', label: '机械故障' },
]

const MEASURE_DEFS = [
  { key: 'plan', label: '启动应急预案' },
  { key: 'evac', label: '广播疏散' },
  { key: 'spray', label: '消防灭火' },
  { key: 'powercut', label: '切断电源' },
  { key: 'cordon', label: '警戒隔离' },
]

// 蔓延顺序：仓库(起火点)→材料堆场→塔吊区→主体结构
const FIRE_CHAIN = ['warehouse', 'material', 'crane', 'structure']
// 相邻分区引燃间隔，秒（没受处置影响时）
const FIRE_INTERVAL = 6
// 火势从起燃到满强度的时间，秒
const FIRE_RAMP = 4
// 火势衰减速率，每秒
const FIRE_DECAY = 0.075
// 水枪启动后多久明火停止蔓延，秒
const SPRAY_STOP_AFTER = 3
// 四排路灯逐排熄灭，每排间隔，秒
const REGION_INTERVAL = 1.0
// 单个火场分区升温上限 °C，乘火势强度得升幅
const FIRE_HEAT_PER_ZONE = 45

const LAMP_REGION_ORDER = ['east', 'south', 'west', 'north']

export class Risks {
  constructor(viewer, { root, machines } = {}) {
    this.viewer = viewer
    this.root = root
    this.machines = machines

    this.time = 0
    this.activeMap = { fire: false, power: false, machine: false }
    // key -> { update, dispose, meshCount }
    this.effects = new Map()
    // 面板状态文案
    this.notes = { fire: '', power: '', machine: '' }
    // 每种风险新增的网格数，调试用
    this.stats = { fire: 0, power: 0, machine: 0 }

    // 处置措施状态
    this.measureMap = new Map(MEASURE_DEFS.map((d) => [d.key, { ...d, active: false }]))

    // 失火运行时数据
    this._fire = null
    // key -> 起火分区的可视化记录
    this._fireVisuals = new Map()
    // 蔓延记录，at 是点燃时刻，秒
    this.spreadLog = []
    // 当前火场分区快照
    this.fireZones = []
    this._fireHeatTotal = 0

    // 断电，风险和处置共用
    this._powerFx = null

    // 机械故障
    this._machineFx = null

    // 自动展开处置措施的计时与已展开集合
    this._fireElapsed = 0
    this._autoApplied = new Set()
    this.fireExtinguished = false
  }

  // 面板：风险清单
  get list() {
    return RISK_DEFS.map((d) => ({
      key: d.key,
      label: d.label,
      active: !!this.activeMap[d.key],
    }))
  }

  // 面板：处置措施清单
  get measures() {
    return MEASURE_DEFS.map((d) => ({ key: d.key, label: d.label, active: this.measureMap.get(d.key).active }))
  }

  get anyActive() {
    return RISK_DEFS.some((d) => this.activeMap[d.key])
  }

  // 面板状态行：当前激活的风险和处置说明
  get statusText() {
    const parts = RISK_DEFS.filter((d) => this.activeMap[d.key])
      .map((d) => this.notes[d.key])
      .filter(Boolean)
    const measures = this.measures.filter((m) => m.active).map((m) => m.label)
    const seg = []
    if (parts.length) seg.push(parts.join('；'))
    if (measures.length) seg.push(`处置：${measures.join(' / ')}`)
    return seg.length ? seg.join('　|　') : '当前无风险，工地运行正常'
  }

  // 当前受影响的分区 key 列表（火场 / 全场断电 / 故障机械分区）
  get hazardZones() {
    const set = new Set()
    if (this.activeMap.fire) {
      for (const z of this.fireZones) if (z.intensity > 0.05) set.add(z.key)
    }
    if (this._wantPower()) for (const z of ZONES) set.add(z.key)
    if (this.activeMap.machine) set.add(MACHINE_ZONE)
    return [...set]
  }

  // 火场热浪总强度 0~1，供曝光 / 雾色叠加
  get fireHeat() {
    return Math.min(1, this._fireHeatTotal * 0.4)
  }

  // 各分区因火升高的温度 °C：{ zoneKey: 升幅 }
  get zoneHeat() {
    const m = {}
    for (const z of this.fireZones) m[z.key] = z.intensity * FIRE_HEAT_PER_ZONE
    return m
  }

  // 火势蔓延明细
  get spread() {
    return this.spreadLog.map((s) => ({ ...s }))
  }

  // 风险开关
  // 切换某个风险，返回切换后的状态
  toggle(kind) {
    if (!(kind in this.activeMap)) return false
    if (this.activeMap[kind]) this._deactivate(kind)
    else this._activate(kind)
    return this.activeMap[kind]
  }

  // 全部解除：风险 + 处置措施一起复位，现场还原
  clear() {
    for (const { key } of RISK_DEFS) {
      if (this.activeMap[key]) this._deactivate(key)
    }
    for (const d of MEASURE_DEFS) {
      const m = this.measureMap.get(d.key)
      if (m.active) {
        m.active = false
        this._disableMeasure(d.key)
      }
    }
    this._reconcilePower()
  }

  // 处置措施
  // 切换某个处置措施，返回切换后的状态
  toggleMeasure(key) {
    const m = this.measureMap.get(key)
    if (!m) return false
    m.active = !m.active
    if (m.active) this._enableMeasure(key)
    else this._disableMeasure(key)
    this._reconcilePower()
    return m.active
  }

  _enableMeasure(key) {
    if (key === 'plan') this.notes.measures = '已启动应急预案，成立现场处置小组'
    if (key === 'evac') this.notes.measures = '已广播疏散，人员按预案撤往集合点'
  }

  _disableMeasure(key) {
    if (key === 'spray') this._clearZoneAttachments('spray')
    if (key === 'cordon') this._clearZoneAttachments('cordon')
  }

  // 清掉火场分区上挂载的某类处置附件
  _clearZoneAttachments(kind) {
    for (const v of this._fireVisuals.values()) {
      const a = v[kind]
      if (a?.group) {
        a.group.removeFromParent()
        for (const d of a.disposables || []) d.dispose?.()
      }
      v[kind] = null
    }
  }

  // 主循环
  update(dt) {
    this.time += dt
    for (const fx of this.effects.values()) fx.update?.(dt)

    if (this.activeMap.fire) this._updateFire(dt)

    // 断电和「切断电源」共用一套停电效果，每帧对账
    this._reconcilePower()
  }

  // 开启 / 关闭
  _activate(kind) {
    if (this.activeMap[kind]) return
    if (kind === 'power') {
      // 断电效果由 _reconcilePower 建，这里只翻状态
      this.activeMap.power = true
      this._reconcilePower()
      return
    }
    const fx = kind === 'fire' ? this._createFire() : this._createMachine()
    this.effects.set(kind, fx)
    this.stats[kind] = fx?.meshCount || 0
    this.activeMap[kind] = true
  }

  _deactivate(kind) {
    if (kind === 'power') {
      this.activeMap.power = false
      this.stats.power = 0
      this.notes.power = ''
      this._reconcilePower()
      return
    }
    const fx = this.effects.get(kind)
    if (fx) {
      fx.dispose?.()
      this.effects.delete(kind)
    }
    // 解除失火时撤销自动展开的处置，手动开启的保留
    if (kind === 'fire') this._standDownFireMeasures()
    this.activeMap[kind] = false
    this.stats[kind] = 0
    this.notes[kind] = ''
  }

  _standDownFireMeasures() {
    for (const key of ['plan', 'evac', 'cordon', 'spray', 'powercut']) {
      if (!this._autoApplied.has(key)) continue
      const m = this.measureMap.get(key)
      if (m && m.active) {
        m.active = false
        this._disableMeasure(key)
      }
    }
    this._autoApplied.clear()
    this._reconcilePower()
  }

  // 失火
  _createFire() {
    const self = this
    this._fireHeatTotal = 0
    this.spreadLog = []
    this.fireZones = []
    this.fireExtinguished = false
    this._fireElapsed = 0
    this._autoApplied.clear()
    this._fire = { nextIndex: 1, since: 0, stopped: false, sprayTime: 0, extinguished: false }

    // 起火点：仓库内
    this._igniteZone(FIRE_CHAIN[0])
    this.notes.fire = `失火：${zoneByKey(FIRE_CHAIN[0])?.label || '仓库内'} 起火`

    return {
      meshCount: 0, // 分区会动态增加，网格数按需统计
      update: (dt) => { this._autoFireMeasures(dt) },
      dispose: () => this._disposeFire(),
    }
  }

  // 失火后自动展开处置的时刻，秒：7 / 11 / 15 / 19 / 23
  _autoFireMeasures(dt) {
    this._fireElapsed += dt
    const schedule = [
      { t: 7, key: 'plan' },
      { t: 11, key: 'evac' },
      { t: 15, key: 'cordon' },
      { t: 19, key: 'spray' },
      { t: 23, key: 'powercut' },
    ]
    for (const s of schedule) {
      if (this._fireElapsed >= s.t && !this._autoApplied.has(s.key)) {
        this._autoApplied.add(s.key)
        const m = this.measureMap.get(s.key)
        if (m && !m.active) {
          m.active = true
          this._enableMeasure(s.key)
          this._reconcilePower()
        }
      }
    }
  }

  _updateFire(dt) {
    const f = this._fire
    if (!f) return

    const sprayActive = this.measureMap.get('spray').active
    const planActive = this.measureMap.get('plan').active
    if (!f.extinguished) {
      // 水枪一开就停蔓延；预案把速度压到 0.6×
      const factor = sprayActive ? 0 : planActive ? 0.6 : 1
      if (!f.stopped) {
        f.since += dt * factor
        if (f.nextIndex < FIRE_CHAIN.length && f.since >= FIRE_INTERVAL) {
          f.since = 0
          this._igniteZone(FIRE_CHAIN[f.nextIndex])
          f.nextIndex += 1
        }
      }
      if (sprayActive) {
        f.sprayTime += dt
        if (f.sprayTime >= SPRAY_STOP_AFTER && !f.stopped) {
          f.stopped = true
          this.notes.fire = '消防灭火展开，火势已停止向相邻区域蔓延'
        }
      }
    }

    // 逐分区推进火势并刷新视觉
    const extinguishing = f.stopped || sprayActive
    let total = 0
    for (const [key, v] of this._fireVisuals) {
      const t = this.time
      if (extinguishing) {
        v.intensity = Math.max(0, v.intensity - dt * FIRE_DECAY)
      } else {
        v.intensity = Math.min(1, v.intensity + dt / FIRE_RAMP)
      }
      v.age += dt
      animateZoneFire(v, t, dt, extinguishing)
      this._updateZoneAttachments(key, v)
      total += v.intensity
    }
    this._fireHeatTotal = total
    this.fireZones = [...this._fireVisuals].map(([key, v]) => ({
      key,
      label: v.zone.label,
      intensity: v.intensity,
    }))

    if (!f.extinguished && extinguishing && total < 0.05) {
      f.extinguished = true
      this.notes.fire = '明火已扑灭，现场余烟与蒸汽待散'
    }
    // 网格数按实际渲染的分区统计
    this.stats.fire = this._countFireMeshes()
  }

  // 点燃分区：建火焰 / 烟雾 / 烟柱 / 警戒环 / 火光
  _igniteZone(key) {
    const zone = zoneByKey(key)
    if (!zone || this._fireVisuals.has(key)) return
    const v = buildZoneFire(zone, this.viewer.scene)
    this._fireVisuals.set(key, v)
    this.spreadLog.push({ key, label: zone.label, at: Number(this.time.toFixed(2)) })
    // 蔓延时刷新状态文案
    if (this.spreadLog.length > 1) {
      const chain = this.spreadLog.map((s) => s.label).join(' → ')
      this.notes.fire = `失火蔓延：${chain}（第 ${this.spreadLog.length} 个分区）`
    }
  }

  _countFireMeshes() {
    let n = 0
    for (const v of this._fireVisuals.values()) {
      v.group.traverse((o) => { if (o.isMesh) n += 1 })
      if (v.spray?.group) v.spray.group.traverse((o) => { if (o.isMesh) n += 1 })
    }
    return n
  }

  // 每帧按处置状态挂好水枪和警戒锥
  _updateZoneAttachments(key, v) {
    const sprayOn = this.measureMap.get('spray').active
    const cordonOn = this.measureMap.get('cordon').active

    if (sprayOn && !v.spray) v.spray = buildSpray(v.zone, v.group)
    if (!sprayOn && v.spray) {
      v.spray.group.removeFromParent()
      for (const d of v.spray.disposables) d.dispose?.()
      v.spray = null
    }
    if (v.spray) animateSpray(v.spray, this.time)

    if (cordonOn && !v.cordon) v.cordon = buildCordon(v.zone, v.group)
    if (!cordonOn && v.cordon) {
      v.cordon.group.removeFromParent()
      for (const d of v.cordon.disposables) d.dispose?.()
      v.cordon = null
    }
  }

  _disposeFire() {
    this._clearZoneAttachments('spray')
    this._clearZoneAttachments('cordon')
    for (const v of this._fireVisuals.values()) {
      v.group.removeFromParent()
      for (const d of v.disposables) d.dispose?.()
    }
    this._fireVisuals.clear()
    this._fire = null
    this.fireZones = []
    this._fireHeatTotal = 0
    this.notes.fire = ''
  }

  // 断电
  // 断电风险和切断电源任一开启就需要停电效果
  _wantPower() {
    return this.activeMap.power || this.measureMap.get('powercut').active
  }

  // 按需创建 / 销毁停电效果（幂等）
  _reconcilePower() {
    const want = this._wantPower()
    if (want && !this._powerFx) {
      this._powerFx = this._createBlackout()
      this.effects.set('power', this._powerFx)
      this.stats.power = this._powerFx.meshCount
    } else if (!want && this._powerFx) {
      this._powerFx.dispose?.()
      this._powerFx = null
      if (!this.activeMap.power) this.effects.delete('power')
      this.stats.power = 0
    }
    if (want) {
      this.notes.power = `断电：${this._powerFx?.lampCount ?? 0} 盏路灯按 东→南→西→北 逐排熄灭，应急灯已点亮`
    }
  }

  _createBlackout() {
    // 1. 收集路灯，按方位归入四排
    const regions = { east: [], south: [], west: [], north: [] }
    this.root?.traverse((o) => {
      if (o.name === LAMP_LABEL && o.userData?.source === LAMP_SOURCE) {
        regions[lampRegion(o.position)].push(o)
      }
    })
    const lampCount = LAMP_REGION_ORDER.reduce((n, r) => n + regions[r].length, 0)

    // 2. 灯头材质换克隆体，初始仍亮，运行时按排熄灭
    const restoreMeshes = []
    const cloned = []
    const clonedByRegion = { east: [], south: [], west: [], north: [] }
    for (const region of LAMP_REGION_ORDER) {
      for (const lamp of regions[region]) {
        lamp.traverse((m) => {
          if (!m.isMesh || !m.material) return
          const list = Array.isArray(m.material) ? m.material : [m.material]
          let changed = false
          const next = list.map((mat) => {
            if (mat && mat.name === LAMP_MATERIAL) {
              const clone = mat.clone()
              cloned.push(clone)
              clonedByRegion[region].push(clone)
              changed = true
              return clone
            }
            return mat
          })
          if (changed) {
            restoreMeshes.push({ mesh: m, original: m.material })
            m.material = next
          }
        })
      }
    }

    // 3. 记录环境照明原值，停电时压低
    const lightRestore = []
    this.viewer.scene.traverse((o) => {
      if (o.isHemisphereLight || o.isAmbientLight) {
        lightRestore.push({ light: o, intensity: o.intensity })
      }
    })

    // 4. 应急灯：几个关键点位各一盏冷白灯
    const emgGroup = new THREE.Group()
    emgGroup.name = 'EmergencyLights'
    this.viewer.scene.add(emgGroup)
    const emgSpots = [[-39, 4, 50], [46, 3.4, 6], [44, 3.6, -9], [35, 3.4, -24]]
    const emgLights = []
    for (const [x, y, z] of emgSpots) {
      const l = new THREE.PointLight(0xdfeaff, 0, 22, 2)
      l.position.set(x, y, z)
      emgGroup.add(l)
      emgLights.push(l)
    }

    let progress = 0 // 0~1，四排依次熄灭
    const self = this

    return {
      meshCount: 0,
      lampCount,
      update: (dt) => {
        progress = Math.min(1, progress + dt / (REGION_INTERVAL * LAMP_REGION_ORDER.length))
        // 各排在各自时间片内熄灭
        LAMP_REGION_ORDER.forEach((region, i) => {
          const phase = Math.min(1, Math.max(0, progress * LAMP_REGION_ORDER.length - i))
          for (const c of clonedByRegion[region]) {
            if (c.emissive) c.emissive.setRGB(0, 0, 0)
            c.emissiveIntensity = 1 - phase
          }
        })
        // 环境照明随进度降到 45%
        for (const l of lightRestore) l.light.intensity = l.intensity * (1 - 0.55 * progress)
        // 全灭后应急灯亮起，带轻微闪烁
        const em = Math.max(0, (progress - 0.75) / 0.25)
        const flick = 0.85 + 0.15 * Math.sin(self.time * 7)
        for (const l of emgLights) l.intensity = em * 22 * flick
      },
      dispose: () => {
        for (const r of restoreMeshes) r.mesh.material = r.original
        for (const c of cloned) c.dispose()
        for (const l of lightRestore) l.light.intensity = l.intensity
        emgGroup.removeFromParent()
      },
    }
  }

  // 机械故障
  _createMachine() {
    const rig = this.machines?.rigs?.find((r) => r.label === MACHINE_LABEL)
    if (!rig) {
      this.notes.machine = '机械故障：未找到挖掘机 1 号（作业）'
      return { meshCount: 0, update: () => {}, dispose: () => {} }
    }

    const prevRunning = rig.running
    rig.running = false

    const rootObj = rig.rig.root
    rootObj.updateWorldMatrix(true, true)
    const box = new THREE.Box3().setFromObject(rootObj)
    const center = box.getCenter(new THREE.Vector3())

    const disposables = []
    let meshCount = 0

    // 机顶红色闪烁信标
    const beaconGroup = new THREE.Group()
    const topWorld = new THREE.Vector3(center.x, box.max.y + 0.9, center.z)
    beaconGroup.position.copy(rootObj.worldToLocal(topWorld.clone()))
    rootObj.add(beaconGroup)

    const beaconGeo = new THREE.SphereGeometry(0.32, 12, 10)
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff2b1f, transparent: true, opacity: 0.95 })
    disposables.push(beaconGeo, beaconMat)
    beaconGroup.add(new THREE.Mesh(beaconGeo, beaconMat))
    meshCount += 1

    const beaconLight = new THREE.PointLight(0xff2b1f, 0, 16, 2)
    beaconGroup.add(beaconLight)

    // 发动机处灰白蒸汽
    const steamGroup = new THREE.Group()
    const engineWorld = new THREE.Vector3(center.x, box.min.y + 1.5, center.z)
    steamGroup.position.copy(rootObj.worldToLocal(engineWorld.clone()))
    rootObj.add(steamGroup)

    const steamGeo = new THREE.SphereGeometry(0.3, 8, 6)
    disposables.push(steamGeo)
    const steams = []
    for (let i = 0; i < 5; i += 1) {
      const mat = new THREE.MeshBasicMaterial({ color: 0xc9ccd2, transparent: true, opacity: 0, depthWrite: false })
      disposables.push(mat)
      const mesh = new THREE.Mesh(steamGeo, mat)
      steamGroup.add(mesh)
      meshCount += 1
      steams.push({
        mesh,
        mat,
        t: i / 5,
        speed: 0.5 + Math.random() * 0.3,
        sx: (Math.random() - 0.5) * 0.5,
        sz: (Math.random() - 0.5) * 0.5,
      })
    }

    // 机旁「检修中」牌 + 警戒锥，直接用世界坐标摆放
    const marker = new THREE.Group()
    marker.name = 'MachineFaultMarker'
    this.viewer.scene.add(marker)
    const sign = buildSign('检修中', 0xff3b30)
    sign.texture && disposables.push(sign.texture)
    disposables.push(...sign.parts)
    sign.group.position.set(center.x + 4.6, 0, center.z + 2.4)
    marker.add(sign.group)
    meshCount += sign.parts.filter((p) => p.isMesh).length

    const coneGroup = new THREE.Group()
    marker.add(coneGroup)
    const coneProto = new THREE.ConeGeometry(0.3, 0.75, 12)
    const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.8 })
    disposables.push(coneProto, coneMat)
    const cones = []
    for (let i = 0; i < 6; i += 1) {
      const c = new THREE.Mesh(coneProto, coneMat)
      c.position.set(center.x + 5.5 + (i % 3) * 1.6, 0.375, center.z - 2.6 + Math.floor(i / 3) * 1.8)
      c.castShadow = true
      coneGroup.add(c)
      cones.push(c)
      meshCount += 1
    }

    this.notes.machine = '机械故障：挖掘机 1 号（作业）已停机检修，现场已布设警戒'

    const fx = {
      meshCount,
      update: (dt) => {
        const t = this.time
        const blink = 0.5 + 0.5 * Math.sin(t * 7)
        beaconMat.opacity = 0.35 + 0.6 * blink
        beaconLight.intensity = blink * 2.4
        for (const s of steams) {
          s.t += dt * s.speed
          if (s.t > 1) s.t -= 1
          const p = s.t
          s.mesh.position.set(s.sx * p * 3, p * 2.6, s.sz * p * 3)
          const sc = 0.5 + p * 1.8
          s.mesh.scale.set(sc, sc, sc)
          s.mat.opacity = Math.sin(p * Math.PI) * 0.5
        }
      },
      dispose: () => {
        beaconGroup.removeFromParent()
        steamGroup.removeFromParent()
        marker.removeFromParent()
        rig.running = prevRunning
        for (const d of disposables) d.dispose?.()
      },
    }
    return fx
  }
}

// 火场分区可视化

// 分区外接矩形，用来定火焰 / 警戒环 / 水枪的范围
function zoneExtent(zone) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity
  for (const [cx, cz, hx, hz] of zone.rects) {
    minX = Math.min(minX, cx - hx); maxX = Math.max(maxX, cx + hx)
    minZ = Math.min(minZ, cz - hz); maxZ = Math.max(maxZ, cz + hz)
  }
  return {
    cx: (minX + maxX) / 2,
    cz: (minZ + maxZ) / 2,
    hx: (maxX - minX) / 2,
    hz: (maxZ - minZ) / 2,
  }
}

// 建一个起火分区的全部可视化对象
function buildZoneFire(zone, scene) {
  const ext = zoneExtent(zone)
  const radius = Math.min(9, Math.max(2.6, Math.min(ext.hx, ext.hz) * 0.6))

  const group = new THREE.Group()
  group.name = `FireZone_${zone.key}`
  group.position.set(ext.cx, 0, ext.cz)
  scene.add(group)

  const disposables = []
  const rand = mulberry32(hashKey(zone.key))

  // 火焰：一圈自发光锥体
  const flameGeo = new THREE.ConeGeometry(0.5, 1.5, 6, 1, true)
  disposables.push(flameGeo)
  const flameColors = [0xffd24d, 0xff9b1e, 0xff3b1f, 0xfff0a6]
  const flames = []
  const flameCount = 8
  for (let i = 0; i < flameCount; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: flameColors[i % flameColors.length],
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
    disposables.push(mat)
    const mesh = new THREE.Mesh(flameGeo, mat)
    const ang = (i / flameCount) * Math.PI * 2 + rand() * 0.5
    const r = radius * (0.2 + rand() * 0.7)
    mesh.position.set(Math.cos(ang) * r, 0.7, Math.sin(ang) * r)
    const base = 0.6 + rand() * 0.9
    mesh.scale.set(base, base * (0.8 + rand() * 0.9), base)
    mesh.rotation.z = (rand() - 0.5) * 0.4
    group.add(mesh)
    flames.push({ mesh, mat, phase: rand() * Math.PI * 2, speed: 5 + rand() * 4, base })
  }

  // 烟雾
  const smokeGeo = new THREE.SphereGeometry(0.5, 8, 6)
  disposables.push(smokeGeo)
  const smokes = []
  for (let i = 0; i < 6; i += 1) {
    const mat = new THREE.MeshBasicMaterial({ color: 0x5a5a5e, transparent: true, opacity: 0, depthWrite: false })
    disposables.push(mat)
    const mesh = new THREE.Mesh(smokeGeo, mat)
    group.add(mesh)
    smokes.push({
      mesh, mat, t: i / 6, speed: 0.35 + rand() * 0.25,
      sx: (rand() - 0.5) * 0.8, sz: (rand() - 0.5) * 0.8,
    })
  }

  // 烟柱
  const plumeGeo = new THREE.ConeGeometry(0.9, 10, 8, 1, true)
  const plumeMat = new THREE.MeshBasicMaterial({
    color: 0x30303a, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide,
  })
  disposables.push(plumeGeo, plumeMat)
  const plume = new THREE.Mesh(plumeGeo, plumeMat)
  plume.position.set(0, 6.2, 0)
  group.add(plume)

  // 地面警戒环，半径随分区大小
  const ringGeo = new THREE.RingGeometry(radius * 0.75, radius * 1.35, 40)
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0xff2b1f, transparent: true, opacity: 0.5, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending,
  })
  disposables.push(ringGeo, ringMat)
  const ring = new THREE.Mesh(ringGeo, ringMat)
  ring.rotation.x = -Math.PI / 2
  ring.position.y = 0.08
  group.add(ring)

  // 闪烁火光
  const light = new THREE.PointLight(0xff5522, 0, 30, 2)
  light.position.set(0, 2.4, 0)
  group.add(light)

  return {
    zone, group, flames, smokes, plume, plumeMat, ring, ringMat, light,
    riskRadius: radius, disposables, intensity: 0, age: 0, spray: null, cordon: null,
  }
}

// 每帧推进分区火势视觉，intensity 是 0~1 的火势强度
function animateZoneFire(v, t, dt, extinguishing) {
  const k = v.intensity
  for (const f of v.flames) {
    const flick = 0.75 + 0.25 * Math.sin(t * f.speed + f.phase) + 0.08 * Math.sin(t * f.speed * 2.7 + f.phase)
    const s = f.base * (0.4 + 0.6 * k)
    f.mesh.scale.set(s, s * flick * (0.6 + 0.8 * k), s)
    f.mat.opacity = (0.25 + 0.65 * k) * (0.5 + 0.4 * flick)
    f.mesh.rotation.y = t * 0.6 + f.phase
    f.mesh.visible = k > 0.03
  }
  for (const s of v.smokes) {
    s.t += dt * s.speed
    if (s.t > 1) s.t -= 1
    const p = s.t
    s.mesh.position.set(s.sx * p * 3, 1.2 + p * 6.5, s.sz * p * 3)
    const sc = 0.6 + p * 2.0
    s.mesh.scale.set(sc, sc, sc)
    // 明火衰减后烟雾加浓（余烟），处置时白烟偏多
    s.mat.opacity = Math.sin(p * Math.PI) * (0.4 * (0.4 + 0.6 * k) + (extinguishing ? 0.12 : 0))
    s.mat.color.setRGB(0.35 + (1 - k) * 0.4, 0.35 + (1 - k) * 0.4, 0.36 + (1 - k) * 0.4)
  }
  const blink = 0.5 + 0.5 * Math.sin(t * 6)
  v.plume.rotation.y = t * 0.3
  v.plumeMat.opacity = (0.08 + 0.22 * k) * (0.85 + 0.15 * Math.sin(t * 1.7))
  v.plume.visible = k > 0.03
  v.light.intensity = k * (1.2 + blink * 2.6)
  v.ringMat.opacity = 0.14 + 0.5 * k + 0.12 * blink
  v.ring.scale.setScalar(0.9 + 0.1 * k)
}

// 处置附件：水枪 / 警戒锥

// 灭火：火场上空架几股水柱 + 落地点蒸汽
function buildSpray(zone, group) {
  const ext = zoneExtent(zone)
  const radius = Math.min(9, Math.max(2.6, Math.min(ext.hx, ext.hz) * 0.6))
  const rand = mulberry32(hashKey(zone.key) + 7)
  const g = new THREE.Group()
  g.name = `Spray_${zone.key}`
  group.add(g)
  const disposables = []

  const jetGeo = new THREE.ConeGeometry(0.22, 4.2, 8, 1, true)
  const steamGeo = new THREE.SphereGeometry(0.35, 8, 6)
  disposables.push(jetGeo, steamGeo)
  const jets = []
  const steams = []
  for (let i = 0; i < 5; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0x9ad4ff, transparent: true, opacity: 0.35, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    })
    disposables.push(mat)
    const mesh = new THREE.Mesh(jetGeo, mat)
    const ang = (i / 5) * Math.PI * 2
    const r = radius * (0.3 + rand() * 0.5)
    mesh.position.set(Math.cos(ang) * r, 2.1, Math.sin(ang) * r)
    mesh.rotation.z = (rand() - 0.5) * 0.5
    g.add(mesh)
    jets.push({ mesh, mat, phase: rand() * Math.PI * 2 })

    const smat = new THREE.MeshBasicMaterial({ color: 0xf2f6fa, transparent: true, opacity: 0, depthWrite: false })
    disposables.push(smat)
    const smesh = new THREE.Mesh(steamGeo, smat)
    smesh.position.set(Math.cos(ang) * r, 0.5, Math.sin(ang) * r)
    g.add(smesh)
    steams.push({ mesh: smesh, mat: smat, t: rand(), speed: 0.6 + rand() * 0.4 })
  }
  return { group: g, jets, steams, disposables }
}

function animateSpray(spray, t) {
  for (const j of spray.jets) {
    const pul = 0.8 + 0.2 * Math.sin(t * 9 + j.phase)
    j.mesh.scale.set(pul, 1 + 0.15 * Math.sin(t * 7 + j.phase), pul)
    j.mat.opacity = 0.22 + 0.18 * (0.5 + 0.5 * Math.sin(t * 8 + j.phase))
  }
  for (const s of spray.steams) {
    s.t += 0.01
    if (s.t > 1) s.t -= 1
    const p = s.t
    const sc = 0.5 + p * 1.8
    s.mesh.scale.set(sc, sc, sc)
    s.mesh.position.y = 0.3 + p * 2.6
    s.mat.opacity = Math.sin(p * Math.PI) * 0.45
  }
}

// 警戒隔离：沿火场外圈摆一圈警戒锥
function buildCordon(zone, group) {
  const ext = zoneExtent(zone)
  const radius = Math.min(9, Math.max(2.6, Math.min(ext.hx, ext.hz) * 0.6)) * 1.5
  const g = new THREE.Group()
  g.name = `Cordon_${zone.key}`
  group.add(g)
  const disposables = []
  const coneGeo = new THREE.ConeGeometry(0.28, 0.7, 12)
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, roughness: 0.85 })
  disposables.push(coneGeo, coneMat)
  const n = 12
  for (let i = 0; i < n; i += 1) {
    const ang = (i / n) * Math.PI * 2
    const c = new THREE.Mesh(coneGeo, coneMat)
    c.position.set(Math.cos(ang) * radius, 0.35, Math.sin(ang) * radius)
    c.castShadow = true
    g.add(c)
  }
  return { group: g, disposables }
}

// 小工具

// 「检修中」立牌：一根杆 + 一块画板（CanvasTexture）
function buildSign(text, color) {
  const parts = []
  const group = new THREE.Group()
  group.name = 'SignBoard'

  const poleGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.9, 8)
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ad, roughness: 0.7 })
  const pole = new THREE.Mesh(poleGeo, poleMat)
  pole.position.y = 0.95
  pole.castShadow = true
  group.add(pole)
  parts.push(poleGeo, poleMat)

  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 128
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, 256, 128)
  ctx.strokeStyle = '#' + color.toString(16).padStart(6, '0')
  ctx.lineWidth = 10
  ctx.strokeRect(5, 5, 246, 118)
  ctx.fillStyle = '#' + color.toString(16).padStart(6, '0')
  ctx.font = 'bold 64px "Microsoft YaHei", sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, 128, 68)
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true

  const boardGeo = new THREE.PlaneGeometry(1.4, 0.7)
  const boardMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide })
  const board = new THREE.Mesh(boardGeo, boardMat)
  board.position.set(0, 2.1, 0)
  group.add(board)
  parts.push(boardGeo, boardMat)

  return { group, parts, texture: tex }
}

// 路灯所在方位，断电按排熄灭用
function lampRegion(p) {
  if (Math.abs(p.x) > Math.abs(p.z)) return p.x > 0 ? 'east' : 'west'
  return p.z > 0 ? 'south' : 'north'
}

// 字符串 → 稳定整数种子
function hashKey(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// 固定种子的伪随机
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
