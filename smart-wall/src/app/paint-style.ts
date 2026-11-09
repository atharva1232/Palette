import { WallPattern } from './catalog';
export interface PaintStyle {
  mode: 'solid' | 'dual' | 'pattern';
  secondary: string;
  split: number;
  direction: 'horizontal' | 'vertical';
  finish: 'Matte' | 'Satin' | 'Gloss';
  pattern: WallPattern;
  patternSource?: 'built-in' | 'upload';
  texture?: { name: string; width: number; height: number; pixels: string; scale: number };
}
const textureCache = new WeakMap<object, Uint8Array>();
export function textureBytes(texture: NonNullable<PaintStyle['texture']>): Uint8Array {
  let pixels = textureCache.get(texture);
  if (!pixels) { pixels = Uint8Array.from(atob(texture.pixels), c => c.charCodeAt(0)); textureCache.set(texture, pixels); }
  return pixels;
}
/** Pixel-space motifs are clipped by the same wall mask used for solid paint. */
export function motif(style: string, x: number, y: number, scale: number): boolean {
  const u = ((x % scale) + scale) % scale / scale, v = ((y % scale) + scale) % scale / scale;
  switch (style) {
    case 'Stripes': return u >= .5;
    case 'Diagonal': return ((x + y) % scale) / scale >= .5;
    case 'Dots': return Math.hypot(u - .5, v - .5) < .22;
    case 'Grid': return u < .04 || v < .04;
    case 'Checkerboard': return (u < .5) !== (v < .5);
    case 'Diamonds': return Math.abs(Math.abs(u - .5) + Math.abs(v - .5) - .45) < .035;
    case 'Crosshatch': return Math.abs(u - v) < .035 || Math.abs(u + v - 1) < .035;
    case 'Chevron': return Math.abs(v - Math.abs(u - .5) * 2) < .12;
    case 'Arches': return [ .48, .34, .2 ].some(r => Math.abs(Math.hypot(u - .5, v - .5) - r) < .025 && v < .5) || v >= .5 && [.02,.16,.3,.7,.84,.98].some(a => Math.abs(u-a)<.02);
    case 'Scallops': return Math.abs(Math.hypot(u - .5, v) - .5) < .035 || Math.abs(Math.hypot(u - (u < .5 ? 0 : 1), v - .5) - .5) < .035;
    case 'Petals': { const a = Math.atan2(v-.5,u-.5), r = Math.hypot(u-.5,v-.5); return Math.abs(r - .4*Math.abs(Math.sin(2*a))) < .035; }
    default: return false;
  }
}
export function styledPaint(source: Uint8ClampedArray, mask: Uint8Array, width: number, colour: string, strength: number, style: PaintStyle, output = new Uint8ClampedArray(source)): Uint8ClampedArray<ArrayBuffer> {
  const height = mask.length / width;
  const rgb = (hex: string) => [1,3,5].map(i => parseInt(hex.slice(i,i+2),16));
  const main = rgb(style.mode === 'pattern' ? style.pattern.base : colour);
  const accent = rgb(style.mode === 'pattern' ? style.pattern.ink : style.secondary);
  const texture = style.mode === 'pattern' && style.patternSource === 'upload' ? style.texture : undefined;
  const tile = texture ? textureBytes(texture) : undefined;
  let total = 0, weight = 0;
  for (let p=0;p<mask.length;p++) { total += (.2126*source[p*4]+.7152*source[p*4+1]+.0722*source[p*4+2])*mask[p]; weight += mask[p]; }
  if (!weight) return output;
  for (let p=0;p<mask.length;p++) {
    if (!mask[p]) continue;
    const x=p%width,y=Math.floor(p/width),i=p*4;
    const useAccent = style.mode === 'pattern' ? motif(style.pattern.style,x,y,style.pattern.scale) : style.mode === 'dual' && (style.direction === 'horizontal' ? y/height : x/width) >= style.split/100;
    let target = useAccent ? accent : main;
    let tileAlpha = 1;
    if (texture && tile) {
      const repeatHeight = texture.scale * texture.height / texture.width;
      const tx = Math.floor((x % texture.scale) / texture.scale * texture.width);
      const ty = Math.floor((y % repeatHeight) / repeatHeight * texture.height);
      const index = (ty * texture.width + tx) * 4;
      target = [tile[index], tile[index+1], tile[index+2]];
      tileAlpha = tile[index+3] / 255;
    }
    const luminance=.2126*source[i]+.7152*source[i+1]+.0722*source[i+2];
    const light=Math.max(.25,Math.min(1.8,(luminance+30)/(total/weight+30)));
    // Finish is an illustrative response to highlights, not a physical lighting simulation.
    const sheen=style.finish === 'Gloss' ? .15 : style.finish === 'Satin' ? .06 : 0;
    const alpha=mask[p]/255*strength/100*tileAlpha;
    for (let c=0;c<3;c++) { const paint=Math.min(255,Math.max(0,target[c]*light+Math.max(0,light-1)*255*sheen)); output[i+c]=output[i+c]*(1-alpha)+paint*alpha; }
  }
  return output;
}
