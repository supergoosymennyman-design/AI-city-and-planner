/**
 * Adult-facing catalogue for AI generation models.
 *
 * A model, not a provider, is selected for each step. Provider ids only decide which device-held
 * key and adapter are used. Unavailable entries document credible alternatives without pretending
 * that an unimplemented or unverified wire protocol works.
 *
 * Control definitions verified 2026-09-23 against the Spaces' /info and gradio_app.py,
 * and fal's endpoint OpenAPI schemas. Numeric bounds are not quality presets.
 * Only the Hunyuan Space declares the Low/Standard/High decode presets below;
 * fal options stay independent, using the provider defaults until edited.
 */

const freezeParameter = (parameter) => Object.freeze({
  ...parameter,
  ...(parameter.options ? { options: Object.freeze([...parameter.options]) } : {}),
  ...(parameter.when ? { when: Object.freeze({ ...parameter.when }) } : {}),
  ...(parameter.levels ? { levels: Object.freeze(parameter.levels.map((level) => Object.freeze({ ...level }))) } : {}),
});

const freezeControls = (controls) => {
  if (!controls) return null;
  const parameters = Object.freeze(Object.fromEntries(Object.entries(controls.parameters)
    .map(([name, parameter]) => [name, freezeParameter(parameter)])));
  const detail = controls.detail ? Object.freeze({
    ...controls.detail,
    levels: Object.freeze(controls.detail.levels.map((level) => Object.freeze({
      ...level, values: Object.freeze({ ...level.values }),
    }))),
  }) : null;
  return Object.freeze({ parameters, detail });
};

const freezeModel = (model) => Object.freeze({
  ...model,
  steps: Object.freeze([...model.steps]),
  capabilities: Object.freeze({ ...model.capabilities }),
  space: model.space ? Object.freeze({
    ...model.space,
    ...(model.space.freeCheck ? { freeCheck: Object.freeze({ ...model.space.freeCheck,
      payload: Object.freeze([...model.space.freeCheck.payload]) }) } : {}),
  }) : null,
  fal: model.fal ? Object.freeze({ ...model.fal }) : null,
  tokenhub: model.tokenhub ? Object.freeze({ ...model.tokenhub }) : null,
  controls: freezeControls(model.controls),
});

const freezeProvider = (provider) => Object.freeze({
  ...provider,
  fields: Object.freeze(provider.fields.map((field) => Object.freeze({ ...field }))),
  ...(provider.requiredAny ? { requiredAny: Object.freeze([...provider.requiredAny]) } : {}),
});

export const PROVIDER_CATALOGUE = Object.freeze({
  'hf-spaces': freezeProvider({
    id: 'hf-spaces', name: 'Hugging Face Spaces',
    fields: [
      { id: 'key', label: 'Access token', type: 'password', placeholder: 'Paste an hf_… token here', required: true, secret: true },
    ],
  }),
  fal: freezeProvider({
    id: 'fal', name: 'fal',
    note: 'Enter a browser API key or a fal-compatible server/proxy URL.',
    requiredAny: ['key', 'proxyUrl'],
    fields: [
      { id: 'key', label: 'API key', type: 'password', placeholder: 'Paste a fal API key here', required: false, secret: true },
      { id: 'proxyUrl', label: 'Server or proxy URL', type: 'url', placeholder: 'Optional fal-compatible proxy URL', required: false, secret: false },
    ],
  }),
  'tencent-tokenhub': freezeProvider({
    id: 'tencent-tokenhub', name: 'Tencent TokenHub (official)',
    note: 'Use the official TokenHub API key. The optional URL must speak Tencent TokenHub\'s API protocol.',
    fields: [
      { id: 'key', label: 'API key', type: 'password', placeholder: 'Paste a Tencent TokenHub API key here', required: true, secret: true },
      { id: 'baseUrl', label: 'Server or proxy URL', type: 'url', placeholder: 'Optional; defaults to https://tokenhub.tencentmaas.com', required: false, secret: false },
    ],
  }),
});

