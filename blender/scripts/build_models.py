# -*- coding: utf-8 -*-
"""模型批量生成入口。"""

import os
import sys
import time

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import bpy

import config as C
from utils import reset_scene, get_collection, export_glb, save_blend, count_mesh_stats
import parts_structure as PS
import parts_facility as PF
import parts_machine as PM


# 导出名 -> 生成函数
MODELS = [
    ("tower_crane",    PS.build_tower_crane),
    ("hoist",          PS.build_hoist),
    ("scaffolding",    PS.build_scaffolding),
    ("building_frame", PS.build_building_frame),
    ("building_frame_tall", PS.build_building_frame_tall),
    ("building_frame_plus", PS.build_building_frame_plus),
    ("prefab_house",   PF.build_prefab_house),
    ("labor_camp",     PF.build_labor_camp),
    ("camp_basin",     PF.build_camp_basin),
    ("camp_gate",      PF.build_camp_gate),
    ("site_gate",      PF.build_site_gate),
    ("fence",          PF.build_fence),
    ("material_yard",  PF.build_material_yard),
    ("warehouse",      PF.build_warehouse),
    ("site_office",    PF.build_site_office),
    ("rest_shed",      PF.build_rest_shed),
    ("worker",         PF.build_worker),
    ("worker_hoe",     PF.build_worker_hoe),
    ("worker_plan",    PF.build_worker_plan),
    ("worker_cement",  PF.build_worker_cement),
    ("worker_tech",    PF.build_worker_tech),
    ("worker_foreman", PF.build_worker_foreman),
    ("site_ground",    PF.build_site_ground),
    ("dirt_pile",      PF.build_dirt_pile),
    ("pit",            PF.build_pit),
    ("pit_materials",  PF.build_pit_materials),
    ("green_belt",     PF.build_green_belt),
    ("lamp_post",      PM.build_lamp_post),
    ("excavator",      PM.build_excavator),
    ("dump_truck",     PM.build_dump_truck),
    ("mixer_truck",    PM.build_mixer_truck),
]


def ensure_dirs():
    for d in (C.GLB_DIR, C.BLEND_DIR):
        if not os.path.isdir(d):
            os.makedirs(d)


def parse_args():
    """读 -- 后面的模型名，不传就全量生成。"""
    if "--" not in sys.argv:
        return [name for name, _ in MODELS]
    picked = sys.argv[sys.argv.index("--") + 1:]
    if not picked:
        return [name for name, _ in MODELS]
    valid = {name for name, _ in MODELS}
    unknown = [n for n in picked if n not in valid]
    if unknown:
        print("[warn] 未知模型名，已忽略: %s" % ", ".join(unknown))
        print("[warn] 可用模型: %s" % ", ".join(sorted(valid)))
    return [n for n in picked if n in valid]


def build_one(name, builder):
    reset_scene()
    coll = get_collection(name)
    builder(coll)

    verts, faces = count_mesh_stats()

    glb_path = os.path.join(C.GLB_DIR, name + ".glb")
    export_glb(glb_path)
    blend_path = os.path.join(C.BLEND_DIR, name + ".blend")
    save_blend(blend_path)

    size_kb = os.path.getsize(glb_path) / 1024.0
    return verts, faces, size_kb


def main():
    ensure_dirs()
    targets = parse_args()

    print("=" * 62)
    print("建筑工地模型生成  |  共 %d 个模型" % len(targets))
    print("=" * 62)

    summary = []
    total_v = total_f = 0
    t0 = time.time()

    for name, builder in MODELS:
        if name not in targets:
            continue
        try:
            verts, faces, size_kb = build_one(name, builder)
        except Exception as exc:
            print("[失败] %-16s %s" % (name, exc))
            import traceback
            traceback.print_exc()
            continue

        total_v += verts
        total_f += faces
        summary.append((name, verts, faces, size_kb))
        print("[完成] %-16s 顶点 %6d  面 %6d  GLB %7.1f KB" % (name, verts, faces, size_kb))

    print("-" * 62)
    print("合计：顶点 %d  面 %d  耗时 %.1f 秒" % (total_v, total_f, time.time() - t0))
    print("输出目录：%s" % C.ROOT_DIR)


if __name__ == "__main__":
    main()
