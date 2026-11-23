import { DominoRoundHands } from './domino-round-hands';
import type { Tile } from './game';

type SummaryPlayer = { name: string; score: number; hand: Tile[] | null };

export function DominoRoundSummary({ players, target, message, champion, blocked }: {
  players: SummaryPlayer[]; target: number; message: string; champion?: string | null; blocked: boolean;
}) {
  const handsAvailable = players.every(player => player.hand !== null);
  return <>
    {handsAvailable ? <DominoRoundHands players={players}/> : <p className="recap-unavailable">Les dominos restants ne sont pas disponibles pour cette manche.</p>}
    <section className="recap-scores" aria-label="Scores de la partie">
      <h3>Scores</h3>
      {players.map((player, index) => <div className="recap-score" key={index}>
        <div className="recap-score-line"><strong>{champion === player.name && '🏆 '}{player.name}</strong><span>{player.score} / {target}</span></div>
        <div className="recap-progress" role="progressbar" aria-label={`Score de ${player.name}`} aria-valuemin={0} aria-valuemax={target} aria-valuenow={Math.min(player.score, target)}><span style={{width:`${Math.min(100, Math.max(0, player.score / target * 100))}%`}}/></div>
      </div>)}
    </section>
    <div className="recap-status">{blocked && <p className="recap-blocked">Manche bloquée</p>}<p className="recap-message">{message}</p>{champion && <p className="recap-champion">🏆 {champion} remporte la partie !</p>}</div>
  </>;
}
