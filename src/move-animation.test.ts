import { describe, expect, it } from 'vitest';
import { dominoArrivalAngle, matchesDominoLabel } from './move-animation';

describe('repérage de la pièce à animer', () => {
  it('reconnaît aussi le libellé du domino en attente du choix de côté', () => {
    expect(matchesDominoLabel('Domino 2 et 4', 2, 4)).toBe(true);
    expect(matchesDominoLabel('Domino 2 et 4, choisissez une extrémité sur le plateau', 2, 4)).toBe(true);
  });
  it('ne confond pas des valeurs ou des libellés différents', () => {
    expect(matchesDominoLabel('Domino 2 et 40', 2, 4)).toBe(false);
    expect(matchesDominoLabel('Domino 4 et 2', 2, 4)).toBe(false);
    expect(matchesDominoLabel(null, 2, 4)).toBe(false);
  });
});

describe('orientation de la pièce à son arrivée', () => {
  it('place la bonne valeur à la première extrémité', () => {
    expect(dominoArrivalAngle(2, 5, 2, true)).toBe(-90);
    expect(dominoArrivalAngle(2, 5, 5, true)).toBe(90);
    expect(dominoArrivalAngle(2, 5, 2, false)).toBe(0);
    expect(dominoArrivalAngle(2, 5, 5, false)).toBe(180);
  });
});
