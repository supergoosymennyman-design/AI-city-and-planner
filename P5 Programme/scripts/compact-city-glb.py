"""Compact Blender's uncompressed GLB attributes without third-party packages.
Colour, weights and joints use core glTF integer formats; normals use the
standard KHR_mesh_quantization extension, supported by our vendored loader.
"""
import json, struct, pathlib

def compact(path):
    data=path.read_bytes();size=struct.unpack_from('<I',data,12)[0]
    doc=json.loads(data[20:20+size]);binary=data[28+size:]
    kinds={}
    for mesh in doc['meshes']:
        for prim in mesh['primitives']:
            for kind,index in prim['attributes'].items(): kinds[index]=kind
    new=bytearray();views=[]
    components={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4,'MAT4':16}
    formats={5126:'f',5123:'H',5121:'B',5122:'h',5120:'b',5125:'I'}
    for i,acc in enumerate(doc['accessors']):
        view=doc['bufferViews'][acc['bufferView']]; n=components[acc['type']]
        fmt=formats[acc['componentType']];stride=view.get('byteStride',struct.calcsize(fmt)*n)
        offset=view.get('byteOffset',0)+acc.get('byteOffset',0)
        values=[struct.unpack_from('<'+fmt*n,binary,offset+k*stride) for k in range(acc['count'])]
        kind=kinds.get(i)
        if kind in ['COLOR_0','WEIGHTS_0'] and acc['componentType']==5126:
            values=[tuple(max(0,min(255,round(v*255))) for v in row) for row in values];fmt='B';acc['componentType']=5121;acc['normalized']=True
        elif kind=='JOINTS_0' and max(v for row in values for v in row)<256:
            fmt='B';acc['componentType']=5121
        elif kind=='NORMAL' and acc['componentType']==5126:
            values=[tuple(max(-127,min(127,round(v*127))) for v in row) for row in values];fmt='b';acc['componentType']=5120;acc['normalized']=True
            for key in ['extensionsUsed','extensionsRequired']:
                doc.setdefault(key,[])
                if 'KHR_mesh_quantization' not in doc[key]:doc[key].append('KHR_mesh_quantization')
        while len(new)%4:new.append(0)
        start=len(new); row_size=struct.calcsize(fmt)*n
        # glTF vertex attributes have four-byte aligned strides.
        padded=(row_size+3)//4*4 if kind else row_size
        for row in values:
            new.extend(struct.pack('<'+fmt*n,*row));new.extend(b'\0'*(padded-row_size))
        out={'buffer':0,'byteOffset':start,'byteLength':len(new)-start}
        if kind:out['byteStride']=padded;out['target']=34962
        views.append(out);acc['bufferView']=len(views)-1;acc.pop('byteOffset',None)
        if kind and kind!='POSITION':acc.pop('min',None);acc.pop('max',None)
    doc['bufferViews']=views;doc['buffers']=[{'byteLength':len(new)}]
    raw=json.dumps(doc,separators=(',',':')).encode();raw+=b' '*((-len(raw))%4);new+=b'\0'*((-len(new))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(raw)+len(new))+struct.pack('<II',len(raw),0x4e4f534a)+raw+struct.pack('<II',len(new),0x004e4942)+new)
    print('COMPACT',path.name,path.stat().st_size)
if __name__=='__main__':
    root=pathlib.Path(__file__).resolve().parents[1]/'buddy-kit/client/city-builder/assets/models/citizens'
    for path in root.glob('*.glb'):compact(path)
