/**
 * space-signatures.js — the parameter names each hosted Space actually accepts.
 *
 * Read from each Space's own live schema on 2026-09-22 (Gradio 4 serves it at /info, Gradio 5 at
 * /gradio_api/info) and frozen here so the payload builders can be checked in Node.
 *
 * WHY this fixture exists: @gradio/client rejects any key that is not in the endpoint's signature
 * ("Parameter `x` is not a valid keyword argument") BEFORE it submits anything, so one stray key
 * makes a model impossible to choose, instantly and every time. That is exactly what a hardcoded
 * `caption` did to tencent/Hunyuan3D-2.1: it has no such parameter, while tencent/Hunyuan3D-2mv
 * does, and nothing in the suite could see the difference because no test knew either signature.
 *
 * To refresh: curl the Space's info URL and re-read named_endpoints[<endpoint>].parameters. Do NOT
 * edit these lists to make a test pass — a mismatch means the payload is wrong, not the fixture.
 */
export const SPACE_PARAMETERS = Object.freeze({
  'tencent/Hunyuan3D-2mv': Object.freeze({
    // Gradio 4.44.1. Note the leading `caption`, which 2.1 does not have.
    '/shape_generation': Object.freeze(['caption', 'image', 'mv_image_front', 'mv_image_back',
      'mv_image_left', 'mv_image_right', 'steps', 'guidance_scale', 'seed', 'octree_resolution',
      'check_box_rembg', 'num_chunks', 'randomize_seed']),
    '/generation_all': Object.freeze(['caption', 'image', 'mv_image_front', 'mv_image_back',
      'mv_image_left', 'mv_image_right', 'steps', 'guidance_scale', 'seed', 'octree_resolution',
      'check_box_rembg', 'num_chunks', 'randomize_seed']),
    '/on_export_click': Object.freeze(['file_out', 'file_out2', 'file_type', 'reduce_face',
      'export_texture', 'target_face_num']),
  }),
  'tencent/Hunyuan3D-2.1': Object.freeze({
    // Gradio 4.44.0. No `caption` on either endpoint; the four mv_image_* slots ARE accepted, so
    // this Space is genuinely multiview-capable and may be chosen for the four-view step.
    '/shape_generation': Object.freeze(['image', 'mv_image_front', 'mv_image_back', 'mv_image_left',
      'mv_image_right', 'steps', 'guidance_scale', 'seed', 'octree_resolution', 'check_box_rembg',
      'num_chunks', 'randomize_seed']),
    '/generation_all': Object.freeze(['image', 'mv_image_front', 'mv_image_back', 'mv_image_left',
      'mv_image_right', 'steps', 'guidance_scale', 'seed', 'octree_resolution', 'check_box_rembg',
      'num_chunks', 'randomize_seed']),
    '/on_export_click': Object.freeze(['file_out', 'file_out2', 'file_type', 'reduce_face',
      'export_texture', 'target_face_num']),
  }),
  'Qwen/Qwen-Image-Edit-2511': Object.freeze({
    // Gradio 5. `images` is a gallery: each item is {image, caption}, so a caption DOES belong there.
    '/infer': Object.freeze(['images', 'prompt', 'seed', 'randomize_seed', 'true_guidance_scale',
      'num_inference_steps', 'height', 'width', 'rewrite_prompt']),
  }),
  'black-forest-labs/FLUX.1-schnell': Object.freeze({
    '/infer': Object.freeze(['prompt', 'seed', 'randomize_seed', 'width', 'height', 'num_inference_steps']),
  }),
});
