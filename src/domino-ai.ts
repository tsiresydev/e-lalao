import { sides, type Game } from './game';

export type DominoDifficulty = 'easy' | 'medium' | 'hard';
export type DominoMove = { id: string; side: 'left' | 'right' };

/** Uses only the computer's hand and the public board, never opponents' hands. */
export function chooseDominoMove(game: Game, difficulty: DominoDifficulty, random = Math.random): DominoMove | null {
  if (game.winner !== null) return null;
  const hand = game.players[game.turn]?.hand ?? [];
  const moves = hand.flatMap(tile => sides(game, tile).map(side => ({ id: tile.id, side, tile })));
  if (!moves.length) return null;
  if (difficulty === 'easy') {
    const move = moves[Math.min(moves.length - 1, Math.floor(random() * moves.length))];
    return { id: move.id, side: move.side };
  }
  const score = (move: typeof moves[number]) => {
    const points = move.tile.a + move.tile.b;
    if (difficulty === 'medium') return points;
    const remaining = hand.filter(tile => tile.id !== move.id);
    const oldLeft = game.chain[0]?.left, oldRight = game.chain[game.chain.length - 1]?.right;
    const left = oldLeft === undefined ? move.tile.a : move.side === 'left' ? (move.tile.a === oldLeft ? move.tile.b : move.tile.a) : oldLeft;
    const right = oldRight === undefined ? move.tile.b : move.side === 'right' ? (move.tile.a === oldRight ? move.tile.b : move.tile.a) : oldRight;
    const options = remaining.filter(tile => tile.a === left || tile.b === left || tile.a === right || tile.b === right).length;
    return points + options * 4;
  };
  const best = moves.reduce((current, move) => score(move) > score(current) ? move : current);
  return { id: best.id, side: best.side };
}
