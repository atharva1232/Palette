import ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
// CPU processing benchmark, not a browser/network latency or human usability claim.
const code=ts.transpileModule(readFileSync('src/app/paint-style.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText;
const {styledPaint}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const width=1600,height=1067,source=new Uint8ClampedArray(width*height*4),mask=new Uint8Array(width*height);
for(let p=0;p<mask.length;p++){const i=p*4;source[i]=source[i+1]=source[i+2]=100+p%100;source[i+3]=255;mask[p]=p%width>width*.4?255:0;}
const reports=[];
for(const mode of ['solid','dual','pattern']){
 const style={mode,secondary:'#f0e8db',split:50,direction:'horizontal',finish:'Satin',pattern:{style:'Crosshatch',base:'#e7e9dc',ink:'#7b8256',scale:40}};
 styledPaint(source,mask,width,'#713343',90,style);const ms=[];
 for(let i=0;i<5;i++){const start=performance.now();styledPaint(source,mask,width,'#713343',90,style);ms.push(performance.now()-start);}
 ms.sort((a,b)=>a-b);reports.push({mode,medianMs:Math.round(ms[2]*100)/100,maxMs:Math.round(ms[4]*100)/100});
}
const result={measuredAt:new Date().toISOString(),node:process.version,width,height,environment:'Local Node CPU benchmark, synthetic pixels; excludes image decoding, selection, canvas and network. Not a cross-device SLA.',reports};
mkdirSync('review',{recursive:true});writeFileSync('review/benchmark.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
