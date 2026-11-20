import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { placePoint, type FaritanyGame } from './faritany-game';
import { RoomChoice } from './room-choice';
import { WaitingIndicator } from './waiting-indicator';
import { PrivateRoomWelcome } from './private-room-welcome';
import { ArrowLeft } from 'lucide-react';
import { useTurnExpiry } from './room-presence';

type Room = { code:string; host:string; me:string; status:'waiting'|'playing'|'finished'; game:FaritanyGame; version:number; turn_deadline?:string|null; players:{uid:string;name:string;seat:number}[] };
const client = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY) : null;

export function useFaritanyOnline() {
  const [room,setRoom]=useState<Room|null>(null), [busy,setBusy]=useState(false), [error,setError]=useState('');
  useTurnExpiry(client, 'faritany', room?.code, room?.status === 'playing');
  const active=useRef(true), busyRef=useRef(false), sequence=useRef(0);
  useEffect(()=>{active.current=true;return()=>{active.current=false;sequence.current++;};},[]);
  const call=useCallback(async(fn:string,args:Record<string,unknown>,quiet=false)=>{
    if(!client){if(!quiet)setError('Configurez Supabase pour jouer en ligne.');return;}
    if(busyRef.current)return;
    const id=++sequence.current;
    if(!quiet){busyRef.current=true;setBusy(true);setError('');}
    try{
      const {data:session,error:sessionError}=await client.auth.getSession();if(sessionError)throw sessionError;
      if(!session.session){const {error:e}=await client.auth.signInAnonymously();if(e)throw e;}
      const {data,error:e}=await client.rpc(fn,args);if(e)throw e;
      if(data && typeof data==='object' && 'error' in data)throw new Error(String(data.error));
      if(active.current&&id===sequence.current){setRoom(data as Room);sessionStorage.setItem('faritany-room',(data as Room).code);}
    }catch(e){
      const message=e instanceof Error?e.message:'Connexion impossible.';
      if(active.current&&quiet&&/refusé|introuvable/i.test(message)){sessionStorage.removeItem('faritany-room');setRoom(null);}
      if(active.current&&!quiet)setError(message);
    }
    finally{if(!quiet){busyRef.current=false;if(active.current)setBusy(false);}}
  },[]);
  const refresh=useCallback((code:string)=>call('faritany_state',{p_code:code},true),[call]);
  useEffect(()=>{if(!room||!client)return;const c=client,code=room.code;let cancelled=false;let channel:ReturnType<typeof c.channel>|undefined;
    void c.realtime.setAuth().then(()=>{if(cancelled)return;channel=c.channel(`kopaka-faritany:${code}`,{config:{private:true}}).on('broadcast',{event:'changed'},()=>void refresh(code)).subscribe(status=>{if(status==='SUBSCRIBED')void refresh(code);});});
    const timer=window.setInterval(()=>void refresh(code),5000);
    return()=>{cancelled=true;window.clearInterval(timer);if(channel)void c.removeChannel(channel);};
  },[room?.code,refresh]);
  const move=useCallback(async(x:number,y:number)=>{
    if(!client||!room||busyRef.current)return;
    const player=room.players.find(p=>p.uid===room.me);
    if(room.status!=='playing' || !player || room.game.turn!==(player.seat===0?'blue':'red'))return;
    const predicted=placePoint(room.game,x,y);
    if(predicted===room.game)return;
    busyRef.current=true;setBusy(true);setError('');const id=++sequence.current;
    setRoom({...room,game:predicted});
    try{
      const {data,error:e}=await client.functions.invoke('faritany-move',{body:{code:room.code,x,y}});
      if(e)throw e;if(data?.error)throw new Error(data.error);
      if(active.current&&id===sequence.current)setRoom(data as Room);
    }catch(e){if(active.current&&id===sequence.current){setRoom(room);setError(e instanceof Error?e.message:'Coup impossible.');}}
    finally{busyRef.current=false;if(active.current){setBusy(false);void refresh(room.code);}}
  },[room,refresh]);
  const leave=useCallback(async()=>{
    if(room&&client){const {error:e}=await client.rpc('faritany_leave',{p_code:room.code});if(e){setError(e.message);return false;}}
    sequence.current++;sessionStorage.removeItem('faritany-room');setRoom(null);setError('');return true;
  },[room]);
  const cancel=useCallback(async()=>{
    if(!room||!client||room.host!==room.me||room.status!=='waiting')return false;
    if(!window.confirm('Annuler ce salon ? Votre adversaire invité sera déconnecté.'))return false;
    const {error:e}=await client.rpc('faritany_cancel',{p_code:room.code});
    if(e){setError(e.message);return false;}
    sequence.current++;sessionStorage.removeItem('faritany-room');setRoom(null);setError('Salon annulé.');return true;
  },[room]);
  return {room,busy,error,call,move,leave,refresh,cancel};
}

export function FaritanyLobby({online,target,onBack}:{online:ReturnType<typeof useFaritanyOnline>;target:number;onBack:()=>void}){
  const [name,setName]=useState(''),[code,setCode]=useState(''),[copied,setCopied]=useState(false);
  const {room,busy,error,call,cancel}=online;
  if(!room)return <div className="online-page"><header className="online-header"><button onClick={onBack}><ArrowLeft size={17}/> Retour</button><strong>KOPAKA</strong><span>PARTIE ENTRE AMIS</span></header><PrivateRoomWelcome description="Créez un salon et partagez son code, ou rejoignez une partie de Faritany à deux joueurs."><RoomChoice busy={busy} error={error} name={name} setName={setName} code={code} setCode={setCode} createOptions={<p>Objectif choisi : {target} points.</p>} onCreate={()=>void call('faritany_create',{p_name:name,p_target:target})} onJoin={()=>void call('faritany_join',{p_name:name,p_code:code})}/></PrivateRoomWelcome></div>;
  return <div className="faritany-setup-page"><header className="faritany-header"><button onClick={onBack}>← Retour</button><strong>KOPAKA <span>/ FARITANY</span></strong><span/></header><main className="faritany-setup">
    <span>PARTIE PRIVÉE · 2 JOUEURS</span><h1>Entre amis<span>.</span></h1>
    {error&&<p role="alert">{error}</p>}
    <p>Partagez ce code avec votre ami :</p><strong className="faritany-invite-code">{room.code}</strong><div className="faritany-modes"><button onClick={()=>void navigator.clipboard.writeText(room.code).then(()=>setCopied(true)).catch(()=>setCopied(false))}><strong>{copied?'Code copié':'Copier le code'}</strong></button>{room.host===room.me&&room.status==='waiting'&&<button className="cancel-room-button" disabled={busy} onClick={()=>void cancel()}><strong>Annuler le salon</strong></button>}</div><WaitingIndicator game="faritany" current={room.players.length} total={2}/>
  </main></div>;
}
