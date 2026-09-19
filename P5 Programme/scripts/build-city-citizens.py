"""Blender --background --factory-startup --python scripts/build-city-citizens.py.
Derive compact CC0 Quaternius citizens. No source assets are changed.
"""
import bpy, pathlib, math
ROOT = pathlib.Path(__file__).resolve().parents[1]
CLIENT = ROOT / 'buddy-kit/client'
for gender in ['male', 'female']:
    bpy.ops.wm.read_factory_settings(use_empty=True)
    src = CLIENT / f'library/characters/quaternius-animchar-casual2-{gender}.glb'
    bpy.ops.import_scene.gltf(filepath=str(src))
    # Source has 17 clips; keep just two, without a separate animation download.
    for action in list(bpy.data.actions):
        if action.name not in ['Idle', 'Walk']:
            bpy.data.actions.remove(action, do_unlink=True)
    meshes = [o for o in bpy.context.scene.objects if o.type == 'MESH' and any(m.type == 'ARMATURE' for m in o.modifiers)]
    print('MESHES', [(o.name,len(o.data.polygons),len(o.data.materials)) for o in meshes])
    total = sum(sum(len(p.vertices)-2 for p in o.data.polygons) for o in meshes)
    for obj in meshes:
        bpy.context.view_layer.objects.active = obj
        obj.select_set(True)
        colors = obj.data.color_attributes.new(name='Color', type='FLOAT_COLOR', domain='CORNER')
        for poly in obj.data.polygons:
            mat = obj.data.materials[poly.material_index] if len(obj.data.materials)>poly.material_index else None
            principled = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if mat and mat.use_nodes else None
            rgba = principled.inputs['Base Color'].default_value[:] if principled else (mat.diffuse_color[:] if mat else (0.5,0.5,0.5,1))
            for li in poly.loop_indices: colors.data[li].color = rgba
        if total > 2800:
            mod = obj.modifiers.new('Tablet budget', 'DECIMATE')
            mod.ratio = 2750 / total
            bpy.ops.object.modifier_apply(modifier=mod.name)
        obj.select_set(False)
    # All colours travel as vertex attributes: one opaque material, no textures.
    material = bpy.data.materials.new('Citizen colours')
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Roughness'].default_value = .9
    bsdf.inputs['Metallic'].default_value = 0
    color = material.node_tree.nodes.new('ShaderNodeVertexColor')
    color.layer_name = 'Color'
    material.node_tree.links.new(color.outputs['Color'], bsdf.inputs['Base Color'])
    bpy.ops.object.select_all(action='DESELECT')
    for obj in meshes:
        obj.data.materials.clear(); obj.data.materials.append(material)
        for poly in obj.data.polygons: poly.material_index = 0
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.join()
    out = CLIENT / f'city-builder/assets/models/citizens/casual-{gender}.glb'
    bpy.ops.export_scene.gltf(filepath=str(out), export_format='GLB',
        export_animations=True, export_animation_mode='ACTIONS',
        export_force_sampling=True, export_frame_step=2,
        export_skins=True, export_morph=False, export_materials='EXPORT',
        export_yup=True, export_cameras=False, export_lights=False)
    print('CITIZEN', gender, out.stat().st_size)
# Quantize colour/weight/normal attributes after export, retaining portable GLB.
import runpy
runpy.run_path(str(ROOT / 'scripts/compact-city-glb.py'), run_name='__main__')
outputs = list((CLIENT / 'city-builder/assets/models/citizens').glob('*.glb'))
assert sum(p.stat().st_size for p in outputs) <= 500 * 1024
