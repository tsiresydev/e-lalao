import { describe, expect, it } from 'vitest';
import { computerMove, FaritanyGame, newFaritany, placePoint, score } from './faritany-game';

describe('Faritany',()=>{
  it('alterne les joueurs et refuse les cases occupées ou hors grille',()=>{
    const first=placePoint(newFaritany(5),1,1);
    expect(first.turn).toBe('red');
    expect(placePoint(first,1,1)).toBe(first);
    expect(placePoint(first,5,0).points).toHaveLength(2);
  });
  it('capture un point adverse dans une boucle diagonale',()=>{
    const game:FaritanyGame={...newFaritany(5),points:[
      {x:1,y:2,player:'blue',captured:false},{x:2,y:1,player:'blue',captured:false},
      {x:3,y:2,player:'blue',captured:false},{x:2,y:2,player:'red',captured:false},
    ]};
    const next=placePoint(game,2,3);
    expect(next.points.find(p=>p.player==='red')?.captured).toBe(true);
    expect(score(next,'blue')).toBe(1);
    expect(next.territories).toHaveLength(1);
    expect(game.points[3].captured).toBe(false);
  });
  it('ne capture pas avec une boucle ouverte ou sans point adverse',()=>{
    const game:FaritanyGame={...newFaritany(5),points:[
      {x:1,y:2,player:'blue',captured:false},{x:2,y:1,player:'blue',captured:false},
      {x:2,y:2,player:'red',captured:false},
    ]};
    expect(score(placePoint(game,0,0),'blue')).toBe(0);
    const empty:FaritanyGame={...game,points:game.points.filter(p=>p.player==='blue').concat({x:3,y:2,player:'blue',captured:false})};
    expect(placePoint(empty,2,3).territories).toHaveLength(0);
  });
  it('ne réutilise pas un point capturé pour fermer une boucle',()=>{
    const game:FaritanyGame={...newFaritany(5),points:[
      {x:1,y:2,player:'blue',captured:true},{x:2,y:1,player:'blue',captured:false},
      {x:3,y:2,player:'blue',captured:false},{x:2,y:2,player:'red',captured:false},
    ]};
    const next=placePoint(game,2,3);
    expect(next.points.find(p=>p.player==='red')?.captured).toBe(false);
  });
  it('capture plusieurs points dans un territoire et ne les recompte pas',()=>{
    const border=[[1,1],[2,1],[3,1],[4,1],[4,2],[4,3],[3,3],[2,3],[1,3]];
    const game:FaritanyGame={...newFaritany(7),points:[
      ...border.map(([x,y])=>({x,y,player:'blue' as const,captured:false})),
      {x:2,y:2,player:'red',captured:false},{x:3,y:2,player:'red',captured:false},
    ]};
    const next=placePoint(game,1,2);
    expect(score(next,'blue')).toBe(2);
    expect(next.territories).toHaveLength(1);
    const after=placePoint({...next,turn:'blue'},6,6);
    expect(score(after,'blue')).toBe(2);
    expect(after.territories).toHaveLength(1);
  });
  it('agrandit la grille quand elle est pleine sans atteindre le score cible',()=>{
    let game=newFaritany(2);
    for(const [x,y] of [[0,0],[1,0],[0,1],[1,1]])game=placePoint(game,x,y);
    expect(game.finished).toBe(false);
    expect(game.size).toBe(7);
    expect(placePoint(game,2,0).points).toHaveLength(5);
  });
  it('termine dès que le score cible est atteint',()=>{
    const game:FaritanyGame={...newFaritany(5,1),points:[{x:1,y:2,player:'blue',captured:false},{x:2,y:1,player:'blue',captured:false},{x:3,y:2,player:'blue',captured:false},{x:2,y:2,player:'red',captured:false}]};
    expect(placePoint(game,2,3).finished).toBe(true);
  });
  it('choisit une intersection libre pour l’ordinateur',()=>{
    const game=placePoint(newFaritany(5),2,2);
    const move=computerMove(game)!;
    expect(move).not.toEqual({x:2,y:2});
    expect(placePoint(game,move.x,move.y).points).toHaveLength(2);
    expect(computerMove({...game,finished:true})).toBeNull();
  });
  it('permet de jouer et de capturer au-delà de la grille initiale',()=>{
    const game:FaritanyGame={...newFaritany(5),points:[
      {x:-2,y:-1,player:'blue',captured:false},{x:-1,y:-2,player:'blue',captured:false},
      {x:0,y:-1,player:'blue',captured:false},{x:-1,y:-1,player:'red',captured:false},
    ]};
    const next=placePoint(game,-1,0);
    expect(score(next,'blue')).toBe(1);
    expect(next.territories).toHaveLength(1);
    expect(placePoint(next,1_000_001,0)).toBe(next);
  });
});
