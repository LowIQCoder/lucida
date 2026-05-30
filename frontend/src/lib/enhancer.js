import { decodeHeic, isHeic } from "./heic.js";
import { getModelConfig, predictParams, preloadModel, resetModel } from "./model.js";
import { rgbToResizedTensor } from "./preprocess.js";

const ACCEPTED_IMAGES = "image/jpeg,image/png,image/bmp,image/heic,image/heif,.heic,.heif";
const MAX_INPUT_PIXELS = 15_000_000;
const tasks = new Map();
const events = new EventTarget();
let nextTaskId = 1;

export const imageEnhancer = {
  ACCEPTED_IMAGES,
  enqueue,
  getStatus,
  cancel,
  getResult,
  addEventListener: (...args) => events.addEventListener(...args),
  removeEventListener: (...args) => events.removeEventListener(...args),
  preloadModel
};

globalThis.LucidaEnhancer = imageEnhancer;

export function enqueue(file) {
  if (!isSupportedImage(file)) throw new Error("Unsupported image format");

  const id = String(nextTaskId++);
  const task = {
    id,
    file,
    status: "queued",
    progress: 0,
    abortController: new AbortController(),
    worker: undefined,
    workerReject: undefined,
    result: undefined,
    params: undefined,
    error: undefined,
    startedAt: performance.now(),
    finishedAt: undefined
  };
  tasks.set(id, task);
  updateTask(task, "queued", 0);
  task.promise = runTask(task);
  return id;
}

export function getStatus(id) {
  const task = requireTask(id);
  return snapshot(task);
}

export function cancel(id) {
  const task = requireTask(id);
  if (["done", "failed", "cancelled"].includes(task.status)) return { id, cancelled: false, status: task.status };

  task.abortController.abort();
  task.worker?.terminate();
  task.workerReject?.(new Error("Task cancelled"));
  task.workerReject = undefined;
  resetModel();
  updateTask(task, "cancelled", task.progress);
  return { id, cancelled: true, status: task.status };
}

export function getResult(id) {
  const task = requireTask(id);
  if (task.status !== "done") throw new Error(`Task is not done: ${task.status}`);
  return task.result;
}

export function isSupportedImage(file) {
  const type = file.type.toLowerCase();
  return type === "image/jpeg" || type === "image/png" || type === "image/bmp" || isHeic(file);
}

async function runTask(task) {
  try {
    assertActive(task);
    updateTask(task, "loading model", 5);
    const modelReady = preloadModel();

    updateTask(task, isHeic(task.file) ? "converting HEIC" : "decoding", 10);
    const source = await toBrowserImage(task.file);
    assertActive(task);

    const bitmap = await createImageBitmap(source);
    let bitmapSentToWorker = false;
    try {
      validatePixels(bitmap);

      updateTask(task, "model inference", 35);
      const modelConfig = await getModelConfig();
      const preview = makePreview(bitmap, modelConfig);
      await modelReady;
      assertActive(task);

      task.params = await predictParams(preview);
      assertActive(task);

      updateTask(task, "enhancing", 70);
      bitmapSentToWorker = true;
      task.result = await enhanceBitmap(task, bitmap, task.params);
      task.finishedAt = performance.now();
      updateTask(task, "done", 100);
    } finally {
      if (!bitmapSentToWorker) bitmap.close?.();
    }
  } catch (error) {
    if (task.abortController.signal.aborted) return;
    task.error = error instanceof Error ? error.message : String(error);
    task.finishedAt = performance.now();
    updateTask(task, "failed", task.progress);
  }
}

async function toBrowserImage(file) {
  return isHeic(file) ? decodeHeic(file) : file;
}

function validatePixels(bitmap) {
  const pixels = bitmap.width * bitmap.height;
  if (pixels > MAX_INPUT_PIXELS) throw new Error(`Image too large: ${pixels} px. Max: ${MAX_INPUT_PIXELS} px`);
}

function makePreview(bitmap, modelConfig) {
  const size = modelConfig.input_image_size;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = getContext(canvas);
  context.drawImage(bitmap, 0, 0, size, size);
  return {
    width: size,
    height: size,
    tensor: rgbToResizedTensor(context.getImageData(0, 0, size, size), size, size)
  };
}

function enhanceBitmap(task, bitmap, params) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./enhanceWorker.js", import.meta.url));
    task.worker = worker;
    worker.onmessage = ({ data }) => {
      task.worker = undefined;
      task.workerReject = undefined;
      worker.terminate();
      if (data.ok) resolve(data.blob);
      else reject(new Error(data.error));
    };
    worker.onerror = (error) => {
      task.worker = undefined;
      task.workerReject = undefined;
      worker.terminate();
      reject(error.error || new Error(error.message));
    };
    task.workerReject = reject;
    worker.postMessage({ bitmap, params }, [bitmap]);
  });
}

function updateTask(task, status, progress) {
  task.status = status;
  task.progress = progress;
  const detail = snapshot(task);
  events.dispatchEvent(new CustomEvent("statuschange", { detail }));
}

function snapshot(task) {
  return {
    id: task.id,
    status: task.status,
    progress: task.progress,
    params: task.params,
    error: task.error,
    elapsedMs: (task.finishedAt || performance.now()) - task.startedAt
  };
}

function requireTask(id) {
  const task = tasks.get(String(id));
  if (!task) throw new Error(`Task not found: ${id}`);
  return task;
}

function assertActive(task) {
  if (task.abortController.signal.aborted) throw new Error("Task cancelled");
}

function getContext(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas context is unavailable");
  return context;
}
