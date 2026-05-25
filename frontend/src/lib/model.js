import { resolveApiUrl } from "./config.js";

const MODEL_URL = "/api/checkpoints/latest";
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/";
let sessionPromise;

export async function predictParams(imageData) {
  const ort = globalThis.ort;
  if (!ort) throw new Error("ONNX Runtime Web is not loaded");

  const session = await getSession(ort);
  const feeds = {
    image: new ort.Tensor("float32", imageDataToTensor(imageData), [1, 3, imageData.width, imageData.height])
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
    tensor[pixel] = data[source] / 255;
    tensor[plane + pixel] = data[source + 1] / 255;
    tensor[plane * 2 + pixel] = data[source + 2] / 255;
  }

  return tensor;
}
