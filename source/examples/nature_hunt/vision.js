const Vision = (() => {
  let mobilenet = null;
  let classifier = null;
  let isReady = false;
  const examples = [];

  async function init() {
    const tf = await loadScript(
      'https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@2.8.6/dist/tf.min.js',
      'tf'
    );
    const mobilenetModule = await loadScript(
      'https://cdn.jsdelivr.net/npm/@tensorflow-models/mobilenet@2.1.1/dist/mobilenet.min.js',
      'mobilenet'
    );
    const knnModule = await loadScript(
      'https://cdn.jsdelivr.net/npm/@tensorflow-models/knn-classifier@1.2.6/dist/knn-classifier.min.js',
      'knnClassifier'
    );
    mobilenet = await mobilenetModule.load({ version: 2, alpha: 1.0 });
    classifier = knnModule.create();
    isReady = true;
    return true;
  }

  function loadScript(src, globalName) {
    return new Promise((resolve, reject) => {
      if (window[globalName]) return resolve(window[globalName]);
      const script = document.createElement('script');
      script.src = src;
      script.onload = () => {
        if (window[globalName]) resolve(window[globalName]);
        else reject(new Error(`Global ${globalName} not found after loading ${src}`));
      };
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  function getEmbedding(videoElement) {
    if (!mobilenet || !videoElement || videoElement.readyState < 2) return null;
    return mobilenet.infer(videoElement, true);
  }

  async function teach(videoElement, label) {
    if (!isReady || !classifier) return false;
    const embedding = getEmbedding(videoElement);
    if (!embedding) return false;
    const arr = Array.from(embedding.dataSync());
    classifier.addExample(embedding, label);
    examples.push({ vector: arr, label });
    embedding.dispose();
    return true;
  }

  async function predict(videoElement) {
    if (!isReady || !classifier) return null;
    const embedding = getEmbedding(videoElement);
    if (!embedding) return null;
    const result = await classifier.predictClass(embedding, 3);
    embedding.dispose();
    if (!result || !result.label) return null;
    const maxConfidence = Math.max(...Object.values(result.confidences));
    return {
      label: result.label,
      confidence: maxConfidence,
      confidences: result.confidences,
    };
  }

  function loadDataset(dataset) {
    if (!classifier || !dataset || !dataset.length) return;
    const tf = window.tf;
    for (const item of dataset) {
      const tensor = tf.tensor(item.vector, [1, item.vector.length]);
      classifier.addExample(tensor, item.label);
      tensor.dispose();
      examples.push({ vector: item.vector, label: item.label });
    }
  }

  function exportDataset() {
    return JSON.parse(JSON.stringify(examples));
  }

  function clearAll() {
    if (!classifier) return;
    classifier.clearAllClasses();
    examples.length = 0;
  }

  function removeLabel(label) {
    if (!classifier) return;
    classifier.clearClass(label);
    for (let i = examples.length - 1; i >= 0; i--) {
      if (examples[i].label === label) examples.splice(i, 1);
    }
  }

  function getLabels() {
    const set = new Set(examples.map((e) => e.label));
    return Array.from(set).sort();
  }

  function getClassCount() {
    return getLabels().length;
  }

  return {
    init,
    teach,
    predict,
    loadDataset,
    exportDataset,
    clearAll,
    removeLabel,
    getClassCount,
    getLabels,
    get isReady() { return isReady; },
  };
})();
