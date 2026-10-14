/**
 * 界面层
 *
 * 只管 DOM：右侧统一控制面板（视角切换 / 设备动画 / 风险模拟 / 场景对象）、
 * 顶部风险告警条、点选信息卡、准星、漫游暂停遮罩、操作提示。
 * 不碰任何三维逻辑，三维那边通过回调驱动它刷新。
 */
export class Hud {
  constructor() {
    this.status = document.getElementById('hud-status')
    this.hint = document.getElementById('hint-text')
    this.crosshair = document.getElementById('crosshair')
    this.overlay = document.getElementById('roam-overlay')
    this.btnOrbit = document.getElementById('btn-orbit')
    this.btnRoam = document.getElementById('btn-roam')

    // 时间环境
    this.timeButtons = document.getElementById('time-buttons')
    this.timeBtnMap = new Map()
    this.timeStatus = document.getElementById('time-status')

    // 视角切换
    this.viewButtons = document.getElementById('view-buttons')
    this.viewBtnMap = new Map()

    // 设备动画
    this.animPanel = document.getElementById('anim-panel')
    this.animButtons = document.getElementById('anim-buttons')
    this.animBtnMap = new Map()

    // 车辆灯光
    this.btnVehicleLights = document.getElementById('btn-vehicle-lights')

    // 风险模拟
    this.riskButtons = document.getElementById('risk-buttons')
    this.riskBtnMap = new Map()
    this.riskStatus = document.getElementById('risk-status')
    this.btnRiskClear = document.getElementById('risk-clear')
    this.riskBanner = document.getElementById('risk-banner')
    // 处置措施
    this.measureButtons = document.getElementById('risk-measures')
    this.measureBtnMap = new Map()

    // 人员（实时在场人数 / 分区分布 / 气温 / 风险状态）
    this.peoplePanel = document.getElementById('people-panel')
    this.peopleTotal = document.getElementById('people-total')
    this.peopleSummary = document.getElementById('people-summary')
    this.peopleTemp = document.getElementById('people-temp')
    this.peopleRisk = document.getElementById('people-risk')
    this.peopleZones = document.getElementById('people-zones')
    this.peopleModels = document.getElementById('people-models')
    this.peopleNote = document.getElementById('people-note')
    this.btnPeopleVisible = document.getElementById('people-visible')

    // 塔吊（回转 / 小车变幅 / 吊钩升降，三个动作各有速度倍率）
    this.cranePanel = document.getElementById('crane-panel')
    this.btnCraneSlew = document.getElementById('crane-slew')
    this.craneTrolley = document.getElementById('crane-trolley')
    this.craneTrolleyValue = document.getElementById('crane-trolley-value')
    this.btnCraneTrolleyAuto = document.getElementById('crane-trolley-auto')
    this.craneHoist = document.getElementById('crane-hoist')
    this.craneHoistValue = document.getElementById('crane-hoist-value')
    this.btnCraneAuto = document.getElementById('crane-auto')
    this.craneStatus = document.getElementById('crane-status')
    this.craneSpeed = {
      slew: document.getElementById('crane-speed-slew'),
      trolley: document.getElementById('crane-speed-trolley'),
      hoist: document.getElementById('crane-speed-hoist'),
    }
    this.craneSpeedValue = {
      slew: document.getElementById('crane-speed-slew-value'),
      trolley: document.getElementById('crane-speed-trolley-value'),
      hoist: document.getElementById('crane-speed-hoist-value'),
    }

    // 恢复默认
    this.btnReset = document.getElementById('btn-reset')

    // 大门（两扇蓝门对开，一个开关 + 一个开合速度）
    this.gatePanel = document.getElementById('gate-panel')
    this.btnGate = document.getElementById('gate-toggle')
    this.gateSpeed = document.getElementById('gate-speed')
    this.gateSpeedValue = document.getElementById('gate-speed-value')
    this.gateStatus = document.getElementById('gate-status')

    // 场景对象（可折叠）
    this.objectBlock = document.getElementById('object-block')
    this.objectCount = document.getElementById('object-count')
    this.list = document.getElementById('object-list')

    // 各分区标题可点击折叠（状态只记在本次会话）
    this.sectionMap = new Map()
    this.setupSections()

    // 点选信息卡
    this.infoCard = document.getElementById('info-card')
    this.infoTitle = document.getElementById('info-title')
    this.infoType = document.getElementById('info-type')
    this.infoBody = document.getElementById('info-body')
    this.btnInfoClose = document.getElementById('info-close')
  }

