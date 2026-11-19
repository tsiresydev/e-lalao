import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Stage, Layer, Rect, Circle, Group, Line, Text } from 'react-konva';
import Konva from 'konva';
import { ArrowRight, Bot, ChevronLeft, CircleHelp, Copy, Maximize, Menu, Minimize, Play, Plus, RotateCcw, Sparkles, Users, Volume2, X } from 'lucide-react';
import { canPlay, Game, newGame, pass, play, sides, Tile } from './game';
import { Online } from './online';
import { Ludo } from './ludo';
import { GameHub } from './game-hub';
import { finishMoveAnimation, prepareMoveAnimation } from './move-animation';
import './style.css';
import './design-system.css';

const positions: Record<number, [number, number][]> = { 0: [], 1: [[.5,.5]], 2: [[.25,.25],[.75,.75]], 3: [[.25,.25],[.5,.5],[.75,.75]], 4: [[.25,.25],[.75,.25],[.25,.75],[.75,.75]], 5: [[.25,.25],[.75,.25],[.5,.5],[.25,.75],[.75,.75]], 6: [[.25,.2],[.75,.2],[.25,.5],[.75,.5],[.25,.8],[.75,.8]] };
function Domino({ tile, x, y, horizontal = false, selected = false, onClick, scale = 1, animate = false, hidden = false }: { tile: {a:number;b:number}; x:number; y:number; horizontal?:boolean; selected?:boolean; onClick?:()=>void; scale?:number; animate?:boolean; hidden?:boolean }) {
  const group = useRef<Konva.Group>(null);
  useEffect(()=>{ if (animate && group.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) { const node=group.current; node.opacity(0.65); node.to({opacity:1,duration:0.12,easing:Konva.Easings.EaseOut}); } },[animate]);
  const w = horizontal ? 64 : 32, h = horizontal ? 32 : 64;
  return <Group ref={group} x={x} y={y} scaleX={scale} scaleY={scale} visible={!hidden} onClick={onClick} onTap={onClick} onMouseEnter={e => { if (onClick) e.target.getStage()!.container().style.cursor = 'pointer'; }} onMouseLeave={e => { e.target.getStage()!.container().style.cursor = 'default'; }}>
    <Rect x={0} y={2} width={w} height={h} cornerRadius={3} fill="#c7c9c5" shadowColor="#001b1d" shadowBlur={4} shadowOpacity={0.3} shadowOffsetY={2}/>
    <Rect width={w} height={h} cornerRadius={3} fillLinearGradientStartPoint={{x:0,y:0}} fillLinearGradientEndPoint={{x:w,y:h}} fillLinearGradientColorStops={[0,'#ffffff',1,'#f1f2ee']} stroke={selected ? '#d8b568' : '#c8ceca'} strokeWidth={selected ? 2 : 0.8}/>
    <Line points={horizontal ? [32,4,32,28] : [4,32,28,32]} stroke="#303937" strokeWidth={0.8}/>
    {[tile.a,tile.b].map((n, half) => positions[n].map(([px,py], i) => <Circle key={`${half}-${i}`} x={horizontal ? half*32+(n===6 ? py : px)*32 : px*32} y={horizontal ? (n===6 ? px : py)*32 : half*32+py*32} radius={2.8} fill="#101615"/>))}
  </Group>;
}
function Board({ game, selected, choose, cancel, availableHand = [] }: {game:Game;selected:string|null;choose:(side:'left'|'right')=>void;cancel:()=>void;availableHand?:Tile[]}) {
  const ref = useRef<HTMLDivElement>(null), [width,setWidth] = useState(800), [availableHeight,setAvailableHeight] = useState(0), [viewportHeight,setViewportHeight] = useState(window.innerHeight);
  const [movingTile,setMovingTile]=useState<string|null>(null);
  useEffect(() => { const observer = new ResizeObserver(([entry]) => {setWidth(entry.contentRect.width); setAvailableHeight(entry.target.closest('.playing-view, .table-focus') ? entry.contentRect.height : 0);}); if(ref.current) observer.observe(ref.current); return () => observer.disconnect(); }, []);
  useEffect(() => { const resize=()=>setViewportHeight(window.innerHeight); window.addEventListener('resize',resize); return ()=>window.removeEventListener('resize',resize); },[]);
  const height = availableHeight > 0 ? availableHeight : Math.max(120,Math.min(250,viewportHeight*0.35)), preferredScale = 1.25, boardWidth = Math.max(180,(width-28)/preferredScale), gap = 2, rowHeight = 66;
  let cursor = 0, row = 0, direction = 1;
  const placements = game.chain.map((tile, i) => {
    const isDouble = tile.left === tile.right;
    const horizontalWidth = isDouble ? 32 : 64;
    const remaining = direction === 1 ? boardWidth-cursor : cursor;
    // Reserve room for a vertical corner tile whenever the chain continues.
    const corner = i < game.chain.length-1 && remaining < horizontalWidth+66;
    if (corner) {
      const cornerWidth = isDouble ? 64 : 32;
      const x = direction === 1 ? cursor : cursor-cornerWidth;
      const result = { tile, x, y: row*rowHeight+17, horizontal: isDouble, reversed: false };
      // The next row travels back alongside the corner, not underneath it.
      cursor = direction === 1 ? x-gap : x+cornerWidth+gap;
      direction *= -1; row++;
      return result;
    }
    const x = direction === 1 ? cursor : cursor-horizontalWidth;
    const result = { tile, x, y: row*rowHeight+(isDouble ? -16 : 0), horizontal: !isDouble, reversed: direction === -1 };
    cursor += direction*(horizontalWidth+gap);
    return result;
  });
  const minX = Math.min(0,...placements.map(p=>p.x)), maxX = Math.max(0,...placements.map(p=>p.x+(p.horizontal ? 64 : 32)));
  const minY = Math.min(0,...placements.map(p=>p.y)), maxY = Math.max(64,...placements.map(p=>p.y+(p.horizontal ? 32 : 64)));
  const contentWidth = Math.max(64,maxX-minX), contentHeight = Math.max(64,maxY-minY);
  const canvasWidth = width, canvasHeight = height, tileScale = Math.min(preferredScale, Math.max(1,width-28)/contentWidth, Math.max(1,height-28)/contentHeight);
  const offsetX = (canvasWidth-contentWidth*tileScale)/2-minX*tileScale, offsetY = (canvasHeight-contentHeight*tileScale)/2-minY*tileScale;
  useLayoutEffect(()=>{
    const bounds=ref.current?.querySelector('.konvajs-content')?.getBoundingClientRect();
    if(!bounds)return;
    for(const p of [placements[0],placements[placements.length-1]]){
      if(!p)continue;
      const target=new DOMRect(bounds.left+offsetX+p.x*tileScale,bounds.top+offsetY+p.y*tileScale,(p.horizontal ? 64 : 32)*tileScale,(p.horizontal ? 32 : 64)*tileScale);
      if(finishMoveAnimation(p.tile.id,target,p.horizontal,()=>setMovingTile(current=>current===p.tile.id ? null : current))){setMovingTile(p.tile.id);break;}
    }
  },[game.chain]);
  return <div className="board-canvas" ref={ref} style={{'--board-default-height':`${height}px`} as React.CSSProperties}><div className="board-scroll" role="region" aria-label="Plateau de dominos" tabIndex={0} onKeyDown={e=>{ const side=e.key==='ArrowLeft' ? 'left' : e.key==='ArrowRight' ? 'right' : null; if(selected && side && availableHand.some(tile=>tile.id===selected && sides(game,tile).includes(side))){e.preventDefault();choose(side);} }}><Stage width={canvasWidth} height={canvasHeight}><Layer listening={Boolean(selected)}>
    {placements.map(({tile,x,y,horizontal,reversed}) => <Domino key={tile.id} tile={{a:reversed ? tile.right : tile.left,b:reversed ? tile.left : tile.right}} x={offsetX+x*tileScale} y={offsetY+y*tileScale} horizontal={horizontal} scale={tileScale} animate hidden={movingTile===tile.id}/>)}
    {placements.length > 0 && (['left','right'] as const).filter(side => availableHand.some(tile=>sides(game,tile).includes(side))).map(side => {
      const p = side === 'left' ? placements[0] : placements[placements.length-1];
      const tileWidth = p.horizontal ? 64 : 32, tileHeight = p.horizontal ? 32 : 64;
      const firstEnd = p.horizontal ? (side === 'left') !== p.reversed : side === 'left';
      const sameTile = placements.length === 1;
      const hitWidth = sameTile && p.horizontal ? tileWidth/2 : tileWidth;
      const hitHeight = sameTile && !p.horizontal ? tileHeight/2 : tileHeight;
      const hitX = p.x + (sameTile && p.horizontal && !firstEnd ? tileWidth/2 : 0);
      const hitY = p.y + (sameTile && !p.horizontal && !firstEnd ? tileHeight/2 : 0);
      return <Rect key={side} x={offsetX+hitX*tileScale} y={offsetY+hitY*tileScale} width={hitWidth*tileScale} height={hitHeight*tileScale} cornerRadius={3} fill="rgba(215,181,102,0.3)" stroke="#e8c779" strokeWidth={2} listening={Boolean(selected)} onMouseEnter={e=>{e.target.getStage()!.container().style.cursor='pointer';}} onMouseLeave={e=>{e.target.getStage()!.container().style.cursor='default';}} onClick={()=>selected && choose(side)} onTap={()=>selected && choose(side)}/>;
    })}
    {!game.chain.length && <Text text="LE JEU COMMENCE ICI" x={0} y={canvasHeight/2-5} width={canvasWidth} align="center" fontSize={10} letterSpacing={3} fill="#9cb5a4" opacity={0.6}/>}
  </Layer></Stage></div>{selected && game.chain.length > 0 && <div className="side-pick"><span>Cliquez sur une extrémité éclairée du plateau</span><button className="cancel" onClick={cancel} aria-label="Annuler la sélection">Annuler</button></div>}</div>;
}
function App({back}:{back:()=>void}) {
  const [game,setGame] = useState<Game>(()=>newGame()), [selected,setSelected] = useState<string|null>(null), [modal,setModal] = useState<'rules'|'online'|null>(null), [notice,setNotice] = useState(''), [online,setOnline] = useState(false), [tableFocus,setTableFocus] = useState(false);
  useEffect(()=>{ if(!tableFocus)return; const overflow=document.body.style.overflow; document.body.style.overflow='hidden'; const onKey=(event:KeyboardEvent)=>{if(event.key==='Escape')setTableFocus(false);}; window.addEventListener('keydown',onKey); return ()=>{document.body.style.overflow=overflow;window.removeEventListener('keydown',onKey);}; },[tableFocus]);
  useEffect(()=>{ if(game.winner !== null || game.turn === 0) return; const timer=setTimeout(()=>{ const tile=game.players[game.turn].hand.find(t=>sides(game,t).length); setGame(tile ? play(game,tile.id,sides(game,tile)[0]) : pass(game)); },850); return ()=>clearTimeout(timer); },[game]);
  const mustPass = game.winner===null && game.turn===0 && !canPlay(game);
  useEffect(()=>{if(!mustPass)return;const timer=window.setTimeout(()=>setGame(current=>current.turn===0 && current.winner===null && !canPlay(current) ? pass(current) : current),2000);return ()=>window.clearTimeout(timer);},[mustPass,game]);
  const select = (tile:Tile) => { if(game.turn!==0 || game.winner!==null) return; const options=sides(game,tile); if(!options.length){ setNotice('Ce domino ne peut pas être joué.'); setTimeout(()=>setNotice(''),2200); return; } if(options.length===2){setSelected(tile.id);return;} prepareMoveAnimation(tile.id,tile.a,tile.b);setSelected(null);setGame(play(game,tile.id,options[0])); };
  const choose = (side:'left'|'right') => { if(selected) {const tile=game.players[0].hand.find(t=>t.id===selected);if(tile)prepareMoveAnimation(tile.id,tile.a,tile.b);setGame(play(game,selected,side));} setSelected(null); };
  const restart = () => { setGame(newGame()); setSelected(null); };
  if (online) return <Online back={()=>setOnline(false)} Board={Board} Domino={Domino}/>;
  return <div className="app"><header className="header"><div className="brand"><div className="brand-mark"><span>● ●</span><i/><span>● ●</span></div><div><strong>KOPAKA</strong><small>LE PLAISIR DE JOUER ENSEMBLE</small></div></div><nav><button className="nav-active">La table</button><button onClick={()=>setOnline(true)}>Jouer entre amis</button><button onClick={()=>setModal('rules')}>Règles du jeu</button></nav><div className="header-right"><button className="icon-button mobile-menu" onClick={()=>setModal('rules')} aria-label="Menu"><Menu size={19}/></button><span className="online-dot"/> <span className="online-label">Prêt à jouer</span><div className="avatar small">V</div></div></header>
  <main><button className="back-to-games" onClick={back}><ChevronLeft size={17}/> Tous les jeux</button><div className="topline"><div><div className="eyebrow"><span/> VOTRE TABLE VOUS ATTEND</div><h1>Une partie de <em>dominos.</em></h1><p>Un peu de stratégie, beaucoup de plaisir.</p></div><button className="outline-button" onClick={()=>setModal('rules')}><CircleHelp size={16}/> Comment jouer ?</button></div>
  <div className="layout"><section className={`game-column ${tableFocus ? 'table-focus' : ''}`}><div className="game-top"><div><span className="live-dot"/> PARTIE LOCALE <span className="divider">/</span> <span className="muted">MODE BLOC</span></div><div className="game-tools"><button onClick={()=>setTableFocus(!tableFocus)} aria-label={tableFocus ? 'Quitter le mode plein écran' : 'Agrandir la table'} title={tableFocus ? 'Réduire la table' : 'Agrandir la table'}>{tableFocus ? <Minimize size={17}/> : <Maximize size={17}/>}</button><button onClick={restart} aria-label="Nouvelle partie" title="Nouvelle partie"><RotateCcw size={16}/></button><button onClick={()=>setModal('rules')} aria-label="Règles"><CircleHelp size={17}/></button></div></div>
  <div className="table-frame"><div className="table"><div className="table-inner"><div className="opponent top-player"><div className="avatar sand">L</div><div><strong>Léon</strong><small>{game.players[1].hand.length} dominos</small></div>{game.turn===1 && <span className="turn-indicator">JOUE</span>}</div><div className="table-middle"><div className="opponent side-player"><div className="avatar rose">C</div><div><strong>Camille</strong><small>{game.players[2].hand.length} dominos</small></div>{game.turn===2 && <span className="turn-indicator">JOUE</span>}</div><Board game={game} selected={selected} choose={choose} cancel={()=>setSelected(null)} availableHand={game.turn===0 && game.winner===null ? game.players[0].hand.filter(t=>!selected || t.id===selected) : []}/><div className="opponent side-player right-player"><div className="avatar blue">S</div><div><strong>Sacha</strong><small>{game.players[3].hand.length} dominos</small></div>{game.turn===3 && <span className="turn-indicator">JOUE</span>}</div></div><div className="table-bottom"><span className="table-ornament">✦</span><span>KOPAKA</span><span className="table-ornament">✦</span></div></div></div></div>
  <div className="hand-panel"><div className="hand-heading"><div><div className="hand-title"><span className="avatar tiny">V</span><strong>Votre main</strong><span className="hand-count">{game.players[0].hand.length} DOMINOS</span></div><p>{game.winner!==null ? game.message : mustPass ? 'Aucun domino jouable : votre tour passe automatiquement.' : game.turn===0 ? 'À vous de jouer. Choisissez un domino.' : 'Les autres joueurs réfléchissent...'}</p></div><div className="hand-actions"><span className={game.turn===0 && game.winner===null ? 'your-turn' : 'waiting'}>{game.winner!==null ? 'MANCHE TERMINÉE' : game.turn===0 ? '●  À VOUS DE JOUER' : 'EN ATTENTE'}</span></div></div><div className={`hand-tiles ${mustPass ? "passing-hand" : ""}`}>{game.players[0].hand.map(tile=><button key={tile.id} className={`hand-tile ${game.turn===0 && game.winner===null && sides(game,tile).length ? 'playable' : ''}`} disabled={game.turn!==0 || game.winner!==null || !sides(game,tile).length} onClick={()=>select(tile)} aria-label={`Domino ${tile.a} et ${tile.b}`}><Stage width={48} height={78}><Layer><Domino tile={tile} x={4} y={3} scale={1.12} selected={game.turn===0 && game.winner===null && sides(game,tile).length>0}/></Layer></Stage></button>)}</div>{notice && <div className="notice">{notice}</div>}</div>
  <div className="below-table"><span><span className="live-dot"/> {game.message}</span><button onClick={restart}>Nouvelle partie <RotateCcw size={13}/></button></div></section>
  <aside><div className="sidebar-card"><div className="card-heading"><div><div className="eyebrow">AUTOUR DE LA TABLE</div><h2>Les joueurs <span>✦</span></h2></div><Users size={19}/></div><div className="players">{game.players.map((p,i)=><div className="player-row" key={p.name}><div className={`avatar ${['','sand','rose','blue'][i]}`}>{p.name[0]}</div><div className="player-details"><strong>{p.name} {i===0 && <span>(vous)</span>}</strong><small>{i===0?'Joueur': 'Adversaire virtuel'}</small></div><div className="player-score"><strong>{p.score}</strong><small>POINTS</small></div></div>)}</div><div className="round-info"><span>Manche en cours</span><strong>01 <span>/</span> —</strong></div></div>
  <div className="invite-card"><div className="invite-icon"><Users size={20}/></div><h3>Le plaisir se partage.</h3><p>Retrouvez vos proches autour d'une table de dominos.</p><button onClick={()=>setOnline(true)}>Jouer entre amis <ArrowRight size={16}/></button><div className="invite-decoration">✳</div></div><div className="sidebar-note"><Sparkles size={15}/><span>Un jeu intemporel, de beaux moments.</span></div></aside></div>
  <footer><span>© 2026 KOPAKA</span><span>FAIT POUR ÊTRE ENSEMBLE <span className="footer-heart">♥</span></span><button onClick={()=>setModal('rules')}>Règles & aide</button></footer></main>
  {modal && <div className="modal-backdrop" onClick={()=>setModal(null)}><div className="modal" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setModal(null)} aria-label="Fermer"><X size={20}/></button>{modal==='rules'?<><div className="modal-icon"><CircleHelp/></div><div className="eyebrow">PRENEZ PLACE</div><h2>Les règles du jeu</h2><p>Le domino Bloc se joue avec 28 pièces, de 0 à 6. Ici, quatre joueurs reçoivent chacun 7 dominos.</p><ol><li>Le joueur ayant le plus grand double commence.</li><li>À votre tour, reliez un domino à une extrémité de même valeur.</li><li>Si vous ne pouvez pas jouer, passez votre tour. Il n'y a pas de pioche.</li><li>La manche se termine lorsqu'un joueur vide sa main ou que tous sont bloqués. En cas de blocage, la main la moins chargée l'emporte.</li></ol><button className="primary-button" onClick={()=>setModal(null)}>C'est compris <ArrowRight size={16}/></button></>:<><div className="modal-icon"><Users/></div><div className="eyebrow">JOUER ENSEMBLE</div><h2>Invitez vos amis</h2><p>Les salons privés par code d'invitation ne sont pas encore disponibles. En attendant, profitez d'une partie locale contre trois adversaires virtuels.</p><button className="primary-button" onClick={()=>setModal(null)}>Retour à la table <ArrowRight size={16}/></button></>}</div></div>}</div>;
}
function GamesApp(){
  const [game,setGame]=useState<'domino'|'ludo'|null>(null);
  if(game==='domino')return <App back={()=>setGame(null)}/>;
  if(game==='ludo')return <Ludo back={()=>setGame(null)}/>;
  return <GameHub open={setGame}/>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><GamesApp/></React.StrictMode>);
