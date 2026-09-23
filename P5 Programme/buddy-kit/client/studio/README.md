# 3D Studio

A browser-based 3D modelling tool for primary-school students: make a champion from
shapes (or generate one with AI), rig it by tapping a free-form skeleton of joints onto
it — any number of joints, branching any way — pose it by turning a ring, and fit gear
pieces onto it. Exports rigged, skinned, dressed `.glb` files.

## Requirements

- Node.js 20+ (npm bundled)

## Run it

```sh
cd web/project/3d-studio
npm install          # first time only
npm run dev          # starts the dev server
```

Open the URL printed in the terminal (usually `http://localhost:5173/`).

## Build for production

To produce the self-contained `project/3d-studio/` bundle alongside Workshop,
run `npm run pack:project -- 3d-studio` from the repository root. Source stays here;
the pack command rebuilds and copies only production assets.

```sh
npm run build        # outputs to web/project/3d-studio/dist
npm run preview      # serve the built app locally
```

## Quick tour

1. **Build** — add shapes (box, sphere, cylinder, ...) with the toolbar. Drag the gizmo to
   move/rotate/scale; drag on empty space to orbit/pan the camera. Select a shape and hit
   **🧱 Sculpt** to shape it by hand with clay brushes or paint it, then **Done**.
2. **Rig** — tap the model to drop a joint; tap again to grow the chain; tap a ball first
   to branch from it. Drag a ball to move it (turn the model and drag again for depth).
   The skin weights are solved in a worker a moment after you stop — nothing to bind.
   **New chain** / **Remove joint** / **Clear skeleton** are on the toolbar.
3. **Pose** — tap a joint ball and turn the ring at the joint above it to swing that piece.
   **Rest** straightens everything; **Export** saves `my-champion.glb` with the skeleton
   and skin, and importing that file brings the skeleton back.
4. **Fit** — load a gear model (GLB/OBJ/FBX), bind it to a bone, tune it with the gizmo,
   then **Download fitted GLB** or **Download dressed model**.
5. **AI Optimization** — select one or more shapes, describe what you want in the AI panel,
   and press **Send**. The reply appears in the chat log and any shapes it returns preview
   in the panel: press **Replace** to swap out the selected shapes, press **Add as new** to
   keep them alongside, or drag the preview onto the viewport to drop the new shapes where
   you release them.

### AI Optimization controls

- **Model** — the dropdown of models the endpoint offers; **Refresh** re-fetches the list
  from `GET /v1/models`.
- **Context** — whether the request carries only the **Selected shapes** (the default) or
  the **Whole scene**. The whole scene is sent as context with the unselected shapes marked
  read-only, so the model can see the full layout while only the selection is intended to
  change.
- **Send full geometry** — off by default. When off, each shape is sent as a summary
  (vertex count + bounding box); when on, the full geometry (positions/index) is sent.
- **Settings** — **Server URL** (the API base ending in `/v1`) and **API key**.

The endpoint must be OpenAI-compatible: `GET /v1/models` returns the model list and
`POST /v1/chat/completions` returns replies. Requests are non-streaming. The panel sends
nothing until a key is set.

The **Server URL** and **API key** are entered in the panel's Settings and saved only to
this browser's `localStorage` (under `studio.ai.config`). Neither is in the source code,
and the key is never logged.

**Import** — drag a `.glb`/`.gltf` onto the viewport (or use the Import GLB button).

## Notes for developers

- Read `HIDDEN-FEATURES.md` before debugging — it logs known behaviors that cause
  unexpected errors (GLB import normalization, skinning attribute quirks, three.js API
  drift, click-vs-drag selection, colon-in-bone-name issue, etc.).