  // ------------------------------------------------------------------
  // 顶部标题条
  // ------------------------------------------------------------------
  setStatus(text) {
    this.status.textContent = text
  }

  // ------------------------------------------------------------------
  // 分区折叠（点击标题收起 / 展开；状态只记在本次会话）
  // ------------------------------------------------------------------
  /**
   * 每个分区标题都是可点击的折叠开关。折叠状态用 DOM class 表示，
   * 刷新页面即回到默认；「场景对象」在 HTML 里默认折叠，其余默认展开。
   */
  setupSections() {
    const sections = document.querySelectorAll('#side-panel .panel-section')
    for (const section of sections) {
      const head = section.querySelector('.section-head')
      const body = section.querySelector('.section-body')
      if (!head || !body) continue

      const key = head.dataset.section || section.id || `section-${this.sectionMap.size}`
      const setCollapsed = (collapsed) => {
        body.classList.toggle('is-collapsed', collapsed)
        head.classList.toggle('is-collapsed', collapsed)
        head.setAttribute('aria-expanded', String(!collapsed))
      }

      // 归一化初始状态：以正文的 is-collapsed 为准，同步标题箭头与 aria
      setCollapsed(body.classList.contains('is-collapsed'))
      head.addEventListener('click', () => {
        setCollapsed(!body.classList.contains('is-collapsed'))
      })
      this.sectionMap.set(key, { head, body, setCollapsed })
    }
  }

  /** 绑定「恢复默认」按钮 */
  bindResetDefaults(handler) {
    if (this.btnReset) this.btnReset.addEventListener('click', handler)
  }

  // ------------------------------------------------------------------
  // 场景对象（可折叠）
  // ------------------------------------------------------------------
  /** 按类型聚合统计场景对象 */
  renderObjectList(objects) {
    const counts = new Map()
    for (const obj of objects) {
      const label = obj.userData?.label || obj.name || '未命名'
      counts.set(label, (counts.get(label) || 0) + 1)
    }

    this.list.innerHTML = [...counts.entries()]
      .map(([label, count]) => `<li><span>${label}</span><em>×${count}</em></li>`)
      .join('')
    if (this.objectCount) this.objectCount.textContent = String(objects.length)
  }

  // ------------------------------------------------------------------
  // 时间环境（4 个预设 + 时钟 / 温度状态行）
  // ------------------------------------------------------------------
  /** items: [{ key, label }]，点击回调收到 key */
  renderTimeButtons(items, handler) {
    this.timeButtons.innerHTML = ''
    this.timeBtnMap.clear()
    for (const item of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'tool-btn'
      btn.textContent = item.label
      btn.dataset.key = item.key
      btn.addEventListener('click', () => handler(item.key))
      this.timeButtons.appendChild(btn)
      this.timeBtnMap.set(item.key, btn)
    }
  }

  /** 高亮当前预设，并刷新时钟 / 温度状态行 */
  setTimeState(activeKey, text) {
    for (const [k, btn] of this.timeBtnMap) btn.classList.toggle('is-active', k === activeKey)
    if (this.timeStatus) this.timeStatus.textContent = text
  }

  // ------------------------------------------------------------------
  // 车辆灯光（总开关）
  // ------------------------------------------------------------------
  bindVehicleLights(handler) {
    this.btnVehicleLights.addEventListener('click', handler)
  }

  setVehicleLightState(active) {
    this.btnVehicleLights.classList.toggle('is-active', active)
    this.btnVehicleLights.textContent = active ? '车辆灯光：开' : '车辆灯光：关'
    this.btnVehicleLights.setAttribute('aria-pressed', String(active))
  }

  // ------------------------------------------------------------------
  // 视角切换
  // ------------------------------------------------------------------
  /** items: [{ key, label }]，点击回调收到 key */
  renderViewButtons(items, handler) {
    this.viewButtons.innerHTML = ''
    this.viewBtnMap.clear()
    for (const item of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'tool-btn'
      btn.textContent = item.label
      btn.dataset.key = item.key
      btn.addEventListener('click', () => handler(item.key))
      this.viewButtons.appendChild(btn)
      this.viewBtnMap.set(item.key, btn)
    }
  }

