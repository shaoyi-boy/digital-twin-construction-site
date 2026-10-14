import * as THREE from 'three'

/**
 * 点选拾取
 *
 * 在画面上单击某个模型时，向上找到它所属的整台模型
 * （SiteRoot 的直接子节点，带 label / source 信息），
 * 用一个线框盒高亮，并把结果交给回调去显示信息卡。
 *
 * 只有「按下 → 抬起」几乎没移动时才判定为点选，
 * 否则会和 OrbitControls 的左键拖拽旋转冲突。
 */

const CLICK_MOVE_LIMIT = 6   // 像素：超过就当成拖拽
const CLICK_TIME_LIMIT = 600 // 毫秒

export class Selector {
  /**
   * @param {import('../core/Viewer.js').Viewer} viewer
   * @param {object} options
   * @param {THREE.Object3D} options.root 场景根节点（SiteRoot）
   * @param {Function} [options.onPick] 选中回调，参数是对象或 null
   * @param {Function} [options.isEnabled] 返回 false 时忽略点选（例如漫游模式）
   */
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

  /** 每帧刷新高亮框（挖掘机之类的对象会动，包围盒要跟着走） */
  update() {
    if (this.selected && this.selected.userData?.interactive) {
      this.helper.setFromObject(this.selected)
    }
    return undefined
  }

  /** 主动清除选中 */
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

  /** 射线拾取，返回 SiteRoot 下的整台模型对象 */
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

  /** 沿父级向上找到挂在 SiteRoot 下的那一层 */
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
