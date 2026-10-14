# -*- coding: utf-8 -*-
"""
临建与场地类模型

包含：活动板房、工地大门、彩钢围挡、材料堆场、场地与道路。
这几个是工地「看脸」的部分，做好之后整个场景的辨识度就出来了。
"""

import math

import bpy
from mathutils import Vector, Euler, Matrix

from utils import MeshBuilder, make_object, parent_to
import config as C


# --------------------------------------------------------------------------
# 弧形雨棚通用做法：seg 段小平板拼出一段圆弧，内缘埋进墙面 0.10m，棚下不设支撑杆
#   sgn = -1 朝 -Y 外挑，+1 朝 +Y 外挑；y0 为内缘所在的墙面位置
# --------------------------------------------------------------------------
def _arc_canopy(b, cx, width, z0, radius, deg, seg, y0, sgn=-1.0,
                mat="roof_blue", edge="steel_gray"):
    dth = math.radians(deg) / seg
    facet = radius * dth + 0.03
    for k in range(seg):
        th = (k + 0.5) * dth
        py = y0 + sgn * (0.10 + radius * math.sin(th))
        pz = z0 - radius * (1.0 - math.cos(th))
        b.box((width, facet, 0.07), (cx, py, pz),
              rotation=(-sgn * th, 0.0, 0.0), mat=mat)
        for sx in (cx - width / 2.0 + 0.06, cx + width / 2.0 - 0.06):
            b.box((0.11, facet, 0.10), (sx, py, pz + 0.02),
                  rotation=(-sgn * th, 0.0, 0.0), mat=edge)


# --------------------------------------------------------------------------
# 宿舍坡屋顶通用做法：两块屋面板 + 屋脊盖板 + 山墙三角填补 + 两侧檐口封边
#   · 两坡屋面板从屋脊（t=0）一直坡到檐口外缘，脊线处精确相接，不再互相穿插；
#   · 檐口竖直封边板下沿压住墙顶 0.10m，屋面板下皮也压住墙顶，屋面与墙体成一体；
#   · 山墙按同宽阶梯逐级填实（每级上沿取坡面高度），阶梯顶始终埋在屋面板厚度内，
#     因此既不顶穿屋面、也不残留三角洞；
#   · 山墙方向出挑 0.12m、檐口方向出挑约 0.13m，都在“小挑檐”范围内。
# --------------------------------------------------------------------------
def _dorm_roof(b, cxx, cyy, hx, hy, wall_top, rise,
               roof_mat="roof_blue", gable_mat="wall_white",
               edge_mat="steel_gray", wall_t=0.10):
    half = hy / 2.0
    pitch = math.atan(rise / half)
    cos_p, sin_p = math.cos(pitch), math.sin(pitch)
    slope = math.hypot(half, rise)          # 屋脊到檐口的坡面长度

    eave_out = 0.12                         # 檐口（长边）水平出挑
    gable_out = 0.12                        # 山墙（短边）水平出挑
    plate_t = 0.10                          # 屋面板厚
    ext = eave_out / cos_p                  # 沿坡面越过檐口的长度
    plate_len = slope + ext

    # 屋面板：中心取坡面中点，正面朝 +Y 一侧绕 X 转 -pitch（-Y 侧镜像）
    for sgn in (1.0, -1.0):
        t_c = plate_len / 2.0
        cy_ = cyy + sgn * t_c * cos_p
        cz_ = wall_top + rise - t_c * sin_p
        b.box((hx + 2.0 * gable_out, plate_len, plate_t),
              (cxx, cy_, cz_), rotation=(-sgn * pitch, 0.0, 0.0), mat=roof_mat)

    # 屋脊盖板：盖住两坡顶面在脊线处那条窄缝
    b.box((hx + 2.0 * gable_out, 0.24, 0.12), (cxx, cyy, wall_top + rise),
          mat=roof_mat)

    # 山墙三角填补：每级踏步上沿取坡面标高处的坡面宽度（越往上越窄），
    # 与相邻踏步在竖向上轻微搭接，形成实心三角，无洞。
    n_steps = 16
    step = rise / float(n_steps)
    for gx in (cxx - hx / 2.0 + wall_t / 2.0, cxx + hx / 2.0 - wall_t / 2.0):
        for k in range(n_steps):
            w = hy * (1.0 - k / float(n_steps))
            b.box((wall_t, w, step + 0.006),
                  (gx, cyy, wall_top + (k + 0.5) * step), mat=gable_mat)

    # 檐口封边（长边两侧）：竖直封边板，下沿压住墙顶 0.10m
    for sgn in (1.0, -1.0):
        b.box((hx + 2.0 * gable_out, 0.06, 0.24),
              (cxx, cyy + sgn * (half + eave_out - 0.03), wall_top + 0.02),
              mat=edge_mat)


# --------------------------------------------------------------------------
# 活动板房（箱式房，可拼成宿舍 / 办公区）
# --------------------------------------------------------------------------
def build_prefab_house(collection=None):
    b = MeshBuilder("PrefabHouse")
    hx, hy, hz = C.HOUSE_SIZE
    count = C.HOUSE_COUNT
    rise = C.HOUSE_ROOF_H
    wall_t = 0.10

    for i in range(count):
        ox = i * (hx + 0.15)          # 每间之间留 15cm 缝
        cxx = ox + hx / 2.0

        # 底盘
        b.box((hx, hy, 0.16), (cxx, 0, 0.08), mat="steel_gray")

        # 四面墙：背面整墙，正面留门洞（两段墙 + 门楣）
        b.box((hx, wall_t, hz), (cxx, -hy / 2.0, 0.16 + hz / 2.0), mat="wall_white")

        door_w = 0.95
        front_len = (hx - door_w) / 2.0
        for seg_x in (ox + front_len / 2.0, ox + hx - front_len / 2.0):
            b.box((front_len, wall_t, hz), (seg_x, hy / 2.0, 0.16 + hz / 2.0),
                  mat="wall_white")

        b.box((wall_t, hy, hz), (ox + wall_t / 2.0, 0, 0.16 + hz / 2.0), mat="wall_white")
        b.box((wall_t, hy, hz), (ox + hx - wall_t / 2.0, 0, 0.16 + hz / 2.0),
              mat="wall_white")

        wall_top = 0.16 + hz
        face_y = hy / 2.0 + wall_t / 2.0 + 0.03       # 门窗贴在外墙面上

        # 门楣（门洞上方）
        b.box((door_w, wall_t, hz * 0.28), (ox + hx / 2.0, hy / 2.0,
                                            wall_top - hz * 0.14), mat="wall_white")

        # 门扇
        b.box((door_w, 0.05, hz * 0.72), (ox + hx / 2.0, face_y, 0.16 + hz * 0.36),
              mat="door_gray")

        # 窗
        for wx in (ox + hx * 0.18, ox + hx * 0.82):
            b.box((0.9, 0.06, 0.9), (wx, face_y, wall_top - 0.9), mat="glass")

        # 坡屋顶（一体成型：脊线严丝合缝、檐口与山墙全部封边、压住墙顶）
        _dorm_roof(b, cxx, 0.0, hx, hy, wall_top, rise)

        # 门头雨棚（悬挑到走廊上方）
        ply = hy / 2.0 + 0.42
        b.box((door_w + 0.5, 0.8, 0.05), (ox + hx / 2.0, ply, wall_top + 0.32),
              mat="roof_blue")
        for sx in (ox + hx / 2.0 - door_w / 2.0 - 0.2, ox + hx / 2.0 + door_w / 2.0 + 0.2):
            b.beam((sx, hy / 2.0, wall_top + 0.05), (sx, ply + 0.36, wall_top + 0.30),
                   0.035, mat="galvanized")

        # 空调外机（背面悬挂）
        ac_x = ox + hx * 0.75
        ac_z = 0.16 + hz * 0.55
        b.box((0.8, 0.35, 0.55), (ac_x, -hy / 2.0 - 0.24, ac_z), mat="wall_white")
        b.box((0.86, 0.06, 0.06), (ac_x, -hy / 2.0 - 0.06, ac_z), mat="steel_gray")

        # 门牌 / 房号牌
        b.box((0.44, 0.05, 0.28), (ox + hx / 2.0 + 0.78, face_y, wall_top - 0.32),
              mat="board_blue")

        # 屋脊通风帽
        b.box((0.5, 0.5, 0.28), (cxx, 0.0, wall_top + rise + 0.14), mat="steel_gray")

    # 走廊（做一条通长走廊 + 栏杆）
    total_x = count * (hx + 0.15) - 0.15
    corr_y = hy / 2.0 + 1.1
    b.box((total_x, 2.0, 0.12), (total_x / 2.0, corr_y, 0.16), mat="steel_gray")
    b.beam((0.0, corr_y + 1.0, 0.16), (total_x, corr_y + 1.0, 0.16), 0.06, mat="steel_blue")
    b.beam((0.0, corr_y + 1.0, 1.06), (total_x, corr_y + 1.0, 1.06), 0.06, mat="steel_blue")
    step = 1.2
    k = 0
    while k * step <= total_x:
        b.beam((k * step, corr_y + 1.0, 0.16), (k * step, corr_y + 1.0, 1.06),
               0.05, mat="steel_blue")
        k += 1

    return b.build(collection)


# --------------------------------------------------------------------------
# 大门门扇（单扇）：几何以「竖向铰链轴」为局部原点，门扇沿 direction*X 伸出
#   —— direction = +1 为左扇（铰链在门洞西端、向 +X 伸向门洞正中），
#      direction = -1 为右扇（铰链在门洞东端、向 -X 伸向门洞正中）。
# leaf = 门扇长度（铰链轴到门扇自由边的距离）。
# 几何即「闭合」姿态：两扇在门洞正中相接、正好填满车道。
# 建好后由 make_object 把物体 location 放回铰链在门体内的位置，于是
# 导入 three.js 后只需旋转各自的局部 Y 轴即可开合，无需任何位移补偿。
# --------------------------------------------------------------------------
def _gate_leaf(direction, leaf):
    b = MeshBuilder("SiteGate_Leaf")

    def put(size, x_off, z, mat):
        b.box(size, (direction * x_off, 0.0, z), mat=mat)

    put((leaf, 0.07, 2.35), leaf / 2.0, 1.23, "fence_blue")           # 门板
    for zz in (0.11, 2.36):                                           # 上下横档
        put((leaf, 0.11, 0.13), leaf / 2.0, zz, "steel_gray")
    put((leaf, 0.11, 0.10), leaf / 2.0, 1.32, "steel_gray")           # 中横档
    for x_off in (0.06, leaf - 0.06):                                 # 两端竖梃
        put((0.12, 0.11, 2.5), x_off, 1.27, "steel_gray")
    b.cylinder(0.03, 0.3, (direction * (leaf - 0.2), 0.0, 1.32),      # 把手
               mat="galvanized", segments=6)
    return b


