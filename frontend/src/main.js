const DEMO_ORIGINAL = "/src/assets/demo-original.jpg";
const DEMO_ENHANCED = "/src/assets/demo-enhanced.png";
const ACCEPTED_IMAGES = "image/jpeg,image/png,image/bmp,image/heic,image/heif,.heic,.heif";
const app = document.querySelector("#app");

let originalUrl;
let resultUrl;
let currentTaskId;
let enhancerModulePromise;
let currentAbort;
let ui = {};

window.addEventListener("hashchange", render);
render();

function route() {
  const name = location.hash.replace("#", "");
  return ["about", "enhance"].includes(name) ? name : "about";
}

function render() {
  const currentRoute = route();
  if (currentRoute !== "enhance") cancelActiveTask();
  cleanupUrls();
  if (currentRoute === "enhance") renderEnhancePage();
  else renderAboutPage();
}

function cancelActiveTask() {
  if (!currentTaskId) return;
  const id = currentTaskId;
  currentTaskId = undefined;
  currentAbort?.abort();
  enhancerModulePromise?.then(({ imageEnhancer }) => imageEnhancer.cancel(id));
}

function renderAboutPage() {
  app.innerHTML = `
    <main class="site">
      ${nav("about")}
      <section class="about-hero">
        <div class="hero-copy">
          <p class="eyebrow">VK Practice Project</p>
          <h1>Recover brightness, saturation and contrast of an image</h1>
          <p class="lead">Small CNN predicts brightness, contrast, and saturation values in fully locally in your browser browser!</p>
          <div class="hero-actions">
            <button id="tryButton" class="primary-action">Try yourself</button>
            <span id="tryStatus" class="try-status">Tap to load model and test!</span>
          </div>
        </div>
        <div class="compare-card">
          <div class="compare" id="compare" style="--split: 52%">
            <img src="${DEMO_ORIGINAL}" alt="Original dim desk photo" />
            <img class="compare-after" src="${DEMO_ENHANCED}" alt="Enhanced bright desk photo preview" />
            <span class="divider" aria-hidden="true"></span>
          </div>
          <input id="compareSlider" class="compare-slider" type="range" min="0" max="100" value="52" aria-label="Before and after comparison" />
        </div>
      </section>

      <section class="flow-section">
        <div>
          <p class="eyebrow">How it works</p>
          <h2>Four-step path from training data to final image.</h2>
        </div>
        <div class="flow-diagram">
          <article class="flow-step">
            <span>01</span>
            <h3>Model training</h3>
            <p>Train CNN model on 10,000 samples with none, small, and high corruption levels.</p>
          </article>
          <article class="flow-step">
            <span>02</span>
            <h3>Model delivery</h3>
            <p>Deliver latest model checkpoint directly to user. After download, no server inference needed.</p>
          </article>
          <article class="flow-step">
            <span>03</span>
            <h3>Enhance image</h3>
            <p>Enhance image in browser with local ONNX Runtime and Canvas. No network delay or server inference error.</p>
          </article>
          <article class="flow-step">
            <span>04</span>
            <h3>Final image</h3>
            <p>Download generated result with enhanced brightness, contrast, and saturation.</p>
          </article>
        </div>
      </section>
      ${footer()}
    </main>
  `;

  document.querySelector("#compareSlider").addEventListener("input", (event) => {
    document.querySelector("#compare").style.setProperty("--split", `${event.target.value}%`);
  });

  document.querySelector("#tryButton").addEventListener("click", handleTry);
}

