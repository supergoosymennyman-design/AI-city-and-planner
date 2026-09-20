"""
library-normalize.py — Blender pipeline for the shared 3D model library.

Turns a raw imported model (FBX/OBJ/GLB) into a library-ready GLB:
  - applies transforms (location/rotation/scale)
  - joins meshes by material (so a model has ≤ one mesh per material)
  - optional decimation
  - re-centres X/Z and sits the base on y=0
  - sets the object origin to the world origin
  - exports GLB (glTF 2.0 addon required, enabled by default)

Run inside Blender — via the Blender MCP (paste into execute_blender_code) or
in the Text Editor with the imported model selected. Examples:
    normalize(0.0, '/path/to/library/buildings/kenney-house-a.glb')
    normalize(0.25, '/path/out.glb')   # 25% triangles after decimation
"""

import bpy
import mathutils


def _mesh_objs():
    obs = [o for o in bpy.context.selected_objects if o.type == 'MESH']
    if not obs:
        obs = [o for o in bpy.data.objects if o.type == 'MESH' and not o.hide_viewport]
    return obs


def normalize(decimate_ratio=0.0, target_path=None):
    scene = bpy.context.scene
    obs = _mesh_objs()
    if not obs:
        print('[library-normalize] no mesh objects found')
        return False

    # 0. Bake parent (root-empty) transforms into children FIRST — otherwise
    #    deleting the root silently reverts child meshes to their un-scaled size
    #    (Sketchfab imports scale the root, not the meshes).
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.parent_clear(type='CLEAR_KEEP_TRANSFORM')
    for o in list(bpy.data.objects):
        if o.type != 'MESH':
            bpy.data.objects.remove(o, do_unlink=True)

    # 1. Apply transforms so geometry is in real world units.
    bpy.ops.object.select_all(action='DESELECT')
    for o in obs:
        o.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # 2. Join meshes sharing the same material (keep ≤ one mesh per material).
    groups = {}
    for o in bpy.data.objects:
        if o.type != 'MESH' or o not in obs:
            continue
        key = o.active_material.name if o.active_material else '__none__'
        groups.setdefault(key, []).append(o)

    results = []
    for key, members in groups.items():
        if not members:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in members:
            o.select_set(True)
        bpy.context.view_layer.objects.active = members[0]
        bpy.ops.object.join()
        joined = bpy.context.active_object
        if decimate_ratio > 0:
            mod = joined.modifiers.new('libdec', 'DECIMATE')
            mod.ratio = decimate_ratio
            bpy.ops.object.modifier_apply(modifier='libdec')
        results.append(joined)

    # 3. Normalize placement: centre X/Z, base on y=0, origin at world origin.
    for o in results:
        bbox = [o.matrix_world @ mathutils.Vector(v) for v in o.bound_box]
        xs = [v.x for v in bbox]; ys = [v.y for v in bbox]; zs = [v.z for v in bbox]
        cx = (min(xs) + max(xs)) / 2
        cz = (min(zs) + max(zs)) / 2
        min_y = min(ys)

        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True)
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.transform.translate(value=(-cx, 0, -cz))
        bpy.ops.transform.translate(value=(0, -min_y, 0))
        bpy.ops.object.mode_set(mode='OBJECT')
        bpy.context.scene.cursor.location = (0, 0, 0)
        bpy.ops.object.origin_set(type='ORIGIN_CURSOR')

    # 4. Export GLB.
    if target_path:
        bpy.ops.object.select_all(action='DESELECT')
        for o in results:
            o.select_set(True)
        bpy.ops.export_scene.gltf(
            filepath=target_path,
            export_format='GLB',
            use_selection=True,
        )
        print(f'[library-normalize] exported {target_path}')
    return True


if __name__ == '__main__':
    # Example invocation from a script runner:
    #   normalize(0.0, '/abs/path/to/out.glb')
    normalize(0.0, '/tmp/library-out.glb')
