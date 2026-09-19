# City Fabric Asset

The city-builder template uses a custom, pre-baked "fabric" asset:

- `client/city-builder/data/fabric.json`
- `client/city-builder/data/fabric-meta.json`

These files are generated offline by:

```bash
node scripts/generate-fabric.mjs
```

The generator is deterministic. Running it repeatedly produces the same output
unless `SEED` is intentionally changed. Current seed: `0x51e3c17` = `85867543`.

## Why not OSM / GeoJSON?

`osm-city.js` merges building geometry into a small number of meshes. That is
great for static rendering, but individual buildings are not addressable.

The city-builder template needs addressable lots because student actions hide
or replace specific fabric lots at runtime. Therefore `fabric.json` uses a
minimal custom lot format suitable for `InstancedMesh`.

## Coordinate system

- The fabric covers a 2000m × 2000m district.
- Coordinates are local meters on a flat plane.
- `x` is east.
- `z` is north.
- Both `x` and `z` are in `[0, 2000]`.
- The student 2D plan uses the same coordinate space.
- A 2D plan point `(x, y)` maps directly to a 3D building position `(x, 0, y)`.
- There is no lat/lng and no projection.

## fabric.json schema

```json
{
  "version": 1,
  "extentMeters": 2000,
  "lots": [
    { "id": 0, "cx": 120.5, "cz": 88.0, "w": 18, "d": 22, "h": 24 }
  ],
  "roads": [
    { "points": [[0, 1000], [2000, 1000]], "width": 14, "class": "primary" }
  ],
  "parks": [
    { "cx": 500, "cz": 500, "radius": 60 }
  ]
}
```

### lots

Each lot is a rectangular building footprint.

| Field | Meaning |
|---|---|
| `id` | Dense integer id, `0..N-1`. Used for InstancedMesh addressing. |
| `cx` | Lot centroid x in meters. |
| `cz` | Lot centroid z in meters. |
| `w` | Footprint width in meters. Range: 12–32. |
| `d` | Footprint depth in meters. Range: 12–32. |
| `h` | Building height in meters. Positive. |

Facade color is not stored. The runtime template derives facade material from
`h` using the same palette bands as `osm-city.js`.

### roads

Each road is a polyline.

| Field | Meaning |
|---|---|
| `points` | Array of `[x, z]` meter coordinates. |
| `width` | Road width in meters. |
| `class` | One of `primary`, `secondary`, `tertiary`, `residential`, `service`. |

Expected widths:

| Class | Width |
|---|---:|
| `primary` | 14 |
| `secondary` | 11 |
| `tertiary` | 9 |
| `residential` | 7 |
| `service` | 5 |

Fabric roads are static. Student-drawn roads are rendered later as elevated
neon overlay strips and do not mutate this road mesh.

### parks

Each park is a circular green region.

| Field | Meaning |
|---|---|
| `cx` | Park center x in meters. |
| `cz` | Park center z in meters. |
| `radius` | Park radius in meters. |

Generated fabric parks are lot-free. Hiding lots inside a park radius should
produce clean green space.

## fabric-meta.json schema

```json
{
  "version": 1,
  "extentMeters": 2000,
  "seed": 85867543,
  "lotCount": 3267,
  "roadCount": 302,
  "parkCount": 6,
  "bounds": {
    "minX": 39.4,
    "minZ": 41.63,
    "maxX": 1961.31,
    "maxZ": 1965.5
  }
}
```

The meta file is intentionally small. It is used for quick validation and
spatial-hash sizing at load time.

## Generator guarantees

Before writing output, `scripts/generate-fabric.mjs` asserts:

- `fabric.json` contains between 1500 and 4000 lots.
- Lot ids are dense `0..N-1`.
- Lot footprints stay inside the 2000m extent.
- Lot footprint widths and depths are within 12–32m.
- Core lots are tall (≥ 39m within 600m of center).
- Fringe lots are low (≤ 32m beyond 1150m from center).
- At least one core skyscraper (> 180m) exists.
- Core average height is significantly above fringe average.
- No lot overlaps a road right-of-way plus sidewalk margin.
- No lot intersects a park.

## Carve-pass contract

The runtime template will later apply the student plan like this:

### Landmark

Given a landmark at plan `(x, y)`:

1. Convert to fabric space `(x, z) = (x, y)`.
2. Find the nearest fabric lot centroid using a spatial hash over lots.
3. Hide that lot instance by setting its instance scale to zero.
4. Instantiate the landmark building at that lot.

This is why every lot exposes stable `id`, `cx`, and `cz`.

### Student park

Given a student park center and radius:

1. Hide every fabric lot whose centroid is inside the radius.
2. Place grass and trees.

Pre-baked fabric parks are already lot-free, so the same behavior works cleanly.

### Student road

Student roads are overlay strips. Fabric roads are never mutated.

## Regenerating

To regenerate the fabric:

```bash
node scripts/generate-fabric.mjs
```

Output files:

```text
client/city-builder/data/fabric.json
client/city-builder/data/fabric-meta.json
```

Do not hand-edit `fabric.json`. It is a generated asset.
