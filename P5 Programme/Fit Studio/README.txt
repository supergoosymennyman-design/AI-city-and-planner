CHAMPION 3D — TUNE STUDIO + VIEWER
==================================

Static site. Deploy the WHOLE folder; the pages fetch their own assets at runtime.

TWO PAGES (changed 2026-08-09 — the front page is now the FIT STUDIO)
  /            (index.html)  -> the TUNE STUDIO: fit YOUR gear onto the base champion
  /viewer.html               -> the cel-shaded animation viewer (base + clips + kabuto)
  Each page links to the other from its HUD title row.

TEAM WORKFLOW — HOW TO FIT AN ACCESSORY (the studio front page)
  1. Open the URL. The base champion loads by itself (T-pose — fits are authored
     against the rest pose, so no animation here; that is deliberate).
  2. "Load gear" -> pick YOUR accessory file: GLB, GLTF, FBX or OBJ. If the model's
     textures are separate files, select them TOGETHER with the model in one pick.
     Rigged/skeleton files are refused (gear is a prop, not a character).
  3. Pick its socket (Head / Chest / Shoulder L / Shoulder R / Hand R).
  4. Seat it: Move / Rotate / Scale buttons, or the G / R / S keys. Orbit with drag.
  5. Press "Download fitted GLB". The fit is BAKED INTO the exported file
     (a championFit marker + geometry re-origined to the socket bone) — no offset
     numbers to copy anywhere. That exported file is the deliverable.
  6. Want to see it MOVE? Just open the Animation Viewer (link in the HUD title
     row). The wardrobe is LIVE-SHARED between the two pages: every change in the
     studio saves itself (piece added / removed / drag finished), the viewer wears
     exactly what the studio shows, and switching back loses nothing. A piece
     leaves the wardrobe only when you remove it in the studio. (Saved per-browser
     via IndexedDB; the viewer's default demo shelf appears only if you have never
     fitted anything.)
   RULE: everyone fits against THIS folder's champion-base.glb. A fit made against a
   different base model (different skeleton or scale) will not transfer. The studio's
   "Assets" section serves that exact base file for download.

DRESSED CHAMPION EXPORT (added 2026-08-28, static bake)
   "Download dressed champion (base + worn gear)" exports the WHOLE result — base champion
   plus every worn piece — as ONE GLB, CPU-baked into STATIC skeleton-free geometry (the
   bind-pose skin bake). The file is a plain mesh, so the 3D AI City loads it with no
   skeleton/scale mismatch (the Fit Studio base is authored meter-scale with the mesh under
   the Armature, which the city's skinned-mesh scaling mishandles). The raw export re-encodes
   the 24 MB base textures (~26 MB bare / ~42 MB with a big piece — over the city's 30 MB
   cap), so shrink it before upload:
     npx --no-install @gltf-transform/cli resize out.glb r.glb --width 1024 --height 1024
     npx --no-install @gltf-transform/cli webp r.glb city-ready.glb --quality 90
   With an empty wardrobe it exports the base champion alone. "Download fitted GLB" still
   bakes ONE accessory for the shared shelf (championFit contract) — the two buttons are
   separate by design.

PUBLISHING A TEAMMATE'S FITTED GEAR (static host = no uploads, owner curates)
   1. Teammate presses "Download fitted GLB" and sends you the file.
   2. Drop it into assets/gear/ (keep it under Cloudflare's 25 MiB per-file cap —
      run blender/gear-shrink.py from the repo if it is over).
   3. Add it to assets/gear/manifest.json — either a plain filename string, or an object
      { "file": "...", "label": "Student-facing name", "category": "Head|Senses|Back|Shoulders|Legs|Chest|Other" }
      Objects get the nicer shelf row; plain strings still work (category is guessed from the
      file name, the label prettified from it).
   4. Re-upload the whole folder to Cloudflare Pages.
      It then appears in the studio's "Try on — shared gear" shelf for everyone.

THE SHELF (added 2026-08-25, single-button auto-fit 2026-08-25)
   The "Try on — shared gear" section folds to ONE header row and STARTS folded, so a fresh
   student sees the fit tools, not the rack. The header holds the count + the single
   AUTO-FIT button:
     - Auto-fit (one button for the whole shelf) — acts on the gear WORN ON THE CHAMPION
       (2026-08-25): with exactly ONE piece worn it fits that piece straight away, no question;
       with several worn it asks "Which gear do you want me to fit?" in a picker dialog listing
       the worn pieces (grouped by category, with its own search box, rows show the full label).
       Auto-fit re-seats the chosen piece: pre-fitted gear returns to its baked socket
       as-authored; raw props move to their CATEGORY's best slot (Try on may have dropped them
       on the default eye slot) and are seated there — head pieces get the crown anchor,
       back-rig pieces the chest bone, etc., sized relative to the CHAMPION's height, and
       bilateral PAIR pieces (both legs / both ears in one file) are seated on the body midline.
       Every fit becomes the active entry, so fine tuning with Move/Rotate/Scale still works.
       The button is DISABLED while the champion wears nothing (use Try on / Load gear first).
     - Opening the header reveals the category chips (All / Head / Senses / Back / Shoulders /
       Legs / Chest) + a search box, so a student finds a piece fast; each row keeps
       "Try on · <label>" (fetch + wear it) and "↓" (download the raw file).

