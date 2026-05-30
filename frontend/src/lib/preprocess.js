export function imageDataToTensor(imageData) {
  if (imageData.tensor) return imageData.tensor;
  return rgbToResizedTensor(imageData, imageData.width, imageData.height);
}

export function rgbToResizedTensor(imageData, targetWidth, targetHeight) {
  const { data, width, height } = imageData;
  if (width !== targetWidth || height !== targetHeight) return resizeViaCanvas(imageData, targetWidth, targetHeight);

  const plane = width * height;
  const tensor = new Float32Array(plane * 3);

  for (let pixel = 0, source = 0; pixel < plane; pixel += 1, source += 4) {
    tensor[pixel] = data[source] / 255;
    tensor[plane + pixel] = data[source + 1] / 255;
    tensor[plane * 2 + pixel] = data[source + 2] / 255;
  }

  return tensor;
}

function quantizeByte(value) {
  return Math.round(Math.min(1, Math.max(0, value)) * 255) / 255;
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
  return rgbToResizedTensor(target.getContext("2d").getImageData(0, 0, width, height), width, height);
}
