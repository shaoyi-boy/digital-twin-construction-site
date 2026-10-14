# -*- coding: utf-8 -*-
"""结构类模型，尺寸按常见施工规范做了简化。"""

import math

from utils import MeshBuilder, parent_to
import config as C


# 塔吊（QTZ63 自升式）
def build_tower_crane(collection=None):
    """QTZ63 塔吊，拆成 5 个节点，对应前端 Crane.js 的约定。
    根 -> Slew 回转体 -> Trolley 小车 / HookRope 钢丝绳 / HookBlock 吊钩。
    """
    root = MeshBuilder("TowerCrane")
    slew = MeshBuilder("TowerCrane_Slew")
    trolley = MeshBuilder("TowerCrane_Trolley")
    hook = MeshBuilder("TowerCrane_HookBlock")
    rope = MeshBuilder("TowerCrane_HookRope")

    yellow = "steel_yellow"
    gray = "steel_gray"

    half = C.CRANE_MAST_SIZE / 2.0     # 塔身半宽
    h = C.CRANE_SECTION_H              # 标准节高度
    m = C.CRANE_MEMBER                 # 杆件截面

    base_z = 1.0
    mast_top = base_z + C.CRANE_SECTION_N * h      # 塔身顶部标高
    slew_z = mast_top + 0.4                        # 回转支承中心标高
    dz = slew_z                                    # 回转局部坐标 = 世界坐标 - dz

    # 不动部分（根节点）

    root.box((4.5, 4.5, 1.0), (0, 0, 0.5), mat="concrete")   # 基础承台

    # 塔身标准节
    for i in range(C.CRANE_SECTION_N):
        z0 = base_z + i * h
        z1 = z0 + h

        for sx in (-half, half):
            for sy in (-half, half):
                root.beam((sx, sy, z0), (sx, sy, z1), m, mat=yellow)

        # 上横腹杆
        for sy in (-half, half):
            root.beam((-half, sy, z1 - m), (half, sy, z1 - m), m, mat=yellow)
        for sx in (-half, half):
            root.beam((sx, -half, z1 - m), (sx, half, z1 - m), m, mat=yellow)

        # 斜腹杆，相邻节交替成 Z 字
        if i % 2 == 0:
            root.beam((-half, -half, z0), (half, -half, z1 - m), m * 0.85, mat=yellow)
            root.beam((half, half, z0), (-half, half, z1 - m), m * 0.85, mat=yellow)
        else:
            root.beam((half, -half, z0), (-half, -half, z1 - m), m * 0.85, mat=yellow)
            root.beam((-half, half, z0), (half, half, z1 - m), m * 0.85, mat=yellow)

    # 节点板，每个节头四角一块
    for i in range(1, C.CRANE_SECTION_N):
        zj = base_z + i * h
        for sx in (-half, half):
            for sy in (-half, half):
                root.box((0.24, 0.24, 0.12), (sx, sy, zj), mat=gray)

    # 塔身爬梯，通高
    lad_y = C.CRANE_LADDER_FACE * (half + 0.06)
    for sx in (-0.22, 0.22):
        root.beam((sx, lad_y, base_z), (sx, lad_y, mast_top), 0.045, mat="galvanized")
    rung_gap = 0.5
    for k in range(int((mast_top - base_z) / rung_gap) + 1):
        zr = base_z + k * rung_gap
        root.beam((-0.22, lad_y, zr), (0.22, lad_y, zr), 0.035, mat="galvanized")

    # 休息平台 + 栏杆
    rp_z = base_z + C.CRANE_REST_PLATFORM_Z
    pl_half = 1.7
    root.box((pl_half * 2.0, pl_half * 2.0, 0.06), (0.0, 0.0, rp_z), mat=gray)
    for sx in (-pl_half, pl_half):
        for sy in (-pl_half, pl_half):
            root.beam((sx, sy, rp_z), (sx, sy, rp_z + 1.1), 0.05, mat="galvanized")
    for zz in (rp_z + 1.1, rp_z + 0.55):
        for sy in (-pl_half, pl_half):
            root.beam((-pl_half, sy, zz), (pl_half, sy, zz), 0.045, mat="galvanized")
        for sx in (-pl_half, pl_half):
            root.beam((sx, -pl_half, zz), (sx, pl_half, zz), 0.045, mat="galvanized")

    # 附墙，只朝 +X 单向伸出
    tie_reach = C.CRANE_WALL_TIE_REACH
    for tie_z in C.CRANE_WALL_TIE_Z:
        zt2 = base_z + tie_z
        c = half + 0.14
        for sy in (-c, c):
            root.beam((-c, sy, zt2), (c, sy, zt2), 0.08, mat=gray)
        for sx in (-c, c):
            root.beam((sx, -c, zt2), (sx, c, zt2), 0.08, mat=gray)
        reach_x = half + tie_reach
        # 水平拉杆
        for sy in (-0.55, 0.55):
            root.beam((c, sy, zt2), (reach_x, sy, zt2), 0.085, mat=gray)
            root.box((0.5, 0.5, 0.4), (reach_x + 0.25, sy, zt2), mat="concrete_dark")
        # 下斜撑
        root.beam((c, -0.9, zt2 - 1.6), (reach_x, -0.55, zt2), 0.075, mat=gray)
        root.beam((c, 0.9, zt2 - 1.6), (reach_x, 0.55, zt2), 0.075, mat=gray)

    # 爬升套架
    cf_w = half + 0.45
    cf_z0 = mast_top - 3.2
    cf_z1 = mast_top + 0.6
    for sx in (-cf_w, cf_w):
        for sy in (-cf_w, cf_w):
            root.beam((sx, sy, cf_z0), (sx, sy, cf_z1), 0.10, mat=gray)
    for zz in (cf_z0, cf_z0 + 1.7, cf_z1):
        for sy in (-cf_w, cf_w):
            root.beam((-cf_w, sy, zz), (cf_w, sy, zz), 0.09, mat=gray)
        for sx in (-cf_w, cf_w):
            root.beam((sx, -cf_w, zz), (sx, cf_w, zz), 0.09, mat=gray)
    for sy in (-cf_w, cf_w):
        root.beam((-cf_w, sy, cf_z0), (cf_w, sy, cf_z1 - 0.4), 0.07, mat=gray)
        root.beam((cf_w, sy, cf_z0), (-cf_w, sy, cf_z1 - 0.4), 0.07, mat=gray)

    # 主电缆
    root.cylinder(0.04, mast_top - base_z, (-(half + 0.08), 0.0, (base_z + mast_top) / 2.0),
                  mat="cable_black", segments=6)

    # 回转部分，所有 z 减 dz，原点在回转支承中心

    # 回转机构
    slew.box((2.4, 2.4, 0.8), (0, 0, slew_z - dz), mat=gray)

    # 司机室
    cab_w, cab_d, cab_h = C.CRANE_CAB_SIZE
    slew.box((cab_w, cab_d, cab_h),
             (half + cab_w / 2.0, 0, mast_top + cab_h / 2.0 - dz), mat="wall_white")
    slew.box((cab_w * 0.8, 0.06, cab_h * 0.5),
             (half + cab_w / 2.0, -cab_d / 2.0, mast_top + cab_h * 0.62 - dz), mat="glass")

    # 塔帽（四棱锥台）
    apex_base_z = slew_z + 0.4
    apex_top_z = apex_base_z + 4.0
    a0 = half * 1.33
    a1 = 0.25
    for sx in (-a0, a0):
        for sy in (-a0, a0):
            slew.beam((sx, sy, apex_base_z - dz),
                      (a1 * (1 if sx > 0 else -1),
                       a1 * (1 if sy > 0 else -1), apex_top_z - dz),
                      0.11, mat=yellow)

    # 大臂，三角桁架沿 +X 伸出
    jib_x0 = 1.6
    jib_len = C.CRANE_JIB_LEN
    jib_x1 = jib_x0 + jib_len
    zb, zt = 32.2, 33.5
    zbs, zts = zb - dz, zt - dz
    chord = 0.09
    jw = 0.55                                       # 下弦半间距

    slew.beam((jib_x0, -jw, zbs), (jib_x1, -jw, zbs), chord, mat=yellow)
    slew.beam((jib_x0, jw, zbs), (jib_x1, jw, zbs), chord, mat=yellow)
    slew.beam((jib_x0, 0.0, zts), (jib_x1, 0.0, zts), chord, mat=yellow)

    bays = int(math.floor(jib_len / 2.5))
    step = jib_len / float(bays)
    for i in range(bays + 1):
        x = jib_x0 + i * step
        slew.beam((x, -jw, zbs), (x, 0.0, zts), chord * 0.8, mat=yellow)
        slew.beam((x, jw, zbs), (x, 0.0, zts), chord * 0.8, mat=yellow)
    for i in range(bays):
        x0 = jib_x0 + i * step
        x1 = x0 + step
        if i % 2 == 0:
            slew.beam((x0, -jw, zbs), (x1, 0.0, zts), chord * 0.7, mat=yellow)
        else:
            slew.beam((x1, -jw, zbs), (x0, 0.0, zts), chord * 0.7, mat=yellow)

    # 平衡臂，沿 -X
    cj_x0 = -1.6
    cj_len = C.CRANE_COUNTER_LEN
    cj_x1 = cj_x0 - cj_len
    slew.beam((cj_x0, -0.5, zbs), (cj_x1, -0.5, zbs), chord, mat=yellow)
    slew.beam((cj_x0, 0.5, zbs), (cj_x1, 0.5, zbs), chord, mat=yellow)
    slew.beam((cj_x0, 0.0, zbs + 1.1), (cj_x1, 0.0, zbs + 1.1), chord, mat=yellow)
    for i in range(1, 5):
        x = cj_x0 + (cj_x1 - cj_x0) * i / 5.0
        slew.beam((x, -0.5, zbs), (x, 0.0, zbs + 1.1), chord * 0.8, mat=yellow)
        slew.beam((x, 0.5, zbs), (x, 0.0, zbs + 1.1), chord * 0.8, mat=yellow)

    # 平衡臂走道平台
    deck_z = zb + 0.03
    deck_x0 = cj_x1 - 0.55                  # 平台尾部，配重外侧留出挡板位
    deck_x1 = cj_x0 + 0.15                  # 平台根部
    deck_cx = (deck_x0 + deck_x1) / 2.0
    deck_len = deck_x1 - deck_x0
    slew.box((deck_len, 1.06, 0.06), (deck_cx, 0.0, deck_z - dz), mat=gray)

    # 配重块，4 组夹住平台上下叠放（下 2.00m / 上 1.02m）
    cwt, cw_gap = 0.55, 0.07
    cw_ws = (1.30, 1.24, 1.30, 1.24)
    cw_h_lo, cw_h_up = 2.00, 1.02
    cw_x0 = deck_x0 + 0.22
    cw_top = deck_z - 0.03                  # 平台下皮
    cw_bot_up = deck_z + 0.03               # 平台上皮
    for i, cw_w in enumerate(cw_ws):
        cx_ = cw_x0 + cwt / 2.0 + i * (cwt + cw_gap)
        slew.box((cwt, cw_w, cw_h_lo), (cx_, 0.0, cw_top - cw_h_lo / 2.0 - dz),
                 mat="concrete_dark")
        slew.box((cwt, cw_w, cw_h_up), (cx_, 0.0, cw_bot_up + cw_h_up / 2.0 - dz),
                 mat="concrete_dark")
    cw_x1 = cw_x0 + 4 * (cwt + cw_gap) - cw_gap
    cw_cx = (cw_x0 + cw_x1) / 2.0
    cw_w = max(cw_ws)
    cw_h = cw_h_lo + 0.06 + cw_h_up
    cw_mid = (cw_top - cw_h_lo + cw_bot_up + cw_h_up) / 2.0
    # 两端限位挡板 + 穿心拉杆 + 吊耳
    for sx in (cw_x0 - 0.08, cw_x1 + 0.08):
        slew.box((0.13, cw_w + 0.20, cw_h), (sx, 0.0, cw_mid - dz), mat=gray)
    for ry in (-0.44, 0.44):
        for zz in (cw_top - 0.55, cw_top - 1.45, cw_bot_up + 0.52):
            slew.cylinder(0.032, cw_x1 - cw_x0 + 0.6, (cw_cx, ry, zz - dz),
                          rotation=(0.0, math.pi / 2.0, 0.0), mat="galvanized", segments=8)
    for sx in (cw_x0 + 0.7, cw_x1 - 0.7):
        for ry in (-0.30, 0.30):
            slew.box((0.16, 0.30, 0.26), (sx, ry, cw_bot_up + cw_h_up + 0.13 - dz),
                     mat=gray)

    # 塔帽顶盖
    slew.box((0.44, 0.44, 0.26), (0.0, 0.0, apex_top_z - 0.10 - dz), mat=gray)

    # 臂根与塔身连接段
    slew_top = slew_z + 0.4
    slew_bot = slew_z - 0.4
    for ry in (-0.55, 0.55):
        slew.beam((half * 1.33, ry, zbs), (jib_x0, ry, zbs), 0.10, mat=yellow)
        slew.beam((half * 1.33, ry, slew_top - dz), (half * 1.33, ry, zbs), 0.11, mat=yellow)
        slew.beam((half * 1.33, ry, slew_bot - dz), (half * 1.33 + 1.1, ry, zbs), 0.08, mat=yellow)
    slew.beam((half * 1.33, 0.0, slew_top - dz), (half * 1.33, 0.0, zts), 0.11, mat=yellow)
    slew.beam((half * 1.33, 0.0, zts), (jib_x0, 0.0, zts), 0.09, mat=yellow)

    for ry in (-0.5, 0.5):
        slew.beam((-half * 1.33, ry, zbs), (cj_x0, ry, zbs), 0.10, mat=yellow)
        slew.beam((-half * 1.33, ry, slew_top - dz), (-half * 1.33, ry, zbs), 0.11, mat=yellow)
        slew.beam((-half * 1.33, ry, slew_bot - dz), (-half * 1.33 - 1.1, ry, zbs), 0.08, mat=yellow)
    slew.beam((-half * 1.33, 0.0, slew_top - dz), (-half * 1.33, 0.0, zbs + 1.1), 0.11, mat=yellow)
    slew.beam((-half * 1.33, 0.0, zbs + 1.1), (cj_x0, 0.0, zbs + 1.1), 0.09, mat=yellow)

    # 司机室平台 + 栏杆 + 雨棚
    cab_cx = half + cab_w / 2.0
    cb_hx = (cab_w + 0.5) / 2.0
    cb_hy = (cab_d + 0.5) / 2.0
    slew.box((cb_hx * 2.0, cb_hy * 2.0, 0.06), (cab_cx, 0.0, mast_top + 0.03 - dz), mat=gray)
    for sx in (cab_cx - cb_hx, cab_cx + cb_hx):
        for sy in (-cb_hy, cb_hy):
            slew.beam((sx, sy, mast_top - dz), (sx, sy, mast_top + 1.0 - dz), 0.045, mat="galvanized")
    for zz in (mast_top + 1.0, mast_top + 0.5):
        slew.beam((cab_cx - cb_hx, cb_hy, zz - dz), (cab_cx + cb_hx, cb_hy, zz - dz), 0.045, mat="galvanized")
        slew.beam((cab_cx - cb_hx, -cb_hy, zz - dz), (cab_cx + cb_hx, -cb_hy, zz - dz), 0.045, mat="galvanized")
        slew.beam((cab_cx + cb_hx, -cb_hy, zz - dz), (cab_cx + cb_hx, cb_hy, zz - dz), 0.045, mat="galvanized")
    slew.box((cab_w + 0.6, cab_d + 0.6, 0.06), (cab_cx, 0.0, mast_top + cab_h + 0.10 - dz),
             mat="roof_blue")

    # 起升卷扬机
    winch_x = -4.2
    slew.box((2.35, 1.16, 0.08), (winch_x, 0.0, deck_z + 0.07 - dz), mat=gray)
    slew.box((2.0, 1.0, 1.0), (winch_x, 0.0, deck_z + 0.11 + 0.5 - dz), mat=gray)
    slew.cylinder(0.42, 1.5, (winch_x, 0.0, deck_z + 1.06 - dz), rotation=(math.pi / 2.0, 0, 0),
                  mat="galvanized", segments=10)

    # 平衡臂走道栏杆
    for sy in (0.5, -0.5):
        for zz in (deck_z + 1.05, deck_z + 0.55):
            slew.beam((cj_x0, sy, zz - dz), (cj_x1 + 0.35, sy, zz - dz), 0.05, mat="galvanized")
        for i in range(1, 5):
            xx = cj_x0 + (cj_x1 - cj_x0) * i / 5.0
            slew.beam((xx, sy, deck_z + 0.03 - dz), (xx, sy, deck_z + 1.05 - dz), 0.045,
                      mat="galvanized")

    # 大臂走道栏杆
    n_post = 8
    for i in range(n_post + 1):
        xx = jib_x0 + jib_len * i / float(n_post)
        slew.beam((xx, 0.0, zts + 0.10), (xx, 0.0, zts + 1.10), 0.05, mat="galvanized")
    for zz in (zt + 1.10, zt + 0.62):
        slew.beam((jib_x0, 0.0, zz - dz), (jib_x1, 0.0, zz - dz), 0.05, mat="galvanized")

    # 大臂走道板
    slew.box((jib_len + 0.6, 0.76, 0.05), ((jib_x0 + jib_x1) / 2.0, 0.0, zt + 0.07 - dz),
             mat=gray)

    # 避雷针 + 航空警示灯
    slew.cylinder(0.035, 2.6, (0.0, 0.0, apex_top_z + 1.3 - dz), mat="galvanized", segments=6)
    slew.cylinder(0.12, 0.16, (0.0, 0.0, apex_top_z + 2.6 - dz), mat="lamp_red", segments=8)
    slew.cylinder(0.10, 0.18, (jib_x1, 0.0, zt + 0.10 - dz), mat="lamp_red", segments=8)

    # 变幅小车，原点在小车中心
    trolley_x = jib_x0 + jib_len * 0.5
    for sy in (-0.5, 0.5):
        # 走轮骑在下弦上
        trolley.cylinder(0.15, 0.10, (0.0, sy, 0.10),
                         rotation=(math.pi / 2.0, 0, 0), mat=gray, segments=8)
    trolley.box((1.1, 1.4, 0.45), (0.0, 0.0, -0.25), mat="paint_red")

    # 起升钢丝绳，原点在绳顶，几何沿局部 +Y 向下；
    # 节点绕 X 转 -90°，导出后缩放 scale.z 就是改绳长。
    rope_len = 11.0
    rope_top_z = zb - 0.45
    rope.cylinder(0.03, rope_len, (0.0, rope_len / 2.0, 0.0),
                  rotation=(math.pi / 2.0, 0, 0), mat="cable_black", segments=6)

    # 吊钩总成，原点在滑轮组顶面
    hook_top_offset = 0.125                 # 上抬一点，跟绳底接上
    hook.box((0.52, 0.52, 0.85), (0.0, 0.0, -0.425), mat="paint_red")        # 滑轮组外壳
    hook.cylinder(0.20, 0.52, (0.0, 0.0, -0.675),
                  rotation=(math.pi / 2.0, 0, 0), mat=gray, segments=8)       # 滑轮
    hook.cylinder(0.06, 0.55, (0.0, 0.0, -1.175), mat="galvanized", segments=8)  # 钩身
    hook.box((0.46, 0.18, 0.42), (0.0, 0.0, -1.545), mat="galvanized")       # 钩头

    # 组装层级
    root_obj = root.build(collection)
    if root_obj.data is not None:
        root_obj.data.name = "TowerCrane"

    slew_obj = slew.build(collection)
    slew_obj.location = (0.0, 0.0, slew_z)
    parent_to(slew_obj, root_obj)

    trolley_obj = trolley.build(collection)
    trolley_obj.location = (trolley_x, 0.0, zb - dz)
    parent_to(trolley_obj, slew_obj)

    rope_obj = rope.build(collection)
    rope_obj.rotation_euler = (-math.pi / 2.0, 0.0, 0.0)
    rope_obj.location = (trolley_x, 0.0, rope_top_z - dz)
    parent_to(rope_obj, slew_obj)

    hook_obj = hook.build(collection)
    hook_obj.location = (trolley_x, 0.0, (rope_top_z - rope_len + hook_top_offset) - dz)
    parent_to(hook_obj, slew_obj)

    return root_obj


