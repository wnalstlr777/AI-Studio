// One pointer sequence owns a drag. A subsequent pointerdown always starts a fresh click.
export function bindPetInput(element, { onClick, onDrag, onActivity, onError }) {
  let pointer=null, suppressClick=false, dragging=false;
  const release=()=>{
    if(pointer && element.hasPointerCapture?.(pointer.id)) element.releasePointerCapture(pointer.id);
    pointer=null;
  };
  element.addEventListener('pointerdown',event=>{
    if(event.button!==0 || dragging)return;
    suppressClick=false;
    pointer={id:event.pointerId,x:event.screenX,y:event.screenY};
    element.setPointerCapture?.(event.pointerId);onActivity(true);
  });
  element.addEventListener('pointermove',async event=>{
    if(!pointer || event.pointerId!==pointer.id || dragging || !(event.buttons&1))return;
    if(Math.hypot(event.screenX-pointer.x,event.screenY-pointer.y)<5)return;
    dragging=true;suppressClick=true;release();
    try{await onDrag();}catch(error){onError(error);}
    finally{dragging=false;onActivity(false);}
  });
  for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,()=>{release();if(!dragging)onActivity(false);});
  element.addEventListener('click',event=>{
    release();
    if(suppressClick && event.detail!==0){suppressClick=false;return;}
    suppressClick=false;Promise.resolve(onClick()).catch(onError);
  });
}
