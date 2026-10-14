import * as THREE from 'three'

/**
 * 车辆灯光
 *
 * 面板上一个总开关，同时点亮 / 熄灭工地上的作业车辆与搅拌车：
 *   挖掘机 1/2/3 号、自卸翻斗车 1 号（作业）、水泥搅拌车 1/2/3 号。
 *
 * 做法（与「断电」风险的思路一致，互不干扰）：
 *   1. 车灯网格的材质名是 lamp_white（前照灯）/ lamp_red（尾灯、警示灯）。
 *      这些材质在多个克隆体之间是共享的，直接改会波及全场同名材质，
 *      所以每个车灯都先 clone 一份，只改克隆体的 emissive / emissiveIntensity。
 *   2. 每辆车再挂 1~2 盏暖白点光源，落在前照灯的位置上（找不到灯就用包围盒前端兜底），
 *      夜里能把车前地面照亮；关闭时全部移除，不留残留。
 *
 * 灯光全部挂在车辆根节点下，车辆被动画驱动时灯会跟着走，状态不受影响。
 */

/** 需要控灯的车辆（按 userData.label 匹配，缺失的直接跳过，绝不报错） */
const VEHICLE_LABELS = [
  '挖掘机 1 号（作业）',
  '挖掘机 2 号',
  '挖掘机 3 号',
  '自卸翻斗车 1 号（作业）',
  '水泥搅拌车 1 号',
  '水泥搅拌车 2 号',
  '水泥搅拌车 3 号',
]

/** 灯罩材质名 */
const HEAD_MATERIAL = 'lamp_white'
const TAIL_MATERIAL = 'lamp_red'

/** 点亮的自发光参数 */
const HEAD_EMISSIVE = 0xfff0c8 // 暖白前照灯
const TAIL_EMISSIVE = 0xff2a1e // 红色尾灯
const HEAD_INTENSITY = 2.2
const TAIL_INTENSITY = 1.6

/** 车前点光源参数 */
const POINT_COLOR = 0xfff0c8
const POINT_INTENSITY = 20
const POINT_DISTANCE = 14
const POINT_DECAY = 2

export class VehicleLights {
  /**
   * @param {THREE.Object3D[]} objects 场景对象列表（SiteBuilder 产出）
   */
  constructor(objects = []) {
    this.objects = objects
    this.active = false
    /** 在场车辆：[{ label, obj }] */
    this.vehicles = this._collect()

    /** 开启时换上的车灯克隆材质：[{ mesh, original, clone }] */
    this.lampMaterials = []
    /** 开启时挂上的点光源 */
    this.pointLights = []
  }

  _collect() {
    const found = []
    for (const label of VEHICLE_LABELS) {
      const obj = this.objects.find((o) => o.userData?.label === label)
      if (obj) found.push({ label, obj })
    }
    return found
  }

  /** 找到的车辆名称列表 */
  get list() {
    return this.vehicles.map((v) => v.label)
  }

  /** 校验 / 调试用：车辆数、克隆材质数、点光源数 */
  get stats() {
    return {
      vehicles: this.vehicles.length,
      labels: this.list,
      lampMaterials: this.lampMaterials.length,
      pointLights: this.pointLights.length,
      active: this.active,
    }
  }

  /** 开关，返回切换后的状态 */
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
    // 还原材质：把原来共享的那份放回去，克隆体释放掉
    for (const r of this.lampMaterials) {
      r.mesh.material = r.original
      r.clone?.dispose?.()
    }
    // 移除点光源
    for (const light of this.pointLights) {
      light.removeFromParent()
      light.dispose?.()
    }
    this.lampMaterials = []
    this.pointLights = []
  }

  /** 单辆车点灯 */
  _lightVehicle(obj) {
    obj.updateWorldMatrix(true, true)

    // 1. 逐个车灯：克隆材质 -> 点亮
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

    // 2. 前照灯位置：用来放点光源
    const headSpots = []
    obj.traverse((mesh) => {
      if (!mesh.isMesh || !mesh.material) return
      const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
      if (list.some((m) => m?.name === HEAD_MATERIAL)) {
        headSpots.push(obj.worldToLocal(mesh.getWorldPosition(new THREE.Vector3())))
      }
    })

    // 3. 挑 1~2 个位置挂暖白点光源；没有前照灯就用包围盒前端兜底
    const spots = this._pickSpots(obj, headSpots)
    for (const p of spots) {
      const light = new THREE.PointLight(POINT_COLOR, POINT_INTENSITY, POINT_DISTANCE, POINT_DECAY)
      light.position.copy(p)
      light.name = 'VehicleLampLight'
      obj.add(light)
      this.pointLights.push(light)
    }
  }

  /** 从候选灯位里挑最多两个（左右各一更自然），没有就退回包围盒前端 */
  _pickSpots(obj, headSpots) {
    if (headSpots.length) {
      // 按世界 X 排序，取最左最右两盏，模拟左右前照灯
      const sorted = headSpots.slice().sort((a, b) => a.x - b.x)
      const left = sorted[0].clone()
      left.y += 0.2
      if (sorted.length === 1) return [left]
      const last = sorted[sorted.length - 1]
      const right = last.clone()
      right.y += 0.2
      return [left, right]
    }

    // 兜底：车头位置估一个点（y 略高于地面）
    const box = new THREE.Box3().setFromObject(obj)
    const center = box.getCenter(new THREE.Vector3())
    const local = obj.worldToLocal(center.clone())
    local.y = 1.2
    local.z += 2.0
    return [local]
  }
}
