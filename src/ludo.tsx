import { PrivateRoomWelcome } from './private-room-welcome';
import { WaitingIndicator } from './waiting-indicator';
import { RoomChoice } from './room-choice';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, Copy, Dice5, Users } from 'lucide-react';
import { legalLudoPawns, LUDO_SAFE, trackSquare } from './ludo-game';
import './ludo.css';

type Player = { uid:string; name:string; seat:number; pawns:number[] };
type Room = { code:string; host:string; me:string; status:'waiting'|'playing'|'finished'; turn:number|null; die:number|null; winner:number|null; message:string; player_limit:number|null; players:Player[] };
const client = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ? createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) : null;
const colors=['#e94853','#39b56a','#f0b92f','#438de1'];
const light=['#ffdfe1','#def7e5','#fff1bf','#dcecff'];
const track: [number,number][] = [
  ...[1,2,3,4,5].map(x=>[x,6] as [number,number]), ...[5,4,3,2,1,0].map(y=>[6,y] as [number,number]),
  [7,0],[8,0], ...[1,2,3,4,5].map(y=>[8,y] as [number,number]), ...[9,10,11,12,13,14].map(x=>[x,6] as [number,number]),
  [14,7],[14,8], ...[13,12,11,10,9].map(x=>[x,8] as [number,number]), ...[9,10,11,12,13,14].map(y=>[8,y] as [number,number]),
  [7,14],[6,14], ...[13,12,11,10,9].map(y=>[6,y] as [number,number]), ...[5,4,3,2,1,0].map(x=>[x,8] as [number,number]), [0,7],[0,6],
];
const bases:[[number,number],[number,number],[number,number],[number,number]]=[[0,0],[9,0],[9,9],[0,9]];
const dicePips:Record<number,number[]>={1:[4],2:[0,8],3:[0,4,8],4:[0,2,6,8],5:[0,2,4,6,8],6:[0,2,3,5,6,8]};
function DiceFace({value}:{value:number|null}) {
  return <span className="ludo-dice-face" aria-hidden="true">{value===null?<Dice5 className="ludo-dice-placeholder"/>:Array.from({length:9},(_,i)=><span key={i} className={dicePips[value].includes(i)?'dice-pip visible':'dice-pip'}/>)}</span>;
}
function pawnPosition(seat:number,position:number,index:number):[number,number] {
  if(position<0){const [x,y]=bases[seat];return [x+2.15+(index%2)*1.7,y+1.9+Math.floor(index/2)*1.7];}
  if(position>=56)return [7.5+(seat===0?-.22:seat===2?.22:0),7.5+(seat===1?-.22:seat===3?.22:0)];
  if(position>=51){const step=position-51;return seat===0?[1.5+step,7.5]:seat===1?[7.5,1.5+step]:seat===2?[13.5-step,7.5]:[7.5,13.5-step];}
  const [x,y]=track[trackSquare(seat,position)!];return [x+.5,y+.5];
}
function Board({room,onMove}:{room:Room;onMove:(pawn:number)=>void}) {
  const me=room.players.find(p=>p.uid===room.me);
  const allowed=me && room.turn===me.seat && room.die!==null ? legalLudoPawns({players:room.players.map(p=>({name:p.name,pawns:p.pawns})),turn:room.players.findIndex(p=>p.uid===room.me),die:room.die,sixes:0,winner:null,message:''}) : [];
  return <svg className="ludo-board" viewBox="0 0 15 15" role="group" aria-label="Plateau de Ludo">
    <defs>{colors.map((color,seat)=><radialGradient key={seat} id={`ludo-pawn-${seat}`} cx="30%" cy="22%" r="80%"><stop offset="0" stopColor="#fff"/><stop offset=".2" stopColor={color}/><stop offset=".7" stopColor={color}/><stop offset="1" stopColor="#172c42"/></radialGradient>)}</defs>
    <rect width="15" height="15" rx=".25" fill="#fffaf0"/>
    {bases.map(([x,y],seat)=>{const player=room.players.find(p=>p.seat===seat);const active=room.status==='playing'&&room.turn===seat;const label=player ? `${player.name}${player.uid===room.me?' (vous)':''}` : 'Place libre';return <g key={seat}><rect x={x} y={y} width="6" height="6" fill={colors[seat]}/><rect x={x+.75} y={y+.5} width="4.5" height="4.5" rx=".5" fill="#fffaf0"/>{[0,1,2,3].map(i=><circle key={i} cx={x+2.15+(i%2)*1.7} cy={y+1.9+Math.floor(i/2)*1.7} r=".58" fill={light[seat]} stroke={colors[seat]} strokeWidth=".06"/>)}<rect x={x+.35} y={y+5.18} width="5.3" height=".64" rx=".22" fill={active?'#ffdf75':'#142949'} opacity={active?1:.88}/><text x={x+3} y={y+5.63} textAnchor="middle" fontSize=".37" fontWeight="700" fill={active?'#29375a':'#fff'} textLength={label.length>18?4.7:undefined} lengthAdjust="spacingAndGlyphs"><title>{label}{active?' — à son tour':''}</title>{active?'● ':''}{label}</text></g>;})}
    {track.map(([x,y],i)=><g key={i}><rect x={x} y={y} width="1" height="1" fill={i%13===0?light[Math.floor(i/13)]:'#fffaf0'} stroke="#c2bfb2" strokeWidth=".035"/>{LUDO_SAFE.has(i)&&<text x={x+.5} y={y+.72} textAnchor="middle" fontSize=".65" fill="#9b9fa1">★</text>}</g>)}
    {[0,1,2,3].flatMap(seat=>[0,1,2,3,4,5].map(step=>{const [x,y]=pawnPosition(seat,51+step,0);return <rect key={`${seat}-${step}`} x={x-.5} y={y-.5} width="1" height="1" fill={light[seat]} stroke="#c2bfb2" strokeWidth=".035"/>;}))}
    <path d="M6 6 L9 6 L7.5 7.5Z" fill={colors[1]}/><path d="M9 6 L9 9 L7.5 7.5Z" fill={colors[2]}/><path d="M9 9 L6 9 L7.5 7.5Z" fill={colors[3]}/><path d="M6 9 L6 6 L7.5 7.5Z" fill={colors[0]}/>
    {room.players.flatMap(p=>p.pawns.map((position,i)=>{const [x,y]=pawnPosition(p.seat,position,i);const same=room.players.flatMap(q=>q.pawns.map((v,j)=>({q,j,point:pawnPosition(q.seat,v,j)}))).filter(t=>Math.abs(t.point[0]-x)<.01&&Math.abs(t.point[1]-y)<.01);const offset=same.findIndex(t=>t.q.uid===p.uid&&t.j===i);const cols=Math.ceil(Math.sqrt(same.length)),rows=Math.ceil(same.length/cols);const dx=same.length>1?((offset%cols)-(cols-1)/2)*.25:0,dy=same.length>1?(Math.floor(offset/cols)-(rows-1)/2)*.25:0;const size=same.length>1?.72:1;const playable=p.uid===room.me&&allowed.includes(i);return <g key={`${p.uid}-${i}`} role={playable?'button':undefined} tabIndex={playable?0:undefined} aria-label={`${p.name}, pion ${i+1}${playable?', jouable':''}`} onClick={()=>playable&&onMove(i)} onKeyDown={e=>{if(playable&&(e.key==='Enter'||e.key===' ')){e.preventDefault();onMove(i);}}} className={playable?'ludo-pawn playable-pawn':'ludo-pawn'} style={{transform:`translate(${x+dx}px, ${y+dy}px)`}}><g transform={`scale(${size})`}><circle r=".55" fill="transparent"/><ellipse cy=".28" rx=".37" ry=".13" fill="#14263b" opacity=".3"/><path className="pawn-body" d="M-.32 .18 Q-.3 .04 -.18 -.14 Q-.27 -.24 -.27 -.36 A.27 .27 0 1 1 .27 -.36 Q.27 -.24 .18 -.14 Q.3 .04 .32 .18 Q.32 .31 0 .31 Q-.32 .31 -.32 .18 Z" fill={`url(#ludo-pawn-${p.seat})`} stroke="#fff" strokeWidth=".055"/><ellipse cx="-.09" cy="-.4" rx=".075" ry=".1" fill="#fff" opacity=".72"/><path d="M-.25 .19 Q0 .27 .25 .19" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth=".035"/></g></g>;}))}
  </svg>;
}

