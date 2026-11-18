import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, ArrowRight, Copy, Users, Maximize, Minimize } from 'lucide-react';
import { Stage, Layer } from 'react-konva';
import { Game, Placed, Tile, sides } from './game';

type OnlinePlayer = { uid:string; name:string; seat:number; count:number; score:number; hand:Tile[] | null };
type Room = { code:string; host:string; me:string; status:'waiting'|'playing'|'finished'; chain:Placed[]; turn:number|null; opening:string|null; message:string; target_score:number; champion_name:string|null; round_finished_at:string|null; players:OnlinePlayer[] };
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client = url && key ? createClient(url, key) : null;

export function Online({ back, Board, Domino }: { back:()=>void; Board:React.ComponentType<{game:Game;selected:string|null;choose:(side:'left'|'right')=>void;cancel:()=>void;availableHand?:Tile[]}>; Domino:React.ComponentType<{tile:Tile;x:number;y:number;scale?:number;selected?:boolean}> }) {
  const [room,setRoom] = useState<Room|null>(null), [name,setName] = useState(''), [code,setCode] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false), [selected,setSelected] = useState<string|null>(null), [copied,setCopied] = useState(false);
  const [target,setTarget] = useState(100);
  const [countdown,setCountdown] = useState(5);
  const [fullscreen,setFullscreen] = useState(Boolean(document.fullscreenElement));
  useEffect(()=>{const update=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',update);return ()=>document.removeEventListener('fullscreenchange',update);},[]);
  const toggleFullscreen=async()=>{try{if(document.fullscreenElement) await document.exitFullscreen(); else if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); else setError('Le plein écran n’est pas disponible dans ce navigateur.');}catch{setError('Impossible d’activer le plein écran dans ce navigateur.');}};
  const latestRequest = useRef(0);
  const call = useCallback(async (fn:string, args:Record<string,unknown>, quiet=false) => {
    if (!client) { setError('Configurez les variables Supabase dans le fichier .env.local.'); return; }
    const request = ++latestRequest.current;
    if (!quiet) { setBusy(true); setError(''); }
    try {
      const { data: session, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session.session) { const { error: authError } = await client.auth.signInAnonymously(); if (authError) throw authError; }
      const { data, error: rpcError } = await client.rpc(fn,args);
      if (rpcError) throw rpcError;
      if (data && typeof data === 'object' && 'error' in data) throw new Error(String(data.error));
      if (request === latestRequest.current) { setRoom(data as Room); sessionStorage.setItem('domino-room', (data as Room).code); }
    } catch (e) { setError(e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Impossible de contacter le serveur.'); }
    finally { if (!quiet) setBusy(false); }
  }, []);
  useEffect(()=>{ const saved=sessionStorage.getItem('domino-room'); if(saved && client) void call('domino_state',{p_code:saved},true); },[call]);
  useEffect(()=>{
    if(!room || room.status!=='finished' || room.champion_name || !room.round_finished_at || room.players.length<2) return;
    const deadline=Date.now()+5000, roomCode=room.code, finishedAt=room.round_finished_at;
    let inFlight=false;
    setCountdown(5);
    const tick=()=>{
      const remaining=Math.max(0,Math.ceil((deadline-Date.now())/1000));
      setCountdown(remaining);
      if(remaining===0 && !inFlight){inFlight=true;void call('domino_auto_next',{p_code:roomCode,p_finished_at:finishedAt},true).finally(()=>{inFlight=false;});}
    };
    const timer=window.setInterval(tick,1000);
    return ()=>window.clearInterval(timer);
  },[room?.code,room?.status,room?.champion_name,room?.round_finished_at,room?.players.length,call]);
  useEffect(()=>{
    if (!room || !client) return;
    const c=client, roomCode=room.code;
    const refresh=()=>void call('domino_state',{p_code:roomCode},true);
    let channel: ReturnType<typeof c.channel> | undefined, cancelled=false;
    void c.realtime.setAuth().then(()=>{
      if(cancelled)return;
      channel=c.channel(`maison-domino:${roomCode}`,{config:{private:true}})
        .on('broadcast',{event:'changed'},refresh)
        .subscribe(status=>{if(status==='SUBSCRIBED') refresh();});
    });
    const timer=window.setInterval(refresh,15000);
    return ()=>{cancelled=true;window.clearInterval(timer);if(channel)void c.removeChannel(channel);};
  },[room?.code,call]);
  const leave=async()=>{
    if(room && client){
      if(!window.confirm(room.status==='playing'?'Quitter annulera la manche en cours. Continuer ?':'Quitter ce salon ?'))return;
      setBusy(true);
      const {error:e}=await client.rpc('domino_leave',{p_code:room.code});
      setBusy(false);
      if(e){setError(e.message);return;}
    }
    latestRequest.current++;sessionStorage.removeItem('domino-room');setRoom(null);if(document.fullscreenElement) await document.exitFullscreen().catch(()=>{});back();
  };
  const game:Game|null = room && room.status!=='waiting' ? { players:room.players.map(p=>({name:p.name,hand:p.hand ?? [],score:p.score})),chain:room.chain,turn:room.turn ?? 0,passes:0,winner:room.status==='finished'?0:null,message:room.message,opening:room.opening ?? '' } : null;
  const me=room?.players.find(p=>p.uid===room.me), myTurn=room?.status==='playing' && room.turn===me?.seat;
  const mustPass=Boolean(myTurn && game && me?.hand && !me.hand.some(t=>sides(game,t).length>0));
  useEffect(()=>{
    if(!mustPass || !room) return;
    const roomCode=room.code;
    const send=()=>void call('domino_move',{p_code:roomCode,p_tile:null,p_side:null});
    const timer=window.setTimeout(send,2000);
    return ()=>window.clearTimeout(timer);
  },[mustPass,room?.code,room?.turn,room?.chain.length,call]);
  const move=(tile:string|null,side:string|null)=>{if(room) void call('domino_move',{p_code:room.code,p_tile:tile,p_side:side});setSelected(null);};
  const select=(tile:Tile)=>{if(!game || !myTurn)return; const options=sides(game,tile); if(!options.length)setError('Ce domino ne peut pas être joué.'); else move(tile.id,options[0]);};
  return <div className={`online-page ${room && room.status !== 'waiting' ? 'playing-view' : ''}`}><header className="online-header"><button onClick={leave}><ArrowLeft size={17}/> Retour à la table</button><strong>MAISON DOMINO</strong>{room && room.status !== 'waiting' ? <button className="fullscreen-button" onClick={()=>void toggleFullscreen()} aria-label={fullscreen?'Quitter le plein écran':'Activer le plein écran'}>{fullscreen?<Minimize size={17}/>:<Maximize size={17}/>}<span>{fullscreen?'Réduire':'Plein écran'}</span></button> : <span>PARTIE ENTRE AMIS</span>}</header><main className="online-main"><div className="eyebrow">LE PLAISIR DE JOUER ENSEMBLE</div><h1>Votre salon <em>privé.</em></h1><p className="online-subtitle">Invitez vos proches et retrouvez-vous autour de la table.</p>
  {error && <div className="online-error" role="alert">{error}</div>}
  {room?.status==='finished' && room.champion_name && <div className="modal-backdrop"><div className="modal" role="dialog" aria-modal="true" aria-labelledby="winner-title"><div className="modal-icon"><span aria-hidden="true">🏆</span></div><div className="eyebrow">PARTIE TERMINÉE</div><h2 id="winner-title">{room.champion_name} remporte la partie !</h2><p>Le score cible de {room.target_score} points est atteint.</p><button className="primary-button" onClick={()=>void leave()}>Retour à la table <ArrowRight size={16}/></button></div></div>}
  {!room ? <div className="online-welcome"><div className="online-intro"><div className="invite-icon"><Users size={22}/></div><h2>Une partie entre amis</h2><p>Créez un salon et partagez son code, ou rejoignez une partie existante. De 2 à 4 joueurs, sans pioche.</p><label>VOTRE PSEUDO<input value={name} onChange={e=>setName(e.target.value)} maxLength={20} placeholder="Comment vous appeler ?"/></label></div><div className="online-choices"><div><h3>Créer un salon</h3><label className="score-choice">SCORE CIBLE<select value={target} onChange={e=>setTarget(Number(e.target.value))}>{[50,80,100,120].map(n=><option key={n} value={n}>{n} points</option>)}</select></label><p>Vous recevrez un code à partager avec vos amis.</p><button className="primary-button" disabled={busy || !name.trim()} onClick={()=>void call('domino_create_configured',{p_name:name,p_target:target})}>Créer mon salon <ArrowRight size={16}/></button></div><div className="join-box"><h3>Rejoindre un salon</h3><p>Entrez le code communiqué par votre ami.</p><input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="CODE D’INVITATION"/><button className="outline-button" disabled={busy || !name.trim() || code.trim().length!==8} onClick={()=>void call('domino_join',{p_name:name,p_code:code})}>Rejoindre <ArrowRight size={16}/></button></div></div></div> : <><div className="room-bar"><div><span>CODE DU SALON</span><strong>{room.code}</strong><button onClick={async()=>{try{await navigator.clipboard.writeText(room.code);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{setError('Copie impossible : sélectionnez le code manuellement.');}}} aria-label="Copier le code"><Copy size={15}/></button>{copied && <small>Copié !</small>}</div><span>{room.status==='waiting'?'EN ATTENTE':room.status==='playing'?'PARTIE EN COURS':'MANCHE TERMINÉE'}</span></div>{room.status==='finished' && <div className="replay-bar"><span>{room.champion_name ? `${room.champion_name} remporte la partie !` : room.message}</span>{room.champion_name ? <span>Objectif atteint : {room.target_score} points</span> : room.players.length<2 ? <span>En attente d’un autre joueur</span> : <strong>Prochaine manche dans {countdown} s</strong>}</div>}<div className="match-scores" aria-label="Scores">{room.players.map(p=><span key={p.uid}><strong>{p.name}</strong> {p.score} <small>/ {room.target_score}</small></span>)}</div><div className="online-layout"><section>{room.status==='waiting' ? <div className="waiting-room"><div className="invite-icon"><Users size={25}/></div><h2>La table se prépare</h2><p>Objectif : <strong>{room.target_score} points</strong>.</p><p>Partagez le code avec vos amis. Le créateur peut lancer la partie dès que deux joueurs sont présents.</p><div className="waiting-dots">✦ &nbsp; ✦ &nbsp; ✦</div>{room.host===room.me ? <button className="primary-button" disabled={busy || room.players.length<2} onClick={()=>void call('domino_start',{p_code:room.code})}>Lancer la partie <ArrowRight size={16}/></button> : <span className="waiting">EN ATTENTE DU CRÉATEUR</span>}</div> : game && <><div className="table-frame"><div className="table"><div className="table-inner online-table"><Board game={game} selected={selected} choose={side=>selected && move(selected,side)} cancel={()=>setSelected(null)} availableHand={myTurn ? (me?.hand ?? []) : []}/></div></div></div><div className="hand-panel"><div className="hand-heading"><div><div className="hand-title"><strong>Votre main</strong><span className="score-target">Objectif : {room.target_score} pts</span><span className="hand-count">{me?.count} DOMINOS</span></div><p>{room.message}</p></div><span className={myTurn?'your-turn':'waiting'}>{room.status==='finished'?'MANCHE TERMINÉE':myTurn?'À VOUS DE JOUER':`AU TOUR DE ${room.players.find(p=>p.seat===room.turn)?.name ?? '...'}`}</span></div><div className={`online-tiles ${mustPass ? "passing-hand" : ""}`}>{me?.hand?.map(t=><button className={`hand-tile ${myTurn && sides(game,t).length ? "playable" : ""}`} key={t.id} disabled={!myTurn || busy || !sides(game,t).length} aria-label={`Domino ${t.a} et ${t.b}`} onClick={()=>select(t)}><Stage width={48} height={78}><Layer><Domino tile={t} x={4} y={3} scale={1.12} selected={Boolean(myTurn && sides(game,t).length)}/></Layer></Stage></button>)}</div>{mustPass && <p className="auto-pass-message" role="status">Aucun domino jouable : votre tour passe automatiquement.</p>}</div></>}</section><aside className="sidebar-card"><div className="eyebrow">AUTOUR DE LA TABLE</div><h2>Les joueurs</h2><div className="players">{room.players.map(p=><div className="player-row" key={p.uid}><div className="avatar">{p.name[0].toUpperCase()}</div><div className="player-details"><strong>{p.name} {p.uid===room.me?'(vous)':''}</strong><small>{p.uid===room.host?'Créateur':room.status==='waiting'?'En attente':`${p.count} dominos`}</small></div><div className="player-score"><strong>{p.score}</strong><small>POINTS</small></div></div>)}</div><p className="room-count">{room.players.length} / 4 joueurs</p></aside></div></>}
  </main></div>;
}
