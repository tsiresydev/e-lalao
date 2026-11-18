import { describe, expect, it } from 'vitest';
import { canPlay, newGame, pass, play, sides } from './game';

describe('domino bloc', () => {
  it('distribue les 28 dominos sans doublon à quatre joueurs', () => { const g = newGame(); const tiles = g.players.flatMap(p => p.hand); expect(tiles).toHaveLength(28); expect(new Set(tiles.map(t => t.id)).size).toBe(28); });
  it('impose le plus grand double à l’ouverture', () => { const g = newGame(); expect(g.opening).toBe('6-6'); expect(sides(g, g.players[g.turn].hand.find(t => t.id === '6-6')!)).toEqual(['right']); });
  it('refuse un passage quand un coup est possible', () => { const g = newGame(); expect(canPlay(g)).toBe(true); expect(pass(g)).toBe(g); });
  it('pose le domino initial et passe au joueur suivant', () => { const g = newGame(); const next = play(g, g.opening, 'right'); expect(next.chain).toHaveLength(1); expect(next.players[g.turn].hand).toHaveLength(6); expect(next.turn).toBe((g.turn + 1) % 4); });
});
