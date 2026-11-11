// Assemble generated sprite cells; does not redraw or warp character art.
import {createRequire} from 'node:module';
import {readFile,writeFile,mkdir,mkdtemp} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
const require=createRequire(new URL('../desktop/package.json',import.meta.url));
const {chromium}=require('playwright-core');
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
const dir=await mkdtemp(join(tmpdir(),'hina-rest-'));
try {
 const page=await browser.newPage();
 const source=await readFile('sources/hina/rest/generated-sheet.png');
 const frames=await page.evaluate(async b64=>{
  const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
  const cw=Math.ceil(img.width/4),ch=Math.ceil(img.height/2),src=document.createElement('canvas');src.width=cw;src.height=ch;
  const sc=src.getContext('2d',{willReadFrequently:true}),out=document.createElement('canvas');out.width=512;out.height=614;
  const oc=out.getContext('2d',{willReadFrequently:true}),frames=[];
  for(let i=0;i<8;i++){
   sc.clearRect(0,0,cw,ch);sc.drawImage(img,(i%4)*img.width/4,Math.floor(i/4)*img.height/2,img.width/4,img.height/2,0,0,cw,ch);
   const p=sc.getImageData(0,0,cw,ch).data;let l=cw,r=0,t=ch,b=0;
   for(let y=0;y<ch;y++)for(let x=0;x<cw;x++)if(p[(y*cw+x)*4+3]>=128){l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);}
   // Head center is the stable anchor; alternating planted feet may move during a real step.
   let hl=cw,hr=0;for(let y=t;y<t+(b-t)*.43;y++)for(let x=0;x<cw;x++)if(p[(y*cw+x)*4+3]>=128){hl=Math.min(hl,x);hr=Math.max(hr,x);}
   let scale=480/(b-t+1),dx=256-(hl+hr+1)/2*scale,dy=611-(b+1)*scale;
   for(let pass=0;pass<10;pass++){
    oc.clearRect(0,0,512,614);oc.drawImage(src,dx,dy,cw*scale,ch*scale);
    const pixels=oc.getImageData(0,0,512,614).data;let ot=614,ob=0;
    for(let y=0;y<614;y++)for(let x=0;x<512;x++)if(pixels[(y*512+x)*4+3]>=128){ot=Math.min(ot,y);ob=Math.max(ob,y);}
    if(ot===131&&ob===610)break;
    if(pass===9)throw Error('Could not align frame '+i);
    const ratio=480/(ob-ot+1);scale*=ratio;dx=256-(hl+hr+1)/2*scale;dy=131+(dy-ot)*ratio;
   }
   frames.push({png:out.toDataURL().split(',')[1],sourceBounds:[l,t,r,b],scale,translation:[dx,dy]});
  }return frames;
 },source.toString('base64'));
 for(let i=0;i<frames.length;i++)await writeFile(join(dir,`${i}.png`),Buffer.from(frames[i].png,'base64'));
 const sequence=[0,1,2,3,4,3,2,1];
 for(let i=0;i<sequence.length;i++)await writeFile(join(dir,`cycle-${i}.png`),Buffer.from(frames[sequence[i]].png,'base64'));
 const file='shared/hina/assets/hina-rest.gif';
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','5','-i',join(dir,'cycle-%d.png'),'-filter_complex','split[a][b];[a]palettegen=reserve_transparent=1[p];[b][p]paletteuse=alpha_threshold=128:dither=sierra2_4a','-loop','0','-gifflags','-offsetting',file]);
 const bytes=await readFile(file);
 await writeFile('docs/hina-gifs/rest/metadata.json',JSON.stringify({status:'preview; not deployed',file,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),width:512,height:614,frames:8,durationMs:1600,loop:true,characterHeight:480,headCenterX:256,footY:610,sourceSequence:sequence,direction:'front-facing quiet rest',upperBody:'full original cel, no upper/lower splicing',framesTransforms:frames.map(({png,...rest})=>rest)},null,2)+'\n');
 console.log(file,bytes.length,'bytes');
}finally{await browser.close();}
