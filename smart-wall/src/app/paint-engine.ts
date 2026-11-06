export interface Point { x: number; y: number; }

/** A connected colour region, constrained by an explicit wall boundary.
 * This is image-based selection, not semantic AI wall recognition.
 */
export function selectWallRegion(source: Uint8ClampedArray, width: number, height: number, boundary: Uint8Array, seed: Point, tolerance: number): Uint8Array {
  const count = width * height;
  const result = new Uint8Array(count);
  if (!width || !height || source.length !== count * 4 || boundary.length !== count) return result;
  const x = Math.floor(seed.x), y = Math.floor(seed.y);
  if (x < 0 || y < 0 || x >= width || y >= height) return result;
  const start = y * width + x;
  if (!boundary[start] || !source[start * 4 + 3]) return result;
  const limit = Math.max(5, Math.min(80, tolerance));
  const edgeLimit = Math.max(12, limit * .8);
  const seedIndex = start * 4;
  const sy = .2126 * source[seedIndex] + .7152 * source[seedIndex + 1] + .0722 * source[seedIndex + 2];
  const sr = source[seedIndex] - sy, sb = source[seedIndex + 2] - sy;
  const queue = new Int32Array(count);
  const rejected = new Uint8Array(count);
  queue[0] = start;
  result[start] = boundary[start];
  let head = 0, tail = 1;
  const visit = (pixel: number, previousY: number) => {
    if (result[pixel] || rejected[pixel] || !boundary[pixel]) return;
    const i = pixel * 4;
    if (!source[i + 3]) { rejected[pixel] = 1; return; }
    const py = .2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2];
    const dy = (py - sy) * .65;
    const dr = source[i] - py - sr, db = source[i + 2] - py - sb;
    if (dy * dy + dr * dr + db * db > limit * limit) { rejected[pixel] = 1; return; }
    if (Math.abs(py - previousY) > edgeLimit) return;
    result[pixel] = boundary[pixel];
    queue[tail++] = pixel;
  };
  while (head < tail) {
    const pixel = queue[head++], i = pixel * 4;
    const py = .2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2];
    const column = pixel % width;
    if (column) visit(pixel - 1, py);
    if (column < width - 1) visit(pixel + 1, py);
    if (pixel >= width) visit(pixel - width, py);
    if (pixel < count - width) visit(pixel + width, py);
  }
  return result;
}

/** Hard clipping is applied to both the on-screen preview and its export. */
export function constrainWallMask(selection: Uint8Array, boundary: Uint8Array, protectedAreas: Uint8Array): Uint8Array {
  const result = new Uint8Array(selection.length);
  if (boundary.length !== selection.length || protectedAreas.length !== selection.length) return result;
  for (let p = 0; p < result.length; p++) result[p] = Math.min(selection[p], boundary[p]) * (1 - protectedAreas[p] / 255);
  return result;
}

/** Map screen coordinates to image pixels, including a responsive canvas. */
export function imagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }, width: number, height: number): Point {
  return {
    x: Math.max(0, Math.min(width - 1, (clientX - rect.left) * width / rect.width)),
    y: Math.max(0, Math.min(height - 1, (clientY - rect.top) * height / rect.height)),
  };
}

/** Recolour only the mask; local brightness keeps shadows and wall texture. */
export function paintPixels(source: Uint8ClampedArray, mask: Uint8Array, hex: string, strength: number): Uint8ClampedArray<ArrayBuffer> {
  const result = new Uint8ClampedArray(source);
  if (!/^#[0-9a-f]{6}$/i.test(hex) || source.length !== mask.length * 4) return result;
  const target = [1, 3, 5].map(start => parseInt(hex.slice(start, start + 2), 16));
  let total = 0;
  let weight = 0;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    total += (.2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2]) * mask[p];
    weight += mask[p];
  }
  if (!weight) return result;
  const average = total / weight;
  const opacity = Math.max(0, Math.min(100, strength)) / 100;
  for (let p = 0; p < mask.length; p++) {
    if (!mask[p]) continue;
    const i = p * 4;
    const luminance = .2126 * source[i] + .7152 * source[i + 1] + .0722 * source[i + 2];
    const light = Math.max(.25, Math.min(1.8, (luminance + 30) / (average + 30)));
    const alpha = mask[p] / 255 * opacity;
    for (let channel = 0; channel < 3; channel++) {
      const painted = Math.max(0, Math.min(255, target[channel] * light));
      result[i + channel] = source[i + channel] * (1 - alpha) + painted * alpha;
    }
  }
  return result;
}

export function validatePhoto(file: Pick<File, 'type' | 'size'>): string {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'Choose a JPG, PNG, or WebP image.';
  if (file.size > 15 * 1024 * 1024) return 'This photo is too large. Choose an image smaller than 15 MB.';
  if (!file.size) return 'This file is empty. Please choose another photo.';
  return '';
}
