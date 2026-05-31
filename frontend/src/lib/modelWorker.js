const LATEST_MODEL_URL = "/api/checkpoint/latest";
const ORT_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.25.1/dist/ort.wasm.min.js";
const ORT_WASM_BASE = new URL("./", self.location.href).href;
const ORT_WASM_PATHS = {
  "ort-wasm-simd-threaded.mjs": `${ORT_WASM_BASE}ort-wasm-simd-threaded.mjs`,
  "ort-wasm-simd-threaded.wasm": `${ORT_WASM_BASE}ort-wasm-simd-threaded.wasm`
};

let checkpointPromise;
let sessionPromise;

importScripts(ORT_SCRIPT_URL);

self.onmessage = async ({ data }) => {
  try {
    if (data.type === "preload") {
      await getSession();
      self.postMessage({ id: data.id, ok: true });
      return;
    }

    if (data.type === "predict") {
      const { session, config } = await getSession();
      const { tensor, stats, width, height } = data;
      const [imageInputName, statsInputName] = config.input_names;
      const outputs = await session.run({
        [imageInputName]: new self.ort.Tensor("float32", tensor, [1, 3, width, height]),
        [statsInputName]: new self.ort.Tensor("float32", stats, [1, 18])
      });

      const values = outputs[config.output_name].data;
      const names = config.output_param_names;
      self.postMessage({
        id: data.id,
        ok: true,
        params: {
          [names[0]]: values[0],
          [names[1]]: values[1],
          [names[2]]: values[2]
        }
      });
    }
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = (async () => {
      const checkpoint = await getCheckpoint();
      const ort = self.ort;
      ort.env.logLevel = "fatal";
      ort.env.wasm.wasmPaths = ORT_WASM_PATHS;
      ort.env.wasm.numThreads = 1;

      const session = await ort.InferenceSession.create(checkpoint.bytes, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: checkpoint.format === "ort" ? "disabled" : "all"
      });
      checkpoint.bytes = undefined;
      return { session, config: checkpoint.config };
    })();
  }
  return sessionPromise;
}

async function getCheckpoint() {
  if (!checkpointPromise) {
    checkpointPromise = fetch(LATEST_MODEL_URL, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`Model download failed: ${response.status} ${response.statusText}`);

      const contentType = response.headers.get("content-type") || "";
      const configHeader = response.headers.get("x-model-config");
      if (!configHeader) throw new Error("Model config header is missing");

      const bytes = new Uint8Array(await response.arrayBuffer());
      validateModelResponse(bytes, contentType);

      return {
        bytes,
        format: (response.headers.get("x-model-format") || "onnx").toLowerCase(),
        config: normalizeModelConfig(JSON.parse(configHeader))
      };
    });
  }
  return checkpointPromise;
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