  setViewActive(key) {
    for (const [k, btn] of this.viewBtnMap) btn.classList.toggle('is-active', k === key)
  }

  // ------------------------------------------------------------------
  // 俯瞰 / 漫游 模式切换
  // ------------------------------------------------------------------
  /**
   * 刷新模式相关的界面。
   * 漫游模式下鼠标被锁定才显示准星；没锁定就说明被 Esc 打断了，弹出继续提示。
   */
  setMode(mode, locked = false) {
    const roaming = mode === 'roam'

    this.btnOrbit.classList.toggle('is-active', !roaming)
    this.btnRoam.classList.toggle('is-active', roaming)
    this.crosshair.hidden = !(roaming && locked)
    this.overlay.hidden = !(roaming && !locked)

    this.hint.textContent = roaming
      ? 'W A S D 移动　Shift 加速　鼠标 转向　Esc 暂停'
      : '左键单击 查看信息　左键拖拽 旋转　滚轮 缩放　右键拖拽 平移'
  }

  bindModeButtons(handler) {
    this.btnOrbit.addEventListener('click', () => handler('orbit'))
    this.btnRoam.addEventListener('click', () => handler('roam'))
  }

  // ------------------------------------------------------------------
  // 设备动画（每台机械一个开关 + 一个速度倍率，可多台同时动作）
  // ------------------------------------------------------------------
  /**
   * items: [{ key, label, short, running, speed }]
   * handlers: { onToggle(key), onSpeed(key, value) }
   * 每台机械占一行：上面是启停按钮，下面一行是它自己的速度滑块。
   */
  buildAnimButtons(items, handlers) {
    this.animButtons.innerHTML = ''
    this.animBtnMap.clear()
    this.animSpeedMap = new Map()
    this.animSpeedValueMap = new Map()
    this.animPanel.hidden = items.length === 0

    for (const item of items) {
      const block = document.createElement('div')
      block.className = 'anim-item'

      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'tool-btn'
      btn.textContent = item.short || item.label
      btn.dataset.key = item.key
      btn.addEventListener('click', () => handlers.onToggle(item.key))
      block.appendChild(btn)

      // 速度控制：沿用塔吊面板一行的样式（标签 + 滑块 + 数值），不另造外观
      const row = document.createElement('div')
      row.className = 'crane-row'

      const label = document.createElement('span')
      label.className = 'crane-label'
      label.textContent = '速度'

      const range = document.createElement('input')
      range.type = 'range'
      range.className = 'crane-range'
      range.min = '0.2'
      range.max = '3'
      range.step = '0.1'
      range.value = String(item.speed ?? 1)
      range.setAttribute('aria-label', `${item.label} 速度倍率`)

      const value = document.createElement('span')
      value.className = 'crane-value'
      value.textContent = formatSpeed(item.speed ?? 1)

      range.addEventListener('input', () => {
        const v = Number(range.value)
        value.textContent = formatSpeed(v)
        handlers.onSpeed(item.key, v)
      })

      row.appendChild(label)
      row.appendChild(range)
      row.appendChild(value)
      block.appendChild(row)

      this.animButtons.appendChild(block)
      this.animBtnMap.set(item.key, btn)
      this.animSpeedMap.set(item.key, range)
      this.animSpeedValueMap.set(item.key, value)
    }
    this.setAnimState(items)
  }

  /** 回写每台机械的运行状态与速度（按钮高亮 + 滑块位置 + 数值） */
  setAnimState(items) {
    for (const item of items) {
      const btn = this.animBtnMap.get(item.key)
      if (btn) btn.classList.toggle('is-active', item.running)

      const range = this.animSpeedMap?.get(item.key)
      const value = this.animSpeedValueMap?.get(item.key)
      if (range && document.activeElement !== range) range.value = String(item.speed ?? 1)
      if (value) value.textContent = formatSpeed(item.speed ?? 1)
    }
  }

