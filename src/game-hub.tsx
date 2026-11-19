import { ArrowRight, Dice5, Sparkles, Users } from 'lucide-react';
import { Button } from './ui';
import './game-hub.css';

export function GameHub({open}:{open:(game:'domino'|'ludo')=>void}) {
  return <div className="hub">
    <header className="hub-header"><div className="hub-brand"><span className="hub-brand-icon" aria-hidden="true">✳</span><div><strong>KOPAKA</strong><small>LES JEUX QUI RASSEMBLENT</small></div></div><span className="hub-header-note"><span/> Prêt à jouer</span></header>
    <main className="hub-main"><div className="hub-intro"><div className="hub-eyebrow"><Sparkles size={14}/> UN MOMENT À PARTAGER</div><h1>Le plaisir de jouer, <em>ensemble.</em></h1><p>Choisissez votre jeu, invitez vos proches et retrouvez-vous autour d’une même table.</p></div>
      <div className="hub-section-heading"><div><span>À VOUS DE CHOISIR</span><h2>Nos jeux</h2></div><span className="hub-count">2 jeux disponibles</span></div>
      <div className="hub-games">
        <article className="hub-card"><div className="hub-art hub-domino-art" aria-hidden="true"><span className="hub-art-star">✦</span><div className="hub-domino-tile hub-domino-one"><span>••</span><i/><span>•••</span></div><div className="hub-domino-tile hub-domino-two"><span>•••</span><i/><span>••</span></div><span className="hub-art-caption">UN CLASSIQUE INTEMPOREL</span></div><div className="hub-card-body"><div className="hub-card-label">STRATÉGIE · MODE BLOC</div><h3>Dominos</h3><p>Posez vos pièces, anticipez les coups et partagez une partie pleine de stratégie.</p><div className="hub-card-bottom"><span><Users size={15}/> 2 à 4 joueurs</span><Button onClick={()=>open('domino')} aria-label="Jouer aux dominos">Jouer <ArrowRight size={16}/></Button></div></div></article>
        <article className="hub-card"><div className="hub-art hub-ludo-art" aria-hidden="true"><span className="hub-art-star">✦</span><div className="hub-ludo-board"><i/><i/><i/><i/><span>✦</span></div><Dice5 className="hub-dice" size={42}/><span className="hub-art-caption">QUE LA COURSE COMMENCE</span></div><div className="hub-card-body"><div className="hub-card-label">COURSE · MULTIJOUEUR</div><h3>Ludo</h3><p>Lancez le dé et menez vos quatre pions au centre avant vos adversaires.</p><div className="hub-card-bottom"><span><Users size={15}/> 2 à 4 joueurs</span><Button onClick={()=>open('ludo')} aria-label="Jouer au Ludo">Jouer <ArrowRight size={16}/></Button></div></div></article>
      </div><footer className="hub-footer">De beaux jeux, de beaux moments. <span>♥</span></footer>
    </main></div>;
}
