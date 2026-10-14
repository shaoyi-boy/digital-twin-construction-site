import * as THREE from 'three'

// 车辆灯光总开关。车灯材质在多个克隆体间共享，所以只改克隆体自己的自发光

// 按 userData.label 找要控灯的车，找不到就跳过
const VEHICLE_LABELS = [
  '挖掘机 1 号（作业）',
  '挖掘机 2 号',
  '挖掘机 3 号',
  '自卸翻斗车 1 号（作业）',
  '水泥搅拌车 1 号',
  '水泥搅拌车 2 号',
  '水泥搅拌车 3 号',
]

// 灯罩材质名
const HEAD_MATERIAL = 'lamp_white'
const TAIL_MATERIAL = 'lamp_red'

// 点亮后的自发光
const HEAD_EMISSIVE = 0xfff0c8 // 暖白
const TAIL_EMISSIVE = 0xff2a1e // 红
const HEAD_INTENSITY = 2.2
const TAIL_INTENSITY = 1.6

// 车前点光源
const POINT_COLOR = 0xfff0c8
const POINT_INTENSITY = 20
const POINT_DISTANCE = 14
const POINT_DECAY = 2

export class VehicleLights {
  // objects 是场景对象列表（SiteBuilder 产出的）
  constructor(objects = []) {
    this.objects = objects
    this.active = false
    this.vehicles = this._collect() // [{ label, obj }]

    this.lampMaterials = [] // 开灯时换上的克隆材质 [{ mesh, original, clone }]
    this.pointLights = [] // 开灯时挂上的点光源
  }

  _collect() {
    const found = []
    for (const label of VEHICLE_LABELS) {
      const obj = this.objects.find((o) => o.userData?.label === label)
      if (obj) found.push({ label, obj })
    }
    return found
  }

  // 找到的车辆名称列表
  get list() {
    return this.vehicles.map((v) => v.label)
  }

  // 调试用统计
  get stats() {
    return {
      vehicles: this.vehicles.length,
      labels: this.list,
      lampMaterials: this.lampMaterials.length,
      pointLights: this.pointLights.length,
      active: this.active,
    }
  }

  toggle() {
    if (this.active) this.off()
    else this.on()
    return this.active
  }

  on() {
    if (this.active) return
    this.active = true
    this.lampMaterials = []
    this.pointLights = []
    for (const { obj } of this.vehicles) this._lightVehicle(obj)
  }

  off() {
    if (!this.active) return
    this.active = false
    // 还回共享材质，释放克隆体
    for (const r of this.lampMaterials) {
      r.mesh.material = r.original
      r.clone?.dispose?.()
    }
    for (const light of this.pointLights) {
      light.removeFromParent()
      light.dispose?.()
    }
    this.lampMaterials = []
    this.pointLights = []
  }

  _lightVehicle(obj) {
    obj.updateWorldMatrix(true, true)

    // 车灯材质克隆后再点亮
    obj.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.material) return
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]

      let changed = false
      const next = list.map((mat) => {
        if (!mat) return mat
        const isHead = mat.name === HEAD_MATERIAL
        const isTail = mat.name === TAIL_MATERIAL
        if (!isHead && !isTail) return mat

        const clone = mat.clone()
        if (clone.emissive) clone.emissive.setHex(isHead ? HEAD_EMISSIVE : TAIL_EMISSIVE)
        clone.emissiveIntensity = isHead ? HEAD_INTENSITY : TAIL_INTENSITY
        this.lampMaterials.push({ mesh, original: mesh.material, clone })
        changed = true
        return clone
      })
      if (changed) mesh.material = next
    })

    // 记下前照灯位置，用来放点光源
    const headSpots = []
    obj.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.material) return
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (list.some((m) => m?.name === HEAD_MATERIAL)) {
        headSpots.push(obj.worldToLocal(mesh.getWorldPosition(new THREE.Vector3())))
      }
    })

    // 最多挂两个点光源，没有前照灯就用包围盒前端兜底
    const spots = this._pickSpots(obj, headSpots)
    for (const p of spots) {
      const light = new THREE.PointLight(POINT_COLOR, POINT_INTENSITY, POINT_DISTANCE, POINT_DECAY)
      light.position.copy(p)
      light.name = 'VehicleLampLight'
      obj.add(light)
      this.pointLights.push(light)
    }
  }

  // 挑最多两个灯位（左右各一更自然），没有就退回包围盒前端
  _pickSpots(obj, headSpots) {
    if (headSpots.length) {
      // 取最左最右两盏当左右前照灯
      const sorted = headSpots.slice().sort((a, b) => a.x - b.x)
      const left = sorted[0].clone()
      left.y += 0.2
      if (sorted.length === 1) return [left]
      const last = sorted[sorted.length - 1]
      const right = last.clone()
      right.y += 0.2
      return [left, right]
    }

    // 兜底：在车头附近估一个点，y 略高于地面
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const local = obj.worldToLocal(center.clone())
    local.y = 1.2
    local.z += 2.0
    return [local]
  }
}
