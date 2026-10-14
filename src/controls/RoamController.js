import * as THREE from 'three'
import { Octree } from 'three/addons/math/Octree.js'
import { Capsule } from 'three/addons/math/Capsule.js'

/**
 * 第一人称漫游控制器
 *
 * 移动用「加速度 + 阻尼」而不是直接把速度设成目标值，
 * 起步和刹停都有一点惯性，走起来更像人。
 *
 * 碰撞用 three.js 自带的八叉树 + 胶囊体：
 * 把整个场地塞进 Octree，每帧拿玩家的胶囊去求交，
 * 拿到法线和穿透深度后再把胶囊推回去，顺便实现「贴着墙滑」。
 */

/** 重力加速度，比真实值大一些，手感更跟脚 */
const GRAVITY = 26
/** 视点高度（米） */
const EYE_HEIGHT = 1.68
/** 玩家碰撞胶囊半径 */
const PLAYER_RADIUS = 0.35
/** 地面 / 空中的水平加速度，空中控制力弱一些 */
const ACCEL_GROUND = 34
const ACCEL_AIR = 8
/** 按住 Shift 的冲刺倍率 */
const SPRINT_SCALE = 1.9
/** 鼠标灵敏度（弧度/像素） */
const LOOK_SENSITIVITY = 0.0022
/** 水平速度上限，防止冲刺时越跑越快 */
const MAX_HORIZONTAL_SPEED = 22
/** 俯仰角限制，留一点余量避免万向锁 */
const PITCH_LIMIT = Math.PI / 2 - 0.06

export class RoamController {
  /**
   * @param {import('../core/Viewer.js').Viewer} viewer
   * @param {object} options
   * @param {THREE.Object3D} options.siteRoot 场景根节点，用来建碰撞世界
   * @param {number[]} [options.spawn] 出生点 [x, y, z]
   * @param {number} [options.yaw] 出生朝向（绕 Y 轴弧度，0 = 朝 -Z）
   * @param {Function} [options.onStateChange] 状态变化回调，用来刷新界面
   */
  constructor(viewer, { siteRoot, spawn = [0, 0.5, 0], yaw = 0, onStateChange } = {}) {
    this.viewer = viewer
    this.camera = viewer.camera
    this.domElement = viewer.renderer.domElement
    this.onStateChange = onStateChange

    this.active = false
    this.onFloor = false
    this.keys = Object.create(null)
    this.velocity = new THREE.Vector3()
    this.yaw = yaw
    this.pitch = 0
    this.savedView = null

    this.spawn = new THREE.Vector3(spawn[0], spawn[1], spawn[2])
    this.capsule = new Capsule(
      new THREE.Vector3(),
      new THREE.Vector3(),
      PLAYER_RADIUS
    )

    this.octree = buildCollisionWorld(viewer, siteRoot)

    // 事件都存成实例属性，dispose 时才能准确移除
    this._onKeyDown = (e) => this.handleKey(e, true)
    this._onKeyUp = (e) => this.handleKey(e, false)
    this._onMouseMove = (e) => this.handleMouseMove(e)
    this._onPointerLockChange = () => this.onStateChange?.(this)

    window.addEventListener('keydown', this._onKeyDown)
    window.addEventListener('keyup', this._onKeyUp)
    document.addEventListener('mousemove', this._onMouseMove)
    document.addEventListener('pointerlockchange', this._onPointerLockChange)
  }

  /** 指针是否已被锁定（锁定中鼠标才不会跑出浏览器） */
  get isLocked() {
    return document.pointerLockElement === this.domElement
  }

  // ------------------------------------------------------------------
  // 进出漫游模式
  // ------------------------------------------------------------------
  enter() {
    if (this.active) return
    this.active = true

    // 记住俯瞰视角，退出时好还原
    this.savedView = {
      position: this.camera.position.clone(),
      target: this.viewer.controls.target.clone(),
    }
    this.viewer.controls.enabled = false
    this.camera.rotation.order = 'YXZ'

    this.respawn()
    this.lockPointer()
    this.onStateChange?.(this)
  }

  exit() {
    if (!this.active) return
    this.active = false

    this.unlockPointer()
    this.viewer.controls.enabled = true

    if (this.savedView) {
      this.camera.position.copy(this.savedView.position)
      this.viewer.controls.target.copy(this.savedView.target)
      this.viewer.controls.update()
    }
    this.onStateChange?.(this)
  }

  /** 回到出生点并清空速度 */
  respawn() {
    this.velocity.set(0, 0, 0)
    this.capsule.start.set(this.spawn.x, this.spawn.y + PLAYER_RADIUS, this.spawn.z)
    this.capsule.end.set(this.spawn.x, this.spawn.y + EYE_HEIGHT, this.spawn.z)
    this.camera.position.copy(this.capsule.end)
    this.camera.rotation.set(this.pitch, this.yaw, 0)
  }

  lockPointer() {
    if (this.isLocked) return
    // 新版浏览器返回 Promise，用户按 Esc 拒绝时会 reject，这里忽略即可
    const result = this.domElement.requestPointerLock?.()
    if (result && typeof result.catch === 'function') result.catch(() => {})
  }

  unlockPointer() {
    if (this.isLocked) document.exitPointerLock()
  }

