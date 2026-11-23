import { useEffect, useLayoutEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { Dice5 } from 'lucide-react';
import { legalLudoPawns, LUDO_SAFE, trackSquare } from './ludo-game';
import { audio } from './audio';

export type LudoRoom = {
  code: string;
  host: string;
  me: string;
  status: 'waiting' | 'playing' | 'finished';
  turn: number | null;
  die: number | null;
  winner: number | null;
  message: string;
  player_limit: number | null;
  turn_deadline?: string | null;
  players: { uid: string; name: string; seat: number; pawns: number[] }[];
};

export const LUDO_COLORS = ['#e94853', '#39b56a', '#f0b92f', '#438de1'];
const light = ['#ffdfe1', '#def7e5', '#fff1bf', '#dcecff'];
const track: [number, number][] = [
  ...[1, 2, 3, 4, 5].map(x => [x, 6] as [number, number]), ...[5, 4, 3, 2, 1, 0].map(y => [6, y] as [number, number]),
  [7, 0], [8, 0], ...[1, 2, 3, 4, 5].map(y => [8, y] as [number, number]), ...[9, 10, 11, 12, 13, 14].map(x => [x, 6] as [number, number]),
  [14, 7], [14, 8], ...[13, 12, 11, 10, 9].map(x => [x, 8] as [number, number]), ...[9, 10, 11, 12, 13, 14].map(y => [8, y] as [number, number]),
  [7, 14], [6, 14], ...[13, 12, 11, 10, 9].map(y => [6, y] as [number, number]), ...[5, 4, 3, 2, 1, 0].map(x => [x, 8] as [number, number]), [0, 7], [0, 6],
];
const bases: [[number, number], [number, number], [number, number], [number, number]] = [[0, 0], [9, 0], [9, 9], [0, 9]];
const dicePips: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

function pawnPosition(seat: number, position: number, index: number): [number, number] {
  if (position < 0) {
    const [x, y] = bases[seat];
    return [x + 2.15 + (index % 2) * 1.7, y + 1.9 + Math.floor(index / 2) * 1.7];
  }
  if (position >= 56) return [7.5 + (seat === 0 ? -.22 : seat === 2 ? .22 : 0), 7.5 + (seat === 1 ? -.22 : seat === 3 ? .22 : 0)];
  if (position >= 51) {
    const step = position - 51;
    return seat === 0 ? [1.5 + step, 7.5] : seat === 1 ? [7.5, 1.5 + step] : seat === 2 ? [13.5 - step, 7.5] : [7.5, 13.5 - step];
  }
  const [x, y] = track[trackSquare(seat, position)!];
  return [x + .5, y + .5];
}

type Dice3DProps = { value:number|null; rolling:boolean; onReady:(ready:boolean)=>void };
export function DiceFace({ value, rolling }: { value: number | null; rolling: boolean }) {
  const [Dice3D, setDice3D] = useState<ComponentType<Dice3DProps> | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let mounted = true;
    void import('./ludo-dice-3d').then(module => { if (mounted) setDice3D(() => module.default); }).catch(() => {});
    return () => { mounted = false; };
  }, []);
  // The neutral face is decorative when there is no server result yet.
  const show3D = ready;
  return <span className={`ludo-dice-face${show3D ? ' has-3d' : ''}`} aria-hidden="true">
    {Dice3D && <span style={{ visibility: show3D ? 'visible' : 'hidden' }}><Dice3D value={value} rolling={rolling} onReady={setReady}/></span>}
    {!show3D && (value === null
      ? <Dice5 className="ludo-dice-placeholder"/>
      : Array.from({ length: 9 }, (_, i) => <span key={i} className={dicePips[value].includes(i) ? 'dice-pip visible' : 'dice-pip'}/>))}
  </span>;
}

type Burst = { id: string; x: number; y: number; seat: number };