# --------------------------------------------------------------------------
# 工地大门（门柱 + 门楣招牌 + 对开蓝门扇 + 运输车道减速带 + 人脸识别人行通道 + 门卫室）
#   局部坐标：x = 0 为运输车道中心，+y 指向工地内侧，门柱位于 y = 0（即围墙线上）
#   总宽度 = 车行道 8m + 两侧门柱 2×1m + 东侧人行通道 2.2m = 12.2m，正好补满围墙缺口
#   两扇蓝门是独立导出的节点（SiteGate_LeafL / SiteGate_LeafR），便于前端开合动画
# --------------------------------------------------------------------------
def build_site_gate(collection=None):
    b = MeshBuilder("SiteGate")
    gw = C.GATE_WIDTH
    pw = C.GATE_PILLAR_W
    ph = C.GATE_HEIGHT
    px = gw / 2.0 + pw / 2.0

    # ================= 门柱：基座 + 砌体（带砖缝）+ 腰线 + 双层压顶 + 柱顶灯 + 摄像头 =================
    for sx in (-px, px):
        # 两级基座
        b.box((pw + 0.62, pw + 0.62, 0.35), (sx, 0.0, 0.175), mat="concrete_dark")
        b.box((pw + 0.4, pw + 0.4, 0.55), (sx, 0.0, 0.62), mat="concrete")
        b.box((pw + 0.2, pw + 0.2, 0.16), (sx, 0.0, 0.98), mat="concrete_dark")
        # 柱身砌体
        body_z0, body_z1 = 1.06, ph - 0.55
        b.box((pw, pw, body_z1 - body_z0), (sx, 0.0, (body_z0 + body_z1) / 2.0),
              mat="brick")
        zz = body_z0 + 0.62
        while zz < body_z1 - 0.15:
            b.box((pw + 0.05, pw + 0.05, 0.035), (sx, 0.0, zz), mat="concrete")
            zz += 0.62
        # 柱顶腰线 + 双层压顶
        b.box((pw + 0.28, pw + 0.28, 0.2), (sx, 0.0, ph - 0.45), mat="concrete")
        b.box((pw + 0.55, pw + 0.55, 0.34), (sx, 0.0, ph - 0.18), mat="concrete")
        b.box((pw + 0.32, pw + 0.32, 0.18), (sx, 0.0, ph + 0.09), mat="concrete_dark")
        # 柱顶庭院灯
        b.cylinder(0.075, 0.46, (sx, 0.0, ph + 0.41), mat="steel_gray", segments=8)
        b.box((0.32, 0.32, 0.16), (sx, 0.0, ph + 0.72), mat="lamp_white")
        b.box((0.36, 0.36, 0.06), (sx, 0.0, ph + 0.82), mat="concrete_dark")
        # 监控摄像头（挑臂 + 机身，朝工地外侧）
        b.beam((sx, -(pw / 2.0), ph - 1.5), (sx, -(pw / 2.0 + 0.62), ph - 1.28),
               0.06, mat="galvanized")
        b.box((0.2, 0.34, 0.2), (sx, -(pw / 2.0 + 0.78), ph - 1.25), mat="wall_white")
        b.box((0.12, 0.12, 0.12), (sx, -(pw / 2.0 + 1.0), ph - 1.25), mat="rail_black")
        # 柱脚防撞护角（反光）
        for cx in (sx - pw / 2.0, sx + pw / 2.0):
            b.box((0.10, 0.10, 1.0), (cx, -pw / 2.0, 0.5), mat="hazard_yellow")

    # ================= 门楣横梁 + 招牌（带边框与支柱） =================
    lintel_w = gw + pw * 2.0 + 0.4
    b.box((lintel_w, 0.66, 0.5), (0.0, 0.0, ph - 0.25), mat="concrete")
    b.box((lintel_w + 0.1, 0.3, 0.12), (0.0, -0.45, ph - 0.42), mat="concrete_dark")
    sign_w, sign_h = gw + 0.9, 1.2
    b.box((sign_w, 0.2, sign_h), (0.0, 0.0, ph + 0.82), mat="board_blue")
    for zz in (ph + 0.82 + sign_h / 2.0 + 0.08, ph + 0.82 - sign_h / 2.0 - 0.08):
        b.box((sign_w + 0.22, 0.12, 0.16), (0.0, -0.1, zz), mat="steel_gray")
    for sx in (-(sign_w + 0.22) / 2.0, (sign_w + 0.22) / 2.0):
        b.box((0.16, 0.12, sign_h + 0.32), (sx, -0.1, ph + 0.82), mat="steel_gray")
    for sx in (-(gw / 2.0 - 0.5), gw / 2.0 - 0.5):
        b.box((0.18, 0.18, 0.24), (sx, 0.0, ph + 0.12), mat="steel_gray")

    # ================= 运输车专用通道：只保留两道路口红黄减速带 =================
    # 说明（用户要求）：
    #   · 门扇已改为两个独立节点（见 _gate_leaf / 本函数末尾），此处不再放门扇；
    #   · 入口横向排水沟（concrete_dark 沟槽 + 一排 steel_gray 排水篦子）整体取消；
    #   · 道闸整体取消（含 steel_blue 机箱、基座、paint_red 红白闸杆及其 line_white
    #     反光条、rail_black 读卡器），让门口只剩蓝色大门。
    b.box((gw, 0.36, 0.10), (0.0, 2.4, 0.05), mat="hazard_yellow")           # 减速带
    b.box((gw, 0.36, 0.10), (0.0, 3.6, 0.05), mat="hazard_yellow")

    # ================= 人脸识别人行通道（门柱东侧，位于围墙缺口内） =================
    ped_w = 2.2
    ped_cx = gw / 2.0 + pw + ped_w / 2.0            # 5.0 ~ 7.2
    ped_h = 2.85
    for sx in (ped_cx - ped_w / 2.0, ped_cx + ped_w / 2.0):                 # 通道门架立柱
        b.box((0.34, 0.34, 0.26), (sx, 0.0, 0.13), mat="concrete")
        b.beam((sx, 0.0, 0.26), (sx, 0.0, ped_h), 0.22, mat="steel_gray")
        b.box((0.44, 0.44, 0.08), (sx, 0.0, ped_h + 0.04), mat="steel_blue")
    b.box((ped_w + 0.5, 0.16, 0.12), (ped_cx, 0.0, ped_h), mat="steel_blue")  # 通道顶梁
    # 通道小顶棚（与工具房同款弧形棚面）
    _arc_canopy(b, ped_cx, ped_w + 0.6, 2.42, 1.35, 34.0, 6, 0.15)
    # 人脸识别终端（底座落地 + 立柱 + 屏幕 + 摄像头，不悬空）
    b.box((0.30, 0.30, 0.12), (ped_cx - ped_w / 2.0 + 0.30, 0.0, 0.06),
          mat="steel_gray")
    b.beam((ped_cx - ped_w / 2.0 + 0.30, 0.0, 0.12),
           (ped_cx - ped_w / 2.0 + 0.30, 0.0, 1.52), 0.12, mat="steel_gray")
    b.box((0.20, 0.30, 0.40), (ped_cx - ped_w / 2.0 + 0.30, -0.04, 1.42),
          mat="board_blue")
    b.box((0.16, 0.12, 0.10), (ped_cx - ped_w / 2.0 + 0.30, -0.04, 1.68),
          mat="rail_black")
    # 三辊闸 / 翼闸（两片翼板 + 机箱，机箱落地）
    b.box((0.26, 0.60, 0.90), (ped_cx + ped_w / 2.0 - 0.24, 0.0, 0.45),
          mat="steel_gray")
    b.box((0.42, 0.10, 0.34), (ped_cx + ped_w / 2.0 - 0.24, 0.0, 1.06),
          mat="board_blue")
    for sy in (-0.22, 0.22):
        b.box((0.90, 0.05, 0.42), (ped_cx - 0.12, sy, 0.86), mat="glass")
    # 地面标线（黄黑警示 + 人行箭头）—— 不再铺人行道铺装
    walk_w = ped_w - 0.16
    for k in range(3):
        b.box((walk_w - 0.3, 0.16, 0.02), (ped_cx, 0.4 + k * 0.5, 0.075),
              mat="hazard_yellow")
    b.box((0.5, 0.8, 0.02), (ped_cx, 2.7, 0.075), mat="line_white")
    b.box((0.9, 0.5, 0.02), (ped_cx, 3.3, 0.075), mat="line_white")

    # ================= 门卫室（移到人行通道东侧空地，整体旋转 90°：门窗朝西对着通道） =================
    hx, hy, hz = C.GATE_HOUSE_SIZE
    hcx = 9.6                       # 中心：大门轴线以东，完全让开人行通道与围墙路灯
    hcy = 3.6                       # 退到围墙内侧
    base_z = 0.39
    hw = hy / 2.0                   # 旋转后沿 X 的半宽
    hd = hx / 2.0                   # 旋转后沿 Y 的半深
    b.box((hy + 0.6, hx + 0.6, 0.28), (hcx, hcy, 0.14), mat="concrete")
    b.box((hy + 0.3, hx + 0.3, 0.12), (hcx, hcy, 0.33), mat="concrete_dark")
    b.box((hy, hx, hz), (hcx, hcy, base_z + hz / 2.0), mat="wall_white")
    b.box((hy + 0.06, hx + 0.06, 0.3), (hcx, hcy, base_z + 0.15), mat="concrete_dark")
    win_z = base_z + hz * 0.62
    # 值班窗（朝西，正对大门与人行通道）+ 侧窗（朝南，对着场外马路）
    b.box((0.07, 1.40, 1.0), (hcx - hw - 0.04, hcy - 0.55, win_z), mat="glass")
    b.box((0.10, 1.52, 0.09), (hcx - hw - 0.04, hcy - 0.55, win_z - 0.54), mat="concrete")
    b.box((0.10, 1.52, 0.08), (hcx - hw - 0.04, hcy - 0.55, win_z + 0.54), mat="concrete")
    b.box((0.09, 0.07, 1.04), (hcx - hw - 0.04, hcy - 0.55, win_z), mat="steel_gray")
    b.box((hy * 0.6, 0.07, 1.0), (hcx, hcy - hd - 0.04, win_z), mat="glass")
    b.box((hy * 0.66, 0.10, 0.09), (hcx, hcy - hd - 0.04, win_z - 0.54), mat="concrete")
    b.box((hy * 0.66, 0.10, 0.08), (hcx, hcy - hd - 0.04, win_z + 0.54), mat="concrete")
    b.box((0.07, 0.09, 1.04), (hcx, hcy - hd - 0.04, win_z), mat="steel_gray")
    # 门（朝西，正对人行通道）
    b.box((0.07, 1.0, 2.0), (hcx - hw - 0.05, hcy + 0.9, base_z + 1.0), mat="door_gray")
    b.box((0.10, 1.12, 0.12), (hcx - hw - 0.05, hcy + 0.9, base_z + 2.04),
          mat="steel_gray")
    b.cylinder(0.028, 0.26, (hcx - hw - 0.12, hcy + 0.54, base_z + 1.05),
               mat="galvanized", segments=6)
    # 屋面（门卫室不再做门口雨棚）
    b.box((hy + 0.5, hx + 0.5, 0.14), (hcx, hcy, base_z + hz + 0.07), mat="roof_blue")

    gate = b.build(collection)

    # 两扇蓝色门扇：各自一个独立节点，物体原点落在自身铰链轴上（闭合姿态）。
    # 铰链从门洞两端往内收 0.40m：门柱基座是逐级内收的台阶，最下一级比柱身
    # 还向门洞内挑出 0.31m，再给门扇竖梃（厚 0.11m）留足余量，
    # 这样门扇绕铰链转到任意角度（含 90° 极限）都不会插进门柱基座。
    # 左扇向 +X 伸向门洞正中、右扇向 -X 伸向门洞正中，闭合时两扇在门洞正中相接，
    # 横向净宽 7.2m，正好盖住 7m 车行道。
    hinge_x = gw / 2.0 - 0.40
    leaf = hinge_x
    make_object(_gate_leaf(1.0, leaf), "SiteGate_LeafL", collection,
                location=(-hinge_x, 0.0, 0.0))
    make_object(_gate_leaf(-1.0, leaf), "SiteGate_LeafR", collection,
                location=(hinge_x, 0.0, 0.0))
    return gate


# --------------------------------------------------------------------------
# 生活区洗漱池（独立模型，只保留 B 区一处）
#   水池台面沿 X 布置、水龙头朝 +Y（导出后朝场地北侧），原点在台面中心
# --------------------------------------------------------------------------
def build_camp_basin(collection=None):
    b = MeshBuilder("CampBasin")
    L = 9.6                                    # 台面加长（原来 6.4）
    # 地面铺装 + 排水明沟
    b.box((L + 1.6, 2.4, 0.08), (0.0, 0.55, 0.04), mat="concrete_dark")
    b.box((L + 0.4, 0.20, 0.06), (0.0, -0.75, 0.06), mat="steel_gray")
    # 水池台面（面砖 + 前裙 + 挡水沿）
    b.box((L, 1.0, 0.72), (0.0, 0.0, 0.36), mat="concrete")
    b.box((L + 0.10, 1.06, 0.08), (0.0, 0.0, 0.76), mat="wall_white")
    b.box((L + 0.06, 0.10, 0.12), (0.0, 0.53, 0.74), mat="wall_white")
    b.box((L, 0.10, 0.30), (0.0, -0.52, 0.62), mat="wall_white")
    # 6 只水槽 + 6 只龙头
    for i in range(6):
        xx = -L / 2.0 + 0.95 + i * 1.55
        b.box((1.15, 0.62, 0.14), (xx, 0.06, 0.68), mat="water")
        b.cylinder(0.045, 0.42, (xx, 0.40, 0.98), mat="galvanized", segments=6)
        b.beam((xx, 0.40, 1.16), (xx, 0.06, 1.16), 0.04, mat="galvanized")
    # 背墙（面砖 + 镜面 + 挂杆）
    b.box((L, 0.16, 1.30), (0.0, 0.66, 1.45), mat="wall_white")
    b.box((L - 0.6, 0.06, 0.50), (0.0, 0.74, 1.30), mat="glass")
    b.beam((-L / 2.0, 0.86, 1.85), (L / 2.0, 0.86, 1.85), 0.045,
           mat="galvanized")
    # 雨棚（立柱 + 纵梁 + 棚板 + 斜撑）
    for sx in (-(L / 2.0 - 0.5), 0.0, L / 2.0 - 0.5):
        b.beam((sx, 1.15, 0.02), (sx, 1.15, 2.55), 0.07, mat="galvanized")
        b.beam((sx, 1.15, 2.55), (sx, 0.55, 2.75), 0.05, mat="galvanized")
    b.beam((-L / 2.0 - 0.3, 1.15, 2.62), (L / 2.0 + 0.3, 1.15, 2.62), 0.06,
           mat="galvanized")
    b.box((L + 0.8, 1.9, 0.07), (0.0, 0.62, 2.80), mat="tarp_blue")
    return b.build(collection)


# --------------------------------------------------------------------------
# 装配式彩钢围挡（沿局部 +X 排布，单段 18m = 6 块 3m 板）
#   仿真实工地做法：条形基础 + 立柱混凝土墩 + 底座槽钢 + 上下横梁 +
#   压型彩钢板（密排竖楞）+ 板缝压条 + 顶部收边压顶 + 反光警示带 + 周期标识牌
# --------------------------------------------------------------------------
def build_fence(collection=None):
    b = MeshBuilder("Fence")
    pw = C.FENCE_PANEL_W
    fh = C.FENCE_HEIGHT
    post = C.FENCE_POST
    count = C.FENCE_COUNT

    total = pw * count
    # ---- 条形基础（挡水台）+ 立柱独立基础墩 ----
    b.box((total + post, 0.52, 0.28), (total / 2.0 - post / 2.0, 0, 0.14),
          mat="concrete_dark")
    b.box((total + post + 0.06, 0.58, 0.10), (total / 2.0 - post / 2.0, 0, 0.31),
          mat="concrete")
    for i in range(count + 1):
        x = i * pw - post / 2.0
        b.box((0.62, 0.66, 0.20), (x, 0, 0.40), mat="concrete")

    # ---- 底座通长槽钢 ----
    b.box((total, 0.10, 0.12), (total / 2.0 - post / 2.0, 0.02, 0.52),
          mat="steel_gray")

    for i in range(count):
        x0 = i * pw
        cx = x0 + pw / 2.0
        pan_h = fh - 0.46                       # 面板高度
        # 压型彩钢板（内嵌一点，和立柱分开）
        b.box((pw - post * 2, 0.055, pan_h), (cx, 0.0, 0.58 + pan_h / 2.0),
              mat="fence_green")
        # 密排竖楞（每块 7 道，做出压型板的波纹）
        for k in range(1, 7):
            xr = x0 + pw * k / 7.0
            b.beam((xr, 0.055, 0.60), (xr, 0.055, 0.58 + pan_h - 0.02), 0.045,
                   mat="fence_blue")
        # 板缝压条（相邻两块之间）
        if i > 0:
            b.beam((x0, 0.06, 0.58), (x0, 0.06, 0.58 + pan_h), 0.06, mat="fence_blue")
        # 上下横梁（冷弯薄壁型钢）
        b.box((pw - post * 2, 0.09, 0.10), (cx, 0.055, 0.66), mat="steel_gray")
        b.box((pw - post * 2, 0.09, 0.10), (cx, 0.055, 0.58 + pan_h - 0.06),
              mat="steel_gray")
        # 反光警示带
        b.box((pw - post * 2, 0.02, 0.16), (cx, 0.05, 0.58 + pan_h * 0.42),
              mat="hazard_yellow")
        # 顶部收边压顶（蓝色收口 + 滴水线）
        b.box((pw - post * 2 + 0.04, 0.16, 0.12), (cx, 0.0, 0.58 + pan_h + 0.05),
              mat="fence_blue")
        b.box((pw - post * 2 + 0.10, 0.14, 0.05), (cx, 0.0, 0.58 + pan_h + 0.13),
              mat="roof_blue")

    # ---- 每 6 块挂一块安全生产标识牌（周期复现，符合真实施工围挡） ----
    b.box((0.90, 0.06, 1.10), (2.05, 0.06, 1.30), mat="board_blue")
    b.box((0.76, 0.04, 0.34), (2.05, 0.10, 1.62), mat="line_white")
    b.box((0.76, 0.04, 0.24), (2.05, 0.10, 1.18), mat="hazard_yellow")

    # ---- 立柱（方钢管 + 柱顶封盖 + 柱脚底板） ----
    n_posts = count + 1
    for i in range(n_posts):
        x = i * pw - post / 2.0
        b.beam((x, 0, 0.44), (x, 0, 0.58 + fh - 0.46 + 0.10), post, mat="steel_gray")
        b.box((post + 0.10, post + 0.10, 0.05), (x, 0, 0.58 + fh - 0.46 + 0.13),
              mat="steel_gray")
        b.box((post + 0.14, post + 0.14, 0.05), (x, 0, 0.44), mat="steel_gray")

    # ---- 斜撑（每隔一块，在背面斜撑加固） ----
    for i in range(0, count, 2):
        x = i * pw - post / 2.0
        b.beam((x, -0.12, 0.55), (x + pw, -0.12, 0.55 + fh * 0.55), 0.05,
               mat="steel_gray")
        b.beam((x, -0.12, 0.55), (x, -0.30, 0.20), 0.045, mat="steel_gray")

    return b.build(collection)


