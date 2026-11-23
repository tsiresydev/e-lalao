import { Stage, Layer } from 'react-konva';
import { Domino } from './domino-view';
import type { Tile } from './game';

export function DominoRoundHands({ players }: { players: { name: string; hand: Tile[] | null }[] }) {
  if (players.some(player => player.hand === null)) return null;
  return <section className="domino-round-hands" aria-label="Dominos restants">
    <h3>Dominos restants</h3>
    {players.map((player, index) => <div className="domino-round-hand" key={index}>
      <strong>{player.name} · {player.hand!.reduce((sum, tile) => sum + tile.a + tile.b, 0)} pts en main</strong>
      <div className="domino-round-tiles">{player.hand!.length ? player.hand!.map(tile => <span key={tile.id} role="img" aria-label={`Domino ${tile.a} et ${tile.b}`}><Stage width={38} height={70}><Layer><Domino tile={tile} x={3} y={3}/></Layer></Stage></span>) : <span className="recap-empty">Aucun domino</span>}</div>
    </div>)}
  </section>;
}