// Only the SVG presentation is animated; the authoritative snapshot is never delayed.
function AnimatedPawn({ seat, position, index, x, y, playable, label, onMove, children }: {
  seat: number; position: number; index: number; x: number; y: number;
  playable: boolean; label: string; onMove: () => void; children: ReactNode;
}) {
  const node = useRef<SVGGElement>(null);
  const feedback = useRef<SVGGElement>(null);
  const previous = useRef({ position, x, y });
  const visual = useRef({ x, y, lift: 0, angle: 0 });
  useLayoutEffect(() => {
    const element = node.current;
    if (!element) return;
    const before = previous.current;
    previous.current = { position, x, y };
    const state = visual.current;
    const draw = () => element.setAttribute('transform', `translate(${state.x} ${state.y + state.lift}) rotate(${state.angle})`);
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const steps = position - before.position;
    const captured = before.position >= 0 && before.position < 51 && position < 0;
    if (reduced || document.hidden || (!captured && (steps <= 0 || steps > 6 || (before.position < 0 && position !== 0)))) {
      Object.assign(state, { x, y, lift: 0, angle: 0 });
      draw();
      return;
    }
    const timeline = gsap.timeline({ onUpdate: draw });
    if (captured) {
      // Return along the pawn's own track, then enter its base. Cap the total
      // duration so a capture near the end of the track does not stall visually.
      const duration = Math.min(.075, 1.3 / (before.position + 1));
      void audio.playSound('return');
      for (let step = before.position - 1; step >= 0; step--) {
        const [stepX, stepY] = pawnPosition(seat, step, index);
        timeline.to(state, { x: stepX, y: stepY, duration, ease: 'none' });
      }
      timeline.to(state, { x, y, duration: Math.max(.12, duration), ease: 'power1.out' });
      return () => { timeline.kill(); state.lift = 0; state.angle = 0; };
    }
    const destinations = before.position < 0 ? [position] : Array.from({ length: steps }, (_, i) => before.position + i + 1);
    destinations.forEach((step, i) => {
      const [stepX, stepY] = i === destinations.length - 1 ? [x, y] : pawnPosition(seat, step, index);
      timeline.to(state, { x: stepX, y: stepY, duration: .18, ease: 'power1.inOut',
        onStart: () => { state.angle = i % 2 ? -5 : 5; },
        onComplete: () => { state.angle = 0; void audio.playSound('place'); } });
      timeline.to(state, { lift: -.13, duration: .08, yoyo: true, repeat: 1, ease: 'sine.out' }, '<');
    });
    return () => { timeline.kill(); state.lift = 0; state.angle = 0; };
  }, [seat, position, index, x, y]);
  useEffect(() => () => { if (feedback.current) gsap.killTweensOf(feedback.current); }, []);
  const select = () => {
    if (!playable) return;
    void audio.playSound('select');
    if (feedback.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      gsap.killTweensOf(feedback.current);
      gsap.fromTo(feedback.current, { scale: 1 }, { scale: 1.16, duration: .1, yoyo: true, repeat: 1, transformOrigin: 'center center', clearProps: 'transform' });
    }
    onMove();
  };
  return <g ref={node} role={playable ? 'button' : undefined} tabIndex={playable ? 0 : undefined}
    aria-label={label} onClick={select}
    onKeyDown={event => { if (playable && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); select(); } }}
    className={`ludo-pawn ludo-pawn-animated${playable ? ' playable-pawn' : ''}`} transform={`translate(${x} ${y})`}>
    <g ref={feedback}>{children}</g>
  </g>;
}