export function Ludo({back}:{back:()=>void}) {
  const [room,setRoom]=useState<Room|null>(null),[name,setName]=useState(''),[code,setCode]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[copied,setCopied]=useState(false);
  const [playerLimit,setPlayerLimit]=useState(4);
  const [rolling,setRolling]=useState(false);
  const request=useRef(0),mutating=useRef(false),alive=useRef(true);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;request.current++;};},[]);
  useEffect(()=>{if(!rolling)return;const delay=window.matchMedia('(prefers-reduced-motion: reduce)').matches?0:550;const timer=window.setTimeout(()=>setRolling(false),delay);return()=>window.clearTimeout(timer);},[rolling]);
  const call=useCallback(async(fn:string,args:Record<string,unknown>,quiet=false)=>{
    if(!client){setError('Configurez Supabase pour jouer en ligne.');return;}
    if(quiet && mutating.current)return;
    const id=++request.current;
    if(!quiet){mutating.current=true;setBusy(true);setError('');}
    try{
      const {data:session,error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;
      if(!session.session){const {error:e}=await client.auth.signInAnonymously();if(e)throw e;}
      const {data,error:e}=await client.rpc(fn,args);if(e)throw e;
      if(data && typeof data==='object' && 'error' in data)throw new Error(String(data.error));
      if(alive.current&&id===request.current){setRoom(data as Room);sessionStorage.setItem('ludo-room',(data as Room).code);}
    }catch(e){if(alive.current&&!quiet)setError(e && typeof e==='object' && 'message' in e ? String(e.message) : 'Connexion impossible.');}
    finally{if(!quiet){mutating.current=false;if(alive.current)setBusy(false);}}
  },[]);
  useEffect(()=>{const saved=sessionStorage.getItem('ludo-room');if(saved)void call('ludo_state',{p_code:saved},true);},[call]);
  useEffect(()=>{if(!busy&&room)void call('ludo_state',{p_code:room.code},true);},[busy,room?.code,call]);
  useEffect(()=>{
    if(!room||!client)return;
    const c=client,roomCode=room.code,refresh=()=>void call('ludo_state',{p_code:roomCode},true);
    let channel:ReturnType<typeof c.channel>|undefined,cancelled=false;
    void c.realtime.setAuth().then(()=>{if(cancelled)return;channel=c.channel(`maison-ludo:${roomCode}`,{config:{private:true}}).on('broadcast',{event:'changed'},refresh).subscribe(status=>{if(status==='SUBSCRIBED')refresh();});});
    const timer=window.setInterval(refresh,15000);
    return()=>{cancelled=true;window.clearInterval(timer);if(channel)void c.removeChannel(channel);};
  },[room?.code,call]);
  const leave=async()=>{if(room&&client){if(room.status==='playing'&&!window.confirm('Quitter annule la partie. Continuer ?'))return;setBusy(true);const {error:e}=await client.rpc('ludo_leave',{p_code:room.code});if(e){setError(e.message);setBusy(false);return;}}request.current++;sessionStorage.removeItem('ludo-room');back();};
  const me=room?.players.find(p=>p.uid===room.me),myTurn=room?.status==='playing'&&room.turn===me?.seat;
  return <div className={`${room ? 'ludo-page ludo-table-view' : 'online-page'}`}><header className={room ? "ludo-header" : "online-header"}><button onClick={()=>void leave()}><ArrowLeft size={19}/> Retour</button>{room?<strong>LUDO <span>ENTRE AMIS</span></strong>:<strong>KOPAKA</strong>}<span>{room?null:"PARTIE ENTRE AMIS"}</span></header>
    {!room?<PrivateRoomWelcome description="Créez un salon et partagez son code, ou rejoignez une partie de Ludo. De 2 à 4 joueurs."><RoomChoice busy={busy} error={error} name={name} setName={setName} code={code} setCode={setCode} createOptions={<label>Nombre de joueurs<select value={playerLimit} onChange={e=>setPlayerLimit(Number(e.target.value))}>{[2,3,4].map(n=><option key={n} value={n}>{n} joueurs</option>)}</select></label>} onCreate={()=>void call('ludo_create_configured',{p_name:name,p_player_limit:playerLimit})} onJoin={()=>void call('ludo_join',{p_code:code,p_name:name})}/></PrivateRoomWelcome>:<main className="ludo-game"><div className="ludo-roomline"><span>Code <strong>{room.code}</strong> · {room.players.length}/{room.player_limit ?? 4} joueurs</span><button onClick={()=>void navigator.clipboard.writeText(room.code).then(()=>{setCopied(true);window.setTimeout(()=>setCopied(false),2000);}).catch(()=>setError('Copie impossible.'))}><Copy size={15}/> {copied?'Copié':'Copier'}</button></div><Board room={room} onMove={pawn=>{if(!busy&&room)void call('ludo_move',{p_code:room.code,p_pawn:pawn});}}/><div className="ludo-controls"><p role="status">{room.status==='waiting'?(room.player_limit===null?'Invitez vos amis, puis lancez la partie.':'Invitez vos amis : la partie commence automatiquement.'):room.status==='finished'?room.message:myTurn?(room.die?'Choisissez un pion en surbrillance.':'À vous de lancer le dé !'):room.message}</p>{room.status==='waiting'?room.player_limit!==null?<WaitingIndicator game="ludo" current={room.players.length} total={room.player_limit}/>:room.host===room.me?<button className="ludo-primary" disabled={busy||room.players.length<(room.player_limit ?? 2)} onClick={()=>void call('ludo_start',{p_code:room.code})}><Users size={18}/> Commencer ({room.players.length}/{room.player_limit ?? 4})</button>:<span>En attente du créateur…</span>:room.status==='playing'?<button className={`ludo-dice ${rolling ? "is-rolling" : ""}`} disabled={!myTurn||room.die!==null||busy||rolling} onClick={()=>{setRolling(true);void call('ludo_roll',{p_code:room.code});}} aria-label={room.die?`Dé : ${room.die}`:"Lancer le dé"}><DiceFace value={room.die}/></button>:<button className="ludo-primary" onClick={()=>void leave()}>Retour aux jeux</button>}</div></main>}{error&&<div className="ludo-error" role="alert">{error}</div>}</div>;
}
