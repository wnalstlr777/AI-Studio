// User-supplied originals. Only the greeting is animated; never invent other motions.
export const animations = {
  IDLE: { src:'./assets/greeting.gif', complete:true, animated:true },
  ...Object.fromEntries(['WALK','REST','WORK','SUCCESS','ALERT'].map(state=>[state,{src:'./assets/secretary.png',complete:false,animated:false}]))
};
export function assetFor(state) {
  const asset=animations[state] || {src:'./assets/secretary.png',complete:false,animated:false};
  return {...asset,src:new URL(asset.src,import.meta.url).href,label:asset.complete?`${state} · 원본 인사 GIF`:`${state} · 전용 모션 미제작 (제공 원본 PNG)`};
}
