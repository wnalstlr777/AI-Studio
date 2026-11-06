import manifest from './shared/hina/bundled-manifest.js';
import {MotionView} from './shared/hina/motion-view.js';
import {IdlePlayer} from './shared/hina/idle-player.js';
import {MOTIONS} from './shared/hina/remote-assets-policy.js';
const $=s=>document.querySelector(s),labels=['기본 대기','행복','생각','놀람','인사','설명','메모','기쁨'];
for(const [i,id]of MOTIONS.entries())$('#choose').add(new Option(`${String(i+1).padStart(2,'0')} ${labels[i]}`,id));
const motion=id=>{const a=manifest.motions[id];return a?{...a,id,src:new URL('./shared/hina/assets/'+a.file,import.meta.url).href}:null;};
const view=new MotionView($('#image'),$('#canvas'),{onReady:()=>player.loaded(),onEnded:()=>player.ended(),onError:e=>{$('#error').textContent=e;player.loaded();}});
const player=new IdlePlayer({getMotion:motion,onChange:render});
function render(){const asset=player.asset();if(!asset)return;const key=`${asset.src}:${player.sequence}`;if(view.key!==key)player.loading();view.show({...asset,loop:player.mode==='loop'||asset.loop},key);view.pause(player.paused);$('#choose').value=player.id;$('#info').textContent=`${asset.frames} 프레임 · ${(asset.durationMs/1000).toFixed(2)}초 · ${asset.width}×${asset.height} · 중심 ${asset.centerX}px / 발 ${asset.footY}px · 검수 시안`;$('#caption').textContent=player.id;$('#pause').textContent=player.paused?'재생':'일시정지';}
let repeat=false;
$('#choose').onchange=e=>player.select(e.target.value,{loop:repeat});
$('#repeat').onclick=()=>{repeat=!repeat;$('#repeat').setAttribute('aria-pressed',repeat);player.select(player.id,{loop:repeat});};
$('#pause').onclick=()=>player.togglePause();
$('#normal').onclick=()=>player.reset();
$('#random').onclick=()=>player.reset({reviewRandom:true});
$('#guides').onclick=()=>{const on=$('#stage').classList.toggle('guides');$('#guides').setAttribute('aria-pressed',on);};
player.reset();const timer=setInterval(()=>player.tick(),50);
window.addEventListener('beforeunload',()=>{clearInterval(timer);view.close();});
