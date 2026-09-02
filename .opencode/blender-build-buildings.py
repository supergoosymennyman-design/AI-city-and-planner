# build_buildings.py — Create clean low-poly GLB models for AI City Architect 3D.
# Run headless: blender -b -P build_buildings.py
# Output: games/primary/p3-18-3d-city/assets/models/bldg_<type>.glb
#
# Design contract (matches the game's procedural scale):
#   - buildings are ~1–2 units tall on a 4-unit tile (champion is 1.8)
#   - origin at the tile centre, y=0 at ground level
#   - system accent colour baked into materials (matches SYS_COLOR)
#   - animated parts keep node names the game looks for:
#       * blades   (wind turbine rotor group)
#       * siren    (emergency station pulsing light)
#       * eye      (AI auditor glowing eye)
#       * pulse    (water tower tank glow)
import bpy, os, math

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'games', 'primary', 'p3-18-3d-city', 'assets', 'models')
os.makedirs(OUT, exist_ok=True)

# System colours from city-logic.js SYS_COLOR
COL = {
    'power':   (1.00, 0.82, 0.40),   # 0xffd166
    'water':   (0.00, 0.72, 1.00),   # 0x00b7ff
    'transport': (0.24, 0.86, 0.52), # 0x3ddc84
    'health':  (1.00, 0.36, 0.48),   # 0xff5c7a
    'waste':   (0.78, 0.48, 1.00),   # 0xc77bff
    'safety':  (1.00, 0.55, 0.18),   # 0xff8c2e
}
DARK = (0.13, 0.19, 0.27)            # 0x223046
WHITE = (0.95, 0.96, 0.98)
PANEL = (0.10, 0.23, 0.43)           # 0x1a3a6e

def mat(name, color, emissive=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*color, 1.0)
    bsdf.inputs['Roughness'].default_value = 0.5
    if emissive:
        bsdf.inputs['Emission Color'].default_value = (*emissive, 1.0)
        bsdf.inputs['Emission Strength'].default_value = strength
    return m

def add(name, mat_ref):
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.context.scene.objects:
        o.select_set(o.name == name)
    if bpy.context.selected_objects:
        bpy.ops.object.delete()
    return None

def cube(name, size, pos, mat_ref, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cube_add(size=1, location=pos)
    o = bpy.context.active_object
    o.name = name
    o.scale = size
    o.rotation_euler = rot
    o.data.materials.append(mat_ref)
    return o

def cyl(name, radius, height, pos, mat_ref, verts=16, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=radius, depth=height, vertices=verts, location=pos)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = (rot[0], rot[1], rot[2])
    o.data.materials.append(mat_ref)
    return o

def sph(name, radius, pos, mat_ref, scale=(1,1,1)):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=radius, location=pos)
    o = bpy.context.active_object
    o.name = name
    o.scale = scale
    o.data.materials.append(mat_ref)
    return o

def cone(name, radius, height, pos, mat_ref, verts=8, rot=(0,0,0)):
    bpy.ops.mesh.primitive_cone_add(radius1=radius, depth=height, vertices=verts, location=pos)
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = rot
    o.data.materials.append(mat_ref)
    return o

def new_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)

def export(name):
    # only export visible meshes; join animated parts stay separate (names preserved)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(
        filepath=os.path.join(OUT, f'bldg_{name}.glb'),
        use_selection=False,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
    )
    print('EXPORTED', name)

# ============ WIND TURBINE ============
def build_wind():
    new_scene()
    accent = mat('wind_accent', COL['power'], COL['power'], 0.35)
    dark = mat('wind_dark', DARK)
    blade_m = mat('wind_blade', (0.91, 0.93, 0.97), (0.53, 0.80, 1.0), 0.3)
    pole = cyl('Pole', 0.06, 2.4, (0, 0, 1.2), dark, verts=8)
    cyl('PoleBase', 0.14, 0.15, (0, 0, 0.075), dark, verts=8)
    sph('Hub', 0.12, (0, 0, 2.4), accent)
    # rotor group: an Empty at hub height; blades fan around the Z axis (vertical)
    bpy.ops.object.empty_add(type='PLAIN_AXES', location=(0, 0, 2.4))
    rotor = bpy.context.active_object
    rotor.name = 'blades'
    bpy.ops.object.select_all(action='DESELECT')
    for i in range(3):
        # create blade centered on origin, then shift vertices so origin is at hub end,
        # and rotate the object around Z (origin sits at the rotor, so it fans correctly)
        bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, 0))
        b = bpy.context.active_object
        b.name = f'Blade{i}'
        b.scale = (1.1, 0.06, 0.02)
        b.rotation_euler = (0, 0, i * 2 * math.pi / 3)
        # move vertices along local X so the blade extends outward from the hub
        mesh = b.data
        for v in mesh.vertices:
            v.co.x += 0.6
        b.data.materials.append(blade_m)
        b.parent = rotor
    export('wind')

