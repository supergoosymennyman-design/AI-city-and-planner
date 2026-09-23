# 3D Studio · user manual

3D Studio lets you build a character from simple shapes, rig it by tapping a skeleton onto it,
pose it, and fit gear pieces (helmets, shoulder pads, …) onto it. Your work is **saved**
automatically and comes back when you reload the page.

## The four modes

The mode menu sits at the top left (🧱 Build ▾). Switch modes with the menu **or the number keys
1–4**.

| Mode | Hotkey | What you do here |
|------|--------|------------------|
| **Build** | `1` | Add shapes and arrange them into a body. |
| **Rig** | `2` | Tap the model to grow a skeleton of joints. |
| **Pose** | `3` | Tap a joint ball and turn the ring to bend the character. |
| **Fit** | `4` | Load gear pieces, bind them to bones, and download the result. |

Below, all the mode buttons ⬇ "everything" = the shared transform gizmo (see "Move / Rotate /
Scale" under Build).

## Top bar (always visible)

| Button | Hotkey | Purpose |
|--------|--------|---------|
| ↩️ Undo | `Ctrl+Z` | Undo the last action. |
| ↪️ Redo | `Ctrl+Shift+Z` or `Ctrl+Y` | Re-apply an undone action. |
| ➕ | — | Start a new scene (asks for confirmation; your current work is erased). |
| ❓ | `?` | Show the in-app help overlay. |

## Build mode (1)

| Button | Hotkey | Purpose |
|--------|--------|---------|
| ➕ **Add shape** ▾ | — | Drop-down of primitive shapes: box, sphere, cylinder, cone, torus, octahedron, plane. Each is added in the middle of the scene. |
| ✋ **Move / Rotate / Scale** ▾ | `G` / `R` / `S` | The gizmo you drag in the viewport to move, rotate, or scale the selected shape. |
| 📥 **Import** | — | Load a model file (`glb`/`gltf`). You can also drag a file straight onto the viewport. |
| 🔲 **Wireframe** | — | Toggle a see-through wireframe view of all shapes. |

**Transform gizmo (all modes):** select a shape, choose Move/Rotate/Scale, and drag the
coloured handles. The gizmo shows the current selection — `G`/`R`/`S` switch at any time.
In Build mode, when Scale is active, turn on **Keep proportions** to resize without changing the object's
current X:Y:Z shape ratio. The button stays active until you turn it off.

## Rig mode (2)

Use **Auto-rig** to suggest a skeleton, or draw one yourself by tapping the model.
There are no fixed two-leg/four-leg templates — joints can branch any way you like.

| Button | Hotkey | Purpose |
|--------|--------|---------|
| **Auto-rig** | — | Send a temporary light copy of the chosen model to UniRig, then put its predicted joints onto your original model. |
| **New chain** | — | Deselect, so the next tap on the model starts a fresh chain instead of growing the selected one. |
| **Remove joint** | `Delete` / `Backspace` | Remove the selected joint and everything hanging off it. |
| **Clear skeleton** | — | Remove every joint. Undo brings it back. |

**To rig** (the 3-step hint on the toolbar): tap the **model** to drop the first joint → tap again
to grow the chain → tap a **ball** first, then the model, to branch from there. Drag a ball to move
it; turn the model and drag again to set its depth.

**To auto-rig:** select the model in Build mode (Shift-click all parts of an assembled
creature), switch to Rig, then press **Auto-rig → Make skeleton**. If the document has
only one model, selecting it first is optional. With several unselected shapes, the
studio asks you to choose. The panel and toolbar show what is being rigged and how
many other shapes are ignored. Existing detail and materials stay on the original;
only the light geometry copy is uploaded. A job usually takes about 1–2 minutes.

The local development server uses your `HF_TOKEN` or cached Hugging Face CLI login.
On a published build, enter a Hugging Face token in the panel; it stays in this tab's
memory only. In **Connection settings**, choose **Hugging Face · UniRig** or **Custom API**.
Uncheck **Use my local Hugging Face login** to use a different HF token. For Custom API,
enter your endpoint URL and optional API key. Provider, URL and keys stay in this tab
until reload; they are never included in saved models. Each provider has its own key.

Custom API is for a compatible rigging server: it must accept a `POST` with raw GLB
bytes (`Content-Type: model/gltf-binary`) and return a rigged GLB as the response body.
The optional key is sent as `Authorization: Bearer <key>`. Use HTTPS (HTTP is allowed
for localhost); URLs cannot contain credentials, query parameters or fragments.
Redirects are refused. A server on another origin must allow CORS for the Studio's
origin, `POST`, `Content-Type` and `Authorization`. JSON job queues and Gradio endpoints
need an adapter to this contract. The returned rig must retain the uploaded coordinate
frame and fit the original model; errors, invalid responses and a four-minute timeout
leave the document unchanged.

Hugging Face auto-rig needs internet access and the community UniRig service may be
busy or unavailable. **Cancel auto-rig**, an error, or a model edited while the job is
running leaves the skeleton unapplied. Once it succeeds, **Undo** restores the previous
skeleton; **Redo** brings the new one back. Review the joints and try bending in Pose.

The studio has one shared rig per document. When replacing an existing skeleton,
select all parts of that rig first; other unrigged models can remain unselected. This
prevents a partial replacement from silently changing another model's bending.

The bending is worked out for you about half a second after you stop editing — you don't bind
anything. The toolbar's status line reports the solve (and how many vertices and joints it used);
a joint you left **outside** the model is called out so you can drag it back in. Joints belong to
the shape you tapped, so moving, turning or scaling that shape carries them along, and a shape with
no joint inside it rides the nearest bone.

## Pose mode (3)

| Button | Hotkey | Purpose |
|--------|--------|---------|
| **Rest** | — | Straighten every joint back to the neutral standing pose. |
| **Export** | — | Download the scene with its skeleton and skin as `my-model.glb`. Importing that file brings the skeleton back. |
| **Walk / Jump** | — | Preview automatic motion, correct the detected legs, and export both animation clips. |

Tap a joint ball. A ring appears at the joint **above** it — that is the hinge. Turn the ring to
swing the lit piece; the first ball turns the whole model. If the bending isn't ready yet (or a
solve failed), the toolbar says so instead of leaving you guessing.