  // ------------------------------------------------------------------
  // 塔吊（回转 / 小车变幅 / 吊钩升降，三个动作各有速度倍率）
  // ------------------------------------------------------------------
  /**
   * handlers: { onSlew, onTrolley(r), onHoist(ropeLen), onTrolleyAuto, onHoistAuto, onSpeed(key, v) }
   */
  bindCrane(handlers) {
    this.btnCraneSlew.addEventListener('click', handlers.onSlew)
    this.craneTrolley.addEventListener('input', (e) => handlers.onTrolley(Number(e.target.value)))
    this.craneHoist.addEventListener('input', (e) => handlers.onHoist(Number(e.target.value)))
    this.btnCraneTrolleyAuto.addEventListener('click', handlers.onTrolleyAuto)
    this.btnCraneAuto.addEventListener('click', handlers.onHoistAuto)
    for (const key of ['slew', 'trolley', 'hoist']) {
      const el = this.craneSpeed[key]
      if (el) el.addEventListener('input', () => handlers.onSpeed(key, Number(el.value)))
    }
  }

  /** 绳长滑块的量程（m），由三维侧的真实上下限决定 */
  setCraneRange(min, max) {
    this.craneHoist.min = String(min)
    this.craneHoist.max = String(max)
  }

  /** 小车幅度滑块的量程（m）：内侧固定 2.5，外侧取大臂臂尖 */
  setTrolleyRange(min, max) {
    this.craneTrolley.min = String(min)
    this.craneTrolley.max = String(max)
  }

  /** 刷新塔吊面板（回转 / 小车 / 升降 / 三个速度倍率 / 状态行） */
  setCraneState(s) {
    this.btnCraneSlew.textContent = s.slewOn ? '塔吊回转：开' : '塔吊回转：停'
    this.btnCraneSlew.classList.toggle('is-active', s.slewOn)
    this.btnCraneSlew.setAttribute('aria-pressed', String(s.slewOn))

    // 拖动滑块时不要被回写打断
    if (document.activeElement !== this.craneTrolley) {
      this.craneTrolley.value = String(Number(s.trolleyR.toFixed(1)))
    }
    if (this.craneTrolleyValue) this.craneTrolleyValue.textContent = `${s.trolleyR.toFixed(1)} m`

    if (document.activeElement !== this.craneHoist) {
      this.craneHoist.value = String(Number(s.ropeLen.toFixed(1)))
    }
    if (this.craneHoistValue) this.craneHoistValue.textContent = `${s.ropeLen.toFixed(1)} m`

    this.btnCraneTrolleyAuto.classList.toggle('is-active', !!s.trolleyAuto)
    this.btnCraneTrolleyAuto.setAttribute('aria-pressed', String(!!s.trolleyAuto))
    this.btnCraneAuto.classList.toggle('is-active', !!s.hoistAuto)
    this.btnCraneAuto.setAttribute('aria-pressed', String(!!s.hoistAuto))

    // 三个动作的速度倍率
    if (s.mul) {
      for (const key of ['slew', 'trolley', 'hoist']) {
        const el = this.craneSpeed[key]
        if (el && document.activeElement !== el) el.value = String(s.mul[key])
        const v = this.craneSpeedValue[key]
        if (v) v.textContent = formatSpeed(s.mul[key])
      }
    }

    this.craneStatus.textContent =
      `回转角 ${s.slewDeg.toFixed(1)}°　角速度 ${s.slewSpeed.toFixed(2)}°/s` +
      `　幅度 ${s.trolleyR.toFixed(1)} m　绳长 ${s.ropeLen.toFixed(1)} m` +
      `　吊钩离地 ${s.hookHeight.toFixed(1)} m`
  }

  /** 节点缺失时禁用整个塔吊分区，只提示一次 */
  disableCrane(reason) {
    this.cranePanel.classList.add('is-disabled')
    const disabled = [
      this.btnCraneSlew, this.craneTrolley, this.craneHoist,
      this.btnCraneTrolleyAuto, this.btnCraneAuto,
      this.craneSpeed.slew, this.craneSpeed.trolley, this.craneSpeed.hoist,
    ]
    for (const el of disabled) {
      if (el) el.disabled = true
    }
    this.craneStatus.textContent = reason || '塔吊动画不可用'
  }

  // ------------------------------------------------------------------
  // 大门（两扇蓝门对开：开 / 关 + 开合速度）
  // ------------------------------------------------------------------
  /** handlers: { onToggle, onSpeed(v) } */
  bindGate(handlers) {
    this.btnGate.addEventListener('click', handlers.onToggle)
    this.gateSpeed.addEventListener('input', () => handlers.onSpeed(Number(this.gateSpeed.value)))
  }

