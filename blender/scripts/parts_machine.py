# -*- coding: utf-8 -*-
"""机械与市政类模型（路灯 / 挖掘机 / 翻斗车 / 搅拌车）。

挖掘机和卡车要做关节动画，所以按节点分层导出，前端直接转对应节点即可：
    Excavator_Base -> _House -> _Boom -> _Stick -> _Bucket
    DumpTruck_Base -> DumpTruck_Bed
"""

import math

from utils import MeshBuilder, parent_to
import config as C


# 路灯
def build_lamp_post(collection=None):
    b = MeshBuilder("LampPost")
    h = C.LAMP_HEIGHT
    arm = C.LAMP_ARM

    b.box((0.9, 0.9, 0.45), (0.0, 0.0, 0.22), mat="concrete")          # 基础
    b.cylinder(0.17, 0.5, (0.0, 0.0, 0.62), mat="galvanized", segments=10)
    top = 0.86 + h
    b.cylinder(0.11, h, (0.0, 0.0, 0.86 + h / 2.0), mat="galvanized", segments=10)

    # 悬臂，斜向上挑出
    b.beam((0.0, 0.0, top - 1.4), (arm, 0.0, top - 0.20), 0.10, mat="galvanized")
    b.beam((0.0, -0.18, top - 1.4), (arm, -0.18, top - 0.20), 0.06, mat="galvanized")
    b.beam((0.0, 0.18, top - 1.4), (arm, 0.18, top - 0.20), 0.06, mat="galvanized")

    # 灯具 + 灯罩
    b.box((0.95, 0.40, 0.08), (arm + 0.18, 0.0, top - 0.10), mat="steel_gray")
    b.box((0.85, 0.32, 0.16), (arm + 0.18, 0.0, top - 0.22), mat="lamp_white")

    # 检修门 + 反光带
    b.box((0.08, 0.34, 0.80), (0.13, 0.0, 1.55), mat="steel_gray")
    b.cylinder(0.125, 0.20, (0.0, 0.0, 2.6), mat="hazard_yellow", segments=10)

    return b.build(collection)