**Walk / Jump** suggests leg segments from the skeleton; open **Body roles** to
correct them. Choose one upper segment per leg, use **Highlight** to locate it, and
set the forward direction, cycle duration and leg swing. **Play** loops the chosen
motion; **Stop** returns the preview to rest. The preview is a separate copy: **Close**
returns to your original manual pose without adding undo steps. **Play** also saves the
animation settings with the rig. They survive reload and re-import of Studio-exported
GLBs. Changing the skeleton structure invalidates its old animation mapping: review the
roles and press Play again to save new animations.

These are simple local procedural motions, not AI-generated motion capture. Walk is
in place: grounded feet push backward relative to the body, then lift and return
forward along the selected **Forward direction**. Jump lifts and lowers the rig,
and feet may slide. **Export Walk + Jump**
downloads `my-model-animated.glb` with the geometry, skin, skeleton and both named clips
for an animation-capable viewer or engine. Studio import retains its own procedural
settings and regenerates those clips; arbitrary externally authored clips are not yet
editable in this panel.

For legless models such as a snowman, leave every leg segment unchecked. **Automatic**
uses **Waddle**: sideways weight shifts, body rocking, bounce and delayed head/arm motion.
With legs selected it uses **Step**; **Walk style** can override the choice. A single
downward body segment is not automatically counted as a leg. In **Body roles**, correct
the suggested head, arm and tail segments, or choose **Still** to leave a segment alone.
**Softness** controls body compression and head follow-through; **Motion amount** controls
the sway and limb swing. Jump adds anticipation, takeoff, landing compression and recovery.
Both clips export for legless models too. These reusable curves scale with the rig; they
are a procedural prototype, not a guarantee of natural movement on every skeleton.

