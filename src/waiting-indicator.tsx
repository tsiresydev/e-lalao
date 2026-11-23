import { RoomStatusPill } from './shell';

type Game = 'domino' | 'ludo' | 'faritany';

function WaitingArt({game}:{game:Game}) {
  return <svg className={`waiting-art waiting-art--${game}`} viewBox="0 0 120 92" aria-hidden="true" focusable="false">
    <ellipse className="waiting-art-shadow" cx="60" cy="78" rx="29" ry="5"/>
    {game==='domino' && <g className="waiting-art-object waiting-domino">
      <rect x="42" y="11" width="38" height="62" rx="5" fill="#9c998f"/>
      <rect x="40" y="8" width="38" height="62" rx="5" fill="#fffdf0" stroke="#d5d0bd" strokeWidth="1.5"/>
      <path d="M44 39h30" stroke="#aaa692" strokeWidth="1.5"/>
      {[ [49,17],[69,17],[59,24],[49,31],[69,31],[49,48],[69,48],[49,61],[69,61] ].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="3" fill="#263342"/>)}
      <path d="M45 12h27" stroke="#fff" strokeWidth="2" strokeLinecap="round" opacity=".8"/>
    </g>}
    {game==='ludo' && <g className="waiting-art-object waiting-die">
      <rect x="39" y="23" width="45" height="45" rx="9" fill="#b5b2a8"/>
      <rect x="36" y="19" width="45" height="45" rx="9" fill="#fffdf2" stroke="#d5cfbc" strokeWidth="1.5"/>
      {[ [47,30],[70,30],[58.5,41.5],[47,53],[70,53] ].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="3.5" fill="#2e4860"/>)}
      <path d="M43 23h28" stroke="#fff" strokeWidth="2" strokeLinecap="round"/>
    </g>}
    {game==='faritany' && <g className="waiting-art-object waiting-territory">
      <rect x="24" y="10" width="72" height="61" rx="6" fill="#fffdf4" stroke="#c5d0d0" strokeWidth="1.5"/>
      <path d="M36 11v59m12-59v59m12-59v59m12-59v59m12-59v59M25 22h70M25 34h70M25 46h70M25 58h70" stroke="#dce3df" strokeWidth="1"/>
      <path className="waiting-territory-line" d="M36 34L48 22L72 22L84 34L72 58L48 58Z" fill="#5b9fe4" fillOpacity=".25" stroke="#377bc2" strokeWidth="2" strokeLinejoin="round"/>
      {[ [36,34],[48,22],[72,22],[84,34],[72,58],[48,58] ].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="3.2" fill="#377bc2"/>)}
      <circle className="waiting-territory-point" cx="60" cy="40" r="3.6" fill="#df5e69"/>
    </g>}
  </svg>;
}

export function WaitingIndicator({current,total,game}:{current:number;total:number;game:Game}) {
  return <div className="waiting-indicator kp-surface" role="status" aria-live="polite">
    <WaitingArt game={game}/>
    <RoomStatusPill status="waiting"/>
    <strong>En attente des joueurs</strong>
    <span>{current} / {total} joueurs · La partie démarre automatiquement lorsque le salon est complet.</span>
  </div>;
}
