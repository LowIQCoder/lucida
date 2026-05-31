export function imageDataToTensor(imageData) {
  if (imageData.tensor) return imageData.tensor;
  return rgbToResizedTensor(imageData, imageData.width, imageData.height);
}

export function imageDataToTensorAndStats(imageData) {
  if (imageData.tensor && imageData.stats) return { tensor: imageData.tensor, stats: imageData.stats };
  return rgbToResizedTensorAndStats(imageData, imageData.width, imageData.height);
}

export function rgbToResizedTensor(imageData, targetWidth, targetHeight) {
  return rgbToResizedTensorAndStats(imageData, targetWidth, targetHeight).tensor;
}

export function rgbToResizedTensorAndStats(imageData, targetWidth, targetHeight) {
  const { data, width, height } = imageData;
  if (width !== targetWidth || height !== targetHeight) return resizeViaCanvas(imageData, targetWidth, targetHeight);

  const plane = width * height;
  const tensor = new Float32Array(plane * 3);
  const stats = new Float32Array(18);
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  let rSquareSum = 0;
  let gSquareSum = 0;
  let bSquareSum = 0;
  let rMin = Infinity;
  let gMin = Infinity;
  let bMin = Infinity;
  let rMax = -Infinity;
  let gMax = -Infinity;
  let bMax = -Infinity;

  for (let pixel = 0, source = 0; pixel < plane; pixel += 1, source += 4) {
    const r = data[source] / 255;
    const g = data[source + 1] / 255;
    const b = data[source + 2] / 255;

    tensor[pixel] = r;
    tensor[plane + pixel] = g;
    tensor[plane * 2 + pixel] = b;

    rSum += r;
    gSum += g;
    bSum += b;
    rSquareSum += r * r;
    gSquareSum += g * g;
    bSquareSum += b * b;
    if (r < rMin) rMin = r;
    if (g < gMin) gMin = g;
    if (b < bMin) bMin = b;
    if (r > rMax) rMax = r;
    if (g > gMax) gMax = g;
    if (b > bMax) bMax = b;
  }

  fillStats(stats, plane, rSum, gSum, bSum, rSquareSum, gSquareSum, bSquareSum, rMin, gMin, bMin, rMax, gMax, bMax);
  return { tensor, stats };
}

function resizeViaCanvas(imageData, width, height) {
  const source = document.createElement("canvas");
  source.width = imageData.width;
  source.height = imageData.height;
  source.getContext("2d").putImageData(imageData, 0, 0);

  const target = document.createElement("canvas");
  target.width = width;
  target.height = height;
  target.getContext("2d").drawImage(source, 0, 0, width, height);
  return rgbToResizedTensorAndStats(target.getContext("2d").getImageData(0, 0, width, height), width, height);
}

function fillStats(stats, plane, rSum, gSum, bSum, rSquareSum, gSquareSum, bSquareSum, rMin, gMin, bMin, rMax, gMax, bMax) {
  const rMean = rSum / plane;
  const gMean = gSum / plane;
  const bMean = bSum / plane;
  const rVariance = Math.max(0, rSquareSum / plane - rMean * rMean);
  const gVariance = Math.max(0, gSquareSum / plane - gMean * gMean);
  const bVariance = Math.max(0, bSquareSum / plane - bMean * bMean);
  const globalMean = (rSum + gSum + bSum) / (plane * 3);
  const globalVariance = Math.max(0, (rSquareSum + gSquareSum + bSquareSum) / (plane * 3) - globalMean * globalMean);

  stats[0] = rMean;
  stats[1] = gMean;
  stats[2] = bMean;
  stats[3] = Math.sqrt(rVariance);
  stats[4] = Math.sqrt(gVariance);
  stats[5] = Math.sqrt(bVariance);
  stats[6] = rVariance;
  stats[7] = gVariance;
  stats[8] = bVariance;
  stats[9] = rMin;
  stats[10] = gMin;
  stats[11] = bMin;
  stats[12] = rMax;
  stats[13] = gMax;
  stats[14] = bMax;
  stats[15] = globalMean;
  stats[16] = Math.sqrt(globalVariance);
  stats[17] = globalVariance;
}
