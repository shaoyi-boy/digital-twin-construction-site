/**
 * 工地平面布置表
 *
 * 【坐标约定】
 * three.js 是 Y 轴向上、地面为 XZ 平面。
 * Blender 导出 glTF 时会自动做 (X, Y, Z) -> (X, Z, -Y) 的转换，所以：
 *
 *     这里填的坐标  =  Blender 里的 (x, z, -y)
 *
 * 直观理解：X 向右，Z 向前，+Z 一侧是工地大门（南侧）。
 * 场地原点 (0,0,0) 在工地正中央，尺寸 110m × 110m。
 */

// 与 Blender 端 config.py 里的 SITE_SIZE 保持一致
export const SITE_SIZE = 110

/**
 * 模型摆放表
 * file      —— public/models 下的文件名
 * label     —— 显示名，同时作为三维对象的 name
 * position  —— [x, y, z]，y 一般填 0（模型自身原点就在地面）
 * rotationY —— 绕 Y 轴旋转（弧度），用于让模型正面朝外
 * interactive —— 参与交互动画（挖掘机手臂、翻斗车车厢）
 */
export const PLACEMENTS = [
  // ---------------- 场地 ----------------
  {
    file: 'site_ground.glb',
    label: '场地与道路',
    position: [0, 0, 0],
    castShadow: false,
  },
  // 西侧长条绿化带（西围墙 ↔ 南北主路之间，被东西主路自然断开）
  { file: 'green_belt.glb', label: '绿化带', position: [0, 0, 0] },

  // ---------------- 出入口（南侧大门，门柱正好落在围墙线上） ----------------
  // 大门总宽 12.2m（车行道 8 + 两侧门柱 2×1 + 东侧人脸识别人行通道 2.2），
  // 与南侧围墙缺口 -44 ~ -31.8 完全等宽，门口与围墙严丝合缝，没有空隙。
  { file: 'site_gate.glb', label: '工地大门', position: [-39, 0, 55] },

  // ---------------- 主体结构区（2×2 柱网：X 向两列、Z 向两排，行距/列距一致） ----------------
  // 四栋楼完全对齐：东列 x = -3，西列 x = -30；前/后排 z = -2 与 z = 28
  // 1 号楼单独加高 2 层（新浇筑层，外观与其它楼不同），塔吊就服务这栋
  { file: 'building_frame_tall.glb', label: '在建楼层 1 号（加高）', position: [-3, 0, -2] },
  { file: 'building_frame.glb', label: '在建楼层 2 号', position: [-3, 0, 28] },
  { file: 'building_frame.glb', label: '在建楼层 3 号', position: [-30, 0, 28] },
  { file: 'building_frame_plus.glb', label: '在建楼层 4 号', position: [-30, 0, -2] },
  // 塔吊移到 1 号楼东侧，与原来西侧的位置关于楼体中轴（x = 6）对称，大臂转 180° 朝 -X 覆盖楼层
  // 已整体向楼宇方向（-X）平移 2.5m，缩小与 1 号楼的间距；附墙杆同步收短，仍正好顶到东外墙
  { file: 'tower_crane.glb', label: '塔吊', position: [22.5, 0, -11], rotationY: Math.PI },
  // 外脚手架：南面两道、北面两道，均贴 1 号楼外墙
  // 旋转统一取「连墙件朝向楼体、密目网朝外」：南面两道转 180°，北面两道不转，
  // 因此北/北2 与南一/南二各自同向、贴墙方式一致。
  // 脚手架模型原点在西端、向东伸 7.75m：北2 放 x = 6 时足迹为 x = 5.75 ~ 13.75，
  // 与南二完全同向同距（南二 = 南一 + 7.5m），北面两道与南面两道一样互相搭接、不留空隙，
  // 东端 13.75 仍在 1 号楼东外墙（x = 15）以内、不超出楼宇。
  { file: 'scaffolding.glb', label: '外脚手架 南一', position: [6, 0, -1.9], rotationY: Math.PI },
  { file: 'scaffolding.glb', label: '外脚手架 南二', position: [13.5, 0, -1.9], rotationY: Math.PI },
  { file: 'scaffolding.glb', label: '外脚手架 北', position: [-1.5, 0, -20.1] },
  { file: 'scaffolding.glb', label: '外脚手架 北2', position: [6, 0, -20.1] },

  // ---------------- 工人生活区（东北，6 排宿舍 + 出入口大门） ----------------
  // 楼房已在模型内整体旋转 180°，门窗朝南（对着工地大门）
  { file: 'labor_camp.glb', label: '工人生活区 A', position: [16, 0, -27.8] },
  { file: 'labor_camp.glb', label: '工人生活区 B', position: [36, 0, -27.8] },
  // 洗漱池单独摆一处：加长到 9.6m，仍在 B 区院内、不越到生活区大门正前方
  { file: 'camp_basin.glb', label: '生活区洗漱池', position: [45, 0, -27.4] },
  { file: 'camp_gate.glb', label: '生活区大门', position: [35, 0, -24] },

  // ---------------- 土方作业区（东南，全部让开东西主路） ----------------
  // 1 号挖机为交互动画机，整体旋转 135°，静止/开挖姿态的铲斗正对西北侧土堆
  { file: 'excavator.glb', label: '挖掘机 1 号（作业）', position: [38, 0, 19], rotationY: Math.PI * 0.75, interactive: 'excavator' },
  // 1 号翻斗车为交互动画车：车厢朝西倾倒，卸土正好落在西侧土堆上
  { file: 'dump_truck.glb', label: '自卸翻斗车 1 号（作业）', position: [38, 0, 28], rotationY: 0, interactive: 'truck' },

  // ---------------- 东侧开挖区：三台挖机 + 场地设施 ----------------
  // 三台挖机都能在右侧「动画控制」里单独启停，也可以同时动作
  // 三台挖机相互间隔 ≥14m；且都避开主挖机（38,19）的摆臂扇区
  // 2 号挖机：逆时针转 90°，铲斗正对 4 号土堆 (22,20)
  { file: 'excavator.glb', label: '挖掘机 2 号', position: [24, 0, 13], rotationY: -Math.PI / 2, interactive: 'excavator' },
  { file: 'excavator.glb', label: '挖掘机 3 号', position: [52, 0, 16], rotationY: -Math.PI / 2, interactive: 'excavator' },
  // 临时仓库（门式轻钢结构，正面卷帘门朝南，门前为装卸区）
  // 右移后东边线与工具房、4 号休息棚对齐（x ≈ 53）
  { file: 'warehouse.glb', label: '临时仓库', position: [44, 0, -9] },
  // 现场临时办公与工具房（退到仓库前方一段距离，不遮挡仓库正面）
  { file: 'site_office.glb', label: '现场临时办公与工具房', position: [46, 0, 6], rotationY: Math.PI },
  // 休息棚 / 茶水亭：一字排开 4 座，间距 2m、两端各留 ~2m 通行空隙
  { file: 'rest_shed.glb', label: '休息棚（茶水亭）1 号', position: [21, 0, -19.2] },
  { file: 'rest_shed.glb', label: '休息棚（茶水亭）2 号', position: [30.5, 0, -19.2] },
  { file: 'rest_shed.glb', label: '休息棚（茶水亭）3 号', position: [40, 0, -19.2] },
  { file: 'rest_shed.glb', label: '休息棚（茶水亭）4 号', position: [49.5, 0, -19.2] },

  // ---------------- 开挖土堆（单位模型按底半径 / 堆高缩放，各自独立可点选） ----------------
  { file: 'dirt_pile.glb', label: '土堆 1 号', position: [48, 0, 26], scale: [3.2, 1.9, 3.2] },
  { file: 'dirt_pile.glb', label: '土堆 2 号', position: [28, 0, 2], scale: [2.4, 1.3, 2.4] },
  { file: 'dirt_pile.glb', label: '土堆 3 号', position: [34, 0, 10], scale: [2.6, 1.6, 2.6] },
  { file: 'dirt_pile.glb', label: '土堆 4 号', position: [22, 0, 20], scale: [2.6, 1.7, 2.6] },
  { file: 'dirt_pile.glb', label: '土堆 5 号', position: [28, 0, 28], scale: [2.2, 1.4, 2.2] },
  { file: 'dirt_pile.glb', label: '土堆 6 号', position: [32, 0, 21], scale: [2.0, 1.2, 2.0] },

  // ---------------- 基坑（独立模型，可单独点选；1 号东边与 4 号楼东边线对齐） ----------------
  { file: 'pit.glb', label: '基坑 1 号', position: [-22, 0, -40], scale: [20 / 17, 1, 1] },
  { file: 'pit.glb', label: '基坑 2 号', position: [3.5, 0, -40] },

  // ---------------- 基坑内混凝土浇筑：两台水泥搅拌车（缩小到与翻斗车同尺寸，停在两坑之间的空地） ----------------
  // 车长 9.6m × 0.9 ≈ 8.6m，南北向排在两坑之间的 7m 条带上，间距 11m 不重叠、不出条带
  { file: 'mixer_truck.glb', label: '水泥搅拌车 1 号', position: [-8.5, 0, -33.5], rotationY: Math.PI / 2, rotationX: 0.05, scale: [0.9, 0.9, 0.9], interactive: 'mixer' },
  { file: 'mixer_truck.glb', label: '水泥搅拌车 2 号', position: [-8.5, 0, -44.5], rotationY: Math.PI / 2, rotationX: 0.05, scale: [0.9, 0.9, 0.9], interactive: 'mixer' },

  // ---------------- 马路对面（南侧空地）：整齐停放的自卸车队 ----------------
  // 2 ~ 16 号，间距 5m，整排以 x = 13 居中（x = 38 那台与作业车隔路正对）
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

/**
 * 围挡走向
 * 只给起点和终点，SiteBuilder 会按 fence.glb 的单段长度自动铺满并缩放对齐，
 * 所以改场地大小只要改这里的两组坐标就行。
 */
export const FENCE_RUNS = [
  { from: [-31.8, 55], to: [55, 55] }, // 南侧（大门人行通道以东）
  { from: [-55, 55], to: [-44, 55] }, // 南侧（大门以西）
  { from: [55, 55], to: [55, -55] }, // 东侧
  { from: [-55, 55], to: [-55, -55] }, // 西侧
  { from: [-55, -55], to: [55, -55] }, // 北侧
  // 工人生活区隔离墙：只隔西侧和南侧，北、东两侧本来就是场地围墙
  // 南侧隔离墙在宿舍楼与前方场地之间留出可漫游通行的间距
  { from: [15, -55], to: [15, -24] }, // 生活区西侧
  { from: [15, -24], to: [31.5, -24] }, // 生活区南侧（大门以西）
  { from: [38.5, -24], to: [55, -24] }, // 生活区南侧（大门以东）
]

// 围挡模型文件名（它不在 PLACEMENTS 里，由 FENCE_RUNS 自动铺）
export const FENCE_MODEL = 'fence.glb'

// fence.glb 单段实际长度：FENCE_COUNT(6) × FENCE_PANEL_W(3m)
export const FENCE_MODEL_LENGTH = 18

/**
 * 路灯布点
 * 只沿围墙四周走一圈（四排），场内道路上不再单独摆灯。
 * 给走向和间距，SiteBuilder 会沿每段等距摆灯，灯臂自动朝向场地内侧。
 */
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

/**
 * 漫游出生点
 * 放在大门外侧（南侧）的进场道路上，正对大门；yaw = 0 表示朝 -Z，
 * 也就是朝着大门（大门在 z = 55）往工地里看，玩家一进门就走进场地。
 */
export const ROAM_SPAWN = {
  position: [-39, 0.02, 61],
  yaw: 0,
}
