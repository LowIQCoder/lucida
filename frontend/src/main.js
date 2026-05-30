import { imageEnhancer, isSupportedImage } from "./lib/enhancer.js";

const DEMO_ORIGINAL = "/src/assets/demo-original.jpg";
const DEMO_ENHANCED = "/src/assets/demo-enhanced.jpg";
const CORRUPTION_EXAMPLES = [
  { label: "Small corruption", image: "/src/assets/demo-corrupted1.jpg" },
  { label: "Medium corruption", image: "/src/assets/demo-corrupted2.jpg" },
  { label: "High corruption", image: "/src/assets/demo-corrupted3.jpg" }
];
const app = document.querySelector("#app");

let originalUrl;
let resultUrl;
let currentTaskId;

window.addEventListener("hashchange", render);
render();

function route() {
  const name = location.hash.replace("#", "");
  return ["about", "work", "enhance"].includes(name) ? name : "about";
}

function render() {
  cleanupUrls();
  if (route() === "enhance") renderEnhancePage();
  else if (route() === "work") renderWorkPage();
  else renderAboutPage();
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
            <img class="compare-after" src="${DEMO_ENHANCED}" alt="Enhanced bright desk photo" />
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

function renderWorkPage() {
  app.innerHTML = `
    <main class="site work-site">
      ${nav("work")}
      <section class="work-hero">
        <p class="eyebrow">Project work</p>
        <h1>DWhat  have been done</h1>
        <p class="lead">This page describes what was built: data generation, CNN model, checkpoint delivery, and browser-side enhancement pipeline.</p>
      </section>

      <section class="work-section two-column-section">
        <div>
          <p class="eyebrow">Dataset description</p>
          <h2>Original images plus synthetic corruption.</h2>
          <div class="corruption-examples">
            ${CORRUPTION_EXAMPLES.map((example) => `
              <figure>
                <img src="${example.image}" alt="${example.label} example" />
                <figcaption>${example.label}</figcaption>
              </figure>
            `).join("")}
          </div>
        </div>
        <div class="info-list">
          <article>
            <h3>Source data</h3>
            <p>Dataset starts from 2000 original images collected through WikiMediaAPI.</p>
          </article>
          <article>
            <h3>Corrupted samples</h3>
            <p>Processed dataset contains 10,000 samples: 1,000 original, 2,500 small corruption, and 6,500 high corruption examples.</p>
          </article>
          <article>
            <h3>Target task</h3>
            <p>Model does not generate pixels. It predicts correction parameters, then browser applies them to source image.</p>
          </article>
        </div>
      </section>

      <section class="work-section">
        <div class="section-head">
          <p class="eyebrow">Model architecture</p>
          <h2>CNN encoder combines RGB image features with handcrafted stats.</h2>
        </div>
        <div class="arch-grid">
          <article><span>01</span><h3>Image encoder</h3><p>Downsampled RGB image passes through compact CNN blocks.</p></article>
          <article><span>02</span><h3>Stats branch</h3><p>Mean, variance, min, and max values add global color context.</p></article>
          <article><span>03</span><h3>MLP head</h3><p>Head predicts brightness, contrast, and saturation parameters.</p></article>
        </div>
      </section>

      <section class="work-section two-column-section">
        <div>
          <p class="eyebrow">App architecture</p>
          <h2>Small backend, browser inference, clear delivery path.</h2>
        </div>
        <div class="app-flow">
          <article>
            <span>01</span>
            <h3>Latest model checkpoint</h3>
            <p>ONNX file stored as versioned checkpoint. Frontend asks API for latest checkpoint when user starts work.</p>
          </article>
          <article>
            <span>02</span>
            <h3>Backend app</h3>
            <p>FastAPI collects logs and delivers model checkpoint to user. It does not run ML inference.</p>
          </article>
          <article>
            <span>03</span>
            <h3>Frontend app</h3>
            <p>Frontend loads model with ONNX Runtime Web, runs prediction, applies Canvas enhancement, manages drag and drop, preview, and download.</p>
          </article>
        </div>
      </section>
      ${footer()}
    </main>
  `;
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
              <input id="file" type="file" accept="${imageEnhancer.ACCEPTED_IMAGES}" />
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
  setupDropZone();
}

function nav(active) {
  return `
    <nav class="nav">
      <a class="brand" href="#about">Lucida</a>
      <div class="nav-links">
        <a class="${active === "about" ? "active" : ""}" href="#about">About</a>
        <a class="${active === "work" ? "active" : ""}" href="#work">Work Done</a>
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
    const file = [...event.dataTransfer.files].find(isSupportedImage);
    if (!file) {
      setStatus("drop image file", 0);
      return;
    }
    await processFile(file);
  });
}

function processFile(file) {
  if (!file) return;
  if (!isSupportedImage(file)) {
    setStatus("unsupported file", 0);
    return;
  }

  if (currentTaskId) imageEnhancer.cancel(currentTaskId);
  resetUi();
  originalUrl = URL.createObjectURL(file);
  document.querySelector("#before").src = originalUrl;

  try {
    currentTaskId = imageEnhancer.enqueue(file);
    setCancelEnabled(true);
  } catch (error) {
    document.querySelector("#status").textContent = error instanceof Error ? error.message : String(error);
  }
}

function handleCancel() {
  if (!currentTaskId) return;
  imageEnhancer.cancel(currentTaskId);
}

function setStatus(status, value) {
  document.querySelector("#status").textContent = status;
  document.querySelector("#progress").value = value;
  document.querySelector("#progressText").textContent = `${value}%`;
}

function resetUi() {
  cleanupUrls();
  currentTaskId = undefined;
  document.querySelector("#before").removeAttribute("src");
  document.querySelector("#after").removeAttribute("src");
  const download = document.querySelector("#download");
  download.classList.add("disabled");
  download.removeAttribute("href");
  download.setAttribute("aria-disabled", "true");
  document.querySelector("#time").textContent = "-";
  document.querySelector("#brightness").textContent = "-";
  document.querySelector("#contrast").textContent = "-";
  document.querySelector("#saturation").textContent = "-";
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
  const cancel = document.querySelector("#cancel");
  if (!cancel) return;
  cancel.disabled = !enabled;
  cancel.classList.toggle("disabled", !enabled);
}

imageEnhancer.addEventListener("statuschange", async ({ detail }) => {
  if (detail.id !== currentTaskId) return;

  setStatus(detail.status, detail.progress);
  document.querySelector("#time").textContent = `${(detail.elapsedMs / 1000).toFixed(2)} s`;

  if (detail.params) {
    document.querySelector("#brightness").textContent = Number(detail.params.brightness).toFixed(3);
    document.querySelector("#contrast").textContent = Number(detail.params.contrast).toFixed(3);
    document.querySelector("#saturation").textContent = Number(detail.params.saturation).toFixed(3);
  }

  if (detail.status === "done") {
    resultUrl = URL.createObjectURL(imageEnhancer.getResult(detail.id));
    const download = document.querySelector("#download");
    document.querySelector("#after").src = resultUrl;
    download.href = resultUrl;
    download.download = "enhanced.jpg";
    download.classList.remove("disabled");
    download.setAttribute("aria-disabled", "false");
    setCancelEnabled(false);
    return;
  }

  if (detail.status === "failed") {
    document.querySelector("#status").textContent = detail.error || "failed";
    setCancelEnabled(false);
    return;
  }

  if (detail.status === "cancelled") setCancelEnabled(false);
});
