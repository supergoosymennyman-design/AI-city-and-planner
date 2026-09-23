# Custom Champion animations

Fit Studio's **Use in AI City** and **Download Champion GLB** export one GLB with the dressed model, selected clips, and `passionaChampion` metadata in the scene extras. The exporter checks the parsed result before replacing the saved Champion.

`actions` maps required `idle`, `walk`, and `run` plus optional `jump`, `wave`, and `dance` to clip names. `extraActions` is an optional list of `{ name, clip }` entries (up to eight). Each name appears in the City's Actions tray. All clips must bind to nodes in the same GLB; bones, object transforms, and morph targets are accepted. Whole-model position tracks are rejected because City owns travel and collision. An animation named Fly is only a visual action.

The City validates mapped clips on import and skin swap. Invalid imports report the reason and retain the current model. Uploads without Studio metadata follow the older preset animation path. Studio exports from before `extraActions` was added also retain their preset optional actions.

Custom GLBs live in this browser's IndexedDB. Champion Files and cloud codes do not carry them; moving to another device requires importing the GLB again.