INTRO TUTORIAL (added 2026-08-20, index.html only)
   On load the page asks whether the student wants a quick tour (RPG-style: a spotlight ring
   follows each HUD section while a dialog card explains it — try-on, load gear, wardrobe,
   fit tools, download, the Animation viewer and its clips/motion capture). The question is
   asked ONCE PER BROWSER SESSION (per-tab sessionStorage): switching between the studio and
   the Animation viewer never re-asks; a freshly opened tab asks again. Declining (No / Skip /
   Esc) shows a brief toast tip pointing at the Tutorial button in the title row — the toast
   itself reopens the tour. The tour never changes studio state: the fit panel it force-shows
   for two steps is restored exactly on exit. Files: tutorial.css + the TUTORIAL block at the
   bottom of tune.js; viewer.html is untouched.

   VOICE (added 2026-08-25): the tour cards read themselves aloud. A "Voice: on/off" toggle in
   the tour card head speaks/stops the current card immediately; while ON every step change
   re-reads the new card. Accepting the first-time tour defaults Voice ON (a kid who asked to
   be shown around almost certainly wants it read); the Tutorial-button path honours the saved
   preference (localStorage). The champion reads like a ROBOT: a low steady pitch base with
   each SENTENCE stepping to a slightly different pitch (sequencer cadence), a square-wave
   "boop" when a card starts and a closing blip when it ends, and robot-named system voices
   (Zarvox / Trinoids / Cellos / Bad News / Ralph...) preferred when the OS ships them —
   otherwise the best natural English voice carries the same mechanical prosody. Pure
   best-effort — no speechSynthesis, no voices, or a device that throws degrades silently to
   the text tour (two-channel rule: narration never becomes a dependency).

UNDO / REDO (added 2026-08-25, index.html)
   The studio's safety net: every wardrobe change is ONE undo step — load a piece, remove a
   piece, move a piece to another slot (including the rival it evicted), a gizmo drag, an
   auto-fit, or a restore. Undo restores the full previous wardrobe: which pieces were worn,
   each piece's slot labels, and each piece's exact placement under its socket bone. Buttons
   live in the wardrobe section (Undo / Redo, disabled when empty) and Ctrl+Z / Ctrl+Y (or
   Ctrl+Shift+Z) work too. A drag that moved nothing is dropped automatically; the history
   clears on a champion swap (stored transforms die with the old skeleton). The shared
   wardrobe store follows every undo/redo, so the Animation viewer shows the restored look.

RESTORE LAST LOOK (added 2026-08-25, index.html)
   The studio opens BARE by design, but a returning student's fitted gear still lives in the
   shared wardrobe store (what the Animation viewer wears). The "Restore last look" button in
   the wardrobe section re-dresses the studio from that same store — exactly what was worn
   when the session last saved. It replaces the current look, is ONE undo step (no confirm
   dialog needed — Undo puts the old look back), and reports progress per piece.

LOADING PROGRESS (added 2026-08-25, both pages)
   Multi-megabyte loads report real progress now (progress.js): the studio's champion base
   (24 MB) and try-on gear fetches drive a determinate bar; the viewer shows the champion
   fetch, then "Dressing N / M — <piece>" per wardrobe piece, then an indeterminate slide for
   the (tiny) clips. Progress comes from the fetch stream when Content-Length exists; no
   length means the bar completes honestly rather than sitting at 0.

   COLOUR VARIANTS (e.g. the green/blue kabuto from the red one): the look is painted
  into the baseColor texture (unlit rendering), so a palette variant is a texture
  edit, not a remodel — run the repo's blender/gear-recolor.py headless:
    blender --background --python gear-recolor.py -- red.glb green.glb 120
  (+120 red->green, +240 red->blue). It hue-shifts ONLY pixels near the source hue
  (gold trim / cords / steel stay put), touches only the baseColor image, and the
  baked fit + championFit extra ride through untouched.