**Export GLB** in the top bar is available in every mode, including Build: generated
models do not need a skeleton to download. It exports the whole scene as `my-model.glb`,
including materials and any finished rig. Both this button and Pose's regular **Export**
automatically include saved Walk and Jump animations. If none have been created, they
export just the model/rig. Step motion solves hip–knee–ankle chains with a fixed bend
side and 8–120° flexion limits; it allows contact error instead of overextending a knee.
In **Body roles**, check the joint that is the knee, confirm its **Foot / ankle joint**,
and use **Knee bends** to reverse the bend if the rest-pose suggestion is wrong.
**Highlight** marks hip in gold, knee in blue and ankle in green. Extra toe/hock joints
are not counted as part of the shin when calculating knee limits. These mappings save
with the animation. Automatic suggestions still need visual review on unusual models.

## Fit mode (4)

| Button | Hotkey | Purpose |
|--------|--------|---------|
| 📥 **Load gear** | — | Open a gear model (`glb`/`gltf`/`obj`/`fbx`). Needs a skeleton first (see Rig). The piece loads in the middle, ready to be bound. |
| ✋ **Move / Rotate / Scale** ▾ | `G` / `R` / `S` | The gizmo for tuning where the active piece sits on the character. Hold `Shift` while dragging the scale gizmo to stretch it unevenly. |
| 🗑️ **Remove selected gear** | `Delete` / `Backspace` | Remove the active piece and free its bone. |
| 📦 **Download** ▾ | — |  |
| · Download fitted GLB | — | Save the active piece alone, baked onto its bone. |
| · Download dressed model | — | Save the whole character with all fitted gear as one `champion-dressed.glb`. |

**To fit a piece:** load gear → select it → in the Details panel pick **Bind to bone**, or click
the piece and tune it with the gizmo first. Select a bone to make it follow that part of the
skeleton, and **Unbind (move freely)** to leave it floating in place.

**Keep your champion and add gear later:** choose **Download dressed model** to save
the champion, fitted gear, editable skeleton and any saved Walk/Jump animations in
one GLB. On your next visit, import that file in Build, switch to Fit, and select
existing gear to adjust it or load another piece. Multiple pieces can share one
bone; adding glasses does not remove a hat. Download the dressed model again to
keep your latest outfit. The top-bar Export uses this same dressed download when
you have gear. Selection outlines and joint markers are never part of the file.

## Details panel (right sidebar)

Clicking anything shows its settings below **My shapes**:

- **Shapes (N) / Gear (N) / Skeleton (N)** tree — click any entry to select it; selected items
  are highlighted.
- **Shape** — Name, Color (paint-picker box + quick swatches), **Tube width** (torus only),
  Position / Rotation / Scale as numbers, **🧱 Sculpt** (open the clay studio — see below),
  **Duplicate** and **Delete**.
- **Joint ball** — its name, its parent joint, **Bend** numbers (type an angle instead of turning
  the ring), and **Reset pose**.
- **Gear piece (Fit)** — its name, whether it's bound, **Bind to bone** menu, and **Unbind
  (move freely)**.

## Viewport controls

| Action | How |
|--------|-----|
| Look around | Drag the empty scene. |
| Zoom | Scroll. |
| Select | Click a shape or joint ball. |
| Select several shapes | `Shift`-click each one — then drag the gizmo to move / rotate / scale them together around one shared centre, and `Ctrl+D` to duplicate them all. |
| Reset the camera | 🏠 button (top-left corner of the viewport). |

You can also **drag the divider** between the two sidebar panels to resize them.

## Sculpting a shape 🧱

Select a shape (Build mode) and click **🧱 Sculpt** — it opens in the clay studio, a dark room
with your shape in the middle.

- **Draw / Grab / Pull / Paint / Smooth / Carve** — pick a tool from the top bar.
- **Brush size** and **strength** sliders tune each stroke; **+ / −** flips between Push and Pull.
- **Mirror** — a segmented **Off / On** switch (Off by default). Turn **On** to sculpt both
  sides of the shape at once — handy for faces and armour.
