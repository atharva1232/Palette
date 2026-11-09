import { describe,it,expect } from 'vitest';
import { styledPaint, PaintStyle } from './paint-style';
import { starterPatterns } from './catalog';
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
});
