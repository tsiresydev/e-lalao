export type Tile = { id: string; a: number; b: number };
export type Placed = Tile & { left: number; right: number };
export type Player = { name: string; hand: Tile[]; score: number };
export type Game = { players: Player[]; chain: Placed[]; turn: number; passes: number; winner: number | null; message: string; opening: string };

export function newGame(names = ['Vous', 'Léon', 'Camille', 'Sacha']): Game {
  const deck: Tile[] = [];
  for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) deck.push({ id: `${a}-${b}`, a, b });
  for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [deck[i], deck[j]] = [deck[j], deck[i]]; }
  const count = 7;
  const players = names.map(name => ({ name, hand: deck.splice(0, count), score: 0 }));
  // If no double was dealt, the highest tile opens instead.
  const all = players.flatMap((p, index) => p.hand.map(tile => ({ tile, index })));
  const doubles = all.filter(x => x.tile.a === x.tile.b);
  const starter = (doubles.length ? doubles : all).sort((x, y) => (y.tile.a + y.tile.b) - (x.tile.a + x.tile.b))[0];
  return { players, chain: [], turn: starter.index, passes: 0, winner: null, message: `${players[starter.index].name} commence avec le plus grand double.`, opening: starter.tile.id };
}
export function sides(game: Game, tile: Tile): ('left' | 'right')[] {
  if (!game.chain.length) return !game.opening || tile.id === game.opening ? ['right'] : [];
  const left = game.chain[0].left, right = game.chain[game.chain.length - 1].right;
  return [...(tile.a === left || tile.b === left ? ['left' as const] : []), ...(tile.a === right || tile.b === right ? ['right' as const] : [])];
}
export function canPlay(game: Game, player = game.turn) { return game.players[player].hand.some(t => sides(game, t).length); }
export function play(game: Game, id: string, side: 'left' | 'right'): Game {
  if (game.winner !== null) return game;
  const player = game.players[game.turn], tile = player.hand.find(t => t.id === id);
  if (!tile || !sides(game, tile).includes(side)) return game;
  let placed: Placed;
  if (!game.chain.length) placed = { ...tile, left: tile.a, right: tile.b };
  else if (side === 'left') { const end = game.chain[0].left; placed = { ...tile, left: tile.a === end ? tile.b : tile.a, right: end }; }
  else { const end = game.chain[game.chain.length - 1].right; placed = { ...tile, left: end, right: tile.a === end ? tile.b : tile.a }; }
  const players = game.players.map((p, i) => i === game.turn ? { ...p, hand: p.hand.filter(t => t.id !== id) } : p);
  const chain = side === 'left' ? [placed, ...game.chain] : [...game.chain, placed];
  const won = players[game.turn].hand.length === 0;
  if (won) players[game.turn] = { ...players[game.turn], score: players[game.turn].score + players.reduce((sum, p) => sum + p.hand.reduce((s, t) => s + t.a + t.b, 0), 0) };
  return { ...game, players, chain, passes: 0, winner: won ? game.turn : null, turn: won ? game.turn : (game.turn + 1) % players.length, message: won ? `${player.name} remporte la manche !` : `${player.name} a posé ${tile.a} · ${tile.b}.` };
}
export function pass(game: Game): Game {
  if (game.winner !== null || canPlay(game)) return game;
  const passes = game.passes + 1;
  if (passes >= game.players.length) {
    const totals = game.players.map(p => p.hand.reduce((sum, t) => sum + t.a + t.b, 0));
    const lowest = Math.min(...totals), winners = totals.map((n, i) => n === lowest ? i : -1).filter(i => i >= 0);
    const players = game.players.map((p, i) => i === winners[0] && winners.length === 1 ? { ...p, score: p.score + totals.reduce((a, b) => a + b, 0) - totals[i] } : p);
    return { ...game, players, passes, winner: winners[0], message: winners.length > 1 ? `Partie bloquée : égalité entre ${winners.map(i => players[i].name).join(' et ')}.` : `Partie bloquée : ${players[winners[0]].name} gagne avec ${lowest} points en main.` };
  }
  return { ...game, passes, turn: (game.turn + 1) % game.players.length, message: `${game.players[game.turn].name} passe son tour.` };
}
