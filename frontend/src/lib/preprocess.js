import { rgbToHsv } from "./color.js";

export function imageDataToTensor(imageData, modelConfig) {
  if (imageData.tensor) return imageData.tensor;
  if (imageData.hsvTensor) return imageData.hsvTensor;

  return rgbToResizedTensor(imageData, imageData.width, imageData.height, modelConfig);
}

export function rgbToResizedTensor(imageData, targetWidth, targetHeight, modelConfig) {
  const colorScheme = normalizeColorScheme(modelConfig.color_scheme);
  if (colorScheme === "hsv") return rgbToResizedHsvTensor(imageData, targetWidth, targetHeight);
  if (colorScheme === "rgb") return rgbToResizedRgbTensor(imageData, targetWidth, targetHeight);
  throw new Error(`Unsupported model color scheme: ${modelConfig.color_scheme}`);
}

export function rgbToResizedHsvTensor(imageData, targetWidth, targetHeight) {
  const { data, width, height } = imageData;
  const sourcePlane = width * height;
  const hsv = new Float32Array(sourcePlane * 3);

  for (let pixel = 0, source = 0; pixel < sourcePlane; pixel += 1, source += 4) {
    const [h, s, v] = rgbToHsv(data[source] / 255, data[source + 1] / 255, data[source + 2] / 255);
    hsv[pixel] = quantizeByte(h);
    hsv[sourcePlane + pixel] = quantizeByte(s);
    hsv[sourcePlane * 2 + pixel] = quantizeByte(v);
  }

  return resizeTensorPlanes(hsv, width, height, targetWidth, targetHeight);
}

function rgbToResizedRgbTensor(imageData, targetWidth, targetHeight) {
  const { data, width, height } = imageData;
  const sourcePlane = width * height;
  const rgb = new Float32Array(sourcePlane * 3);

  for (let pixel = 0, source = 0; pixel < sourcePlane; pixel += 1, source += 4) {
    rgb[pixel] = data[source] / 255;
    rgb[sourcePlane + pixel] = data[source + 1] / 255;
    rgb[sourcePlane * 2 + pixel] = data[source + 2] / 255;
  }

  return resizeTensorPlanes(rgb, width, height, targetWidth, targetHeight);
}

function resizeTensorPlanes(source, width, height, targetWidth, targetHeight) {
  const sourcePlane = width * height;
  const targetPlane = targetWidth * targetHeight;
  const resized = new Float32Array(targetPlane * 3);

  for (let channel = 0; channel < 3; channel += 1) {
    resizePlaneBilinear(
      source,
      channel * sourcePlane,
      resized,
      channel * targetPlane,
      width,
      height,
      targetWidth,
      targetHeight
    );
  }
  return resized;
}

export function imageStats(tensor, plane) {
  const stats = new Float32Array(18);
  const channelMeans = [];

  for (let channel = 0; channel < 3; channel += 1) {
    const start = channel * plane;
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < plane; i += 1) {
      const value = tensor[start + i];
      sum += value;
      if (value < min) min = value;
      if (value > max) max = value;
    }

    const mean = sum / plane;
    channelMeans[channel] = mean;
    stats[channel] = mean;
    stats[9 + channel] = min;
    stats[12 + channel] = max;
  }

  for (let channel = 0; channel < 3; channel += 1) {
    const start = channel * plane;
    let variance = 0;

    for (let i = 0; i < plane; i += 1) {
      const delta = tensor[start + i] - channelMeans[channel];
      variance += delta * delta;
    }

    variance /= plane;
    stats[3 + channel] = Math.sqrt(variance);
    stats[6 + channel] = variance;
  }

  let globalSum = 0;
  for (let i = 0; i < tensor.length; i += 1) globalSum += tensor[i];

  const globalMean = globalSum / tensor.length;
  let globalVariance = 0;
  for (let i = 0; i < tensor.length; i += 1) {
    const delta = tensor[i] - globalMean;
    globalVariance += delta * delta;
  }

  globalVariance /= tensor.length;
  stats[15] = globalMean;
  stats[16] = Math.sqrt(globalVariance);
  stats[17] = globalVariance;

  return stats;
}

function resizePlaneBilinear(source, sourceOffset, target, targetOffset, sourceWidth, sourceHeight, targetWidth, targetHeight) {
  const xScale = sourceWidth / targetWidth;
  const yScale = sourceHeight / targetHeight;

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = Math.max(0, (y + 0.5) * yScale - 0.5);
    const y0 = Math.floor(sourceY);
    const y1 = Math.min(sourceHeight - 1, y0 + 1);
    const yWeight = sourceY - y0;

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = Math.max(0, (x + 0.5) * xScale - 0.5);
      const x0 = Math.floor(sourceX);
      const x1 = Math.min(sourceWidth - 1, x0 + 1);
      const xWeight = sourceX - x0;

      const top = lerp(source[sourceOffset + y0 * sourceWidth + x0], source[sourceOffset + y0 * sourceWidth + x1], xWeight);
      const bottom = lerp(source[sourceOffset + y1 * sourceWidth + x0], source[sourceOffset + y1 * sourceWidth + x1], xWeight);
      target[targetOffset + y * targetWidth + x] = quantizeByte(lerp(top, bottom, yWeight));
    }
  }
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function quantizeByte(value) {
  return Math.round(Math.min(1, Math.max(0, value)) * 255) / 255;
}

function normalizeColorScheme(value) {
  return String(value || "HSV").trim().toLowerCase();
}
