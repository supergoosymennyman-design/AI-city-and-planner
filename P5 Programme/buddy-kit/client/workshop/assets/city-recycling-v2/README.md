# City recycling v2

32 original procedural material fragments, dedicated to CC0: metal, plastic,
cardboard and glass. Each class has five training and three held-out identities.
No bottle necks, can rims, packaging, labels or logos are used.

`city-common/city-waste-v2.js` supplies both live meshes and scanner geometry.
`tools/generate-city-recycling-v2.html` renders 224 × 224 images and runs the
vendored MobileNet v3 small extractor. No labels enter the extractor.
`manifest.json` pins the geometry, scanner, extractor and each PNG with SHA-256.

Run the source server on 8379, then `node scripts/generate-city-recycling-v2.mjs`
from P5 Programme. The original city-recycling directory and city-waste.js are
frozen v1 assets; do not regenerate them when updating v2.
