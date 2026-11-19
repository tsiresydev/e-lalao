import { FaritanyGame, Player, placePoint } from './faritany-game';

/** Authoritative move validation. The caller must obtain the player and game
 * from a trusted session and storage, never from the move request. */
export function applyFaritanyMove(game: FaritanyGame, player: Player, x: number, y: number): FaritanyGame {
  if (game.finished) throw new Error('La partie est terminée.');
  if (game.turn !== player) throw new Error('Ce n’est pas votre tour.');
  const next = placePoint(game, x, y);
  if (next === game) throw new Error('Intersection invalide ou occupée.');
  return next;
}
