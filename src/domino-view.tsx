import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { Circle, Group, Layer, Line, Rect, Stage, Text } from 'react-konva';
import Konva from 'konva';
import { sides, type Game, type Tile } from './game';
import { finishMoveAnimation, prepareOpponentAnimation } from './move-animation';
import { audio } from './audio';

const positions: Record<number, [number, number][]> = {
  0: [], 1: [[.5, .5]], 2: [[.25, .25], [.75, .75]], 3: [[.25, .25], [.5, .5], [.75, .75]],
  4: [[.25, .25], [.75, .25], [.25, .75], [.75, .75]],
  5: [[.25, .25], [.75, .25], [.5, .5], [.25, .75], [.75, .75]],
  6: [[.25, .2], [.75, .2], [.25, .5], [.75, .5], [.25, .8], [.75, .8]],
};

const INK = '#17231f';
const GOLD = '#d8b46a';

export function Domino({ tile, x, y, horizontal = false, selected = false, awaitingSide = false, onClick, scale = 1, animate = false, hidden = false }: {
  tile: { a: number; b: number }; x: number; y: number; horizontal?: boolean; selected?: boolean;
  awaitingSide?: boolean; onClick?: () => void; scale?: number; animate?: boolean; hidden?: boolean;
}) {
  const group = useRef<Konva.Group>(null);
  useEffect(() => {
    if (animate && group.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const node = group.current;
      node.opacity(0.65);
      node.to({ opacity: 1, duration: 0.12, easing: Konva.Easings.EaseOut });
    }
  }, [animate]);

  const w = horizontal ? 64 : 32, h = horizontal ? 32 : 64;
  return <Group ref={group} x={x} y={y} scaleX={scale} scaleY={scale} visible={!hidden} onClick={onClick} onTap={onClick}
    onMouseEnter={e => { if (onClick) e.target.getStage()!.container().style.cursor = 'pointer'; }}
    onMouseLeave={e => { e.target.getStage()!.container().style.cursor = 'default'; }}>
    <Rect y={2} width={w} height={h} cornerRadius={4} fill="#0c2b28" opacity={0.28} shadowColor="#001b1d" shadowBlur={5} shadowOffsetY={3}/>
    <Rect width={w} height={h} cornerRadius={4} fillLinearGradientStartPoint={{ x: 0, y: 0 }}
      fillLinearGradientEndPoint={{ x: w, y: h }} fillLinearGradientColorStops={[0, '#fffefa', 1, '#efece2']}
      stroke={selected ? GOLD : '#c8ceca'} strokeWidth={selected ? 2 : 0.8}/>
    <Rect x={1.5} y={1.5} width={w - 3} height={h - 3} cornerRadius={3} stroke="#ffffff" opacity={0.45} strokeWidth={0.6} listening={false}/>
    <Line points={horizontal ? [32, 4, 32, 28] : [4, 32, 28, 32]} stroke="#3b423d" strokeWidth={0.8} listening={false}/>
    {[tile.a, tile.b].map((n, half) => positions[n].map(([px, py], i) => <Circle key={`${half}-${i}`}
      x={horizontal ? half * 32 + (n === 6 ? py : px) * 32 : px * 32}
      y={horizontal ? (n === 6 ? px : py) * 32 : half * 32 + py * 32}
      radius={2.8} fill={INK} listening={false}/>))}
    {awaitingSide && <>
      <Circle x={w / 2} y={h / 2} radius={9} fill={GOLD} stroke="#fffdf5" strokeWidth={1.5} shadowColor="#3b2a00" shadowBlur={4} shadowOpacity={0.5} listening={false}/>
      <Text text="↔" x={w / 2 - 8} y={h / 2 - 6} width={16} align="center" fontSize={11} fontStyle="bold" fill="#2b210c" listening={false}/>
    </>}
  </Group>;
}

