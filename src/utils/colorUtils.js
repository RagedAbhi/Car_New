/**
 * Dictionary of standard colors and their reference Hue values (HSL).
 * This is more robust than RGB distance for different lighting.
 */
const COLOR_MAP = [
  { name: "Red", h: 0, s: [0.4, 1], l: [0.2, 0.7] },
  { name: "Orange", h: 30, s: [0.4, 1], l: [0.3, 0.8] },
  { name: "Yellow", h: 60, s: [0.4, 1], l: [0.3, 0.8] },
  { name: "Green", h: 120, s: [0.3, 1], l: [0.2, 0.7] },
  { name: "Cyan", h: 180, s: [0.3, 1], l: [0.3, 0.8] },
  { name: "Blue", h: 220, s: [0.3, 1], l: [0.2, 0.7] },
  { name: "Purple", h: 280, s: [0.3, 1], l: [0.2, 0.7] },
  { name: "Pink", h: 330, s: [0.3, 1], l: [0.4, 0.8] },
  { name: "Brown", h: 20, s: [0.2, 0.5], l: [0.1, 0.4] }
];

/**
 * Converts RGB to HSL.
 */
export function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return [Math.round(h * 360), s, l];
}

/**
 * Compares the given RGB values to HSL ranges and returns the closest color name.
 * Uses HSL logic to handle shadows and saturation properly.
 */
export function getColorName(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);

  // Black/White/Gray check first (L and S based)
  if (l < 0.15) return "Black";
  if (l > 0.85 && s < 0.2) return "White";
  if (s < 0.15) return "Gray";

  // Find closest hue
  let minDiff = 360;
  let closestColor = "Gray";

  for (const color of COLOR_MAP) {
    // Hue wrap-around for Red (can be 0 or 360)
    let diff = Math.abs(h - color.h);
    if (diff > 180) diff = 360 - diff;

    if (diff < minDiff) {
      minDiff = diff;
      closestColor = color.name;
    }
  }

  return closestColor;
}

/**
 * Simple K-Means clustering algorithm for RGB colors.
 * Optimized with pre-filtering to ignore extreme shadows and highlights.
 */
export function getDominantColor(imageData, k = 3, maxIterations = 8) {
  const data = imageData.data;
  const pixels = [];
  
  // 1. Pre-filter and Sample
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const avg = (r + g + b) / 3;
    
    // Ignore extreme shadows (dark tires/road) and extreme highlights (chrome/glare)
    if (avg > 25 && avg < 230) {
      pixels.push([r, g, b]);
    }
  }

  if (pixels.length === 0) return [128, 128, 128]; // Default Gray

  // 2. K-Means (Simplified for Speed)
  let centroids = [];
  for (let i = 0; i < k; i++) {
    centroids.push([...pixels[Math.floor(Math.random() * pixels.length)]]);
  }

  let assignments = new Array(pixels.length);
  
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < pixels.length; i++) {
      let minDist = Infinity;
      let cluster = 0;
      for (let c = 0; c < k; c++) {
        const d = Math.pow(pixels[i][0] - centroids[c][0], 2) + 
                  Math.pow(pixels[i][1] - centroids[c][1], 2) + 
                  Math.pow(pixels[i][2] - centroids[c][2], 2);
        if (d < minDist) {
          minDist = d;
          cluster = c;
        }
      }
      if (assignments[i] !== cluster) {
        assignments[i] = cluster;
        changed = true;
      }
    }

    if (!changed) break;

    const sums = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < pixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += pixels[i][0];
      sums[c][1] += pixels[i][1];
      sums[c][2] += pixels[i][2];
      sums[c][3]++;
    }

    for (let c = 0; c < k; c++) {
      if (sums[c][3] > 0) {
        centroids[c] = [
          Math.round(sums[c][0] / sums[c][3]),
          Math.round(sums[c][1] / sums[c][3]),
          Math.round(sums[c][2] / sums[c][3])
        ];
      }
    }
  }

  // 3. Select Largest Cluster
  const counts = new Array(k).fill(0);
  for (let i = 0; i < pixels.length; i++) counts[assignments[i]]++;
  
  let dominant = 0;
  for (let c = 1; c < k; c++) if (counts[c] > counts[dominant]) dominant = c;

  return centroids[dominant];
}
