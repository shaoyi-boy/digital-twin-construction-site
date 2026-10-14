import * as THREE from 'three'

// 点选拾取：单击时向上找到 SiteRoot 下那一整台，用线框盒高亮并弹信息卡
// 按下到抬起几乎没移动才算点选，否则和 OrbitControls 左键拖拽冲突

const CLICK_MOVE_LIMIT = 6 // 像素，超过算拖拽
const CLICK_TIME_LIMIT = 600 // 毫秒

export class Selector {
  // root 是 SiteRoot；isEnabled 返回 false 时忽略点选（漫游模式靠它屏蔽）
  constructor(viewer, { root, onPick, isEnabled } = {}) {
    this.viewer = viewer
    this.root = root
    this.onPick = onPick
    this.isEnabled = isEnabled || (() => true)

    this.raycaster = new THREE.Raycaster()
    this.pointer = new THREE.Vector2()
    this.selected = null

    this.helper = new THREE.BoxHelper(new THREE.Object3D(), 0x35d0c0)
    this.helper.visible = false
    this.helper.material.depthTest = false
    this.helper.material.transparent = true
    this.helper.material.opacity = 0.9
    this.helper.renderOrder = 999
    viewer.scene.add(this.helper)

    this._down = null
    this._onDown = (e) => this.handleDown(e)
    this._onUp = (e) => this.handleUp(e)
    const el = viewer.renderer.domElement
    el.addEventListener('pointerdown', this._onDown)
    el.addEventListener('pointerup', this._onUp)
  }

  // 会动的对象（挖掘机）包围盒要跟着刷新
  update() {
    if (this.selected && this.selected.userData?.interactive) {
      this.helper.setFromObject(this.selected)
    }
    return undefined
  }

  clear() {
    this.selected = null
    this.helper.visible = false
    this.onPick?.(null)
  }

  handleDown(event) {
    if (event.button !== 0) return
    this._down = { x: event.clientX, y: event.clientY, t: performance.now() }
  }

  handleUp(event) {
    const down = this._down
    this._down = null
    if (!down || event.button !== 0) return
    if (!this.isEnabled()) return

    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
    if (moved > CLICK_MOVE_LIMIT) return
    if (performance.now() - down.t > CLICK_TIME_LIMIT) return

    const hit = this.pick(event.clientX, event.clientY)
    this.selected = hit
    if (hit) {
      this.helper.setFromObject(hit)
      this.helper.visible = true
    } else {
      this.helper.visible = false
    }
    this.onPick?.(hit)
  }

  // 射线拾取，返回 SiteRoot 下的整台模型对象
  pick(clientX, clientY) {
    const rect = this.viewer.renderer.domElement.getBoundingClientRect()
    this.pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    this.raycaster.setFromCamera(this.pointer, this.viewer.camera)

    const hits = this.raycaster.intersectObjects(this.root.children, true)
    for (const hit of hits) {
      const owner = this.ownerOf(hit.object)
      if (owner) return owner
    }
    return null
  }

  // 沿父级向上找到挂在 SiteRoot 下的那一层
  ownerOf(node) {
    let cur = node
    while (cur && cur.parent && cur.parent !== this.root) cur = cur.parent
    return cur && cur.parent === this.root ? cur : null
  }

  dispose() {
    const el = this.viewer.renderer.domElement
    el.removeEventListener('pointerdown', this._onDown)
    el.removeEventListener('pointerup', this._onUp)
    this.helper.geometry?.dispose()
    this.helper.material?.dispose()
    this.helper.removeFromParent()
  }
}
