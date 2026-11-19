type Pending = { id:string; element:HTMLCanvasElement; rect:DOMRect; timeout:number };
let pending:Pending | null = null;

export function prepareMoveAnimation(id:string, a:number, b:number) {
  if (pending) { window.clearTimeout(pending.timeout); pending.element.remove(); pending=null; }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>('.hand-tile')).find(el=>el.getAttribute('aria-label')===`Domino ${a} et ${b}`);
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
  pending={id,element,rect,timeout};
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
  pending={id:tile.id,element,rect,timeout};
}

export function finishMoveAnimation(id:string, target:DOMRect, horizontal:boolean, done:()=>void):boolean {
  if (!pending || pending.id!==id) return false;
  const {element,rect,timeout}=pending; pending=null; window.clearTimeout(timeout);
  const dx=target.left+target.width/2-(rect.left+rect.width/2), dy=target.top+target.height/2-(rect.top+rect.height/2);
  const sx=(horizontal ? target.height : target.width)/rect.width, sy=(horizontal ? target.width : target.height)/rect.height;
  const animation=element.animate([{transform:'translate(0, 0) rotate(0deg) scale(1)'},{transform:`translate(${dx}px, ${dy}px) rotate(${horizontal ? 90 : 0}deg) scale(${sx}, ${sy})`}],{duration:420,easing:'cubic-bezier(.22, .61, .36, 1)',fill:'forwards'});
  animation.onfinish=()=>{element.remove();done();};
  animation.oncancel=()=>{element.remove();done();};
  return true;
}
