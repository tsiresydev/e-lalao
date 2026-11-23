import { describe, expect, it } from 'vitest';
import { chooseDominoMove } from './domino-ai';
import { sides, type Game } from './game';

const game: Game = {
  players: [{ name: 'Vous', hand: [], score: 0 }, { name: 'Machine', score: 0, hand: [
    { id:'1-6',a:1,b:6 }, { id:'1-2',a:1,b:2 }, { id:'2-3',a:2,b:3 }, { id:'2-4',a:2,b:4 },
  ] }],
  chain: [{ id:'1-5',a:1,b:5,left:1,right:5 }], turn:1, passes:0, winner:null, message:'', opening:'',
};

describe('ordinateur Domino', () => {
  it('choisit uniquement des coups autorisés à tous les niveaux', () => {
    for (const level of ['easy','medium','hard'] as const) {
      const move=chooseDominoMove(game,level,()=>0)!;
      expect(sides(game,game.players[1].hand.find(tile=>tile.id===move.id)!)).toContain(move.side);
    }
  });
  it('différencie le choix par points et les possibilités restantes', () => {
    expect(chooseDominoMove(game,'medium')?.id).toBe('1-6');
    expect(chooseDominoMove(game,'hard')?.id).toBe('1-2');
  });
  it('passe si aucun coup ne convient et respecte le domino d’ouverture', () => {
    const blocked={...game,chain:[{id:'0-0',a:0,b:0,left:0,right:0}]};
    expect(chooseDominoMove(blocked,'hard')).toBeNull();
    const opening={...game,chain:[],opening:'1-2'};
    expect(chooseDominoMove(opening,'easy',()=>0)).toEqual({id:'1-2',side:'right'});
  });
});