export const MODEL_CATALOGUE = Object.freeze([
  freezeModel({
    id: 'qwen-image-edit-2511', name: 'Qwen Image Edit 2511 (Hugging Face)', provider: 'hf-spaces',
    steps: ['edit'], capabilities: { multiview: false, texture: false }, licence: 'Apache 2.0',
    available: true, note: 'Edits the four-view sheet together.',
    space: { id: 'Qwen/Qwen-Image-Edit-2511', endpoint: '/infer', outputIndex: 0 },
  }),
  freezeModel({
    id: 'qwen-image-edit-2511-fal', name: 'Qwen Image Edit 2511 (fal)', provider: 'fal',
    steps: ['edit'], capabilities: { multiview: false, texture: false }, licence: 'Apache 2.0',
    available: true, note: 'Direct fal API. Edits the four-view sheet together.',
    fal: { endpoint: 'fal-ai/qwen-image-edit-2511' },
  }),
  freezeModel({
    id: 'flux-1-schnell', name: 'FLUX.1 schnell (Hugging Face)', provider: 'hf-spaces',
    steps: ['picture'], capabilities: { multiview: false, texture: false }, licence: 'Apache 2.0',
    available: true, note: 'Fast single-picture generation.',
    space: { id: 'black-forest-labs/FLUX.1-schnell', endpoint: '/infer', outputIndex: 0 },
  }),
  freezeModel({
    id: 'flux-1-schnell-fal', name: 'FLUX.1 schnell (fal)', provider: 'fal',
    steps: ['picture'], capabilities: { multiview: false, texture: false }, licence: 'Apache 2.0',
    available: true, note: 'Direct fal API. Fast single-picture generation.',
    fal: { endpoint: 'fal-ai/flux/schnell' },
  }),
  freezeModel({
    id: 'hunyuan3d-2mv', name: 'Hunyuan3D 2mv', provider: 'hf-spaces',
    steps: ['views3d', 'picture3d'], capabilities: { multiview: true, texture: false },
    licence: 'Tencent Hunyuan Community (excludes EU, UK and South Korea)', available: true,
    note: 'Shape works. Texture is disabled on this Space even though its API lists the endpoint.',
    space: { id: 'tencent/Hunyuan3D-2mv', endpoint: '/shape_generation', outputIndex: 0,
      freeCheck: { endpoint: '/on_gen_mode_change', payload: ['Turbo'] } },
    controls: {
      parameters: {
        octree_resolution: { label: 'Octree resolution', min: 16, max: 512, step: 1, default: 256,
          levels: [{ id: 'low', label: 'Low', value: 196 }, { id: 'standard', label: 'Standard', value: 256 }, { id: 'high', label: 'High', value: 384 }] },
        steps: { label: 'Inference steps', min: 1, max: 100, step: 1, default: 5,
          levels: [{ id: 'turbo', label: 'Turbo', value: 5 }, { id: 'fast', label: 'Fast', value: 10 }, { id: 'standard', label: 'Standard', value: 30 }] },
        num_chunks: { label: 'Number of chunks', min: 1000, max: 5000000, step: 1, default: 8000 },
        reduce_face: { label: 'Simplify mesh', options: [false, true], default: false },
        target_face_num: { label: 'Target face count', min: 100, max: 1000000, step: 1, default: 10000, stage: 'export', when: { reduce_face: true } },
      },
      detail: { label: 'Shape detail', displayParameter: 'octree_resolution', unit: 'voxel resolution', levels: [
        { id: 'low', label: 'Low', values: { octree_resolution: 196 } },
        { id: 'standard', label: 'Standard', values: { octree_resolution: 256 } },
        { id: 'high', label: 'High', values: { octree_resolution: 384 } },
      ] },
    },
  }),
  freezeModel({
    id: 'hunyuan3d-2.1', name: 'Hunyuan3D 2.1', provider: 'hf-spaces',
    steps: ['views3d', 'picture3d'], capabilities: { multiview: true, texture: true },
    licence: 'Tencent Hunyuan Community (excludes EU, UK and South Korea)', available: true,
    note: 'Returns the original textured model by default. Optional mesh simplification exports an untextured shape; if export fails, the original is kept with a notice.',
    space: { id: 'tencent/Hunyuan3D-2.1', endpoint: '/generation_all', outputIndex: 1 },
    controls: {
      parameters: {
        octree_resolution: { label: 'Octree resolution', min: 16, max: 512, step: 1, default: 256,
          levels: [{ id: 'low', label: 'Low', value: 196 }, { id: 'standard', label: 'Standard', value: 256 }, { id: 'high', label: 'High', value: 384 }] },
        steps: { label: 'Inference steps', min: 1, max: 100, step: 1, default: 30,
          levels: [{ id: 'turbo', label: 'Turbo', value: 5 }, { id: 'fast', label: 'Fast', value: 10 }, { id: 'standard', label: 'Standard', value: 30 }] },
        num_chunks: { label: 'Number of chunks', min: 1000, max: 5000000, step: 1, default: 8000 },
        reduce_face: { label: 'Simplify mesh', options: [false, true], default: false },
        target_face_num: { label: 'Target face count', min: 100, max: 1000000, step: 1, default: 10000, stage: 'export', when: { reduce_face: true } },
      },
      detail: { label: 'Shape detail', displayParameter: 'octree_resolution', unit: 'voxel resolution', levels: [
        { id: 'low', label: 'Low', values: { octree_resolution: 196 } },
        { id: 'standard', label: 'Standard', values: { octree_resolution: 256 } },
        { id: 'high', label: 'High', values: { octree_resolution: 384 } },
      ] },
    },
  }),
  freezeModel({
    id: 'hunyuan3d-v3-fal', name: 'Hunyuan3D v3 (fal)', provider: 'fal',
    steps: ['views3d', 'picture3d'], capabilities: { multiview: true, texture: true },
    licence: 'Commercial use via fal; provider and model terms apply', available: true,
    note: 'Paid fal API. Accepts front, back, left and right views and returns a textured GLB.',
    fal: { endpoint: 'fal-ai/hunyuan3d-v3/image-to-3d', input: 'hunyuan3d-v3', output: 'model_glb' },
    controls: {
      parameters: {
        generate_type: { label: 'Generation type', options: ['Normal', 'LowPoly', 'Geometry'], default: 'Normal' },
        polygon_type: { label: 'Polygon type', options: ['triangle', 'quadrilateral'], default: 'triangle', when: { generate_type: 'LowPoly' } },
        enable_pbr: { label: 'PBR materials', options: [false, true], default: false },
        face_count: { label: 'Face count', min: 40000, max: 1500000, step: 1, default: 500000,
          when: { generate_type: 'LowPoly' } },
      },
    },
  }),
  freezeModel({
    id: 'trellis-2-fal', name: 'TRELLIS 2 (fal)', provider: 'fal',
    steps: ['picture3d'], capabilities: { multiview: false, texture: true }, licence: 'MIT',
    available: true, note: 'Paid fal API. Single-picture generation with independent resolution, texture size and vertex target controls.',
    fal: { endpoint: 'fal-ai/trellis-2', input: 'trellis-2', output: 'model_glb' },
    controls: {
      parameters: {
        decimation_target: { label: 'Decimation target', min: 5000, max: 2000000, step: 1, default: 500000 },
        resolution: { label: 'Resolution', options: [512, 1024, 1536], default: 1024 },
        texture_size: { label: 'Texture size', options: [1024, 2048, 4096], default: 2048 },
      },
    },
  }),
  freezeModel({
    id: 'hunyuan3d-3.1-tokenhub', name: 'Hunyuan3D 3.1 (Tencent official)', provider: 'tencent-tokenhub',
    steps: ['picture3d'], capabilities: { multiview: true, texture: true },
    licence: 'Tencent Hunyuan model and TokenHub service terms apply', available: true,
    note: 'Official TokenHub API. This connection sends one picture as base64 and returns a textured GLB. TokenHub multiview needs hosted image URLs, so it is not wired to the four-view step yet.',
    tokenhub: { model: 'hy-3d-3.1' },
  }),
  freezeModel({
    id: 'trellis-community', name: 'TRELLIS community', provider: 'hf-spaces',
    steps: ['views3d', 'picture3d'], capabilities: { multiview: 'unverified', texture: true },
    licence: 'MIT', available: false,
    note: 'Not connected: multiview requires session state that is not yet verified end to end.',
    space: { id: 'trellis-community/TRELLIS', endpoint: '/generate_and_extract_glb', outputIndex: 1 },
  }),
  freezeModel({
    id: 'trellis-2', name: 'TRELLIS.2', provider: 'hf-spaces',
    steps: ['picture3d'], capabilities: { multiview: false, texture: true }, licence: 'MIT',
    available: false, note: 'Not connected: its single-image, multi-call session flow still needs an adapter.',
    space: { id: 'microsoft/TRELLIS.2', endpoint: '/start_session', outputIndex: 0 },
  }),
  freezeModel({
    id: 'hunyuan3d-2mini-turbo', name: 'Hunyuan3D 2mini Turbo', provider: 'hf-spaces',
    steps: ['picture3d'], capabilities: { multiview: false, texture: true },
    licence: 'Tencent Hunyuan Community (excludes EU, UK and South Korea)', available: false,
    note: 'Not connected: its hosted texture flow is single-image only and still needs an adapter.',
    space: null,
  }),
  freezeModel({
    id: 'none', name: 'None — skip this step', provider: null,
    steps: ['texture'], capabilities: { multiview: false, texture: false }, licence: 'Not applicable',
    available: true, note: 'The seam is ready, but no standalone mesh-texturing service is connected.',
    space: null,
  }),
]);