export function DominoBoard({ game, selected, choose, availableHand = [] }: {
  game: Game; selected: string | null; choose: (side: 'left' | 'right') => void; availableHand?: Tile[];
}) {
  const ref = useRef<HTMLDivElement>(null), [width, setWidth] = useState(800);
  const [availableHeight, setAvailableHeight] = useState(0), [viewportHeight, setViewportHeight] = useState(window.innerHeight);
  const [movingTile, setMovingTile] = useState<string | null>(null);
  const previous = useRef({ chain: game.chain, turn: game.turn, hasHand: availableHand.length > 0 });

  useEffect(() => {
    const observer = new ResizeObserver(([entry]) => {
      setWidth(entry.contentRect.width);
      setAvailableHeight(entry.target.closest('.playing-view, .table-focus') ? entry.contentRect.height : 0);
    });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const resize = () => setViewportHeight(window.innerHeight);
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  const handWidth = ref.current?.closest('.game-column, .online-layout > section')?.clientWidth ?? window.innerWidth;
  const height = availableHeight > 0 ? availableHeight : Math.max(120, Math.min(250, viewportHeight * 0.35));
  const preferredScale = Math.min(1.55, viewportHeight <= 480 ? 0.8 : 1.55, Math.max(0.3, (handWidth - 32) * 1.12 / (7 * 48)));
  const boardWidth = Math.max(180, (width - 28) / preferredScale), gap = 2, rowHeight = 66;

  let cursor = 0, row = 0, direction = 1;
  const placements = game.chain.map((tile, i) => {
    const isDouble = tile.left === tile.right;
    const horizontalWidth = isDouble ? 32 : 64;
    const remaining = direction === 1 ? boardWidth - cursor : cursor;
    // Reserve room for a vertical corner tile whenever the chain continues.
    const corner = i < game.chain.length - 1 && remaining < horizontalWidth + 66;
    if (corner) {
      const cornerWidth = isDouble ? 64 : 32;
      const x = direction === 1 ? cursor : cursor - cornerWidth;
      const result = { tile, x, y: row * rowHeight + 17, horizontal: isDouble, reversed: false };
      cursor = direction === 1 ? x - gap : x + cornerWidth + gap;
      direction *= -1; row++;
      return result;
    }
    const x = direction === 1 ? cursor : cursor - horizontalWidth;
    const result = { tile, x, y: row * rowHeight + (isDouble ? -16 : 0), horizontal: !isDouble, reversed: direction === -1 };
    cursor += direction * (horizontalWidth + gap);
    return result;
  });

  const minX = Math.min(0, ...placements.map(p => p.x)), maxX = Math.max(0, ...placements.map(p => p.x + (p.horizontal ? 64 : 32)));
  const minY = Math.min(0, ...placements.map(p => p.y)), maxY = Math.max(64, ...placements.map(p => p.y + (p.horizontal ? 32 : 64)));
  const contentWidth = Math.max(64, maxX - minX), contentHeight = Math.max(64, maxY - minY);
  const canvasWidth = width, canvasHeight = height;
  const tileScale = Math.min(preferredScale, Math.max(1, width - 28) / contentWidth, Math.max(1, height - 28) / contentHeight);
  const offsetX = (canvasWidth - contentWidth * tileScale) / 2 - minX * tileScale;
  const offsetY = (canvasHeight - contentHeight * tileScale) / 2 - minY * tileScale;

  useLayoutEffect(() => {
    const container = ref.current?.closest<HTMLElement>('.game-column, .online-layout > section');
    container?.style.setProperty('--hand-domino-scale', String(tileScale / 1.12));
    container?.style.setProperty('--board-domino-scale', String(tileScale));
    return () => { container?.style.removeProperty('--hand-domino-scale'); container?.style.removeProperty('--board-domino-scale'); };
  }, [tileScale]);

  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = { chain: game.chain, turn: game.turn, hasHand: availableHand.length > 0 };
    const added = game.chain.length === before.chain.length + 1 && before.chain.every(tile => game.chain.some(next => next.id === tile.id));
    const bounds = ref.current?.querySelector('.konvajs-content')?.getBoundingClientRect();
    if (!bounds) { if (added) void audio.playSound('place'); return; }
    const online = Boolean(ref.current?.closest('.online-page'));
    if (added && (online ? !before.hasHand : before.turn !== 0)) {
      const added = game.chain.find(tile => !before.chain.some(old => old.id === tile.id));
      const selector = before.turn === 1 ? '.top-player' : before.turn === 2 ? '.side-player:not(.right-player)' : '.right-player';
      const source = online ? new DOMRect(bounds.left + bounds.width / 2, bounds.top, 0, 0) : document.querySelector(selector)?.getBoundingClientRect();
      if (added && source) prepareOpponentAnimation(added, source);
    }
    let animated = false;
    for (const p of [placements[0], placements[placements.length - 1]]) {
      if (!p) continue;
      const target = new DOMRect(bounds.left + offsetX + p.x * tileScale, bounds.top + offsetY + p.y * tileScale,
        (p.horizontal ? 64 : 32) * tileScale, (p.horizontal ? 32 : 64) * tileScale);
      if (finishMoveAnimation(p.tile.id, target, p.horizontal, p.reversed ? p.tile.right : p.tile.left, p.reversed ? p.tile.left : p.tile.right, landed => {
        flushSync(() => setMovingTile(current => current === p.tile.id ? null : current));
        if (landed && added) void audio.playSound('place');
      })) {
        animated = true;
        setMovingTile(p.tile.id);
        break;
      }
    }
    if (added && !animated) void audio.playSound('place');
  }, [game.chain, game.turn, availableHand.length]);

  return <div className="board-canvas" ref={ref} style={{ '--board-default-height': `${height}px` } as CSSProperties}>
    <div className="board-scroll" role="region" aria-label="Plateau de dominos" tabIndex={0} onKeyDown={event => {
      const side = event.key === 'ArrowLeft' ? 'left' : event.key === 'ArrowRight' ? 'right' : null;
      if (selected && side && availableHand.some(tile => tile.id === selected && sides(game, tile).includes(side))) {
        event.preventDefault();
        choose(side);
      }
    }}>
      <Stage width={canvasWidth} height={canvasHeight}>
        <Layer listening={Boolean(selected)}>
          {placements.map(({ tile, x, y, horizontal, reversed }) => <Domino key={tile.id}
            tile={{ a: reversed ? tile.right : tile.left, b: reversed ? tile.left : tile.right }}
            x={offsetX + x * tileScale} y={offsetY + y * tileScale} horizontal={horizontal} scale={tileScale} hidden={movingTile === tile.id}/>)}
          {selected && !movingTile && placements.length > 0 && (['left', 'right'] as const)
            .filter(side => availableHand.some(tile => (!selected || tile.id === selected) && sides(game, tile).includes(side)))
            .map(side => {
              const p = side === 'left' ? placements[0] : placements[placements.length - 1];
              const tileWidth = p.horizontal ? 64 : 32, tileHeight = p.horizontal ? 32 : 64;
              const firstEnd = p.horizontal ? (side === 'left') !== p.reversed : side === 'left';
              const sameTile = placements.length === 1;
              const hitWidth = sameTile && p.horizontal ? tileWidth / 2 : tileWidth;
              const hitHeight = sameTile && !p.horizontal ? tileHeight / 2 : tileHeight;
              const hitX = p.x + (sameTile && p.horizontal && !firstEnd ? tileWidth / 2 : 0);
              const hitY = p.y + (sameTile && !p.horizontal && !firstEnd ? tileHeight / 2 : 0);
              return <Rect key={side} x={offsetX + hitX * tileScale} y={offsetY + hitY * tileScale}
                width={hitWidth * tileScale} height={hitHeight * tileScale} cornerRadius={4}
                fill="rgba(216,180,106,0.28)" stroke={GOLD} strokeWidth={2} listening={Boolean(selected)}
                onMouseEnter={e => { e.target.getStage()!.container().style.cursor = 'pointer'; }}
                onMouseLeave={e => { e.target.getStage()!.container().style.cursor = 'default'; }}
                onClick={() => selected && choose(side)} onTap={() => selected && choose(side)}/>;
            })}
          {!game.chain.length && <Text text="LE JEU COMMENCE ICI" x={0} y={canvasHeight / 2 - 5}
            width={canvasWidth} align="center" fontSize={10} letterSpacing={3} fill="#b9cbbc" opacity={0.75} listening={false}/>}
        </Layer>
      </Stage>
    </div>
  </div>;
}
