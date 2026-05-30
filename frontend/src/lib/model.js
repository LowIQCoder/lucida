import { imageDataToTensor } from "./preprocess.js";

const CONFIG_URL = "/api/checkpoint/latest/config";
let configPromise;
let worker;
let nextId = 1;
const pending = new Map();

export async function predictParams(imageData) {
  const tensor = imageDataToTensor(imageData);
  return workerRequest("predict", { tensor, width: imageData.width, height: imageData.height }, [tensor.buffer]);
}

export async function preloadModel() {
  await Promise.all([getModelConfig(), workerRequest("preload")]);
}

export function resetModel() {
  if (!worker) return;
  for (const request of pending.values()) request.reject(new Error("Model worker cancelled"));
  pending.clear();
  worker.terminate();
  worker = undefined;
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

function workerRequest(type, payload = {}, transfer = []) {
  const id = nextId++;
  const activeWorker = getWorker();

  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    activeWorker.postMessage({ id, type, ...payload }, transfer);
  });
}

function getWorker() {
  if (worker) return worker;

  worker = new Worker(new URL("./modelWorker.js", import.meta.url));
  worker.onmessage = ({ data }) => {
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (data.ok) request.resolve(data.params);
    else request.reject(new Error(data.error));
  };
  worker.onerror = (error) => {
    for (const request of pending.values()) request.reject(error.error || new Error(error.message));
    pending.clear();
    resetModel();
  };
  return worker;
}

function normalizeModelConfig(config) {
  return {
    input_image_size: Number(config.input_image_size)
  };
}