# 履带式挖掘机（正面朝 +X）
def build_excavator(collection=None):
    yellow = "machine_yellow"
    dark = "machine_dark"
    gray = "steel_gray"

    tw = C.EXC_TRACK_W
    th = C.EXC_TRACK_H
    gap = C.EXC_TRACK_GAP / 2.0
    tlen = C.EXC_TRACK_LEN
    belt_top = th * 0.74

    # 履带底盘
    base = MeshBuilder("Excavator_Base")
    for sy in (-gap, gap):
        # 履带架
        base.box((tlen, tw * 0.78, th * 0.46), (0.0, sy, th * 0.34), mat=dark)
        base.box((tlen * 0.66, tw * 0.60, th * 0.26), (0.0, sy, th * 0.30), mat=gray)
        # 驱动轮 / 导向轮 + 轮毂 + 驱动齿
        for sx in (-(tlen / 2.0 - 0.30), tlen / 2.0 - 0.30):
            base.cylinder(0.36, tw, (sx, sy, th * 0.34),
                          rotation=(math.pi / 2.0, 0, 0), mat=dark, segments=12)
            base.cylinder(0.19, tw + 0.06, (sx, sy, th * 0.34),
                          rotation=(math.pi / 2.0, 0, 0), mat=gray, segments=10)
            for k in range(8):
                aa = k * math.pi / 4.0
                base.box((0.12, tw * 0.72, 0.11),
                         (sx + 0.42 * math.cos(aa), sy, th * 0.34 + 0.42 * math.sin(aa)),
                         rotation=(0.0, -aa, 0.0), mat=dark)
        # 履带板：下排 + 上排
        n = 9
        for i in range(n):
            x = -tlen / 2.0 + tlen * (i + 0.5) / float(n)
            base.box((tlen / n * 0.70, tw + 0.10, 0.11), (x, sy, 0.055), mat=dark)
            base.box((tlen / n * 0.70, tw + 0.05, 0.09), (x, sy, belt_top), mat=dark)
        # 支重轮 / 托带轮
        for i in range(4):
            x = -tlen / 2.0 + tlen * (i + 0.5) / 4.0
            base.cylinder(0.15, tw * 0.80, (x, sy, 0.24),
                          rotation=(math.pi / 2.0, 0, 0), mat=gray, segments=8)
        for i in range(2):
            x = -tlen * 0.22 + tlen * 0.44 * i
            base.cylinder(0.11, tw * 0.68, (x, sy, belt_top - 0.14),
                          rotation=(math.pi / 2.0, 0, 0), mat=gray, segments=8)
        # 履带张紧弹簧
        base.cylinder(0.09, 0.52, (tlen / 2.0 - 0.72, sy, th * 0.34),
                      rotation=(0.0, math.pi / 2.0, 0.0), mat=gray, segments=8)

    # 底架 + 回转支承 + 中央回转接头
    base.box((2.9, gap * 2.0 + tw + 0.20, 0.42), (0.0, 0.0, th * 0.80), mat=dark)
    base.box((1.62, 1.62, 0.22), (0.0, 0.0, th + 0.11), mat=gray)
    for k in range(28):
        aa = k * math.pi * 2.0 / 28.0
        base.box((0.10, 0.10, 0.13),
                 (1.16 * math.cos(aa), 1.16 * math.sin(aa), th + 0.11),
                 rotation=(0.0, 0.0, aa), mat=dark)
    base.cylinder(0.16, 0.34, (0.0, 0.0, th + 0.05), mat=gray, segments=10)
    base_obj = base.build(collection)

    slew_z = th + 0.22

    # 回转平台（上车）
    house = MeshBuilder("Excavator_House")
    house.box((3.9, 2.30, 0.30), (0.0, 0.0, 0.15), mat=yellow)             # 平台
    house.box((3.94, 2.34, 0.06), (0.0, 0.0, 0.30), mat=dark)              # 平台包边

    # 发动机罩，侧面后面加散热百叶
    house.box((2.5, 1.90, 1.15), (-0.60, 0.0, 0.88), mat=yellow)
    house.box((2.2, 1.70, 0.20), (-0.60, 0.0, 1.56), mat=dark)
    for sy in (-0.96, 0.96):
        for i in range(5):
            house.box((2.1, 0.05, 0.09), (-0.60, sy, 0.58 + i * 0.16), mat=dark)
    for i in range(5):
        house.box((0.05, 1.70, 0.10), (-1.86, 0.0, 0.55 + i * 0.17), mat=dark)
    house.cylinder(0.16, 0.55, (-0.05, 0.72, 1.60), mat=dark, segments=10)  # 空滤
    house.cylinder(0.07, 0.40, (0.42, 0.80, 1.80), mat=gray, segments=8)    # 排气尾管

    # 配重，带上斜面和吊装孔
    house.box((0.75, 2.10, 1.05), (-2.00, 0.0, 0.63), mat=dark)
    house.box((0.42, 1.82, 0.30), (-2.20, 0.0, 1.20), mat=dark)
    house.box((0.22, 0.30, 0.18), (-1.92, 0.0, 1.32), mat=gray)

    # 油箱 / 工具箱
    house.box((0.70, 0.60, 0.50), (1.30, 0.78, 0.40), mat=gray)
    house.cylinder(0.07, 0.12, (1.30, 0.78, 0.69), mat=dark, segments=8)
    house.box((0.60, 0.50, 0.40), (-0.20, -0.95, 0.35), mat=gray)

    # 驾驶室
    house.box((1.05, 1.05, 1.40), (1.20, -0.60, 1.02), mat=yellow)
    house.box((1.12, 1.12, 0.09), (1.20, -0.60, 1.76), mat=dark)            # 顶盖
    house.box((0.06, 0.90, 0.85), (1.74, -0.60, 1.20), mat="glass")         # 前挡风
    house.box((0.86, 0.06, 0.85), (1.20, -1.14, 1.20), mat="glass")         # 左窗
    house.box((0.06, 0.80, 0.62), (0.68, -0.60, 1.24), mat="glass")         # 后窗
    house.box((0.05, 0.05, 1.15), (1.20, -1.15, 0.98), mat=dark)            # 门缝
    house.box((0.22, 0.06, 0.05), (1.45, -1.16, 0.85), mat=gray)            # 门把手
    house.box((0.04, 0.36, 0.05), (1.76, -0.78, 1.56), mat=dark)            # 雨刮
    house.beam((1.72, -1.20, 1.62), (1.86, -1.34, 1.52), 0.04, mat=gray)    # 镜杆
    house.box((0.07, 0.10, 0.34), (1.87, -1.36, 1.44), mat=gray)            # 后视镜
    house.cylinder(0.07, 0.12, (1.20, -0.60, 1.86), mat="hazard_yellow", segments=10)
    for sy in (-0.85, -0.35):
        house.box((0.10, 0.14, 0.10), (1.70, sy, 1.86), mat="lamp_white")   # 顶工作灯

    # 扶手栏杆
    house.beam((0.10, 1.02, 0.30), (0.10, 1.02, 1.30), 0.05, mat=gray)
    house.beam((1.00, 1.02, 0.30), (1.00, 1.02, 1.30), 0.05, mat=gray)
    house.beam((0.10, 1.02, 1.30), (1.00, 1.02, 1.30), 0.05, mat=gray)

    # 动臂支座
    house.box((0.85, 0.98, 0.62), (0.95, 0.0, 0.42), mat=yellow)
    house_obj = house.build(collection)
    house_obj.location = (0.0, 0.0, slew_z)
    parent_to(house_obj, base_obj)

    # 动臂
    a = math.radians(C.EXC_BOOM_ANGLE)
    bl = C.EXC_BOOM_LEN
    btx, btz = bl * math.cos(a), bl * math.sin(a)
    bc, bs = math.cos(a), math.sin(a)
    bux, buz = -bs, bc                       # 垂直动臂向上的方向

    def along(f, d, sy=0.0):
        """动臂局部坐标：f 沿臂比例，d 法向偏置。"""
        return (f * btx + d * bux, sy, f * btz + d * buz)

    boom = MeshBuilder("Excavator_Boom")
    boom.beam((0.0, 0.0, 0.0), (btx, 0.0, btz), 0.50, mat=yellow, depth=0.80)
    boom.beam((0.35, 0.0, 0.30), (btx - 0.35, 0.0, btz - 0.15), 0.22, mat=yellow,
              depth=0.86)
    boom.beam((0.10, 0.0, -0.34), (btx - 0.70, 0.0, btz - 0.36), 0.16, mat=yellow,
              depth=0.68)
    boom.box((0.95, 1.06, 0.86), (0.42, 0.0, -0.06), mat=yellow)            # 根部支座
    for sy in (-0.36, 0.36):                                               # 动臂油缸
        boom.cylinder(0.11, 1.55, along(0.17, -0.58, sy),
                      rotation=(0.0, math.radians(90.0 - C.EXC_BOOM_ANGLE), 0.0),
                      mat=gray, segments=8)
        boom.cylinder(0.075, 1.45, along(0.47, -0.46, sy),
                      rotation=(0.0, math.radians(90.0 - C.EXC_BOOM_ANGLE), 0.0),
                      mat="galvanized", segments=8)
    for sy in (-0.30, 0.30):                                               # 液压软管
        boom.cylinder(0.05, bl * 0.90, along(0.50, 0.36, sy),
                      rotation=(0.0, math.radians(90.0 - C.EXC_BOOM_ANGLE), 0.0),
                      mat="cable_black", segments=6)
    boom.cylinder(0.17, 0.98, (0.0, 0.0, 0.0), rotation=(math.pi / 2.0, 0, 0),
                  mat=gray, segments=8)
    boom.cylinder(0.15, 0.82, (btx, 0.0, btz), rotation=(math.pi / 2.0, 0, 0),
                  mat=gray, segments=8)
    boom.box((0.16, 0.14, 0.12), along(0.26, 0.32, 0.0), mat="lamp_white")  # 臂上工作灯
    boom_obj = boom.build(collection)
    boom_obj.location = (0.95, 0.0, 0.42)
    parent_to(boom_obj, house_obj)

    # 斗杆
    sa = math.radians(C.EXC_STICK_ANGLE)
    sl = C.EXC_STICK_LEN
    stx, stz = sl * math.cos(sa), sl * math.sin(sa)
    sc, ss = math.cos(sa), math.sin(sa)
    sux, suz = -ss, sc                       # 垂直斗杆向上

    def salt(f, d, sy=0.0):
        return (f * stx + d * sux, sy, f * stz + d * suz)

    stick = MeshBuilder("Excavator_Stick")
    stick.beam((0.0, 0.0, 0.0), (stx, 0.0, stz), 0.42, mat=yellow, depth=0.56)
    stick.beam((0.06, 0.0, 0.24), (stx - 0.22, 0.0, stz + 0.12), 0.13, mat=yellow,
               depth=0.62)
    stick.cylinder(0.15, 0.72, (0.0, 0.0, 0.0), rotation=(math.pi / 2.0, 0, 0),
                   mat=gray, segments=8)
    stick.cylinder(0.13, 0.62, (stx, 0.0, stz), rotation=(math.pi / 2.0, 0, 0),
                   mat=gray, segments=8)
    for sy in (-0.22, 0.22):                                               # 斗杆 / 铲斗油缸
        stick.cylinder(0.09, 1.40, salt(0.20, 0.42, sy),
                       rotation=(0.0, math.radians(90.0 - C.EXC_STICK_ANGLE), 0.0),
                       mat=gray, segments=8)
        stick.cylinder(0.065, 1.55, salt(0.58, 0.38, sy),
                       rotation=(0.0, math.radians(90.0 - C.EXC_STICK_ANGLE), 0.0),
                       mat="galvanized", segments=8)
    stick.cylinder(0.045, sl * 0.72, salt(0.50, 0.18, 0.0),                # 液压软管
                   rotation=(0.0, math.radians(90.0 - C.EXC_STICK_ANGLE), 0.0),
                   mat="cable_black", segments=6)
    stick_obj = stick.build(collection)
    stick_obj.location = (btx, 0.0, btz)
    parent_to(stick_obj, boom_obj)

    # 铲斗
    bw = C.EXC_BUCKET_W
    bucket = MeshBuilder("Excavator_Bucket")
    bucket.box((0.30, bw, 1.00), (-0.30, 0.0, -0.45), mat="machine_orange")   # 背板
    bucket.box((1.15, bw, 0.22), (0.10, 0.0, -0.95), mat="machine_orange")    # 底板
    for sy in (-(bw / 2.0 - 0.09), bw / 2.0 - 0.09):
        bucket.box((1.20, 0.16, 1.00), (0.05, sy, -0.45), mat="machine_orange")   # 侧板
        bucket.box((0.50, 0.13, 0.30), (0.30, sy, -0.86), mat="machine_orange")   # 侧刃
    bucket.box((0.24, bw + 0.04, 0.18), (0.62, 0.0, -1.00), mat=gray)         # 刃口
    for i in range(5):                                                        # 斗齿
        yy = -bw / 2.0 + bw * (i + 0.5) / 5.0
        bucket.box((0.24, 0.13, 0.13), (0.72, yy, -1.03), mat=gray)
        bucket.box((0.16, 0.10, 0.24), (0.86, yy, -1.07), mat="hazard_yellow")
    for i in range(3):                                                        # 背面加强筋
        bucket.box((0.10, bw - 0.32, 0.10), (-0.42, 0.0, -0.28 - i * 0.26),
                   mat="machine_orange")
    bucket.box((0.18, 0.52, 0.70), (-0.08, 0.0, -0.05), mat=yellow)           # 连杆座
    bucket.cylinder(0.10, 0.62, (-0.08, 0.0, 0.28), rotation=(math.pi / 2.0, 0, 0),
                    mat=gray, segments=8)
    bucket_obj = bucket.build(collection)
    bucket_obj.location = (stx, 0.0, stz)
    parent_to(bucket_obj, stick_obj)

    return base_obj


