import * as THREE from 'three'

// 时间环境：天空、雾、光照、曝光、背景色，以及四个时间预设之间的平滑过渡。
// 工地本体（110×110 场地与道路）是 Blender 里做好的模型，这里只负责让它随一天的时间变亮变暗。

// 光源（太阳 / 月亮）到场景中心的距离，决定阴影投射的远近
const TRAVEL = 200

// 过渡时长，秒
const DURATION = 0.8

// 用「方位角(度)+仰角(度)」描述光源方向，再换算成世界坐标。
// 方位角 90° → +X（东），270° → -X（西），0° → +Z（南）
function dirPos(azDeg, elevDeg, dist = TRAVEL) {
  const az = THREE.MathUtils.degToRad(azDeg)
  const el = THREE.MathUtils.degToRad(elevDeg)
  const h = Math.cos(el) * dist
  return new THREE.Vector3(Math.sin(az) * h, Math.sin(el) * dist, Math.cos(az) * h)
}

const PRESETS = [
  {
    key: 'dawn',
    label: '清晨',
    clock: '06:00',
    temp: '16 °C',
    tempC: 16,
    sun: { az: 95, elev: 12, color: 0xffb066, intensity: 2.6 }, // 低悬东侧，暖橙
    moon: { az: 0, elev: 60, color: 0x8fb0ff, intensity: 0 },
    hemi: { sky: 0xa9c4e6, ground: 0x6a5c4b, intensity: 0.85 },
    fog: { color: 0xd9c4a6, density: 0.0021 }, // 晨雾
    exposure: 1.0,
    sky: { top: 0x4a6ea8, bottom: 0xe6c39a },
    bg: 0xd9c4a6,
  },
  {
    key: 'noon',
    label: '正午',
    clock: '12:00',
    temp: '34 °C',
    tempC: 34,
    sun: { az: 170, elev: 68, color: 0xfff6e8, intensity: 3.0 }, // 高照，近白
    moon: { az: 0, elev: 60, color: 0x8fb0ff, intensity: 0 },
    hemi: { sky: 0xcfe3ff, ground: 0x8a8272, intensity: 1.15 },
    fog: { color: 0xcfe0f0, density: 0.0011 }, // 通透
    exposure: 1.05,
    sky: { top: 0x3f74c4, bottom: 0xdbe6f0 },
    bg: 0xcfe0f0,
  },
  {
    key: 'dusk',
    label: '夜晚',
    clock: '18:00',
    temp: '21 °C',
    tempC: 21,
    sun: { az: 265, elev: 10, color: 0xff7a3c, intensity: 2.4 }, // 低垂西侧，深橙红
    moon: { az: 0, elev: 60, color: 0x8fb0ff, intensity: 0 },
    hemi: { sky: 0xffb98a, ground: 0x4a3b30, intensity: 0.7 },
    fog: { color: 0xd8a071, density: 0.0023 }, // 暖霾
    exposure: 1.0,
    sky: { top: 0x2a3f74, bottom: 0xf0a566 },
    bg: 0xd8a071,
  },
  {
    key: 'midnight',
    label: '凌晨',
    clock: '00:00',
    temp: '9 °C',
    tempC: 9,
    sun: { az: 265, elev: -18, color: 0x8fb0ff, intensity: 0.0 }, // 落到地平线以下
    moon: { az: 40, elev: 58, color: 0x9fc0ff, intensity: 0.55 }, // 冷蓝月光
    hemi: { sky: 0x2b4470, ground: 0x141b2a, intensity: 0.35 },
    fog: { color: 0x0b1726, density: 0.0031 }, // 夜色蓝
    exposure: 0.85,
    sky: { top: 0x050b18, bottom: 0x101f36 },
    bg: 0x0a1526,
  },
]

// easeInOutCubic：起步慢、中间快、收尾慢
function easeInOut(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
}

class TimeEnvironment {
  constructor(viewer) {
    this.viewer = viewer
    const { scene } = viewer

    // 雾，指数雾，密度随预设变化
    scene.fog = new THREE.FogExp2(0xcfe0f0, 0.0011)

    // 天空球 + 兜底地面
    this.sky = createSkyDome()
    scene.add(this.sky)
    scene.add(createFallbackGround())

    // 光照
    // 天光：给暗部补一点环境色，避免阴影里死黑
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x8a8272, 1.15)
    this.hemi.position.set(0, 60, 0)
    scene.add(this.hemi)

    // 主光：太阳，负责投影
    this.sun = new THREE.DirectionalLight(0xfff6e8, 3.0)
    this.sun.position.copy(dirPos(170, 68))
    this.sun.castShadow = true
    this.sun.shadow.mapSize.set(2048, 2048)
    this.sun.shadow.bias = -0.0006
    this.sun.shadow.normalBias = 0.02

