export function DominoBacks({ name, count, active, passing }: { name: string; count: number; active: boolean; passing: boolean }) {
  return <div className={`domino-backs ${active ? 'domino-backs-active' : ''} ${passing ? 'domino-backs-passing' : ''}`} role="img" aria-label={`${name} : ${count} domino${count === 1 ? '' : 's'}${active ? ', à son tour' : ''}${passing ? ', passe son tour' : ''}`}>
    {active && <span className="domino-turn-marker" aria-hidden="true"/>}
    {Array.from({length: Math.max(0, count)}, (_, index) => <span className="domino-back" key={index} aria-hidden="true"/>)}
    {passing && <span className="domino-back-pass" aria-hidden="true">PASSE</span>}
  </div>;
}
