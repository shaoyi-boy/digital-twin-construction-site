// 工地平面布置表。坐标按 three.js：Y 向上、地面是 XZ 平面，填的是模型原点
// Blender 导 glTF 会做 (X,Y,Z)→(X,Z,-Y)，所以这里 = Blender 的 (x,z,-y)；+Z 是南侧大门

// 要和 Blender 端 config.py 的 SITE_SIZE 一致
export const SITE_SIZE = 110

// file 是 public/models 下的文件名；label 是显示名，也是三维对象的 name
// position=[x,y,z]，y 一般填 0；rotationY 绕 Y 弧度；interactive 参与交互动画
export const PLACEMENTS = [
  // 场地
  {
    file: 'site_ground.glb',
    label: '场地与道路',
    position: [0, 0, 0],
    castShadow: false,
  },
  // 西侧绿化带
  { file: 'green_belt.glb', label: '绿化带', position: [0, 0, 0] },

  // 出入口：南侧大门，门柱落在围墙线上
  // 大门总宽 12.2m，和南侧围墙缺口 -44 ~ -31.8 等宽
  { file: 'site_gate.glb', label: '工地大门', position: [-39, 0, 55] },

  // 主体结构区：2×2 柱网，X 向两列、Z 向两排
  // 东列 x=-3、西列 x=-30，前 z=-2、后 z=28；1 号楼加高 2 层
  { file: 'building_frame_tall.glb', label: '在建楼层 1 号（加高）', position: [-3, 0, -2] },
  { file: 'building_frame.glb', label: '在建楼层 2 号', position: [-3, 0, 28] },
  { file: 'building_frame.glb', label: '在建楼层 3 号', position: [-30, 0, 28] },
  { file: 'building_frame_plus.glb', label: '在建楼层 4 号', position: [-30, 0, -2] },
  // 塔吊在 1 号楼东侧，大臂转 180° 朝 -X，已向 -X 平移 2.5m 贴近楼体
  { file: 'tower_crane.glb', label: '塔吊', position: [22.5, 0, -11], rotationY: Math.PI },
  // 脚手架南面两道转 180°、北面两道不转；模型原点在西端、向东伸 7.75m
  { file: 'scaffolding.glb', label: '外脚手架 南一', position: [6, 0, -1.9], rotationY: Math.PI },
  { file: 'scaffolding.glb', label: '外脚手架 南二', position: [13.5, 0, -1.9], rotationY: Math.PI },
  { file: 'scaffolding.glb', label: '外脚手架 北', position: [-1.5, 0, -20.1] },
  { file: 'scaffolding.glb', label: '外脚手架 北2', position: [6, 0, -20.1] },

  // 工人生活区：东北角，6 排宿舍
  // 楼房在模型内已转 180°，门窗朝南对着工地大门
  { file: 'labor_camp.glb', label: '工人生活区 A', position: [16, 0, -27.8] },
  { file: 'labor_camp.glb', label: '工人生活区 B', position: [36, 0, -27.8] },
  // 洗漱池加长到 9.6m，仍在 B 区院内
  { file: 'camp_basin.glb', label: '生活区洗漱池', position: [45, 0, -27.4] },
  { file: 'camp_gate.glb', label: '生活区大门', position: [35, 0, -24] },

  // 土方作业区：东南角，让开东西主路
  // 1 号挖机是交互动画机，转 135°，铲斗正对西北侧土堆
  { file: 'excavator.glb', label: '挖掘机 1 号（作业）', position: [38, 0, 19], rotationY: Math.PI * 0.75, interactive: 'excavator' },
  // 1 号翻斗车是交互动画车，车厢朝西倾倒
  { file: 'dump_truck.glb', label: '自卸翻斗车 1 号（作业）', position: [38, 0, 28], rotationY: 0, interactive: 'truck' },

  // 东侧开挖区：三台挖机 + 场地设施，右栏「动画控制」里能单独启停
  // 三台彼此间隔 ≥14m，都避开主挖机（38,19）的摆臂扇区
  // 2 号挖机逆时针转 90°，铲斗正对 4 号土堆 (22,20)
  { file: 'excavator.glb', label: '挖掘机 2 号', position: [24, 0, 13], rotationY: -Math.PI / 2, interactive: 'excavator' },
  { file: 'excavator.glb', label: '挖掘机 3 号', position: [52, 0, 16], rotationY: -Math.PI / 2, interactive: 'excavator' },
  // 临时仓库：门式轻钢，卷帘门朝南，门前是装卸区；东边线和工具房对齐
  { file: 'warehouse.glb', label: '临时仓库', position: [44, 0, -9] },
  // 临时办公与工具房，退到仓库前方，不挡仓库正面
  { file: 'site_office.glb', label: '现场临时办公与工具房', position: [46, 0, 6], rotationY: Math.PI },
  // 休息棚 4 座一字排开，间距 2m
  { file: 'rest_shed.glb', label: '休息棚（茶水亭）1 号', position: [21, 0, -19.2] },
  { file: 'rest_shed.glb', label: '休息棚（茶水亭）2 号', position: [30.5, 0, -19.2] },
  { file: 'rest_shed.glb', label: '休息棚（茶水亭）3 号', position: [40, 0, -19.2] },
  { file: 'rest_shed.glb', label: '休息棚（茶水亭）4 号', position: [49.5, 0, -19.2] },

  // 开挖土堆：按底半径 / 堆高缩放，各自独立可点选
  { file: 'dirt_pile.glb', label: '土堆 1 号', position: [48, 0, 26], scale: [3.2, 1.9, 3.2] },
  { file: 'dirt_pile.glb', label: '土堆 2 号', position: [28, 0, 2], scale: [2.4, 1.3, 2.4] },
  { file: 'dirt_pile.glb', label: '土堆 3 号', position: [34, 0, 10], scale: [2.6, 1.6, 2.6] },
  { file: 'dirt_pile.glb', label: '土堆 4 号', position: [22, 0, 20], scale: [2.6, 1.7, 2.6] },
  { file: 'dirt_pile.glb', label: '土堆 5 号', position: [28, 0, 28], scale: [2.2, 1.4, 2.2] },
  { file: 'dirt_pile.glb', label: '土堆 6 号', position: [32, 0, 21], scale: [2.0, 1.2, 2.0] },

  // 基坑：独立可点选，1 号东边和 4 号楼东边线对齐
  { file: 'pit.glb', label: '基坑 1 号', position: [-22, 0, -40], scale: [20 / 17, 1, 1] },
  { file: 'pit.glb', label: '基坑 2 号', position: [3.5, 0, -40] },

  // 基坑混凝土浇筑：两台搅拌车缩到与翻斗车同尺寸，停在两坑之间
  // 车长 9.6m × 0.9 ≈ 8.6m，南北向排在两坑间的 7m 条带上，间距 11m 不重叠
  { file: 'mixer_truck.glb', label: '水泥搅拌车 1 号', position: [-8.5, 0, -33.5], rotationY: Math.PI / 2, rotationX: 0.05, scale: [0.9, 0.9, 0.9], interactive: 'mixer' },
  { file: 'mixer_truck.glb', label: '水泥搅拌车 2 号', position: [-8.5, 0, -44.5], rotationY: Math.PI / 2, rotationX: 0.05, scale: [0.9, 0.9, 0.9], interactive: 'mixer' },

  // 马路对面南侧空地：整齐停放的自卸车队
  // 2 ~ 16 号，间距 5m，整排以 x = 13 居中
  { file: 'dump_truck.glb', label: '自卸翻斗车 2 号（停放）', position: [-22, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 3 号（停放）', position: [-17, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 4 号（停放）', position: [-12, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 5 号（停放）', position: [-7, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 6 号（停放）', position: [-2, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 7 号（停放）', position: [3, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 8 号（停放）', position: [8, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 9 号（停放）', position: [13, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 10 号（停放）', position: [18, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 11 号（停放）', position: [23, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 12 号（停放）', position: [28, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 13 号（停放）', position: [33, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 14 号（停放）', position: [38, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 15 号（停放）', position: [43, 0, 46], rotationY: -Math.PI / 2 },
  { file: 'dump_truck.glb', label: '自卸翻斗车 16 号（停放）', position: [48, 0, 46], rotationY: -Math.PI / 2 },
]

// 围挡走向，只给起终点，SiteBuilder 按 fence.glb 单段长度自动铺满
export const FENCE_RUNS = [
  { from: [-31.8, 55], to: [55, 55] }, // 南侧，大门人行通道以东
  { from: [-55, 55], to: [-44, 55] }, // 南侧，大门以西
  { from: [55, 55], to: [55, -55] }, // 东侧
  { from: [-55, 55], to: [-55, -55] }, // 西侧
  { from: [-55, -55], to: [55, -55] }, // 北侧
  // 生活区隔离墙只隔西侧和南侧，南侧在宿舍楼前留出可漫游的间距
  { from: [15, -55], to: [15, -24] }, // 生活区西侧
  { from: [15, -24], to: [31.5, -24] }, // 生活区南侧，大门以西
  { from: [38.5, -24], to: [55, -24] }, // 生活区南侧，大门以东
]

// 围挡模型文件名，不在 PLACEMENTS 里，由 FENCE_RUNS 自动铺
export const FENCE_MODEL = 'fence.glb'

// fence.glb 单段实际长度：FENCE_COUNT(6) × FENCE_PANEL_W(3m)
export const FENCE_MODEL_LENGTH = 18

// 路灯布点：只沿围墙走一圈，场内道路不另摆灯
// 给走向和间距，SiteBuilder 沿每段等距摆灯，灯臂自动朝向场内
export const LAMP_MODEL = 'lamp_post.glb'
export const LAMP_SPACING = 24
export const LAMP_RUNS = [
  { from: [-53, 53], to: [53, 53] }, // 南侧围墙
  { from: [53, -53], to: [-53, -53] }, // 北侧围墙
  { from: [-53, 53], to: [-53, -53] }, // 西侧围墙
  { from: [53, 53], to: [53, -53] }, // 东侧围墙
]

// 需要预加载的全部模型文件
export const MODEL_FILES = [
  ...new Set([...PLACEMENTS.map((p) => p.file), FENCE_MODEL, LAMP_MODEL]),
]

// 漫游出生点：在大门外侧的进场道路上，正对大门
// yaw = 0 朝 -Z，也就是朝着 z=55 的大门往里看，一进门就走进场地
export const ROAM_SPAWN = {
  position: [-39, 0.02, 61],
  yaw: 0,
}
