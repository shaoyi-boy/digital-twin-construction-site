# -*- coding: utf-8 -*-
"""建模工具集：MeshBuilder 把大量基础体拼成一个网格，减少前端 draw call。
全程走 bmesh、不用 bpy.ops，所以后台无界面模式也能跑。
"""

import bpy
import bmesh
import math
from mathutils import Vector, Euler, Matrix

from materials import get_material
import config


# 场景管理
def reset_scene():
    """清空场景，方便一个个模型独立生成。"""
    bpy.ops.wm.read_factory_settings(use_empty=True)


def get_collection(name="Site"):
    """取或新建集合，按模型分组。"""
    if name in bpy.data.collections:
        return bpy.data.collections[name]
    coll = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(coll)
    return coll


# bmesh 基础体
def _create_cone(bm, segments, radius1, radius2, depth):
    """不同 Blender 版本圆锥参数名不一样，兼容一下。"""
    try:
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segments,
            radius1=radius1, radius2=radius2, depth=depth,
        )
    except TypeError:
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=segments,
            diameter1=radius1 * 2, diameter2=radius2 * 2, depth=depth,
        )


def _mat4(location=(0, 0, 0), rotation=(0, 0, 0), quat=None):
    """构造变换矩阵：先旋转再平移。"""
    if quat is None:
        quat = Euler(rotation, "XYZ").to_quaternion()
    m = quat.to_matrix().to_4x4()
    m.translation = Vector(location)
    return m


# 网格拼装器
class MeshBuilder(object):
    """把大量基础体拼成一个网格，按材质分槽。"""

    def __init__(self, name):
        self.name = name
        self.bm = bmesh.new()
        self.materials = []          # 材质槽顺序
        self._mat_index = {}         # 材质名 -> 槽位
        self._face_cursor = 0        # 已合并面数，给新面标材质

    def _slot(self, mat_name):
        if mat_name not in self._mat_index:
            self._mat_index[mat_name] = len(self.materials)
            self.materials.append(mat_name)
        return self._mat_index[mat_name]

    def _merge(self, tmp_bm, mat_name):
        """把临时网格并进主网格，记下这批面用哪个材质槽。"""
        idx = self._slot(mat_name)
        count = len(tmp_bm.faces)

        tmp_mesh = bpy.data.meshes.new("_tmp")
        tmp_bm.to_mesh(tmp_mesh)
        tmp_bm.free()
        self.bm.from_mesh(tmp_mesh)
        bpy.data.meshes.remove(tmp_mesh)

        self.bm.faces.ensure_lookup_table()
        for i in range(self._face_cursor, self._face_cursor + count):
            self.bm.faces[i].material_index = idx
        self._face_cursor += count

    def box(self, size, location=(0, 0, 0), rotation=(0, 0, 0), mat="concrete"):
        """长方体。size = (x, y, z) 实际尺寸。"""
        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=Vector(size), verts=tmp.verts)
        bmesh.ops.transform(tmp, matrix=_mat4(location, rotation), verts=tmp.verts)
        self._merge(tmp, mat)

    def beam(self, start, end, width, mat="steel_gray", depth=None):
        """两点之间连一根方杆，桁架、支撑、栏杆常用。"""
        start, end = Vector(start), Vector(end)
        vec = end - start
        length = vec.length
        if length < 1e-6:
            return
        depth = depth if depth else width

        tmp = bmesh.new()
        bmesh.ops.create_cube(tmp, size=1.0)
        bmesh.ops.scale(tmp, vec=Vector((width, depth, length)), verts=tmp.verts)
        quat = vec.to_track_quat("Z", "Y")
        bmesh.ops.transform(
            tmp, matrix=_mat4((start + end) / 2.0, quat=quat), verts=tmp.verts
        )
        self._merge(tmp, mat)

    def cylinder(self, radius, depth, location=(0, 0, 0), rotation=(0, 0, 0),
                 mat="steel_gray", segments=None):
        """圆柱 / 钢管 / 钢丝绳。"""
        segments = segments or config.SEGMENTS
        tmp = bmesh.new()
        _create_cone(tmp, segments, radius, radius, depth)
        bmesh.ops.transform(tmp, matrix=_mat4(location, rotation), verts=tmp.verts)
        self._merge(tmp, mat)

    def cone(self, radius_bottom, radius_top, depth, location=(0, 0, 0),
             rotation=(0, 0, 0), mat="sand", segments=None):
        """圆锥，砂石料堆、塔帽用。"""
        segments = segments or config.SEGMENTS
        tmp = bmesh.new()
        _create_cone(tmp, segments, radius_bottom, radius_top, depth)
        bmesh.ops.transform(tmp, matrix=_mat4(location, rotation), verts=tmp.verts)
        self._merge(tmp, mat)

    def sphere(self, radius, location=(0, 0, 0), rotation=(0, 0, 0), mat="sand",
               subdiv=1, scale=(1.0, 1.0, 1.0)):
        """低模球，树冠、灌木用；scale 能压扁。"""
        tmp = bmesh.new()
        try:
            bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, radius=radius)
        except TypeError:
            bmesh.ops.create_icosphere(tmp, subdivisions=subdiv, diameter=radius * 2)
        if tuple(scale) != (1.0, 1.0, 1.0):
            bmesh.ops.scale(tmp, vec=Vector(scale), verts=tmp.verts)
        bmesh.ops.transform(tmp, matrix=_mat4(location, rotation), verts=tmp.verts)
        self._merge(tmp, mat)

    def build(self, collection=None):
        mesh = bpy.data.meshes.new(self.name)
        self.bm.normal_update()
        self.bm.to_mesh(mesh)
        self.bm.free()

        for mat_name in self.materials:
            mesh.materials.append(get_material(mat_name))

        if config.FLAT_SHADING:
            for poly in mesh.polygons:
                poly.use_smooth = False

        obj = bpy.data.objects.new(self.name, mesh)
        target = collection or bpy.context.scene.collection
        target.objects.link(obj)
        return obj


