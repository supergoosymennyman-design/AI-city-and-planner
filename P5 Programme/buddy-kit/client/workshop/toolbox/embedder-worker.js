// One image graph off the UI thread. The host transfers one bitmap at a time.
let model;
self.onmessage = async function ({data}) {
  try {
    if (data.kind === 'init') {
      const vision = await import(data.bundle);
      const fileset = await vision.FilesetResolver.forVisionTasks(data.wasm);
      model = await vision.ImageEmbedder.createFromOptions(fileset, {
        baseOptions:{modelAssetPath:data.model}, quantize:false,
        canvas:new OffscreenCanvas(224,224),
      });
      self.postMessage({id:data.id,ok:true});
    } else {
      const result = model.embed(data.bitmap);
      const vec = new Float32Array(result.embeddings[0].floatEmbedding);
      self.postMessage({id:data.id,vec},[vec.buffer]);
    }
  } catch(e) { self.postMessage({id:data.id,error:String(e.message || e)}); }
  finally { if(data.bitmap) data.bitmap.close(); }
};
