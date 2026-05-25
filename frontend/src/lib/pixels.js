const clampByte = (value) => Math.min(255, Math.max(0, value));

export function applyCorrection(data, params) {
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
