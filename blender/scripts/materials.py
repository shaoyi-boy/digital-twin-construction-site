# -*- coding: utf-8 -*-
"""低模材质库，颜色统一放这。填的是 sRGB，写入前要转成线性色。"""

import bpy

# 材质名 -> sRGB 颜色 (0~1)
PALETTE = {
    # 混凝土 / 结构
    "concrete":      (0.78, 0.78, 0.75),
    "concrete_dark": (0.58, 0.58, 0.56),
    "brick":         (0.70, 0.36, 0.28),

    # 钢材
    "steel_yellow":  (0.93, 0.68, 0.12),   # 塔吊标准色
    "steel_gray":    (0.56, 0.58, 0.61),   # 脚手架 / 钢管
    "steel_blue":    (0.20, 0.42, 0.70),   # 升降机 / 设备
    "rebar":         (0.45, 0.40, 0.35),   # 钢筋
    "paint_red":     (0.78, 0.24, 0.18),   # 警示漆

    # 房屋
    "wall_white":    (0.90, 0.90, 0.87),   # 板房墙板
    "roof_blue":     (0.24, 0.40, 0.62),   # 板房顶
    "glass":         (0.60, 0.76, 0.84),
    "door_gray":     (0.42, 0.45, 0.48),

    # 围挡
    "fence_green":   (0.16, 0.48, 0.36),
    "fence_blue":    (0.22, 0.38, 0.62),

    # 材料堆场
    "sand":          (0.82, 0.74, 0.56),
    "gravel":        (0.55, 0.53, 0.50),
    "wood":          (0.72, 0.55, 0.34),
    "pipe_steel":    (0.50, 0.52, 0.55),

    # 场地
    "asphalt":       (0.28, 0.28, 0.30),
    "dirt":          (0.55, 0.46, 0.37),
    "dirt_dark":     (0.40, 0.32, 0.25),   # 基坑壁 / 新挖土
    "soil_dry":      (0.64, 0.55, 0.42),   # 土堆顶面干土 / 土块
    "grass":         (0.36, 0.52, 0.28),
    "water":         (0.26, 0.50, 0.60),
    "safety_green":  (0.20, 0.70, 0.42),   # 安全网

    # 绿化
    "tree_trunk":    (0.38, 0.28, 0.20),   # 树干
    "leaf_deep":     (0.18, 0.40, 0.20),   # 深色叶
    "leaf_mid":      (0.30, 0.54, 0.26),   # 主叶色
    "leaf_light":    (0.46, 0.66, 0.32),   # 浅色叶（受光面）
    "hedge":         (0.22, 0.44, 0.22),   # 修剪绿篱
    "flower_red":    (0.82, 0.36, 0.36),   # 花境
    "flower_gold":   (0.90, 0.74, 0.28),
    "soil":          (0.42, 0.33, 0.24),   # 树池种植土

    # 细节
    "galvanized":    (0.74, 0.76, 0.78),   # 镀锌件 / 爬梯 / 栏杆
    "hazard_yellow": (0.92, 0.76, 0.12),   # 黄黑警示
    "cable_black":   (0.13, 0.13, 0.15),   # 电缆 / 钢丝绳
    "tarp_green":    (0.30, 0.46, 0.34),   # 材料篷布
    "tarp_blue":     (0.24, 0.34, 0.54),   # 材料篷布（蓝）
    "net_green":     (0.14, 0.44, 0.28),   # 密目安全网 / 洞口防护网
    "line_white":    (0.92, 0.92, 0.87),   # 场地标线
    "board_blue":    (0.14, 0.34, 0.62),   # 标识牌底板
    "lamp_white":    (0.98, 0.96, 0.86),   # 照明灯具（自发光）
    "lamp_red":      (0.86, 0.16, 0.12),   # 警示灯（自发光）

    # 工程机械
    "machine_yellow": (0.93, 0.68, 0.10),  # 挖掘机 / 翻斗车车身
    "machine_dark":   (0.26, 0.27, 0.29),  # 履带 / 底盘 / 轮胎
    "machine_orange": (0.88, 0.45, 0.12),  # 铲斗 / 车厢

    # 室内
    "stone":          (0.80, 0.81, 0.83),  # 楼梯石材踏步
    "rail_black":     (0.10, 0.11, 0.13),  # 黑色金属栏杆 / 扶手

    # 新浇筑楼层，颜色更浅更暖，用来区分施工进度
    "concrete_new":   (0.88, 0.86, 0.81),
}

# 半透明材质：安全网、玻璃幕墙要能透出后面的杆件
MATERIAL_ALPHA = {
    "safety_green": 0.40,
    "net_green": 0.55,
    "glass": 0.35,
}

# 自发光材质：颜色 + 强度，导出后带 emissive，夜里也看得见灯
MATERIAL_EMISSIVE = {
    "lamp_white": (0.95, 0.92, 0.80, 1.0, 1.2),
    "lamp_red":   (0.90, 0.16, 0.12, 1.0, 1.6),
}


def _srgb_to_linear(c):
    """sRGB 转线性色。"""
    if c <= 0.04045:
        return c / 12.92
    return ((c + 0.055) / 1.055) ** 2.4


def get_material(name):
    """按名字取材质，没有就按调色板新建。"""
    if name in bpy.data.materials:
        return bpy.data.materials[name]

    rgb = PALETTE.get(name, (0.7, 0.7, 0.7))
    alpha = MATERIAL_ALPHA.get(name, 1.0)
    linear = tuple(_srgb_to_linear(c) for c in rgb) + (1.0,)

    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = next(n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = linear
    bsdf.inputs["Roughness"].default_value = 0.85
    bsdf.inputs["Metallic"].default_value = 0.0

    # 自发光：4.x 里输入名是 Emission Color / Emission Strength
    if name in MATERIAL_EMISSIVE:
        e_rgba = MATERIAL_EMISSIVE[name]
        e_color = tuple(_srgb_to_linear(c) for c in e_rgba[:3]) + (e_rgba[3],)
        e_strength = e_rgba[4]
        for key in ("Emission Color", "Emission"):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = e_color
                break
        if "Emission Strength" in bsdf.inputs:
            bsdf.inputs["Emission Strength"].default_value = e_strength

    if alpha < 1.0:
        bsdf.inputs["Alpha"].default_value = alpha
        # 4.2 后换 surface_render_method，旧版是 blend_method，两个都设一遍
        if hasattr(mat, "surface_render_method"):
            mat.surface_render_method = "BLENDED"
        if hasattr(mat, "blend_method"):
            mat.blend_method = "BLEND"
        mat.use_backface_culling = False

    # 顺手设一下视口显示色，方便预览
    mat.diffuse_color = linear[:3] + (alpha,)
    return mat
