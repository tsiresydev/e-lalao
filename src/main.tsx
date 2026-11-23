import './styles/index.css';
import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Stage, Layer } from 'react-konva';
import { ArrowRight, Bot, ChevronLeft, CircleHelp, Copy, Maximize, Minimize, Play, Plus, RotateCcw, Sparkles, Users, Volume2, X } from 'lucide-react';
import { canPlay, Game, newGame, pass, play, sides, Tile } from './game';
import { GameHub } from './game-hub';
import { LoadingScreen } from './loading-screen';
import { prepareMoveAnimation } from './move-animation';
import { GameMenu } from './shell';
import { Domino, DominoBoard } from './domino-view';
import { AudioControls } from './audio-controls';
import { audio } from './audio';
import { DOMINO_PASS_DELAY_MS, useDominoPassFeedback } from './domino-pass-feedback';
import { chooseDominoMove, type DominoDifficulty } from './domino-ai';
import { DominoBacks } from './domino-opponents';
import { DominoRoundSummary } from './domino-round-summary';
import { celebrate, CelebrationOverlay } from './celebration';

const Online = lazy(() => import('./online').then(module => ({ default: module.Online })));
const Ludo = lazy(() => import('./ludo').then(module => ({ default: module.Ludo })));
const Faritany = lazy(() => import('./faritany').then(module => ({ default: module.Faritany })));

