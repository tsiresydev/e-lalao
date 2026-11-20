import { describe, expect, it } from 'vitest';
import { newFaritany } from './faritany-game';
import { applyFaritanyMove } from './faritany-server-game';

describe('validation des coups Faritany', () => {
  it('accepte un coup légal et alterne le tour', () => {
    const game = applyFaritanyMove(newFaritany(), 'blue', 2, 3);
    expect(game.turn).toBe('red');
    expect(game.points).toEqual([{ x: 2, y: 3, player: 'blue', captured: false }]);
  });

  it('refuse un joueur hors tour et une intersection occupée', () => {
    const game = applyFaritanyMove(newFaritany(), 'blue', 2, 3);
    expect(() => applyFaritanyMove(game, 'blue', 3, 3)).toThrow('tour');
    expect(() => applyFaritanyMove(game, 'red', 2, 3)).toThrow('occupée');
    expect(() => applyFaritanyMove(game, 'red', 1_000_001, 3)).toThrow('invalide');
  });

  it('refuse les coups après la fin de partie', () => {
    expect(() => applyFaritanyMove({ ...newFaritany(), finished: true }, 'blue', 1, 1)).toThrow('terminée');
  });
});
