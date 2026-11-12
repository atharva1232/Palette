import { describe,it,expect } from 'vitest';
import { styledPaint, PaintStyle } from './paint-style';
import { starterPatterns } from './catalog';
import { wallProjection } from './wall-perspective';
describe('wall styles',()=>{
  const style:PaintStyle={mode:'dual',secondary:'#0000ff',split:50,direction:'vertical',finish:'Matte',pattern:starterPatterns[0]};
  const pixels=new Uint8ClampedArray([180,180,180,255,180,180,180,255,180,180,180,255,180,180,180,255]);
  it('clips both colours to the selected wall and leaves furniture unchanged',()=>{
    const painted=styledPaint(pixels,new Uint8Array([255,255,0,0]),2,'#ff0000',100,style);
    expect([...painted.slice(0,8)]).toEqual([255,0,0,255,0,0,255,255]);
    expect([...painted.slice(8)]).toEqual([...pixels.slice(8)]);
  });
  it('composites separate wall colours into one room without recolouring the rest', () => {
    const solid: PaintStyle = { ...style, mode: 'solid' };
    const composite = styledPaint(pixels, new Uint8Array([255, 0, 0, 0]), 2, '#ff0000', 100, solid);
    styledPaint(pixels, new Uint8Array([0, 255, 0, 0]), 2, '#0000ff', 100, solid, composite);
    expect([...composite]).toEqual([255, 0, 0, 255, 0, 0, 255, 255, ...pixels.slice(8)]);
  });
  it('uses the selected motif colours and preserves image alpha',()=>{
    const patterned=styledPaint(pixels,new Uint8Array([255,255,255,255]),2,'#ff0000',100,{...style,mode:'pattern',pattern:{...starterPatterns[0],style:'Checkerboard',scale:2,base:'#00ff00',ink:'#0000ff'}});
    expect([...patterned.slice(0,8)]).toEqual([0,255,0,255,0,0,255,255]);
    expect(patterned[15]).toBe(255);
  });
  it('repeats an uploaded tile only on the wall and honours transparency',()=>{
    const texture={name:'tile.png',width:2,height:1,scale:2,pixels:btoa(String.fromCharCode(255,0,0,255,0,0,255,128))};
    const painted=styledPaint(pixels,new Uint8Array([255,255,0,0]),2,'#ffffff',100,{...style,mode:'pattern',patternSource:'upload',texture});
    expect([...painted.slice(0,8)]).toEqual([255,0,0,255,90,90,218,255]);
    expect([...painted.slice(8)]).toEqual([...pixels.slice(8)]);
  });
  it('samples built-in and uploaded patterns at the same wall position on an angled surface', () => {
    const outline = [{ x: 2, y: 2 }, { x: 18, y: 2 }, { x: 14, y: 10 }, { x: 6, y: 10 }];
    const project = wallProjection(outline);
    const width = 20;
    const source = new Uint8ClampedArray(width * 12 * 4).fill(180);
    const mask = new Uint8Array(width * 12);
    const near = 2 * width + 6, far = 10 * width + 8;
    mask[near] = mask[far] = 255;
    const pattern: PaintStyle = {
      ...style, mode: 'pattern',
      pattern: { ...starterPatterns[0], style: 'Stripes', scale: 8, base: '#ff0000', ink: '#0000ff' },
    };
    const uploaded: PaintStyle = {
      ...pattern, patternSource: 'upload',
      texture: { name: 'tile.png', width: 2, height: 1, scale: 8, pixels: btoa(String.fromCharCode(255, 0, 0, 255, 0, 0, 255, 255)) },
    };
    for (const appearance of [pattern, uploaded]) {
      const flat = styledPaint(source, mask, width, '#ffffff', 100, appearance);
      const projected = styledPaint(source, mask, width, '#ffffff', 100, appearance, undefined, project);
      expect(flat[far * 4]).toBe(255);
      expect([...projected.slice(near * 4, near * 4 + 3)]).toEqual([0, 0, 255]);
      expect([...projected.slice(far * 4, far * 4 + 3)]).toEqual([0, 0, 255]);
      expect([...projected.slice(0, 4)]).toEqual([...source.slice(0, 4)]);
    }
  });
});
