import { WaitingIndicator } from './waiting-indicator';
import { CopyCodeButton, RoomStatusPill } from './shell';
import { RoomChoice } from './room-choice';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, ArrowRight, Users, Maximize, Minimize } from 'lucide-react';
import { Stage, Layer } from 'react-konva';
import { Game, Placed, Tile, sides } from './game';
import { prepareMoveAnimation } from './move-animation';
import { useTurnExpiry } from './room-presence';
import { TurnCountdown } from './turn-countdown';
import { audio } from './audio';
import { DOMINO_PASS_DELAY_MS, useDominoPassFeedback } from './domino-pass-feedback';
import { celebrate } from './celebration';
import { DominoRoundSummary } from './domino-round-summary';
import { createDominoRefresh } from './domino-refresh';

type OnlinePlayer = { uid:string; name:string; seat:number; count:number; score:number; hand:Tile[] | null };
type Room = { code:string; host:string; me:string; status:'waiting'|'playing'|'finished'; chain:Placed[]; turn:number|null; opening:string|null; message:string; target_score:number; player_limit:number|null; champion_name:string|null; round_finished_at:string|null; turn_deadline?:string|null; players:OnlinePlayer[] };
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const client = url && key ? createClient(url, key) : null;

export function Online({ back, Board, Domino }: { back:()=>void; Board:React.ComponentType<{game:Game;selected:string|null;choose:(side:'left'|'right')=>void;availableHand?:Tile[]}>; Domino:React.ComponentType<{tile:Tile;x:number;y:number;scale?:number;selected?:boolean;awaitingSide?:boolean}> }) {
  const [room,setRoom] = useState<Room|null>(null), [name,setName] = useState(''), [code,setCode] = useState(''), [error,setError] = useState(''), [busy,setBusy] = useState(false), [selected,setSelected] = useState<string|null>(null);
  useTurnExpiry(client, 'domino', room?.code, room?.status === 'playing');
  const [target,setTarget] = useState(100);
  const [playerLimit,setPlayerLimit] = useState(4);
  const [pendingMove,setPendingMove] = useState<{code:string;tile:Tile;side:'left'|'right'}|null>(null);
  const moveInFlight = useRef(false);
  const roomGeneration = useRef(0);
  const [countdown,setCountdown] = useState(5);
  const [closedRound,setClosedRound] = useState<string|null>(null);
  const [fullscreen,setFullscreen] = useState(Boolean(document.fullscreenElement));
  useEffect(()=>{const update=()=>setFullscreen(Boolean(document.fullscreenElement));document.addEventListener('fullscreenchange',update);return ()=>document.removeEventListener('fullscreenchange',update);},[]);
  useEffect(()=>{if(!selected)return;const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null);};window.addEventListener('keydown',onKey);return ()=>window.removeEventListener('keydown',onKey);},[selected]);
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
    } catch (e) {
      const message=e && typeof e==='object' && 'message' in e ? String(e.message) : 'Impossible de contacter le serveur.';
      if(quiet && /refusé|introuvable/i.test(message)){ sessionStorage.removeItem('domino-room'); setRoom(null); }
      setError(message);
    }
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
    const refresh=createDominoRefresh(()=>call('domino_state',{p_code:roomCode},true));
    let channel: ReturnType<typeof c.channel> | undefined, cancelled=false, subscribed=false;
    void c.realtime.setAuth().then(()=>{
      if(cancelled)return;
      channel=c.channel(`maison-domino:${roomCode}`,{config:{private:true}})
        .on('broadcast',{event:'changed'},refresh.request)
        .subscribe(status=>{subscribed=status==='SUBSCRIBED';if(subscribed) refresh.request();});
    }).catch(()=>{/* Le polling continue si Realtime est indisponible. */});
    let lastFallback=0;
    const timer=window.setInterval(()=>{
      if(document.visibilityState==='hidden') return;
      const now=Date.now();
      if(now-lastFallback >= (subscribed ? 8000 : 2000)){lastFallback=now;refresh.request();}
    },2000);
    const resume=()=>{if(document.visibilityState==='visible') refresh.request();};
    document.addEventListener('visibilitychange',resume);
    window.addEventListener('online',resume);
    return ()=>{cancelled=true;refresh.stop();window.clearInterval(timer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('online',resume);if(channel)void c.removeChannel(channel);};
  },[room?.code,call]);
  const leave=async()=>{
    if(room && client){
      if(!window.confirm(room.status==='playing'?'Quitter annulera la manche en cours. Continuer ?':'Quitter ce salon ?'))return;
      setBusy(true);
      const {error:e}=await client.rpc('domino_leave',{p_code:room.code});
      setBusy(false);
      if(e){setError(e.message);return;}
    }
    roomGeneration.current++;latestRequest.current++;sessionStorage.removeItem('domino-room');setRoom(null);if(document.fullscreenElement) await document.exitFullscreen().catch(()=>{});back();
  };
  const cancelRoom=async()=>{
    if(!room || !client || room.host!==room.me || room.status!=='waiting')return;
    if(!window.confirm('Annuler ce salon ? Tous les joueurs invités seront déconnectés.'))return;
    setBusy(true);
    const {error:e}=await client.rpc('domino_cancel',{p_code:room.code});
    setBusy(false);
    if(e){setError(e.message);return;}
    roomGeneration.current++;latestRequest.current++;sessionStorage.removeItem('domino-room');setRoom(null);setError('Salon annulé.');
  };
  const actualMe=room?.players.find(p=>p.uid===room.me);
  const previousRound=useRef<{code:string;status:Room['status']}|null>(null);
  useEffect(()=>{
    const previous=previousRound.current;
    if(room && previous?.code===room.code && previous.status==='playing' && room.status==='finished' && !room.champion_name) {
      void audio.playSound('victory');
    }
    previousRound.current=room?{code:room.code,status:room.status}:null;
  },[room]);
  const previousChampion=useRef<{code:string; champion:string|null} | null>(null);
  useEffect(()=>{
    const previous=previousChampion.current;
    if(room && previous?.code===room.code && !previous.champion && room.champion_name) {
      const won=room.champion_name===room.players.find(player=>player.uid===room.me)?.name;
      if(won) celebrate();
      void audio.playSound(won?'victory':'defeat');
    }
    previousChampion.current=room?{code:room.code,champion:room.champion_name}:null;
  },[room]);
  const optimistic=room?.status==='playing' && pendingMove?.code===room.code && room.turn===actualMe?.seat && actualMe?.hand?.some(t=>t.id===pendingMove.tile.id) ? pendingMove : null;
  let chain=room?.chain ?? [];
  if(optimistic){
    const {tile,side}=optimistic;
    const end=chain.length ? (side==='left' ? chain[0].left : chain[chain.length-1].right) : null;
    const placed:Placed=end===null ? {...tile,left:tile.a,right:tile.b} : side==='left' ? {...tile,left:tile.a===end?tile.b:tile.a,right:end} : {...tile,left:end,right:tile.a===end?tile.b:tile.a};
    chain=side==='left' ? [placed,...chain] : [...chain,placed];
  }
  const game:Game|null = room && room.status!=='waiting' ? { players:room.players.map(p=>({name:p.name,hand:p.hand ?? [],score:p.score})),chain,turn:room.turn ?? 0,passes:0,winner:room.status==='finished'?0:null,message:room.message,opening:room.opening ?? '' } : null;
  const me=actualMe && optimistic ? {...actualMe,hand:actualMe.hand?.filter(t=>t.id!==optimistic.tile.id) ?? null} : actualMe;
  const myTurn=room?.status==='playing' && room.turn===me?.seat && !pendingMove;
  const mustPass=Boolean(myTurn && game && me?.hand && !me.hand.some(t=>sides(game,t).length>0));
  useDominoPassFeedback(mustPass);
  useEffect(()=>{
    if(!mustPass || !room) return;
    const roomCode=room.code;
    const send=()=>void call('domino_move',{p_code:roomCode,p_tile:null,p_side:null});
    const timer=window.setTimeout(send,DOMINO_PASS_DELAY_MS);
    return ()=>window.clearTimeout(timer);
  },[mustPass,room?.code,room?.turn,room?.chain.length,call]);
  const move=(tile:Tile,side:'left'|'right')=>{
    if(!room || !myTurn || moveInFlight.current)return;
    const roomCode=room.code, generation=roomGeneration.current;
    moveInFlight.current=true;
    prepareMoveAnimation(tile.id,tile.a,tile.b);
    setPendingMove({code:roomCode,tile,side});setSelected(null);
    void (async()=>{try{await call('domino_move',{p_code:roomCode,p_tile:tile.id,p_side:side});if(generation===roomGeneration.current)await call('domino_state',{p_code:roomCode},true);}finally{moveInFlight.current=false;setPendingMove(null);}})();
  };
  const select=(tile:Tile)=>{
    if(!game || !myTurn)return;
    if(selected===tile.id){setSelected(null);return;}
    const options=sides(game,tile);
    if(!options.length){setError('Ce domino ne peut pas être joué.');return;}
    const equalEnds=chain.length>0 && chain[0].left===chain[chain.length-1].right;
    if(options.length===2 && !equalEnds){void audio.playSound('select');setSelected(tile.id);return;}
    move(tile,equalEnds?'right':options[0]);
  };
  return <div className={`online-page ${room && room.status !== 'waiting' ? 'playing-view' : ''}`}><header className="online-header"><button onClick={leave}><ArrowLeft size={17}/> Retour à la table</button><strong>KOPAKA</strong>{room && room.status !== 'waiting' ? <button className="fullscreen-button" onClick={()=>void toggleFullscreen()} aria-label={fullscreen?'Quitter le plein écran':'Activer le plein écran'}>{fullscreen?<Minimize size={17}/>:<Maximize size={17}/>}<span>{fullscreen?'Réduire':'Plein écran'}</span></button> : <span>PARTIE ENTRE AMIS</span>}</header><main className="online-main"><div className="eyebrow">LE PLAISIR DE JOUER ENSEMBLE</div><h1>Votre salon <em>privé.</em></h1><p className="online-subtitle">Invitez vos proches et retrouvez-vous autour de la table.</p>
  {error && <div className="online-error" role="alert">{error}</div>}
  {room?.status==='finished' && !room.champion_name && room.round_finished_at && closedRound!==`${room.code}:${room.round_finished_at}` && <div className="modal-backdrop domino-round-backdrop"><div className="modal domino-round-modal recap-modal" role="dialog" aria-modal="true" aria-labelledby="domino-round-title"><div className="recap-heading"><div><div className="recap-eyebrow">● RÉSULTAT</div><h2 id="domino-round-title">Manche terminée</h2></div></div><DominoRoundSummary players={room.players} target={room.target_score} message={room.message} blocked={room.message.startsWith('Partie bloquée :')}/><p className="recap-countdown">{room.players.length>=2?`Prochaine manche dans ${countdown} s`:'En attente d’un autre joueur.'}</p><button className="primary-button recap-action" onClick={()=>setClosedRound(`${room.code}:${room.round_finished_at}`)}>Fermer</button></div></div>}
  {room?.status==='finished' && room.champion_name && <div className="modal-backdrop domino-round-backdrop"><div className="modal domino-round-modal recap-modal" role="dialog" aria-modal="true" aria-labelledby="winner-title"><div className="recap-heading"><div><div className="recap-eyebrow">● RÉSULTAT</div><h2 id="winner-title">Partie terminée</h2></div></div><DominoRoundSummary players={room.players} target={room.target_score} message={room.message} blocked={room.message.startsWith('Partie bloquée :')} champion={room.champion_name}/><button className="primary-button recap-action" onClick={()=>void leave()}>Retour à la table <ArrowRight size={16}/></button></div></div>}
  {!room ? <div className="online-welcome"><div className="online-intro"><div className="invite-icon"><Users size={22}/></div><h2>Une partie entre amis</h2><p>Créez un salon et partagez son code, ou rejoignez une partie existante. De 2 à 4 joueurs, sans pioche.</p><RoomChoice busy={busy} error={error} name={name} setName={setName} code={code} setCode={setCode} createOptions={<><label>Score cible<select value={target} onChange={e=>setTarget(Number(e.target.value))}>{[50,80,100,120].map(n=><option key={n} value={n}>{n} points</option>)}</select></label><label>Nombre de joueurs<select value={playerLimit} onChange={e=>setPlayerLimit(Number(e.target.value))}>{[2,3,4].map(n=><option key={n} value={n}>{n} joueurs</option>)}</select></label></>} onCreate={()=>void call('domino_create_with_limit',{p_name:name,p_target:target,p_player_limit:playerLimit})} onJoin={()=>void call('domino_join',{p_name:name,p_code:code})}/></div></div> : <><div className="room-bar"><div><span>CODE DU SALON</span><strong>{room.code}</strong><CopyCodeButton code={room.code} onError={setError}/></div><RoomStatusPill status={room.status}/>{room.status==='waiting'&&room.host===room.me&&<button className="cancel-room-button" disabled={busy} onClick={()=>void cancelRoom()}>Annuler le salon</button>}<TurnCountdown deadline={room.turn_deadline} active={room.status==='playing'}/></div>{room.status==='finished' && <div className="replay-bar"><span>{room.champion_name ? `${room.champion_name} remporte la partie !` : room.message}</span>{room.champion_name ? <span>Objectif atteint : {room.target_score} points</span> : room.players.length<2 ? <span>En attente d’un autre joueur</span> : <strong>Prochaine manche dans {countdown} s</strong>}</div>}<div className="match-scores" aria-label="Scores">{room.players.map(p=><span key={p.uid}><strong>{p.name}</strong> {p.score} <small>/ {room.target_score}</small></span>)}</div><div className="online-layout"><section>{room.status==='waiting' ? <div className="waiting-room"><div className="invite-icon"><Users size={25}/></div><h2>La table se prépare</h2><p>Objectif : <strong>{room.target_score} points</strong>.</p>{room.player_limit ? <WaitingIndicator game="domino" current={room.players.length} total={room.player_limit}/> : <><p>Partagez le code avec vos amis. Le créateur peut lancer la partie dès que deux joueurs sont présents.</p><div className="waiting-dots">✦ &nbsp; ✦ &nbsp; ✦</div>{room.host===room.me ? <button className="primary-button" disabled={busy || room.players.length<2} onClick={()=>void call('domino_start',{p_code:room.code})}>Lancer la partie <ArrowRight size={16}/></button> : <span className="waiting">EN ATTENTE DU CRÉATEUR</span>}</>}</div> : game && <><div className="table-frame"><div className="table"><div className="table-inner online-table"><Board game={game} selected={myTurn ? selected : null} choose={side=>{const tile=me?.hand?.find(t=>t.id===selected);if(tile)move(tile,side);}} availableHand={myTurn ? (me?.hand ?? []).filter(t=>!selected || t.id===selected) : []}/></div></div></div><div className="hand-panel"><div className="hand-heading"><div><div className="hand-title"><strong>Votre main</strong><span className="score-target">Objectif : {room.target_score} pts</span><span className="hand-count">{me?.count} DOMINOS</span></div><p>{room.message}</p></div><span className={myTurn?'your-turn':'waiting'}>{room.status==='finished'?'MANCHE TERMINÉE':myTurn?'À VOUS DE JOUER':`AU TOUR DE ${room.players.find(p=>p.seat===room.turn)?.name ?? '...'}`}</span></div><div className={`online-tiles ${mustPass ? "passing-hand" : ""}`}>{me?.hand?.map(t=><button className={`hand-tile ${myTurn && sides(game,t).length ? "playable" : ""} ${selected===t.id && sides(game,t).length===2 ? "awaiting-side" : ""}`} key={t.id} disabled={!myTurn || busy || !sides(game,t).length} aria-label={`Domino ${t.a} et ${t.b}${selected===t.id && sides(game,t).length===2 ? ', choisissez une extrémité sur le plateau' : ''}`} onClick={()=>select(t)}><Stage width={48} height={78}><Layer><Domino tile={t} x={4} y={3} scale={1.12} selected={Boolean(myTurn && sides(game,t).length)} awaitingSide={selected===t.id && sides(game,t).length===2}/></Layer></Stage></button>)}</div>{mustPass && <p className="auto-pass-message" role="status">Aucun domino jouable : votre tour passe automatiquement.</p>}</div></>}</section><aside className="sidebar-card"><div className="eyebrow">AUTOUR DE LA TABLE</div><h2>Les joueurs</h2><div className="players">{room.players.map(p=><div className="player-row" key={p.uid}><div className="avatar">{p.name[0].toUpperCase()}</div><div className="player-details"><strong>{p.name} {p.uid===room.me?'(vous)':''}</strong><small>{p.uid===room.host?'Créateur':room.status==='waiting'?'En attente':`${p.count} dominos`}</small></div><div className="player-score"><strong>{p.score}</strong><small>POINTS</small></div></div>)}</div><p className="room-count">{room.players.length} / 4 joueurs</p></aside></div></>}
  </main></div>;
}
