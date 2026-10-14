# -*- coding: utf-8 -*-
"""模型预览渲染，给每个模型渲一张 3/4 视角图，方便看造型和配色。

用法：blender --background --factory-startup --python render_preview.py [-- 模型名...]
"""

import os
import sys
import math

sys.path.append(os.path.dirname(os.path.abspath(__file__)))

import bpy
from mathutils import Vector

import config as C
from utils import reset_scene, get_collection
from build_models import MODELS

PREVIEW_DIR = os.path.join(C.ROOT_DIR, "output", "preview")
SAMPLES = 32
RES = (900, 640)


def scene_bounds():
    """算场景里所有网格物体的包围盒。"""
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            for i in range(3):
                lo[i] = min(lo[i], world[i])
                hi[i] = max(hi[i], world[i])
    return lo, hi


def setup_camera(lo, hi):
    """按包围球自动取景。取水平/竖直里小的视场角算距离，细长模型才不会被切。"""
    center = (lo + hi) / 2.0
    radius = (hi - lo).length / 2.0
    if radius < 1e-3:
        radius = 1.0

    scene = bpy.context.scene
    aspect = scene.render.resolution_y / float(scene.render.resolution_x)

    cam_data = bpy.data.cameras.new("PreviewCam")
    cam_data.lens = 50.0
    cam = bpy.data.objects.new("PreviewCam", cam_data)
    scene.collection.objects.link(cam)

    sensor = cam_data.sensor_width
    half_h = math.atan((sensor / 2.0) / cam_data.lens)
    half_v = math.atan((sensor * aspect / 2.0) / cam_data.lens)
    dist = radius / math.sin(min(half_h, half_v)) * 1.15      # 1.15 是留白系数

    # 3/4 视角；板房门窗、脚手架安全网都做在 +Y 一侧，是模型正面
    direction = Vector((1.0, 1.15, 0.72)).normalized()
    cam.location = center + direction * dist
    look = (center - cam.location).normalized()
    cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()

    scene.camera = cam
    return cam


def setup_light_and_world():
    sun_data = bpy.data.lights.new("Sun", type="SUN")
    sun_data.energy = 4.0
    sun_data.angle = math.radians(6.0)
    sun = bpy.data.objects.new("Sun", sun_data)
    # 光从和相机同侧打过来，模型正面才不会全在阴影里
    sun.rotation_euler = (math.radians(50), 0, math.radians(145))
    bpy.context.scene.collection.objects.link(sun)

    world = bpy.data.worlds.new("PreviewWorld")
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.62, 0.66, 0.72, 1.0)
    bg.inputs[1].default_value = 1.0
    bpy.context.scene.world = world


def setup_render():
    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = SAMPLES
    scene.cycles.use_denoising = True
    scene.render.resolution_x, scene.render.resolution_y = RES
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.view_settings.view_transform = "Standard"


def render_one(name, builder):
    reset_scene()
    builder(get_collection(name))

    setup_render()                     # 先定分辨率，相机才能按画幅算取景距离
    lo, hi = scene_bounds()
    setup_camera(lo, hi)
    setup_light_and_world()

    out = os.path.join(PREVIEW_DIR, name + ".png")
    bpy.context.scene.render.filepath = out
    bpy.ops.render.render(write_still=True)
    return out


def main():
    if not os.path.isdir(PREVIEW_DIR):
        os.makedirs(PREVIEW_DIR)

    if "--" in sys.argv:
        targets = sys.argv[sys.argv.index("--") + 1:]
    else:
        targets = [name for name, _ in MODELS]

    for name, builder in MODELS:
        if name not in targets:
            continue
        try:
            out = render_one(name, builder)
            print("[预览] %-16s -> %s" % (name, out))
        except Exception as exc:                        # noqa: BLE001
            print("[预览失败] %-16s %s" % (name, exc))


if __name__ == "__main__":
    main()