# --------------------------------------------------------------------------
# 材料堆场（钢筋堆 / 砂石堆 / 砖堆 / 钢管堆）
# --------------------------------------------------------------------------
def build_material_yard(collection=None):
    b = MeshBuilder("MaterialYard")

    # 分成前后两排堆放，避免所有料堆挤在一条直线上
    row_a, row_b = 0.0, 7.0

    # ---- 钢筋堆：三捆，三角形码放 ----
    for bundle in range(3):
        by = row_a + (bundle - 1) * 1.55
        for row in range(3):
            for col in range(3 - row):
                yy = by + (col - (2 - row) / 2.0) * 0.44
                z = 0.16 + row * 0.40
                b.cylinder(0.20, 8.0, (-6.0, yy, z), rotation=(0, math.pi / 2.0, 0),
                           mat="rebar", segments=8)

    # ---- 钢管堆：两层码放 ----
    for row in range(2):
        for col in range(4 - row):
            yy = row_b + (col - (3 - row) / 2.0) * 0.36
            z = 0.16 + row * 0.32
            b.cylinder(0.16, 6.0, (-6.0, yy, z), rotation=(0, math.pi / 2.0, 0),
                       mat="pipe_steel", segments=8)

    # ---- 砖堆：两垛，多层错缝 ----
    for sx in (3.0, 7.5):
        for layer in range(4):
            rows = 4 - layer
            for r in range(rows):
                yy = row_a + (r - (rows - 1) / 2.0) * 0.62
                b.box((2.4, 0.55, 0.24), (sx, yy, 0.12 + layer * 0.25), mat="brick")

    # ---- 木方堆 ----
    for layer in range(3):
        for r in range(2):
            yy = row_b + (r - 0.5) * 0.42
            b.box((3.0, 0.34, 0.28), (4.5, yy, 0.14 + layer * 0.30), mat="wood")

    # ---- 砂石堆：圆锥料堆 ----
    b.cone(3.0, 0.35, 1.8, (13.0, row_a + 1.5, 0.9), mat="sand", segments=14)
    b.cone(2.4, 0.30, 1.5, (13.0, row_b + 1.5, 0.75), mat="gravel", segments=14)

    # ---- 砂石堆挡墙（砌体围挡，防止散料外溢） ----
    b.box((0.30, 7.4, 0.85), (9.5, row_a + 1.5, 0.42), mat="concrete_dark")
    b.box((0.30, 6.2, 0.85), (10.1, row_b + 1.5, 0.42), mat="concrete_dark")

    # ---- 木方堆顶篷布 ----
    b.box((3.2, 1.0, 0.10), (4.5, row_b, 0.93), mat="tarp_blue")

    # ---- 材料标识牌 ----
    for (sx, sy) in ((-9.8, row_a - 3.4), (5.2, row_b - 2.8), (12.0, row_a + 4.4)):
        b.cylinder(0.05, 2.2, (sx, sy, 1.1), mat="galvanized", segments=6)
        b.box((1.4, 0.06, 0.9), (sx, sy, 1.75), mat="board_blue")

    # ---- 场地照明灯杆 ----
    for (lx, ly) in ((-10.5, -4.5), (14.5, 9.0)):
        pole_h = 8.0
        b.box((0.6, 0.6, 0.4), (lx, ly, 0.20), mat="concrete")
        b.cylinder(0.12, pole_h, (lx, ly, 0.4 + pole_h / 2.0), mat="galvanized", segments=8)
        b.beam((lx, ly, 0.4 + pole_h), (lx + 1.4, ly, 0.4 + pole_h), 0.08, mat="galvanized")
        b.box((0.55, 0.38, 0.20), (lx + 1.5, ly, 0.4 + pole_h - 0.08), mat="lamp_white")

    return b.build(collection)


# --------------------------------------------------------------------------
# 开挖土堆（主堆 + 错落侧坡 + 坡脚散土 + 土块 + 车辙，去掉「光锥」感）
# --------------------------------------------------------------------------
def _dirt_pile(b, cx, cy, r, h):
    skirt = r * 1.75

    # 坡脚铺散的松土
    b.cone(skirt, skirt, r * 0.05, (cx, cy, r * 0.025), mat="dirt", segments=20)
    # 主堆（顶面削平，不做尖锥）
    b.cone(r, r * 0.34, h, (cx, cy, h / 2.0), mat="dirt_dark", segments=20)
    # 顶部干土棱（几团高低不一的小丘，避免出现「戴帽的锥体」）
    for (dx, dy, k, hk, m) in ((0.10, 0.06, 0.30, 0.20, "soil_dry"),
                               (-0.20, 0.18, 0.23, 0.15, "dirt_dark"),
                               (0.18, -0.18, 0.21, 0.13, "soil_dry")):
        b.cone(r * k, r * k * 0.35, h * hk, (cx + dx * r, cy + dy * r,
                                             h * (0.94 + hk / 2.0)),
               mat=m, segments=12)
    # 错落的侧坡（紧贴主堆、高低不一，做出不规则堆积感）
    for (fx, fy, k, hk) in ((0.70, 0.42, 0.62, 0.58),
                            (-0.62, 0.66, 0.54, 0.50),
                            (-0.34, -0.78, 0.66, 0.62),
                            (0.58, -0.60, 0.46, 0.44)):
        rr, hh = r * k, h * hk
        b.cone(rr, rr * 0.30, hh, (cx + fx * r, cy + fy * r, hh / 2.0),
               mat="dirt_dark", segments=14)
    # 坡脚更矮更碎的小土包
    for (fx, fy, k) in ((0.95, 0.10, 0.34), (-0.86, -0.30, 0.30),
                        (0.10, 0.92, 0.28), (-0.20, -0.95, 0.32)):
        rr = r * k
        b.cone(rr, rr * 0.35, r * 0.22, (cx + fx * r, cy + fy * r, r * 0.11),
               mat="dirt", segments=12)
    # 干土块 / 土坷垃
    for (dx, dy, m) in ((0.30, 0.60, "soil_dry"), (-0.52, 0.28, "dirt_dark"),
                        (0.66, -0.30, "soil_dry"), (-0.26, -0.58, "dirt_dark")):
        dd = math.hypot(dx, dy)
        b.sphere(r * 0.15, (cx + dx * r, cy + dy * r, max(0.18 * r, h * (1.0 - dd) * 0.82)),
                 mat=m, subdiv=1, scale=(1.0, 1.0, 0.55))
    # 坡脚车辙 / 推土痕迹（绕竖直轴铺平，不能绕水平轴，否则会扎进地面）
    for (dx, dy, ang) in ((0.00, 1.32, 0.00), (1.26, 0.52, 1.15), (-1.22, -0.52, -1.15)):
        b.box((r * 1.00, r * 0.12, r * 0.015), (cx + dx * r, cy + dy * r, r * 0.065),
              rotation=(0.0, 0.0, ang), mat="dirt_dark")


def build_dirt_pile(collection=None):
    """单堆开挖土（单位尺寸：底半径 1m、堆高 1m），摆放时按实际尺寸缩放。"""
    b = MeshBuilder("DirtPile")
    _dirt_pile(b, 0.0, 0.0, 1.0, 1.0)
    return b.build(collection)


# --------------------------------------------------------------------------
# 基坑（四面坑壁 + 坑底 + 集水井 + 临边防护栏杆），模型中心在坑的平面中心
# --------------------------------------------------------------------------
def _pit(b, pw, pd, depth, wall, edge_h=1.2):
    aw, ad = pw / 2.0, pd / 2.0

    # ---- 四面坑壁 ----
    b.box((pw + 2 * wall, wall, depth), (0.0, -ad - wall / 2.0, -depth / 2.0),
          mat="dirt_dark")
    b.box((pw + 2 * wall, wall, depth), (0.0, ad + wall / 2.0, -depth / 2.0),
          mat="dirt_dark")
    b.box((wall, pd, depth), (-aw - wall / 2.0, 0.0, -depth / 2.0), mat="dirt_dark")
    b.box((wall, pd, depth), (aw + wall / 2.0, 0.0, -depth / 2.0), mat="dirt_dark")

    # ---- 坑底 + 集水井 ----
    b.box((pw + 0.4, pd + 0.4, 0.3), (0.0, 0.0, -depth + 0.15), mat="dirt_dark")
    b.box((4.0, 4.0, 0.45), (-aw + 4.5, -ad + 4.5, -depth + 0.55), mat="concrete_dark")
    b.box((3.0, 3.0, 0.10), (-aw + 4.5, -ad + 4.5, -depth + 0.72), mat="water")

    # ---- 临边防护（红白栏杆：立杆 + 上下两道横杆） ----
    for yy in (-ad, ad):
        n = max(2, int(pw / 2.5))
        for k in range(n + 1):
            xx = -aw + pw * k / float(n)
            b.beam((xx, yy, 0.0), (xx, yy, edge_h), 0.06, mat="paint_red")
        for zz in (edge_h, edge_h * 0.5):
            b.beam((-aw, yy, zz), (aw, yy, zz), 0.05, mat="paint_red")
    for xx in (-aw, aw):
        n = max(2, int(pd / 2.5))
        for k in range(n + 1):
            yy = -ad + pd * k / float(n)
            b.beam((xx, yy, 0.0), (xx, yy, edge_h), 0.06, mat="paint_red")
        for zz in (edge_h, edge_h * 0.5):
            b.beam((xx, -ad, zz), (xx, ad, zz), 0.05, mat="paint_red")


def build_pit(collection=None):
    """基坑（按 17m × 22m 建模，摆放时按各自宽度在 X 向缩放）。"""
    b = MeshBuilder("Pit")
    _pit(b, 17.0, 22.0, C.PIT_DEPTH, C.PIT_WALL)
    return b.build(collection)


# --------------------------------------------------------------------------
# 基坑边的零星建筑材料
# --------------------------------------------------------------------------
def build_pit_materials(collection=None):
    """基坑边的零星建筑材料：只放三小堆、同种材料各自聚集
    （钢筋捆 / 砖垛 / 水泥袋），整体占地约 6×4m，摆在坑沿地面上、不陷进坑里。"""
    b = MeshBuilder("PitMaterials")
    sg = "steel_gray"

    # 一小块硬化地面
    b.box((6.0, 4.0, 0.08), (0.0, 0.0, 0.04), mat="concrete_dark")

    # ① 钢筋捆（3 捆 + 2 根垫木）
    for k in range(3):
        b.cylinder(0.15, 3.0, (-0.30 + k * 0.34, -1.35, 0.30 + k * 0.05),
                   rotation=(math.pi / 2.0, 0.0, 0.0), mat="rebar", segments=10)
    for dx in (-1.25, 0.85):
        b.box((0.10, 0.80, 0.20), (dx, -1.35, 0.10), mat="wood")

    # ② 砖垛（两层，各一块托板）
    for lv in range(2):
        b.box((1.80, 1.05, 0.36), (-1.55, 1.05, 0.26 + lv * 0.44), mat="brick")
        b.box((1.92, 1.15, 0.06), (-1.55, 1.05, 0.47 + lv * 0.44), mat="wood")

    # ③ 水泥袋垛（3 层 × 3 袋）
    for lv in range(3):
        for k in range(3):
            b.box((0.66, 0.44, 0.17), (1.75, -0.55 + (k - 1) * 0.70,
                                       0.16 + lv * 0.18), mat="wall_white")

    return b.build(collection)


