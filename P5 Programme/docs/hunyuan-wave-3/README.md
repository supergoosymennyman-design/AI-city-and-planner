# Hunyuan Wave 3 — Skill Homes

These concept sheets document the supplied visual language for the City’s five
permanent Skill Homes and two protected learning gateways. Procedural models
remain as immediate loading placeholders and offline-safe recovery fallbacks.

| File | Destination | Provenance |
| --- | --- | --- |
| `community-recycling-sorter-concept.png` | Community Recycling Sorter | Passiona-original art direction; generated with Hunyuan image workflow for Kai; final project concept asset, CC0 release intended |
| `drone-delivery-dock-concept.png` | Drone Delivery Dock | Passiona-original art direction; generated with Hunyuan image workflow for Kai; final project concept asset, CC0 release intended |
| `smart-mobility-stop-concept.png` | Smart Mobility Stop | Passiona-original art direction; generated with Hunyuan image workflow for Kai; final project concept asset, CC0 release intended |
| `ai-skill-workshop-pod-concept.png` | AI Skill Workshop Pod | Passiona-original art direction; generated with Hunyuan image workflow for Kai; final project concept asset, CC0 release intended |
| `champion-skill-pavilion-concept.png` | Champion Skill Pavilion | Passiona-original art direction; generated with Hunyuan image workflow for Kai; final project concept asset, CC0 release intended |
| `ai-workshop-gateway-concept.png` | Permanent AI Workshop gateway | Passiona-original art direction; generated for Kai with the image workflow; reference for the future Hunyuan GLB, final CC0 release intended |
| `fit-studio-gateway-concept.png` | Permanent Fit Studio gateway | Passiona-original art direction; generated for Kai with the image workflow; reference for the future Hunyuan GLB, final CC0 release intended |

## Permanent city gateways

Every AI City has one protected AI Workshop and one protected Fit Studio
destination. Their supplied flagship GLBs now load asynchronously through the
City's shared Draco/Meshopt loader and are normalized to fixed 28 × 28 m civic
lots. The procedural architecture is visible immediately and remains in place
if a file is missing or cannot decode; the City-owned bilingual label, +Z
proximity socket, hit target and route never move. Workshop links intentionally
open only the Workshop root with a `returnTo` City URL; no recycling-demo deep
link is installed. Neither gateway is a picker item or a removable Fit Studio
appearance.

## Installed flagship GLBs

| Runtime asset | Source | Final audit |
| --- | --- | --- |
| `city-builder/assets/models/skill-hosts/passiona-smart-mobility-stop.glb` | `Downloads/smart mobility.glb`, supplied by Kai; Passiona-original / Hunyuan workflow, final CC0 release intended | 3.8 MiB, 34,940 triangles, named material, embedded textures, `EXT_meshopt_compression` |
| `city-builder/assets/models/skill-hosts/passiona-champion-skill-pavilion.glb` | `Downloads/pavilion.glb`, supplied by Kai; Passiona-original / Hunyuan workflow, final CC0 release intended | 5.4 MiB, 34,912 triangles, named material, embedded textures, `EXT_meshopt_compression` |
| `city-builder/assets/models/skill-hosts/passiona-ai-skill-workshop-pod.glb` | `Downloads/pod concept.glb`, supplied by Kai; Passiona-original / Hunyuan workflow, final CC0 release intended | 4.1 MiB, 34,904 triangles, named material, embedded 1K textures, `EXT_meshopt_compression` |
| `city-builder/assets/models/gateways/passiona-ai-workshop-gateway.glb` | `Downloads/Workshop.glb`, supplied by Kai; Passiona-original / Hunyuan workflow, final derivative released as CC0 | 5,359,332 bytes (5.11 MiB), 34,508 triangles, embedded 1K PBR textures, `EXT_meshopt_compression`; Y-up, X/Z-centred, ground-anchored; baked +90° Y correction puts the entrance on the +Z socket side |
| `city-builder/assets/models/gateways/passiona-fit-studio-gateway.glb` | `Downloads/Fit studio.glb`, supplied by Kai; Passiona-original / Hunyuan workflow, final derivative released as CC0 | 4,752,616 bytes (4.53 MiB), 34,704 triangles, embedded 1K PBR textures, `EXT_meshopt_compression`; Y-up, X/Z-centred, ground-anchored; source +Z entrance retained |

The runtime footprint normalizer centres X/Z and ground-anchors every supplied
or custom host model before placement. Before another GLB replacement is added,
it must be verified as CC0/public domain, Y-up, +Z forward, embedded 1K
textures, Meshopt-compressed, under 35k triangles and under 8 MiB.
