/**
 * Dictionary of standard colors and their reference Hue values (HSL).
 * High-precision car mapping including Metallic and Common Two-Tones.
 */
const COLOR_MAP = [
  { name: "Red", h: 0, s: [0.35, 1], l: [0.2, 0.7] },
  { name: "Orange", h: 30, s: [0.35, 1], l: [0.3, 0.8] },
  { name: "Yellow", h: 60, s: [0.35, 1], l: [0.3, 0.8] },
  { name: "Green", h: 120, s: [0.22, 1], l: [0.12, 0.75] },
  { name: "Cyan", h: 180, s: [0.22, 1], l: [0.2, 0.85] },
  { name: "Blue", h: 220, s: [0.22, 1], l: [0.12, 0.75] },
  { name: "Purple", h: 280, s: [0.22, 1], l: [0.12, 0.75] },
  { name: "Pink", h: 330, s: [0.22, 1], l: [0.35, 0.85] },
  { name: "Brown", h: 20, s: [0.15, 0.45], l: [0.08, 0.45] },
  { name: "Cream/Tan", h: 40, s: [0.1, 0.35], l: [0.55, 0.9] }
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
 * Enhanced Color Naming: Distinguishes between Silver, Gray, and Paints.
 */
export function getColorName(r, g, b) {
  const [h, s, l] = rgbToHsl(r, g, b);

  // 1. Differentiate Neutral/Metallic
  if (l < 0.12) return "Black"; 
  if (l > 0.88 && s < 0.15) return "White";
  
  // Metallic/Grayscale refined logic (Wider thresholds for Silver)
  if (s < 0.22) {
    if (l > 0.45 && l <= 0.85) return "Silver"; 
    if (l > 0.15 && l <= 0.45) return "Dark Gray";
    if (l <= 0.15) return "Black";
    return "White";
  }

  // 2. Chromatic Paint
  let minDiff = 360;
  let closestColor = "Gray";

  for (const color of COLOR_MAP) {
    let diff = Math.abs(h - color.h);
    if (diff > 180) diff = 360 - diff;
    if (diff < minDiff) {
      minDiff = diff;
      closestColor = color.name;
    }
  }

  // Filter out Sky Blue reflections on Silver/Gray cars
  if (closestColor === "Blue" && s < 0.3 && l > 0.4) {
    return "Silver";
  }

  return closestColor;
}

/**
 * Advanced K-Means with 'Chromatic Priority'.
 * Optimized for low-resolution noise and multi-color vehicles.
 * Returns up to 2 dominant colors.
 */
export function getDominantColors(imageData, k = 4, maxIterations = 12) {
  const data = imageData.data;
  const pixels = [];
  
  // 1. Smart Paint Filter: Exclude Shadows, Glares, and Neutrals
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    const [h, s, l] = rgbToHsl(r, g, b);
    
    // Logic: IGNORE 
    // - Black/Shadows (L < 0.15)
    // - White/Glare (L > 0.9)
    // - Extreme Neutrals (S < 0.12 - unless it's the primary metallic theme)
    if (l > 0.15 && l < 0.9) {
      if (s > 0.12 || (l > 0.3 && l < 0.8)) { // Allow grayscale only in mid-range for silver/gray cars
        pixels.push([r, g, b]);
      }
    }
  }

  // Fallback to Mid-Range pixels if filter was too aggressive
  const finalPixels = pixels.length >= 15 ? pixels : Array.from({length: data.length/4}, (_, i) => {
    const r = data[i*4], g = data[i*4+1], b = data[i*4+2];
    const avg = (r+g+b)/3;
    return (avg > 40 && avg < 220) ? [r, g, b] : null;
  }).filter(p => p !== null);

  // 2. Clustering (Standard K-Means)
  let centroids = [];
  for (let i = 0; i < k; i++) {
    centroids.push([...finalPixels[Math.floor(Math.random() * finalPixels.length)]]);
  }

  let assignments = new Array(finalPixels.length);
  for (let iter = 0; iter < maxIterations; iter++) {
    let changed = false;
    for (let i = 0; i < finalPixels.length; i++) {
      let minDist = Infinity;
      let cluster = 0;
      for (let c = 0; c < k; c++) {
        const d = Math.pow(finalPixels[i][0] - centroids[c][0], 2) + 
                  Math.pow(finalPixels[i][1] - centroids[c][1], 2) + 
                  Math.pow(finalPixels[i][2] - centroids[c][2], 2);
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
    for (let i = 0; i < finalPixels.length; i++) {
      const c = assignments[i];
      sums[c][0] += finalPixels[i][0];
      sums[c][1] += finalPixels[i][1];
      sums[c][2] += finalPixels[i][2];
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

  // 3. Selection with 'Chromatic Priority' & 'Multi-Color Detection'
  const clusterData = centroids.map((rgb, idx) => {
    const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const count = assignments.filter(a => a === idx).length;
    const name = getColorName(rgb[0], rgb[1], rgb[2]);
    
    // Weight: Prefer colors over gray/black/white unless they are dominant
    const vibranceBonus = s > 0.2 ? 1.5 : 1.0;
    const weight = count * vibranceBonus;

    return { name, count, weight, rgb, s, l };
  });

  // Sort by weight (highest influence first)
  const sortedClusters = clusterData.sort((a, b) => b.weight - a.weight);

  // Return the primary or top two colors if significant (two-tone)
  const topColor = sortedClusters[0].name;
  const secondColor = sortedClusters[1];

  // If a second color exists and is significantly different/large, return both
  if (secondColor && secondColor.count > (finalPixels.length * 0.25) && secondColor.name !== topColor) {
    return [topColor, secondColor.name];
  }

  // Absolute safety fallback
  return topColor ? [topColor] : ["Gray"];
}