# 卡车驾驶室：前脸朝 +X，ch 是底盘上平面标高，w 是车宽
def _truck_cab(base, ch, w, body="machine_yellow", dark="machine_dark",
               gray="steel_gray"):
    cab_cx = 3.15
    cab_l = 2.52
    cab_w = w - 0.06
    cab_bot = ch
    cab_top = ch + 1.92
    fx = cab_cx + cab_l / 2.0               # 前脸
    win_z = cab_bot + 1.44
    ww = cab_w / 2.0

    # 室体
    base.box((cab_l, cab_w, cab_top - cab_bot),
             (cab_cx, 0.0, (cab_bot + cab_top) / 2.0), mat=body)
    base.box((cab_l + 0.06, cab_w + 0.05, 0.10), (cab_cx, 0.0, cab_top - 0.02),
             mat=body)                                                          # 顶盖
    base.box((cab_l - 0.10, cab_w + 0.06, 0.10), (cab_cx, 0.0, cab_bot + 0.05),
             mat=dark)                                                          # 裙边
    base.box((cab_l + 0.03, cab_w + 0.02, 0.07), (cab_cx, 0.0, cab_bot + 0.62),
             mat=dark)                                                          # 腰线

    # 前围面罩，略后倾
    rake = math.radians(7.0)
    base.box((0.10, cab_w - 0.10, 1.02), (fx - 0.02, 0.0, cab_bot + 0.55),
             rotation=(0.0, rake, 0.0), mat=body)                               # 面罩
    base.box((0.16, cab_w - 0.02, 0.16), (fx - 0.03, 0.0, cab_bot + 1.06),
             rotation=(0.0, rake, 0.0), mat=dark)                               # 面罩上檐

    # 风挡 + 中柱 + 窗框
    for sy in (-1.0, 1.0):
        base.box((0.08, cab_w / 2.0 - 0.12, 0.80), (fx - 0.05, sy * (cab_w / 4.0), win_z),
                 rotation=(0.0, rake, 0.0), mat="glass")
        base.box((0.10, cab_w / 2.0 - 0.06, 0.07),
                 (fx - 0.03, sy * (cab_w / 4.0), win_z + 0.44),
                 rotation=(0.0, rake, 0.0), mat=dark)
        base.box((0.10, cab_w / 2.0 - 0.06, 0.07),
                 (fx - 0.03, sy * (cab_w / 4.0), win_z - 0.44),
                 rotation=(0.0, rake, 0.0), mat=dark)
    base.box((0.11, 0.09, 0.88), (fx - 0.04, 0.0, win_z),
             rotation=(0.0, rake, 0.0), mat=body)                               # 风挡中柱
    for sy in (-1.0, 1.0):                                                      # 雨刮
        base.beam((fx - 0.07, sy * 0.42, cab_bot + 1.06),
                  (fx - 0.07, sy * 1.02, cab_bot + 1.20), 0.03, mat="rail_black")

    # 遮阳板 + 车顶导流罩
    base.box((0.44, cab_w + 0.04, 0.07), (fx - 0.16, 0.0, cab_top + 0.14),
             rotation=(0.0, math.radians(16.0), 0.0), mat=body)
    for sy in (-1.0, 1.0):
        base.box((0.10, 0.06, 0.26), (fx - 0.30, sy * (ww - 0.10), cab_top + 0.05),
                 rotation=(0.0, math.radians(16.0), 0.0), mat=body)
    base.box((1.10, cab_w - 0.14, 0.06), (cab_cx + 0.55, 0.0, cab_top + 0.24),
             rotation=(0.0, math.radians(-9.0), 0.0), mat=body)                 # 导流罩顶板
    base.box((0.08, cab_w - 0.14, 0.24), (cab_cx + 1.08, 0.0, cab_top + 0.14),
             mat=body)                                                          # 罩后立板
    for sy in (-1.0, 1.0):                                                      # 罩侧板
        base.box((1.10, 0.06, 0.22), (cab_cx + 0.55, sy * (cab_w / 2.0 - 0.12),
                                      cab_top + 0.16),
                 rotation=(0.0, math.radians(-9.0), 0.0), mat=body)

    # 车顶示廓灯，5 只琥珀色
    for k in range(5):
        base.cylinder(0.05, 0.07, (fx - 0.34, -0.76 + k * 0.38, cab_top + 0.19),
                      mat="hazard_yellow", segments=8)

    # 侧窗 / 车门 / 后窗
    base.box((0.07, cab_w - 0.46, 0.58), (cab_cx - cab_l / 2.0 + 0.03, 0.0,
                                          win_z + 0.02), mat="glass")
    base.box((0.09, cab_w - 0.38, 0.07), (cab_cx - cab_l / 2.0 + 0.04, 0.0,
                                          win_z + 0.34), mat=dark)
    for sy in (-(ww + 0.004), ww + 0.004):
        base.box((0.92, 0.05, 0.60), (cab_cx + 0.36, sy, win_z + 0.05),
                 mat="glass")                                                   # 侧窗
        base.box((0.98, 0.05, 0.07), (cab_cx + 0.36, sy, win_z + 0.40), mat=dark)
        base.box((0.98, 0.05, 0.07), (cab_cx + 0.36, sy, win_z - 0.32), mat=dark)
        base.box((0.06, 0.05, 1.05), (cab_cx + 0.94, sy, cab_bot + 0.60), mat=dark)
        base.box((1.72, 0.04, 0.05), (cab_cx + 0.06, sy, cab_bot + 1.06), mat=dark)
        base.box((1.72, 0.04, 0.05), (cab_cx + 0.06, sy, cab_bot + 0.30), mat=dark)
        base.box((0.26, 0.07, 0.06), (cab_cx + 0.70, sy, cab_bot + 0.98), mat=gray)
        base.box((0.07, 0.06, 0.52), (cab_cx + 0.62, sy, cab_bot + 0.62), mat=gray)
        for zz in (cab_bot + 1.02, cab_bot + 0.34):                             # 车门铰链
            base.box((0.16, 0.05, 0.10), (cab_cx - 0.80, sy, zz), mat=dark)

    # 前脸：格栅 / 保险杠 / 灯具 / 牌照
    for i in range(7):
        base.box((0.07, cab_w - 0.42, 0.085), (fx + 0.01, 0.0,
                                               cab_bot + 0.16 + i * 0.115),
                 rotation=(0.0, rake, 0.0), mat=dark)
    base.box((0.09, 0.09, 0.86), (fx + 0.03, 0.0, cab_bot + 0.56),
             rotation=(0.0, rake, 0.0), mat=gray)
    base.box((0.07, 0.34, 0.22), (fx + 0.05, 0.0, cab_bot + 0.92),
             rotation=(0.0, rake, 0.0), mat="line_white")
    for sy in (-0.84, 0.84):                                                    # 前照灯 + 雾灯
        base.box((0.16, 0.42, 0.26), (fx + 0.02, sy, cab_bot + 0.66), mat="lamp_white")
        base.box((0.13, 0.24, 0.14), (fx + 0.03, sy * 0.72, cab_bot + 0.40),
                 mat="hazard_yellow")
        base.box((0.11, 0.18, 0.13), (fx + 0.10, sy * 1.02, cab_bot - 0.02),
                 mat="lamp_white")
    # 两级保险杠 + 踏步 + 拖钩
    base.box((0.30, w - 0.06, 0.34), (fx + 0.13, 0.0, cab_bot + 0.02), mat=gray)
    base.box((0.36, w - 0.30, 0.16), (fx + 0.15, 0.0, cab_bot - 0.16), mat=gray)
    base.box((0.24, 0.86, 0.07), (fx + 0.30, 0.0, cab_bot - 0.05), mat=dark)
    base.box((0.18, 0.18, 0.14), (fx + 0.34, -0.34, cab_bot + 0.02), mat=gray)
    base.box((0.05, 0.50, 0.26), (fx + 0.30, 0.0, cab_bot + 0.06), mat="line_white")

    # 后视镜 / 登车踏板
    for sy in (-(ww + 0.04), ww + 0.04):
        base.beam((fx - 0.20, sy * 0.95, cab_bot + 1.68),
                  (fx + 0.02, sy, cab_bot + 1.58), 0.05, mat=gray)
        base.beam((fx - 0.16, sy * 0.95, cab_bot + 1.10),
                  (fx + 0.02, sy, cab_bot + 1.18), 0.05, mat=gray)
        base.box((0.10, 0.10, 0.48), (fx + 0.03, sy, cab_bot + 1.34), mat=gray)
        base.box((0.08, 0.09, 0.20), (fx + 0.05, sy * 1.02, cab_bot + 0.92), mat=dark)
    for sy in (-(ww + 0.03), ww + 0.03):
        for zz in (0.56, 0.96):
            base.box((0.52, 0.13, 0.05), (cab_cx + 0.52, sy, zz), mat=dark)
        base.box((0.52, 0.04, 0.05), (cab_cx + 0.52, sy, 1.36), mat=dark)
    # 排气管 + 隔热罩 + 排气帽
    ex, ey = cab_cx - cab_l / 2.0 + 0.10, w / 2.0 + 0.16
    base.cylinder(0.09, 2.0, (ex, ey, ch + 1.25), mat=gray, segments=8)
    base.box((0.20, 0.24, 1.15), (ex, ey, ch + 1.15), mat=dark)
    base.cylinder(0.13, 0.14, (ex, ey, ch + 2.28), mat=gray, segments=8)
    for zz in (ch + 0.45, ch + 2.05):
        base.box((0.16, 0.20, 0.06), (ex, ey, zz), mat=gray)


