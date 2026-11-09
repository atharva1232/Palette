import { validatePattern } from './patterns.mjs';
import { inflateSync } from 'node:zlib';
const hex = /^#[0-9a-f]{6}$/i;
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export function decode(value, max) {
  if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('Invalid image or selection data.');
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length > max || bytes.toString('base64') !== value) fail('Invalid or oversized image data.');
  return bytes;
}
export function validateDesign(value) {
  if (!value || typeof value !== 'object') fail('Invalid design.');
  const { name, fileName } = value;
  if (typeof name !== 'string' || !name.trim() || name.length > 80 || typeof fileName !== 'string' || fileName.length > 255) fail('Invalid design settings.');
  const photo = decode(value.photo, 15 * 1024 * 1024);
  const preview = decode(value.preview, 12 * 1024 * 1024);
  const png = Buffer.from('89504e470d0a1a0a', 'hex');
  const type = photo.subarray(0, 8).equals(png) ? 'image/png' : photo[0] === 255 && photo[1] === 216 && photo[2] === 255 ? 'image/jpeg' : photo.toString('ascii', 0, 4) === 'RIFF' && photo.toString('ascii', 8, 12) === 'WEBP' ? 'image/webp' : '';
  if (!type || preview.length < 24 || !preview.subarray(0, 8).equals(png) || preview.toString('ascii', 12, 16) !== 'IHDR') fail('Use a JPG, PNG, or WebP room photo and a PNG preview.');
  const width = preview.readUInt32BE(16), height = preview.readUInt32BE(20);
  if (!width || !height || width > 1600 || height > 1600) fail('Invalid preview dimensions.');
  const { color: activeColour, ...wall } = validateWall(value, width, height, false);
  let walls;
  if (value.walls !== undefined) {
    const { active, others } = value.walls || {};
    if (!Array.isArray(others) || others.length < 1 || others.length > 4 || !Number.isInteger(active) || active < 0 || active > others.length) fail('Invalid wall layers.');
    walls = { active, others: others.map(other => validateWall(other, width, height, true)) };
  }
  const state = JSON.stringify({ ...wall, walls });
  const stateBytes = Buffer.byteLength(state);
  if (walls && stateBytes > 14 * 1024 * 1024) fail('This design has too much wall detail to save. Try simplifying a wall selection.');
  return { name: name.trim(), fileName, color: activeColour, photo, preview, type, state, bytes: photo.length + preview.length + stateBytes };
}

function validateWall(value, width, height, compressed) {
  if (!value || typeof value !== 'object') fail('Invalid wall layer.');
  const { color, strength, tolerance } = value;
  if (typeof color !== 'string' || !hex.test(color) || !Number.isFinite(strength) || strength < 10 || strength > 100 || !Number.isFinite(tolerance) || tolerance < 8 || tolerance > 70) fail('Invalid design settings.');
  const size = width * height;
  for (const field of ['boundary', 'safety', 'protectedAreas']) {
    if (field !== 'protectedAreas' && value[field] === null) continue;
    let mask = decode(value[field], compressed ? size + 65536 : size);
    if (compressed) {
      try { mask = inflateSync(mask, { maxOutputLength: size }); }
      catch { fail('Invalid compressed wall selection.'); }
    }
    if (mask.length !== size) fail('Selection does not match this photo.');
  }
  if (value.safety !== null && value.boundary === null) fail('A selected wall needs a boundary.');
  const point = p => p && Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= 0 && p.y >= 0 && p.x < width && p.y < height;
  if (!Array.isArray(value.seeds) || value.seeds.length > 12 || !value.seeds.every(point) || !Array.isArray(value.polygons) || value.polygons.length > 100 || !value.polygons.every(p => Array.isArray(p) && p.length >= 3 && p.length <= 500 && p.every(point))) fail('Invalid wall boundary.');
  let appearance;
  if (value.appearance !== undefined) {
    const a = value.appearance;
    if (!a || !['solid','dual','pattern'].includes(a.mode) || !hex.test(a.secondary) || !Number.isFinite(a.split) || a.split < 5 || a.split > 95 || !['horizontal','vertical'].includes(a.direction) || !['Matte','Satin','Gloss'].includes(a.finish) || !validatePattern(a.pattern)) fail('Invalid paint style.');
    appearance = { mode: a.mode, secondary: a.secondary, split: a.split, direction: a.direction, finish: a.finish, pattern: { ...validatePattern(a.pattern), id: typeof a.pattern.id === 'string' ? a.pattern.id.slice(0,80) : 'custom' } };
    if (a.patternSource !== undefined && !['built-in','upload'].includes(a.patternSource)) fail('Invalid pattern source.');
    appearance.patternSource = a.patternSource || 'built-in';
    if (a.texture !== undefined) {
      const t = a.texture;
      if (!t || typeof t.name !== 'string' || !t.name.trim() || t.name.length > 80 || !Number.isInteger(t.width) || !Number.isInteger(t.height) || t.width < 1 || t.height < 1 || t.width > 256 || t.height > 256 || !Number.isFinite(t.scale) || t.scale < 16 || t.scale > 512) fail('Invalid uploaded pattern.');
      const pixels = decode(t.pixels, 256*256*4);
      if(pixels.length !== t.width*t.height*4 || !pixels.some((v,i)=>i%4===3 && v>0)) fail('Invalid uploaded pattern pixels.');
      appearance.texture = { name:t.name.trim(),width:t.width,height:t.height,pixels:t.pixels,scale:t.scale };
    }
    if (appearance.patternSource === 'upload' && !appearance.texture) fail('Upload a pattern image first.');
  }
  return { color, appearance, strength, tolerance, boundary: value.boundary, safety: value.safety, protectedAreas: value.protectedAreas, seeds: value.seeds, polygons: value.polygons };
}
export const designSummary = row => ({ id: row.id, name: row.name, savedAt: row.saved_at, fileName: row.file_name, color: row.color, photoUrl: `/api/designs/${row.id}/photo`, previewUrl: `/api/designs/${row.id}/preview` });