function renderEnhancePage() {
  app.innerHTML = `
    <main class="site enhance-site">
      ${nav("enhance")}
      <section class="enhance-layout">
        <section class="studio">
          <header class="studio-head">
            <div>
              <p class="eyebrow">Enhancing workspace</p>
              <h1>Drop one photo, get one correction.</h1>
            </div>
            <label class="upload-button" title="Choose image">
              <span aria-hidden="true">+</span>
              <span>Choose image</span>
              <input id="file" type="file" accept="${ACCEPTED_IMAGES}" />
            </label>
          </header>

          <section id="dropZone" class="preview-grid drop-zone" aria-label="Drop image here">
            <figure class="preview">
              <figcaption>Original</figcaption>
              <img id="before" alt="" />
              <div class="empty-state">
                <strong>Drop image</strong>
                <span>or use Choose image</span>
              </div>
            </figure>
            <figure class="preview preview-accent">
              <figcaption>Enhanced</figcaption>
              <img id="after" alt="" />
              <div class="empty-state">
                <strong>Result</strong>
                <span>appears here</span>
              </div>
            </figure>
          </section>
        </section>

        <aside class="control-panel">
          <div class="status-row">
            <span aria-hidden="true">i</span>
            <div>
              <strong id="status">waiting</strong>
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
          <button id="cancel" class="primary-action disabled" type="button" disabled>Cancel</button>
          <a id="download" class="primary-action disabled" aria-disabled="true">Download</a>
        </aside>
      </section>
      ${footer()}
    </main>
  `;

  document.querySelector("#file").addEventListener("change", handleFile);
  document.querySelector("#cancel").addEventListener("click", handleCancel);
  cacheEnhanceUi();
  setupDropZone();
}

function nav(active) {
  return `
    <nav class="nav">
      <a class="brand" href="#about">Lucida</a>
      <div class="nav-links">
        <a class="${active === "about" ? "active" : ""}" href="#about">About</a>
        <a class="${active === "enhance" ? "active" : ""}" href="#enhance">Enhance</a>
      </div>
    </nav>
  `;
}

function footer() {
  return `
    <footer class="footer">
      <div>
        <strong>Lucida</strong>
        <span><a href="https://github.com/LowIQCoder/lucida">Click here<a></span>
      </div>
      <div>
        <strong>Author</strong>
        <span>Marsel Berheev</span> 
        <span><a href="https://github.com/LowIQCoder">LowIQCoder</span>
        <span><a href="mailto:marselberheev@mail.ru">marselberheev@mail.ru<a></span>
      </div>
    </footer>
  `;
}

async function handleTry() {
  const button = document.querySelector("#tryButton");
  const status = document.querySelector("#tryStatus");
  button.disabled = true;
  status.textContent = "Checking model...";

  try {
    const { imageEnhancer } = await loadEnhancer();
    await imageEnhancer.preloadModel();
    status.textContent = "Ready";
    location.hash = "enhance";
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : String(error);
    button.disabled = false;
  }
}

async function handleFile() {
  const input = document.querySelector("#file");
  const file = input.files?.[0];
  processFile(file);
}

function setupDropZone() {
  const dropZone = document.querySelector("#dropZone");
  if (!dropZone) return;

  ["dragenter", "dragover"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      dropZone.classList.add("is-dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      dropZone.classList.remove("is-dragging");
    });
  });

  dropZone.addEventListener("drop", async (event) => {
    const file = [...event.dataTransfer.files].find(isAcceptedFile);
    if (!file) {
      setStatus("drop image file", 0);
      return;
    }
    await processFile(file);
  });
}

async function processFile(file) {
  if (!file) return;
  currentAbort?.abort();
  currentAbort = new AbortController();
  const { signal } = currentAbort;

  if (!isAcceptedFile(file)) {
    setStatus("unsupported file", 0);
    return;
  }

  const { imageEnhancer, isSupportedImage } = await loadEnhancer();
  if (signal.aborted) return;
  if (!isSupportedImage(file)) {
    setStatus("unsupported file", 0);
    return;
  }

  if (currentTaskId) imageEnhancer.cancel(currentTaskId);
  resetUi();
  originalUrl = await makePreviewUrl(file);
  if (signal.aborted) {
    cleanupUrls();
    return;
  }
  ui.before.src = originalUrl;

  try {
    currentTaskId = imageEnhancer.enqueue(file);
    setCancelEnabled(true);
  } catch (error) {
    document.querySelector("#status").textContent = error instanceof Error ? error.message : String(error);
  }
}

function handleCancel() {
  if (!currentTaskId) return;
  currentAbort?.abort();
  loadEnhancer().then(({ imageEnhancer }) => imageEnhancer.cancel(currentTaskId));
}