  // ------------------------------------------------------------------
  // 每帧更新
  // ------------------------------------------------------------------
  update(dt) {
    if (!this.active) return

    // ---- 1. 水平方向：朝相机朝向加速 ----
    const forward = this.forwardVector()
    const right = this.rightVector()
    const sprint = this.keys.ShiftLeft || this.keys.ShiftRight ? SPRINT_SCALE : 1
    const accel = (this.onFloor ? ACCEL_GROUND : ACCEL_AIR) * sprint * dt

    if (this.keys.KeyW || this.keys.ArrowUp) this.velocity.addScaledVector(forward, accel)
    if (this.keys.KeyS || this.keys.ArrowDown) this.velocity.addScaledVector(forward, -accel)
    if (this.keys.KeyD || this.keys.ArrowRight) this.velocity.addScaledVector(right, accel)
    if (this.keys.KeyA || this.keys.ArrowLeft) this.velocity.addScaledVector(right, -accel)

    // ---- 2. 阻尼 + 重力 ----
    // 在地面上不再累加重力，靠阻尼把速度自然收干，避免速度无限往下堆
    let damping = Math.exp(-4 * dt) - 1
    if (!this.onFloor) {
      this.velocity.y -= GRAVITY * dt
      damping *= 0.1
    }
    this.velocity.addScaledVector(this.velocity, damping)

    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z)
    if (horizontalSpeed > MAX_HORIZONTAL_SPEED) {
      const k = MAX_HORIZONTAL_SPEED / horizontalSpeed
      this.velocity.x *= k
      this.velocity.z *= k
    }

    // ---- 3. 位移，再用碰撞结果修正 ----
    this.capsule.translate(this.velocity.clone().multiplyScalar(dt))
    this.resolveCollisions()

    // ---- 4. 相机跟随胶囊顶部 ----
    this.camera.position.copy(this.capsule.end)
    this.camera.rotation.set(this.pitch, this.yaw, 0)

    // 万一掉出场地，拉回出生点
    if (this.capsule.end.y < -30) this.respawn()
  }

  /** 把胶囊推回到不穿模的位置，并更新「是否站在地上」 */
  resolveCollisions() {
    const result = this.octree.capsuleIntersect(this.capsule)
    this.onFloor = false
    if (!result) return

    this.onFloor = result.normal.y > 0

    if (!this.onFloor) {
      // 撞到墙：消掉速度在法线方向的分量 —— 这样是「贴着墙滑」而不是被弹开
      this.velocity.addScaledVector(result.normal, -result.normal.dot(this.velocity))
    }
    if (result.depth > 1e-8) {
      this.capsule.translate(result.normal.multiplyScalar(result.depth))
    }
  }

  // ------------------------------------------------------------------
  // 输入
  // ------------------------------------------------------------------
  /** 只取水平分量：抬头低头不应该影响走路方向 */
  forwardVector(target = new THREE.Vector3()) {
    return target.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw))
  }

  rightVector(target = new THREE.Vector3()) {
    return target.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw))
  }

  handleKey(event, pressed) {
    if (!this.active) return
    this.keys[event.code] = pressed

    // 方向键和空格默认会滚动页面，漫游时拦掉
    if (pressed && (event.code === 'Space' || event.code.startsWith('Arrow'))) {
      event.preventDefault()
    }
  }

  handleMouseMove(event) {
    if (!this.active || !this.isLocked) return
    this.yaw -= event.movementX * LOOK_SENSITIVITY
    this.pitch -= event.movementY * LOOK_SENSITIVITY
    this.pitch = Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, this.pitch))
  }

  dispose() {
    window.removeEventListener('keydown', this._onKeyDown)
    window.removeEventListener('keyup', this._onKeyUp)
    document.removeEventListener('mousemove', this._onMouseMove)
    document.removeEventListener('pointerlockchange', this._onPointerLockChange)
  }
}

/**
 * 建立碰撞世界。
 *
 * 注意 Octree.fromGraphNode() 内部会直接 build 一次，重复调用会把已有的
 * 三角面分配打乱，所以这里用一个分组把「场地」和「隐形地板」包在一起，一次建完。
 *
 * 大门的两扇蓝门是开合动画件：建碰撞世界前先暂时摘下来，建完再原样挂回。
 * 否则「关门」姿态会在门口留一堵看不见的墙，把玩家永久挡在大门外。
 */
function buildCollisionWorld(viewer, siteRoot) {
  const root = new THREE.Group()
  root.name = 'CollisionRoot'

  // 摘下两扇门（只影响这一帧的碰撞烘焙，随后立刻还原）
  const leaves = []
  if (siteRoot) {
    siteRoot.traverse((o) => {
      if (o.name === 'SiteGate_LeafL' || o.name === 'SiteGate_LeafR') {
        leaves.push({ o, parent: o.parent })
      }
    })
  }
  for (const { o, parent } of leaves) parent.remove(o)

  if (siteRoot) root.add(siteRoot)

  // 场地外的隐形地板：围挡有大门的缺口，防止走出去之后无限下坠
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(200, 2, 200),
    new THREE.MeshBasicMaterial()
  )
  floor.name = 'CollisionFloor'
  floor.visible = false
  floor.position.y = -1.1 // 顶面落在 y = -0.1，和兜底地面齐平
  root.add(floor)

  viewer.scene.add(root)
  const octree = new Octree().fromGraphNode(root)

  // 门扇原样挂回（局部变换不变），渲染不受影响
  for (const { o, parent } of leaves) parent.add(o)
  return octree
}
