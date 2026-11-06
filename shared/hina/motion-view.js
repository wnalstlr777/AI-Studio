// The app and review controls share this decoder/canvas; no CSS pose substitutes.
export class MotionView {
  constructor(image,canvas,{onFrame=()=>{},onError=()=>{},onReady=()=>{},onEnded=()=>{}}={}){Object.assign(this,{image,canvas,onFrame,onError,onReady,onEnded});this.serial=0;this.key='';this.paused=false;}
  async show(asset,key){
    if(this.key===key)return;
    this.close();this.key=key;const serial=this.serial;
    if(!asset)return;
    this.canvas.width=asset.width;this.canvas.height=asset.height;
    if(!globalThis.ImageDecoder){this.image.src=asset.src;this.onError('이 WebView는 프레임 검수/일시정지를 지원하지 않습니다. WebView2를 업데이트해 주세요.');return;}
    this.controller=new AbortController();this.timeout=setTimeout(()=>this.controller?.abort(),15000);
    try{
      const response=await fetch(asset.src,{signal:this.controller.signal,credentials:'omit'});if(!response.ok)throw Error('Motion load failed');
      const data=await response.arrayBuffer();if(serial!==this.serial)return;
      this.decoder=new ImageDecoder({data,type:asset.format==='apng'?'image/png':`image/${asset.format}`});await this.decoder.tracks.ready;
      if(serial!==this.serial)return;
      if(this.decoder.tracks.selectedTrack.frameCount!==asset.frames)throw Error('Motion frame metadata mismatch');
      this.ends=[];let end=0;for(let i=0;i<asset.frames;i++){const result=await this.decoder.decode({frameIndex:i});end+=result.image.duration/1000;result.image.close();this.ends.push(end);if(serial!==this.serial)return;}
      this.frame=0;this.loops=asset.loop;this.total=asset.frames;this.delay=asset.durationMs/asset.frames;
      await this.draw(serial);if(serial!==this.serial)return;
      this.canvas.hidden=false;this.image.style.visibility='hidden';this.elapsed=0;this.last=performance.now();clearTimeout(this.timeout);this.onReady();this.raf=requestAnimationFrame(t=>this.tick(t,serial));
    }catch(error){if(serial===this.serial){this.close();this.onError(error.name==='AbortError'?'모션 읽기 시간 초과':error.message);}}
  }
  async draw(serial){
    const decoder=this.decoder,{image}=await decoder.decode({frameIndex:this.frame});
    try{if(serial!==this.serial)return;const ctx=this.canvas.getContext('2d');ctx.clearRect(0,0,this.canvas.width,this.canvas.height);ctx.drawImage(image,0,0);this.onFrame();}finally{image.close();}
  }
  async tick(time,serial){
    if(serial!==this.serial)return;
    if(!this.paused)this.elapsed+=time-this.last;this.last=time;
    const duration=this.ends.at(-1);
    if(this.elapsed>=duration&&!this.loops){this.onEnded();return;}
    const position=this.elapsed%duration;
    const next=this.ends.findIndex(end=>position<end);
    if(!this.paused&&next!==this.frame){
      this.frame=next;
      try{await this.draw(serial);}catch(error){if(serial===this.serial){this.close();this.onError(error.message);}return;}
    }
    if(serial===this.serial)this.raf=requestAnimationFrame(t=>this.tick(t,serial));
  }
  pause(value){this.paused=value;this.last=performance.now();}
  close(){this.serial++;clearTimeout(this.timeout);cancelAnimationFrame(this.raf);this.controller?.abort();this.decoder?.close();this.decoder=null;this.canvas.hidden=true;this.image.style.visibility='';this.key='';this.paused=false;}
}
