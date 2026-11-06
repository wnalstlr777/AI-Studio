// Set a path only after alpha/frame inspection. Never claim placeholder motions are finished.
export const animations = Object.fromEntries(['IDLE','WALK','REST','WORK','SUCCESS','ALERT'].map(state => [state, { src: null, complete: false }]));
export function assetFor(state) {
  const asset = animations[state] || animations.IDLE;
  return { src: new URL(asset.src || './assets/placeholder.svg', import.meta.url).href, complete: asset.complete, label: asset.complete ? state : `${state} · 전용 애니메이션 미제작 (임시 그림)` };
}
