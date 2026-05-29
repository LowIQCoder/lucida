import { resolveApiUrl } from "./config.js";

const MODEL_URL = "/api/checkpoints/latest";
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/";
let sessionPromise;

export async function predictParams(imageData) {
  const ort = globalThis.ort;
  if (!ort) throw new Error("ONNX Runtime Web is not loaded");

  const session = await getSession(ort);
  const imageTensor = imageDataToTensor(imageData);
  const feeds = {
    image: new ort.Tensor("float32", imageTensor, [1, 3, imageData.width, imageData.height]),
    stats: new ort.Tensor("float32", imageStats(imageTensor, imageData.width * imageData.height), [1, 18])
  };
  const outputs = await session.run(feeds);
  const values = outputs.params.data;

  return {
    brightness: values[0],
    contrast: values[1],
    saturation: values[2]
  };
}

function getSession(ort) {
  if (!sessionPromise) {
    if (ort.env?.wasm) {
      ort.env.wasm.wasmPaths = ORT_WASM_PATH;
      ort.env.wasm.numThreads = 1;
    }
    sessionPromise = ort.InferenceSession.create(resolveApiUrl(MODEL_URL), {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
  }
  return sessionPromise;
}

function imageDataToTensor(imageData) {
  const { data, width, height } = imageData;
  const plane = width * height;
  const tensor = new Float32Array(3 * plane);

  for (let pixel = 0, source = 0; pixel < plane; pixel += 1, source += 4) {
    const [h, s, v] = rgbToHsv(data[source] / 255, data[source + 1] / 255, data[source + 2] / 255);
    tensor[pixel] = h;
    tensor[plane + pixel] = s;
    tensor[plane * 2 + pixel] = v;
  }

  return tensor;
}

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let h = 0;

  if (delta > 0) {
    if (max === r) h = ((g - b) / delta) % 6;
    else if (max === g) h = (b - r) / delta + 2;
    else h = (r - g) / delta + 4;
    h /= 6;
    if (h < 0) h += 1;
  }

  return [h, max === 0 ? 0 : delta / max, max];
}

function imageStats(tensor, plane) {
  const stats = new Float32Array(18);
  let offset = 0;

  const channelMeans = [];
  for (let channel = 0; channel < 3; channel += 1) {
    const start = channel * plane;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    for (let i = 0; i < plane; i += 1) {
      const value = tensor[start + i];
      sum += value;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    const mean = sum / plane;
    channelMeans[channel] = mean;
    stats[offset + channel] = mean;
    stats[offset + 9 + channel] = min;
    stats[offset + 12 + channel] = max;
  }

  offset = 3;
  for (let channel = 0; channel < 3; channel += 1) {
    const start = channel * plane;
    let variance = 0;
    for (let i = 0; i < plane; i += 1) {
      const delta = tensor[start + i] - channelMeans[channel];
      variance += delta * delta;
    }
    variance /= plane;
    stats[offset + channel] = Math.sqrt(variance);
    stats[offset + 3 + channel] = variance;
  }

  let globalSum = 0;
  for (let i = 0; i < tensor.length; i += 1) globalSum += tensor[i];
  const globalMean = globalSum / tensor.length;
  let globalVariance = 0;
  for (let i = 0; i < tensor.length; i += 1) {
    const delta = tensor[i] - globalMean;
    globalVariance += delta * delta;
  }
  globalVariance /= tensor.length;
  stats[15] = globalMean;
  stats[16] = Math.sqrt(globalVariance);
  stats[17] = globalVariance;

  return stats;
}
