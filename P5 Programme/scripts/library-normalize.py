#!/usr/bin/env python3
"""
library-normalize.py — headless Blender normalizer for the shared model library.

Converts an arbitrary source 3D file (FBX / OBJ / glTF / GLB / DAE / STL / PLY)
into a GLB that satisfies the library conventions:

  • GLB output, real-world metre units (optional --scale / --auto-scale)
  • base sits on y=0 (feet/floor at origin height), centred on X/Z
  • rigged FBX is flattened to a static bind-pose mesh
  • ≤ N materials (default 2) — extra materials merged to the nearest kept
    material by base colour; draw-call rule for low-end tablets
  • single merged mesh (all objects joined) with transforms applied

Usage (from P5 Programme/):
  /Applications/Blender.app/Contents/MacOS/Blender --background \
      --python scripts/library-normalize.py -- [options] input.ext output.glb

Options:
  --scale F             multiply all dimensions by F (default 1.0)
  --auto-scale F        fit the largest dimension to F metres
  --max-materials N     cap materials at N (default 2, 0 = keep all)
  --verbose             print per-step diagnostics
  --keep-origin         skip the ground/centre pass (raw placement)
"""
import sys
import os
import json
import math
import argparse
from collections import Counter

import bpy
from mathutils import Vector


def log(*a):
    print("[library-normalize]", *a, flush=True)


def pick_args():
    """Blender passes everything after `--` in sys.argv; ours come after the
    script path. Return the args AFTER the script path (or after the first `--`)."""
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = argv[1:]  # fallback: strip script name
    return argv


def parse_args(argv):
    p = argparse.ArgumentParser(description="Normalize a 3D model to library GLB.")
    p.add_argument('--scale', type=float, default=1.0)
    p.add_argument('--auto-scale', type=float, default=0.0)
    p.add_argument('--max-materials', type=int, default=2)
    p.add_argument('--rot-y', type=float, default=0.0,
                   help="rotate degrees around glTF Y (Blender Z) before grounding — "
                        "use 90 to put a vehicle's length along glTF Z")
    p.add_argument('--rot-x', type=float, default=0.0,
                   help="rotate degrees around Blender X before grounding (pitch)")
    p.add_argument('--rot-z', type=float, default=0.0,
                   help="rotate degrees around Blender Y before grounding (yaw, same as glTF Y)")
    p.add_argument('--verbose', action='store_true')
    p.add_argument('--keep-origin', action='store_true')
    p.add_argument('input')
    p.add_argument('output')
    return p.parse_args(argv)


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    # Drop the default cube/camera/light so imported objects are the only meshes.
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH' or obj.name == 'Cube':
            bpy.data.objects.remove(obj, do_unlink=True)


def import_file(path):
    ext = os.path.splitext(path)[1].lower()
    if ext == '.blend':
        bpy.ops.wm.open_mainfile(filepath=path)
    elif ext == '.fbx':
        bpy.ops.import_scene.fbx(filepath=path)
    elif ext == '.obj':
        try:
            bpy.ops.wm.obj_import(filepath=path)
        except Exception:
            bpy.ops.import_scene.obj(filepath=path)
    elif ext in ('.gltf', '.glb'):
        bpy.ops.import_scene.gltf(filepath=path)
    elif ext == '.dae':
        bpy.ops.wm.collada_import(filepath=path)
    elif ext == '.stl':
        bpy.ops.wm.stl_import(filepath=path)
    elif ext == '.ply':
        bpy.ops.wm.ply_import(filepath=path)
    else:
        raise RuntimeError(f"Unsupported extension: {ext}")


def flatten_armatures(verbose=False):
    """Apply armature modifiers at rest pose, then remove the armature objects."""
    armatures = [o for o in bpy.context.scene.objects if o.type == 'ARMATURE']
    for arm in armatures:
        for obj in list(bpy.context.scene.objects):
            if obj.type != 'MESH':
                continue
            for mod in list(obj.modifiers):
                if mod.type == 'ARMATURE':
                    if verbose:
                        log("applying armature modifier", mod.name, "on", obj.name)
                    bpy.context.view_layer.objects.active = obj
                    try:
                        bpy.ops.object.modifier_apply(modifier=mod.name)
                    except Exception as e:
                        if verbose:
                            log("modifier apply failed:", e)
        bpy.data.objects.remove(arm, do_unlink=True)
    # any remaining modifiers that depend on an armature are baked via export_apply


def drop_non_mesh(verbose=False):
    """Remove lights/cameras/empties/curves so only meshes remain."""
    for obj in list(bpy.context.scene.objects):
        if obj.type != 'MESH':
            if verbose:
                log("removing non-mesh", obj.type, obj.name)
            bpy.data.objects.remove(obj, do_unlink=True)


def material_color(mat):
    """Best-effort base colour for a material (Principled BSDF first)."""
    if mat is None:
        return Vector((0.8, 0.8, 0.8))
    try:
        if mat.use_nodes and mat.node_tree:
            for node in mat.node_tree.nodes:
                if node.type == 'BSDF_PRINCIPLED':
                    c = node.inputs.get('Base Color')
                    if c:
                        d = c.default_value
                        return Vector((d[0], d[1], d[2]))
    except Exception:
        pass
    return Vector((mat.diffuse_color.r, mat.diffuse_color.g, mat.diffuse_color.b))


