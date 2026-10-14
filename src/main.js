import * as THREE from 'three'
import { Viewer } from './core/Viewer.js'
import { AssetLoader } from './core/AssetLoader.js'
import { setupEnvironment } from './scene/Environment.js'
import { SiteBuilder } from './scene/SiteBuilder.js'
import { Machines } from './scene/Machines.js'
import { Crane } from './scene/Crane.js'
import { SiteGate } from './scene/SiteGate.js'
import { VehicleLights } from './scene/VehicleLights.js'
import { Views } from './scene/Views.js'
import { Risks } from './scene/Risks.js'
import { People, MODEL_FILES as WORKER_MODEL_FILES } from './scene/People.js'
import { RoamController } from './controls/RoamController.js'
import { Selector } from './controls/Selector.js'
import { Hud } from './ui/Hud.js'
import { MODEL_FILES, ROAM_SPAWN } from './config/layout.js'
import { getObjectInfo } from './config/info.js'

const els = {
  canvas: document.getElementById('viewport'),
  loading: document.getElementById('loading'),
  fill: document.getElementById('loading-fill'),
  text: document.getElementById('loading-text'),
}

async function bootstrap() {
  const hud = new Hud()

  const viewer = new Viewer(els.canvas)
  const env = setupEnvironment(viewer)

  // 时间环境：4 个时刻预设，点一下平滑过渡，默认正午
  hud.renderTimeButtons(env.list, (key) => {
    env.setTimePreset(key)
    hud.setTimeState(env.activeKey, env.statusText)
  })
  hud.setTimeState(env.activeKey, env.statusText)
  viewer.onUpdate((dt) => env.update(dt))

  // 加载模型，进度条按已完成个数走
  const loader = new AssetLoader((loaded, total) => {
    const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0
    els.fill.style.width = `${pct}%`
    els.text.textContent = `${loaded} / ${total}　${pct}%`
  })

  hud.setStatus(`正在加载模型（0/${MODEL_FILES.length}）…`)
  await loader.loadAll(MODEL_FILES)

  // 按平面布置表把模型摆进场地，再按实际包围盒自动取景
  const builder = new SiteBuilder(viewer, loader)
  const objects = builder.build()
  if (objects.length) viewer.frameBounds(builder.getBounds())

  hud.renderObjectList(objects)
  hud.setStatus(`已加载 ${MODEL_FILES.length} 个模型，场景中共 ${objects.length} 个对象`)

  // 车辆灯光：总开关控制作业车辆与搅拌车的前照灯 / 点光源
  const vehicleLights = new VehicleLights(objects)
  hud.bindVehicleLights(() => {
    const on = vehicleLights.toggle()
    hud.setVehicleLightState(on)
  })
  hud.setVehicleLightState(vehicleLights.active)

  // 仓库室内补两盏暖光点光源，漫游进去也看得清
  const warehouse = objects.find((o) => o.userData?.label === '临时仓库')
  if (warehouse) {
    for (const dx of [-5.2, 5.2]) {
      const lamp = new THREE.PointLight(0xfff0d8, 26, 20, 2)
      lamp.position.set(warehouse.position.x + dx, 3.6, warehouse.position.z + 1.2)
      builder.root.add(lamp)
    }
  }

  // 视角切换：自动取景后的机位记为「默认视角」
  const views = new Views(viewer)
  views.setHomeFromCamera()
  viewer.onUpdate((dt) => views.update(dt))

  // 土方机械动画：每台一个开关 + 一个速度倍率，可同时动
  const machines = new Machines(builder.machines)
  if (machines.available) {
    viewer.onUpdate((dt) => machines.update(dt))
    hud.buildAnimButtons(machines.list, {
      onToggle: (key) => {
        machines.toggle(key)
        hud.setAnimState(machines.list)
      },
      // 速度倍率只改快慢，不重置相位、不影响启停
      onSpeed: (key, v) => machines.setSpeed(key, v),
    })
  } else {
    hud.buildAnimButtons([], { onToggle: () => {}, onSpeed: () => {} })
  }

  // 塔吊：回转 + 小车变幅 + 吊钩升降，共用一条 update 缓动，
  // 三个动作可同时进行，各有速度倍率
  const craneObj = objects.find((o) => o.userData?.label === '塔吊')
  let crane = null
  if (craneObj) {
    crane = new Crane(craneObj)
    if (crane.available) {
      hud.setCraneRange(crane.ropeMin, crane.ropeMax)
      hud.setTrolleyRange(crane.trolleyMin, crane.trolleyMax)
      hud.bindCrane({
        onSlew: () => {
          crane.toggleSlew()
          hud.setCraneState(crane.state)
        },
        onTrolley: (m) => {
          crane.setTrolley(m)
          hud.setCraneState(crane.state)
        },
        onHoist: (m) => {
          crane.setHoist(m)
          hud.setCraneState(crane.state)
        },
        onTrolleyAuto: () => {
          crane.toggleTrolleyAuto()
          hud.setCraneState(crane.state)
        },
        onHoistAuto: () => {
          crane.toggleHoistAuto()
          hud.setCraneState(crane.state)
        },
        onSpeed: (key, v) => {
          crane.setSpeed(key, v)
          hud.setCraneState(crane.state)
        },
      })
      viewer.onUpdate((dt) => {
        crane.update(dt)
        // 回转角 / 幅度 / 绳长一直在变，每帧回写面板
        hud.setCraneState(crane.state)
      })
      hud.setCraneState(crane.state)
    } else {
      hud.disableCrane(crane.warning)
    }
  } else {
    hud.disableCrane('场景中没有塔吊对象')
  }

  // 大门开合：两扇门各自绕铰链轴转，可反复切换，带速度倍率
  const gateObj = objects.find((o) => o.userData?.label === '工地大门')
  let gate = null
  if (gateObj) {
    gate = new SiteGate(gateObj)
    if (gate.available) {
      hud.bindGate({
        onToggle: () => {
          gate.toggle()
          hud.setGateState(gate.state)
        },
        onSpeed: (v) => {
          gate.setSpeed(v)
          hud.setGateState(gate.state)
        },
      })
      viewer.onUpdate((dt) => {
        gate.update(dt)
        // 开合角度一直在变，每帧回写面板
        hud.setGateState(gate.state)
      })
      hud.setGateState(gate.state)
    } else {
      hud.disableGate(gate.warning)
    }
  } else {
    hud.disableGate('场景中没有大门对象')
  }

  // 人员：多模型施工队。worker.glb 必需，位置工种模型
  // （hoe / plan / cement / tech / foreman）允许缺失，缺失的退回普通工人
  let people = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (const file of WORKER_MODEL_FILES) {
      if (loader.cache.has(file)) continue
      try {
        await loader.load(file)
      } catch {
        // 模型还没生成好，下一轮再试
      }
    }
    if (loader.cache.has('worker.glb')) break
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
  if (loader.cache.has('worker.glb')) {
    people = new People(viewer, loader)
    if (people.available) {
      viewer.onUpdate((dt) => people.update(dt))
    } else {
      hud.disablePeople(people.warning)
      people = null
    }
  } else {
    console.warn('[人员] 未找到 public/models/worker.glb，人员系统置灰')
    hud.disablePeople('worker.glb 未就绪，人员系统暂不可用')
  }

  // 风险模拟：失火（真实蔓延）/ 断电（渐进停电）/ 机械故障，可同时开启
  const risks = new Risks(viewer, { root: builder.root, machines })
  viewer.onUpdate((dt) => risks.update(dt))

  // 人员「工地态势」面板 + 故障联动
  const refreshPeople = () => {
    if (!people) return
    hud.updatePeople(people.getStats(), {
      tempC: env.temperatureC,
      riskText: risks.statusText,
      zoneTemps: risks.zoneHeat,
    })
  }
  const refreshRisks = () => {
    hud.setRiskState(risks.list)
    hud.setRiskStatus(risks.statusText)
    hud.setMeasureState(risks.measures)
  }

  // 人员显示开关：只影响可见性，人数与分区统计照常反映真实状态
  if (people) {
    hud.bindPeopleVisibility(() => {
      people.toggleVisible()
      hud.setPeopleVisible(people.visible)
      refreshPeople()
    })
    hud.setPeopleVisible(people.visible)
  }

  hud.renderRiskButtons(risks.list, (key) => {
    risks.toggle(key)
    refreshRisks()
    refreshPeople()
  })
  hud.renderMeasureButtons(risks.measures, (key) => {
    risks.toggleMeasure(key)
    refreshRisks()
    refreshPeople()
  })
  hud.bindRiskClear(() => {
    risks.clear()
    refreshRisks()
    refreshPeople()
  })
  hud.setRiskStatus(risks.statusText)

  // 故障时受影响分区的人撤离到集合点，解除后各自回岗；
  // 同时每帧把火场热浪强度接到环境（曝光 / 雾色）
  let hazardSig = ''
  const applyLinkage = () => {
    env.setHeat(risks.fireHeat)
    if (!people) return
    const evacOn = risks.measureMap.get('evac').active
    const hz = risks.hazardZones
    const sig = evacOn ? 'ALL' : hz.slice().sort().join(',')
    if (sig === hazardSig) return
    hazardSig = sig
    if (evacOn) people.setHazard('all')
    else if (hz.length) people.setHazard(hz)
    else people.returnAll()
    refreshPeople()
  }
  viewer.onUpdate(() => applyLinkage())

  // 每秒刷新一次人员面板与风险 / 处置按钮
  let panelAcc = 0
  viewer.onUpdate((dt) => {
    panelAcc += dt
    if (panelAcc >= 1) {
      panelAcc -= 1
      refreshRisks()
      refreshPeople()
    }
  })
  refreshRisks()
  refreshPeople()

  // 第一人称漫游
  const roam = new RoamController(viewer, {
    siteRoot: builder.root,
    spawn: ROAM_SPAWN.position,
    yaw: ROAM_SPAWN.yaw,
    // 模式与指针锁定的变化都通过回调刷界面，界面不反向依赖三维
    onStateChange: (controller) => {
      hud.setMode(controller.active ? 'roam' : 'orbit', controller.isLocked)
    },
  })
  viewer.onUpdate((dt) => roam.update(dt))

  hud.bindModeButtons((mode) => {
    if (mode === 'roam') roam.enter()
    else roam.exit()
  })
  hud.bindOverlayClick(() => roam.lockPointer())
  // Esc 会解除指针锁定，点一下画面直接继续
  els.canvas.addEventListener('click', () => {
    if (roam.active && !roam.isLocked) roam.lockPointer()
  })
  hud.setMode('orbit')

  // 视角按钮：点任意预设都先退出漫游，再平滑飞过去
  hud.renderViewButtons([{ key: 'home', label: '默认视角' }, ...views.list], (key) => {
    if (roam.active) roam.exit()
    hud.setViewActive(views.go(key))
  })
  hud.setViewActive(views.activeKey)

  // 鼠标点选：单击模型弹出带台账信息，漫游模式下不响应
  const selector = new Selector(viewer, {
    root: builder.root,
    isEnabled: () => !roam.active,
    onPick: (obj) => {
      if (!obj) {
        hud.hideInfo()
        return
      }
      const info = getObjectInfo(obj.userData?.source, obj.userData?.label)
      info.pos = [Math.round(obj.position.x), Math.round(obj.position.z)]
      hud.showInfo(info)
    },
  })
  viewer.onUpdate(() => selector.update())
  hud.bindInfoClose(() => selector.clear())

  // 「恢复默认」：一键把整个应用状态复位。
  // 全部复用各子系统已有的 API，时间 / 视角 / 塔吊复位都走原有缓动，
  // 不会硬切，也不打断进行中的动画
  const resetAll = () => {
    // 时间环境 → 正午 12:00
    env.setTimePreset('noon')
    hud.setTimeState(env.activeKey, env.statusText)

    // 漫游 → 关
    if (roam.active) roam.exit()

    // 相机 → 默认视角
    hud.setViewActive(views.go('home'))

    // 风险模拟 → 全部解除
    risks.clear()
    refreshRisks()

    // 机械 → 全部停机，每台速度回 1.0×
    machines.stopAll()
    for (const rig of machines.rigs) machines.setSpeed(rig.key, 1)
    hud.setAnimState(machines.list)

    // 车辆灯光 → 关
    vehicleLights.off()
    hud.setVehicleLightState(vehicleLights.active)

    // 塔吊 → 回转停、自动变幅 / 升降关，幅度 / 绳长 / 三个速度回初始
    if (crane && crane.available) {
      crane.reset()
      hud.setCraneState(crane.state)
    }

    // 大门 → 关闭，速度回 1.0×
    if (gate && gate.available) {
      gate.reset()
      hud.setGateState(gate.state)
    }

    // 人员 → 回岗并恢复显示；环境热浪归零
    if (people) {
      people.reset()
      hud.setPeopleVisible(people.visible)
      hazardSig = ''
      refreshPeople()
    }
    env.setHeat(0)
  }
  hud.bindResetDefaults(resetAll)

  // 收起遮罩，开始渲染
  els.loading.classList.add('is-hidden')
  viewer.start()

  // 方便在浏览器控制台里调试
  window.__site__ = {
    viewer, env, loader, builder, machines, crane, gate, vehicleLights, views,
    risks, people, roam, selector, hud, objects,
    // 供调试 / 自动化验证手动推进联动与面板刷新
    refreshRisks, refreshPeople, syncLinkage: applyLinkage,
  }
}

function showError(error) {
  console.error('[场景初始化失败]', error)
  els.loading.innerHTML = `
    <div class="loading-box">
      <p class="loading-title">加载失败</p>
      <p class="loading-error">${String(error?.message || error)}</p>
      <p class="loading-error" style="margin-top:14px;color:#8fa7bd">
        常见原因：<br>
        · 模型没有放进 public/models 目录<br>
        · 端口被占用或开发服务器未启动
      </p>
    </div>`
}

bootstrap().catch(showError)
