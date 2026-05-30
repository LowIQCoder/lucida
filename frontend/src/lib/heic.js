const HEIC_SCRIPT_URL = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
let heicPromise;

export function isHeic(file) {
  const name = file.name.toLowerCase();
  return file.type === "image/heic" || file.type === "image/heif" || name.endsWith(".heic") || name.endsWith(".heif");
}

export async function decodeHeic(file) {
  const heic2any = await loadHeic2Any();
  const blob = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
  return Array.isArray(blob) ? blob[0] : blob;
}

function loadHeic2Any() {
  if (globalThis.heic2any) return Promise.resolve(globalThis.heic2any);
  if (!heicPromise) {
    heicPromise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = HEIC_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = "anonymous";
      script.onload = () => (globalThis.heic2any ? resolve(globalThis.heic2any) : reject(new Error("HEIC decoder failed to load")));
      script.onerror = () => reject(new Error("HEIC decoder failed to load"));
      document.head.append(script);
    });
  }
  return heicPromise;
}
