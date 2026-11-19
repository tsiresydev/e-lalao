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
