import { describe, expect, it } from 'vitest';
import { canPlay, newGame, pass, play, sides, type Game, type Placed, type Tile } from './game';

describe('domino bloc', () => {
  it('distribue les 28 dominos sans doublon à quatre joueurs', () => { const g = newGame(); const tiles = g.players.flatMap(p => p.hand); expect(tiles).toHaveLength(28); expect(new Set(tiles.map(t => t.id)).size).toBe(28); });
  it('distribue correctement les dominos à deux et trois joueurs', () => {
    expect(newGame(['Vous','Adversaire']).players.map(p => p.hand.length)).toEqual([7,7]);
    expect(newGame(['Vous','A','B']).players.map(p => p.hand.length)).toEqual([6,6,6]);
  });
  it('impose le plus grand double à l’ouverture', () => { const g = newGame(); expect(g.opening).toBe('6-6'); expect(sides(g, g.players[g.turn].hand.find(t => t.id === '6-6')!)).toEqual(['right']); });
  it('refuse un passage quand un coup est possible', () => { const g = newGame(); expect(canPlay(g)).toBe(true); expect(pass(g)).toBe(g); });
  it('pose le domino initial et passe au joueur suivant', () => { const g = newGame(); const next = play(g, g.opening, 'right'); expect(next.chain).toHaveLength(1); expect(next.players[g.turn].hand).toHaveLength(6); expect(next.turn).toBe((g.turn + 1) % 4); });
  it('permet de poser n’importe quel domino à l’ouverture des manches suivantes', () => {
    const tile:Tile={id:'1-2',a:1,b:2};
    const game:Game={...newGame(['Vous','Adversaire']),turn:0,winner:null,chain:[],opening:'',players:[{name:'Vous',score:0,hand:[tile,{id:'3-4',a:3,b:4}]},{name:'Adversaire',score:0,hand:[]}]};
    expect(sides(game,tile)).toEqual(['right']);
    expect(play(game,tile.id,'right').chain[0]).toMatchObject({id:'1-2',left:1,right:2});
  });
  it('laisse choisir les deux extrémités lorsque la pièce sélectionnée correspond aux deux', () => {
    const tile:Tile={id:'1-3',a:1,b:3};
    const chain:Placed[]=[[1,2],[2,6],[6,0],[0,4],[4,1]].map(([left,right])=>({id:`${left}-${right}`,a:left,b:right,left,right}));
    const game:Game={...newGame(['Vous','Adversaire']),turn:0,winner:null,chain,players:[{name:'Vous',score:0,hand:[{id:'2-6',a:2,b:6},tile,{id:'2-3',a:2,b:3}]},{name:'Adversaire',score:0,hand:[{id:'0-0',a:0,b:0}]}]};
    expect(sides(game,tile)).toEqual(['left','right']);
    expect(play(game,tile.id,'left').chain[0]).toMatchObject({id:'1-3',left:3,right:1});
    expect(play(game,tile.id,'right').chain.slice(-1)[0]).toMatchObject({id:'1-3',left:1,right:3});
    expect(game.players[0].hand).toHaveLength(3);
  });
});
