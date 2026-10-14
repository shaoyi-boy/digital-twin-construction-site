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

  // 1. 基础三维环境
  const viewer = new Viewer(els.canvas)
  const env = setupEnvironment(viewer)

  // 1.5 时间环境：4 个时刻预设，点击后平滑过渡（默认正午）
  hud.renderTimeButtons(env.list, (key) => {
    env.setTimePreset(key)
    hud.setTimeState(env.activeKey, env.statusText)
  })
  hud.setTimeState(env.activeKey, env.statusText)
  viewer.onUpdate((dt) => env.update(dt))

  // 2. 加载模型，进度条按已完成个数走
  const loader = new AssetLoader((loaded, total) => {
    const pct = total ? Math.min(100, Math.round((loaded / total) * 100)) : 0
    els.fill.style.width = `${pct}%`
    els.text.textContent = `${loaded} / ${total}　${pct}%`
  })

  hud.setStatus(`正在加载模型（0/${MODEL_FILES.length}）…`)
  await loader.loadAll(MODEL_FILES)

  // 3. 按平面布置表把模型摆进场地，再按实际包围盒自动取景
  const builder = new SiteBuilder(viewer, loader)
  const objects = builder.build()
  if (objects.length) viewer.frameBounds(builder.getBounds())

  hud.renderObjectList(objects)
  hud.setStatus(`已加载 ${MODEL_FILES.length} 个模型，场景中共 ${objects.length} 个对象`)

  // 3.1 车辆灯光：一个总开关控制作业车辆与搅拌车的前照灯 / 点光源
  const vehicleLights = new VehicleLights(objects)
  hud.bindVehicleLights(() => {
    const on = vehicleLights.toggle()
    hud.setVehicleLightState(on)
  })
  hud.setVehicleLightState(vehicleLights.active)

  // 3.2 仓库室内补两盏暖光点光源：漫游走进仓库也能看清货架与材料
  const warehouse = objects.find((o) => o.userData?.label === '临时仓库')
  if (warehouse) {
    for (const dx of [-5.2, 5.2]) {
      const lamp = new THREE.PointLight(0xfff0d8, 26, 20, 2)
      lamp.position.set(warehouse.position.x + dx, 3.6, warehouse.position.z + 1.2)
      builder.root.add(lamp)
    }
  }

  // 3.2 视角切换：预设机位平滑飞行（自动取景后的机位记为「默认视角」）
  const views = new Views(viewer)
  views.setHomeFromCamera()
  viewer.onUpdate((dt) => views.update(dt))

  // 3.5 土方作业交互动画：每台机械一个开关 + 一个速度倍率，可以同时动
  const machines = new Machines(builder.machines)
  if (machines.available) {
    viewer.onUpdate((dt) => machines.update(dt))
    hud.buildAnimButtons(machines.list, {
      onToggle: (key) => {
        machines.toggle(key)
        hud.setAnimState(machines.list)
      },
      // 速度倍率只改变推进快慢，不重置相位，也不影响各自的启停
      onSpeed: (key, v) => machines.setSpeed(key, v),
    })
  } else {
    hud.buildAnimButtons([], { onToggle: () => {}, onSpeed: () => {} })
  }

  // 3.55 塔吊动画：回转 + 小车变幅 + 吊钩升降，由同一条 update(dt) 缓动驱动，
  //      三个动作可同时进行，且各有一个速度倍率
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
        // 回转角 / 幅度 / 绳长一直在变，这里每帧回写面板
        hud.setCraneState(crane.state)
      })
      hud.setCraneState(crane.state)
    } else {
      hud.disableCrane(crane.warning)
    }
  } else {
    hud.disableCrane('场景中没有塔吊对象')
  }

  // 3.58 大门开合：两扇蓝色门扇各自绕铰链轴开 / 关，可反复切换，带一个速度倍率
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
        // 开合角度一直在变，这里每帧回写面板
        hud.setGateState(gate.state)
      })
      hud.setGateState(gate.state)
    } else {
      hud.disableGate(gate.warning)
    }
  } else {
    hud.disableGate('场景中没有大门对象')
  }

  // 3.6 人员：多模型施工队。模型由另一条工作流并行产出，这里轮询等待；
  //     worker.glb 必需，worker_hoe / _plan / _cement / _tech / _foreman 允许缺失
  //    （缺失则该分区的人回退成普通工人），始终缺失也不会崩，只把「人员」分区置灰。
  let people = null
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (const file of WORKER_MODEL_FILES) {
      if (loader.cache.has(file)) continue
      try {
        await loader.load(file)
      } catch {
        // 该模型还没生成好，下一轮再试
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

  // 3.65 风险模拟：失火（真实蔓延）/ 断电（渐进停电）/ 机械故障，可同时开启
  const risks = new Risks(viewer, { root: builder.root, machines })
  viewer.onUpdate((dt) => risks.update(dt))

  // 3.7 人员「工地态势」面板 + 故障联动
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

  // 人员显示开关：一键隐藏 / 显示全部工人对象；只影响可见性，
  // 人数与分区统计照常反映真实状态（隐藏时数字仍然准确）。
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

  // 发生故障 → 受影响分区的人员撤离到集合点；风险解除 → 各自回岗。
  // 同时每帧把火场热浪强度接到环境（曝光 / 雾色）上。
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

  // 每秒刷新一次「人员」面板与风险 / 处置按钮（自动展开的处置措施也要同步到界面）
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

  // 4. 第一人称漫游
  const roam = new RoamController(viewer, {
    siteRoot: builder.root,
    spawn: ROAM_SPAWN.position,
    yaw: ROAM_SPAWN.yaw,
    // 模式切换和指针锁定的变化都通过这个回调刷界面，界面本身不反向依赖三维
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
  // 按 Esc 会解除指针锁定，点一下画面直接继续
  els.canvas.addEventListener('click', () => {
    if (roam.active && !roam.isLocked) roam.lockPointer()
  })
  hud.setMode('orbit')

  // 4.2 视角按钮：点任意预设都会先退出漫游，再平滑飞过去
  hud.renderViewButtons([{ key: 'home', label: '默认视角' }, ...views.list], (key) => {
    if (roam.active) roam.exit()
    hud.setViewActive(views.go(key))
  })
  hud.setViewActive(views.activeKey)

  // 4.5 鼠标点选：单击某个模型弹出它的台账信息（漫游模式下不响应）
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

  // 4.8 「恢复默认」：一键把整个应用状态复位到默认值。
  //     全部复用各子系统已有的 API，不做任何重复实现；操作幂等，
  //     且时间 / 视角 / 塔吊复位都走原有缓动，不会硬切、不打断进行中的动画。
  const resetAll = () => {
    // 时间环境 → 正午 12:00（沿用 0.8s 平滑过渡）
    env.setTimePreset('noon')
    hud.setTimeState(env.activeKey, env.statusText)

    // 漫游 → 关（退出时先还原俯瞰机位，随后由默认视角平滑飞过去）
    if (roam.active) roam.exit()

    // 相机 → 默认视角（沿用 Views 约 1.1s 的缓动飞行，而不是瞬移）
    hud.setViewActive(views.go('home'))

    // 风险模拟 → 全部解除（会一并还原被「机械故障」冻结的机械）
    risks.clear()
    refreshRisks()

    // 机械 → 全部停机 + 每台速度回 1.0×
    machines.stopAll()
    for (const rig of machines.rigs) machines.setSpeed(rig.key, 1)
    hud.setAnimState(machines.list)

    // 车辆灯光 → 关
    vehicleLights.off()
    hud.setVehicleLightState(vehicleLights.active)

    // 塔吊 → 回转停 / 自动变幅与自动升降关 / 幅度与绳长回初始 / 三个速度回 1.0×
    if (crane && crane.available) {
      crane.reset()
      hud.setCraneState(crane.state)
    }

    // 大门 → 关闭（沿同一条缓动摆回 0°，不硬切）+ 开合速度回 1.0×
    if (gate && gate.available) {
      gate.reset()
      hud.setGateState(gate.state)
    }

    // 人员 → 全部回到各自岗位（含恢复显示）；环境热浪 → 归零（风险解除后火场热浪自然回落）
    if (people) {
      people.reset()
      hud.setPeopleVisible(people.visible)
      hazardSig = ''
      refreshPeople()
    }
    env.setHeat(0)
  }
  hud.bindResetDefaults(resetAll)

  // 5. 收起遮罩，开始渲染
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