const OPPONENT_NAMES = ['Léon','Camille','Sacha'];
function App({back}:{back:()=>void}) {
  const [playerCount,setPlayerCount] = useState(4);
  const [difficulty,setDifficulty] = useState<DominoDifficulty>('medium');
  const [gameDifficulty,setGameDifficulty] = useState<DominoDifficulty>('medium');
  const [targetScore,setTargetScore] = useState(80);
  const [matchTarget,setMatchTarget] = useState(80);
  const [showRoundResult,setShowRoundResult] = useState(false);
  const [game,setGame] = useState<Game>(()=>newGame(['Vous',...OPPONENT_NAMES])), [selected,setSelected] = useState<string|null>(null), [modal,setModal] = useState<'rules'|'online'|'setup'|null>(null), [notice,setNotice] = useState(''), [online,setOnline] = useState(false), [tableFocus,setTableFocus] = useState(false);
  const previousWinner=useRef<number|null>(game.winner);
  useEffect(()=>{if(previousWinner.current===null && game.winner!==null) { setShowRoundResult(true); if(!game.message.includes('égalité')) { if(game.winner===0) celebrate(); void audio.playSound(game.winner===0?'victory':'defeat'); } } previousWinner.current=game.winner;},[game.winner,game.message]);
  useEffect(()=>{ if(!tableFocus)return; const overflow=document.body.style.overflow; document.body.style.overflow='hidden'; const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setTableFocus(false);}; window.addEventListener('keydown',onKey); return ()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',onKey);}; },[tableFocus]);
  useEffect(()=>{ if(!selected)return; const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setSelected(null);}; window.addEventListener('keydown',onKey); return ()=>window.removeEventListener('keydown',onKey); },[selected]);
  useEffect(()=>{ if(game.winner !== null || game.turn === 0 || online) return; const timer=setTimeout(()=>{ const move=chooseDominoMove(game,gameDifficulty); setGame(move ? play(game,move.id,move.side) : pass(game)); },850); return ()=>clearTimeout(timer); },[game,gameDifficulty,online]);
  const mustPass = game.winner===null && game.turn===0 && !canPlay(game);
  useDominoPassFeedback(mustPass && !online);
  useEffect(()=>{if(!mustPass)return;const timer=window.setTimeout(()=>setGame(current=>current.turn===0 && current.winner===null && !canPlay(current) ? pass(current) : current),DOMINO_PASS_DELAY_MS);return ()=>window.clearTimeout(timer);},[mustPass,game]);
  const select = (tile:Tile) => {
    if(game.turn!==0 || game.winner!==null) return;
    if(selected===tile.id){setSelected(null);return;}
    const options=sides(game,tile);
    if(!options.length){ setNotice('Ce domino ne peut pas être joué.'); setTimeout(()=>setNotice(''),2200); return; }
    const equalEnds=game.chain.length>0 && game.chain[0].left===game.chain[game.chain.length-1].right;
    if(options.length===2 && !equalEnds){void audio.playSound('select');setSelected(tile.id);return;}
    prepareMoveAnimation(tile.id,tile.a,tile.b);
    setSelected(null);
    setGame(play(game,tile.id,equalEnds?'right':options[0]));
  };
  const choose = (side:'left'|'right') => { if(selected) {const tile=game.players[0].hand.find(t=>t.id===selected);if(tile)prepareMoveAnimation(tile.id,tile.a,tile.b);setGame(play(game,selected,side));} setSelected(null); };
  const startGame = (count:number) => {
    setShowRoundResult(false);
    setPlayerCount(count);
    setGameDifficulty(difficulty);
    setMatchTarget(targetScore);
    setGame(newGame(['Vous',...OPPONENT_NAMES.slice(0,count-1)]));
    setSelected(null);
    setNotice('');
    setModal(null);
  };
  const nextRound = () => {
    setShowRoundResult(false);
    setSelected(null);
    setGame(current => {
      const next = newGame(current.players.map(player => player.name));
      return { ...next, players: next.players.map((player,index) => ({ ...player, score: current.players[index].score })) };
    });
  };
  if (online) return <Online back={()=>setOnline(false)} Board={DominoBoard} Domino={Domino}/>;
  return <div className="app"><header className="header"><div className="brand"><div className="brand-mark"><span>● ●</span><i/><span>● ●</span></div><div><strong>KOPAKA</strong><small>LE PLAISIR DE JOUER ENSEMBLE</small></div></div><nav><button className="nav-active">La table</button><button onClick={()=>setOnline(true)}>Jouer entre amis</button><button onClick={()=>setModal('rules')}>Règles du jeu</button></nav><div className="header-right"><GameMenu label="Menu" items={[
    { label: 'Jouer entre amis', icon: <Users size={17}/>, onSelect: () => setOnline(true) },
    { label: 'Nouvelle partie', icon: <RotateCcw size={17}/>, onSelect: () => setModal('setup') },
    { label: 'Règles du jeu', icon: <CircleHelp size={17}/>, onSelect: () => setModal('rules') },
    { label: 'Tous les jeux', icon: <ChevronLeft size={17}/>, onSelect: back },
  ]}/><span className="online-dot"/> <span className="online-label">Prêt à jouer</span><div className="avatar small">V</div></div></header>
  <main><button className="back-to-games" onClick={back}><ChevronLeft size={17}/> Tous les jeux</button><div className="topline"><div><div className="eyebrow"><span/> VOTRE TABLE VOUS ATTEND</div><h1>Une partie de <em>dominos.</em></h1><p>Un peu de stratégie, beaucoup de plaisir.</p></div><button className="outline-button" onClick={()=>setModal('rules')}><CircleHelp size={16}/> Comment jouer ?</button></div>
  <div className="layout"><section className={`game-column ${tableFocus ? 'table-focus' : ''}`}><div className="game-top"><div><span className="live-dot"/> PARTIE LOCALE <span className="divider">/</span> <span className="muted">MODE BLOC</span></div><div className="game-tools">{tableFocus && <button onClick={back} aria-label="Retour aux jeux" title="Retour aux jeux"><ChevronLeft size={18}/></button>}<button onClick={()=>setTableFocus(!tableFocus)} aria-label={tableFocus ? 'Quitter le mode plein écran' : 'Agrandir la table'} title={tableFocus ? 'Réduire la table' : 'Agrandir la table'}>{tableFocus ? <Minimize size={17}/> : <Maximize size={17}/>}</button><button onClick={()=>setModal('setup')} aria-label="Nouvelle partie" title="Nouvelle partie"><RotateCcw size={16}/></button><button onClick={()=>setModal('rules')} aria-label="Règles"><CircleHelp size={17}/></button></div></div>
  <div className="table-frame"><div className="table"><div className="table-inner"><div className="opponent top-player"><div><strong>{game.players[1]?.name ?? ''}</strong><small>{game.players[1]?.hand.length ?? 0} dominos</small></div><DominoBacks name={game.players[1].name} count={game.players[1].hand.length} active={game.winner===null && game.turn===1} passing={game.winner===null && game.turn===1 && !canPlay(game,1)}/></div><div className="table-middle">{game.players[2] ? <div className="opponent side-player"><div><strong>{game.players[2].name}</strong><small>{game.players[2].hand.length} dominos</small></div><DominoBacks name={game.players[2].name} count={game.players[2].hand.length} active={game.winner===null && game.turn===2} passing={game.winner===null && game.turn===2 && !canPlay(game,2)}/></div> : <div className="opponent side-player"/>}<DominoBoard game={game} selected={selected} choose={choose} availableHand={game.turn===0 && game.winner===null ? game.players[0].hand.filter(t=>!selected || t.id===selected) : []}/>{game.players[3] ? <div className="opponent side-player right-player"><div><strong>{game.players[3].name}</strong><small>{game.players[3].hand.length} dominos</small></div><DominoBacks name={game.players[3].name} count={game.players[3].hand.length} active={game.winner===null && game.turn===3} passing={game.winner===null && game.turn===3 && !canPlay(game,3)}/></div> : <div className="opponent side-player right-player"/>}</div><div className="table-bottom"><span className="table-ornament">✦</span><span>KOPAKA</span><span className="table-ornament">✦</span></div></div></div></div>
  <div className="hand-panel"><div className="hand-heading"><div><div className="hand-title"><span className="avatar tiny">V</span><strong>Votre main</strong><span className="hand-count">{game.players[0].hand.length} DOMINOS</span></div><p>{game.winner!==null ? game.message : mustPass ? 'Aucun domino jouable : votre tour passe automatiquement.' : game.turn===0 ? 'À vous de jouer. Choisissez un domino.' : 'Les autres joueurs réfléchissent...'}</p></div><div className="hand-actions"><span className={game.turn===0 && game.winner===null ? 'your-turn' : 'waiting'}>{game.winner!==null ? 'MANCHE TERMINÉE' : game.turn===0 ? '●  À VOUS DE JOUER' : 'EN ATTENTE'}</span></div></div><div className={`hand-tiles ${mustPass ? "passing-hand" : ""}`}>{game.players[0].hand.map(tile=><button key={tile.id} className={`hand-tile ${game.turn===0 && game.winner===null && sides(game,tile).length ? 'playable' : ''} ${selected===tile.id && sides(game,tile).length===2 ? 'awaiting-side' : ''}`} disabled={game.turn!==0 || game.winner!==null || !sides(game,tile).length} onClick={()=>select(tile)} aria-label={`Domino ${tile.a} et ${tile.b}${selected===tile.id && sides(game,tile).length===2 ? ', choisissez une extrémité sur le plateau' : ''}`}><Stage width={48} height={78}><Layer><Domino tile={tile} x={4} y={3} scale={1.12} selected={game.turn===0 && game.winner===null && sides(game,tile).length>0} awaitingSide={selected===tile.id && sides(game,tile).length===2}/></Layer></Stage></button>)}</div>{notice && <div className="notice">{notice}</div>}</div>
  <div className="below-table"><span><span className="live-dot"/> {game.message}</span><button onClick={()=>setModal('setup')}>Nouvelle partie <RotateCcw size={13}/></button></div></section>
  <aside><div className="sidebar-card"><div className="card-heading"><div><div className="eyebrow">AUTOUR DE LA TABLE</div><h2>Les joueurs <span>✦</span></h2></div><Users size={19}/></div><div className="players">{game.players.map((p,i)=><div className="player-row" key={p.name}><div className={`avatar ${['','sand','rose','blue'][i]}`}>{p.name[0]}</div><div className="player-details"><strong>{p.name} {i===0 && <span>(vous)</span>}</strong><small>{i===0?'Joueur': 'Adversaire virtuel'}</small></div><div className="player-score"><strong>{p.score}</strong><small>POINTS</small></div></div>)}</div><div className="round-info"><span>Manche en cours</span><strong>01 <span>/</span> —</strong></div></div>
  <div className="invite-card"><div className="invite-icon"><Users size={20}/></div><h3>Le plaisir se partage.</h3><p>Retrouvez vos proches autour d'une table de dominos.</p><button onClick={()=>setOnline(true)}>Jouer entre amis <ArrowRight size={16}/></button><div className="invite-decoration">✳</div></div><div className="sidebar-note"><Sparkles size={15}/><span>Un jeu intemporel, de beaux moments.</span></div></aside></div>
  <footer><span>© 2026 KOPAKA</span><span>FAIT POUR ÊTRE ENSEMBLE <span className="footer-heart">♥</span></span><button onClick={()=>setModal('rules')}>Règles & aide</button></footer></main>
  {showRoundResult && game.winner!==null && <div className="modal-backdrop domino-round-backdrop"><div className="modal domino-round-modal recap-modal" role="dialog" aria-modal="true" aria-labelledby="local-round-title"><div className="recap-heading"><div><div className="recap-eyebrow">● RÉSULTAT</div><h2 id="local-round-title">{game.players[game.winner].score>=matchTarget ? 'Partie terminée' : 'Manche terminée'}</h2></div></div><DominoRoundSummary players={game.players} target={matchTarget} message={game.message} blocked={game.passes>=game.players.length} champion={game.players[game.winner].score>=matchTarget ? game.players[game.winner].name : null}/>{game.players[game.winner].score>=matchTarget ? <button className="primary-button recap-action" onClick={()=>setShowRoundResult(false)}>Terminer</button> : <button className="primary-button recap-action" onClick={nextRound}>Manche suivante</button>}</div></div>}
  {modal && <div className="modal-backdrop" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal(null)} aria-label="Fermer"><X size={20}/></button>{modal==='setup'?<><div className="modal-icon"><Users/></div><div className="eyebrow">NOUVELLE PARTIE</div><h2>Combien de joueurs ?</h2><p>Choisissez le nombre de participants à la table locale.</p><label htmlFor="domino-player-count" style={{display:'block',fontSize:12,fontWeight:700,margin:'18px 0 8px'}}>Joueurs</label><select id="domino-player-count" value={playerCount} onChange={event=>setPlayerCount(Number(event.target.value))} style={{width:'100%',padding:12,border:'1px solid #dfe7dc',borderRadius:6,background:'#fff',color:'#234a37',font:'inherit'}}>{[2,3,4].map(n=><option key={n} value={n}>{n} joueurs {n===2?'· 7 dominos chacun':n===3?'· 6 dominos chacun':'· 7 dominos chacun'}</option>)}</select><label htmlFor="domino-difficulty" style={{display:"block",fontSize:12,fontWeight:700,margin:"18px 0 8px"}}>Niveau des ordinateurs</label><select id="domino-difficulty" value={difficulty} onChange={event=>setDifficulty(event.target.value as DominoDifficulty)} style={{width:"100%",padding:12,border:"1px solid #dfe7dc",borderRadius:6,background:"#fff",color:"#234a37",font:"inherit"}}><option value="easy">Facile · coups aléatoires</option><option value="medium">Moyen · points élevés</option><option value="hard">Difficile · anticipe sa main</option></select><label htmlFor="domino-target-score" style={{display:"block",fontSize:12,fontWeight:700,margin:"18px 0 8px"}}>Score à atteindre</label><select id="domino-target-score" value={targetScore} onChange={event=>setTargetScore(Number(event.target.value))} style={{width:"100%",padding:12,border:"1px solid #dfe7dc",borderRadius:6,background:"#fff",color:"#234a37",font:"inherit"}}>{[50,80,120].map(score=><option key={score} value={score}>{score} points</option>)}</select><button className="primary-button" style={{marginTop:20}} onClick={()=>startGame(playerCount)}>Commencer la partie <ArrowRight size={16}/></button></>:modal==='rules'?<><div className="modal-icon"><CircleHelp/></div><div className="eyebrow">PRENEZ PLACE</div><h2>Les règles du jeu</h2><p>Le domino Bloc se joue avec 28 pièces, de 0 à 6. Ici, vous jouez avec 2, 3 ou 4 joueurs : 7 dominos chacun à deux ou à quatre, 6 à trois.</p><ol><li>Le joueur ayant le plus grand double commence.</li><li>À votre tour, reliez un domino à une extrémité de même valeur.</li><li>Si vous ne pouvez pas jouer, passez votre tour. Il n'y a pas de pioche.</li><li>La manche se termine lorsqu'un joueur vide sa main ou que tous sont bloqués. En cas de blocage, la main la moins chargée l'emporte.</li></ol><button className="primary-button" onClick={()=>setModal(null)}>C'est compris <ArrowRight size={16}/></button></>:<><div className="modal-icon"><Users/></div><div className="eyebrow">JOUER ENSEMBLE</div><h2>Invitez vos amis</h2><p>Les salons privés par code d'invitation ne sont pas encore disponibles. En attendant, profitez d'une partie locale contre trois adversaires virtuels.</p><button className="primary-button" onClick={()=>setModal(null)}>Retour à la table <ArrowRight size={16}/></button></>}</div></div>}</div>;
}
function GamesApp(){
  const [game,setGame]=useState<'domino'|'ludo'|'faritany'|null>(null);
  if(game==='domino')return <App back={()=>setGame(null)}/>;
  if(game==='ludo')return <Ludo back={()=>setGame(null)}/>;
  if(game==='faritany')return <Faritany back={()=>setGame(null)}/>;
  return <GameHub open={setGame}/>;
}
createRoot(document.getElementById('root')!).render(
  <React.StrictMode><Suspense fallback={<LoadingScreen/>}><GamesApp/></Suspense><AudioControls/><CelebrationOverlay/></React.StrictMode>
);