    const extent = 72 // 阴影相机覆盖范围，能罩住整个场地
    const cam = this.sun.shadow.camera
    cam.left = -extent
    cam.right = extent
    cam.top = extent
    cam.bottom = -extent
    cam.near = 1
    cam.far = 420
    cam.updateProjectionMatrix()

    scene.add(this.sun)
    scene.add(this.sun.target)
    this.sun.target.position.set(0, 0, 0)

    // 月光：凌晨专用的冷蓝平行光，不投影，默认 0
    this.moon = new THREE.DirectionalLight(0x9fc0ff, 0)
    this.moon.position.copy(dirPos(40, 58))
    scene.add(this.moon)
    scene.add(this.moon.target)
    this.moon.target.position.set(0, 0, 0)

    this.presets = PRESETS
    this.activeKey = 'noon'
    this.duration = DURATION
    // 过渡动画状态：{ from, to, elapsed }
    this.anim = null

    // 火场「热浪」叠加层 0~1：不影响预设本身，只在其结果上再叠一层曝光 + 暖雾
    this.heat = 0
    this.heatFog = new THREE.Color(0xff8a4a)
    // 基准曝光 / 雾色（时间预设算出来的值），供热浪层复用
    this._baseExposure = 1.05
    this._baseFogColor = new THREE.Color(0xcfe0f0)