function isAcceptedFile(file) {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type === "image/jpeg" || type === "image/png" || type === "image/bmp" || type === "image/heic" || type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

function setStatus(status, value) {
  if (!ui.status) return;
  ui.status.textContent = status;
  ui.progress.value = value;
  ui.progressText.textContent = `${value}%`;
}

function resetUi() {
  cleanupUrls();
  currentTaskId = undefined;
  ui.before?.removeAttribute("src");
  ui.after?.removeAttribute("src");
  ui.download?.classList.add("disabled");
  ui.download?.removeAttribute("href");
  ui.download?.setAttribute("aria-disabled", "true");
  if (ui.time) ui.time.textContent = "-";
  if (ui.brightness) ui.brightness.textContent = "-";
  if (ui.contrast) ui.contrast.textContent = "-";
  if (ui.saturation) ui.saturation.textContent = "-";
  setCancelEnabled(false);
  setStatus("waiting", 0);
}

function cleanupUrls() {
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  originalUrl = undefined;
  resultUrl = undefined;
}

function setCancelEnabled(enabled) {
  if (!ui.cancel) return;
  ui.cancel.disabled = !enabled;
  ui.cancel.classList.toggle("disabled", !enabled);
}

function cacheEnhanceUi() {
  ui = {
    file: document.querySelector("#file"),
    before: document.querySelector("#before"),
    after: document.querySelector("#after"),
    status: document.querySelector("#status"),
    progress: document.querySelector("#progress"),
    progressText: document.querySelector("#progressText"),
    time: document.querySelector("#time"),
    brightness: document.querySelector("#brightness"),
    contrast: document.querySelector("#contrast"),
    saturation: document.querySelector("#saturation"),
    cancel: document.querySelector("#cancel"),
    download: document.querySelector("#download")
  };
}

async function makePreviewUrl(file, maxSide = 1200) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(width, height) : document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d", { alpha: false }).drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = canvas.convertToBlob
      ? await canvas.convertToBlob({ type: "image/jpeg", quality: 0.72 })
      : await new Promise((resolve, reject) => canvas.toBlob((item) => (item ? resolve(item) : reject(new Error("Preview encode failed"))), "image/jpeg", 0.72));
    return URL.createObjectURL(blob);
  } catch {
    return URL.createObjectURL(file);
  }
}

function loadEnhancer() {
  if (!enhancerModulePromise) {
    enhancerModulePromise = import("./lib/enhancer.js").then((module) => {
      module.imageEnhancer.addEventListener("statuschange", handleTaskStatus);
      return module;
    });
  }
  return enhancerModulePromise;
}

async function handleTaskStatus({ detail }) {
  if (detail.id !== currentTaskId) return;

  setStatus(detail.status, detail.progress);
  if (ui.time) ui.time.textContent = `${(detail.elapsedMs / 1000).toFixed(2)} s`;

  if (detail.params) {
    if (ui.brightness) ui.brightness.textContent = Number(detail.params.brightness).toFixed(3);
    if (ui.contrast) ui.contrast.textContent = Number(detail.params.contrast).toFixed(3);
    if (ui.saturation) ui.saturation.textContent = Number(detail.params.saturation).toFixed(3);
  }

  if (detail.status === "done") {
    const { imageEnhancer } = await loadEnhancer();
    resultUrl = URL.createObjectURL(imageEnhancer.getResult(detail.id));
    imageEnhancer.release(detail.id);
    if (ui.after) ui.after.src = resultUrl;
    if (ui.download) {
      ui.download.href = resultUrl;
      ui.download.download = "enhanced.jpg";
      ui.download.classList.remove("disabled");
      ui.download.setAttribute("aria-disabled", "false");
    }
    setCancelEnabled(false);
    return;
  }

  if (detail.status === "failed") {
    if (ui.status) ui.status.textContent = detail.error || "failed";
    setCancelEnabled(false);
    return;
  }

  if (detail.status === "cancelled") setCancelEnabled(false);
}
