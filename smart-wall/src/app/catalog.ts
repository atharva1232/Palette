export const shades = [
  { name: 'Velvet Maroon', hex: '#713343', family: 'Reds & pinks' },
  { name: 'Mulberry', hex: '#512536', family: 'Reds & pinks' },
  { name: 'Dusty Rose', hex: '#c58e96', family: 'Reds & pinks' },
  { name: 'Petal Pink', hex: '#ebcbd0', family: 'Reds & pinks' },
  { name: 'Terracotta', hex: '#b9674d', family: 'Earth tones' },
  { name: 'Clay', hex: '#cb947b', family: 'Earth tones' },
  { name: 'Burnt Sienna', hex: '#92513d', family: 'Earth tones' },
  { name: 'Warm Sand', hex: '#d6bea0', family: 'Earth tones' },
  { name: 'Ivory', hex: '#f0e8db', family: 'Neutrals' },
  { name: 'Warm Beige', hex: '#dfcbb3', family: 'Neutrals' },
  { name: 'Linen', hex: '#cec3b3', family: 'Neutrals' },
  { name: 'Charcoal', hex: '#424047', family: 'Neutrals' },
  { name: 'Sage Green', hex: '#b8c9ae', family: 'Greens' },
  { name: 'Olive Grove', hex: '#7b8256', family: 'Greens' },
  { name: 'Forest', hex: '#36584c', family: 'Greens' },
  { name: 'Eucalyptus', hex: '#8eafa0', family: 'Greens' },
  { name: 'Ocean Blue', hex: '#9ebbd0', family: 'Blues' },
  { name: 'Midnight', hex: '#344b67', family: 'Blues' },
  { name: 'Coastal Mist', hex: '#c6dce0', family: 'Blues' },
  { name: 'Slate Blue', hex: '#72869c', family: 'Blues' },
  { name: 'Lavender', hex: '#bdb4d3', family: 'Purples' },
  { name: 'Plum', hex: '#76506e', family: 'Purples' },
  { name: 'Lilac Haze', hex: '#dbcee2', family: 'Purples' },
  { name: 'Aubergine', hex: '#4d354f', family: 'Purples' },
  { name: 'Honey', hex: '#cba454', family: 'Yellows' },
  { name: 'Buttercream', hex: '#eedaa4', family: 'Yellows' },
  { name: 'Golden Ochre', hex: '#b58c40', family: 'Yellows' },
  { name: 'Pale Sunshine', hex: '#f2e8bb', family: 'Yellows' },
];

export const patternStyles = ['Stripes', 'Diagonal', 'Dots', 'Grid', 'Checkerboard', 'Arches', 'Scallops', 'Diamonds', 'Crosshatch', 'Petals', 'Chevron'] as const;
export type PatternStyle = typeof patternStyles[number];
export interface WallPattern {
  ownerId?: string | null;
  id: string;
  name: string;
  author: string;
  style: PatternStyle;
  base: string;
  ink: string;
  scale: number;
}

