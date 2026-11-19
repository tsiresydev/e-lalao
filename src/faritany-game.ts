export type Player = 'blue' | 'red';
export type Point = { x:number; y:number; player:Player; captured:boolean };
export type Territory = { player:Player; path:{x:number;y:number}[] };
export type FaritanyGame = { size:number; points:Point[]; territories:Territory[]; turn:Player; finished:boolean; target:number };

export function newFaritany(size=15,target=10):FaritanyGame {
  return {size,points:[],territories:[],turn:'blue',finished:false,target};
}

const key=(x:number,y:number)=>`${x},${y}`;
const area=(path:Point[])=>path.reduce((sum,p,i)=>{const next=path[(i+1)%path.length];return sum+p.x*next.y-next.x*p.y;},0)/2;

function inside(point:Point, polygon:Point[]):boolean {
  let result=false;
  for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){
    const a=polygon[i], b=polygon[j];
    if((a.y>point.y)!==(b.y>point.y) && point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x) result=!result;
  }
  return result;
}

// Trace bounded faces of the graph of adjacent, uncaptured points.
function faces(points:Point[], player:Player):Point[][] {
  const own=points.filter(p=>p.player===player && !p.captured);
  const lookup=new Map(own.map(p=>[key(p.x,p.y),p]));
  const neighbours=new Map<string,Point[]>();
  for(const p of own){
    const adjacent:Point[]=[];
    for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
      if(!dx && !dy)continue;
      const other=lookup.get(key(p.x+dx,p.y+dy));
      if(!other)continue;
      // Two crossing diagonals imply all four corners exist; the square's
      // orthogonal edges preserve connectivity without ambiguous crossings.
      if(dx && dy && lookup.has(key(p.x+dx,p.y)) && lookup.has(key(p.x,p.y+dy)))continue;
      adjacent.push(other);
    }
    adjacent.sort((a,b)=>Math.atan2(a.y-p.y,a.x-p.x)-Math.atan2(b.y-p.y,b.x-p.x));
    neighbours.set(key(p.x,p.y),adjacent);
  }
  const visited=new Set<string>(), result:Point[][]=[];
  for(const start of own)for(const next of neighbours.get(key(start.x,start.y)) ?? []){
    const edge=`${key(start.x,start.y)}>${key(next.x,next.y)}`;
    if(visited.has(edge))continue;
    const path:Point[]=[];
    let a=start,b=next;
    while(true){
      const current=`${key(a.x,a.y)}>${key(b.x,b.y)}`;
      if(visited.has(current))break;
      visited.add(current);path.push(a);
      const options=neighbours.get(key(b.x,b.y))!;
      const reverse=options.findIndex(p=>p.x===a.x && p.y===a.y);
      const c=options[(reverse-1+options.length)%options.length];
      a=b;b=c;
    }
    if(path.length>=3 && area(path)>0)result.push(path);
  }
  return result;
}

export function placePoint(game:FaritanyGame,x:number,y:number):FaritanyGame {
  if(game.finished || !Number.isInteger(x) || !Number.isInteger(y) || x<0 || y<0 || x>=game.size || y>=game.size || game.points.some(p=>p.x===x && p.y===y))return game;
  const points=[...game.points,{x,y,player:game.turn,captured:false}];
  const territories=[...game.territories];
  for(const path of faces(points,game.turn)){
    const captured=points.filter(p=>p.player!==game.turn && !p.captured && inside(p,path));
    if(!captured.length)continue;
    for(const point of captured)points[points.indexOf(point)]={...point,captured:true};
    territories.push({player:game.turn,path:path.map(p=>({x:p.x,y:p.y}))});
  }
  const captured=points.filter(p=>p.player!==game.turn && p.captured).length;
  const finished=captured>=game.target;
  const size=!finished && points.length===game.size*game.size ? game.size+5 : game.size;
  return {...game,size,points,territories,turn:game.turn==='blue'?'red':'blue',finished};
}

export function score(game:FaritanyGame,player:Player):number {
  return game.points.filter(p=>p.player!==player && p.captured).length;
}

export function computerMove(game:FaritanyGame):{x:number;y:number}|null {
  if(game.finished)return null;
  const occupied=new Set(game.points.map(p=>key(p.x,p.y)));
  const candidates:{x:number;y:number;weight:number}[]=[];
  for(let y=0;y<game.size;y++)for(let x=0;x<game.size;x++){
    if(occupied.has(key(x,y)))continue;
    const neighbours=game.points.filter(p=>!p.captured && Math.max(Math.abs(p.x-x),Math.abs(p.y-y))<=2);
    candidates.push({x,y,weight:neighbours.reduce((sum,p)=>sum+(p.player===game.turn?2:1),0)+Math.random()});
  }
  candidates.sort((a,b)=>b.weight-a.weight);
  let best:{x:number;y:number}|null=null,bestValue=-Infinity;
  const previous=score(game,game.turn);
  for(const candidate of candidates.slice(0,32)){
    const next=placePoint(game,candidate.x,candidate.y);
    const value=(score(next,game.turn)-previous)*100+candidate.weight;
    if(value>bestValue){bestValue=value;best=candidate;}
  }
  return best;
}
