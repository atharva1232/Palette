import { imagePoint, paintPixels, validatePhoto, selectWallRegion, constrainWallMask } from './paint-engine';

describe('photo paint engine', () => {
  it('keeps a same-coloured ceiling outside the wall boundary and protects a framed object', () => {
    const width = 12, height = 10;
    const source = new Uint8ClampedArray(width * height * 4);
    const boundary = new Uint8Array(width * height);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const p = y * width + x;
      source.set([225, 225, 225, 255], p * 4);
      if (x >= 2 && x <= 9 && y >= 2 && y <= 7) boundary[p] = 255;
      if (((x === 5 || x === 8) && y >= 3 && y <= 6) || ((y === 3 || y === 6) && x >= 5 && x <= 8)) source.set([25, 25, 25, 255], p * 4);
    }
    const mask = selectWallRegion(source, width, height, boundary, { x: 3, y: 3 }, 32);
    expect(mask[3 * width + 3]).toBe(255);
    expect(mask[2 * width + 9]).toBe(255);
    expect(mask[width + 3]).toBe(0); // Same white colour, but outside the locked wall.
    expect(mask[3 * width + 5]).toBe(0); // Dark frame edge.
    expect(mask[4 * width + 6]).toBe(0); // White picture interior, disconnected by the frame.
    const painted = paintPixels(source, mask, '#713343', 100);
    expect(painted.slice((4 * width + 6) * 4, (4 * width + 6) * 4 + 4)).toEqual(source.slice((4 * width + 6) * 4, (4 * width + 6) * 4 + 4));
  });
  it('lets tolerance include gradual shadows while still rejecting a contrasting object', () => {
    const width = 10, height = 4;
    const source = new Uint8ClampedArray(width * height * 4);
    const boundary = new Uint8Array(width * height).fill(255);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const shade = x === 9 ? 15 : 190 - x * 7;
      source.set([shade, shade, shade, 255], (y * width + x) * 4);
    }
    const tight = selectWallRegion(source, width, height, boundary, { x: 0, y: 0 }, 12);
    const broad = selectWallRegion(source, width, height, boundary, { x: 0, y: 0 }, 50);
    expect(tight[7]).toBe(0);
    expect(broad[7]).toBe(255);
    expect(broad[9]).toBe(0);
    expect(selectWallRegion(source, width, height, boundary, { x: -1, y: 0 }, 32).some(value => value > 0)).toBe(false);
  });
  it('clips full-image brush marks to the boundary and preserves erased areas after reselection', () => {
    const boundary = new Uint8Array([255, 255, 0, 0]);
    const protectedAreas = new Uint8Array([0, 255, 0, 0]);
    const broadSelection = new Uint8Array([255, 255, 255, 255]);
    expect(constrainWallMask(broadSelection, boundary, protectedAreas)).toEqual(new Uint8Array([255, 0, 0, 0]));
    const source = new Uint8ClampedArray([220, 220, 220, 255, 50, 50, 50, 255, 190, 190, 190, 255, 200, 200, 200, 255]);
    const output = paintPixels(source, constrainWallMask(broadSelection, boundary, protectedAreas), '#9ebbd0', 100);
    expect(output.slice(4)).toEqual(source.slice(4));
    expect(constrainWallMask(broadSelection, new Uint8Array(0), protectedAreas).every(value => value === 0)).toBe(true);
  });
  it('changes only selected pixels, keeps alpha, and preserves relative wall lighting', () => {
    const source = new Uint8ClampedArray([60, 60, 60, 255, 180, 180, 180, 255, 80, 30, 20, 200]);
    const original = new Uint8ClampedArray(source);
    const painted = paintPixels(source, new Uint8Array([255, 255, 0]), '#9ebbd0', 100);
    expect(painted.slice(8)).toEqual(source.slice(8));
    expect(painted[0]).toBeLessThan(painted[4]);
    expect(painted[1]).toBeLessThan(painted[5]);
    expect(painted[3]).toBe(255);
    expect(source).toEqual(original);
    expect(painted[2]).toBeGreaterThan(painted[0]);
  });
  it('honours paint strength and partial masks without accumulating colour changes', () => {
    const source = new Uint8ClampedArray([200, 200, 200, 255]);
    const full = paintPixels(source, new Uint8Array([255]), '#713343', 100);
    const partial = paintPixels(source, new Uint8Array([128]), '#713343', 100);
    expect(full[0]).toBe(113);
    expect(partial[0]).toBeGreaterThan(full[0]);
    expect(partial[0]).toBeLessThan(source[0]);
    expect(paintPixels(source, new Uint8Array([255]), '#ffffff', 100)[0]).toBe(255);
    expect(paintPixels(source, new Uint8Array([255]), '#713343', 0)).toEqual(source);
    expect(paintPixels(source, new Uint8Array([0]), '#713343', 100)).toEqual(source);
  });
  it('maps a resized canvas and clamps dragging outside the image', () => {
    const rect = { left: 100, top: 50, width: 400, height: 300 };
    expect(imagePoint(300, 200, rect, 1600, 1200)).toEqual({ x: 800, y: 600 });
    expect(imagePoint(0, 0, rect, 1600, 1200)).toEqual({ x: 0, y: 0 });
    expect(imagePoint(900, 900, rect, 1600, 1200)).toEqual({ x: 1599, y: 1199 });
  });
  it('rejects unsupported, empty, and oversized photo files', () => {
    expect(validatePhoto({ type: 'image/svg+xml', size: 200 })).toContain('JPG, PNG, or WebP');
    expect(validatePhoto({ type: 'image/png', size: 16 * 1024 * 1024 })).toContain('15 MB');
    expect(validatePhoto({ type: 'image/jpeg', size: 0 })).toContain('empty');
    expect(validatePhoto({ type: 'image/webp', size: 1024 })).toBe('');
  });
});