def build_site_ground(collection=None):
    b = MeshBuilder("SiteGround")
    size = C.SITE_SIZE
    half = size / 2.0
    rw = C.ROAD_WIDTH
    t = C.GROUND_THICKNESS

    def slab(x0, x1, y0, y1, mat="dirt"):
        if x1 - x0 < 0.01 or y1 - y0 < 0.01:
            return
        b.box((x1 - x0, y1 - y0, t), ((x0 + x1) / 2.0, (y0 + y1) / 2.0, -t / 2.0),
              mat=mat)

    # ---- 素土面：有基坑就把坑挖空，没基坑就整块铺满 ----
    if C.PIT_ENABLE and C.PITS:
        # 用所有坑的边界把场地切成网格，跳过落在坑里的格子
        xs = sorted({-half, half} | {p[0] for p in C.PITS} | {p[1] for p in C.PITS})
        ys = sorted({-half, half} | {p[2] for p in C.PITS} | {p[3] for p in C.PITS})
        for i in range(len(xs) - 1):
            for j in range(len(ys) - 1):
                gx0, gx1 = xs[i], xs[i + 1]
                gy0, gy1 = ys[j], ys[j + 1]
                gmx, gmy = (gx0 + gx1) / 2.0, (gy0 + gy1) / 2.0
                if any(p[0] <= gmx <= p[1] and p[2] <= gmy <= p[3] for p in C.PITS):
                    continue
                slab(gx0, gx1, gy0, gy1)
        # 坑壁 / 坑底 / 集水井 / 临边防护改为独立模型 pit，可单独点选
    else:
        slab(-half, half, -half, half)

    # ---- 土堆（开挖弃土）改为独立模型 dirt_pile，按各自尺寸缩放摆放 ----

    # ---- 道路 ----
    road_x = -half + 16.0          # 南北主路（大门进出）
    road_y = -half + 18.0          # 东西主路
    b.box((rw, size, 0.06), (road_x, 0.0, 0.03), mat="asphalt")
    b.box((size, rw, 0.06), (0.0, road_y, 0.03), mat="asphalt")

    # ---- 工人生活区铺装（东北，盖住两片宿舍楼：x 15.8~54.5、z -55~-24） ----
    b.box((40.0, 31.5, 0.08), (35.0, 39.75, 0.04), mat="concrete")

    # ---- 绿化带（北侧一条；西侧长条由 green_belt 模型单独生成） ----
    b.box((size - 6.0, 2.4, 0.10), (0.0, half - 1.8, 0.05), mat="grass")

    # ---- 主干道中心虚线 ----
    for k in range(-8, 9):
        b.box((0.18, 3.0, 0.03), (road_x, k * 6.0, 0.07), mat="line_white")
        b.box((3.0, 0.18, 0.03), (k * 6.0, road_y, 0.07), mat="line_white")

    # ---- 支路：位于基坑北缘（y=29）与北侧建筑（y=22）之间的走廊正中，自南北主路向东 ----
    nx0, nx1 = road_x - rw / 2.0, road_x + rw / 2.0      # 南北主路的横向范围
    ny0, ny1 = road_y - rw / 2.0, road_y + rw / 2.0      # 东西主路的纵向范围
    br_y = 25.5                    # 支路中心线（Blender y，22 与 29 之间走廊的正中 25.5）
    br_w = 4.6                     # 支路车道宽（略窄于主路的 7m）
    br_x0 = nx1                    # 西端接南北主路东缘（-35.5）
    br_x1 = 13.0                   # 东端止于开挖区东缘，不越进生活区
    b.box((br_x1 - br_x0, br_w, 0.06), ((br_x0 + br_x1) / 2.0, br_y, 0.03),
          mat="asphalt")
    for sy in (br_y - br_w / 2.0 + 0.15, br_y + br_w / 2.0 - 0.15):   # 两侧边线
        b.box((br_x1 - br_x0, 0.12, 0.03), ((br_x0 + br_x1) / 2.0, sy, 0.07),
              mat="line_white")
    xk = br_x0 + 3.0                                                  # 中心虚线
    while xk <= br_x1 - 1.5:
        b.box((3.0, 0.18, 0.03), (xk, br_y, 0.07), mat="line_white")
        xk += 6.0

    # ---- 排水沟（每条主路两侧各一条）----
    # 只在路口之外铺：遇到另一条主路 / 支路就断开，交叉口中间不留灰带
    br_y0, br_y1 = br_y - br_w / 2.0, br_y + br_w / 2.0
    for sx in (nx1 + 0.5, nx0 - 0.5):
        b.box((0.5, ny0 + half, 0.08), (sx, (ny0 - half) / 2.0, 0.04), mat="concrete_dark")
        if sx > road_x:            # 东侧排水沟在支路路口处断开
            b.box((0.5, br_y0 - ny1, 0.08), (sx, (ny1 + br_y0) / 2.0, 0.04),
                  mat="concrete_dark")
            b.box((0.5, half - br_y1, 0.08), (sx, (br_y1 + half) / 2.0, 0.04),
                  mat="concrete_dark")
        else:
            b.box((0.5, half - ny1, 0.08), (sx, (ny1 + half) / 2.0, 0.04),
                  mat="concrete_dark")
    for sy in (ny1 + 0.5, ny0 - 0.5):
        b.box((nx0 + half, 0.5, 0.08), ((-half + nx0) / 2.0, sy, 0.04), mat="concrete_dark")
        b.box((half - nx1, 0.5, 0.08), ((nx1 + half) / 2.0, sy, 0.04), mat="concrete_dark")

    return b.build(collection)


# --------------------------------------------------------------------------
# 生活区大门（宿舍区出入口：门柱 + 门楣 + 对开门扇 + 门牌）
# --------------------------------------------------------------------------
def build_camp_gate(collection=None):
    b = MeshBuilder("CampGate")
    gw = 5.8                 # 门洞净宽（较原来 7.0 收窄）
    pw = 0.6                 # 门柱宽度
    ph = 2.9                 # 门柱高度（较原来 3.6 降低）
    px = gw / 2.0 + pw / 2.0

    # 门柱（砌体 + 压顶 + 基座）
    for sx in (-px, px):
        b.box((pw + 0.34, pw + 0.34, 0.22), (sx, 0.0, 0.11), mat="concrete")
        b.box((pw, pw, ph), (sx, 0.0, 0.22 + ph / 2.0), mat="brick")
        for zz in (1.28, 2.10):
            b.box((pw + 0.05, pw + 0.05, 0.04), (sx, 0.0, zz), mat="concrete")
        b.box((pw + 0.22, pw + 0.22, 0.18), (sx, 0.0, 0.22 + ph + 0.09), mat="concrete")
        b.box((pw + 0.10, pw + 0.10, 0.08), (sx, 0.0, 0.22 + ph + 0.22), mat="concrete_dark")

    # 门楣 + 门牌
    b.box((gw + pw * 2.0 + 0.2, 0.42, 0.4), (0.0, 0.0, 0.22 + ph - 0.2), mat="concrete")
    b.box((gw - 0.9, 0.14, 0.62), (0.0, 0.0, 0.22 + ph + 0.42), mat="board_blue")
    b.box((gw - 0.76, 0.06, 0.06), (0.0, -0.1, 0.22 + ph + 0.42), mat="steel_gray")

    # 门柱内侧壁灯
    for sx in (-px + pw / 2.0 + 0.1, px - pw / 2.0 - 0.1):
        b.box((0.14, 0.14, 0.22), (sx, 0.0, 0.22 + ph - 0.62), mat="lamp_white")

    # 门柱顶灯
    for sx in (-px, px):
        b.cylinder(0.05, 0.3, (sx, 0.0, 0.22 + ph + 0.41), mat="steel_gray", segments=8)
        b.box((0.2, 0.2, 0.1), (sx, 0.0, 0.22 + ph + 0.61), mat="lamp_white")

    return b.build(collection)


# --------------------------------------------------------------------------
# 工人生活区（宿舍排屋 + 晾衣架 + 洗漱池 + 垃圾桶）
# --------------------------------------------------------------------------
def build_labor_camp(collection=None):
    b = MeshBuilder("LaborCamp")
    hx, hy, hz = C.HOUSE_SIZE          # 6.0 × 3.0 × 2.8
    rows = C.CAMP_ROWS
    rooms = C.CAMP_ROOMS
    rise = C.HOUSE_ROOF_H
    wall_t = 0.10
    row_pitch = 9.5                    # 排间距（含中间院子）
    wall_top_off = 0.16 + hz

    total_x = rooms * (hx + 0.15) - 0.15
    base_top = 1.0                     # 下裙（灰色基带）顶标高（Blender z）

    def wall_stack(sx, sy, cx, cy, z0, z1):
        """一段墙：跨越下裙线时自动分成灰色下裙 + 白色上身，外形不变。"""
        if z1 - z0 < 0.02:
            return
        zb = min(max(base_top, z0), z1)
        if zb - z0 > 0.02:
            b.box((sx, sy, zb - z0), (cx, cy, (z0 + zb) / 2.0), mat="concrete")
        if z1 - zb > 0.02:
            b.box((sx, sy, z1 - zb), (cx, cy, (zb + z1) / 2.0), mat="wall_white")

    def front_seg(ax0, ax1, az0, az1, yy):
        """前墙分片砌筑（绕开门洞、窗洞）。"""
        if ax1 - ax0 < 0.02 or az1 - az0 < 0.02:
            return
        wall_stack(ax1 - ax0, wall_t, (ax0 + ax1) / 2.0, yy, az0, az1)

    for r in range(rows):
        oy = r * row_pitch
        for i in range(rooms):
            ox = i * (hx + 0.15)
            cxx = ox + hx / 2.0
            cyy = oy + hy / 2.0

            b.box((hx, hy, 0.16), (cxx, cyy, 0.08), mat="steel_gray")       # 底盘
            # 背墙 + 两侧山墙（下部灰色基带 + 上部白色墙板）
            wall_stack(hx, wall_t, cxx, oy + wall_t / 2.0, 0.16, 0.16 + hz)
            wall_stack(wall_t, hy, ox + wall_t / 2.0, cyy, 0.16, 0.16 + hz)
            wall_stack(wall_t, hy, ox + hx - wall_t / 2.0, cyy, 0.16, 0.16 + hz)

            # ---- 前墙：按门洞 + 两个窗洞拆分砌筑 ----
            fy = oy + hy - wall_t / 2.0
            door_w, door_h = 0.95, hz * 0.72
            win_w, win_z0, win_h = 0.90, 1.10, 1.00
            win_cx = (ox + hx * 0.18, ox + hx * 0.82)
            holes = [(cxx - door_w / 2.0, cxx + door_w / 2.0)]
            for wc in win_cx:
                holes.append((wc - win_w / 2.0, wc + win_w / 2.0))
            holes.sort()
            xa = ox
            for (ax0, ax1) in holes:
                front_seg(xa, ax0, 0.16, 0.16 + hz, fy)
                xa = ax1
            front_seg(xa, ox + hx, 0.16, 0.16 + hz, fy)
            for wc in win_cx:
                front_seg(wc - win_w / 2.0, wc + win_w / 2.0, 0.16, win_z0, fy)
                front_seg(wc - win_w / 2.0, wc + win_w / 2.0, win_z0 + win_h,
                          0.16 + hz, fy)
            front_seg(cxx - door_w / 2.0, cxx + door_w / 2.0, 0.16 + door_h,
                      0.16 + hz, fy)

            # ---- 门：门套 + 门扇 + 冒头 + 把手 + 门槛 + 雨棚 + 门头灯 ----
            dy = fy + wall_t / 2.0 + 0.015
            for jx in (cxx - door_w / 2.0 + 0.045, cxx + door_w / 2.0 - 0.045):
                b.beam((jx, dy, 0.16), (jx, dy, 0.16 + door_h - 0.05), 0.09,
                       mat="steel_gray")
            b.beam((cxx - door_w / 2.0 + 0.045, dy, 0.16 + door_h - 0.05),
                   (cxx + door_w / 2.0 - 0.045, dy, 0.16 + door_h - 0.05), 0.09,
                   mat="steel_gray")
            b.box((door_w - 0.20, 0.05, door_h - 0.12),
                  (cxx, dy + 0.02, 0.16 + door_h / 2.0 - 0.02), mat="door_gray")
            for zz in (0.16 + door_h * 0.46, 0.16 + door_h * 0.78):
                b.box((door_w - 0.20, 0.035, 0.06), (cxx, dy + 0.055, zz),
                      mat="steel_gray")
            b.cylinder(0.028, 0.2, (cxx + door_w / 2.0 - 0.2, dy + 0.09, 1.02),
                       mat="galvanized", segments=6)
            b.box((door_w + 0.5, 0.6, 0.14), (cxx, dy + 0.28, 0.07), mat="concrete")
            b.box((door_w + 0.56, 0.76, 0.06), (cxx, dy + 0.42, 0.16 + door_h + 0.3),
                  mat="roof_blue")
            for sx in (cxx - door_w / 2.0 - 0.16, cxx + door_w / 2.0 + 0.16):
                b.beam((sx, dy + 0.74, 0.16 + door_h + 0.04),
                       (sx, dy + 0.74, 0.16 + door_h + 0.27), 0.04, mat="galvanized")
            b.box((0.14, 0.14, 0.2),
                  (cxx - door_w / 2.0 - 0.28, dy, 0.16 + door_h + 0.04),
                  mat="lamp_white")

            # ---- 窗：窗台 + 窗楣 + 窗框 + 中梃 + 玻璃 ----
            for wc in win_cx:
                b.box((win_w + 0.3, 0.2, 0.1), (wc, dy + 0.05, win_z0 - 0.05),
                      mat="concrete")
                b.box((win_w + 0.34, 0.14, 0.1), (wc, dy + 0.03, win_z0 + win_h + 0.05),
                      mat="concrete")
                for jx in (wc - win_w / 2.0 + 0.04, wc + win_w / 2.0 - 0.04):
                    b.beam((jx, dy, win_z0), (jx, dy, win_z0 + win_h), 0.08,
                           mat="steel_gray")
                for jz in (win_z0 + 0.04, win_z0 + win_h - 0.04):
                    b.beam((wc - win_w / 2.0, dy, jz), (wc + win_w / 2.0, dy, jz),
                           0.08, mat="steel_gray")
                b.beam((wc, dy, win_z0), (wc, dy, win_z0 + win_h), 0.05,
                       mat="steel_gray")
                b.box((win_w - 0.14, 0.03, win_h - 0.14),
                      (wc, dy - 0.035, win_z0 + win_h / 2.0), mat="glass")

            # 坡屋顶（一体成型：脊线严丝合缝、檐口与山墙全部封边、压住墙顶）
            _dorm_roof(b, cxx, cyy, hx, hy, wall_top_off, rise)
            # 空调外机（挂架 + 机身 + 出风栅 + 冷凝水管）
            acx = ox + hx * 0.75
            b.box((0.88, 0.06, 0.06), (acx, oy - 0.40, 0.16 + hz * 0.28), mat="steel_gray")
            b.box((0.8, 0.35, 0.55), (acx, oy - 0.22, 0.16 + hz * 0.55), mat="wall_white")
            b.box((0.8, 0.05, 0.42), (acx, oy - 0.01, 0.16 + hz * 0.55), mat="steel_gray")
            b.beam((acx + 0.34, oy - 0.16, 0.16 + hz * 0.28),
                   (acx + 0.34, oy - 0.16, 0.16), 0.05, mat="galvanized")
            # 门牌
            b.box((0.34, 0.05, 0.22), (cxx + door_w / 2.0 + 0.42, dy, 0.16 + door_h * 0.82),
                  mat="board_blue")

        # 每排前面的通长走廊 + 栏杆
        corr_y = oy + hy + 1.0
        b.box((total_x, 1.8, 0.10), (total_x / 2.0, corr_y, 0.16), mat="steel_gray")
        for zz in (1.06, 0.16):
            b.beam((0.0, corr_y + 0.85, zz), (total_x, corr_y + 0.85, zz), 0.05,
                   mat="steel_blue")
        k = 0.0
        while k <= total_x:
            b.beam((k, corr_y + 0.85, 0.16), (k, corr_y + 0.85, 1.06), 0.04,
                   mat="steel_blue")
            k += 1.5

    # ---- 晾衣架（两排宿舍之间的院子） ----
    for r in range(rows - 1):
        y0 = r * row_pitch + hy + 3.4
        for sx in (2.0, total_x - 2.0):
            for dy in (-0.5, 0.5):
                b.beam((sx, y0 + dy, 0.0), (sx, y0 + dy, 1.95), 0.06, mat="galvanized")
            b.beam((sx, y0 - 0.5, 1.95), (sx, y0 + 0.5, 1.95), 0.05, mat="galvanized")
        for zz in (1.90, 1.50):
            for dy in (-0.5, 0.5):
                b.beam((2.0, y0 + dy, zz), (total_x - 2.0, y0 + dy, zz), 0.045,
                       mat="galvanized")
        for i in range(6):
            xx = 3.0 + i * 2.2
            b.box((0.55, 0.06, 0.75), (xx, y0 - 0.5, 1.50),
                  mat="tarp_blue" if i % 2 else "paint_red")

    # ---- 洗漱池改为独立模型 camp_basin（只保留 B 区一处，见 layout 摆放） ----

    # ---- 分类垃圾桶（红色那只已按要求去掉） ----
    for (bx, by, mat) in ((0.6, 1.4, "safety_green"),
                          (total_x - 0.6, 1.4, "board_blue")):
        b.cylinder(0.32, 0.9, (bx, by, 0.45), mat=mat, segments=10)

    # ---- 场地指示牌 ----
    b.beam((total_x / 2.0 - 1.6, -1.6, 0.0), (total_x / 2.0 - 1.6, -1.6, 2.6),
           0.07, mat="galvanized")
    b.beam((total_x / 2.0 + 1.6, -1.6, 0.0), (total_x / 2.0 + 1.6, -1.6, 2.6),
           0.07, mat="galvanized")
    b.box((3.4, 0.10, 0.9), (total_x / 2.0, -1.6, 2.25), mat="board_blue")

    obj = b.build(collection)

    # ---- 整座生活区绕自身平面中心旋转 180° ----
    # 门窗原本朝 -Y（导出后朝场地北侧），旋转后朝向 +Y 一侧（即工地大门方向）。
    # 旋转中心取整个模型的平面中心，所以占地轮廓不变，晾衣架等附属构件位置也基本不变。
    y_lo = -1.6 - 0.035                                   # 指示牌立柱外缘
    y_hi = rows * row_pitch - 2.0 + 0.32                  # 最北侧垃圾桶外缘
    obj.rotation_euler = (0.0, 0.0, math.pi)
    obj.location = (total_x, y_lo + y_hi, 0.0)
    return obj


