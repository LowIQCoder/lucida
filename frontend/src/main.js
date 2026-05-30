import { getModelConfig, predictParams, preloadModel } from "./lib/model.js";
import { applyCorrection } from "./lib/pixels.js";
import { rgbToResizedTensor } from "./lib/preprocess.js";

const DEMO_ORIGINAL = "/src/assets/demo-original.jpg";
const DEMO_ENHANCED = "/src/assets/demo-enhanced.jpg";
const CORRUPTION_EXAMPLES = [
  { label: "Small corruption", image: "/src/assets/demo-corrupted1.jpg" },
  { label: "Medium corruption", image: "/src/assets/demo-corrupted2.jpg" },
  { label: "High corruption", image: "/src/assets/demo-corrupted3.jpg" }
];
const MODEL_DIAGRAM = String.raw`flowchart LR
    image["HSV image<br/>B x 3 x 256 x 256"]
    stats["stats<br/>B x 18"]
    norm["normalize<br/>(image - 0.5) / 0.5"]

    image --> norm

    subgraph encoder["CNN encoder"]
        direction LR
        l1["Level 1<br/>Conv 3x3 stride 2: HSV 3 to 32<br/>BatchNorm + ReLU<br/>ResidualConvBlock 32<br/>B x 32 x 128 x 128"]
        l2["Level 2<br/>Conv 3x3 stride 2: 32 to 64<br/>BatchNorm + ReLU<br/>ResidualConvBlock 64<br/>add proj r1<br/>B x 64 x 64 x 64"]
        l3["Level 3<br/>Conv 3x3 stride 2: 64 to 128<br/>BatchNorm + ReLU<br/>ResidualConvBlock 128<br/>add proj r1 and r2<br/>B x 128 x 32 x 32"]
        l4["Level 4<br/>Conv 3x3 stride 2: 128 to 192<br/>BatchNorm + ReLU<br/>ResidualConvBlock 192<br/>add proj r1 r2 r3<br/>B x 192 x 16 x 16"]
        l5["Level 5<br/>Conv 3x3 stride 2: 192 to 256<br/>BatchNorm + ReLU<br/>ResidualConvBlock 256<br/>add proj r1 r2 r3 r4<br/>B x 256 x 8 x 8"]
    end

    norm --> l1 --> l2 --> l3 --> l4 --> l5

    p1["pool L1<br/>Linear 32 to 32<br/>r1"]
    p2["pool L2<br/>Linear 64 to 32<br/>r2"]
    p3["pool L3<br/>Linear 128 to 32<br/>r3"]
    p4["pool L4<br/>Linear 192 to 32<br/>r4"]
    p5["pool L5<br/>Linear 256 to 32<br/>r5"]

    l1 --> p1
    l2 --> p2
    l3 --> p3
    l4 --> p4
    l5 --> p5

    p1 -.-> l2
    p1 -.-> l3
    p1 -.-> l4
    p1 -.-> l5
    p2 -.-> l3
    p2 -.-> l4
    p2 -.-> l5
    p3 -.-> l4
    p3 -.-> l5
    p4 -.-> l5

    finalPool["final pool<br/>AdaptiveAvgPool2d 1<br/>flatten: B x 256"]
    concat["concat<br/>final pool B x 256<br/>stats B x 18<br/>r1..r5 B x 160<br/>total B x 434"]

    l5 --> finalPool --> concat
    stats --> concat
    p1 --> concat
    p2 --> concat
    p3 --> concat
    p4 --> concat
    p5 --> concat

    subgraph head["MLP head"]
        direction LR
        h1["Linear<br/>434 to 128"]
        h2["ReLU"]
        h3["Dropout<br/>p = 0.15"]
        h4["Linear<br/>128 to 3"]
    end

    concat --> h1 --> h2 --> h3 --> h4
    neutral["add neutral<br/>0.0 1.0 1.0"]
    output["params<br/>brightness contrast saturation"]
    h4 --> neutral --> output

    classDef inputNode fill:#d9e9ff,stroke:#3577c8,stroke-width:2px,color:#172033;
    classDef conv fill:#def4e7,stroke:#2f8f5b,stroke-width:2px,color:#172033;
    classDef residual fill:#fff0d8,stroke:#c87919,stroke-width:2px,color:#172033;
    classDef headNode fill:#eadfff,stroke:#7957c8,stroke-width:2px,color:#172033;
    classDef outputNode fill:#def4e7,stroke:#2f8f5b,stroke-width:2px,color:#172033;

    class image,stats inputNode;
    class l1,l2,l3,l4,l5 conv;
    class p1,p2,p3,p4,p5,neutral residual;
    class concat,h1,h2,h3,h4 headNode;
    class output outputNode;`;