# 施工升降机（SC200/200）
def build_hoist(collection=None):
    b = MeshBuilder("Hoist")
    blue = "steel_blue"
    gray = "steel_gray"

    rail_w = C.HOIST_RACK_W / 2.0
    h = 1.5                                   # 导轨架标准节高度
    total = C.HOIST_HEIGHT
    n = int(total / h)

    # 基础
    b.box((3.5, 4.0, 0.4), (0, 0, 0.2), mat="concrete")

    # 导轨架，4 根主弦 + 横腹杆
    z0 = 0.4
    for i in range(n):
        z = z0 + i * h
        zn = z + h
        for sx in (-rail_w, rail_w):
            for sy in (-rail_w, rail_w):
                b.beam((sx, sy, z), (sx, sy, zn), 0.08, mat=blue)
        for sy in (-rail_w, rail_w):
            b.beam((-rail_w, sy, zn), (rail_w, sy, zn), 0.07, mat=gray)
        for sx in (-rail_w, rail_w):
            b.beam((sx, -rail_w, zn), (sx, rail_w, zn), 0.07, mat=gray)
        # 单面斜撑
        if i % 2 == 0:
            b.beam((-rail_w, -rail_w, z), (rail_w, -rail_w, zn), 0.06, mat=gray)
        else:
            b.beam((rail_w, -rail_w, z), (-rail_w, -rail_w, zn), 0.06, mat=gray)

    # 齿条，朝吊笼一侧
    b.box((0.12, 0.12, total), (rail_w + 0.06, 0.0, 0.4 + total / 2.0), mat="steel_gray")

    # 吊笼已移除，只留停靠位附件定位
    cw, cd, ch = C.HOIST_CAGE_SIZE
    cage_z = 9.0
    cage_x = rail_w + cw / 2.0 + 0.15

    # 电缆滑车 + 电缆
    cable_x = rail_w + 0.22
    cable_y = -(rail_w + 0.10)
    b.cylinder(C.HOIST_CABLE, total, (cable_x, cable_y, 0.4 + total / 2.0),
               mat="cable_black", segments=6)
    b.box((0.30, 0.24, 0.30), (cable_x, cable_y, cage_z + ch + 0.35), mat="galvanized")

    # 底部缓冲弹簧
    for sy in (-0.45, 0.45):
        b.cylinder(0.13, 0.5, (cage_x, sy, 0.65), mat="paint_red", segments=8)

    # 顶部天轮 + 防坠器
    top_z = 0.4 + total
    b.box((1.2, 1.2, 0.5), (0.0, 0.0, top_z + 0.25), mat="paint_red")
    b.cylinder(0.34, 0.26, (0.0, 0.0, top_z + 0.72), rotation=(math.pi / 2.0, 0, 0),
               mat=gray, segments=10)

    # 底部防护围栏，留出料口
    for sx in (-1.8, 1.8):
        b.beam((sx, -1.8, 0.4), (sx, -1.8, 1.5), 0.06, mat="safety_green")
        b.beam((sx, 1.8, 0.4), (sx, 1.8, 1.5), 0.06, mat="safety_green")
        b.beam((sx, -1.8, 1.5), (sx, 1.8, 1.5), 0.06, mat="safety_green")
    b.beam((-1.8, 1.8, 1.5), (1.8, 1.8, 1.5), 0.06, mat="safety_green")

    return b.build(collection)