# ============ WATER TOWER ============
def build_water():
    new_scene()
    accent = mat('wt_accent', COL['water'], COL['water'], 0.35)
    dark = mat('wt_dark', DARK)
    for (x, z) in [(-0.3, -0.3), (0.3, -0.3), (-0.3, 0.3), (0.3, 0.3)]:
        cyl('Leg', 0.06, 1.0, (x, z, 0.5), dark, verts=6)
    tank = cyl('Tank', 0.55, 1.1, (0, 0, 1.35), accent, verts=16)
    tank.name = 'pulse'  # game looks for node named 'pulse' for glow
    sph('Dome', 0.55, (0, 0, 1.95), accent, scale=(1, 1, 0.6))
    export('water')

# ============ SOLAR FARM ============
def build_solar():
    new_scene()
    dark = mat('sol_dark', DARK)
    panel = mat('sol_panel', PANEL, (0.16, 0.35, 0.91), 0.5)
    for i in range(3):
        for j in range(2):
            x = -0.6 + i * 0.62
            z = -0.35 + j * 0.7
            cyl('Stilt', 0.05, 0.3, (x, 0.15, z), dark, verts=6)
            pane = cube('Panel', (0.9, 1.4, 0.08), (x, z, 0.28), panel)
            pane.rotation_euler = (0.35, 0, 0)
    export('solar')

# ============ HOSPITAL ============
def build_hosp():
    new_scene()
    white = mat('hosp_white', WHITE)
    cross_m = mat('hosp_cross', (1.0, 0.18, 0.31), (1.0, 0.18, 0.31), 0.6)
    body = cube('Body', (1.1, 1.1, 0.9), (0, 0, 0.45), white)
    cross_v = cube('CrossV', (0.16, 0.05, 0.6), (0, 0.57, 0.55), cross_m)
    cross_h = cube('CrossH', (0.6, 0.05, 0.16), (0, 0.57, 0.55), cross_m)
    export('hosp')

# ============ DATA CENTER ============
def build_data():
    new_scene()
    dark = mat('data_dark', DARK, None, 0)
    strip = mat('data_strip', (0.0, 0.95, 0.95), (0.0, 0.95, 0.95), 1.2)
    cube('Body', (0.9, 0.9, 1.9), (0, 0, 0.95), dark)
    for i in range(3):
        cube(f'Strip{i}', (0.95, 0.05, 0.05), (0, 0.46, 0.5 + i * 0.55), strip)
    export('data')

# ============ EMERGENCY STATION ============
def build_emerg():
    new_scene()
    dark = mat('em_dark', (0.16, 0.10, 0.13))
    stripe = mat('em_stripe', (1.0, 0.36, 0.48), (1.0, 0.18, 0.31), 0.5)
    siren_m = mat('em_siren', (1.0, 0.18, 0.31), (1.0, 0.18, 0.31), 1.5)
    body = cube('Body', (1.0, 1.0, 0.8), (0, 0, 0.4), dark)
    cube('Stripe', (1.02, 1.02, 0.14), (0, 0, 0.55), stripe)
    siren = sph('Siren', 0.09, (0, 0, 0.95), siren_m)
    siren.name = 'siren'
    export('emerg')

# ============ AI AUDITOR ============
def build_auditor():
    new_scene()
    dark = mat('au_dark', DARK)
    eye_m = mat('au_eye', (0.0, 0.95, 0.95), (0.0, 0.95, 0.95), 1.2)
    cube('Body', (0.9, 0.9, 0.8), (0, 0, 0.4), dark)
    eye = sph('Eye', 0.16, (0, 0.4, 0.55), eye_m)
    eye.name = 'eye'
    export('auditor')

