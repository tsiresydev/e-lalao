import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, CircleHelp, Flag, Minus, Plus, RotateCcw, X } from 'lucide-react';
import { computerMove, FARITANY_COORD_LIMIT, newFaritany, placePoint, score } from './faritany-game';
import './faritany.css';
import { FaritanyLobby, useFaritanyOnline } from './faritany-online';
import { TurnCountdown } from './turn-countdown';

export function Faritany({back}:{back:()=>void}) {
  const [game,setGame]=useState(()=>newFaritany());
  const [mode,setMode]=useState<'local'|'computer'|'online'|null>(null);
  const online=useFaritanyOnline();
  const onlineRoom=online.room;
  const onlineColor=onlineRoom?.players.find(p=>p.uid===onlineRoom.me)?.seat===0?'blue':'red';
  useEffect(()=>{if(mode==='online' && onlineRoom)setGame(onlineRoom.game);},[mode,onlineRoom]);
  const [target,setTarget]=useState(10);
  const [rules,setRules]=useState(false);
  const [focus,setFocus]=useState({x:7,y:7});
  const [offset,setOffset]=useState({x:0,y:0});
  const [zoom,setZoom]=useState(125);
  const [dragging,setDragging]=useState(false);
  const boardRef=useRef<HTMLDivElement>(null);
  const gridRef=useRef<SVGSVGElement>(null);
  const [aspect,setAspect]=useState(1);
  useEffect(()=>{const board=boardRef.current;if(!board)return;const observer=new ResizeObserver(([entry])=>{const {width,height}=entry.contentRect;if(width>0&&height>0)setAspect(width/height);});observer.observe(board);return()=>observer.disconnect();},[mode,onlineRoom?.status]);
  useEffect(()=>{const grid=gridRef.current;if(!grid)return;const wheel=(event:WheelEvent)=>{if(event.ctrlKey || event.metaKey)return;event.preventDefault();if(event.deltaY!==0)setZoom(current=>Math.max(50,Math.min(250,current+(event.deltaY<0?25:-25))));};grid.addEventListener('wheel',wheel,{passive:false});return()=>grid.removeEventListener('wheel',wheel);},[mode,onlineRoom?.status]);
  const drag=useRef<{id:number;startX:number;startY:number;x:number;y:number;moved:boolean}|null>(null);
  const suppressClick=useRef(false);
  const blue=score(game,'blue'), red=score(game,'red');
  const winner=blue===red ? 'Égalité !' : `${blue>red?'Bleu':'Rouge'} remporte la partie !`;
  useEffect(()=>{if(mode!=='computer' || game.finished || game.turn!=='red')return;const timer=window.setTimeout(()=>setGame(current=>{if(current.finished || current.turn!=='red')return current;const move=computerMove(current);return move ? placePoint(current,move.x,move.y) : current;}),450);return ()=>window.clearTimeout(timer);},[game,mode]);
  const play=(x:number,y:number)=>{if(mode==='online'){if(onlineRoom?.status==='playing' && onlineRoom.game.turn===onlineColor && !online.busy)void online.move(x,y);return;}if(mode==='computer' && game.turn==='red')return;setFocus({x,y});setGame(current=>placePoint(current,x,y));};
  const reset=()=>{if(game.points.length && !window.confirm('Commencer une nouvelle partie ?'))return;setMode(null);setGame(newFaritany(15,target));setFocus({x:7,y:7});setOffset({x:0,y:0});setZoom(125);};
  const finish=()=>{if(window.confirm('Terminer la partie et compter les points capturés ?'))setGame(current=>({...current,finished:true}));};
  const margin=20, step=30, extent=(game.size-1)*step, size=extent+margin*2;
  // Show a magnified part of the sheet; panning moves the viewport, not the grid.
  const viewSize=size/(zoom/100), viewInset=(size-viewSize)/2;
  const changeZoom=(next:number)=>setZoom(Math.max(50,Math.min(250,next)));
  const viewWidth=viewSize*aspect,viewX=(size-viewWidth)/2+offset.x,viewY=viewInset+offset.y;
  const minX=Math.max(-FARITANY_COORD_LIMIT,Math.floor((viewX-margin)/step)-1),maxX=Math.min(FARITANY_COORD_LIMIT,Math.ceil((viewX+viewWidth-margin)/step)+1);
  const minY=Math.max(-FARITANY_COORD_LIMIT,Math.floor((viewY-margin)/step)-1),maxY=Math.min(FARITANY_COORD_LIMIT,Math.ceil((viewY+viewSize-margin)/step)+1);
  const columns=Array.from({length:Math.max(0,maxX-minX+1)},(_,i)=>minX+i),rows=Array.from({length:Math.max(0,maxY-minY+1)},(_,i)=>minY+i);
  if(!mode)return <div className="faritany-setup-page"><header className="faritany-header"><button onClick={()=>{if(mode==='online'){if(window.confirm('Quitter annule la partie. Continuer ?'))void online.leave().then(ok=>{if(ok)setMode(null);});}else back();}}><ArrowLeft size={18}/> <span>{mode==='online'?'Quitter le salon':'Tous les jeux'}</span></button><strong>KOPAKA <span>/ FARITANY</span></strong><button onClick={()=>setRules(true)} aria-label="Règles"><CircleHelp size={20}/></button></header><main className="faritany-setup"><span>LE JEU DES TERRITOIRES</span><h1>Jouer au Faritany<span>.</span></h1><p>Choisissez votre objectif et votre adversaire.</p><label htmlFor="faritany-target">POINTS À CAPTURER POUR GAGNER</label><select id="faritany-target" value={target} onChange={e=>setTarget(Number(e.target.value))}>{[5,10,15,20,30].map(n=><option key={n} value={n}>{n} points</option>)}</select><div className="faritany-modes"><button onClick={()=>{setGame(newFaritany(15,target));setMode('computer');}}><strong>Contre l’ordinateur</strong><small>Affrontez la machine sur cet appareil.</small></button><button onClick={()=>{setGame(newFaritany(15,target));setMode('local');}}><strong>À deux sur cet appareil</strong><small>Jouez chacun votre tour sur la même grille.</small></button><button onClick={()=>{setMode('online');const saved=sessionStorage.getItem('faritany-room');if(saved)void online.refresh(saved);}}><strong>Entre amis en ligne</strong><small>Salon priv? ? deux joueurs.</small></button></div>{rules && <div className="modal-backdrop" onClick={()=>setRules(false)}><div className="modal faritany-rules" role="dialog" aria-modal="true" aria-label="Règles du Faritany" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setRules(false)} aria-label="Fermer"><X size={20}/></button><h2>Les règles du Faritany</h2><p>Placez vos points à tour de rôle. Entourez des points adverses avec les vôtres pour les capturer. Le premier à atteindre le score choisi gagne.</p><button className="primary-button" onClick={()=>setRules(false)}>C’est compris</button></div></div>}</main></div>;
  if(mode==='online' && (!onlineRoom || onlineRoom.status==='waiting'))return <FaritanyLobby online={online} target={target} onBack={()=>void online.leave().then(ok=>{if(ok)setMode(null);})}/>;
  return <div className="faritany-page">
    <header className="faritany-header"><button onClick={back}><ArrowLeft size={18}/> <span>Tous les jeux</span></button><strong>KOPAKA <span>/ FARITANY</span></strong><TurnCountdown deadline={onlineRoom?.turn_deadline} active={mode==='online'&&onlineRoom?.status==='playing'}/><button onClick={()=>setRules(true)} aria-label="Règles du Faritany"><CircleHelp size={20}/></button></header>
    <main className="faritany-main">
      <div className="faritany-intro"><div><span>UN JEU DE STRATÉGIE MALGACHE</span><h1>Faritany<span>.</span></h1><p>Entourez les points adverses pour conquérir votre territoire.</p></div><div className="faritany-local">● &nbsp; 2 JOUEURS · SUR CET APPAREIL</div></div>
      <section className="faritany-card" aria-label="Partie de Faritany">
        <div className="faritany-scorebar"><div className={`faritany-player blue ${!game.finished && game.turn==='blue'?'active':''}`}><i/><div><strong>{mode==='online'?(onlineRoom?.players.find(p=>p.seat===0)?.name ?? 'Joueur bleu'):'Joueur bleu'}</strong><small>{!game.finished && game.turn==='blue'?'À VOUS DE JOUER':`OBJECTIF : ${game.target} POINTS`}</small></div><b>{blue}</b></div><div className="faritany-versus">VS</div><div className={`faritany-player red ${!game.finished && game.turn==='red'?'active':''}`}><i/><div><strong>{mode==='online'?(onlineRoom?.players.find(p=>p.seat===1)?.name ?? 'Joueur rouge'):mode==='computer'?'Ordinateur':'Joueur rouge'}</strong><small>{!game.finished && game.turn==='red'?(mode==='computer'?'RÉFLÉCHIT':'À VOUS DE JOUER'):`OBJECTIF : ${game.target} POINTS`}</small></div><b>{red}</b></div></div>
        <div className="faritany-board-wrap"><div className="faritany-board" ref={boardRef}>
          <svg ref={gridRef} viewBox={`${viewX} ${viewY} ${viewWidth} ${viewSize}`} role="grid" tabIndex={0} className={dragging?'is-dragging':''} aria-label="Grille Faritany. Glissez pour déplacer la vue, utilisez la molette pour zoomer, ou les flèches puis Entrée pour placer un point."
            onPointerDown={event=>{if(!event.isPrimary || event.button!==0)return;suppressClick.current=false;drag.current={id:event.pointerId,startX:event.clientX,startY:event.clientY,x:offset.x,y:offset.y,moved:false};}}
            onPointerMove={event=>{const d=drag.current;if(!d||d.id!==event.pointerId)return;const dx=event.clientX-d.startX,dy=event.clientY-d.startY;if(!d.moved && Math.hypot(dx,dy)<8)return;if(!d.moved){d.moved=true;suppressClick.current=true;setDragging(true);event.currentTarget.setPointerCapture(event.pointerId);}const bounds=event.currentTarget.getBoundingClientRect(), scale=viewSize/bounds.height,limit=FARITANY_COORD_LIMIT*step-Math.max(viewWidth,viewSize);setOffset({x:Math.max(-limit,Math.min(limit,d.x-dx*scale)),y:Math.max(-limit,Math.min(limit,d.y-dy*scale))});}}
            onPointerUp={event=>{if(drag.current?.id===event.pointerId){drag.current=null;setDragging(false);}}}
            onPointerCancel={()=>{drag.current=null;setDragging(false);suppressClick.current=true;}}
            onClickCapture={event=>{if(suppressClick.current){event.preventDefault();event.stopPropagation();suppressClick.current=false;}}}
            onKeyDown={event=>{let {x,y}=focus;if(event.key==='ArrowLeft')x--;else if(event.key==='ArrowRight')x++;else if(event.key==='ArrowUp')y--;else if(event.key==='ArrowDown')y++;else if(event.key==='Enter' || event.key===' '){event.preventDefault();play(x,y);return;}else return;event.preventDefault();x=Math.max(-FARITANY_COORD_LIMIT,Math.min(FARITANY_COORD_LIMIT,x));y=Math.max(-FARITANY_COORD_LIMIT,Math.min(FARITANY_COORD_LIMIT,y));setFocus({x,y});setOffset(current=>{const follow=(position:number,value:number,inset:number,span:number)=>Math.max(position-inset-span+step,Math.min(position-inset-step,value));return {x:follow(margin+x*step,current.x,(size-viewWidth)/2,viewWidth),y:follow(margin+y*step,current.y,viewInset,viewSize)};});}}>
            <rect x={viewX} y={viewY} width={viewWidth} height={viewSize} fill="#fffefa"/>
            {columns.map(x=><line key={`x${x}`} x1={margin+x*step} y1={viewY} x2={margin+x*step} y2={viewY+viewSize}/>)}
            {rows.map(y=><line key={`y${y}`} x1={viewX} y1={margin+y*step} x2={viewX+viewWidth} y2={margin+y*step}/>)}
            {game.territories.map((territory,i)=><polygon key={i} className={`faritany-territory ${territory.player}`} points={territory.path.map(p=>`${margin+p.x*step},${margin+p.y*step}`).join(' ')}/>)}
            {game.points.map(p=><g key={`${p.x},${p.y}`}><circle className={`faritany-dot ${p.player} ${p.captured?'captured':''}`} cx={margin+p.x*step} cy={margin+p.y*step} r={p.captured?4:5}/>{p.captured && <circle className="faritany-captured-ring" cx={margin+p.x*step} cy={margin+p.y*step} r={7}/>}</g>)}
            <circle className="faritany-focus" cx={margin+focus.x*step} cy={margin+focus.y*step} r={10}/>
            {rows.flatMap(y=>columns.map(x=><rect key={`${x},${y}`} x={margin+x*step-step/2} y={margin+y*step-step/2} width={step} height={step} fill="transparent" className={game.finished || game.points.some(p=>p.x===x && p.y===y)?'unavailable':'intersection'} onClick={()=>play(x,y)}/>))}
          </svg>
          {game.finished && <div className="faritany-result" role="status"><span>PARTIE TERMINÉE</span><strong>{winner}</strong><small>{blue} bleu · {red} rouge</small></div>}
          <div className="faritany-zoom" role="group" aria-label="Zoom de la grille"><button type="button" aria-label="Dézoomer la grille" title="Dézoomer" disabled={zoom<=50} onClick={()=>changeZoom(zoom-25)}><Minus size={18}/></button><span aria-live="polite">{zoom} %</span><button type="button" aria-label="Zoomer la grille" title="Zoomer" disabled={zoom>=250} onClick={()=>changeZoom(zoom+25)}><Plus size={18}/></button></div>
        </div></div>
        <div className="faritany-controls"><p role="status">{online.error || (game.finished ? 'Partie terminée.' : mode==='online' ? (online.busy?'Envoi du coup…':game.turn===onlineColor?'À vous de jouer.':'Au tour de votre adversaire.') : mode==='computer' && game.turn==='red' ? 'L’ordinateur réfléchit…' : `Au tour du joueur ${game.turn==='blue'?'bleu':'rouge'} : placez un point sur une intersection libre.`)}</p><div><button onClick={()=>setOffset({x:0,y:0})} disabled={offset.x===0 && offset.y===0} title="Recentrer la feuille"><RotateCcw size={16}/> Recentrer</button>{mode!=='online' && <button onClick={reset}><RotateCcw size={16}/> Nouvelle partie</button>}{mode!=='online' && !game.finished && <button onClick={finish}><Flag size={16}/> Terminer</button>}</div></div>
      </section>
      <p className="faritany-tip">✦ &nbsp; Reliez vos points horizontalement, verticalement ou en diagonale pour encercler ceux de votre adversaire.</p>
    </main>
    {rules && <div className="modal-backdrop" onClick={()=>setRules(false)}><div className="modal faritany-rules" role="dialog" aria-modal="true" aria-labelledby="faritany-rules-title" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setRules(false)} aria-label="Fermer"><X size={20}/></button><div className="eyebrow">COMMENT JOUER</div><h2 id="faritany-rules-title">Les règles du Faritany</h2><ol><li>À tour de rôle, placez un point sur une intersection libre.</li><li>Vos points voisins se relient horizontalement, verticalement et en diagonale. Une boucle fermée capture les points adverses à l’intérieur.</li><li>Un point capturé reste visible mais ne peut plus former de boucle.</li><li>Le premier à atteindre le score choisi gagne. La grille se prolonge dans toutes les directions.</li></ol><button className="primary-button" onClick={()=>setRules(false)}>C’est compris</button></div></div>}
  </div>;
}