# 脚手架（扣件式钢管）
def build_scaffolding(collection=None):
    b = MeshBuilder("Scaffolding")
    tube = "steel_gray"

    dx = C.SCAF_BAY                 # 立杆纵距
    dy = C.SCAF_ROW                 # 立杆横距
    dh = C.SCAF_STEP                # 步距
    nx = C.SCAF_SPAN_X              # 跨数
    nh = C.SCAF_STEP_N              # 步数
    r = C.SCAF_TUBE / 2.0

    len_x = nx * dx
    len_z = nh * dh

    # 立杆
    for i in range(nx + 1):
        x = i * dx
        for y in (0.0, dy):
            b.beam((x, y, 0.0), (x, y, len_z), C.SCAF_TUBE, mat=tube)

    # 大横杆，每步内外各一根
    for k in range(nh + 1):
        z = k * dh
        for y in (0.0, dy):
            b.beam((0.0, y, z), (len_x, y, z), C.SCAF_TUBE, mat=tube)

    # 小横杆，拉结内外两排
    for k in range(nh + 1):
        z = k * dh
        for i in range(nx + 1):
            b.beam((i * dx, 0.0, z), (i * dx, dy, z), C.SCAF_TUBE, mat=tube)

    # 竖向剪刀撑，内外两排通高
    for y in (0.0, dy):
        i = 0
        while i < nx:
            x0 = i * dx
            x1 = min(x0 + 2 * dx, len_x)
            for k in range(nh):
                z0, z1 = k * dh, (k + 1) * dh
                if (i + k) % 2 == 0:
                    b.beam((x0, y, z0), (x1, y, z1), C.SCAF_TUBE * 0.9, mat=tube)
                else:
                    b.beam((x1, y, z0), (x0, y, z1), C.SCAF_TUBE * 0.9, mat=tube)
            i += 2

    # 端面剪刀撑，两端封口
    for x in (0.0, len_x):
        for k in range(nh):
            z0, z1 = k * dh, (k + 1) * dh
            if k % 2 == 0:
                b.beam((x, 0.0, z0), (x, dy, z1), C.SCAF_TUBE * 0.9, mat=tube)
            else:
                b.beam((x, dy, z0), (x, 0.0, z1), C.SCAF_TUBE * 0.9, mat=tube)

    # 脚手板
    for k in range(1, nh + 1):
        z = k * dh
        b.box((len_x, dy, 0.05), (len_x / 2.0, dy / 2.0, z + 0.03), mat="wood")

    # 挡脚板，外侧黄黑警示
    for k in range(1, nh + 1):
        z = k * dh
        b.box((len_x, 0.03, C.SCAF_TOE_H),
              (len_x / 2.0, dy + 0.07, z + 0.03 + C.SCAF_TOE_H / 2.0),
              mat="hazard_yellow")

    # 扣件
    for i in range(nx + 1):
        for k in range(nh + 1):
            b.cylinder(0.07, 0.10, (i * dx, dy, k * dh),
                       rotation=(math.pi / 2.0, 0, 0), mat="galvanized", segments=6)

    # 外侧安全网，按跨分段留缝
    net_y = dy + 0.05
    for i in range(nx):
        b.box((dx - 0.08, 0.02, len_z), (i * dx + dx / 2.0, net_y, len_z / 2.0),
              mat="safety_green")
    # 端面安全网，两头封口
    for x in (-0.05, len_x + 0.05):
        b.box((0.02, dy, len_z), (x, dy / 2.0, len_z / 2.0), mat="safety_green")
    # 网绳
    for i in range(nx + 1):
        b.cylinder(0.02, len_z, (i * dx, net_y + 0.02, len_z / 2.0),
                   mat="cable_black", segments=4)

    # 顶层防护栏杆，上翻 1.2m
    gr = 1.2
    for i in range(nx + 1):
        b.beam((i * dx, dy, len_z), (i * dx, dy, len_z + gr), 0.045, mat="galvanized")
    for zz in (len_z + gr, len_z + gr * 0.5):
        b.beam((0.0, dy, zz), (len_x, dy, zz), 0.045, mat="galvanized")

    # 连墙件，隔跨隔步一道，连向建筑一侧
    for i in range(0, nx + 1, 2):
        for k in range(1, nh + 1, 2):
            z = k * dh
            b.beam((i * dx, 0.0, z), (i * dx, -1.1, z), 0.055, mat=tube)
            b.box((0.16, 0.16, 0.16), (i * dx, -1.1, z), mat="concrete_dark")

    # 上下人钢梯
    lad_x = dx * 0.5
    lad_y = dy + 0.16
    for sx in (lad_x - 0.24, lad_x + 0.24):
        b.beam((sx, lad_y, 0.0), (sx, lad_y, len_z), 0.04, mat="galvanized")
    for k in range(int(len_z / 0.4) + 1):
        zr = k * 0.4
        b.beam((lad_x - 0.24, lad_y, zr), (lad_x + 0.24, lad_y, zr), 0.03,
               mat="galvanized")

    # 底座：垫木 + 可调底座
    for i in range(nx + 1):
        for y in (0.0, dy):
            b.box((0.5, 0.5, 0.05), (i * dx, y, 0.025), mat="wood")
            b.box((0.18, 0.18, 0.10), (i * dx, y, 0.10), mat="steel_gray")

    return b.build(collection)


