# City recycling v1

24 original procedural waste objects: 8 each of metal cans, plastic bottles, and
cardboard boxes. Geometry, scanner images and dataset are dedicated to CC0 1.0.
No downloaded model, attribution-required asset, camera image or student data.

`city-common/city-waste.js` defines object identity, dimensions, colour, fixed
scanner camera, and lights. The live conveyor uses that exact mesh factory.
The scanner inspection picture is the exact input to the model, independent of
the City's time of day. Object variants 0–4 are training; 5–7 are test, frozen
before feature generation. Test pictures never appear in training selections.

`catalogue.js` packages the actual image embeddings, produced by the vendored
Workshop ImageEmbedder (MobileNet v3 small), at 224 × 224 pixels. Labels, identity,
and filenames are never extractor inputs. The City consumes these precomputed
vectors and does not run the extractor. Manifest hashes pin every PNG and the
extractor model. Rebuild using `scripts/generate-city-recycling.mjs` with the
canonical source server at port 8379. Render geometry and scanner lighting changes
require regeneration of all images and features.

This is a controlled three-material exercise, not advice about local recycling
rules. Fixed viewpoint and simple shapes deliberately come before rotation,
lighting, transparent packaging, mixed materials, or ordinary camera photos.