# ============ WASTE RECYCLING ============
def build_recycle():
    new_scene()
    accent = mat('rc_accent', COL['waste'], COL['waste'], 0.35)
    sym = mat('rc_sym', WHITE, WHITE, 0.4)
    cube('Body', (0.9, 0.7, 0.7), (0, 0, 0.35), accent)
    for i in range(3):
        a = i * 2 * math.pi / 3 - math.pi / 2
        cone('Tri', 0.12, 0.14, (math.cos(a) * 0.18, 0.36, 0.5), sym, verts=3)
    export('recycle')

# ============ CLINIC (small hospital, health colour) ============
def build_clinic():
    new_scene()
    white = mat('cl_white', WHITE)
    cross_m = mat('cl_cross', (1.0, 0.18, 0.31), (1.0, 0.18, 0.31), 0.6)
    body = cube('Body', (0.9, 0.9, 0.7), (0, 0, 0.35), white)
    cross_v = cube('CrossV', (0.14, 0.04, 0.45), (0, 0.42, 0.46), cross_m)
    cross_h = cube('CrossH', (0.45, 0.04, 0.14), (0, 0.42, 0.46), cross_m)
    export('clinic')

# ============ BUS DEPOT (transport green, canopy + gantry) ============
def build_depot():
    new_scene()
    accent = mat('dp_accent', COL['transport'], COL['transport'], 0.35)
    dark = mat('dp_dark', DARK)
    cube('Body', (1.2, 1.6, 0.8), (0, 0, 0.4), dark)
    cube('Roof', (1.3, 1.7, 0.12), (0, 0, 0.86), accent)
    # 4 support posts
    for (x, z) in [(-0.55, -0.7), (0.55, -0.7), (-0.55, 0.7), (0.55, 0.7)]:
        cyl('Post', 0.04, 0.9, (x, z, 0.45), dark, verts=6)
    # gantry sign
    cube('Sign', (0.5, 0.08, 0.3), (0, 0.6, 0.85), accent)
    export('depot')

# ============ TOWN HALL (safety orange, civic columns + dome) ============
def build_town():
    new_scene()
    accent = mat('th_accent', COL['safety'], COL['safety'], 0.35)
    cream = mat('th_cream', (0.91, 0.86, 0.78))
    dark = mat('th_dark', DARK)
    base = cube('Base', (1.3, 1.3, 0.6), (0, 0, 0.3), cream)
    # 4 columns
    for (x, z) in [(-0.45, -0.45), (0.45, -0.45), (-0.45, 0.45), (0.45, 0.45)]:
        cyl('Column', 0.06, 0.55, (x, z, 0.65), dark, verts=8)
    # pyramidal roof
    cone('Roof', 1.0, 0.7, (0, 0, 1.1), accent, verts=4)
    # flag pole
    cyl('FlagPole', 0.02, 0.5, (0, 0, 1.55), dark, verts=6)
    export('town')

# ============ COLLECTION POINT (waste purple, covered bins) ============
def build_collect():
    new_scene()
    accent = mat('cp_accent', COL['waste'], COL['waste'], 0.35)
    dark = mat('cp_dark', DARK)
    cyl('Bin1', 0.28, 0.55, (-0.2, 0, 0.28), accent, verts=10)
    cyl('Bin2', 0.28, 0.55, (0.25, 0, 0.28), dark, verts=10)
    # small cover roof
    cube('Cover', (0.9, 0.7, 0.08), (0, 0, 0.72), dark)
    # posts
    for (x, z) in [(-0.4, 0.28), (0.4, 0.28)]:
        cyl('Post', 0.03, 0.72, (x, z, 0.36), dark, verts=6)
    export('collect')

if __name__ == '__main__':
    build_wind()
    build_water()
    build_solar()
    build_hosp()
    build_data()
    build_emerg()
    build_auditor()
    build_recycle()
    build_clinic()
    build_depot()
    build_town()
    build_collect()
    print('ALL DONE')
