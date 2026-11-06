import '../scripts/build.mjs';
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { extname, resolve, sep } from 'node:path';
import assert from 'node:assert/strict';
import { remoteAssetChecks } from './remote-assets-browser.mjs';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const server=createServer(async(req,res)=>{
  const p=resolve(root,'.'+new URL(req.url,'http://localhost').pathname.replace(/\/$/,'/index.html'));
  if(!p.startsWith(root.endsWith(sep)?root:root+sep)){res.writeHead(403).end();return;}
  try{res.setHeader('content-type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.gif':'image/gif','.png':'image/png'})[extname(p)]||'application/octet-stream');res.end(await readFile(p));}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch(process.platform==='win32'?{channel:'msedge',headless:true}:{executablePath:process.env.HINA_BROWSER_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const results=[];
try{
  await mkdir('qa-results',{recursive:true});
  const audit=await browser.newPage({viewport:{width:1540,height:1070}});
  await audit.goto(`http://127.0.0.1:${server.address().port}/shared/hina/assets/greeting.gif`);
  const assetAudit=await audit.evaluate(async()=>{
    const bytes=await (await fetch(location.href)).arrayBuffer();
    const decoder=new ImageDecoder({data:bytes,type:'image/gif'});await decoder.tracks.ready;
    document.body.replaceChildren();Object.assign(document.body.style,{margin:'0',display:'grid',gridTemplateColumns:'repeat(3,512px)',background:'#ddd'});
    const frames=[];
    for(let i=0;i<decoder.tracks.selectedTrack.frameCount;i++){
      const {image}=await decoder.decode({frameIndex:i});const canvas=document.createElement('canvas');canvas.width=image.displayWidth;canvas.height=image.displayHeight;
      canvas.style.background='repeating-conic-gradient(#bbb 0% 25%,#fff 0% 50%) 0/24px 24px';const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);
      const rgba=ctx.getImageData(0,0,canvas.width,canvas.height).data;let transparent=0,opaque=0;
      for(let n=3;n<rgba.length;n+=4){if(rgba[n]===0)transparent++;else opaque++;}
      frames.push({frame:i,duration_us:image.duration,width:canvas.width,height:canvas.height,transparent,opaque,corner_alpha:rgba[3]});document.body.append(canvas);image.close();
    }
    decoder.close();return {scope:'Actual supplied GIF, decoded composed frames',frames};
  });
  for(const f of assetAudit.frames){assert.equal(f.corner_alpha,0);assert.ok(f.transparent>0&&f.opaque>0);}
  assert.equal(assetAudit.frames.length,6);
  await writeFile('qa-results/assets.json',JSON.stringify(assetAudit,null,2));await audit.screenshot({path:'qa-results/gif-alpha-contact-sheet.png',fullPage:true});await audit.close();
  const page=await browser.newPage({viewport:{width:320,height:420}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    window.__calls=[];window.__random=0;Math.random=()=>window.__random;
    window.__TAURI__={core:{invoke:async(name,args)=>{window.__calls.push({name,args});return name==='move_pet'?1:false;}},event:{listen:async()=>()=>{}},window:{getCurrentWindow:()=>({setAlwaysOnTop:async()=>{},show:async()=>{}})}};
  });
  let runs=[];await page.route('https://wnalstlr777.github.io/**',route=>route.abort());
  await page.route('https://api.github.com/**',route=>route.fulfill({json:{workflow_runs:runs}}));
  await page.clock.install();await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const state=async(name)=>page.waitForFunction(name=>document.body.dataset.state===name,name);
  await state('IDLE');await page.locator('#character').evaluate(img=>img.decode());
  assert.ok((await page.locator('#character').getAttribute('src')).endsWith('/secretary.png'));
  async function input(name){
    await state(name);const before=await page.evaluate(()=>window.__calls.filter(c=>c.name==='open_office').length);
    await page.locator('#pet').click();const box=await page.locator('#pet').boundingBox();
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();
    await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+10,{steps:3});await page.mouse.up();
    await page.locator('#pet').click();
    const after=await page.evaluate(()=>window.__calls.filter(c=>c.name==='open_office').length);
    assert.equal(after-before,2,`${name}: drag must not open office, next click must work`);
    assert.ok(await page.evaluate(()=>window.__calls.some(c=>c.name==='drag_pet')));
    results.push({case:`${name}: click/drag/next click`,status:'passed',scope:'browser mock IPC'});
  }
  await input('IDLE');
  await page.evaluate(()=>window.__random=.5);await page.clock.fastForward(31000);await input('WALK');
  await page.evaluate(()=>window.__random=.9);await page.clock.fastForward(31000);await input('REST');
  const run={id:424242,run_attempt:1,status:'in_progress',conclusion:null,created_at:new Date(Date.now()+86400000).toISOString(),html_url:'https://github.com/wnalstlr777/AI-Studio/actions/runs/424242'};
  runs=[run];await page.clock.fastForward(120001);await input('WORK');
  runs=[{...run,status:'completed',conclusion:'failure'}];await page.clock.fastForward(120001);await input('ALERT');
  await page.locator('#bubble').click();assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.name==='open_run').at(-1).args.url),run.html_url);
  const mask=await page.evaluate(()=>window.__calls.filter(c=>c.name==='hit_map').at(-1)?.args);
  assert.ok(mask?.pixels.includes(0)&&mask.pixels.includes(1),'alpha mask must retain transparent and interactive areas');
  await remoteAssetChecks(page,{onUpdatedInput:()=>input('IDLE'),resetQA:()=>{runs=[];}});
  assert.deepEqual(errors,[]);
  await mkdir('qa-results',{recursive:true});await page.screenshot({path:'qa-results/desktop-browser.png',omitBackground:true});
  await writeFile('qa-results/browser.json',JSON.stringify({scope:'Chromium DOM + mocked Tauri IPC; not native Windows validation',results},null,2));
  console.log('PASS browser regression: IDLE/WALK/REST/WORK/ALERT, click/drag/click, QA detail URL, alpha mask');
}finally{await browser.close();await new Promise(r=>server.close(r));}
