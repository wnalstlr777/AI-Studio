import { MOTIONS } from './remote-assets-policy.js';

// Idle is a sub-motion, never a replacement for a QA or movement state.
export class IdlePlayer {
  constructor({getMotion,onChange,random=Math.random,now=Date.now}={}){
    Object.assign(this,{getMotion,onChange,random,now});
    this.state='IDLE';this.mode='auto';this.id='IDLE_NORMAL';this.sequence=0;
    this.deadline=0;this.nextAt=this.now()+this.gap();this.paused=false;this.reviewRandom=false;this.waiting=false;
  }
  reset({reviewRandom=false}={}){this.waiting=false;this.reviewRandom=reviewRandom;this.mode='auto';this.paused=false;this.id='IDLE_NORMAL';this.deadline=0;this.nextAt=this.now()+this.gap();this.sequence++;this.onChange?.();}
  gap(){return 6000+this.random()*9000;}
  setState(state){
    if(state===this.state)return;
    this.state=state;this.waiting=false;this.paused=false;this.mode='auto';this.reviewRandom=false;this.id='IDLE_NORMAL';this.deadline=0;this.nextAt=this.now()+this.gap();this.sequence++;
  }
  select(id,{loop=false}={}){
    if(this.state!=='IDLE'||!MOTIONS.includes(id)||!this.getMotion(id,{review:true}))return false;
    this.id=id;this.mode=loop?'loop':'once';this.paused=false;this.sequence++;
    this.deadline=this.now()+this.getMotion(id,{review:true}).durationMs;this.onChange?.();return true;
  }
  asset(){return this.state==='IDLE'?this.getMotion(this.id,{review:this.mode!=='auto'||this.reviewRandom}):null;}
  loading(){this.waiting=true;}
  loaded(){this.waiting=false;if(this.deadline)this.deadline=this.now()+(this.asset()?.durationMs||0);this.pauseAt=this.now();}
  ended(){if(this.state==='IDLE'&&this.mode!=='loop'&&this.deadline)this.reset({reviewRandom:this.reviewRandom});}
  tick(){
    if(this.state!=='IDLE'||this.paused||this.waiting)return;
    const time=this.now();
    if(this.mode==='loop')return;
    if(this.deadline){if(time>=this.deadline)this.reset({reviewRandom:this.reviewRandom});return;}
    if(this.mode!=='auto'||time<this.nextAt)return;
    const candidates=MOTIONS.filter(id=>id!=='IDLE_NORMAL'&&id!==this.last&&this.getMotion(id,{review:!!this.reviewRandom}));
    this.nextAt=time+this.gap();
    if(!candidates.length)return;
    this.id=candidates[Math.min(candidates.length-1,Math.floor(this.random()*candidates.length))];this.last=this.id;
    this.deadline=time+this.getMotion(this.id,{review:!!this.reviewRandom}).durationMs;this.sequence++;this.onChange?.();
  }
  togglePause(){if(this.state!=='IDLE'||!this.asset())return false;this.paused=!this.paused;this.pauseAt=this.paused?this.now():this.pauseAt;
    if(!this.paused){const elapsed=this.now()-this.pauseAt;if(this.deadline)this.deadline+=elapsed;this.nextAt+=elapsed;}
    this.onChange?.();return this.paused;
  }
}
