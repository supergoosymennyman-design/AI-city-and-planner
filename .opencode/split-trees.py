# split_trees.py — Split the Quaternius "Trees" pack into 5 individual tree GLBs,
# recolored to match the city game's dark neon-green aesthetic.
# Run: blender -b -P split_trees.py
import bpy, os

SRC = '/tmp/opencode/final/trees.glb'
OUT = '/tmp/opencode/trees_out'
os.makedirs(OUT, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

def recolor(material_name, color):
    m = bpy.data.materials.get(material_name)
    if not m or not m.node_tree: return
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf:
        bsdf.inputs['Base Color'].default_value = (*color, 1.0)

# Game palette: dark green foliage, brownish trunks
recolor('NormalTree_Leaves', (0.13, 0.42, 0.20))   # dark green leaves
recolor('NormalTree_Bark', (0.30, 0.22, 0.13))      # brown trunk

# Split: export each tree separately
for i in range(1, 6):
    name = f'NormalTree_{i}'
    obj = bpy.data.objects.get(name)
    if not obj: continue
    # isolate: select only this tree's meshes
    bpy.ops.object.select_all(action='DESELECT')
    def select_tree(o):
        if o.type == 'MESH' and (o.name == name or o.name.startswith(name)):
            o.select_set(True)
        for c in o.children: select_tree(c)
    select_tree(obj)
    # export selection
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f'tree{i}.glb'),
        use_selection=True,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
    )
    print('EXPORTED tree' + str(i))

print('ALL DONE')