# 玻璃幕墙（4 号楼用）
def _add_entrance(b, ent_cx, g_off):
    """首层南立面入口：玻璃双开门 + 门框 + 雨棚 + 台阶。"""
    door_y = -g_off - 0.07            # 门扇在玻璃外皮再外 0.07m
    thr = 0.85                        # 入口平台（台阶顶）标高
    dh = 2.0                          # 门高，门顶 2.85 < 梁底 2.9
    # 门框：两侧立柱 + 中柱 + 门楣
    for sx in (ent_cx - 0.94, ent_cx, ent_cx + 0.94):
        b.box((0.10, 0.12, dh + 0.20), (sx, door_y, thr + dh / 2.0),
              mat="door_gray")
    b.box((2.0, 0.12, 0.16), (ent_cx, door_y, thr + dh + 0.06), mat="door_gray")
    # 玻璃门扇
    for sx in (ent_cx - 0.47, ent_cx + 0.47):
        b.box((0.82, 0.05, dh - 0.12), (sx, door_y, thr + dh / 2.0 - 0.02),
              mat="glass")
    # 雨棚 + 斜撑 + 门楣标识板
    b.box((4.6, 1.6, 0.10), (ent_cx, -0.95, 2.95), mat="galvanized")
    b.box((4.6, 0.10, 0.30), (ent_cx, -1.72, 2.95), mat="board_blue")
    for sx in (ent_cx - 2.1, ent_cx + 2.1):
        b.beam((sx, -1.62, 2.92), (sx, -0.12, 3.40), 0.07, mat="galvanized")
    b.box((2.2, 0.08, 0.42), (ent_cx, -g_off - 0.06, 3.22), mat="board_blue")
    # 台阶 3 级，从底板 z=0.5 上到平台 z=0.85
    for (y0, y1, zt) in ((-1.75, -1.35, 0.617), (-1.35, -0.95, 0.733),
                         (-0.95, -0.10, 0.85)):
        b.box((4.6, y1 - y0, zt - 0.5),
              (ent_cx, (y0 + y1) / 2.0, 0.5 + (zt - 0.5) / 2.0), mat="concrete")


