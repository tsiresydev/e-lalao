type Pending = { id:string; a:number; b:number; element:HTMLCanvasElement; rect:DOMRect; timeout:number };
let pending:Pending | null = null;

export function matchesDominoLabel(name:string|null, a:number, b:number):boolean {
  const label = `Domino ${a} et ${b}`;
  return name === label || Boolean(name?.startsWith(`${label}, `));
}

export function prepareMoveAnimation(id:string, a:number, b:number) {
  if (pending) { window.clearTimeout(pending.timeout); pending.element.remove(); pending=null; }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.hand-tile'))
    .find(el=>matchesDominoLabel(el.getAttribute('aria-label'),a,b));
  const source = button?.querySelector('canvas');
  if (!source) return;
  const bounds=source.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const x=4/48, y=3/78, w=36/48, h=72/78;
  const rect=new DOMRect(bounds.left+bounds.width*x,bounds.top+bounds.height*y,bounds.width*w,bounds.height*h);
  const element=document.createElement('canvas');
  element.width=144; element.height=288;
  element.getContext('2d')?.drawImage(source,source.width*x,source.height*y,source.width*w,source.height*h,0,0,element.width,element.height);
  Object.assign(element.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,pointerEvents:'none',zIndex:'1000'});
  document.body.appendChild(element);
  const timeout=window.setTimeout(()=>{element.remove();if(pending?.element===element)pending=null;},2000);
  pending={id,a,b,element,rect,timeout};
}

export function prepareOpponentAnimation(tile:{id:string;a:number;b:number}, source:DOMRect) {
  if (pending || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const element=document.createElement('canvas');
  element.width=128; element.height=256;
  const ctx=element.getContext('2d');
  if(!ctx)return;
  ctx.fillStyle='#fff';ctx.strokeStyle='#c8ceca';ctx.lineWidth=3;
  ctx.beginPath();ctx.roundRect(2,2,124,252,10);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#303937';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(16,128);ctx.lineTo(112,128);ctx.stroke();
  const points:Record<number,[number,number][]>={0:[],1:[[.5,.5]],2:[[.25,.25],[.75,.75]],3:[[.25,.25],[.5,.5],[.75,.75]],4:[[.25,.25],[.75,.25],[.25,.75],[.75,.75]],5:[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]],6:[[.25,.2],[.75,.2],[.25,.5],[.75,.5],[.25,.8],[.75,.8]]};
  ctx.fillStyle='#101615';
  [tile.a,tile.b].forEach((n,half)=>points[n].forEach(([x,y])=>{ctx.beginPath();ctx.arc(x*128,(half+y)*128,11,0,Math.PI*2);ctx.fill();}));
  const rect=new DOMRect(source.left+source.width/2-18,source.top+source.height/2-36,36,72);
  Object.assign(element.style,{position:'fixed',left:`${rect.left}px`,top:`${rect.top}px`,width:`${rect.width}px`,height:`${rect.height}px`,pointerEvents:'none',zIndex:'1000'});
  document.body.appendChild(element);
  const timeout=window.setTimeout(()=>{element.remove();if(pending?.element===element)pending=null;},2000);
  pending={id:tile.id,a:tile.a,b:tile.b,element,rect,timeout};
}

export function dominoArrivalAngle(a:number, b:number, first:number, horizontal:boolean):number {
  const reversed = a !== b && first === b;
  return horizontal ? (reversed ? 90 : -90) : (reversed ? 180 : 0);
}

const pipPositions:Record<number,[number,number][]>= {
  0:[],1:[[.5,.5]],2:[[.25,.25],[.75,.75]],3:[[.25,.25],[.5,.5],[.75,.75]],
  4:[[.25,.25],[.75,.25],[.25,.75],[.75,.75]],
  5:[[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]],
  6:[[.25,.2],[.75,.2],[.25,.5],[.75,.5],[.25,.8],[.75,.8]],
};

// Draw the final face first, then rotate it back into the travelling canvas.
// Its pips therefore have exactly the board's orientation when it lands.
function prepareArrivalFace(element:HTMLCanvasElement, first:number, second:number, horizontal:boolean, angle:number) {
  const face=document.createElement('canvas');
  const scale=4, width=horizontal?64:32, height=horizontal?32:64;
  face.width=width*scale; face.height=height*scale;
  const ctx=face.getContext('2d'), out=element.getContext('2d');
  if(!ctx || !out) return;
  ctx.scale(scale,scale);
  const gradient=ctx.createLinearGradient(0,0,width,height);
  gradient.addColorStop(0,'#fffefa'); gradient.addColorStop(1,'#efece2');
  ctx.fillStyle=gradient;ctx.strokeStyle='#c8ceca';ctx.lineWidth=.8;
  ctx.beginPath();ctx.roundRect(.4,.4,width-.8,height-.8,4);ctx.fill();ctx.stroke();
  ctx.strokeStyle='#3b423d';ctx.lineWidth=.8;ctx.beginPath();
  if(horizontal){ctx.moveTo(32,4);ctx.lineTo(32,28);}else{ctx.moveTo(4,32);ctx.lineTo(28,32);}ctx.stroke();
  ctx.fillStyle='#17231f';
  [first,second].forEach((n,half)=>pipPositions[n].forEach(([px,py])=>{
    const x=horizontal?half*32+(n===6?py:px)*32:px*32;
    const y=horizontal?(n===6?px:py)*32:half*32+py*32;
    ctx.beginPath();ctx.arc(x,y,2.8,0,Math.PI*2);ctx.fill();
  }));
  element.width=128;element.height=256;
  out.clearRect(0,0,128,256);out.save();out.translate(64,128);out.rotate(-angle*Math.PI/180);
  out.drawImage(face,-face.width/2,-face.height/2);out.restore();
}

export function finishMoveAnimation(id:string, target:DOMRect, horizontal:boolean, first:number, second:number, done:(landed:boolean)=>void):boolean {
  if (!pending || pending.id!==id) return false;
  const {element,rect,timeout,a,b}=pending; pending=null; window.clearTimeout(timeout);
  const dx=target.left+target.width/2-(rect.left+rect.width/2), dy=target.top+target.height/2-(rect.top+rect.height/2);
  const sx=(horizontal ? target.height : target.width)/rect.width, sy=(horizontal ? target.width : target.height)/rect.height;
  let animation:Animation;
  try {
    const angle=dominoArrivalAngle(a,b,first,horizontal);
    prepareArrivalFace(element,first,second,horizontal,angle);
    animation=element.animate([{transform:'translate(0, 0) rotate(0deg) scale(1)'},{transform:`translate(${dx}px, ${dy}px) rotate(${angle}deg) scale(${sx}, ${sy})`}],{duration:420,easing:'cubic-bezier(.22, .61, .36, 1)',fill:'forwards'});
  } catch {
    element.remove();
    return false;
  }
  animation.onfinish=()=>{
    // Keep the travelling tile in place until Konva has drawn its replacement.
    done(true);
    const timeout=window.setTimeout(()=>element.remove(),100);
    requestAnimationFrame(()=>{window.clearTimeout(timeout);element.remove();});
  };
  animation.oncancel=()=>{done(false);element.remove();};
  return true;
}
