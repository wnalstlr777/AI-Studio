// Render common original-pixel puppet parts once, then encode eight transparent WebP clips.
// No original image or legacy GIF is rewritten. Requires Chromium and ffmpeg.
import {readFile,writeFile,mkdir,mkdtemp,copyFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {rig,motionSpecs,pose} from './hina-rig.mjs';
const require=createRequire(new URL('../desktop/package.json',import.meta.url));
const {chromium}=require('playwright-core');
const root=resolve(new URL('../',import.meta.url).pathname);process.chdir(root);
const out='shared/hina/assets',work=await mkdtemp(join(tmpdir(),'hina-idles-'));
await mkdir('shared/hina/rig',{recursive:true});await mkdir('desktop/qa-results/idle-frames',{recursive:true});
const data=async path=>'data:image/png;base64,'+(await readFile(path)).toString('base64');
// WebP ANMF stores each encoded frame's 24-bit duration. The encoder can merge
// identical input frames, so report encoded timing rather than the input count.
function encodedTiming(bytes){
 let frames=0,durationMs=0;
 for(let offset=12;offset+8<=bytes.length;){
  const size=bytes.readUInt32LE(offset+4);if(offset+8+size>bytes.length)throw Error('Truncated WebP chunk');
  if(bytes.toString('ascii',offset,offset+4)==='ANMF'){
   if(size<16)throw Error('Truncated WebP animation frame');frames++;durationMs+=bytes.readUIntLE(offset+20,3);
  }
  offset+=8+size+(size&1);
 }
 if(frames<2||!durationMs)throw Error('Expected animated WebP');return {frames,durationMs};
}
const browser=await chromium.launch({executablePath:process.env.HINA_BROWSER_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const metadata=[];
try{
 const page=await browser.newPage();
 await page.setContent('<canvas width="512" height="614"></canvas>');
 await page.evaluate(async({rig,original,restore,face})=>{
  window.rig=rig;window.images={};
  for(const [id,src]of Object.entries({original,restore,face})){const img=new Image();img.src=src;await img.decode();window.images[id]=img;}
  window.draw=(p,{original=false,guides=false,part=null}={})=>{
   const c=document.querySelector('canvas'),ctx=c.getContext('2d');ctx.clearRect(0,0,512,614);
   ctx.save();ctx.scale(512/1145,614/1373);ctx.translate(5.725,8.28);ctx.scale(.99,.99);
   if(original)ctx.drawImage(images.original,0,0);
   else{
    ctx.translate(0,p.jump||0);
    for(const item of [...rig.parts].sort((a,b)=>a.z-b.z)){
     if(part&&part!==item.id)continue;
     ctx.save();const[x,y]=item.pivot;
     const angle=(p[item.id]||0)*Math.PI/180;
     ctx.translate(x,y+(item.id==='head'?p.headY: item.id==='torso'?p.torsoY:0));ctx.rotate(angle);ctx.translate(-x,-y);
     ctx.clip(new Path2D(item.path));ctx.drawImage(images.original,0,0);
     if(item.id==='torso'){
      ctx.save();ctx.clip(new Path2D(rig.restoration.mask));
      ctx.drawImage(images.restore,...rig.restoration.sourceRect,...rig.restoration.targetRect);ctx.restore();
     }
     if(item.id==='head'){
      if(p.open){ctx.save();ctx.beginPath();ctx.ellipse(494,442,77,50,-.28,0,Math.PI*2);ctx.ellipse(710,388,69,49,-.25,0,Math.PI*2);ctx.clip();ctx.globalAlpha=p.open;ctx.drawImage(images.face,0,0,1145,1373);ctx.restore();}
      if(p.smile){ctx.save();ctx.beginPath();ctx.ellipse(635,510,68,60,-.2,0,Math.PI*2);ctx.clip();ctx.globalAlpha=p.smile;ctx.drawImage(images.face,0,0,1145,1373);ctx.restore();}
     }
     ctx.restore();
    }
   }
   ctx.restore();
   if(guides){ctx.strokeStyle='#e77656';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(256,0);ctx.lineTo(256,614);ctx.moveTo(0,610);ctx.lineTo(512,610);ctx.stroke();}
   return c.toDataURL('image/png').split(',')[1];
  };
 },{rig,original:await data(rig.source),restore:await data(rig.restoration.file),face:await data(rig.faceRestoration.file)});
 for(const spec of motionSpecs){
  const folder=join(work,spec.id);await mkdir(folder);
  for(let i=0;i<spec.frames;i++){
   const p=pose(spec.id,i/(spec.frames-1));
   const b64=await page.evaluate(p=>draw(p),p);
   const file=join(folder,String(i).padStart(3,'0')+'.png');await writeFile(file,Buffer.from(b64,'base64'));
   if([0,Math.floor(spec.frames/2),spec.frames-1].includes(i))await copyFile(file,`desktop/qa-results/idle-frames/${spec.id}-${i}.png`);
  }
  const file=spec.id.toLowerCase().replaceAll('_','-')+'-v1.webp';
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(spec.frames*1000/spec.durationMs),'-i',join(folder,'%03d.png'),'-c:v','libwebp_anim','-lossless','0','-quality','90','-compression_level','3','-loop',spec.loop?'0':'1',join(out,file)]);
  const bytes=await readFile(join(out,file));
  const timing=encodedTiming(bytes);
  metadata.push({...spec,...timing,file,format:'webp',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),animated:true,complete:false,...rig.output});
  console.log(`${spec.id}: ${timing.frames} frames / ${timing.durationMs}ms / ${bytes.length} bytes (review draft)`);
 }
 for(const part of rig.parts){const b64=await page.evaluate(({p,part})=>draw(p,{part}),{p:pose('IDLE_NORMAL',0),part:part.id});await writeFile(`shared/hina/rig/${part.id}.png`,Buffer.from(b64,'base64'));}
 await writeFile('shared/hina/rig/rig.json',JSON.stringify({...rig,motions:metadata},null,2)+'\n');
 const legacy=JSON.parse(await readFile(join(out,'manifest.json'),'utf8'));
 const motions=Object.fromEntries(metadata.map(({id,label,...entry})=>[id,entry]));
 await writeFile(join(out,'idle-manifest.json'),JSON.stringify({...legacy,schemaVersion:2,version:'2026.11.06-idle-review.1',motions},null,2)+'\n');
}finally{await browser.close();}
console.log('Frame work directory:',work);
console.log('Rendered draft parts and eight motion files. Originals and legacy manifest unchanged.');