const BY_ID = new Map(MODEL_CATALOGUE.map((model) => [model.id, model]));

export const DEFAULT_MODELS = Object.freeze({
  edit: 'qwen-image-edit-2511',
  views3d: 'hunyuan3d-2mv',
  picture: 'flux-1-schnell',
  picture3d: 'hunyuan3d-2.1',
  texture: 'none',
});

export function modelById(id) {
  return BY_ID.get(id) || null;
}

export function modelsForStep(step) {
  return MODEL_CATALOGUE.filter((model) => model.steps.includes(step));
}

export function capabilityLabel(value) {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return value === 'unverified' ? 'Unverified' : String(value || 'No');
}

/** The provider defaults declared by one model's live schema. */
export function defaultControlValues(model) {
  return Object.fromEntries(Object.entries(model?.controls?.parameters || {})
    .map(([name, parameter]) => [name, parameter.default]));
}

function validControlValue(parameter, value) {
  if (parameter.options) return parameter.options.includes(value);
  return typeof value === 'number' && Number.isFinite(value) && value >= parameter.min && value <= parameter.max;
}

/**
 * Validate adult raw values, then optionally apply one child-facing named Detail preset.
 * Unknown/out-of-range values never reach a provider.
 */
export function resolveModelControls(model, saved = {}, detailLevel = null) {
  const out = defaultControlValues(model);
  for (const [name, parameter] of Object.entries(model?.controls?.parameters || {})) {
    if (validControlValue(parameter, saved?.[name])) out[name] = saved[name];
  }
  const level = model?.controls?.detail?.levels?.find((entry) => entry.id === detailLevel);
  if (level) Object.assign(out, level.values);
  return out;
}
