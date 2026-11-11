// Re-render supplied GIF frames with uniform whole-character scale and foot anchors for every frame.
// Original bytes are retained in sources/hina/hina_3_gifs_original.zip.
import {readFile,writeFile,mkdtemp,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));process.chdir(root);
const work=await mkdtemp(join(tmpdir(),'hina-shared-gifs-'));
const names=['idle','alert','news'];
execFileSync('python',['-c',`from zipfile import ZipFile
from pathlib import Path
import sys
z=ZipFile('sources/hina/hina_3_gifs_original.zip')
for name in ['hina-idle.gif','hina-alert.gif','hina-news.gif']:
 matches=[n for n in z.namelist() if Path(n).name==name]
 assert len(matches)==1, name
 Path(sys.argv[1],name).write_bytes(z.read(matches[0]))
`,work]);
const server=createServer(async(req,res)=>{try{const name=new URL(req.url,'http://localhost').pathname.slice(1);if(names.some(n=>name===`hina-${n}.gif`)){res.setHeader('content-type','image/gif');res.end(await readFile(join(work,name)));}else {res.setHeader('content-type','text/html');res.end('<!doctype html><canvas width="512" height="614"></canvas>');}}catch{res.writeHead(404).end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const require=createRequire(new URL('../desktop/package.json',import.meta.url)),{chromium}=require('playwright-core');
const browser=await chromium.launch({executablePath:process.env.HINA_BROWSER_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const report={canvas:[512,614],centerX:256,footY:610,characterReferenceHeight:480,method:'Every frame has a 480px character silhouette; uniform x/y scale and foot translation; no limb or face redrawing',motions:{}};
try{
 const page=await browser.newPage();await page.goto(`http://127.0.0.1:${server.address().port}/`);
 for(const name of names){
  const source=await readFile(join(work,`hina-${name}.gif`)),folder=join(work,name);await mkdir(folder);
  const result=await page.evaluate(async name=>{
   const data=await(await fetch(`/hina-${name}.gif`)).arrayBuffer(),d=new ImageDecoder({data,type:'image/gif'});await d.tracks.ready;if(d.tracks.selectedTrack.frameCount!==8)throw Error('Expected eight source frames');
   const source=document.createElement('canvas');source.width=443;source.height=443;const sc=source.getContext('2d',{willReadFrequently:true});const output=document.querySelector('canvas'),ctx=output.getContext('2d');const frames=[];
   for(let i=0;i<8;i++){
    const {image}=await d.decode({frameIndex:i});if(image.displayWidth!==443||image.displayHeight!==443)throw Error('Unexpected source canvas');sc.clearRect(0,0,443,443);sc.drawImage(image,0,0);
    const rgba=sc.getImageData(0,0,443,443).data;let top=443,bottom=0,left=443,right=0;
    for(let y=0;y<443;y++)for(let x=0;x<443;x++)if(rgba[(y*443+x)*4+3]>128){top=Math.min(top,y);bottom=Math.max(bottom,y);left=Math.min(left,x);right=Math.max(right,x);}
    let footLeft=443,footRight=0;for(let y=bottom-7;y<=bottom;y++)for(let x=0;x<443;x++)if(rgba[(y*443+x)*4+3]>128){footLeft=Math.min(footLeft,x);footRight=Math.max(footRight,x);}
    const anchor=(footLeft+footRight+1)/2,scale=480/(bottom-top+1);
    let dx=256-anchor*scale;const dy=611-(bottom+1)*scale;
    if(dx+left*scale<1||dx+(right+1)*scale>511)throw Error(name+': gesture would be clipped');
    const draw=()=>{ctx.clearRect(0,0,512,614);ctx.drawImage(image,dx,dy,443*scale,443*scale);};draw();
    // Resampling changes the visible shoe edge by a pixel: calibrate the rendered anchor too.
    for(let pass=0;pass<3;pass++){
      const pixels=ctx.getImageData(0,603,512,8).data;let fl=512,fr=0;
      for(let y=0;y<8;y++)for(let x=0;x<512;x++)if(pixels[(y*512+x)*4+3]>128){fl=Math.min(fl,x);fr=Math.max(fr,x);}
      const correction=256-(fl+fr)/2;if(Math.abs(correction)<.25)break;dx+=correction;draw();
    }
    if(dx+left*scale<1||dx+(right+1)*scale>511)throw Error(name+': corrected gesture would be clipped');
    frames.push({png:output.toDataURL().split(',')[1],durationMs:image.duration/1000,sourceBounds:[left,top,right,bottom],sourceFootCenter:anchor,scale,translation:[dx,dy]});image.close();
   }
   d.close();return frames;
  },name);
  for(let i=0;i<8;i++)await writeFile(join(folder,`${i}.png`),Buffer.from(result[i].png,'base64'));
  const duration=result[0].durationMs;if(result.some(f=>f.durationMs!==duration))throw Error('Variable source timing needs explicit encoding');
  const file=`hina-${name}.gif`;
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',`${1000/duration}`,'-i',join(folder,'%d.png'),'-filter_complex','split[a][b];[a]palettegen=reserve_transparent=1:stats_mode=full[p];[b][p]paletteuse=alpha_threshold=128:dither=sierra2_4a','-loop',name==='news'?'-1':'0','-gifflags','-offsetting',join('shared/hina/assets',file)]);
  const bytes=await readFile(join('shared/hina/assets',file));
  report.motions[name]={file,format:'gif',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),animated:true,complete:true,frames:8,durationMs:result.reduce((n,f)=>n+f.durationMs,0),loop:name!=='news',width:512,height:614,centerX:256,footY:610,originalSha256:createHash('sha256').update(source).digest('hex'),transforms:result.map(({png,...rest})=>rest)};
  console.log(file,bytes.length,'bytes, eight frames,',report.motions[name].durationMs,'ms');
 }
 await mkdir('docs/hina-gifs',{recursive:true});await writeFile('docs/hina-gifs/alignment.json',JSON.stringify(report,null,2)+'\n');
 for(const filename of ['manifest.json','idle-manifest.json']){
  const path='shared/hina/assets/'+filename,m=JSON.parse(await readFile(path,'utf8'));m.version='2026.11.11-shared-gifs.2';
  for(const [state,name]of [['IDLE','idle'],['ALERT','alert'],['SUCCESS','news']]){const{originalSha256,transforms,...entry}=report.motions[name];m.assets[state]=entry;}
  await writeFile(path,JSON.stringify(m,null,2)+'\n');
 }
 const web=JSON.parse(await readFile('shared/hina/assets/manifest.json','utf8'));
 await writeFile('shared/hina/bundled-web-manifest.js','// Generated from assets/manifest.json; refresh with the manifest update script.\nexport default '+JSON.stringify(web)+';\n');
}finally{await browser.close();await new Promise(r=>server.close(r));}
console.log('Original archive unchanged. Render work:',work);
