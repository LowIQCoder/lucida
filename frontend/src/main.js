import { predictParams } from "./lib/model.js";
import { applyCorrection } from "./lib/pixels.js";

const PREVIEW_SIZE = 384;

const app = document.querySelector("#app");

app.innerHTML = `
  <main class="shell">
    <section class="workspace">
      <header class="topbar">
        <div>
          <h1>Image Enhancer</h1>
          <p>ONNX model runs locally in browser</p>
        </div>
        <label class="upload" title="Choose image">
          <span aria-hidden="true">+</span>
          <span>Choose image</span>
          <input id="file" type="file" accept="image/jpeg,image/png,image/bmp,image/webp" />
        </label>
      </header>

      <section class="preview-grid">
        <figure class="preview">
          <figcaption>Original</figcaption>
          <img id="before" alt="" />
        </figure>
        <figure class="preview">
          <figcaption>Enhanced</figcaption>
          <img id="after" alt="" />
        </figure>
      </section>
    </section>

    <aside class="panel">
      <div class="status-row">
        <span aria-hidden="true">i</span>
        <div>
          <strong id="status">Waiting</strong>
          <span id="progressText">0%</span>
        </div>
      </div>
      <progress id="progress" max="100" value="0"></progress>
      <dl class="metrics">
        <div><dt>Time</dt><dd id="time">-</dd></div>
        <div><dt>Brightness</dt><dd id="brightness">-</dd></div>
        <div><dt>Contrast</dt><dd id="contrast">-</dd></div>
        <div><dt>Saturation</dt><dd id="saturation">-</dd></div>
      </dl>
      <a id="download" class="primary disabled" aria-disabled="true">Download</a>
    </aside>
  </main>
`;

const input = document.querySelector("#file");
const before = document.querySelector("#before");
const after = document.querySelector("#after");
const progress = document.querySelector("#progress");
const progressText = document.querySelector("#progressText");
const statusText = document.querySelector("#status");
const timeText = document.querySelector("#time");
const brightnessText = document.querySelector("#brightness");
const contrastText = document.querySelector("#contrast");
const saturationText = document.querySelector("#saturation");
const download = document.querySelector("#download");

let originalUrl;
let resultUrl;
let busy = false;

input.addEventListener("change", async () => {
  const file = input.files?.[0];
  if (!file || busy) return;

  busy = true;
  resetUi();
  const startedAt = performance.now();

  try {
    originalUrl = URL.createObjectURL(file);
    before.src = originalUrl;

    setStatus("decoding", 10);
    const bitmap = await createImageBitmap(file);

    setStatus("model inference", 35);
    const preview = makePreview(bitmap);
    const params = await predictParams(preview);

    setStatus("enhancing", 70);
    const blob = await enhanceBitmap(bitmap, params);
    bitmap.close();

    resultUrl = URL.createObjectURL(blob);
    after.src = resultUrl;
    download.href = resultUrl;
    download.download = "enhanced.jpg";
    download.classList.remove("disabled");
    download.setAttribute("aria-disabled", "false");

    brightnessText.textContent = Number(params.brightness).toFixed(3);
    contrastText.textContent = Number(params.contrast).toFixed(3);
    saturationText.textContent = Number(params.saturation).toFixed(3);
    timeText.textContent = `${((performance.now() - startedAt) / 1000).toFixed(2)} s`;
    setStatus("done", 100);
  } catch (error) {
    statusText.textContent = error instanceof Error ? error.message : String(error);
  } finally {
    busy = false;
  }
});

function makePreview(bitmap) {
  const canvas = document.createElement("canvas");
  canvas.width = PREVIEW_SIZE;
  canvas.height = PREVIEW_SIZE;
  const context = getContext(canvas);
  context.drawImage(bitmap, 0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
  return context.getImageData(0, 0, PREVIEW_SIZE, PREVIEW_SIZE);
}

async function enhanceBitmap(bitmap, params) {
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = getContext(canvas);
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  applyCorrection(imageData.data, params);
  context.putImageData(imageData, 0, 0);
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Image encode failed"))), "image/jpeg", 0.92);
  });
}

function getContext(canvas) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2D canvas context is unavailable");
  return context;
}

function setStatus(status, value) {
  statusText.textContent = status;
  progress.value = value;
  progressText.textContent = `${value}%`;
}

function resetUi() {
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  originalUrl = undefined;
  resultUrl = undefined;
  before.removeAttribute("src");
  after.removeAttribute("src");
  download.classList.add("disabled");
  download.removeAttribute("href");
  download.setAttribute("aria-disabled", "true");
  timeText.textContent = "-";
  brightnessText.textContent = "-";
  contrastText.textContent = "-";
  saturationText.textContent = "-";
  setStatus("waiting", 0);
}
