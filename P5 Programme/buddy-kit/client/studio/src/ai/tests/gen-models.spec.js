import {
  MODEL_CATALOGUE, PROVIDER_CATALOGUE, DEFAULT_MODELS, modelById, modelsForStep, capabilityLabel,
  defaultControlValues, resolveModelControls,
} from '../gen-models.js';

export default function genModelsTests(check) {
  check('gen-models: ids are unique', new Set(MODEL_CATALOGUE.map((m) => m.id)).size === MODEL_CATALOGUE.length);
  check('gen-models: every entry records capabilities and a licence', MODEL_CATALOGUE.every((m) =>
    Object.hasOwn(m.capabilities, 'multiview') && Object.hasOwn(m.capabilities, 'texture') && !!m.licence));
  check('gen-models: provider catalogue drives reusable connection forms',
    PROVIDER_CATALOGUE['hf-spaces'].fields.some((field) => field.id === 'key' && field.secret) &&
    PROVIDER_CATALOGUE.fal.fields.some((field) => field.id === 'proxyUrl' && field.type === 'url') &&
    PROVIDER_CATALOGUE['tencent-tokenhub'].fields.some((field) => field.id === 'baseUrl' && field.type === 'url'));
  check('gen-models: provider connection schemas are immutable', Object.values(PROVIDER_CATALOGUE).every((provider) =>
    Object.isFrozen(provider) && Object.isFrozen(provider.fields) && provider.fields.every(Object.isFrozen)) &&
    Object.isFrozen(PROVIDER_CATALOGUE.fal.requiredAny));
  check('gen-models: fal adds real choices for edit and single-picture generation',
    modelById('qwen-image-edit-2511-fal').fal.endpoint === 'fal-ai/qwen-image-edit-2511' &&
    modelById('flux-1-schnell-fal').fal.endpoint === 'fal-ai/flux/schnell' &&
    modelsForStep('edit').filter((m) => m.available).length >= 2 &&
    modelsForStep('picture').filter((m) => m.available).length >= 2);
  check('gen-models: fal adds one-view and multiview 3D choices with declared output capabilities',
    modelById('hunyuan3d-v3-fal').steps.includes('views3d') &&
    modelById('hunyuan3d-v3-fal').capabilities.multiview === true &&
    modelById('trellis-2-fal').steps.join() === 'picture3d' &&
    modelById('trellis-2-fal').capabilities.texture === true);
  check('gen-models: Tencent official TokenHub adds a textured single-picture adapter without claiming browser multiview wiring',
    modelById('hunyuan3d-3.1-tokenhub').provider === 'tencent-tokenhub' &&
    modelById('hunyuan3d-3.1-tokenhub').tokenhub.model === 'hy-3d-3.1' &&
    modelById('hunyuan3d-3.1-tokenhub').steps.join() === 'picture3d' &&
    /multiview needs hosted image URLs/.test(modelById('hunyuan3d-3.1-tokenhub').note));
  check('gen-models: every default exists, supports its step and is available', Object.entries(DEFAULT_MODELS).every(([step, id]) => {
    const model = modelById(id);
    return model?.steps.includes(step) && model.available;
  }));
  check('gen-models: texture defaults to an explicit no-op', DEFAULT_MODELS.texture === 'none' &&
    modelById('none').provider === null && modelsForStep('texture').some((m) => m.id === 'none'));
  check('gen-models: 2mv exposes the hosted texture limitation', !modelById('hunyuan3d-2mv').capabilities.texture &&
    /disabled/.test(modelById('hunyuan3d-2mv').note));
  check('gen-models: 2.1 preserves texture by default and explains optional simplification',
    modelById('hunyuan3d-2.1').capabilities.texture === true &&
    /untextured shape/.test(modelById('hunyuan3d-2.1').note));
  const mv = modelById('hunyuan3d-2mv');
  const mvDefaults = defaultControlValues(mv);
  const mvLow = resolveModelControls(mv, {}, 'low');
  check('gen-models: 2mv owns the live Space ranges and defaults',
    mv.controls.parameters.octree_resolution.min === 16 && mv.controls.parameters.octree_resolution.max === 512 &&
    mvDefaults.octree_resolution === 256 && mvDefaults.steps === 5 && mvDefaults.num_chunks === 8000 &&
    mvDefaults.target_face_num === 10000);
  check('gen-models: Hunyuan native detail presets leave face count independent',
    mvLow.octree_resolution === 196 && mvLow.target_face_num === 10000 &&
    resolveModelControls(mv, {}, 'standard').octree_resolution === 256 &&
    resolveModelControls(mv, {}, 'high').octree_resolution === 384 &&
    resolveModelControls(mv, { target_face_num: 23456 }, 'high').target_face_num === 23456 &&
    mvDefaults.reduce_face === false);
  check('gen-models: fal models have no invented named detail presets',
    !modelById('trellis-2-fal').controls.detail && !modelById('hunyuan3d-v3-fal').controls.detail);
  check('gen-models: Hunyuan speed presets come from the Space',
    mv.controls.parameters.steps.levels.map((level) => level.value).join() === '5,10,30');
  const h21 = modelById('hunyuan3d-2.1');
  check('gen-models: 2.1 differs from 2mv where the Space differs',
    defaultControlValues(h21).steps === 30 && defaultControlValues(h21).octree_resolution === 256);
  const fal = modelById('hunyuan3d-v3-fal');
  const trellis = modelById('trellis-2-fal');
  check('gen-models: fal Hunyuan owns its LowPoly-only face range',
    fal.controls.parameters.face_count.when.generate_type === 'LowPoly' &&
    fal.controls.parameters.face_count.min === 40000 && fal.controls.parameters.face_count.max === 1500000 &&
    defaultControlValues(fal).face_count === 500000);
  check('gen-models: TRELLIS owns decimation and enum controls',
    trellis.controls.parameters.decimation_target.min === 5000 &&
    trellis.controls.parameters.decimation_target.max === 2000000 &&
    defaultControlValues(trellis).decimation_target === 500000 &&
    trellis.controls.parameters.resolution.options.join() === '512,1024,1536' &&
    trellis.controls.parameters.texture_size.options.join() === '1024,2048,4096');
  check('gen-models: saved raw values are validated by the model schema',
    resolveModelControls(trellis, { decimation_target: 20000, resolution: 1536, texture_size: 4096 }).decimation_target === 20000 &&
    resolveModelControls(trellis, { decimation_target: -1, resolution: 777 }).decimation_target === 500000 &&
    resolveModelControls(trellis, { decimation_target: -1, resolution: 777 }).resolution === 1024);
  check('gen-models: TRELLIS choices are visible but not falsely enabled',
    !modelById('trellis-community').available && !modelById('trellis-2').available);
  check('gen-models: 2mini records texture but not multiview without pretending it is integrated',
    modelById('hunyuan3d-2mini-turbo').capabilities.texture === true &&
    modelById('hunyuan3d-2mini-turbo').capabilities.multiview === false &&
    !modelById('hunyuan3d-2mini-turbo').available);
  check('gen-models: catalogue and entries are immutable', Object.isFrozen(MODEL_CATALOGUE) &&
    MODEL_CATALOGUE.every((m) => Object.isFrozen(m) && Object.isFrozen(m.capabilities) &&
      (!m.controls || (Object.isFrozen(m.controls) && Object.isFrozen(m.controls.parameters)))));
  check('gen-models: capability labels distinguish yes, no and unverified',
    capabilityLabel(true) === 'Yes' && capabilityLabel(false) === 'No' && capabilityLabel('unverified') === 'Unverified');
  check('gen-models: unknown ids and steps are safe', modelById('missing') === null && modelsForStep('missing').length === 0);
}