# 水泥搅拌车（正面朝 +X）。搅拌筒是独立节点 Mixer_Drum，
# 局部 Z 轴就是自转轴，前端绕 rotation.z 旋转即可。
def build_mixer_truck(collection=None):
    body = "machine_yellow"
    dark = "machine_dark"
    gray = "steel_gray"
    drum_mat = "wall_white"

    w = C.TRUCK_W
    r = C.TRUCK_WHEEL_R
    ch = C.TRUCK_CHASSIS_H

    base = MeshBuilder("MixerTruck_Base")

    # 车架 + 搅拌副车架
    rail_y = w / 2.0 - 0.44
    for sy in (-rail_y, rail_y):
        base.box((8.8, 0.18, 0.36), (0.0, sy, ch - 0.02), mat=dark)
    for cx in (3.5, 1.2, -1.3, -3.9):
        base.box((0.22, 2.0 * rail_y, 0.18), (cx, 0.0, ch - 0.02), mat=gray)
    base.box((8.4, 1.5, 0.12), (0.0, 0.0, ch + 0.14), mat=gray)
    # 副车架上翘主梁，托搅拌筒
    for sy in (-0.62, 0.62):
        base.box((5.6, 0.20, 0.26), (-1.10, sy, ch + 0.62), mat=gray)
        base.box((2.2, 0.20, 0.26), (1.90, sy, ch + 0.40),
                 rotation=(0.0, math.radians(-6.0), 0.0), mat=gray)

    # 车轮（前单后双 6×4）
    def _wheel(ax, wy, tw):
        base.cylinder(r, tw, (ax, wy, r), rotation=(math.pi / 2.0, 0, 0),
                      mat=dark, segments=14)
        base.cylinder(r * 0.44, tw + 0.06, (ax, wy, r),
                      rotation=(math.pi / 2.0, 0, 0), mat=gray, segments=10)

    for sy in (-0.96, 0.96):
        _wheel(2.75, sy, 0.44)
    for ax in (-1.30, -2.90):
        for sy in (-1.05, -0.65, 0.65, 1.05):
            _wheel(ax, sy, 0.36)

    # 挡泥板 / 油箱 / 电瓶箱 / 储气筒
    for sy in (-1.12, 1.12):
        base.box((4.1, 0.34, 0.13), (-2.10, sy, r + 0.76), mat=gray)
    base.cylinder(0.30, 1.35, (1.15, w / 2.0 - 0.24, ch - 0.02),
                  rotation=(0.0, math.pi / 2.0, 0.0), mat=gray, segments=12)
    base.box((0.95, 0.40, 0.46), (1.15, -(w / 2.0 - 0.18), ch - 0.06), mat=dark)
    base.cylinder(0.14, 1.4, (0.0, 0.0, ch - 0.14), rotation=(math.pi / 2.0, 0, 0),
                  mat=gray, segments=10)

    # 驾驶室（和自卸车同款）
    _truck_cab(base, ch, w, body, dark, gray)

    # 搅拌筒前支座 / 后托轮 / 驱动
    base.box((0.7, 1.5, 0.9), (1.55, 0.0, ch + 0.85), mat=gray)              # 前支座
    base.box((0.5, 1.5, 0.34), (1.55, 0.0, ch + 1.36), mat=dark)
    base.cylinder(0.26, 1.3, (1.55, 0.0, ch + 1.62),
                  rotation=(math.pi / 2.0, 0, 0), mat="galvanized", segments=12)
    for sy in (-0.72, 0.72):                                                # 后托轮
        base.cylinder(0.30, 0.22, (-2.55, sy, ch + 0.90),
                      rotation=(math.pi / 2.0, 0, 0), mat=dark, segments=12)
        base.box((0.72, 0.30, 0.60), (-2.55, sy, ch + 0.60), mat=gray)
        base.box((0.30, 0.22, 0.70), (-2.55, sy, ch + 1.45),
                 rotation=(0.0, math.radians(24.0), 0.0), mat=gray)
    base.box((0.9, 1.4, 0.5), (-3.55, 0.0, ch + 0.55), mat=gray)            # 尾部机架
    base.box((0.5, 1.2, 0.9), (-3.75, 0.0, ch + 1.30), mat=dark)            # 减速机罩
    base.cylinder(0.22, 0.9, (0.95, 0.85, ch + 1.10), mat=gray, segments=10)  # 液压马达

    # 进料斗 / 出料溜槽 / 水箱 / 爬梯
    base.box((0.8, 1.1, 0.5), (-4.05, 0.0, ch + 1.75),
             rotation=(0.0, math.radians(-18.0), 0.0), mat=gray)            # 进料斗
    base.box((0.9, 1.3, 0.10), (-4.20, 0.0, ch + 2.00),
             rotation=(0.0, math.radians(-14.0), 0.0), mat=dark)
    for sx in (-4.35, -4.05):                                               # 出料溜槽
        base.box((0.16, 0.10, 0.70), (sx, 0.30, ch + 1.30),
                 rotation=(0.0, math.radians(20.0), 0.0), mat=gray)
    base.box((1.10, 0.10, 0.08), (-4.20, 0.30, ch + 1.62),
             rotation=(0.0, math.radians(20.0), 0.0), mat=gray)
    base.box((1.10, 0.10, 0.08), (-3.55, 0.30, ch + 1.36),
             rotation=(0.0, math.radians(-20.0), 0.0), mat=gray)
    base.box((0.16, 0.16, 0.90), (-4.55, 0.30, ch + 1.05), mat="galvanized")  # 溜槽立柱
    base.cylinder(0.36, 1.5, (2.05, -(w / 2.0 - 0.34), ch + 0.95),          # 水箱
                  rotation=(math.pi / 2.0, 0, 0), mat="steel_blue", segments=12)
    base.box((0.5, 0.5, 0.4), (2.05, -(w / 2.0 - 0.34), ch + 1.45), mat=gray)
    for sx in (-3.20, -3.55):                                               # 尾部爬梯
        base.beam((sx, -0.80, ch - 0.30), (sx, -0.80, ch + 1.35), 0.055,
                  mat="galvanized")
    for k in range(5):
        base.beam((-3.20, -0.80, ch - 0.20 + k * 0.38),
                  (-3.55, -0.80, ch - 0.20 + k * 0.38), 0.045, mat="galvanized")
    for sx in (-3.95, -2.95):                                               # 尾部平台
        base.beam((sx, -0.95, ch + 1.35), (sx, 0.55, ch + 1.35), 0.05,
                  mat="galvanized")
    base.box((1.10, 1.55, 0.06), (-3.45, -0.20, ch + 1.40), mat=gray)

    # 搅拌筒（独立子节点，可自转）
    base_obj = base.build(collection)

    drum = MeshBuilder("Mixer_Drum")
    drum.cylinder(1.05, 2.00, (0.0, 0.0, 0.0), mat=drum_mat, segments=18)     # 中段
    drum.cone(1.05, 0.52, 1.00, (0.0, 0.0, 1.50), mat=drum_mat, segments=18)  # 前端锥
    drum.cone(0.78, 1.05, 0.90, (0.0, 0.0, -1.45), mat=drum_mat, segments=18)  # 后端锥
    drum.cylinder(0.82, 0.16, (0.0, 0.0, -1.98), mat="paint_red", segments=18)  # 出料口
    drum.cylinder(1.11, 0.13, (0.0, 0.0, 0.62), mat="paint_red", segments=18)   # 加强箍
    drum.cylinder(1.11, 0.13, (0.0, 0.0, -0.62), mat="paint_red", segments=18)
    drum.cylinder(0.60, 0.14, (0.0, 0.0, 1.72), mat="paint_red", segments=18)
    for ry in (-1.05, 1.05):                                                 # 筒身纵向筋
        drum.box((1.95, 0.16, 0.13), (0.0, ry, 0.0), mat=gray)
    drum_obj = drum.build(collection)
    drum_obj.rotation_euler = (0.0, math.radians(78.0), 0.0)
    drum_obj.location = (-0.70, 0.0, ch + 1.60)
    parent_to(drum_obj, base_obj)

    return base_obj


