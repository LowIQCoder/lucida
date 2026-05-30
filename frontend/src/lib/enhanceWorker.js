self.onmessage = async ({ data }) => {
  try {
    const { bitmap, params } = data;
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("2D canvas context is unavailable");

    context.drawImage(bitmap, 0, 0);
    bitmap.close?.();

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    applyCorrection(imageData.data, params);
    context.putImageData(imageData, 0, 0);

    const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.92 });
    self.postMessage({ ok: true, blob });
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
};

function applyCorrection(data, params) {
  const brightness = params.brightness * 255;
  const contrast = params.contrast;
  const saturation = params.saturation;

  for (let i = 0; i < data.length; i += 4) {
    let r = (data[i] - 128) * contrast + 128 + brightness;
    let g = (data[i + 1] - 128) * contrast + 128 + brightness;
    let b = (data[i + 2] - 128) * contrast + 128 + brightness;

    const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    r = gray + (r - gray) * saturation;
    g = gray + (g - gray) * saturation;
    b = gray + (b - gray) * saturation;

    data[i] = clampByte(r);
    data[i + 1] = clampByte(g);
    data[i + 2] = clampByte(b);
  }
}

function clampByte(value) {
  return Math.min(255, Math.max(0, value));
}
