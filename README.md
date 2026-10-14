# 基于数字孪生的建筑工地三维可视化管控系统

浏览器里运行的建筑工地数字孪生：整块场地由一份平面布置表装配而成，塔吊、机械、人员、风险处置都能实时驱动，温度 / 人员 / 风险三套数据互相联动。

仓库包含两部分：`blender/scripts/` 是用 Python 程序化生成全部模型的建模脚本，其余为前端可视化工程。

## 运行

先 `npm install` 安装依赖，然后用 VS Code 的 Live Server 打开 `index.html`（页面里的 importmap 就是为 Live Server 准备的）。

也可用任意静态服务器：`npx http-server . -p 8081 -c-1`。

> 必须通过 `http://` 访问；直接双击用 `file://` 打开会因浏览器安全策略导致 ES Module 与 GLB 加载失败。

## 目录结构

- `index.html` 页面入口，importmap 指向本地 node_modules
- `public/models/` 模型库，31 个 GLB，全部由 `blender/scripts/` 生成
- `src/config/` 平面布置表 layout.js、台账文案 info.js
- `src/core/` 渲染视口 Viewer.js、模型加载 AssetLoader.js
- `src/scene/` 场地装配、时间环境、塔吊、机械、人员、风险处置、车辆灯光
- `src/controls/` 第一人称漫游、射线拾取
- `src/ui/` 右侧控制面板
- `blender/scripts/` 建模脚本（Blender 4.5 + Python）

## 建模

`blender/scripts/` 下用 MeshBuilder 拼基本体（盒 / 梁 / 柱 / 锥）搭出模型，按材质合批后导出 glTF。全部尺寸集中在 `config.py`，改参数即可整体调整：

- `config.py` 尺寸参数表；`materials.py` 材质表
- `utils.py` MeshBuilder 与导出工具
- `parts_structure.py` 楼栋框架、塔吊、脚手架、基坑
- `parts_machine.py` 挖掘机、翻斗车、搅拌车、路灯
- `parts_facility.py` 板房生活区、大门、围挡、堆场、仓库、场地道路、休息棚、六种工人模型
- `build_models.py` 批量生成入口；`render_preview.py` 生成预览图

```bash
# 在 blender/scripts 目录下执行，生成全部模型
blender --background --python build_models.py

# 只生成指定模型
blender --background --python build_models.py -- labor_camp tower_crane
```

生成的 GLB 位于 `blender/output/glb/`，复制到 `public/models/` 后前端即可使用（构建产物目录已在 `.gitignore` 中忽略）。

## 主要功能

- 场地与道路按平面布置表自动铺满，共 93 个场景对象
- 在建楼栋与基坑、四道外脚手架，4 号楼为带玻璃幕墙的近完工外观
- 塔吊回转 / 小车变幅 / 吊钩升降，各带速度倍率与自动模式
- 挖掘机、翻斗车、搅拌车动画，工地大门可开合
- 36 名工人分 7 个作业分区，含六种工种模型，支持走路动作与一键显隐
- 失火蔓延 / 断电 / 机械故障三类风险，并配五项处置措施
- 温度、人员、风险三方数据联动：起火分区升温、人员撤离到集合点、处置后回岗
- 清晨 / 正午 / 夜晚 / 凌晨四套光照预设，一键恢复默认

## 技术栈

Three.js · WebGL · Vite · 原生 ES Module · glTF / GLB · Blender 4.5（Python 程序化建模）
