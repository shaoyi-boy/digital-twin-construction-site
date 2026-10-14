// 施工现场作业分区，人员系统和风险模拟共用。

// rect = [中心x, 中心z, 半宽x, 半高z]，坐标同 layout.js，+Z 是大门一侧
export const ZONES = [
  {
    key: 'structure',
    label: '主体结构楼层内',
    // 四栋楼各占 18×18
    rects: [[-3, -2, 7.5, 7.5], [-3, 28, 7.5, 7.5], [-30, 28, 7.5, 7.5], [-30, -2, 7.5, 7.5]],
    flammable: true, // 脚手架密目网易燃
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
    flammable: true, // 木模板、方木、沥青等易燃
    headcount: 5,
  },
  {
    key: 'warehouse',
    label: '仓库内',
    rects: [[44, -9, 7, 5]],
    flammable: true, // 型材、模板、电缆盘可燃
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

export function zoneByKey(key) {
  return ZONES.find((z) => z.key === key)
}

// 矩形面积权重，随机撒点用
export function rectArea([, , hx, hz]) {
  return hx * hz * 4
}

// 紧急集合点，大门内侧主路上，疏散时工人往这集中
export const ASSEMBLY = { x: -39, z: 44, hx: 7, hz: 4 }