  /** 刷新大门面板（按钮文案 / 速度滑块 / 当前开合角度） */
  setGateState(s) {
    this.btnGate.textContent = s.open ? '大门：打开' : '大门：关闭'
    this.btnGate.classList.toggle('is-active', s.open)
    this.btnGate.setAttribute('aria-pressed', String(s.open))

    if (document.activeElement !== this.gateSpeed) this.gateSpeed.value = String(s.speed)
    if (this.gateSpeedValue) this.gateSpeedValue.textContent = formatSpeed(s.speed)

    this.gateStatus.textContent =
      `左扇 / 右扇 ${s.deg.toFixed(1)}° / ${s.deg.toFixed(1)}°　最大 ${s.maxDeg}°`
  }

  /** 节点缺失时禁用整个大门分区，只提示一次 */
  disableGate(reason) {
    this.gatePanel.classList.add('is-disabled')
    if (this.btnGate) this.btnGate.disabled = true
    if (this.gateSpeed) this.gateSpeed.disabled = true
    this.gateStatus.textContent = reason || '大门动画不可用'
  }

  // ------------------------------------------------------------------
  // 风险模拟
  // ------------------------------------------------------------------
  /** items: [{ key, label, active }]，点击回调收到 key */
  renderRiskButtons(items, handler) {
    this.riskButtons.innerHTML = ''
    this.riskBtnMap.clear()
    for (const item of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'tool-btn risk-btn'
      btn.textContent = item.label
      btn.dataset.key = item.key
      btn.addEventListener('click', () => handler(item.key))
      this.riskButtons.appendChild(btn)
      this.riskBtnMap.set(item.key, btn)
    }
    this.setRiskState(items)
  }

  /** 高亮激活项，并同步顶部告警条 */
  setRiskState(items) {
    for (const item of items) {
      const btn = this.riskBtnMap.get(item.key)
      if (btn) btn.classList.toggle('is-active', item.active)
    }

    const active = items.filter((item) => item.active)
    this.riskBanner.hidden = active.length === 0
    this.riskBanner.innerHTML = active.length
      ? `<span class="risk-banner-dot"></span>风险模拟进行中　${active
          .map((item) => item.label)
          .join('　·　')}`
      : ''
  }

  setRiskStatus(text) {
    if (this.riskStatus) this.riskStatus.textContent = text
  }

  bindRiskClear(handler) {
    this.btnRiskClear.addEventListener('click', handler)
  }

  /** 处置措施按钮：items: [{ key, label, active }]，点击回调收到 key */
  renderMeasureButtons(items, handler) {
    if (!this.measureButtons) return
    this.measureButtons.innerHTML = ''
    this.measureBtnMap.clear()
    for (const item of items) {
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'tool-btn measure-btn'
      btn.textContent = item.label
      btn.dataset.key = item.key
      btn.addEventListener('click', () => handler(item.key))
      this.measureButtons.appendChild(btn)
      this.measureBtnMap.set(item.key, btn)
    }
    this.setMeasureState(items)
  }

  setMeasureState(items) {
    for (const item of items) {
      const btn = this.measureBtnMap.get(item.key)
      if (btn) btn.classList.toggle('is-active', item.active)
    }
  }

  // ------------------------------------------------------------------
  // 人员（实时在场人数 / 分区分部 / 气温 / 风险状态）
  // ------------------------------------------------------------------
  /** 让整个「人员」分区不可用（worker.glb 未就绪时） */
  disablePeople(reason) {
    if (!this.peoplePanel) return
    this.peoplePanel.classList.add('is-disabled')
    if (this.peopleZones) this.peopleZones.innerHTML = ''
    if (this.peopleModels) this.peopleModels.textContent = ''
    if (this.peopleSummary) this.peopleSummary.textContent = reason || '人员系统不可用'
    if (this.peopleRisk) this.peopleRisk.textContent = '—'
    if (this.peopleTemp) this.peopleTemp.textContent = '—'
    if (this.peopleTotal) this.peopleTotal.textContent = '0'
    if (this.btnPeopleVisible) this.btnPeopleVisible.disabled = true
  }

