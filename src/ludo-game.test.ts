import { describe, expect, it } from 'vitest';
import { createLudoGame, legalLudoPawns, moveLudo, rollLudo } from './ludo-game';

describe('règles du Ludo', () => {
  it('exige un 6 pour sortir et donne un lancer supplémentaire', () => {
    const game = createLudoGame(['A', 'B']);
    expect(rollLudo(game, 3).turn).toBe(1);
    const rolled = rollLudo(game, 6);
    expect(legalLudoPawns(rolled)).toEqual([0, 1, 2, 3]);
    const moved = moveLudo(rolled, 0);
    expect(moved.players[0].pawns[0]).toBe(0);
    expect(moved.turn).toBe(0);
    expect(moved.die).toBeNull();
  });

  it('annule le troisième 6 sans annuler les déplacements précédents', () => {
    let game = createLudoGame(['A', 'B']);
    game = moveLudo(rollLudo(game, 6), 0);
    game = moveLudo(rollLudo(game, 6), 0);
    game = rollLudo(game, 6);
    expect(game.turn).toBe(1);
    expect(game.players[0].pawns[0]).toBe(6);
  });

  it('capture sur une case non protégée et donne un seul tour bonus', () => {
    const game = createLudoGame(['A', 'B']);
    game.players[0].pawns[0] = 14;
    game.players[1].pawns[0] = 3; // case 16
    const moved = moveLudo(rollLudo(game, 2), 0);
    expect(moved.players[1].pawns[0]).toBe(-1);
    expect(moved.turn).toBe(0);
  });

  it('protège les cases étoile et demande un compte exact', () => {
    const game = createLudoGame(['A', 'B']);
    game.players[0].pawns[0] = 7;
    game.players[1].pawns[0] = 47; // case 8
    expect(moveLudo(rollLudo(game, 1), 0).players[1].pawns[0]).toBe(47);
    game.players[0].pawns = [55, 56, 56, 56];
    expect(rollLudo(game, 2).turn).toBe(1);
    expect(moveLudo(rollLudo(game, 1), 0).winner).toBe(0);
  });
});
