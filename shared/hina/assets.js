// User-supplied originals. Only the greeting is animated; never invent other motions.
export const animations = {
  IDLE: { src:'./assets/secretary.png', complete:true, animated:true },
  ...Object.fromEntries(['WALK','REST','WORK','SUCCESS','ALERT'].map(state=>[state,{src:'./assets/secretary.png',complete:false,animated:false}]))
};
export function assetFor(state) {
  const asset=animations[state] || {src:'./assets/secretary.png',complete:false,animated:false};
  return {...asset,src:new URL(asset.src,import.meta.url).href,label:state==='IDLE'?'IDLE · 호흡 모션 / 가끔 인사':asset.complete?`${state} · 전용 모션`:`${state} · 전용 모션 미제작 (제공 원본 PNG)`};
}