# --------------------------------------------------------------------------
# 绿化带（场地西侧长条：西围墙 ↔ 南北主路之间）
#   一条完整的景观带：草坪基底 + 混凝土路缘石 + 修剪绿篱 + 两排乔木
#   + 靠围墙侧灌木球与花境。被东西主路（含两侧排水沟）断开成南北两段，
#   全程不出围栏、不压马路。
# --------------------------------------------------------------------------
def _tree(b, x, y, trunk_h=2.4, crown=1.35, leaf="leaf_mid"):
    """一棵低模乔木：树干 + 三团不同朝向、不同深浅的树冠。"""
    b.cylinder(0.16, trunk_h, (x, y, trunk_h / 2.0), mat="tree_trunk", segments=6)
    b.sphere(crown, (x, y, trunk_h + crown * 0.55), mat=leaf, subdiv=1,
             scale=(1.0, 1.0, 0.92))
    b.sphere(crown * 0.74, (x - crown * 0.55, y + crown * 0.48,
                            trunk_h + crown * 0.88), mat="leaf_light",
             subdiv=1, scale=(1.0, 1.0, 0.86))
    b.sphere(crown * 0.68, (x + crown * 0.58, y - crown * 0.42,
                            trunk_h + crown * 0.80), mat="leaf_deep",
             subdiv=1, scale=(1.0, 1.0, 0.86))


def _tree_line(b, y0, y1, x, pitch, offset, trunk_h=2.4, crown=1.35):
    """沿 y 方向，从 y0+offset 起每隔 pitch 栽一棵。"""
    y = y0 + offset
    while y <= y1:
        _tree(b, x, y, trunk_h=trunk_h, crown=crown)
        y += pitch


def _shrub_line(b, y0, y1, x, pitch, offset):
    """一列压扁的灌木球，三种绿色交替。"""
    y = y0 + offset
    k = 0
    mats = ("leaf_deep", "leaf_mid", "leaf_light")
    while y <= y1:
        r = 0.72 + 0.10 * (k % 3)
        b.sphere(r, (x, y, 0.16 + r * 0.58), mat=mats[k % 3], subdiv=1,
                 scale=(1.0, 1.0, 0.60))
        y += pitch
        k += 1


def _flowerbed(b, x, y, r=0.55, mat="flower_red"):
    """花境：种植土圆盘 + 上面一层花色。"""
    b.cylinder(r + 0.12, 0.10, (x, y, 0.17), mat="soil", segments=10)
    b.cylinder(r, 0.10, (x, y, 0.24), mat=mat, segments=10)


def build_green_belt(collection=None):
    b = MeshBuilder("GreenBelt")

    X0, X1 = -54.2, -44.6            # 带宽：西围墙内退 0.8m → 临马路留 2.1m 路肩
    cx = (X0 + X1) / 2.0
    wide = X1 - X0

    # 被东西主路（含两侧排水沟）断开，分南北两段
    for (y0, y1) in ((-53.6, -42.0), (-32.0, 51.4)):
        long_ = y1 - y0
        cy = (y0 + y1) / 2.0

        # ---- 草坪基底 ----
        b.box((wide, long_, 0.16), (cx, cy, 0.08), mat="grass")

        # ---- 混凝土路缘石（临马路一侧 + 两端封边） ----
        b.box((0.30, long_, 0.26), (X1 - 0.15, cy, 0.13), mat="concrete")
        for yy in (y0 + 0.15, y1 - 0.15):
            b.box((wide, 0.30, 0.26), (cx, yy, 0.13), mat="concrete")

        # ---- 修剪绿篱（缘石内侧，分段起垄做出层次） ----
        hx = X1 - 0.62
        nseg = max(1, int(long_ / 2.2))
        segl = long_ / nseg
        for i in range(nseg):
            sy = y0 + segl * (i + 0.5)
            b.box((0.62, segl * 0.94, 0.86), (hx, sy, 0.59), mat="hedge")
            b.box((0.50, segl * 0.86, 0.10), (hx, sy, 1.05), mat="leaf_mid")

        # ---- 三排乔木：主排 5.5m 一株，次排 11m 错半格，靠围墙再补一排小乔木 ----
        #      株距统一、行距对齐，密而有序，不会显得杂乱
        _tree_line(b, y0 + 1.8, y1 - 1.8, -49.4, 5.5, 0.0)
        _tree_line(b, y0 + 1.8, y1 - 1.8, -47.0, 11.0, 2.75,
                   trunk_h=2.0, crown=1.15)
        _tree_line(b, y0 + 3.0, y1 - 3.0, -52.4, 13.0, 0.0,
                   trunk_h=1.8, crown=0.95)

        # ---- 靠围墙侧灌木球列（加密一倍） ----
        _shrub_line(b, y0 + 1.2, y1 - 1.2, -51.8, 3.6, 0.0)
        _shrub_line(b, y0 + 3.4, y1 - 3.4, -50.6, 7.0, 0.0)
        _shrub_line(b, y0 + 2.2, y1 - 2.2, -48.2, 9.0, 4.5)

        # ---- 花境（沿主排树间点缀，间距减半） ----
        yf = y0 + 3.4
        k = 0
        while yf <= y1 - 3.0:
            _flowerbed(b, -50.2, yf, r=0.55,
                       mat="flower_red" if k % 2 == 0 else "flower_gold")
            yf += 6.5
            k += 1

    return b.build(collection)