def _add_roof_equipment(b, top):
    """屋面设备，布置在女儿墙内、避开顶层预留洞。"""
    # 出屋面楼梯间 + 门 + 避雷针
    b.box((3.4, 2.8, 2.3), (3.2, 15.0, top + 1.15), mat="wall_white")
    b.box((1.0, 0.10, 2.0), (3.2, 13.55, top + 1.00), mat="door_gray")
    b.box((3.7, 3.1, 0.12), (3.2, 15.0, top + 2.36), mat="galvanized")
    b.cylinder(0.04, 0.45, (3.2, 15.0, top + 2.645), mat="galvanized", segments=6)
    b.box((0.16, 0.16, 0.14), (3.2, 15.0, top + 3.00), mat="lamp_red")
    # 水箱：钢架 + 箱体
    tx, ty = 14.0, 13.0
    for sx in (tx - 0.85, tx + 0.85):
        for sy in (ty - 0.85, ty + 0.85):
            b.beam((sx, sy, top), (sx, sy, top + 0.9), 0.08, mat="steel_gray")
    b.box((2.1, 2.1, 0.06), (tx, ty, top + 0.93), mat="steel_gray")
    b.box((1.9, 1.9, 1.3), (tx, ty, top + 1.61), mat="galvanized")
    # 空调机组箱 2 台
    b.box((2.2, 1.5, 1.0), (13.0, 8.5, top + 0.5), mat="steel_gray")
    b.box((2.4, 1.7, 0.08), (13.0, 8.5, top + 1.04), mat="galvanized")
    b.box((1.8, 1.2, 0.85), (6.2, 4.0, top + 0.43), mat="steel_gray")
    b.box((2.0, 1.4, 0.08), (6.2, 4.0, top + 0.89), mat="galvanized")
    # 排气管
    for (vx, vy) in ((9.0, 15.2), (10.0, 15.6), (8.6, 15.9), (16.4, 16.4)):
        b.cylinder(0.11, 0.75, (vx, vy, top + 0.375), mat="galvanized", segments=8)


