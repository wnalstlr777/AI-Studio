// All coordinates are in the immutable 1145 x 1373 source canvas.
// Clipping retains original pixels; each part receives only a rigid transform.
export const rig={
 source:'shared/hina/assets/secretary.png',width:1145,height:1373,
 output:{width:512,height:614,centerX:256,footY:610},
 parts:[
  {id:'legs',pivot:[595,1050],z:0,provenance:'original, legs/shoes kept together; crossed hidden leg unresolved',path:'M 460 1024 L 724 1040 L 703 1165 L 645 1280 L 630 1373 L 410 1373 L 418 1220 L 480 1110 Z'},
  {id:'torso',pivot:[610,900],z:1,provenance:'original jacket/skirt; covered chest restored separately',path:'M 546 599 L 600 575 L 686 601 L 784 646 L 796 720 L 758 866 L 777 940 L 735 1080 L 474 1080 L 430 994 L 424 915 L 456 853 L 401 804 L 395 688 Z'},
  {id:'clipboardArm',pivot:[467,680],z:3,provenance:'original clipboard, sleeve, hand as one coupled part; covered fingers unresolved',path:'M 354 653 L 492 610 L 513 632 L 561 620 L 615 718 L 657 819 L 648 839 L 583 851 L 473 879 L 397 857 L 384 823 L 405 779 Z'},
  {id:'upperArm',pivot:[772,667],z:2,provenance:'original right jacket sleeve',path:'M 762 637 L 802 624 L 842 586 L 891 622 L 891 681 L 837 725 L 792 729 L 755 693 Z'},
  {id:'hand',pivot:[844,622],z:4,provenance:'original palm/forearm; wrist overlap kept',path:'M 823 618 L 847 560 L 879 526 L 895 501 L 945 477 L 958 486 L 949 507 L 1014 517 L 1024 550 L 1013 567 L 946 572 L 904 600 L 883 646 L 846 640 Z'},
  {id:'head',pivot:[618,585],z:5,provenance:'original hair, face, glasses and earrings together; no separate hidden back hair claimed',path:'M 110 0 L 960 0 L 963 477 L 884 479 L 866 523 L 824 568 L 775 593 L 706 603 L 666 581 L 609 582 L 555 603 L 499 615 L 440 630 L 400 654 L 303 658 L 130 612 Z'},
 ],
 faceRestoration:{file:'shared/hina/rig/face-restoration.png',provenance:'AI restored open eyes and closed smile; only facial interior patches used; requires identity review'},
 restoration:{file:'shared/hina/rig/torso-restoration.png',provenance:'AI-restored torso reference; only masked covered chest patch is used; review required',sourceRect:[390,600,380,575],targetRect:[395,591,390,496],mask:'M 403 661 L 505 631 L 580 661 L 637 822 L 570 859 L 424 847 Z'},
 unresolved:['Hidden back hair and open-eye facial reconstruction are not original pixels.','Crossed legs and clipboard fingers are not independently separated.','Restored chest/shoulder seams require art approval; all eight motions remain drafts.'],
};
export const motionSpecs=[
 ['IDLE_NORMAL','기본 대기',32,3200,true],['IDLE_HAPPY','행복',24,2400,false],
 ['IDLE_THINK','생각',30,3000,false],['IDLE_SURPRISE','놀람',20,2000,false],
 ['IDLE_GREETING','인사',28,2800,false],['IDLE_EXPLAIN','설명',30,3000,false],
 ['IDLE_NOTE','메모',32,3200,false],['IDLE_CHEER','기쁨',24,2400,false],
].map(([id,label,frames,durationMs,loop])=>({id,label,frames,durationMs,loop}));
export function pose(id,t){
 const e=Math.sin(Math.PI*t)**2,s=Math.sin(2*Math.PI*t),wave=Math.sin(6*Math.PI*t)*e;
 const p={head:0,upperArm:0,hand:0,clipboardArm:0,torsoY:0,headY:0,jump:0,blink:0,open:0,smile:0};
 if(id==='IDLE_NORMAL'){p.headY=2*e;p.blink=Math.max(0,1-Math.abs(t-.6)*18);p.open=e*(1-p.blink);p.smile=e;}
 if(id==='IDLE_HAPPY'){p.head=-1.4*s;p.torsoY=-3*e;p.upperArm=-4*e;p.hand=5*wave;p.clipboardArm=1.2*wave;}
 if(id==='IDLE_THINK'){p.open=e;p.smile=e;p.head=-3*e;p.hand=-9*e;p.upperArm=3*e;p.headY=2*e;}
 if(id==='IDLE_SURPRISE'){const a=Math.sin(Math.PI*Math.min(1,t*2))**2;p.open=a;p.head=2.4*a;p.headY=0;p.upperArm=-7*a;p.hand=-10*a;p.clipboardArm=2*a;}
 if(id==='IDLE_GREETING'){p.upperArm=-4*e;p.hand=12*wave;p.head=-1.2*e;}
 if(id==='IDLE_EXPLAIN'){p.upperArm=5*s*e;p.hand=-9*s*e;p.head=1.5*s*e;}
 if(id==='IDLE_NOTE'){p.open=e;p.smile=e;p.head=3.5*e;p.headY=3*e;p.clipboardArm=-3*e;p.upperArm=3*e;p.hand=-8*e+2*wave;}
 if(id==='IDLE_CHEER'){p.jump=-2*e;p.upperArm=-8*e;p.hand=-9*e+5*wave;p.clipboardArm=2*e;p.head=-1.4*s;}
 return p;
}
