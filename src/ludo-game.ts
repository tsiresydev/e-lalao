// Progress: -1 in base, 0..50 on the shared track, 51..55 in the
// home column and 56 at the centre. The server must validate these rules too.
export type LudoPlayer = { name: string; pawns: number[] };
export type LudoGame = {
  players: LudoPlayer[];
  turn: number;
  die: number | null;
  sixes: number;
  winner: number | null;
  message: string;
};

export const LUDO_FINISH = 56;
export const LUDO_SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

export function createLudoGame(names: string[]): LudoGame {
  if (names.length < 2 || names.length > 4) throw new Error('Il faut entre deux et quatre joueurs.');
  return { players: names.map(name => ({ name, pawns: [-1, -1, -1, -1] })), turn: 0, die: null, sixes: 0, winner: null, message: `${names[0]} commence.` };
}

export function trackSquare(player: number, progress: number): number | null {
  return progress >= 0 && progress <= 50 ? (player * 13 + progress) % 52 : null;
}

export function legalLudoPawns(game: LudoGame): number[] {
  if (game.die === null || game.winner !== null) return [];
  return game.players[game.turn].pawns.flatMap((position, i) =>
    position === -1 ? (game.die === 6 ? [i] : []) : position < LUDO_FINISH && position + game.die! <= LUDO_FINISH ? [i] : []);
}

function nextTurn(game: LudoGame, message: string): LudoGame {
  return { ...game, turn: (game.turn + 1) % game.players.length, die: null, sixes: 0, message };
}

export function rollLudo(game: LudoGame, die: number): LudoGame {
  if (game.winner !== null || game.die !== null || !Number.isInteger(die) || die < 1 || die > 6) return game;
  const player = game.players[game.turn];
  const sixes = die === 6 ? game.sixes + 1 : 0;
  if (sixes === 3) return nextTurn(game, `${player.name} obtient trois 6 : son tour est terminé.`);
  const rolled = { ...game, die, sixes, message: `${player.name} obtient ${die}.` };
  if (legalLudoPawns(rolled).length) return rolled;
  if (die === 6) return { ...rolled, die: null, message: `${player.name} ne peut pas jouer et relance.` };
  return nextTurn(rolled, `${player.name} ne peut pas jouer.`);
}

export function moveLudo(game: LudoGame, pawn: number): LudoGame {
  if (!legalLudoPawns(game).includes(pawn) || game.die === null) return game;
  const die = game.die, player = game.turn;
  const players = game.players.map(p => ({ ...p, pawns: [...p.pawns] }));
  const previous = players[player].pawns[pawn];
  const destination = previous === -1 ? 0 : previous + die;
  players[player].pawns[pawn] = destination;
  const square = trackSquare(player, destination);
  let captured = false;
  if (square !== null && !LUDO_SAFE.has(square)) {
    players.forEach((opponent, seat) => {
      if (seat === player) return;
      opponent.pawns.forEach((position, index) => {
        if (trackSquare(seat, position) === square) { opponent.pawns[index] = -1; captured = true; }
      });
    });
  }
  const winner = players[player].pawns.every(position => position === LUDO_FINISH) ? player : null;
  const moved = { ...game, players, winner, die: null, message: winner !== null ? `${players[player].name} remporte la partie !` : captured ? `${players[player].name} capture un pion et rejoue !` : `${players[player].name} avance un pion.` };
  if (winner !== null) return moved;
  return die === 6 || captured ? moved : nextTurn(moved, moved.message);
}
