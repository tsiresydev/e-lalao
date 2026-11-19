import { useEffect, useState } from 'react';
import { ArrowLeft, CircleHelp, Flag, RotateCcw, X } from 'lucide-react';
import { computerMove, newFaritany, placePoint, score } from './faritany-game';
import './faritany.css';
import { FaritanyLobby, useFaritanyOnline } from './faritany-online';

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
  const blue=score(game,'blue'), red=score(game,'red');
  const winner=blue===red ? 'Égalité !' : `${blue>red?'Bleu':'Rouge'} remporte la partie !`;
  useEffect(()=>{if(mode!=='computer' || game.finished || game.turn!=='red')return;const timer=window.setTimeout(()=>setGame(current=>{if(current.finished || current.turn!=='red')return current;const move=computerMove(current);return move ? placePoint(current,move.x,move.y) : current;}),450);return ()=>window.clearTimeout(timer);},[game,mode]);
  const play=(x:number,y:number)=>{if(mode==='online'){if(onlineRoom?.status==='playing' && onlineRoom.game.turn===onlineColor && !online.busy)void online.move(x,y);return;}if(mode==='computer' && game.turn==='red')return;setFocus({x,y});setGame(current=>placePoint(current,x,y));};
  const reset=()=>{if(game.points.length && !window.confirm('Commencer une nouvelle partie ?'))return;setMode(null);setGame(newFaritany(15,target));setFocus({x:7,y:7});};
  const finish=()=>{if(window.confirm('Terminer la partie et compter les points capturés ?'))setGame(current=>({...current,finished:true}));};
  const margin=20, step=30, extent=(game.size-1)*step, size=extent+margin*2;
  if(!mode)return <div className="faritany-setup-page"><header className="faritany-header"><button onClick={()=>{if(mode==='online'){if(window.confirm('Quitter annule la partie. Continuer ?'))void online.leave().then(ok=>{if(ok)setMode(null);});}else back();}}><ArrowLeft size={18}/> <span>{mode==='online'?'Quitter le salon':'Tous les jeux'}</span></button><strong>KOPAKA <span>/ FARITANY</span></strong><button onClick={()=>setRules(true)} aria-label="Règles"><CircleHelp size={20}/></button></header><main className="faritany-setup"><span>LE JEU DES TERRITOIRES</span><h1>Jouer au Faritany<span>.</span></h1><p>Choisissez votre objectif et votre adversaire.</p><label htmlFor="faritany-target">POINTS À CAPTURER POUR GAGNER</label><select id="faritany-target" value={target} onChange={e=>setTarget(Number(e.target.value))}>{[5,10,15,20,30].map(n=><option key={n} value={n}>{n} points</option>)}</select><div className="faritany-modes"><button onClick={()=>{setGame(newFaritany(15,target));setMode('computer');}}><strong>Contre l’ordinateur</strong><small>Affrontez la machine sur cet appareil.</small></button><button onClick={()=>{setGame(newFaritany(15,target));setMode('local');}}><strong>À deux sur cet appareil</strong><small>Jouez chacun votre tour sur la même grille.</small></button><button onClick={()=>{setMode('online');const saved=sessionStorage.getItem('faritany-room');if(saved)void online.refresh(saved);}}><strong>Entre amis en ligne</strong><small>Salon priv? ? deux joueurs.</small></button></div>{rules && <div className="modal-backdrop" onClick={()=>setRules(false)}><div className="modal faritany-rules" role="dialog" aria-modal="true" aria-label="Règles du Faritany" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setRules(false)} aria-label="Fermer"><X size={20}/></button><h2>Les règles du Faritany</h2><p>Placez vos points à tour de rôle. Entourez des points adverses avec les vôtres pour les capturer. Le premier à atteindre le score choisi gagne.</p><button className="primary-button" onClick={()=>setRules(false)}>C’est compris</button></div></div>}</main></div>;
  if(mode==='online' && (!onlineRoom || onlineRoom.status==='waiting'))return <FaritanyLobby online={online} target={target} onBack={()=>void online.leave().then(ok=>{if(ok)setMode(null);})}/>;
  return <div className="faritany-page">
    <header className="faritany-header"><button onClick={back}><ArrowLeft size={18}/> <span>Tous les jeux</span></button><strong>KOPAKA <span>/ FARITANY</span></strong><button onClick={()=>setRules(true)} aria-label="Règles du Faritany"><CircleHelp size={20}/></button></header>
    <main className="faritany-main">
      <div className="faritany-intro"><div><span>UN JEU DE STRATÉGIE MALGACHE</span><h1>Faritany<span>.</span></h1><p>Entourez les points adverses pour conquérir votre territoire.</p></div><div className="faritany-local">● &nbsp; 2 JOUEURS · SUR CET APPAREIL</div></div>
      <section className="faritany-card" aria-label="Partie de Faritany">
        <div className="faritany-scorebar"><div className={`faritany-player blue ${!game.finished && game.turn==='blue'?'active':''}`}><i/><div><strong>{mode==='online'?(onlineRoom?.players.find(p=>p.seat===0)?.name ?? 'Joueur bleu'):'Joueur bleu'}</strong><small>{!game.finished && game.turn==='blue'?'À VOUS DE JOUER':`OBJECTIF : ${game.target} POINTS`}</small></div><b>{blue}</b></div><div className="faritany-versus">VS</div><div className={`faritany-player red ${!game.finished && game.turn==='red'?'active':''}`}><i/><div><strong>{mode==='online'?(onlineRoom?.players.find(p=>p.seat===1)?.name ?? 'Joueur rouge'):mode==='computer'?'Ordinateur':'Joueur rouge'}</strong><small>{!game.finished && game.turn==='red'?(mode==='computer'?'RÉFLÉCHIT':'À VOUS DE JOUER'):`OBJECTIF : ${game.target} POINTS`}</small></div><b>{red}</b></div></div>
        <div className="faritany-board-wrap"><div className="faritany-board">
          <svg viewBox={`0 0 ${size} ${size}`} role="grid" tabIndex={0} aria-label="Grille Faritany. Utilisez les flèches puis Entrée pour placer un point." onKeyDown={event=>{let {x,y}=focus;if(event.key==='ArrowLeft')x--;else if(event.key==='ArrowRight')x++;else if(event.key==='ArrowUp')y--;else if(event.key==='ArrowDown')y++;else if(event.key==='Enter' || event.key===' '){event.preventDefault();play(x,y);return;}else return;event.preventDefault();setFocus({x:Math.max(0,Math.min(game.size-1,x)),y:Math.max(0,Math.min(game.size-1,y))});}}>
            <rect width={size} height={size} fill="#fffefa"/>
            {Array.from({length:game.size},(_,i)=><g key={i}><line x1={margin+i*step} y1={margin} x2={margin+i*step} y2={margin+extent}/><line x1={margin} y1={margin+i*step} x2={margin+extent} y2={margin+i*step}/></g>)}
            {game.territories.map((territory,i)=><polygon key={i} className={`faritany-territory ${territory.player}`} points={territory.path.map(p=>`${margin+p.x*step},${margin+p.y*step}`).join(' ')}/>)}
            {game.points.map(p=><g key={`${p.x},${p.y}`}><circle className={`faritany-dot ${p.player} ${p.captured?'captured':''}`} cx={margin+p.x*step} cy={margin+p.y*step} r={p.captured?4:5}/>{p.captured && <circle className="faritany-captured-ring" cx={margin+p.x*step} cy={margin+p.y*step} r={7}/>}</g>)}
            <circle className="faritany-focus" cx={margin+focus.x*step} cy={margin+focus.y*step} r={10}/>
            {Array.from({length:game.size*game.size},(_,i)=>{const x=i%game.size,y=Math.floor(i/game.size);return <rect key={i} x={margin+x*step-step/2} y={margin+y*step-step/2} width={step} height={step} fill="transparent" className={game.finished || game.points.some(p=>p.x===x && p.y===y)?'unavailable':'intersection'} onClick={()=>play(x,y)}/>;})}
          </svg>
          {game.finished && <div className="faritany-result" role="status"><span>PARTIE TERMINÉE</span><strong>{winner}</strong><small>{blue} bleu · {red} rouge</small></div>}
        </div></div>
        <div className="faritany-controls"><p role="status">{online.error || (game.finished ? 'Partie terminée.' : mode==='online' ? (online.busy?'Envoi du coup…':game.turn===onlineColor?'À vous de jouer.':'Au tour de votre adversaire.') : mode==='computer' && game.turn==='red' ? 'L’ordinateur réfléchit…' : `Au tour du joueur ${game.turn==='blue'?'bleu':'rouge'} : placez un point sur une intersection libre.`)}</p><div>{mode!=='online' && <button onClick={reset}><RotateCcw size={16}/> Nouvelle partie</button>}{mode!=='online' && !game.finished && <button onClick={finish}><Flag size={16}/> Terminer</button>}</div></div>
      </section>
      <p className="faritany-tip">✦ &nbsp; Reliez vos points horizontalement, verticalement ou en diagonale pour encercler ceux de votre adversaire.</p>
    </main>
    {rules && <div className="modal-backdrop" onClick={()=>setRules(false)}><div className="modal faritany-rules" role="dialog" aria-modal="true" aria-labelledby="faritany-rules-title" onClick={e=>e.stopPropagation()}><button className="modal-close" onClick={()=>setRules(false)} aria-label="Fermer"><X size={20}/></button><div className="eyebrow">COMMENT JOUER</div><h2 id="faritany-rules-title">Les règles du Faritany</h2><ol><li>À tour de rôle, placez un point sur une intersection libre.</li><li>Vos points voisins se relient horizontalement, verticalement et en diagonale. Une boucle fermée capture les points adverses à l’intérieur.</li><li>Un point capturé reste visible mais ne peut plus former de boucle.</li><li>Le premier à atteindre le score choisi gagne. Si la grille est pleine avant, elle s’agrandit automatiquement.</li></ol><button className="primary-button" onClick={()=>setRules(false)}>C’est compris</button></div></div>}
  </div>;
}