  /** 绑定「人员显示」开关 */
  bindPeopleVisibility(handler) {
    if (this.btnPeopleVisible) this.btnPeopleVisible.addEventListener('click', handler)
  }

  /**
   * 回写「人员显示」开关状态。
   * 按钮文案按「当前状态」显示：可见 → 「人员显示：显示」，隐藏 → 「人员显示：隐藏」。
   */
  setPeopleVisible(visible) {
    if (!this.btnPeopleVisible) return
    this.btnPeopleVisible.textContent = visible ? '人员显示：显示' : '人员显示：隐藏'
    this.btnPeopleVisible.classList.toggle('is-active', !!visible)
    this.btnPeopleVisible.setAttribute('aria-pressed', String(!!visible))
  }

  /**
   * 刷新人员面板。
   * @param {object} stats People.getStats() 的返回值
   * @param {object} info  { tempC, riskText, zoneTemps }（zoneTemps: 分区升温 °C）
   */
  updatePeople(stats, info = {}) {
    if (!this.peoplePanel || !stats) return
    const baseC = info.tempC ?? 0
    const zoneTemps = info.zoneTemps || {}

    if (this.peopleTotal) this.peopleTotal.textContent = String(stats.total)
    if (this.peopleSummary) {
      this.peopleSummary.textContent =
        `在场 ${stats.onSite} 人　疏散中 ${stats.evacuating} 人　安全区 ${stats.safe} 人`
    }
    if (this.peopleTemp) {
      // 有火场时气温上浮：取受影响分区最大升温，反映「热浪」
      const maxHeat = Math.max(0, ...Object.values(zoneTemps))
      this.peopleTemp.textContent = `${Math.round(baseC)} °C${maxHeat > 1 ? `　↑${Math.round(maxHeat)}` : ''}`
    }
    if (this.peopleRisk) this.peopleRisk.textContent = info.riskText || '当前无风险，工地运行正常'

    // 人员构成（按模型统计，隐藏时也照常显示，反映真实编队）
    if (this.peopleModels && stats.models) {
      this.peopleModels.textContent =
        '人员构成　' +
        stats.models.filter((m) => m.count > 0).map((m) => `${m.label} ${m.count}`).join('　·　')
    }
    // 隐藏时的说明：人数仍按逻辑状态统计
    if (this.peopleNote) {
      this.peopleNote.textContent = stats.visible
        ? '隐藏仅影响显示，人数仍按实际状态统计'
        : '已隐藏全部人员；人数仍按实际状态统计'
    }

    if (this.peopleZones) {
      this.peopleZones.innerHTML = stats.zones
        .map((z) => {
          const heat = zoneTemps[z.key] || 0
          const heatTag = heat > 1 ? `<b class="zone-heat">${Math.round(baseC + heat)} °C</b>` : ''
          return `<li><span>${z.label}</span><em>${z.count} 人</em>${heatTag}</li>`
        })
        .join('')
    }
  }

  // ------------------------------------------------------------------
  // 点选信息卡
  // ------------------------------------------------------------------
  bindInfoClose(handler) {
    this.btnInfoClose.addEventListener('click', handler)
  }

  /** info 为 null 时收起卡片 */
  showInfo(info) {
    if (!info) {
      this.hideInfo()
      return
    }
    this.infoTitle.textContent = info.title
    this.infoType.textContent = info.type

    const parts = []
    if (info.desc) parts.push(`<p class="info-desc">${info.desc}</p>`)
    if (info.params && info.params.length) {
      parts.push(
        `<ul class="info-params">${info.params
          .map(([k, v]) => `<li><span>${k}</span><em>${v}</em></li>`)
          .join('')}</ul>`
      )
    }
    if (info.pos) {
      parts.push(`<p class="info-pos">位置　X ${info.pos[0]}　Z ${info.pos[1]}</p>`)
    }
    this.infoBody.innerHTML = parts.join('')
    this.infoCard.hidden = false
  }

  hideInfo() {
    this.infoCard.hidden = true
  }

  /** 点击暂停遮罩继续漫游（浏览器要求指针锁定必须由用户手势触发） */
  bindOverlayClick(handler) {
    this.overlay.addEventListener('click', handler)
  }
}

/** 速度倍率文案：1 → 「1.0×」 */
function formatSpeed(v) {
  return `${Number(v).toFixed(1)}×`
}
