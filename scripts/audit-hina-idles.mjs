// Verify art data and synchronize encoded timing metadata: decoded frame alpha, actual timing, loop seam, original hashes.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
const require=createRequire(new URL('../desktop/package.json',import.meta.url)),{chromium}=require('playwright-core');
process.chdir(resolve(new URL('../',import.meta.url).pathname));
const file='shared/hina/assets/idle-manifest.json',manifest=JSON.parse(await readFile(file,'utf8'));
const browser=await chromium.launch({executablePath:process.env.HINA_BROWSER_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const report={scope:'Decoded WebP data and alpha geometry, not art approval or Windows native QA',originals:{},motions:[]};
try{
 const page=await browser.newPage();await page.goto('http://127.0.0.1:8000/');
 for(const [id,entry]of Object.entries(manifest.motions)){
  const result=await page.evaluate(async({entry})=>{
   const response=await fetch('/shared/hina/assets/'+entry.file),data=await response.arrayBuffer();
   const decoder=new ImageDecoder({data,type:'image/webp'});await decoder.tracks.ready;
   window.previews=window.previews||[];const frames=[],c=document.createElement('canvas');c.width=512;c.height=614;const ctx=c.getContext('2d',{willReadFrequently:true});let first,last,firstPixels,lastPixels;
   for(let i=0;i<decoder.tracks.selectedTrack.frameCount;i++){
    const {image}=await decoder.decode({frameIndex:i});ctx.clearRect(0,0,512,614);ctx.drawImage(image,0,0);const rgba=ctx.getImageData(0,0,512,614).data;
    let minX=512,minY=614,maxX=0,maxY=0,count=0;
    for(let y=0;y<614;y++)for(let x=0;x<512;x++)if(rgba[(y*512+x)*4+3]>24){minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);count++;}
    frames.push({frame:i,durationMs:image.duration/1000,bounds:[minX,minY,maxX,maxY],opaquePixels:count,cornerAlpha:rgba[3]});
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',rgba)),b=>b.toString(16).padStart(2,'0')).join('');
    if(!i){first=digest;firstPixels=new Uint8ClampedArray(rgba);}last=digest;lastPixels=new Uint8ClampedArray(rgba);if(i===Math.floor(decoder.tracks.selectedTrack.frameCount/2))window.previews.push({file:entry.file,src:c.toDataURL()});image.close();
   }
   let rgbError=0,alphaDifferences=0;for(let i=0;i<firstPixels.length;i++){if(i%4===3){if(firstPixels[i]!==lastPixels[i])alphaDifferences++;}else rgbError+=Math.abs(firstPixels[i]-lastPixels[i]);}decoder.close();return {frames,firstEqualsLast:first===last,seam:{rgbMeanAbsoluteError:rgbError/(512*614*3),alphaDifferences},totalDurationMs:frames.reduce((n,f)=>n+f.durationMs,0)};
  },{entry});
  // Use encoder-observed frame counts/durations; identical consecutive frames can be coalesced.
  entry.frames=result.frames.length;entry.durationMs=result.totalDurationMs;
  if(result.frames.some(f=>f.cornerAlpha||f.bounds[0]<=0||f.bounds[1]<=0||f.bounds[2]>=511||f.bounds[3]>=613))throw Error(id+': clipped/nontransparent canvas');
  if(result.seam.alphaDifferences||result.seam.rgbMeanAbsoluteError>3)throw Error(id+': visible loop seam risk '+JSON.stringify(result.seam));
  report.motions.push({id,...result});console.log(`PASS ${id}: ${entry.frames} decoded frames / ${entry.durationMs}ms, alpha border clear, loop alpha identical / RGB MAE ${result.seam.rgbMeanAbsoluteError.toFixed(3)}`);
 }
 await page.evaluate(()=>{
  document.body.replaceChildren();document.documentElement.lang='ko';document.body.style.cssText='margin:0;padding:24px;background:#142333;color:#e6edf4;font:14px system-ui;width:1100px';
  const title=document.createElement('h1');title.textContent='히나 8종 Idle · 검수 시안';document.body.append(title);
  const note=document.createElement('p');note.textContent='눈·몸통 복원 및 메모 필기 동작 검수 전 / 원본 보존 / Windows 실기 미검수';document.body.append(note);
  const grid=document.createElement('div');grid.style.cssText='display:grid;grid-template-columns:repeat(4,1fr);gap:16px';
  for(const p of window.previews){const figure=document.createElement('figure');figure.style.margin=0;const image=document.createElement('img');image.src=p.src;image.style.cssText='width:100%;background:repeating-conic-gradient(#d7e0e6 0% 25%,#b6c3ce 0% 50%) 0/16px 16px;border-radius:10px';const caption=document.createElement('figcaption');caption.style.padding='8px 0';caption.textContent=p.file.replace('-v1.webp','').toUpperCase();figure.append(image,caption);grid.append(figure);}document.body.append(grid);
 });
 await page.screenshot({path:'desktop/qa-results/hina-idles-contact-sheet.png',fullPage:true});
 for(const [name,expected]of Object.entries({'secretary.png':'96c93b663d3018cf5a8c9d8ed280ec50b207ccc243f9ef3e8e4e478f72e00550','greeting.gif':'c39c3d6b47b9f5286b8c28bdce820119a6f6410a305161f50671e09b2151f437','walk.gif':'268af6f27a8d0095bf8df2c4ba32f7c2871192813c5e13df612719c4d86934ec'})){
  const hash=createHash('sha256').update(await readFile('shared/hina/assets/'+name)).digest('hex');if(hash!==expected)throw Error('Original changed: '+name);report.originals[name]=hash;
 }
 await writeFile(file,JSON.stringify(manifest,null,2)+'\n');
 await writeFile('desktop/qa-results/idle-audit.json',JSON.stringify(report,null,2)+'\n');
 // Keep the checked-in rig metadata consistent with the encoded files.
 const rigPath='shared/hina/rig/rig.json',rig=JSON.parse(await readFile(rigPath,'utf8'));for(const m of rig.motions)Object.assign(m,manifest.motions[m.id]);await writeFile(rigPath,JSON.stringify(rig,null,2)+'\n');
}finally{await browser.close();}