# 导出
def export_glb(filepath, **overrides):
    """导出 GLB。先滤掉当前版本不认识的参数，免得报错。"""
    valid = set(bpy.types.EXPORT_SCENE_OT_gltf.bl_rna.properties.keys())

    kwargs = {
        "filepath": filepath,
        "export_format": "GLB",
        "use_selection": False,
        "export_apply": True,          # 应用修改器
        "export_yup": True,            # Z-up 转 Y-up，符合 three.js 习惯
        "export_materials": "EXPORT",
        "export_cameras": False,
        "export_lights": False,
        "export_draco_mesh_compression_enable": config.EXPORT_DRACO,
    }
    kwargs.update(overrides)
    kwargs = {k: v for k, v in kwargs.items() if k == "filepath" or k in valid}

    bpy.ops.export_scene.gltf(**kwargs)
    return filepath


def save_blend(filepath):
    bpy.ops.wm.save_as_mainfile(filepath=filepath, check_existing=False)
    return filepath


def parent_to(child, parent):
    """挂到父节点下，location / rotation 变成相对父级的局部变换。
    关节动画靠这个分层导出，前端直接转对应的节点就行。
    """
    child.parent = parent
    child.matrix_parent_inverse = Matrix.Identity(4)
    return child


def make_object(builder, name, collection, location=(0, 0, 0), rotation=(0, 0, 0)):
    """用 MeshBuilder 造个命名部件。"""
    obj = builder.build(collection)
    obj.name = name
    if obj.data is not None:
        obj.data.name = name
    obj.location = Vector(location)
    obj.rotation_euler = Euler(rotation, "XYZ")
    return obj


def count_mesh_stats():
    """统计场景里的顶点数 / 面数。"""
    verts = 0
    faces = 0
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        verts += len(obj.data.vertices)
        faces += len(obj.data.polygons)
    return verts, faces
