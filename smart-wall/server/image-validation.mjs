import sharp from 'sharp';
sharp.cache({ memory: 16, files: 0, items: 16 });
sharp.concurrency(1);
let active = false;
const invalid = () => Object.assign(new Error('The room photo or preview is corrupt, oversized, or does not match. Upload a valid JPG, PNG, or WebP photo.'), { status: 400 });
export async function validateStoredImages(design) {
  if (active) throw Object.assign(new Error('Image processing is busy. Please retry shortly.'), { status: 503 });
  active = true;
  try {
    const original = sharp(design.photo, { failOn: 'warning', limitInputPixels: 40000000, sequentialRead: true });
    const metadata = await original.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format) || !metadata.width || !metadata.height || (metadata.pages || 1) !== 1) throw invalid();
    const rotated = metadata.orientation >= 5 && metadata.orientation <= 8;
    const width = rotated ? metadata.height : metadata.width, height = rotated ? metadata.width : metadata.height;
    const ratio = Math.min(1, 1600 / Math.max(width, height));
    const expectedWidth = Math.max(1, Math.round(width * ratio)), expectedHeight = Math.max(1, Math.round(height * ratio));
    // Decode complete content, with bounded output; headers alone accept truncated files.
    await original.rotate().resize(expectedWidth, expectedHeight).raw().toBuffer();
    const preview = await sharp(design.preview, { failOn: 'warning', limitInputPixels: 1600 * 1600, sequentialRead: true }).raw().toBuffer({ resolveWithObject: true });
    if (preview.info.width !== expectedWidth || preview.info.height !== expectedHeight) throw invalid();
  } catch { throw invalid(); }
  finally { active = false; }
}
