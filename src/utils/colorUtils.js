// Dictionary of standard colors and their RGB values (matching color_detector.ipynb)
const COLORS = {
  "Red": [255, 0, 0],
  "Green": [0, 255, 0],
  "Blue": [0, 0, 255],
  "Yellow": [255, 255, 0],
  "Orange": [255, 128, 0],
  "Purple": [128, 0, 128],
  "Pink": [255, 192, 203],
  "Cyan": [0, 255, 255],
  "Magenta": [255, 0, 255],
  "Brown": [165, 42, 42],
  "White": [255, 255, 255],
  "Black": [0, 0, 0],
  "Gray": [128, 128, 128]
};

/**
 * Compares the given RGB values to a predefined list and returns the closest color name.
 * Uses Euclidean distance squared.
 */
export function getColorName(r, g, b) {
  let minDistance = Infinity;
  let closestName = "Unknown";

  for (const [name, [cr, cg, cb]] of Object.entries(COLORS)) {
    const distance = Math.pow(r - cr, 2) + Math.pow(g - cg, 2) + Math.pow(b - cb, 2);
    if (distance < minDistance) {
      minDistance = distance;
      closestName = name;
    }
  }

  return closestName;
}

/**
 * Simple K-Means clustering algorithm for RGB colors in JavaScript.
 * Returns the dominant color [R, G, B].
 */
export function getDominantColor(imageData, k = 4, maxIterations = 10) {
  const data = imageData.data;
  const pixels = [];
  
  // Extract RGB values, ignoring alpha for simplicity 
  // and improving performance by sampling every Nth pixel.
  // The input image should already be a downsampled roi for performance.
  for (let i = 0; i < data.length; i += 4) {
    // Ignore fully transparent pixels or extremely dark/bright outliers if needed,
    // but we'll stick to basic clustering here.
    pixels.push([data[i], data[i+1], data[i+2]]);
  }

  if (pixels.length === 0) return [0, 0, 0];

  // Initialize centroids by picking random pixels
  let centroids = [];
  for (let i = 0; i < k; i++) {
    const randomIndex = Math.floor(Math.random() * pixels.length);
    centroids.push([...pixels[randomIndex]]);
  }

  let assignments = new Array(pixels.length).fill(0);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    // 1. Assign each pixel to nearest centroid
    let changed = false;
    for (let i = 0; i < pixels.length; i++) {
      let minDistance = Infinity;
      let closestCluster = 0;
      for (let c = 0; c < k; c++) {
        const dist = Math.pow(pixels[i][0] - centroids[c][0], 2) + 
                     Math.pow(pixels[i][1] - centroids[c][1], 2) + 
                     Math.pow(pixels[i][2] - centroids[c][2], 2);
        if (dist < minDistance) {
          minDistance = dist;
          closestCluster = c;
        }
      }
      if (assignments[i] !== closestCluster) {
        assignments[i] = closestCluster;
        changed = true;
      }
    }

    if (!changed) break; // Early convergence

    // 2. Recalculate centroids
    const sums = Array.from({ length: k }, () => [0, 0, 0]);
    const counts = new Array(k).fill(0);

    for (let i = 0; i < pixels.length; i++) {
      const cluster = assignments[i];
      sums[cluster][0] += pixels[i][0];
      sums[cluster][1] += pixels[i][1];
      sums[cluster][2] += pixels[i][2];
      counts[cluster]++;
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        centroids[c] = [
          Math.round(sums[c][0] / counts[c]),
          Math.round(sums[c][1] / counts[c]),
          Math.round(sums[c][2] / counts[c])
        ];
      }
    }
  }

  // Find the cluster with the most pixels
  const finalCounts = new Array(k).fill(0);
  for (let i = 0; i < assignments.length; i++) {
    finalCounts[assignments[i]]++;
  }

  let dominantCluster = 0;
  let maxCount = 0;
  for (let c = 0; c < k; c++) {
    if (finalCounts[c] > maxCount) {
      maxCount = finalCounts[c];
      dominantCluster = c;
    }
  }

  return centroids[dominantCluster];
}