def reduce_materials(obj, max_materials, verbose=False):
    mesh = obj.data
    mat_count = len(mesh.materials)
    if max_materials <= 0 or mat_count <= max_materials:
        return mat_count

    def slot_mat(i):
        """Blender >=4/5 Mesh.materials may return Material directly (not slots)."""
        m = mesh.materials[i]
        if hasattr(m, 'material'):
            return m.material if m.material else None
        return m

    usage = Counter(p.material_index for p in mesh.polygons)
    keep = [i for i, _ in usage.most_common(max_materials)]
    keep_colors = {i: material_color(slot_mat(i)) for i in keep}
    remap = {}
    for i in range(mat_count):
        if i in keep:
            remap[i] = i
        else:
            col = material_color(slot_mat(i))
            best = min(keep, key=lambda k: (keep_colors[k] - col).length_squared)
            remap[i] = best
    for poly in mesh.polygons:
        poly.material_index = remap[poly.material_index]
    used = sorted(set(p.material_index for p in mesh.polygons))
    mapping = {old: new for new, old in enumerate(used)}
    for poly in mesh.polygons:
        poly.material_index = mapping[poly.material_index]
    kept_mats = [slot_mat(i) for i in used]
    mesh.materials.clear()
    for m in kept_mats:
        mesh.materials.append(m)
    if verbose:
        log(f"materials reduced {mat_count} -> {len(kept_mats)}")
    return len(kept_mats)


def main():
    args = parse_args(pick_args())
    if not os.path.exists(args.input):
        log("input not found:", args.input)
        sys.exit(1)
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    reset_scene()
    import_file(args.input)
    if args.verbose:
        log("imported:", args.input)

    flatten_armatures(args.verbose)
    drop_non_mesh(args.verbose)

    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH']
    if not meshes:
        log("no meshes after import — nothing to export")
        sys.exit(1)

    # scale all objects before joining
    if args.scale != 1.0:
        for o in meshes:
            o.scale *= args.scale
        if args.verbose:
            log("scaled by", args.scale)

    # join all meshes into one
    if len(meshes) > 1:
        bpy.ops.object.select_all(action='DESELECT')
        for o in meshes:
            o.select_set(True)
        bpy.context.view_layer.objects.active = meshes[0]
        try:
            bpy.ops.object.join()
        except Exception as e:
            log("join failed (exporting as-is):", e)
    obj = [o for o in bpy.context.scene.objects if o.type == 'MESH'][0]
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    if args.auto_scale > 0:
        dims = obj.dimensions
        largest = max(dims.x, dims.y, dims.z) or 1.0
        s = args.auto_scale / largest
        obj.scale *= s
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if args.verbose:
            log("auto-scaled to", args.auto_scale, "m (factor", round(s, 4), ")")

    # optional rotations before grounding (Blender axes; see --rot-* help)
    if args.rot_z:
        obj.rotation_euler.y += math.radians(args.rot_z)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if args.rot_y:
        obj.rotation_euler.z += math.radians(args.rot_y)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if args.rot_x:
        obj.rotation_euler.x += math.radians(args.rot_x)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)

    # ground + centre (skip with --keep-origin)
    # Blender is Z-up; glTF export is Y-up. "Ground" = Blender Z (min.z),
    # "centre on X/Z" (glTF XZ plane) = Blender X/Y.
    if not args.keep_origin:
        bb = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
        minx = min(v.x for v in bb); maxx = max(v.x for v in bb)
        miny = min(v.y for v in bb); maxy = max(v.y for v in bb)
        minz = min(v.z for v in bb); maxz = max(v.z for v in bb)
        obj.location.x -= (minx + maxx) / 2
        obj.location.y -= (miny + maxy) / 2
        obj.location.z -= minz
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if args.verbose:
            log(f"grounded z=0 (y=0 in glTF); centred X/Y. size {round(maxx-minx,3)} x {round(maxy-miny,3)} x {round(maxz-minz,3)} m")

    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj

    nmats = reduce_materials(obj, args.max_materials, args.verbose)

    # mesh cleanup
    bpy.ops.object.mode_set(mode='EDIT')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.mesh.normals_make_consistent(inside=False)
    bpy.ops.mesh.delete_loose()
    bpy.ops.object.mode_set(mode='OBJECT')

    # final dims after cleanup
    bb = [obj.matrix_world @ Vector(v) for v in obj.bound_box]
    dims = [round(max(v[i] for v in bb) - min(v[i] for v in bb), 3) for i in range(3)]
    nverts = sum((len(p.vertices) for p in obj.data.polygons)) // 3 if obj.data.polygons else 0

    bpy.ops.export_scene.gltf(
        filepath=args.output,
        export_format='GLB',
        use_selection=True,
        export_yup=True,
        export_apply=True,
    )
    if args.verbose:
        log("exported:", args.output)
    print("RESULT " + json.dumps({
        "input": os.path.basename(args.input),
        "output": os.path.basename(args.output),
        "dims_w_h_d": dims,
        "materials": nmats,
        "triangles": nverts,
    }))
    sys.exit(0)


if __name__ == '__main__':
    main()
