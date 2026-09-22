// Equirectangular panoramas are stored with sky at the source image's top.
// Three texture UVs address that top edge at v=1, while the horizon is v=.5.
export function equirectangularSkyV(directionY) {
  const y = Math.max(-1, Math.min(1, Number(directionY) || 0));
  return 0.5 + Math.asin(y) / Math.PI;
}

// Small test helper: a two-band panorama has sky in its upper source half and
// ground in its lower source half. It deliberately mirrors the image contract,
// rather than any renderer-specific texture-upload detail.
export function twoBandPanoramaSample(directionY) {
  return equirectangularSkyV(directionY) >= 0.5 ? 'sky' : 'ground';
}
