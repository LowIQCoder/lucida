import { imageDataToTensor, imageStats } from "./preprocess.js";

const LATEST_MODEL_URL = "/api/checkpoint/latest";
const ORT_WASM_PATH = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/";
let sessionPromise;
let checkpointPromise;

export async function predictParams(imageData) {
  const ort = getOrt();
  const modelConfig = await getModelConfig();
  const session = await getSession();
  const imageTensor = imageDataToTensor(imageData, modelConfig);

  const outputs = await session.run(createFeeds(ort, imageData, imageTensor, modelConfig));
  return toParams(outputs[modelConfig.output_name].data, modelConfig.output_param_names);
}

export async function preloadModel() {
  await getSession();
}

export async function getModelConfig() {
  const checkpoint = await getCheckpoint();
  return checkpoint.config;
}

async function getSession() {
  if (!sessionPromise) {
    const ort = getOrt();
    const checkpoint = await getCheckpoint();
    if (ort.env?.wasm) {
      ort.env.wasm.wasmPaths = ORT_WASM_PATH;
      ort.env.wasm.numThreads = 1;
    }
    sessionPromise = ort.InferenceSession.create(checkpoint.bytes, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all"
    });
  }
  return sessionPromise;
}

function createFeeds(ort, imageData, imageTensor, modelConfig) {
  const { width, height } = imageData;
  const [imageInputName, statsInputName] = modelConfig.input_names;

  return {
    [imageInputName]: new ort.Tensor("float32", imageTensor, [1, 3, width, height]),
    [statsInputName]: new ort.Tensor("float32", imageStats(imageTensor, width * height), [1, 18])
  };
}

function toParams(values, names) {
  return {
    [names[0]]: values[0],
    [names[1]]: values[1],
    [names[2]]: values[2]
  };
}

async function getCheckpoint() {
  if (!checkpointPromise) {
    checkpointPromise = fetch(LATEST_MODEL_URL, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Model download failed: ${response.status} ${response.statusText}`);
      }

      const contentType = response.headers.get("content-type") || "";
      const configHeader = response.headers.get("x-model-config");
      if (!configHeader) throw new Error("Model config header is missing");

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      validateModelResponse(bytes, contentType);

      return {
        bytes,
        config: normalizeModelConfig(JSON.parse(configHeader))
      };
    });
  }

  return checkpointPromise;
}

function normalizeModelConfig(config) {
  return {
    input_image_size: Number(config.input_image_size),
    color_scheme: config.color_scheme,
    input_names: config.input_param_names,
    output_name: config.output_name,
    output_param_names: config.output_param_names
  };
}

function validateModelResponse(bytes, contentType) {
  if (bytes.byteLength < 16) {
    throw new Error(`Model download too small: ${bytes.byteLength} bytes`);
  }

  const prefix = new TextDecoder().decode(bytes.slice(0, 16));
  if (prefix.trimStart().startsWith("<") || contentType.includes("text/html") || contentType.includes("application/json")) {
    throw new Error(`Model endpoint returned ${contentType || "non-onnx response"}`);
  }
}

function getOrt() {
  const ort = globalThis.ort;
  if (!ort) throw new Error("ONNX Runtime Web is not loaded");
  return ort;
}