# 自卸翻斗车（正面朝 +X）
def build_dump_truck(collection=None):
    body = "machine_yellow"
    dark = "machine_dark"
    gray = "steel_gray"

    w = C.TRUCK_W                     # 车宽
    r = C.TRUCK_WHEEL_R               # 车轮半径
    ch = C.TRUCK_CHASSIS_H            # 底盘高（车架上平面）

    base = MeshBuilder("DumpTruck_Base")

    # 车架总成
    rail_y = w / 2.0 - 0.44
    for sy in (-rail_y, rail_y):
        base.box((8.3, 0.18, 0.36), (0.0, sy, ch - 0.02), mat=dark)          # 纵梁
    for cx in (3.3, 1.1, -1.3, -3.7):
        base.box((0.22, 2.0 * rail_y, 0.18), (cx, 0.0, ch - 0.02), mat=gray)  # 横梁
    base.box((8.0, 1.5, 0.12), (0.0, 0.0, ch + 0.14), mat=gray)              # 副车架

    # 车轮（前单后双）
    def _wheel(ax, wy, tw):
        base.cylinder(r, tw, (ax, wy, r), rotation=(math.pi / 2.0, 0, 0),
                      mat=dark, segments=14)                                 # 轮胎
        base.cylinder(r * 0.44, tw + 0.06, (ax, wy, r),
                      rotation=(math.pi / 2.0, 0, 0), mat=gray, segments=10)  # 轮毂

    for sy in (-0.96, 0.96):
        _wheel(2.65, sy, 0.44)                                               # 前桥单胎
    for ax in (-1.25, -2.80):
        for sy in (-1.05, -0.65, 0.65, 1.05):
            _wheel(ax, sy, 0.36)                                             # 后桥双胎

    # 挡泥板与前后泥皮
    for sy in (-1.12, 1.12):
        base.box((3.9, 0.34, 0.13), (-2.02, sy, r + 0.76), mat=gray)         # 后轮挡泥板
    for sy in (-0.98, 0.98):
        base.box((0.07, 0.34, 0.42), (2.04, sy, 0.62), mat=dark)             # 前轮后泥皮

    # 油箱 / 电瓶箱 / 储气筒
    base.cylinder(0.30, 1.35, (1.05, w / 2.0 - 0.24, ch - 0.02),
                  rotation=(0.0, math.pi / 2.0, 0.0), mat=gray, segments=12)  # 圆筒油箱
    for sx in (0.55, 1.55):
        base.box((0.09, 0.40, 0.62), (sx, w / 2.0 - 0.20, ch - 0.02), mat=dark)
    base.box((0.95, 0.40, 0.46), (1.05, -(w / 2.0 - 0.18), ch - 0.06), mat=dark)  # 电瓶箱
    base.cylinder(0.14, 1.4, (0.0, 0.0, ch - 0.14), rotation=(math.pi / 2.0, 0, 0),
                  mat=gray, segments=10)                                      # 储气筒

    # 驾驶室（平头全浮式）
    cab_cx = 3.15
    cab_l = 2.52
    cab_w = w - 0.06
    cab_bot = ch
    cab_top = ch + 1.92
    fx = cab_cx + cab_l / 2.0               # 前脸
    win_z = cab_bot + 1.44
    ww = cab_w / 2.0

    # 室体
    base.box((cab_l, cab_w, cab_top - cab_bot),
             (cab_cx, 0.0, (cab_bot + cab_top) / 2.0), mat=body)
    base.box((cab_l + 0.06, cab_w + 0.05, 0.10), (cab_cx, 0.0, cab_top - 0.02),
             mat=body)                                                          # 顶盖
    base.box((cab_l - 0.10, cab_w + 0.06, 0.10), (cab_cx, 0.0, cab_bot + 0.05),
             mat=dark)                                                          # 裙边
    base.box((cab_l + 0.03, cab_w + 0.02, 0.07), (cab_cx, 0.0, cab_bot + 0.62),
             mat=dark)                                                          # 腰线

    # 前围面罩，略后倾
    rake = math.radians(7.0)
    base.box((0.10, cab_w - 0.10, 1.02), (fx - 0.02, 0.0, cab_bot + 0.55),
             rotation=(0.0, rake, 0.0), mat=body)                               # 面罩
    base.box((0.16, cab_w - 0.02, 0.16), (fx - 0.03, 0.0, cab_bot + 1.06),
             rotation=(0.0, rake, 0.0), mat=dark)                               # 面罩上檐

    # 风挡 + 中柱 + 窗框
    for sy in (-1.0, 1.0):
        base.box((0.08, cab_w / 2.0 - 0.12, 0.80), (fx - 0.05, sy * (cab_w / 4.0), win_z),
                 rotation=(0.0, rake, 0.0), mat="glass")
        base.box((0.10, cab_w / 2.0 - 0.06, 0.07),
                 (fx - 0.03, sy * (cab_w / 4.0), win_z + 0.44),
                 rotation=(0.0, rake, 0.0), mat=dark)
        base.box((0.10, cab_w / 2.0 - 0.06, 0.07),
                 (fx - 0.03, sy * (cab_w / 4.0), win_z - 0.44),
                 rotation=(0.0, rake, 0.0), mat=dark)
    base.box((0.11, 0.09, 0.88), (fx - 0.04, 0.0, win_z),
             rotation=(0.0, rake, 0.0), mat=body)                               # 风挡中柱
    for sy in (-1.0, 1.0):                                                      # 雨刮
        base.beam((fx - 0.07, sy * 0.42, cab_bot + 1.06),
                  (fx - 0.07, sy * 1.02, cab_bot + 1.20), 0.03, mat="rail_black")

    # 遮阳板 + 车顶导流罩
    base.box((0.44, cab_w + 0.04, 0.07), (fx - 0.16, 0.0, cab_top + 0.14),
             rotation=(0.0, math.radians(16.0), 0.0), mat=body)
    for sy in (-1.0, 1.0):
        base.box((0.10, 0.06, 0.26), (fx - 0.30, sy * (ww - 0.10), cab_top + 0.05),
                 rotation=(0.0, math.radians(16.0), 0.0), mat=body)
    base.box((1.10, cab_w - 0.14, 0.06), (cab_cx + 0.55, 0.0, cab_top + 0.24),
             rotation=(0.0, math.radians(-9.0), 0.0), mat=body)                 # 导流罩顶板
    base.box((0.08, cab_w - 0.14, 0.24), (cab_cx + 1.08, 0.0, cab_top + 0.14),
             mat=body)                                                          # 罩后立板
    for sy in (-1.0, 1.0):                                                      # 罩侧板
        base.box((1.10, 0.06, 0.22), (cab_cx + 0.55, sy * (cab_w / 2.0 - 0.12),
                                      cab_top + 0.16),
                 rotation=(0.0, math.radians(-9.0), 0.0), mat=body)

    # 车顶示廓灯，5 只琥珀色
    for k in range(5):
        base.cylinder(0.05, 0.07, (fx - 0.34, -0.76 + k * 0.38, cab_top + 0.19),
                      mat="hazard_yellow", segments=8)

    # 侧窗 / 车门 / 后窗
    base.box((0.07, cab_w - 0.46, 0.58), (cab_cx - cab_l / 2.0 + 0.03, 0.0,
                                          win_z + 0.02), mat="glass")
    base.box((0.09, cab_w - 0.38, 0.07), (cab_cx - cab_l / 2.0 + 0.04, 0.0,
                                          win_z + 0.34), mat=dark)
    for sy in (-(ww + 0.004), ww + 0.004):
        base.box((0.92, 0.05, 0.60), (cab_cx + 0.36, sy, win_z + 0.05),
                 mat="glass")                                                   # 侧窗
        base.box((0.98, 0.05, 0.07), (cab_cx + 0.36, sy, win_z + 0.40), mat=dark)
        base.box((0.98, 0.05, 0.07), (cab_cx + 0.36, sy, win_z - 0.32), mat=dark)
        base.box((0.06, 0.05, 1.05), (cab_cx + 0.94, sy, cab_bot + 0.60), mat=dark)
        base.box((1.72, 0.04, 0.05), (cab_cx + 0.06, sy, cab_bot + 1.06), mat=dark)
        base.box((1.72, 0.04, 0.05), (cab_cx + 0.06, sy, cab_bot + 0.30), mat=dark)
        base.box((0.26, 0.07, 0.06), (cab_cx + 0.70, sy, cab_bot + 0.98), mat=gray)
        base.box((0.07, 0.06, 0.52), (cab_cx + 0.62, sy, cab_bot + 0.62), mat=gray)
        for zz in (cab_bot + 1.02, cab_bot + 0.34):                             # 车门铰链
            base.box((0.16, 0.05, 0.10), (cab_cx - 0.80, sy, zz), mat=dark)

    # 前脸：格栅 / 保险杠 / 灯具 / 牌照
    for i in range(7):
        base.box((0.07, cab_w - 0.42, 0.085), (fx + 0.01, 0.0,
                                               cab_bot + 0.16 + i * 0.115),
                 rotation=(0.0, rake, 0.0), mat=dark)
    base.box((0.09, 0.09, 0.86), (fx + 0.03, 0.0, cab_bot + 0.56),
             rotation=(0.0, rake, 0.0), mat=gray)
    base.box((0.07, 0.34, 0.22), (fx + 0.05, 0.0, cab_bot + 0.92),
             rotation=(0.0, rake, 0.0), mat="line_white")
    for sy in (-0.84, 0.84):                                                    # 前照灯 + 雾灯
        base.box((0.16, 0.42, 0.26), (fx + 0.02, sy, cab_bot + 0.66), mat="lamp_white")
        base.box((0.13, 0.24, 0.14), (fx + 0.03, sy * 0.72, cab_bot + 0.40),
                 mat="hazard_yellow")
        base.box((0.11, 0.18, 0.13), (fx + 0.10, sy * 1.02, cab_bot - 0.02),
                 mat="lamp_white")
    # 两级保险杠 + 踏步 + 拖钩
    base.box((0.30, w - 0.06, 0.34), (fx + 0.13, 0.0, cab_bot + 0.02), mat=gray)
    base.box((0.36, w - 0.30, 0.16), (fx + 0.15, 0.0, cab_bot - 0.16), mat=gray)
    base.box((0.24, 0.86, 0.07), (fx + 0.30, 0.0, cab_bot - 0.05), mat=dark)
    base.box((0.18, 0.18, 0.14), (fx + 0.34, -0.34, cab_bot + 0.02), mat=gray)
    base.box((0.05, 0.50, 0.26), (fx + 0.30, 0.0, cab_bot + 0.06), mat="line_white")

    # 后视镜 / 登车踏板
    for sy in (-(ww + 0.04), ww + 0.04):
        base.beam((fx - 0.20, sy * 0.95, cab_bot + 1.68),
                  (fx + 0.02, sy, cab_bot + 1.58), 0.05, mat=gray)
        base.beam((fx - 0.16, sy * 0.95, cab_bot + 1.10),
                  (fx + 0.02, sy, cab_bot + 1.18), 0.05, mat=gray)
        base.box((0.10, 0.10, 0.48), (fx + 0.03, sy, cab_bot + 1.34), mat=gray)
        base.box((0.08, 0.09, 0.20), (fx + 0.05, sy * 1.02, cab_bot + 0.92), mat=dark)
    for sy in (-(ww + 0.03), ww + 0.03):
        for zz in (0.56, 0.96):
            base.box((0.52, 0.13, 0.05), (cab_cx + 0.52, sy, zz), mat=dark)
        base.box((0.52, 0.04, 0.05), (cab_cx + 0.52, sy, 1.36), mat=dark)
    # 排气管 + 隔热罩 + 排气帽
    ex, ey = cab_cx - cab_l / 2.0 + 0.10, w / 2.0 + 0.16
    base.cylinder(0.09, 2.0, (ex, ey, ch + 1.25), mat=gray, segments=8)
    base.box((0.20, 0.24, 1.15), (ex, ey, ch + 1.15), mat=dark)
    base.cylinder(0.13, 0.14, (ex, ey, ch + 2.28), mat=gray, segments=8)
    for zz in (ch + 0.45, ch + 2.05):
        base.box((0.16, 0.20, 0.06), (ex, ey, zz), mat=gray)

    # 液压举升油缸
    base.box((0.55, 0.70, 0.18), (-0.35, 0.0, ch + 0.28), mat=gray)          # 油缸底座
    base.cylinder(0.16, 0.26, (-0.35, 0.0, ch + 0.44), mat=gray, segments=10)  # 油缸体
    base.cylinder(0.10, 0.12, (-0.35, 0.0, ch + 0.59), mat="galvanized", segments=8)

    base_obj = base.build(collection)

    # 自卸车厢，绕尾部铰点翻转
    bl = C.TRUCK_BED_LEN
    bh = C.TRUCK_BED_WALL
    bw = w - 0.16
    ft = 0.20                                       # 底板厚

    bed = MeshBuilder("DumpTruck_Bed")
    bed.box((bl, bw, ft), (bl / 2.0, 0.0, ft / 2.0), mat=body)               # 底板

    for sy in (-(bw / 2.0 - 0.06), bw / 2.0 - 0.06):
        # 侧板
        bed.box((bl, 0.12, bh), (bl / 2.0, sy, ft + bh / 2.0), mat=body)
        bed.box((bl, 0.24, 0.10), (bl / 2.0, sy, ft + bh + 0.03), mat=body)   # 顶部圆边

    bed.box((0.16, bw, bh + 0.34), (bl - 0.08, 0.0, ft + (bh + 0.34) / 2.0),
            mat=body)                                                        # 前立板
    bed.box((0.22, bw + 0.18, 0.10), (bl - 0.08, 0.0, ft + bh + 0.38), mat=dark)  # 前挡檐
    bed.box((0.12, bw - 0.04, bh + 0.08), (0.06, 0.0, ft + (bh + 0.08) / 2.0),
            mat=body)                                                        # 尾门
    for zz in (ft + bh * 0.28, ft + bh * 0.72):                              # 尾门横筋
        bed.box((0.06, bw - 0.10, 0.10), (-0.01, 0.0, zz), mat=dark)
    bed.cylinder(0.045, bh, (0.0, 0.0, ft + bh / 2.0), mat=gray, segments=8)  # 尾门锁杆
    bed.box((0.34, 0.94, 0.34), (0.16, 0.0, -0.18), mat=gray)                # 尾部铰座

    bed_obj = bed.build(collection)
    bed_obj.location = (-4.00, 0.0, ch + 0.62)
    parent_to(bed_obj, base_obj)

    # 车厢里的土，独立节点，卸土时缩下去
    dirt = MeshBuilder("DumpTruck_Dirt")
    dirt.box((bl - 0.6, bw - 0.34, 0.60), (bl / 2.0, 0.0, ft + 0.30), mat="dirt_dark")
    dirt.cylinder(bw * 0.40, 0.34, (bl - 1.2, 0.0, ft + 0.62), mat="dirt", segments=10)
    dirt.cylinder(bw * 0.30, 0.30, (bl - 3.0, 0.0, ft + 0.58), mat="dirt", segments=10)
    dirt_obj = dirt.build(collection)
    dirt_obj.location = (0.0, 0.0, 0.0)
    parent_to(dirt_obj, bed_obj)

    return base_obj