const app = document.querySelector("#app");

let originalUrl;
let resultUrl;
let busy = false;

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
          <h2>CNN encoder combines HSV image features with handcrafted stats.</h2>
        </div>
        <div class="mermaid-card">
          <pre class="mermaid">${escapeHtml(MODEL_DIAGRAM)}</pre>
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

  renderMermaid();
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
              <input id="file" type="file" accept="image/jpeg,image/png,image/bmp,image/webp" />
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
          <a id="download" class="primary-action disabled" aria-disabled="true">Download</a>
        </aside>
      </section>
      ${footer()}
    </main>
  `;

  document.querySelector("#file").addEventListener("change", handleFile);
  setupDropZone();
}

function nav(active) {
  return `
    <nav class="nav">
      <a class="brand" href="#about">Lucida</a>
      <div class="nav-links">
        <a class="${active === "about" ? "active" : ""}" href="#about">About</a>
        <a class="${active === "work" ? "active" : ""}" href="#work">Work</a>
        <a class="${active === "enhance" ? "active" : ""}" href="#enhance">Enhance</a>
      </div>
    </nav>
  `;
}

function renderMermaid() {
  const mermaid = globalThis.mermaid;
  if (!mermaid) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "loose",
    theme: "base",
    themeVariables: {
      fontFamily: "Inter, ui-sans-serif, system-ui",
      primaryColor: "#def4e7",
      lineColor: "#536158",
      textColor: "#172033"
    }
  });
  mermaid.run({ querySelector: ".mermaid" });
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
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
  status.textContent = "Downloading model...";

  try {
    await preloadModel();
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
  await processFile(file);
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
    const file = [...event.dataTransfer.files].find((item) => item.type.startsWith("image/"));
    if (!file) {
      setStatus("drop image file", 0);
      return;
    }
    await processFile(file);
  });
}

async function processFile(file) {
  if (!file || busy) return;
  if (!file.type.startsWith("image/")) {
    setStatus("unsupported file", 0);
    return;
  }

  busy = true;
  resetUi();
  const startedAt = performance.now();

  try {
    originalUrl = URL.createObjectURL(file);
    document.querySelector("#before").src = originalUrl;

    setStatus("decoding", 10);
    const bitmap = await createImageBitmap(file);

    setStatus("model inference", 35);
    const modelConfig = await getModelConfig();
    const preview = makePreview(bitmap, modelConfig);
    const params = await predictParams(preview);

    setStatus("enhancing", 70);
    const blob = await enhanceBitmap(bitmap, params);
    bitmap.close();

    resultUrl = URL.createObjectURL(blob);
    const download = document.querySelector("#download");
    document.querySelector("#after").src = resultUrl;
    download.href = resultUrl;
    download.download = "enhanced.jpg";
    download.classList.remove("disabled");
    download.setAttribute("aria-disabled", "false");

    document.querySelector("#brightness").textContent = Number(params.brightness).toFixed(3);
    document.querySelector("#contrast").textContent = Number(params.contrast).toFixed(3);
    document.querySelector("#saturation").textContent = Number(params.saturation).toFixed(3);
    document.querySelector("#time").textContent = `${((performance.now() - startedAt) / 1000).toFixed(2)} s`;
    setStatus("done", 100);
  } catch (error) {
    document.querySelector("#status").textContent = error instanceof Error ? error.message : String(error);
  } finally {
    busy = false;
  }
}

function makePreview(bitmap, modelConfig) {
  const size = modelConfig.input_image_size;
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = getContext(canvas);
  context.drawImage(bitmap, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  return {
    width: size,
    height: size,
    tensor: rgbToResizedTensor(imageData, size, size, modelConfig)
  };
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
  document.querySelector("#status").textContent = status;
  document.querySelector("#progress").value = value;
  document.querySelector("#progressText").textContent = `${value}%`;
}

function resetUi() {
  cleanupUrls();
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
  setStatus("waiting", 0);
}

function cleanupUrls() {
  if (originalUrl) URL.revokeObjectURL(originalUrl);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  originalUrl = undefined;
  resultUrl = undefined;
}