def _add_finished_facade(b, grid, n_bay, hh, nz, col, bh, slab, size_x, size_y):
    """四周挂一圈玻璃幕墙，把裸框架做成「几乎完工」的楼宇。
    只在 facade=True（4 号楼）时调用，玻璃比柱外皮内缩 0.10m，南立面中央做入口。
    """
    half = col / 2.0                  # 柱外皮到柱轴线
    g_off = half - 0.10               # 玻璃平面相对轴线内缩 0.10m
    gt = 0.05                         # 玻璃厚度
    gap = 0.02                        # 与柱梁留缝，防共面闪烁
    mull_w, mull_d = 0.09, 0.16       # 竖挺 宽 × 进深
    tran_h, tran_d = 0.10, 0.13       # 横梁 高 × 进深，比竖挺浅
    band_t = 0.20                     # 窗台/楼边带厚度
    band_lo, band_hi = 0.12, 0.28     # 楼边带下/上伸出高度
    n_mod = 4                         # 每开间分格数，约 1.5m 一档
    sill_h = 1.15                     # 窗台横梁标高

    def storey_floor(lv):
        return 0.5 if lv == 0 else 0.5 + lv * hh + slab

    def beam_bottom(lv):
        return 0.5 + (lv + 1) * hh - bh

    # 四个立面：法线轴、玻璃平面坐标、沿面长度
    facades = (
        ("x", -g_off, size_y),
        ("x", size_x + g_off, size_y),
        ("y", -g_off, size_x),
        ("y", size_y + g_off, size_x),
    )

    def put(normal, plane, along_c, z_c, thick, along_s, z_s, mat):
        if normal == "x":
            b.box((thick, along_s, z_s), (plane, along_c, z_c), mat=mat)
        else:
            b.box((along_s, thick, z_s), (along_c, plane, z_c), mat=mat)

    # 南立面中央开间做入口
    ent_cx = (n_bay // 2) * grid + grid / 2.0

    # 逐层：玻璃 + 竖挺 + 横梁 + 窗台带
    for lv in range(nz):
        z0 = storey_floor(lv)
        z1 = beam_bottom(lv)
        z_lo = z0 + (0.22 if lv == 0 else band_hi)   # 首层落地玻璃
        z_hi = z1 - 0.04
        zc = (z_lo + z_hi) / 2.0
        zh = max(0.12, z_hi - z_lo)
        for (normal, plane, length) in facades:
            # 首层矮基座，上层做完整窗台带
            if lv == 0:
                put(normal, plane, length / 2.0, z0 + 0.11, band_t,
                    length + col, 0.22, "wall_white")
            else:
                put(normal, plane, length / 2.0,
                    z0 + (band_hi - band_lo) / 2.0, band_t, length + col,
                    band_lo + band_hi, "wall_white")
            # 每开间一整片玻璃，分格靠竖挺
            for kb in range(n_bay):
                c0 = kb * grid + half + gap
                cw = grid - 2.0 * half - 2.0 * gap
                segs = ((c0 + cw / 2.0, cw),)          # 整开间一片玻璃
                # 首层中央开间留门洞，玻璃分左右两段
                if lv == 0 and normal == "y" and plane < 0 and kb == n_bay // 2:
                    lw = (ent_cx - 1.35) - c0
                    rw = (c0 + cw) - (ent_cx + 1.35)
                    segs = ((c0 + lw / 2.0, lw), (c0 + cw - rw / 2.0, rw))
                for (scx, sw) in segs:
                    if sw > 0.3:
                        put(normal, plane, scx, zc, gt, sw, zh, "glass")
                mw = cw / n_mod
                for km in range(1, n_mod):
                    put(normal, plane, c0 + km * mw, zc, mull_d, mull_w, zh,
                        "galvanized")
            # 横梁：上下口 + 中间窗台线
            put(normal, plane, length / 2.0, z_lo, tran_d, length + col,
                tran_h, "galvanized")
            put(normal, plane, length / 2.0, z_hi, tran_d, length + col,
                tran_h, "galvanized")
            if lv > 0:
                put(normal, plane, length / 2.0, z0 + sill_h, tran_d,
                    length + col, tran_h, "galvanized")

    # 首层南立面入口
    _add_entrance(b, ent_cx, g_off)

    # 顶板四周女儿墙 + 压顶
    top = 0.5 + nz * hh + slab
    ph, cop_h = 1.15, 0.10
    for (normal, plane, length) in facades:
        p = plane + (0.10 if plane > 0 else -0.10)
        put(normal, p, length / 2.0, top + ph / 2.0, 0.24, length + col, ph,
            "concrete")
        put(normal, p, length / 2.0, top + ph + cop_h / 2.0, 0.32,
            length + col + 0.04, cop_h, "line_white")

    # 屋面设备
    _add_roof_equipment(b, top)


# 在建楼层（现浇框架）
def build_building_frame(collection=None, extra=0, name="BuildingFrame", facade=False):
    """现浇框架楼层。extra>0 时上面再加 extra 层新浇筑层，颜色更浅、不砌墙。"""
    b = MeshBuilder(name)
    grid = C.FRAME_GRID
    nx = C.FRAME_SPAN_X
    ny = C.FRAME_SPAN_Y
    hh = C.FRAME_STOREY_H
    base_n = C.FRAME_STOREY_N
    nz = base_n + extra
    col = C.FRAME_COL
    bw = C.FRAME_BEAM_W
    bh = C.FRAME_BEAM_H
    slab = C.FRAME_SLAB

    size_x = nx * grid
    size_y = ny * grid
    si, sj = C.FRAME_STAIR_BAY      # 楼梯间所在柱网
    open_bay = (2, 0)               # 顶层预留洞口柱网

    # 基础底板
    b.box((size_x + 4.0, size_y + 4.0, 0.5), (size_x / 2.0, size_y / 2.0, 0.25),
          mat="concrete_dark")

    # 柱下独立基础
    for i in range(nx + 1):
        for j in range(ny + 1):
            b.box((col + 0.4, col + 0.4, 0.14), (i * grid, j * grid, 0.57),
                  mat="concrete")

    for level in range(nz):
        z0 = 0.5 + level * hh
        # 完工层用普通混凝土，新增层用新浇筑色
        cmat = "concrete" if level < base_n else "concrete_new"
        # 柱
        for i in range(nx + 1):
            for j in range(ny + 1):
                b.box((col, col, hh), (i * grid, j * grid, z0 + hh / 2.0), mat=cmat)
        # 主梁 X 向
        for j in range(ny + 1):
            y = j * grid
            b.box((size_x + col, bw, bh), (size_x / 2.0, y, z0 + hh - bh / 2.0),
                  mat=cmat)
        # 主梁 Y 向
        for i in range(nx + 1):
            x = i * grid
            b.box((bw, size_y + col, bh), (x, size_y / 2.0, z0 + hh - bh / 2.0),
                  mat=cmat)
        # 楼板按柱网分块现浇，楼梯间和顶层留洞
        for i in range(nx):
            for j in range(ny):
                if (i, j) == (si, sj):
                    xb, yb = si * grid, sj * grid
                    for (ax0, ay0, ax1, ay1) in (
                            (0.0, 0.0, 2.10, grid),
                            (4.06, 0.0, grid, grid),
                            (2.10, 4.85, 4.06, grid)):
                        b.box((ax1 - ax0, ay1 - ay0, slab),
                              (xb + (ax0 + ax1) / 2.0, yb + (ay0 + ay1) / 2.0,
                               z0 + hh + slab / 2.0), mat=cmat)
                    continue
                if (i, j) == open_bay and level == nz - 1:
                    continue
                b.box((grid, grid, slab),
                      (i * grid + grid / 2.0, j * grid + grid / 2.0,
                       z0 + hh + slab / 2.0), mat=cmat)

    # 楼梯：单跑直梯，贴柱网东侧沿 +Y 上行，18 级
    sw = 1.4                        # 梯段宽
    going = 0.26                    # 踏步宽
    riser_n = 18                    # 总级数
    x_lo = 2.38                     # 梯段西缘（柱网局部坐标）
    x_hi = x_lo + sw                # 梯段东缘
    y_st = 0.30                     # 起步位置
    y_end = y_st + (riser_n - 1) * going
    srail = 1.0                     # 扶手高

    for lvl in range(nz):
        start_z = 0.5 if lvl == 0 else 0.5 + lvl * hh + slab
        end_z = 0.5 + (lvl + 1) * hh + slab
        rise = (end_z - start_z) / float(riser_n)
        xb, yb = si * grid, sj * grid

        # 板式梯段：斜板 + 薄踏步，梯下通透
        run_total = (riser_n - 1) * going
        rise_total = end_z - start_z
        diag = math.sqrt(run_total ** 2 + rise_total ** 2)
        ang = math.atan2(rise_total, run_total)
        t_slab = 0.14
        cy_ = yb + y_st + run_total / 2.0 + (t_slab / 2.0) * math.sin(ang)
        cz_ = start_z + rise_total / 2.0 - (t_slab / 2.0) * math.cos(ang)
        b.box((sw, diag + 0.24, t_slab), (xb + x_lo + sw / 2.0, cy_, cz_),
              rotation=(ang, 0, 0), mat="concrete")

        # 踏步，一级一块
        for i in range(riser_n - 1):
            b.box((sw, going, rise),
                  (xb + x_lo + sw / 2.0, yb + y_st + i * going + going / 2.0,
                   start_z + i * rise + rise / 2.0), mat="stone")

        # 两侧黑色金属栏杆
        for sx in (xb + x_lo - 0.06, xb + x_hi + 0.06):
            b.beam((sx, yb + y_st, start_z + srail),
                   (sx, yb + y_end, end_z + srail), 0.06, mat="rail_black")
            for i in range(0, riser_n, 2):
                yy = yb + y_st + i * going
                zz = start_z + i * rise
                b.beam((sx, yy, zz), (sx, yy, zz + srail), 0.035, mat="rail_black")
            b.box((0.11, 0.11, srail + 0.08),
                  (sx, yb + y_st, start_z + (srail + 0.08) / 2.0), mat="rail_black")
            b.cylinder(0.075, 0.14, (sx, yb + y_st, start_z + srail + 0.15),
                       mat="rail_black", segments=8)

    # 楼梯洞口临边防护，只在顶层
    x0s = si * grid
    y0s = sj * grid
    guard_segs = [
        ((2.10, 0.0), (4.06, 0.0)),       # 南边界
        ((2.10, 0.0), (2.10, 4.85)),      # 西边界
        ((4.06, 0.0), (4.06, 4.85)),      # 东边界
    ]
    for level in (nz - 1,):
        zt = 0.5 + (level + 1) * hh + slab
        corners = set()
        for (p, q) in guard_segs:
            corners.add(p)
            corners.add(q)
            for zz in (zt + 1.2, zt + 0.6):
                b.beam((x0s + p[0], y0s + p[1], zz), (x0s + q[0], y0s + q[1], zz),
                       0.05, mat="paint_red")
        for (cx, cy) in corners:
            b.beam((x0s + cx, y0s + cy, zt), (x0s + cx, y0s + cy, zt + 1.2), 0.05,
                   mat="paint_red")

    # 顶层预留洞口 + 水平防护网
    ob_x = open_bay[0] * grid
    ob_y = open_bay[1] * grid
    ob_z = 0.5 + nz * hh + slab
    for (cx, cy) in ((ob_x, ob_y), (ob_x + grid, ob_y),
                     (ob_x, ob_y + grid), (ob_x + grid, ob_y + grid)):
        b.beam((cx, cy, ob_z), (cx, cy, ob_z + 1.2), 0.05, mat="paint_red")
    for zz in (ob_z + 1.2, ob_z + 0.6):
        b.beam((ob_x, ob_y, zz), (ob_x + grid, ob_y, zz), 0.05, mat="paint_red")
        b.beam((ob_x, ob_y + grid, zz), (ob_x + grid, ob_y + grid, zz), 0.05, mat="paint_red")
        b.beam((ob_x, ob_y, zz), (ob_x, ob_y + grid, zz), 0.05, mat="paint_red")
        b.beam((ob_x + grid, ob_y, zz), (ob_x + grid, ob_y + grid, zz), 0.05, mat="paint_red")
    b.box((grid, grid, 0.02), (ob_x + grid / 2.0, ob_y + grid / 2.0, ob_z + 0.05),
          mat="net_green")

    # 底层填充墙
    wall_h = hh - bh
    for i in range(nx):
        if i == si:
            continue
        b.box((grid - col, C.FRAME_WALL_T, wall_h),
              (i * grid + grid / 2.0, size_y, 0.5 + wall_h / 2.0), mat="brick")
    for j in range(ny):
        if j == sj:
            continue
        b.box((C.FRAME_WALL_T, grid - col, wall_h),
              (size_x, j * grid + grid / 2.0, 0.5 + wall_h / 2.0), mat="brick")

    # 顶层临边防护栏杆
    top_z = 0.5 + nz * hh + slab
    rail_h = 1.2

    for i in range(nx + 1):
        for j in (0, ny):
            x, y = i * grid, j * grid
            b.beam((x, y, top_z), (x, y, top_z + rail_h), 0.06, mat="paint_red")
    for j in range(1, ny):
        for i in (0, nx):
            x, y = i * grid, j * grid
            b.beam((x, y, top_z), (x, y, top_z + rail_h), 0.06, mat="paint_red")

    for z in (top_z + rail_h, top_z + rail_h * 0.5):
        b.beam((0.0, 0.0, z), (size_x, 0.0, z), 0.06, mat="paint_red")
        b.beam((0.0, size_y, z), (size_x, size_y, z), 0.06, mat="paint_red")
        b.beam((0.0, 0.0, z), (0.0, size_y, z), 0.06, mat="paint_red")
        b.beam((size_x, 0.0, z), (size_x, size_y, z), 0.06, mat="paint_red")

    # 顶层外沿密目安全网
    net_h = 1.8
    net_z = top_z - net_h / 2.0
    b.box((size_x, 0.03, net_h), (size_x / 2.0, 0.03, net_z), mat="net_green")
    b.box((size_x, 0.03, net_h), (size_x / 2.0, size_y - 0.03, net_z), mat="net_green")
    b.box((0.03, size_y, net_h), (0.03, size_y / 2.0, net_z), mat="net_green")
    b.box((0.03, size_y, net_h), (size_x - 0.03, size_y / 2.0, net_z), mat="net_green")

    # 新增楼层的施工状态
    if extra > 0:
        new_top = 0.5 + nz * hh + slab

        # 新增层不搭满堂支撑，保持通透

        # 新顶板四周挂木模 + 木方背楞
        fm_h = slab + 0.5
        for (mx, my, mw, md) in ((size_x / 2.0, -0.13, size_x + 0.5, 0.26),
                                 (size_x / 2.0, size_y + 0.13, size_x + 0.5, 0.26),
                                 (-0.13, size_y / 2.0, 0.26, size_y + 0.5),
                                 (size_x + 0.13, size_y / 2.0, 0.26, size_y + 0.5)):
            b.box((mw, md, fm_h), (mx, my, new_top - fm_h / 2.0), mat="wood")
        for i in range(nx):
            for j in (0, ny):
                b.box((grid * 0.9, 0.10, 0.12),
                      (i * grid + grid / 2.0, j * grid, new_top + 0.22), mat="wood")
        for j in range(ny):
            for i in (0, nx):
                b.box((0.10, grid * 0.9, 0.12),
                      (i * grid, j * grid + grid / 2.0, new_top + 0.22), mat="wood")

        # 柱顶甩筋，留给上层搭接
        for i in range(nx + 1):
            for j in range(ny + 1):
                for dx in (-1, 1):
                    for dy in (-1, 1):
                        rx = i * grid + dx * col * 0.28
                        ry = j * grid + dy * col * 0.28
                        b.beam((rx, ry, new_top), (rx, ry, new_top + 0.55), 0.028,
                               mat="rebar")

    # 4 号楼专用，挂玻璃幕墙
    if facade:
        _add_finished_facade(b, grid, nx, hh, nz, col, bh, slab, size_x, size_y)

    obj = b.build(collection)

    # 底板整体下沉 0.25m，顶面降到 0.25m，漫游抬脚就能迈上去
    obj.location = (0.0, 0.0, -0.25)
    return obj


def build_building_frame_tall(collection=None):
    """1 号楼专用：标准 3 层之上再加 2 层新浇筑层。"""
    return build_building_frame(collection, extra=2, name="BuildingFrameTall")


def build_building_frame_plus(collection=None):
    """4 号楼专用：3 层之上再加 6 层，四周挂玻璃幕墙。"""
    return build_building_frame(collection, extra=6, name="BuildingFramePlus",
                                facade=True)