    // 初始直接落到正午
    this._write(this._targetFrom(PRESETS.find((p) => p.key === 'noon')))
  }

  // 面板用：预设清单
  get list() {
    return this.presets.map((p) => ({ key: p.key, label: p.label }))
  }

  // 当前时钟 / 温度文案
  get statusText() {
    const p = this.presets.find((x) => x.key === this.activeKey)
    return `当前 ${p.clock}　·　${p.temp}`
  }

  // 当前预设的气温（°C），「人员」面板里的基础气温用它
  get temperatureC() {
    const p = this.presets.find((x) => x.key === this.activeKey)
    return p?.tempC ?? 0
  }

  // 设火场热浪强度 0~1：只叠在时间预设的曝光 / 雾色之上，不改变预设本身
  setHeat(v) {
    this.heat = Math.min(1, Math.max(0, v))
  }

  // 切时间预设，默认 0.8 秒平滑过渡
  setTimePreset(key, duration = this.duration) {
    const preset = this.presets.find((p) => p.key === key)
    if (!preset) return
    this.activeKey = key

    const to = this._targetFrom(preset)
    if (duration <= 0) {
      this.anim = null
      this._write(to)
      return
    }
    this.anim = { from: this._read(), to, elapsed: 0, duration }
  }

  // 每帧推进过渡，由 viewer.onUpdate 调用
  update(dt) {
    const a = this.anim
    if (a) {
      a.elapsed += dt
      const t = Math.min(a.elapsed / a.duration, 1)
      const e = easeInOut(t)

      const f = a.from
      const g = a.to

      this.sun.position.lerpVectors(f.sunPos, g.sunPos, e)
      this.sun.color.copy(f.sunColor).lerp(g.sunColor, e)
      this.sun.intensity = f.sunIntensity + (g.sunIntensity - f.sunIntensity) * e

      this.moon.position.lerpVectors(f.moonPos, g.moonPos, e)
      this.moon.color.copy(f.moonColor).lerp(g.moonColor, e)
      this.moon.intensity = f.moonIntensity + (g.moonIntensity - f.moonIntensity) * e

      this.hemi.color.copy(f.hemiSky).lerp(g.hemiSky, e)
      this.hemi.groundColor.copy(f.hemiGround).lerp(g.hemiGround, e)
      this.hemi.intensity = f.hemiIntensity + (g.hemiIntensity - f.hemiIntensity) * e

      const fog = this.viewer.scene.fog
      fog.color.copy(f.fogColor).lerp(g.fogColor, e)
      fog.density = f.fogDensity + (g.fogDensity - f.fogDensity) * e

      this.viewer.renderer.toneMappingExposure = f.exposure + (g.exposure - f.exposure) * e

      const u = this.sky.material.uniforms
      u.topColor.value.copy(f.skyTop).lerp(g.skyTop, e)
      u.bottomColor.value.copy(f.skyBottom).lerp(g.skyBottom, e)
      this.viewer.scene.background.copy(f.bg).lerp(g.bg, e)

      // 记下「基准」值（不含热浪叠加），供热浪层每帧重算，避免累积漂移
      this._baseExposure = this.viewer.renderer.toneMappingExposure
      this._baseFogColor.copy(fog.color)

      if (t >= 1) {
        this.anim = null
        this._write(g)
      }
    }

    // 热浪层每帧都要重算，时间预设动画结束后照样生效
    this._applyHeat()
  }

  // 把火场热浪叠在预设结果之上：曝光抬升 + 雾色偏暖
  _applyHeat() {
    const h = this.heat
    this.viewer.renderer.toneMappingExposure = this._baseExposure * (1 + h * 0.14)
    const fog = this.viewer.scene.fog
    fog.color.copy(this._baseFogColor).lerp(this.heatFog, h * 0.35)
  }

  // 内部：读写状态

  // 预设 → 一份完整的目标状态
  _targetFrom(p) {
    return {
      sunPos: dirPos(p.sun.az, p.sun.elev),
      sunColor: new THREE.Color(p.sun.color),
      sunIntensity: p.sun.intensity,
      moonPos: dirPos(p.moon.az, p.moon.elev),
      moonColor: new THREE.Color(p.moon.color),
      moonIntensity: p.moon.intensity,
      hemiSky: new THREE.Color(p.hemi.sky),
      hemiGround: new THREE.Color(p.hemi.ground),
      hemiIntensity: p.hemi.intensity,
      fogColor: new THREE.Color(p.fog.color),
      fogDensity: p.fog.density,
      exposure: p.exposure,
      skyTop: new THREE.Color(p.sky.top),
      skyBottom: new THREE.Color(p.sky.bottom),
      bg: new THREE.Color(p.bg),
    }
  }

  // 读当前实际状态，作为过渡起点
  _read() {
    const fog = this.viewer.scene.fog
    const u = this.sky.material.uniforms
    return {
      sunPos: this.sun.position.clone(),
      sunColor: this.sun.color.clone(),
      sunIntensity: this.sun.intensity,
      moonPos: this.moon.position.clone(),
      moonColor: this.moon.color.clone(),
      moonIntensity: this.moon.intensity,
      hemiSky: this.hemi.color.clone(),
      hemiGround: this.hemi.groundColor.clone(),
      hemiIntensity: this.hemi.intensity,
      fogColor: fog.color.clone(),
      fogDensity: fog.density,
      exposure: this.viewer.renderer.toneMappingExposure,
      skyTop: u.topColor.value.clone(),
      skyBottom: u.bottomColor.value.clone(),
      bg: (this.viewer.scene.background || new THREE.Color()).clone(),
    }
  }

  // 把一份状态写进各个对象
  _write(s) {
    this.sun.position.copy(s.sunPos)
    this.sun.color.copy(s.sunColor)
    this.sun.intensity = s.sunIntensity

    this.moon.position.copy(s.moonPos)
    this.moon.color.copy(s.moonColor)
    this.moon.intensity = s.moonIntensity

    this.hemi.color.copy(s.hemiSky)
    this.hemi.groundColor.copy(s.hemiGround)
    this.hemi.intensity = s.hemiIntensity

    const fog = this.viewer.scene.fog
    fog.color.copy(s.fogColor)
    fog.density = s.fogDensity

    this.viewer.renderer.toneMappingExposure = s.exposure

    const u = this.sky.material.uniforms
    u.topColor.value.copy(s.skyTop)
    u.bottomColor.value.copy(s.skyBottom)

    if (!this.viewer.scene.background) this.viewer.scene.background = new THREE.Color()
    this.viewer.scene.background.copy(s.bg)

    // 记录基准曝光 / 雾色（不含热浪叠加），供热浪层复用
    this._baseExposure = s.exposure
    this._baseFogColor.copy(s.fogColor)
  }
}

// 渐变天空球：顶部深蓝过渡到地平线浅灰
function createSkyDome() {
  const geometry = new THREE.SphereGeometry(760, 32, 18)
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3f74c4) },
      bottomColor: { value: new THREE.Color(0xdbe6f0) },
      offset: { value: 40.0 },
      exponent: { value: 0.7 },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        float t = pow(max(h, 0.0), exponent);
        gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
      }
    `,
  })

  const sky = new THREE.Mesh(geometry, material)
  sky.name = 'SkyDome'
  sky.frustumCulled = false
  return sky
}

// 场地外的兜底地面，高度压到 -0.1，藏在场地模型下方，只在场地之外露出来
function createFallbackGround() {
  const geometry = new THREE.PlaneGeometry(1600, 1600)
  geometry.rotateX(-Math.PI / 2)

  const material = new THREE.MeshStandardMaterial({
    color: 0x8d8a80,
    roughness: 1.0,
    metalness: 0.0,
  })

  const ground = new THREE.Mesh(geometry, material)
  ground.name = 'FallbackGround'
  ground.position.y = -0.1
  ground.receiveShadow = true
  return ground
}

// 建立环境并返回带 API 的控制器
export function setupEnvironment(viewer) {
  return new TimeEnvironment(viewer)
}