# --------------------------------------------------------------------------
# 临时仓库（门式轻钢结构 + 彩钢围护 + 卷帘门 + 室内货架与材料堆放）
#   沿 X 方向布置，正面（卷帘门与装卸区）朝 -Y
# --------------------------------------------------------------------------
def build_warehouse(collection=None):
    b = MeshBuilder("Warehouse")
    sg = "steel_gray"
    blue = "steel_blue"

    HW = 7.0          # 半长（沿 X，纵向）
    HD = 4.0          # 半深（沿 Y，跨度方向）
    EAVE = 4.20       # 檐口高度
    RISE = 1.20       # 屋脊比起坡高度
    BASE = 0.45       # 室内地面标高
    door_w, door_h = 6.0, 3.60

    frames = [-HW + i * (2.0 * HW / 4.0) for i in range(5)]      # 5 榀刚架

    # ---------------- 场地硬化 + 室内地坪 + 排水沟 ----------------
    b.box((18.0, 12.4, 0.20), (0.0, -1.0, 0.10), mat="concrete_dark")
    b.box((2.0 * HW, 2.0 * HD, 0.06), (0.0, 0.0, BASE - 0.03), mat="concrete")
    for sx in (-8.6, 8.6):
        b.box((0.40, 12.0, 0.14), (sx, -1.0, 0.07), mat="concrete_dark")
        for k in range(8):
            b.box((0.44, 0.10, 0.03), (sx, -6.4 + k * 1.5, 0.15), mat=sg)

    # ---------------- 独立基础 + 钢柱 + 门式刚架 ----------------
    for fx in frames:
        for sy in (-HD, HD):
            b.box((0.86, 0.86, 0.34), (fx, sy, 0.34), mat="concrete")       # 独立基础
            b.box((0.44, 0.44, 0.06), (fx, sy, BASE + 0.03), mat=sg)        # 柱脚底板
            b.box((0.26, 0.26, EAVE), (fx, sy, BASE + EAVE / 2.0), mat=blue)  # 柱腹板
            for dx in (-0.20, 0.20):                                        # 柱翼缘
                b.box((0.09, 0.42, EAVE), (fx + dx, sy, BASE + EAVE / 2.0), mat=blue)
        b.beam((fx, -HD, BASE + EAVE), (fx, 0.0, BASE + EAVE + RISE), 0.16,
               mat=blue, depth=0.30)                                        # 斜梁
        b.beam((fx, 0.0, BASE + EAVE + RISE), (fx, HD, BASE + EAVE), 0.16,
               mat=blue, depth=0.30)
        if fx in (frames[0], frames[-1]):                                   # 端榀柱间支撑
            b.beam((fx, -HD, BASE + 0.40), (fx, HD, BASE + EAVE - 0.55), 0.08, mat=sg)

    # ---------------- 檩条 + 双坡屋面 + 采光带 ----------------
    ang = math.atan2(RISE, HD)
    slope = math.sqrt(HD * HD + RISE * RISE) + 0.60
    for yy in (-3.0, -2.0, -1.0, 1.0, 2.0, 3.0):
        zz = BASE + EAVE + RISE * (1.0 - abs(yy) / HD)
        b.box((2.0 * HW + 0.5, 0.12, 0.10), (0.0, yy, zz + 0.09), mat=sg)
    for sy, ra in ((-HD / 2.0, ang), (HD / 2.0, -ang)):
        b.box((2.0 * HW + 0.7, slope, 0.08),
              (0.0, sy, BASE + EAVE + RISE / 2.0 + 0.13), rotation=(ra, 0.0, 0.0),
              mat="roof_blue")
    for sx in (-4.6, 4.6):                                                  # 屋面采光带
        b.box((1.5, slope - 1.0, 0.05),
              (sx, -HD / 2.0, BASE + EAVE + RISE / 2.0 + 0.19),
              rotation=(ang, 0.0, 0.0), mat="glass")
        b.box((1.5, slope - 1.0, 0.05),
              (sx, HD / 2.0, BASE + EAVE + RISE / 2.0 + 0.19),
              rotation=(-ang, 0.0, 0.0), mat="glass")
    b.box((2.0 * HW + 0.7, 0.34, 0.12), (0.0, 0.0, BASE + EAVE + RISE + 0.17), mat=sg)
    for sy in (-HD - 0.06, HD + 0.06):                                      # 檐口收边
        b.box((2.0 * HW + 0.7, 0.22, 0.12), (0.0, sy, BASE + EAVE + 0.10), mat=sg)

    # ---------------- 墙板（正面留门洞）+ 波纹肋 ----------------
    ofs = 0.09
    seg = (2.0 * HW - door_w) / 2.0
    for sx in (-HW + seg / 2.0, HW - seg / 2.0):                            # 正面门洞两侧
        b.box((seg, 0.08, EAVE), (sx, -HD - ofs, BASE + EAVE / 2.0), mat="wall_white")
    b.box((door_w, 0.08, EAVE - door_h),
          (0.0, -HD - ofs, BASE + door_h + (EAVE - door_h) / 2.0), mat="wall_white")
    b.box((2.0 * HW, 0.08, EAVE), (0.0, HD + ofs, BASE + EAVE / 2.0), mat="wall_white")
    for sx in (-HW, HW):                                                    # 山墙 + 阶梯三角
        b.box((0.08, 2.0 * HD, EAVE), (sx, 0.0, BASE + EAVE / 2.0), mat="wall_white")
        for k in range(4):
            w = 2.0 * HD * (1.0 - (k + 0.5) / 4.0)
            b.box((0.08, w, RISE / 4.0), (sx, 0.0, BASE + EAVE + (k + 0.5) * RISE / 4.0),
                  mat="wall_white")
    for sy in (-HD - ofs, HD + ofs):                                        # 长边波纹肋
        s = 1.0 if sy > 0 else -1.0
        for k in range(int(2.0 * HW / 0.62) + 1):
            x = -HW + k * 0.62
            if sy < 0 and abs(x) < door_w / 2.0 + 0.12:
                continue
            b.box((0.07, 0.05, EAVE - 0.14), (x, sy + s * 0.055, BASE + EAVE / 2.0), mat=sg)
    for sx in (-HW - 0.06, HW + 0.06):                                      # 山墙波纹肋
        for k in range(int(2.0 * HD / 0.62) + 1):
            b.box((0.05, 0.07, EAVE - 0.14), (sx, -HD + k * 0.62, BASE + EAVE / 2.0), mat=sg)
    for k in range(3):                                                      # 后墙高窗
        b.box((1.40, 0.06, 0.70), (-4.0 + k * 4.0, HD + ofs + 0.06,
                                   BASE + EAVE - 0.80), mat="glass")

    # ---------------- 卷帘门（半开）+ 卷筒 + 雨棚 ----------------
    b.box((door_w, 0.10, 1.10), (0.0, -HD - ofs - 0.07, BASE + door_h - 0.55),
          mat="steel_gray")
    for k in range(4):
        b.box((door_w, 0.05, 0.06), (0.0, -HD - ofs - 0.13,
                                     BASE + door_h - 1.00 + k * 0.30), mat="concrete_dark")
    b.box((door_w + 0.50, 0.34, 0.36), (0.0, -HD - ofs - 0.11, BASE + door_h + 0.16),
          mat=blue)
    for sx in (-door_w / 2.0 - 0.12, door_w / 2.0 + 0.12):                  # 门框
        b.box((0.18, 0.24, door_h + 0.34), (sx, -HD - ofs - 0.07,
                                            BASE + (door_h + 0.34) / 2.0), mat=blue)
    # ---------------- 弧线雨棚（从墙面起弧，只保留弧形棚面与两侧弧形边梁） ----------------
    # 用 8 段平板拼出一段圆弧：内缘埋进墙面 0.10m，与墙体完全贴合、不留缝隙，
    # 棚下不再设支撑杆件。
    cw_w = door_w + 1.4                     # 雨棚宽度
    cz0 = BASE + door_h + 0.55              # 起弧高度（门楣上方、檐口以下）
    cR = 4.0                                # 圆弧半径
    cdeg = 34.0                             # 圆弧圆心角
    cseg = 8
    y_wall = -HD - ofs                      # 墙面外皮
    dth = math.radians(cdeg) / cseg
    facet = cR * dth + 0.035
    for k in range(cseg):
        th = (k + 0.5) * dth
        py = y_wall + 0.10 - cR * math.sin(th)
        pz = cz0 - cR * (1.0 - math.cos(th))
        b.box((cw_w, facet, 0.08), (0.0, py, pz), rotation=(th, 0.0, 0.0),
              mat="roof_blue")
        for sx in (-cw_w / 2.0 + 0.07, cw_w / 2.0 - 0.07):        # 弧形边梁
            b.box((0.13, facet, 0.12), (sx, py, pz + 0.02),
                  rotation=(th, 0.0, 0.0), mat=sg)

    # ---------------- 室内：货架 + 材料分区堆放 + 通道标线 + 标识 ----------------
    # 货架（蓝色立柱 + 灰色横梁 + 层板 + 料箱 + 货位标签）
    for sy in (-1.9, 1.9):
        for k in range(5):
            for dy in (-0.80, 0.80):
                b.box((0.13, 0.13, 3.00), (-5.60 + k * 2.80, sy + dy, BASE + 1.50),
                      mat=blue)
                b.box((0.20, 0.20, 0.08), (-5.60 + k * 2.80, sy + dy, BASE + 2.98),
                      mat=sg)
            for dy in (-0.80, 0.80):
                b.box((0.22, 0.22, 0.06), (-5.60 + k * 2.80, sy + dy, BASE + 0.03),
                      mat=sg)
        for lv in range(3):
            b.box((11.60, 1.75, 0.07), (0.0, sy, BASE + 0.78 + lv * 0.95), mat=sg)
            b.box((11.60, 0.06, 0.16), (0.0, sy - 0.86, BASE + 0.72 + lv * 0.95),
                  mat=blue)
            for k in range(5):
                b.box((2.30, 1.50, 0.62), (-5.00 + k * 2.50, sy,
                                           BASE + 1.15 + lv * 0.95),
                      mat="board_blue" if (k + lv) % 2 else "machine_orange")
                b.box((0.34, 0.03, 0.16), (-5.00 + k * 2.50, sy - 0.79,
                                           BASE + 0.86 + lv * 0.95), mat="line_white")
        b.box((11.70, 1.85, 0.06), (0.0, sy, BASE + 3.02), mat=sg)      # 货架顶板
    # 通道标线（中央通道黄线 + 两侧白边线）
    b.box((12.6, 0.10, 0.02), (0.0, -0.55, BASE + 0.01), mat="hazard_yellow")
    b.box((12.6, 0.10, 0.02), (0.0, 0.55, BASE + 0.01), mat="hazard_yellow")
    for sx in (-6.4, 6.4):
        b.box((0.10, 3.6, 0.02), (sx, 0.0, BASE + 0.01), mat="line_white")
    # 钢管堆（三层交错）
    for row in range(3):
        for col in range(3 - row):
            b.cylinder(0.11, 6.4, (0.0, -3.05 + (col - (2 - row) / 2.0) * 0.26,
                                   BASE + 0.12 + row * 0.22),
                       rotation=(0.0, math.pi / 2.0, 0.0), mat="pipe_steel", segments=8)
    for sx in (-3.2, 3.2):                                              # 钢管堆挡块
        b.box((0.14, 0.90, 0.30), (sx, -3.05, BASE + 0.15), mat="hazard_yellow")
    # 木模板垛（带木方垫层）
    for lv in range(4):
        b.box((2.60, 1.40, 0.09), (4.60, -3.00, BASE + 0.16 + lv * 0.11), mat="wood")
    for sy in (-3.55, -2.45):
        for sx in (3.60, 5.60):
            b.box((0.16, 0.16, 0.16), (sx, sy, BASE + 0.08), mat="wood")
    # 托盘货垛（垫木托盘 + 袋装水泥）
    for lv in range(2):
        for k in range(3):
            b.box((1.10, 0.90, 0.12), (2.60 + k * 1.30, 3.05, BASE + 0.13 + lv * 0.30),
                  mat="wood")
    b.box((3.9, 0.86, 0.22), (3.90, 3.05, BASE + 0.55), mat="wall_white")
    for k in range(4):
        b.box((0.80, 0.66, 0.22), (2.20 + k * 1.10, 3.05, BASE + 0.79), mat="wall_white")
    # 安全网卷（立放的圆卷）
    for k in range(4):
        b.cylinder(0.30, 0.22, (-6.30, -1.40 + k * 0.66, BASE + 0.30),
                   rotation=(0.0, math.pi / 2.0, 0.0), mat="safety_green", segments=10)
    # 电缆盘
    b.cylinder(1.00, 0.36, (-3.40, 3.00, BASE + 0.18), rotation=(math.pi / 2.0, 0, 0),
               mat="cable_black", segments=14)
    b.cylinder(0.36, 0.92, (-3.40, 3.00, BASE + 0.18), rotation=(math.pi / 2.0, 0, 0),
               mat=blue, segments=10)
    # 氧气 / 乙炔瓶（带防倒链的钢瓶笼）
    for k, m in enumerate(("paint_red", "board_blue")):
        b.cylinder(0.16, 1.20, (-6.55, 1.30 + k * 0.44, BASE + 0.60), mat=m, segments=10)
        b.cylinder(0.06, 0.14, (-6.55, 1.30 + k * 0.44, BASE + 1.27),
                   mat="steel_gray", segments=8)
    for sx in (-6.95, -6.15):
        b.beam((sx, 1.10, BASE), (sx, 1.10, BASE + 1.55), 0.05, mat="galvanized")
    for zz in (BASE + 0.55, BASE + 1.50):
        b.beam((-6.95, 1.10, zz), (-6.15, 1.10, zz), 0.045, mat="galvanized")
    # 灭火器 + 标识牌
    for mx in (6.55, 6.95):
        b.cylinder(0.13, 0.50, (mx, -5.35, BASE + 0.30), mat="paint_red", segments=8)
    b.box((1.20, 0.08, 0.80), (0.0, HD - 0.30, BASE + 1.85), mat="board_blue")
    b.box((1.00, 0.05, 0.30), (0.0, HD - 0.36, BASE + 2.05), mat="line_white")
    b.box((0.90, 0.06, 0.62), (-5.60, -HD + 0.30, BASE + 1.60), mat="board_blue")
    # 室内照明（6 盏吊灯，漫游进仓也够亮）
    for k in range(6):
        b.cylinder(0.03, 0.45, (-7.5 + k * 3.0, 0.0, BASE + EAVE - 0.55),
                   mat="galvanized", segments=6)
        b.box((0.62, 0.34, 0.16), (-7.5 + k * 3.0, 0.0, BASE + EAVE - 0.80),
              mat="lamp_white")
    for sy in (-HD + 0.16, HD - 0.16):                                   # 侧墙灯带
        b.box((13.4, 0.10, 0.14), (0.0, sy, BASE + EAVE - 0.55), mat="lamp_white")

    # ---------------- 门前配电箱（地面白条纹 / 灭火器 / 标识牌已删除） ----------------
    b.box((0.90, 0.50, 1.10), (-6.40, -HD - 1.90, 0.86), mat=blue)

    return b.build(collection)


# --------------------------------------------------------------------------
# 现场临时办公 / 工具房（两只集装箱拼成，办公 + 材料库）
# --------------------------------------------------------------------------
def build_site_office(collection=None):
    b = MeshBuilder("SiteOffice")
    sg = "steel_gray"

    # ---- 基础地坪 + 门前走道 ----
    b.box((13.4, 5.6, 0.20), (0.0, 0.0, 0.10), mat="concrete_dark")
    b.box((12.0, 1.8, 0.08), (0.0, 2.70, 0.22), mat="concrete")

    for i, ox in enumerate((-3.4, 3.4)):
        # ---- 箱体 ----
        b.box((6.4, 2.6, 2.60), (ox, 0.0, 1.50), mat="wall_white")
        for k in range(10):                                              # 竖向波纹肋
            xx = ox - 2.9 + k * 0.645
            for sy in (-1.32, 1.32):
                b.box((0.10, 0.06, 2.42), (xx, sy, 1.50), mat=sg)
        for sx in (ox - 3.14, ox + 3.14):                                # 角柱
            for sy in (-1.24, 1.24):
                b.box((0.14, 0.14, 2.60), (sx, sy, 1.50), mat=sg)
        b.box((6.74, 2.94, 0.14), (ox, 0.0, 2.87), mat="roof_blue")      # 顶盖

        face = 1.38                                                      # 正面（+Y）外皮
        if i == 0:
            # ---- 办公室：门 + 两扇窗 + 雨棚 + 台阶 + 空调 ----
            b.box((1.00, 0.10, 2.00), (ox + 1.70, face, 1.25), mat="door_gray")
            b.box((0.12, 0.10, 0.10), (ox + 2.06, face + 0.06, 1.20), mat=sg)
            for wx in (ox - 1.90, ox - 0.50):
                b.box((1.05, 0.08, 0.90), (wx, face, 1.80), mat="glass")
                b.box((1.22, 0.06, 0.08), (wx, face + 0.05, 2.28), mat=sg)
                b.box((1.22, 0.06, 0.08), (wx, face + 0.05, 1.32), mat=sg)
            # ---- 弧形雨棚（与仓库同款：8 段拼弧、内缘埋进墙面，棚下不设支撑杆） ----
            aw = 1.90                    # 雨棚宽度
            az0 = 2.44                   # 起弧高度（门楣上方）
            aR, adeg, aseg = 2.40, 38.0, 8
            adth = math.radians(adeg) / aseg
            afacet = aR * adth + 0.03
            for k in range(aseg):
                th = (k + 0.5) * adth
                py = 1.25 + aR * math.sin(th)        # 朝 +Y 外挑，内缘在箱体墙内
                pz = az0 - aR * (1.0 - math.cos(th))
                b.box((aw, afacet, 0.07), (ox + 1.70, py, pz),
                      rotation=(-th, 0.0, 0.0), mat="roof_blue")
                for sx in (ox + 1.70 - aw / 2.0 + 0.06, ox + 1.70 + aw / 2.0 - 0.06):
                    b.box((0.11, afacet, 0.10), (sx, py, pz + 0.02),
                          rotation=(-th, 0.0, 0.0), mat=sg)
            b.box((1.70, 1.10, 0.20), (ox + 1.70, 1.95, 0.10), mat="concrete")
            b.box((1.70, 0.42, 0.30), (ox + 1.70, 1.45, 0.15), mat="concrete")
            b.box((0.62, 0.06, 0.30), (ox + 1.70, face + 0.04, 1.95), mat="board_blue")
            b.box((0.86, 0.40, 0.58), (ox - 2.70, 1.50, 0.92), mat="wall_white")
            b.box((0.86, 0.06, 0.44), (ox - 2.70, 1.72, 0.92), mat=sg)
        else:
            # ---- 工具房：卷帘门 + 小窗 + 灭火器 ----
            b.box((2.70, 0.10, 2.15), (ox, face, 1.33), mat="steel_gray")
            for k in range(9):
                b.box((2.70, 0.06, 0.06), (ox, face + 0.05, 0.40 + k * 0.22),
                      mat="concrete_dark")
            b.box((1.05, 0.08, 0.85), (ox - 2.40, face, 1.80), mat="glass")
            b.box((1.22, 0.06, 0.08), (ox - 2.40, face + 0.05, 2.26), mat=sg)
            for mx in (ox + 2.20, ox + 2.58):
                b.cylinder(0.14, 0.55, (mx, face + 0.16, 0.48), mat="paint_red",
                           segments=8)
            b.box((2.70, 0.16, 0.06), (ox, face + 0.12, 2.34), mat="hazard_yellow")

    return b.build(collection)