HOW TO OPEN IT
  Deployed (Cloudflare Pages etc.) -> just open the URL.

  Locally -> double-click START-PREVIEW.bat, NOT index.html.
  Opening index.html directly cannot work: the page uses ES modules, and browsers
  block those over file:// for CORS reasons, so no script runs at all and you get a
  dead HUD with "-- fps". START-PREVIEW.bat serves the folder over http and opens it.

WHAT THE VIEWER PAGE IS (/viewer.html)
  The cel-shaded champion viewer with the approved 2D look baked in:
    - unlit rendering (uniform ambient only, no directional light) -- the shading you
      see is painted into the texture, which is what makes it read as 2D art
    - inverted-hull ink outline with a per-vertex clamp so thick ink cannot tear
      through thin features
    - 5 toon bands, original 4096 texture
    - 100,000-triangle mesh, decimated from the original 1,000,000-triangle model
      (NOT a lower-detail regeneration -- it keeps the original's texture, UV layout
      and skeleton, so surface detail survives)

MOTION CAPTURE (viewer.html, added 2026-08-11)
  "Mirror me (camera)" makes the champion COPY the person at the webcam, live (self-hosted
  MediaPipe under toolbox/ — no cloud, frames never leave the device). "Record a take"
  captures up to 15 s, replays it as a normal clip button ("MoCap 1"), and "Download clip
  GLB" saves it in the SAME format as the Mixamo clips (armature + curves, no mesh, binds
  by bone name) — so the file loads back into this viewer, and into the games, like any
  clip. Single-webcam honesty: depth wobbles, feet can slide, fingers aren't tracked —
  great for waves/dances, not a replacement for the polished Idle/Walk cycles.

SIZE
  Total ~85 MB (the pose model adds 13.7 MiB, the green/blue kabuto ~15.3 MiB each),
  largest single file 24.0 MiB (champion-base.glb),
  second largest 14.9 MiB (the red samurai helmet). Under Cloudflare Pages' 25 MiB
  per-asset cap, so it uploads cleanly -- but the base has only ~1 MiB of headroom, so
  a heavier re-export breaks the upload. Note the cap is stated in MiB, not MB.
  Ref: https://developers.cloudflare.com/pages/platform/limits/

THE HUD (trimmed 2026-08-05)
  Gear: on/off -- shows/hides the loaded gear GLB. "off" hides it rather than
    detaching, so the baked fit is never lost.
  Gear socket -- which bone gear hangs from. A pre-fitted GLB (like the helmet) is
    authored FOR one socket and stays there; the picker says so.
  Clips -- Idle / Walk / Wave / Silly / Rumba, bound to the loaded skeleton. The
    champion always rests on Idle: on load, and after a one-shot (Wave) finishes.
  Removed, because they did nothing on a loaded champion: "Test lens" (it socketed a
    programmatic placeholder, not the real gear) and "Pose: Idle/Walk" (it only drove
    the stand-in robot, which is gone once a GLB loads). The outline toggle went too --
    the inked look is approved, so there is nothing to judge with it off.

WHAT TO CHECK ON THE TABLET
  1. FRAME RATE -- top-right of the HUD. This is the main open question; the mesh has
     only ever been profiled on desktop.
  2. THE LOOK -- does it read as 2D art rather than a 3D render?
  3. LINE QUALITY -- the ink outline should be firm and unbroken, especially around
     the visor rim and between the fingers.
  4. SURFACE DETAIL -- gold trim and panel seams should be crisp, not smeared.
  5. CLIPS -- Idle / Walk / Wave / Silly / Rumba should all appear and play, and the
     champion should come to rest on Idle after each one.
  6. Gear on/off, gear socket, orbit-drag, pinch-zoom.
  7. HELMET FIT -- known-imperfect: the kabuto reads oversized and its neck guard hangs
     past the right shoulder. Fit lives in the baked GLB, not in this viewer.

KNOWN ISSUE -- DO NOT REPORT THIS ONE
  RUMBA is the one animation exported against a different rig (it came from a
  separate 50k reconstruction). It binds and plays, but may show slight proportion
  drift -- a limb fractionally off, a hand not landing quite where it should.
  Idle / Walk / Wave / Silly were all verified against THIS model's skeleton at
  0.00% rest-offset deviation and are accurate.
  Judge animation quality on Silly, not Rumba. Fix pending: re-download Rumba from
  Mixamo against this character.

OFFLINE
  Nothing here contacts a third-party host. three.js is vendored under vendor/.