- Paint? Pick a colour swatch at the bottom, then dab the shape.
- One finger on the shape sculpts; drag the empty background to turn; pinch (or scroll) to zoom.
- **✅ Done — back to 3D Studio** keeps the new look (you can still undo it); if you didn't
  actually sculpt anything, Done simply leaves the shape untouched. **✕ Cancel** throws the
  changes away.

## Hotkeys at a glance

| Keys | Action |
|------|--------|
| `1` `2` `3` `4` | Switch mode (Build, Rig, Pose, Fit) |
| `G` / `R` / `S` | Move / Rotate / Scale gizmo |
| `Delete` / `Backspace` | Delete selected shape (in Rig: remove the selected joint; in Fit: remove the active gear piece) |
| `Ctrl+D` | Duplicate selection |
| `Ctrl+Z` / `Ctrl+Shift+Z` (or `Ctrl+Y`) | Undo / Redo |
| `Shift`-click | Add to the selection |
| `Shift` (hold, Fit mode) | Uneven stretch while scaling with the gizmo |
| `?` | Help overlay |
## Make it real (AI)

**For the child**
1. Build something in Build mode.
2. Press **Make it real**. You'll see four pictures of your build: its front, left, back and right.
3. Check the four pictures show what you meant:
   - **Only some of it?** Pick the shapes you want first — the line under the pictures says how many
     of your build are going in. Pick nothing and it sends everything.
   - **Facing the wrong way?** Turn your model in the studio until you're looking at its front, then
     press **Use my view as the front**. Or drag **Turn** and **Tilt**. **Reset angle** puts it back.
   The AI builds what it can see, so a picture with the wrong things in it makes the wrong model.
4. For Hunyuan on Hugging Face, pick **Shape detail**: its own Low, Standard or High voxel-resolution
   preset. Face count stays independent. Other models expose their own options in **Settings**.
5. Type what it is, for example "a dinosaur with spikes on its back", and press **Send**.
6. You'll get a new drawing of your creature. Press **Use this**, or **Try again**.
7. Then you'll get a 3D model. Press **Replace my blocks**. It takes the place of exactly the shapes
   that were in the four pictures, even if you picked something else while the AI was working.
   **Undo** brings those blocks back and removes the generated model in one step. If every pictured
   shape was deleted before the model finished, the button changes to **Add to my studio** and the
   result is placed beside the build instead.

**Make from words** works the same way, starting from typed words instead of a build.

**Why the four views stay square to each other:** the AI that turns pictures into a model expects
them a quarter turn apart. Turn and Tilt move all four together for that reason, and Tilt stops at
30 degrees — past that the pictures stop looking like anything it was taught on.

**For the adult (once per device)**
- The first time, the panel opens on **Settings (for adults)**. Paste a Hugging Face token there and
  press **Save**. The key stays on this device and is only sent to Hugging Face.
- **Model controls** shows only the selected models' supported ranges, defaults and native presets.
  Custom values are saved separately per model. **Use model defaults** resets that model's controls.
  Hunyuan's speed presets are Turbo/Fast/Standard; its shape-detail presets do not set face count.
  TRELLIS has independent resolution, texture size and vertex-target controls. fal Hunyuan offers
  Normal/LowPoly/Geometry; face count and polygon type are enabled for LowPoly.
- Hugging Face **Simplify mesh** starts off, matching the Space's default. Enable it to request a
  custom target face count (the reduced shape is untextured). If the server's PLY export fails,
  the original model remains usable and a notice says face reduction was not applied. The original
  may be larger. Hunyuan 2.1 retains its original texture when simplification is off or falls back.
- **Test the AI services** checks that every step can be reached.

**What is sent:** the four pictures of the build (blocks only, no photos) and the words typed. If a
service is busy or down, **Show the sample** shows a ready-made example. It is always labelled
**Sample**.