export function LudoBoard({ room, onMove }: { room: LudoRoom; onMove: (pawn: number) => void }) {
  const me = room.players.find(p => p.uid === room.me);
  const allowed = me && room.turn === me.seat && room.die !== null
    ? legalLudoPawns({
        players: room.players.map(p => ({ name: p.name, pawns: p.pawns })),
        turn: room.players.findIndex(p => p.uid === room.me),
        die: room.die,
        sixes: 0,
        winner: null,
        message: '',
      })
    : [];

  // Purement visuel : on compare les snapshots pour afficher un éclat lors d'une capture.
  const previous = useRef<Record<string, number>>({});
  const [bursts, setBursts] = useState<Burst[]>([]);
  const signature = room.players.map(p => `${p.uid}:${p.pawns.join(',')}`).join('|');
  useEffect(() => {
    const next: Record<string, number> = {};
    const fresh: Burst[] = [];
    for (const player of room.players) {
      player.pawns.forEach((position, index) => {
        const id = `${player.uid}-${index}`;
        next[id] = position;
        const before = previous.current[id];
        if (before !== undefined && before >= 0 && position < 0) {
          const [x, y] = pawnPosition(player.seat, before, index);
          fresh.push({ id: `${id}-${before}`, x, y, seat: player.seat });
        }
      });
    }
    previous.current = next;
    if (fresh.length) { void audio.playSound('capture'); setBursts(current => [...current, ...fresh]); }
  }, [signature]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!bursts.length) return;
    const timer = window.setTimeout(() => setBursts([]), 700);
    return () => window.clearTimeout(timer);
  }, [bursts]);

  const winner = room.status === 'finished' && room.winner !== null
    ? room.players.find(p => p.seat === room.winner)
    : null;

  return <svg className={`ludo-board${winner ? ' ludo-board--finished' : ''}`} viewBox="0 0 15 15" role="group" aria-label="Plateau de Ludo">
    <defs>
      {LUDO_COLORS.map((color, seat) => <radialGradient key={seat} id={`ludo-pawn-${seat}`} cx="30%" cy="22%" r="80%">
        <stop offset="0" stopColor="#fff"/>
        <stop offset=".2" stopColor={color}/>
        <stop offset=".7" stopColor={color}/>
        <stop offset="1" stopColor="#172c42"/>
      </radialGradient>)}
      <filter id="ludo-pawn-shadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy=".06" stdDeviation=".06" floodColor="#0b1a2b" floodOpacity=".45"/>
      </filter>
    </defs>

    <rect width="15" height="15" rx=".3" fill="#f5f2e9" stroke="#d8cfb7" strokeWidth=".08"/>

    {bases.map(([x, y], seat) => {
      const player = room.players.find(p => p.seat === seat);
      const active = room.status === 'playing' && room.turn === seat;
      const label = player ? `${player.name}${player.uid === room.me ? ' (vous)' : ''}` : 'Place libre';
      return <g key={seat} className={`ludo-base${active ? ' is-active' : ''}`}>
        <rect x={x} y={y} width="6" height="6" rx=".22" fill={LUDO_COLORS[seat]}/>
        <rect x={x + .75} y={y + .5} width="4.5" height="4.5" rx=".4" fill="#fffdf5"/>
        {active && <rect x={x + .18} y={y + .18} width="5.64" height="5.64" rx=".32" fill="none" stroke="#ffe08a" strokeWidth=".09"/>}
        {[0, 1, 2, 3].map(i => <circle key={i} cx={x + 2.15 + (i % 2) * 1.7} cy={y + 1.9 + Math.floor(i / 2) * 1.7} r=".58"
          fill={light[seat]} stroke={LUDO_COLORS[seat]} strokeWidth=".07"/>)}
        <rect x={x + .35} y={y + 5.18} width="5.3" height=".64" rx=".22" fill={active ? '#ffe08a' : '#142949'} opacity={active ? 1 : .9}/>
        <text x={x + 3} y={y + 5.63} textAnchor="middle" fontSize=".37" fontWeight="700" fill={active ? '#29375a' : '#fff'}
          textLength={label.length > 18 ? 4.7 : undefined} lengthAdjust="spacingAndGlyphs">
          <title>{label}{active ? ' - à son tour' : ''}</title>{active ? '✦ ' : ''}{label}
        </text>
      </g>;
    })}

    {track.map(([x, y], i) => <g key={i}>
      <rect x={x} y={y} width="1" height="1" fill={i % 13 === 0 ? light[Math.floor(i / 13)] : '#fffdf5'} stroke="#c9c2ae" strokeWidth=".035"/>
      {LUDO_SAFE.has(i) && <text x={x + .5} y={y + .72} textAnchor="middle" fontSize=".6" fill="#a09a86">✦</text>}
    </g>)}

    {[0, 1, 2, 3].flatMap(seat => [0, 1, 2, 3, 4, 5].map(step => {
      const [x, y] = pawnPosition(seat, 51 + step, 0);
      return <rect key={`${seat}-${step}`} x={x - .5} y={y - .5} width="1" height="1" fill={light[seat]} stroke="#c9c2ae" strokeWidth=".035"/>;
    }))}

    <path d="M6 6 L9 6 L7.5 7.5Z" fill={LUDO_COLORS[1]}/>
    <path d="M9 6 L9 9 L7.5 7.5Z" fill={LUDO_COLORS[2]}/>
    <path d="M9 9 L6 9 L7.5 7.5Z" fill={LUDO_COLORS[3]}/>
    <path d="M6 9 L6 6 L7.5 7.5Z" fill={LUDO_COLORS[0]}/>

    {room.players.flatMap(player => player.pawns.map((position, index) => {
      const [x, y] = pawnPosition(player.seat, position, index);
      const same = room.players.flatMap(other => other.pawns.map((value, i) => ({
        owner: other,
        index: i,
        point: pawnPosition(other.seat, value, i),
      }))).filter(item => Math.abs(item.point[0] - x) < .01 && Math.abs(item.point[1] - y) < .01);
      const offset = same.findIndex(item => item.owner.uid === player.uid && item.index === index);
      const cols = Math.ceil(Math.sqrt(same.length));
      const rows = Math.ceil(same.length / cols);
      const dx = same.length > 1 ? ((offset % cols) - (cols - 1) / 2) * .25 : 0;
      const dy = same.length > 1 ? (Math.floor(offset / cols) - (rows - 1) / 2) * .25 : 0;
      const size = same.length > 1 ? .72 : 1;
      const playable = player.uid === room.me && allowed.includes(index);
      return <AnimatedPawn key={`${room.code}-${player.uid}-${index}`} seat={player.seat} position={position} index={index}
        x={x + dx} y={y + dy} playable={playable} onMove={() => onMove(index)}
        label={`${player.name}, pion ${index + 1}${playable ? ', jouable' : ''}`}>
        <g className="pawn-art" transform={`scale(${size})`}>
          <circle r=".55" fill="transparent"/>
          <ellipse cy=".28" rx=".37" ry=".13" fill="#14263b" opacity=".28"/>
          <path className="pawn-body" filter="url(#ludo-pawn-shadow)"
            d="M-.32 .18 Q-.3 .04 -.18 -.14 Q-.27 -.24 -.27 -.36 A.27 .27 0 1 1 .27 -.36 Q.27 -.24 .18 -.14 Q.3 .04 .32 .18 Q.32 .31 0 .31 Q-.32 .31 -.32 .18 Z"
            fill={`url(#ludo-pawn-${player.seat})`} stroke="#fff" strokeWidth=".055"/>
          <ellipse cx="-.09" cy="-.4" rx=".075" ry=".1" fill="#fff" opacity=".72"/>
          <path d="M-.25 .19 Q0 .27 .25 .19" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth=".035"/>
        </g>
      </AnimatedPawn>;
    }))}

    {bursts.map(burst => <g key={burst.id} className="ludo-capture" transform={`translate(${burst.x} ${burst.y})`} pointerEvents="none">
      <circle r=".2" fill="none" stroke={LUDO_COLORS[burst.seat]} strokeWidth=".1"/>
      <circle r=".42" fill="none" stroke={LUDO_COLORS[burst.seat]} strokeWidth=".06" opacity=".55"/>
    </g>)}

    {winner && <g className="ludo-victory" pointerEvents="none">
      <rect x="4.1" y="6.7" width="6.8" height="1.6" rx=".28" fill="#10233f" opacity=".88"/>
      <text x="7.5" y="7.3" textAnchor="middle" fontSize=".42" letterSpacing=".12em" fill="#f2cf78">PARTIE TERMINÉE</text>
      <text x="7.5" y="7.88" textAnchor="middle" fontSize=".55" fontWeight="700" fill="#fff">{winner.name}</text>
    </g>}
  </svg>;
}