export const starterPatterns: WallPattern[] = [
  { id: 'pinstripe', name: 'The Burgundy Stripe', author: 'SmartWall', style: 'Stripes', base: '#f1e1d7', ink: '#713343', scale: 40 },
  { id: 'diagonal', name: 'Rose in Motion', author: 'SmartWall', style: 'Diagonal', base: '#ecd6d4', ink: '#a26a76', scale: 48 },
  { id: 'dots', name: 'Sunday Confetti', author: 'SmartWall', style: 'Dots', base: '#f0e8db', ink: '#92513d', scale: 32 },
  { id: 'grid', name: 'Quiet Geometry', author: 'SmartWall', style: 'Grid', base: '#dfe5dc', ink: '#6e8170', scale: 48 },
  { id: 'checker', name: 'Cocoa Check', author: 'SmartWall', style: 'Checkerboard', base: '#e8d6c2', ink: '#876657', scale: 64 },
  { id: 'blue-stripe', name: 'Coastal Lines', author: 'SmartWall', style: 'Stripes', base: '#e4e9e5', ink: '#72869c', scale: 56 },
  { id: 'deco-arches', name: 'Deco After Dark', author: 'SmartWall', style: 'Arches', base: '#432433', ink: '#d3ac77', scale: 64 },
  { id: 'blush-petals', name: 'Blush Botanica', author: 'SmartWall', style: 'Petals', base: '#f5e4df', ink: '#b77188', scale: 72 },
  { id: 'terracotta-tide', name: 'Terracotta Tide', author: 'SmartWall', style: 'Scallops', base: '#f0d8c0', ink: '#b9674d', scale: 48 },
  { id: 'gilded-diamonds', name: 'Gilded Hour', author: 'SmartWall', style: 'Diamonds', base: '#f4ead8', ink: '#b58c40', scale: 64 },
  { id: 'sage-weave', name: 'Sage Atelier', author: 'SmartWall', style: 'Crosshatch', base: '#e7e9dc', ink: '#7b8256', scale: 40 },
  { id: 'rose-chevron', name: 'Rose Chevron', author: 'SmartWall', style: 'Chevron', base: '#ead4d6', ink: '#87465a', scale: 64 },
];

export function patternBackground(pattern: Omit<WallPattern, 'id'>): string {
  const { base, ink, scale: s } = pattern;
  switch (pattern.style) {
    case 'Stripes': return `repeating-linear-gradient(90deg, ${base} 0 ${s / 2}px, ${ink} ${s / 2}px ${s}px)`;
    case 'Diagonal': return `repeating-linear-gradient(135deg, ${base} 0 ${s / 2}px, ${ink} ${s / 2}px ${s}px)`;
    case 'Dots': return `radial-gradient(circle, ${ink} 22%, transparent 24%) 0 0 / ${s}px ${s}px, ${base}`;
    case 'Grid': return `linear-gradient(${ink} 2px, transparent 2px) 0 0 / ${s}px ${s}px, linear-gradient(90deg, ${ink} 2px, transparent 2px) 0 0 / ${s}px ${s}px, ${base}`;
    case 'Checkerboard': return `repeating-conic-gradient(${ink} 0% 25%, ${base} 0% 50%) 0 0 / ${s}px ${s}px`;
    default: {
      // Small seamless vector tiles keep decorative styles crisp at every scale.
      const motifs: Record<string, string> = {
        Arches: '<path d="M0 100V50a50 50 0 0 1 100 0v50M15 100V50a35 35 0 0 1 70 0v50M30 100V50a20 20 0 0 1 40 0v50"/>',
        Scallops: '<path d="M-50 0a50 50 0 0 0 100 0 50 50 0 0 0 100 0M0 50a50 50 0 0 0 100 0M-50 100a50 50 0 0 0 100 0 50 50 0 0 0 100 0"/>',
        Diamonds: '<path d="M50 0 100 50 50 100 0 50ZM50 20 80 50 50 80 20 50Z"/><circle cx="50" cy="50" r="3"/>',
        Crosshatch: '<path d="M0 0 100 100M-25 0 75 100M25 0 125 100M0 100 100 0M-25 100 75 0M25 100 125 0" stroke-width="1.5"/>',
        Petals: '<path d="M50 50C5 50 5 5 50 50C50 5 95 5 50 50C95 50 95 95 50 50C50 95 5 95 50 50Z"/><circle cx="50" cy="50" r="3"/>',
        Chevron: '<path d="M-25 25 0 50 50 0 100 50 125 25M-25 75 0 100 50 50 100 100 125 75" stroke-width="12"/>',
      };
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="${base}"/><g fill="none" stroke="${ink}" stroke-width="2">${motifs[pattern.style] || ''}</g></svg>`;
      return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 0 0 / ${s}px ${s}px`;
    }
  }
}