# --------------------------------------------------------------------------
# 休息棚 / 茶水亭（工人歇脚、饮水、吸烟，含长凳、桌子与安全宣传栏）
# --------------------------------------------------------------------------
def build_rest_shed(collection=None):
    b = MeshBuilder("RestShed")
    sg = "steel_gray"
    gal = "galvanized"

    # ---- 地坪 ----
    b.box((7.0, 5.0, 0.16), (0.0, 0.0, 0.08), mat="concrete_dark")

    # ---- 钢架 + 彩钢顶棚（外形、尺寸、材质均保持不变） ----
    h = 2.90
    for sx in (-3.0, 0.0, 3.0):
        for sy in (-2.1, 2.1):
            b.box((0.16, 0.16, h), (sx, sy, 0.16 + h / 2.0), mat=sg)
    for sy in (-2.1, 2.1):
        b.beam((-3.3, sy, 0.16 + h), (3.3, sy, 0.16 + h), 0.14, mat=sg)
    for sx in (-3.0, 0.0, 3.0):
        b.beam((sx, -2.35, 0.16 + h), (sx, 2.35, 0.16 + h), 0.12, mat=sg)
    b.box((7.4, 5.4, 0.10), (0.0, 0.0, 0.16 + h + 0.05), mat=sg)
    b.box((7.5, 0.16, 0.20), (0.0, -2.72, 0.16 + h + 0.06), mat=gal)

    z0 = 0.16                      # 地坪顶面标高（内部家私均以此为基准）

    # ==================== 两侧通长长凳（坐板条 + 靠背条 + 钢凳腿） ====================
    seat_top, seat_d = z0 + 0.45, 0.42
    for sgn in (-1.0, 1.0):
        cy = sgn * 1.62
        back_y = cy + sgn * 0.19
        for lx in (-2.25, -0.75, 0.75, 2.25):
            b.box((0.06, 0.38, 0.45), (lx, cy, z0 + 0.225), mat=sg)              # 凳腿
        for dy in (-0.13, 0.0, 0.13):
            b.box((4.55, 0.11, 0.045), (0.0, cy + dy, seat_top - 0.0225),
                  mat="wood")                                                    # 坐板条
        for lx in (-2.25, -0.75, 0.75, 2.25):
            b.box((0.055, 0.05, 0.55), (lx, back_y, seat_top + 0.275), mat=sg)   # 靠背立柱
        for zz in (0.80, 0.97, 1.13):
            b.box((4.55, 0.05, 0.13), (0.0, back_y, zz), mat="wood")             # 靠背条

    # ==================== 中间方桌 + 四只圆凳 ====================
    b.box((1.75, 0.95, 0.06), (0.0, 0.0, z0 + 0.59), mat="wood")                 # 桌面
    b.box((1.55, 0.78, 0.07), (0.0, 0.0, z0 + 0.50), mat=sg)                     # 围裙
    for (lx, ly) in ((-0.72, -0.36), (0.72, -0.36), (-0.72, 0.36), (0.72, 0.36)):
        b.box((0.07, 0.07, 0.56), (lx, ly, z0 + 0.28), mat=sg)                   # 桌腿
    for (sx2, sy2) in ((-0.62, -0.82), (0.62, -0.82), (-0.62, 0.82), (0.62, 0.82)):
        b.cylinder(0.17, 0.05, (sx2, sy2, z0 + 0.42), mat="wood", segments=10)   # 凳面
        for (lx, ly) in ((-0.11, -0.11), (0.11, -0.11), (-0.11, 0.11), (0.11, 0.11)):
            b.beam((sx2 + lx, sy2 + ly, z0), (sx2 + lx * 0.55, sy2 + ly * 0.55,
                                              z0 + 0.40), 0.028, mat=sg)         # 凳腿

    # ==================== 西侧：饮水机 / 开水器 / 洗手池（一字排开） ====================
    # 饮水机（带纯净水桶、出水嘴与纸杯架）
    dx, dy = -2.60, -1.15
    b.box((0.32, 0.32, 0.22), (dx, dy, z0 + 0.11), mat=sg)                       # 底座
    b.box((0.34, 0.34, 0.78), (dx, dy, z0 + 0.61), mat="wall_white")            # 机身
    b.cylinder(0.155, 0.40, (dx, dy, z0 + 1.36), mat="water", segments=12)      # 水桶
    b.cylinder(0.05, 0.10, (dx, dy, z0 + 0.98), mat=gal, segments=8)            # 瓶颈
    for ty in (dy - 0.09, dy + 0.09):
        b.cylinder(0.02, 0.10, (dx + 0.19, ty, z0 + 0.72),
                   rotation=(0.0, math.pi / 2.0, 0.0), mat=gal, segments=6)     # 出水嘴
    b.box((0.10, 0.28, 0.03), (dx + 0.20, dy, z0 + 0.60), mat=gal)              # 接水盘
    for oy in (-0.07, 0.0, 0.07):
        b.cylinder(0.028, 0.08, (dx + 0.20, dy + oy, z0 + 0.645),
                   mat="wall_white", segments=8)                               # 纸杯

    # 开水器（不锈钢，带出水嘴、接水盘与指示灯）
    bx, by = -2.60, 0.05
    b.box((0.32, 0.34, 0.50), (bx, by, z0 + 0.25), mat=sg)                      # 底柜
    b.box((0.34, 0.36, 0.55), (bx, by, z0 + 0.775), mat=gal)                   # 开水器外壳
    b.box((0.36, 0.38, 0.04), (bx, by, z0 + 1.07), mat=sg)                      # 顶盖
    b.cylinder(0.02, 0.12, (bx + 0.19, by, z0 + 0.56),
               rotation=(0.0, math.pi / 2.0, 0.0), mat=gal, segments=6)        # 出水嘴
    b.box((0.10, 0.24, 0.03), (bx + 0.19, by, z0 + 0.46), mat=gal)             # 接水盘
    b.box((0.02, 0.05, 0.10), (bx + 0.185, by - 0.12, z0 + 0.95), mat="paint_red")  # 指示灯

    # 洗手池（不锈钢水槽 + 挡水板 + 龙头）与地漏
    wx, wy = -2.62, 1.15
    b.box((0.44, 0.62, 0.16), (wx, wy, z0 + 0.72), mat=gal)                    # 水槽
    b.box((0.05, 0.62, 0.22), (wx + 0.225, wy, z0 + 0.66), mat=sg)             # 前沿板
    for oy in (-0.25, 0.25):
        b.box((0.06, 0.06, 0.58), (wx - 0.16, wy + oy, z0 + 0.29), mat=sg)      # 池腿
    b.box((0.05, 0.62, 0.26), (wx - 0.20, wy, z0 + 0.98), mat=gal)              # 挡水板
    b.cylinder(0.022, 0.22, (wx - 0.12, wy, z0 + 0.98), mat=gal, segments=8)    # 立管
    b.cylinder(0.018, 0.16, (wx - 0.05, wy, z0 + 1.09),
               rotation=(0.0, math.pi / 2.0, 0.0), mat=gal, segments=6)         # 龙头
    b.box((0.18, 0.18, 0.02), (-2.55, 1.72, z0 + 0.01), mat="concrete_dark")    # 地漏框
    for oy in (-0.055, 0.0, 0.055):
        b.box((0.16, 0.012, 0.02), (-2.55, 1.72 + oy, z0 + 0.021), mat=gal)     # 地漏格栅

    # ==================== 东侧：灭火器箱 / 垃圾桶 ====================
    # 灭火器箱（红箱 + 黄警示顶盖 + 观察窗 + 把手）
    fx, fy = 2.70, -1.55
    b.box((0.30, 0.55, 0.72), (fx, fy, z0 + 0.36), mat="paint_red")
    b.box((0.32, 0.57, 0.06), (fx, fy, z0 + 0.75), mat="hazard_yellow")
    b.box((0.02, 0.34, 0.34), (fx - 0.16, fy, z0 + 0.42), mat="glass")
    b.box((0.03, 0.06, 0.16), (fx - 0.17, fy + 0.20, z0 + 0.42), mat=gal)
    b.box((0.42, 0.10, 0.04), (fx, fy, z0 + 0.02), mat="hazard_yellow")

    # 鞋架与安全帽挂钩（黄 / 橙 / 白栏杆类构件）按用户要求整体删除，
    # 东侧只保留灭火器箱与垃圾桶。

    # 垃圾桶（带桶盖）
    b.cylinder(0.24, 0.70, (2.66, 1.55, z0 + 0.35), mat="safety_green", segments=10)
    b.cylinder(0.25, 0.05, (2.66, 1.55, z0 + 0.72), mat=sg, segments=10)

    # ==================== 顶灯 / 通风百叶 / 绿植 ====================
    # 吸顶灯（两盏，带吊线）
    for lx in (-1.7, 1.7):
        b.cylinder(0.012, 0.16, (lx, 0.0, z0 + h - 0.08), mat="cable_black", segments=6)
        b.cylinder(0.20, 0.10, (lx, 0.0, z0 + h - 0.20), mat="lamp_white", segments=12)
        b.cylinder(0.16, 0.03, (lx, 0.0, z0 + h - 0.26), mat="lamp_white", segments=12)

    # 高处通风百叶（南侧，6 片镀锌叶片 + 两端框）
    lv_y = 2.02
    for k in range(6):
        zz = z0 + h - 0.10 - k * 0.11
        b.box((2.0, 0.05, 0.07), (0.0, lv_y, zz), rotation=(0.5, 0.0, 0.0), mat=gal)
    for sx2 in (-1.05, 1.05):
        b.box((0.06, 0.06, 0.70), (sx2, lv_y, z0 + h - 0.38), mat=sg)

    # 绿植（西侧两盆落地 + 桌面一小盆）
    for (px, py) in ((-2.80, -1.80), (-2.80, 1.80)):
        b.cylinder(0.15, 0.24, (px, py, z0 + 0.12), mat="sand", segments=8)     # 花盆
        b.cylinder(0.13, 0.03, (px, py, z0 + 0.25), mat="soil", segments=8)     # 种植土
        b.sphere(0.22, (px, py, z0 + 0.52), mat="leaf_mid", subdiv=1,
                 scale=(1.0, 1.0, 1.15))
        b.sphere(0.14, (px + 0.10, py - 0.08, z0 + 0.68), mat="leaf_light",
                 subdiv=1, scale=(1.0, 1.0, 1.0))
    b.cylinder(0.09, 0.14, (0.55, 0.10, z0 + 0.69), mat="sand", segments=8)
    b.sphere(0.14, (0.55, 0.10, z0 + 0.84), mat="leaf_mid", subdiv=1,
             scale=(1.0, 1.0, 1.10))

    # 安全宣传栏（镀锌立柱读作白色栏杆 + 海报）按用户要求整体删除。

    return b.build(collection)


# --------------------------------------------------------------------------
# 工人模型族（低模、可动关节；供前端 People.js 程序化走路 / 跑动）
#
#   统一骨架（身高约 1.72m，原点在双脚中心，正面朝 +X）：
#     Worker（根，空物体）
#       ├─ Worker_Body          躯干 + 头 + 安全帽 + 腰带（原点在髋关节高度，供躯干前倾）
#       │     ├─ Worker_ArmL    左臂（原点在左肩关节）
#       │     └─ Worker_ArmR    右臂（原点在右肩关节）
#       ├─ Worker_LegL          左腿（原点在左髋关节）
#       └─ Worker_LegR          右腿（原点在右髋关节）
#
#   前端按名字取这 5 个节点、绕各自枢轴旋转即可摆出走 / 跑姿态，不需要骨骼动画。
#   材质沿用统一命名：安全帽 hazard_yellow、反光背心 machine_orange、工装 door_gray、
#   皮肤 sand、工靴/腰带 machine_dark、反光条/镀锌件 galvanized，前端据此给克隆体上色。
# --------------------------------------------------------------------------

_W_HIP_Z = 0.90          # 髋关节高度（腿与躯干的分界）
_W_SHO_Z = 1.40          # 肩关节高度
_W_LEG_Y = 0.105         # 左右腿中心相对中线的偏移
_W_ARM_Y = 0.205         # 左右肩中心相对中线的偏移
_W_UP = 0.30             # 上臂长
_W_FORE = 0.31           # 前臂长
_W_GRIP = 0.36           # 肩关节 -> 掌心距离


def _w_hand_local(elbow):
    """手臂对象未加旋转时，掌心中心在手臂局部坐标里的位置（elbow 为肘弯角）。"""
    return Vector((_W_GRIP * math.sin(elbow), 0.0,
                   -_W_UP - _W_GRIP * math.cos(elbow)))


def _w_hand_world(shoulder, elbow, rot):
    """由肩关节位置、肘弯角、手臂对象欧拉角推算掌心在「模型坐标系」里的位置。"""
    m = Euler(rot, "XYZ").to_matrix()
    return Vector(shoulder) + (m @ _w_hand_local(elbow))


def _w_solve_arm(shoulder, elbow, target, span_f=1.35, span_i=0.85, n=28):
    """粗搜一组（内外摆 iota、前后摆 phi）让掌心最接近 target，返回欧拉角。"""
    tgt = Vector(target)
    best_rot, best_d = (0.0, 0.0, 0.0), None
    for a in range(n + 1):
        phi = -span_f + 2.0 * span_f * a / n
        for b in range(n + 1):
            iota = -span_i + 2.0 * span_i * b / n
            d = (_w_hand_world(shoulder, elbow, (iota, phi, 0.0)) - tgt).length
            if best_d is None or d < best_d:
                best_d, best_rot = d, (iota, phi, 0.0)
    return best_rot


def _w_fore_center(elbow):
    return (math.sin(elbow) * _W_FORE / 2.0, 0.0,
            -_W_UP - math.cos(elbow) * _W_FORE / 2.0)


def _w_arm_mesh(cloth, glove, elbow, w):
    """一条手臂：上臂 + 肘 + 前臂（带固定肘弯）+ 手掌，原点在肩关节。"""
    b = MeshBuilder("_arm")
    b.box((0.106 * w, 0.115, _W_UP), (0.0, 0.0, -_W_UP / 2.0), mat=cloth)
    b.box((0.116 * w, 0.12, 0.085), (0.0, 0.0, -_W_UP + 0.02), mat=cloth)      # 肘
    b.box((0.094 * w, 0.10, _W_FORE + 0.02), _w_fore_center(elbow),
          rotation=(0.0, -elbow, 0.0), mat=cloth)                              # 前臂
    h = _w_hand_local(elbow)
    b.box((0.10, 0.105, 0.115), (h.x, 0.0, h.z),
          rotation=(0.0, -elbow, 0.0), mat=glove)                              # 手
    return b


def _w_leg_mesh(cloth, dark, w):
    """一条腿：大腿 + 膝 + 小腿 + 裤脚 + 工作靴（鞋尖朝 +X），原点在髋关节。"""
    b = MeshBuilder("_leg")
    b.box((0.155 * w, 0.165, 0.42), (0.0, 0.0, -0.21), mat=cloth)              # 大腿
    b.box((0.15 * w, 0.16, 0.11), (0.0, 0.0, -0.445), mat=cloth)              # 膝
    b.box((0.132 * w, 0.142, 0.37), (0.0, 0.0, -0.665), mat=cloth)            # 小腿
    b.box((0.148 * w, 0.152, 0.10), (0.0, 0.0, -0.845), mat=cloth)            # 裤脚
    b.box((0.26, 0.155, 0.10), (0.055, 0.0, -0.85), mat=dark)                 # 工作靴
    b.box((0.10, 0.16, 0.075), (-0.055, 0.0, -0.825), mat=dark)               # 靴跟
    return b


