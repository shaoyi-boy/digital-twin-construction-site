/**
 * 工地作业分区
 *
 * 「人员」与「风险模拟」两套系统共用一份分区表：
 *   · 人员系统按分区把工人摆在各自的作业面里，并按分区统计在场人数；
 *   · 风险系统按分区判定影响范围（火势蔓延到哪个分区、哪些分区的人要撤离）。
 *
 * 每个分区由若干矩形组成（rects），矩形写成 [中心 x, 中心 z, 半宽 x, 半高 z]，
 * 坐标与 layout.js 一致：场地 110×110、原点居中、X 向东、Z 向南（+Z 是大门一侧）。
 * 所有矩形都收在各自模型的实际占地之内，保证工人站得住、站点不悬空。
 */

export const ZONES = [
  {
    key: 'structure',
    label: '主体结构楼层内',
    // 2×2 柱网的四栋楼，每栋 18×18 的占地
    rects: [[-3, -2, 7.5, 7.5], [-3, 28, 7.5, 7.5], [-30, 28, 7.5, 7.5], [-30, -2, 7.5, 7.5]],
    flammable: true, // 脚手架密目安全网属易燃物
    headcount: 10,
  },
  {
    key: 'crane',
    label: '塔吊作业区',
    rects: [[19, -11, 12, 10]],
    headcount: 5,
  },
  {
    key: 'pit',
    label: '基坑区',
    rects: [[-22, -40, 9, 10], [3.5, -40, 7.5, 10]],
    headcount: 6,
  },
  {
    key: 'material',
    label: '材料堆场 / 钢筋加工区',
    rects: [[30, 10, 12, 10]],
    flammable: true, // 木模板堆、方木、沥青等易燃材料
    headcount: 5,
  },
  {
    key: 'warehouse',
    label: '仓库内',
    rects: [[44, -9, 7, 5]],
    flammable: true, // 型材、模板、电缆盘等可燃周转材料
    headcount: 3,
  },
  {
    key: 'camp',
    label: '生活区',
    rects: [[16, -30, 8, 5], [36, -30, 8, 5]],
    headcount: 4,
  },
  {
    key: 'gate',
    label: '大门口',
    rects: [[-39, 49, 5, 4]],
    headcount: 3,
  },
]

/** 按 key 取分区定义 */
export function zoneByKey(key) {
  return ZONES.find((z) => z.key === key)
}

/** 分区矩形总权重（按面积），供随机撒点用 */
export function rectArea([, , hx, hz]) {
  return hx * hz * 4
}

/** 紧急集合点（大门内侧的主路上），疏散时工人往这里集中 */
export const ASSEMBLY = { x: -39, z: 44, hx: 7, hz: 4 }
