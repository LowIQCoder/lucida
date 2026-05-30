const LATEST_MODEL_URL = "/api/checkpoint/latest";
const ORT_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/ort.min.js";
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/";

importScripts(ORT_SCRIPT_URL);

self.onmessage = async ({ data }) => {
  try {
    const checkpoint = await getCheckpoint();
    const ort = self.ort;
    ort.env.wasm.wasmPaths = ORT_WASM_PATH;
    ort.env.wasm.numThreads = 1;

    const session = await ort.InferenceSession.create(checkpoint.bytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
    checkpoint.bytes = undefined;

    const { tensor, width, height } = data;
    const config = checkpoint.config;
    const [imageInputName, statsInputName] = config.input_names;
    const outputs = await session.run({
      [imageInputName]: new ort.Tensor("float32", tensor, [1, 3, width, height]),
      [statsInputName]: new ort.Tensor("float32", imageStats(tensor, width * height), [1, 18])
    });
    await session.release?.();

    const values = outputs[config.output_name].data;
    const names = config.output_param_names;
    self.postMessage({
      ok: true,
      params: {
        [names[0]]: values[0],
        [names[1]]: values[1],
        [names[2]]: values[2]
      }
    });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

async function getCheckpoint() {
  const response = await fetch(LATEST_MODEL_URL, { cache: "no-store" });
  if (!response.ok) throw new Error(`Model download failed: ${response.status} ${response.statusText}`);

  const contentType = response.headers.get("content-type") || "";
  const configHeader = response.headers.get("x-model-config");
  if (!configHeader) throw new Error("Model config header is missing");

  const bytes = new Uint8Array(await response.arrayBuffer());
  validateModelResponse(bytes, contentType);

  return {
    bytes,
    config: normalizeModelConfig(JSON.parse(configHeader))
  };
}

function normalizeModelConfig(config) {
  return {
    input_names: config.input_param_names,
    output_name: config.output_name,
    output_param_names: config.output_param_names
  };
}

function validateModelResponse(bytes, contentType) {
  if (bytes.byteLength < 16) throw new Error(`Model download too small: ${bytes.byteLength} bytes`);

  const prefix = new TextDecoder().decode(bytes.slice(0, 16));
  if (prefix.trimStart().startsWith("<") || contentType.includes("text/html") || contentType.includes("application/json")) {
    throw new Error(`Model endpoint returned ${contentType || "non-onnx response"}`);
  }
}

function imageStats(tensor, plane) {
  const stats = new Float32Array(18);
  let globalSum = 0;

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

    stats[channel] = sum / plane;
    stats[9 + channel] = min;
    stats[12 + channel] = max;
    globalSum += sum;
  }

  for (let channel = 0; channel < 3; channel += 1) {
    const start = channel * plane;
    let variance = 0;

    for (let i = 0; i < plane; i += 1) {
      const delta = tensor[start + i] - stats[channel];
      variance += delta * delta;
    }

    variance /= plane;
    stats[3 + channel] = Math.sqrt(variance);
    stats[6 + channel] = variance;
  }

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
