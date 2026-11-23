import { useEffect, useState } from 'react';

export function TurnCountdown({ deadline, active }: { deadline?: string | null; active: boolean }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!active || !deadline) { setRemaining(null); return; }
    const update = () => setRemaining(Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 500);
    return () => window.clearInterval(timer);
  }, [deadline, active]);
  if (remaining === null) return null;
  const urgent = remaining <= 3;
  return <span className={`turn-countdown${urgent ? ' is-urgent' : ''}`} role="timer" aria-label={`${remaining} secondes restantes`}>{remaining} s</span>;
}
