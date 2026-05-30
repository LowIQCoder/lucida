import { imageDataToTensor } from "./preprocess.js";

const CONFIG_URL = "/api/checkpoint/latest/config";
let configPromise;

export async function predictParams(imageData) {
  const tensor = imageDataToTensor(imageData);
  return runWorker(tensor, imageData.width, imageData.height);
}

export async function preloadModel() {
  await getModelConfig();
}

export async function getModelConfig() {
  if (!configPromise) {
    configPromise = fetch(CONFIG_URL, { cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error(`Model config failed: ${response.status} ${response.statusText}`);
      return normalizeModelConfig(await response.json());
    });
  }
  return configPromise;
}

function runWorker(tensor, width, height) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./modelWorker.js", import.meta.url));
    worker.onmessage = ({ data }) => {
      worker.terminate();
      if (data.ok) resolve(data.params);
      else reject(new Error(data.error));
    };
    worker.onerror = (error) => {
      worker.terminate();
      reject(error.error || new Error(error.message));
    };
    worker.postMessage({ tensor, width, height }, [tensor.buffer]);
  });
}

function normalizeModelConfig(config) {
  return {
    input_image_size: Number(config.input_image_size)
  };
}