def _w_torso_mesh(m, w, vest_on):
    """躯干 + 头 + 腰带（含工具袋），原点在髋关节高度。"""
    b = MeshBuilder("_body")
    b.box((0.245 * w, 0.34 * w, 0.16), (0.0, 0.0, -0.015), mat=m["cloth"])     # 髋 / 臀
    b.box((0.25 * w, 0.35 * w, 0.06), (0.0, 0.0, 0.055), mat=m["dark"])        # 腰带
    b.box((0.205 * w, 0.29 * w, 0.21), (0.0, 0.0, 0.195), mat=m["cloth"])      # 腰（收）
    b.box((0.24 * w, 0.37 * w, 0.25), (0.0, 0.0, 0.40), mat=m["cloth"])        # 胸
    b.box((0.20 * w, 0.41 * w, 0.09), (0.0, 0.0, 0.51), mat=m["cloth"])        # 肩
    if vest_on:
        b.box((0.262 * w, 0.385 * w, 0.37), (0.0, 0.0, 0.30), mat=m["vest"])   # 反光背心
        for oy in (-0.196 * w, 0.196 * w):
            b.box((0.272 * w, 0.024, 0.055), (0.0, oy, 0.25), mat=m["metal"])  # 前后反光条
        for oy in (-0.105 * w, 0.105 * w):
            b.box((0.032, 0.05, 0.33), (0.138 * w, oy, 0.30), mat=m["metal"])  # 背心肩带
    else:
        b.box((0.248 * w, 0.356 * w, 0.38), (0.0, 0.0, 0.30), mat=m["cloth"]) # 浅色衬衫
        for oy in (-0.194 * w, 0.194 * w):
            b.box((0.256 * w, 0.022, 0.045), (0.0, oy, 0.185), mat=m["metal"])
        for oy in (-0.10 * w, 0.10 * w):
            b.box((0.03, 0.045, 0.30), (0.136 * w, oy, 0.31), mat=m["metal"])
    b.cylinder(0.055, 0.11, (0.0, 0.0, 0.545), mat=m["skin"], segments=8)      # 颈
    b.box((0.155, 0.175, 0.20), (0.0, 0.0, 0.665), mat=m["skin"])              # 头
    b.box((0.035, 0.05, 0.035), (0.082, 0.0, 0.645), mat=m["skin"])            # 鼻
    for ey in (-0.045, 0.045):
        b.box((0.016, 0.032, 0.028), (0.081, ey, 0.686), mat=m["dark"])        # 眼
    for ey in (-0.092, 0.092):
        b.box((0.03, 0.022, 0.05), (0.0, ey, 0.66), mat=m["skin"])             # 耳
    b.box((0.10, 0.13, 0.16), (0.075, -0.20, 0.045), mat=m["dark"])            # 腰带工具袋
    b.cylinder(0.018, 0.18, (0.075, -0.20, 0.15), mat=m["metal"], segments=6)
    return b


def _w_helmet_mesh(b, mat, w):
    """安全帽（半球盔壳 + 帽檐 + 前檐）。"""
    b.sphere(0.148, (0.0, 0.0, 0.754), mat=mat, subdiv=2, scale=(1.0, 1.0, 0.45))
    b.box((0.226 * w, 0.238 * w, 0.026), (0.0, 0.0, 0.724), mat=mat)           # 帽檐
    b.box((0.13, 0.165, 0.022), (0.118, 0.0, 0.721), mat=mat)                  # 前檐


def _w_attach(collection, builder, name, parent, parent_matrix, loc, rot=(0.0, 0.0, 0.0)):
    """把道具挂到某个节点上；loc / rot 用「模型坐标系」表达，内部换算成父节点局部坐标。"""
    obj = builder.build(collection)
    obj.name = name
    obj.data.name = name
    obj.parent = parent
    obj.matrix_parent_inverse = Matrix.Identity(4)
    inv = parent_matrix.inverted()
    obj.location = inv @ Vector(loc)
    obj.rotation_euler = (inv.to_3x3() @ Euler(rot, "XYZ").to_matrix()).to_euler("XYZ")
    return obj


# 每位工人的差异参数：材质、宽窄、肘弯角（左右）、可选的双手目标点
_W_PROFILES = {
    "worker": dict(
        helmet="hazard_yellow", vest="machine_orange", cloth="door_gray",
        skin="sand", dark="machine_dark", metal="galvanized",
        vest_on=True, w=1.0, elbow=(0.30, 0.30)),
    "hoe": dict(
        helmet="hazard_yellow", vest="machine_orange", cloth="door_gray",
        skin="sand", dark="machine_dark", metal="galvanized",
        vest_on=True, w=1.0, elbow=(0.45, 0.60),
        targetL=(0.46, 0.02, 1.18), targetR=(0.44, -0.08, 1.00)),
    "plan": dict(
        helmet="hazard_yellow", vest="machine_orange", cloth="door_gray",
        skin="sand", dark="machine_dark", metal="galvanized",
        vest_on=True, w=1.0, elbow=(0.30, 0.95),
        targetR=(0.60, -0.16, 1.16)),
    "cement": dict(
        helmet="hazard_yellow", vest="machine_orange", cloth="door_gray",
        skin="sand", dark="machine_dark", metal="galvanized",
        vest_on=True, w=1.0, elbow=(0.30, 0.55),
        targetR=(0.30, -0.46, 1.86)),
    "tech": dict(
        helmet="steel_blue", vest="machine_orange", cloth="wall_white",
        skin="sand", dark="machine_dark", metal="galvanized",
        vest_on=False, w=0.92, elbow=(0.80, 0.30),
        targetL=(0.58, 0.16, 1.20)),
    "foreman": dict(
        helmet="paint_red", vest="machine_orange", cloth="machine_dark",
        skin="sand", dark="machine_dark", metal="galvanized",
        vest_on=True, w=1.12, elbow=(0.30, 0.42),
        targetR=(0.54, -0.14, 1.00)),
}


def _w_build(collection, name, key):
    coll = collection or bpy.context.scene.collection
    p = _W_PROFILES[key]
    m = {k: p[k] for k in ("helmet", "vest", "cloth", "skin", "dark", "metal")}
    w = p["w"]
    elb_l, elb_r = p["elbow"]

    sho_l = Vector((0.0, _W_ARM_Y, _W_SHO_Z))
    sho_r = Vector((0.0, -_W_ARM_Y, _W_SHO_Z))

    rot_l = _w_solve_arm(sho_l, elb_l, p["targetL"]) if p.get("targetL") else (0.0, 0.0, 0.0)
    rot_r = _w_solve_arm(sho_r, elb_r, p["targetR"]) if p.get("targetR") else (0.0, 0.0, 0.0)
    hand_l = _w_hand_world(sho_l, elb_l, rot_l)
    hand_r = _w_hand_world(sho_r, elb_r, rot_r)

    # ---- 各部件独立成对象，才能被前端分别绕枢轴旋转 ----
    torso = _w_torso_mesh(m, w, p["vest_on"])
    _w_helmet_mesh(torso, m["helmet"], w)
    body_obj = torso.build(coll)
    body_obj.name = "Worker_Body"
    body_obj.data.name = "Worker_Body"

    arm_l_obj = _w_arm_mesh(m["cloth"], m["dark"], elb_l, w).build(coll)
    arm_r_obj = _w_arm_mesh(m["cloth"], m["dark"], elb_r, w).build(coll)
    leg_l_obj = _w_leg_mesh(m["cloth"], m["dark"], w).build(coll)
    leg_r_obj = _w_leg_mesh(m["cloth"], m["dark"], w).build(coll)
    for obj, nm in ((arm_l_obj, "Worker_ArmL"), (arm_r_obj, "Worker_ArmR"),
                    (leg_l_obj, "Worker_LegL"), (leg_r_obj, "Worker_LegR")):
        obj.name = nm
        obj.data.name = nm

    # 枢轴落在关节上：腿 / 躯干挂根节点，手臂挂躯干（前倾时随躯干一起走）
    body_obj.location = Vector((0.0, 0.0, _W_HIP_Z))
    leg_l_obj.location = Vector((0.0, _W_LEG_Y, _W_HIP_Z))
    leg_r_obj.location = Vector((0.0, -_W_LEG_Y, _W_HIP_Z))
    arm_l_obj.location = Vector((0.0, _W_ARM_Y, _W_SHO_Z - _W_HIP_Z))
    arm_r_obj.location = Vector((0.0, -_W_ARM_Y, _W_SHO_Z - _W_HIP_Z))
    arm_l_obj.rotation_euler = Euler(rot_l, "XYZ")
    arm_r_obj.rotation_euler = Euler(rot_r, "XYZ")

    root = bpy.data.objects.new(name, None)
    root.empty_display_size = 0.25
    coll.objects.link(root)
    parent_to(body_obj, root)
    parent_to(leg_l_obj, root)
    parent_to(leg_r_obj, root)
    parent_to(arm_l_obj, body_obj)
    parent_to(arm_r_obj, body_obj)

    # 道具用「模型坐标系」定位，内部换算到父节点局部坐标
    body_mat = Matrix.Translation(Vector((0.0, 0.0, _W_HIP_Z)))
    arm_l_mat = Matrix.Translation(sho_l) @ Euler(rot_l, "XYZ").to_matrix().to_4x4()
    arm_r_mat = Matrix.Translation(sho_r) @ Euler(rot_r, "XYZ").to_matrix().to_4x4()

    if key == "hoe":
        # 锄头：木柄穿过双手，刃口朝下拄在地面
        dn = hand_r - hand_l
        if dn.length < 1e-3:
            dn = Vector((0.10, -0.10, -0.30))
        dn.normalize()
        top = hand_l - dn * 0.24
        t = (hand_r.z - 0.11) / (-dn.z) if dn.z < -0.25 else 0.9
        bot = hand_r + dn * t
        mid = (top + bot) / 2.0
        hb = MeshBuilder("Worker_Hoe")
        hb.beam(tuple(bot - mid), tuple(top - mid), 0.05, mat="wood")
        hb.box((0.24, 0.17, 0.055),
               (bot.x - mid.x + 0.02, bot.y - mid.y, bot.z - mid.z - 0.01),
               rotation=(0.0, math.atan2(dn.x, -dn.z), 0.0), mat="galvanized")
        _w_attach(coll, hb, "Worker_Hoe", arm_r_obj, arm_r_mat, tuple(mid))

    elif key == "plan":
        # 打开的图纸：一只手举在胸前看
        db = MeshBuilder("Worker_Drawing")
        db.box((0.02, 0.30, 0.40), (0.0, 0.0, 0.0), mat="wall_white")
        db.box((0.026, 0.075, 0.40), (0.0, 0.0, 0.0), mat="board_blue")
        _w_attach(coll, db, "Worker_Drawing", arm_r_obj, arm_r_mat,
                  tuple(hand_r + Vector((0.07, 0.0, 0.14))), (0.0, -0.45, 0.0))

    elif key == "cement":
        # 水泥袋：扛在右肩上
        bb = MeshBuilder("Worker_CementBag")
        bb.box((0.36, 0.26, 0.22), (0.0, 0.0, 0.0), mat="wall_white")
        bb.box((0.30, 0.02, 0.20), (0.0, 0.09, 0.0), mat="door_gray")
        _w_attach(coll, bb, "Worker_CementBag", body_obj, body_mat,
                  (0.04, -0.24, 1.56), (0.0, -0.06, 0.0))

    elif key == "tech":
        # 技术员：左手记事板 + 笔，腰带挂卷尺
        cb = MeshBuilder("Worker_Clipboard")
        cb.box((0.022, 0.26, 0.34), (0.0, 0.0, 0.0), mat="board_blue")
        cb.box((0.012, 0.21, 0.28), (0.02, 0.0, 0.0), mat="wall_white")
        cb.cylinder(0.012, 0.14, (0.03, 0.10, -0.13), mat="machine_dark", segments=6)
        _w_attach(coll, cb, "Worker_Clipboard", arm_l_obj, arm_l_mat,
                  tuple(hand_l + Vector((0.07, 0.0, 0.07))), (0.0, -0.30, 0.0))
        tb = MeshBuilder("Worker_Tape")
        tb.cylinder(0.055, 0.05, (0.0, 0.0, 0.0), mat="galvanized", segments=10)
        _w_attach(coll, tb, "Worker_Tape", body_obj, body_mat,
                  (0.07, -0.175, 0.995), (math.pi / 2.0, 0.0, 0.0))

    elif key == "foreman":
        # 包工头：一手图纸卷，腰带挂对讲机
        rb = MeshBuilder("Worker_Roll")
        rb.cylinder(0.05, 0.48, (0.0, 0.0, 0.0), mat="wall_white", segments=10)
        rb.cylinder(0.052, 0.02, (0.0, 0.0, 0.21), mat="board_blue", segments=10)
        _w_attach(coll, rb, "Worker_Roll", arm_r_obj, arm_r_mat,
                  tuple(hand_r + Vector((0.05, 0.0, 0.0))), (0.0, 0.16, 0.0))
        wb = MeshBuilder("Worker_Radio")
        wb.box((0.055, 0.075, 0.16), (0.0, 0.0, 0.0), mat="machine_dark")
        wb.cylinder(0.008, 0.09, (0.0, 0.0, 0.12), mat="cable_black", segments=6)
        wb.box((0.05, 0.02, 0.05), (0.036, 0.0, 0.02), mat="galvanized")
        _w_attach(coll, wb, "Worker_Radio", body_obj, body_mat, (0.10, -0.185, 0.99))

    return root


def build_worker(collection=None):
    """普通工人：反光背心 + 安全帽，双手自然下垂。"""
    return _w_build(collection, "Worker", "worker")


def build_worker_hoe(collection=None):
    """持镐（锄头）工人：双手握柄、刃口朝下。"""
    return _w_build(collection, "WorkerHoe", "hoe")


def build_worker_plan(collection=None):
    """看图工人：一手举着打开的图纸。"""
    return _w_build(collection, "WorkerPlan", "plan")


def build_worker_cement(collection=None):
    """搬水泥工人：肩扛水泥袋。"""
    return _w_build(collection, "WorkerCement", "cement")


def build_worker_tech(collection=None):
    """技术员：白/蓝安全帽、浅色衬衫（无背心）+ 小反光条、记事板与卷尺，身形略瘦。"""
    return _w_build(collection, "WorkerTech", "tech")


def build_worker_foreman(collection=None):
    """包工头：红安全帽、深色衬衫外罩反光背心、手持图纸卷、腰带挂对讲机，身形较宽。"""
    return _w_build(collection, "WorkerForeman", "foreman")


