// Environment assets have a strict fallback contract: city boot never waits for
// a texture/HDRI, and a failed request leaves the procedural material intact.
import * as THREE from 'three';

export const ENVIRONMENT_ASSET_MANIFEST_VERSION = 1;
export const ENVIRONMENT_ASSETS = Object.freeze({
  // The HDRIs are intentionally opt-in until their processed files are added.
  // Keeping their source/provenance here prevents an unverified download from
  // becoming a shipped dependency. The loader activates automatically once
  // `available` is changed as part of the asset import.
  hdri: {
    morning: { file: 'assets/environment/kiara-1-dawn-1k.jpg', available: false, source: 'https://polyhaven.com/a/kiara_1_dawn', license: 'CC0' },
    day: { file: 'assets/environment/syferfontein-1d-clear-1k.jpg', available: false, source: 'https://polyhaven.com/a/syferfontein_1d_clear', license: 'CC0' },
    sunset: { file: 'assets/environment/kiara-1-dawn-1k.jpg', available: false, source: 'https://polyhaven.com/a/kiara_1_dawn', license: 'CC0' },
    night: { file: 'assets/environment/kloppenheim-06-puresky-1k.jpg', available: false, source: 'https://polyhaven.com/a/kloppenheim_06_puresky', license: 'CC0' },
  },
  textures: {
    asphalt: { files: ['assets/textures/ground-asphalt.jpg', 'assets/textures/aerial_asphalt_01_nor_gl_1k.jpg', 'assets/textures/aerial_asphalt_01_rough_1k.jpg'], source: 'https://polyhaven.com/a/aerial_asphalt_01', license: 'CC0', maxSize: 1024 },
  },
});

export function environmentQuality({ mobile = false, lowEnd = false } = {}) {
  return Object.freeze({
    textureSize: lowEnd ? 512 : (mobile ? 1024 : 2048),
    hdriSize: lowEnd ? 0 : (mobile ? 512 : 1024),
    shadows: !lowEnd,
    foliageDensity: lowEnd ? 0.55 : (mobile ? 0.8 : 1),
    drawDistance: lowEnd ? 0.7 : 1,
    postprocessing: !lowEnd,
  });
}

export function configureEnvironmentTexture(texture, renderer, { color = false, repeat = 1 } = {}) {
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.anisotropy = Math.min(renderer?.capabilities?.getMaxAnisotropy?.() || 1, 4);
  return texture;
}

/** Load and PMREM-prefilter an available HDRI; null means use procedural light. */
export function loadEnvironmentHDRI({ renderer, preset, onError = () => {} } = {}) {
  const asset = ENVIRONMENT_ASSETS.hdri[preset] || ENVIRONMENT_ASSETS.hdri.sunset;
  if (!renderer || !asset?.available) return Promise.resolve(null);
  // We ship processed equirectangular files rather than a runtime decoder.
  // That keeps the core Three vendor set small; PMREM works equally with this
  // colour-managed texture and still produces correct reflection mip levels.
  return new THREE.TextureLoader().loadAsync(asset.file).then((hdr) => {
    hdr.mapping = THREE.EquirectangularReflectionMapping;
    hdr.colorSpace = THREE.SRGBColorSpace;
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    const env = pmrem.fromEquirectangular(hdr).texture;
    hdr.dispose(); pmrem.dispose();
    return env;
  }).catch((error) => { onError(error, asset); return null; });
}
