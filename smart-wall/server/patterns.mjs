const styles = new Set(['Stripes', 'Diagonal', 'Dots', 'Grid', 'Checkerboard', 'Arches', 'Scallops', 'Diamonds', 'Crosshatch', 'Petals', 'Chevron']);
const hex = /^#[0-9a-f]{6}$/i;

export function validatePattern(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { name, author = 'Guest creator', style, base, ink, scale } = value;
  if (typeof name !== 'string' || !name.trim() || name.trim().length > 60
    || typeof author !== 'string' || author.trim().length > 40 || !styles.has(style)
    || typeof base !== 'string' || !hex.test(base) || typeof ink !== 'string' || !hex.test(ink)
    || !Number.isInteger(scale) || scale < 16 || scale > 96) return null;
  return { name: name.trim(), author: author.trim() || 'Guest creator', style, base, ink, scale };
}

