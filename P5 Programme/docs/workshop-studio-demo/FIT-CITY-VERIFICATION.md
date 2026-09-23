# Fit Studio → AI City: Milo

Milo is an original biped assembled from Studio geometry. The source builder is
`buddy-kit/client/studio/scripts/build-city-demo.mjs`; run it from the Studio
directory with `node scripts/build-city-demo.mjs` to regenerate
`milo-city-champion.glb`. It uses Studio's joint graph, skinning, Walk/Jump
motion generator, and GLB exporter. The rig has hips, torso, head, two arm
chains, and two hip–knee–ankle–toe chains. City export adds Idle and Run.

To try the file, open Fit Studio in a clean scene and import the GLB. Its rig
and motion settings come back with it. Use **Export for AI City** to download a
new City GLB. In AI City, use **Upload your fitted champion (.glb)** at the
entrance and start the city. The saved file in this directory is also the
exact file used for the City import check below.

## Local verification, 24 September 2026

- `npm run test:studio`: 2,159 passed.
- `npm run test:unit`: 427 passed.
- `npm run build` in Studio: passed.
- `node --test tests/champion-contract.test.mjs tests/fit-city-demo.test.mjs`: passed.
- Reloading the saved GLB with Three's GLTFLoader found one skinned mesh and
  Idle, Walk, Run, Jump clips. Every target exists, City contract validation
  passes, and Jump raises the hips. The GLB downloaded by Studio's browser
  button also reloaded and passed the same City contract.
- In local Chromium, City's entrance accepted `milo-city-champion.glb`. The
  runtime reported `skinId: "__custom__"`, animation source `Studio`, and
  `ready: true`; it did so again after reloading the page. No fallback or
  rejection warning appeared.
- City scaled the character to 1.8 m. A close front view showed the face,
  arms, two legs and shoes upright on the ground. [City screenshot](milo-city-in-city.png).
  I also viewed Walk and Run at a quarter cycle and Jump at midair in City's
  renderer: the knees bend, the arms swing, and Jump clears the ground. The
  Run pose is fairly close to Walk; its shorter cycle and larger swing are the
  main differences. No broken skinning or reversed facing was visible.
  Calling City's runtime with forward movement selected Walk and Run; their
  measured grounding gaps were about 2.2 cm and 0.4 cm while settling. The
  forward facing angle was 0 radians. Jump selected the embedded Jump action
  and raised the character about 0.3 m after 0.1 s.

The saved screenshot is an idle pose. Full movement cycles on varied City
terrain were not captured; the local checks above cover the clip poses,
grounding, and runtime selection.
