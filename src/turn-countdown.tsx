import { useEffect, useState } from 'react';

export function TurnCountdown({ deadline, active }: { deadline?: string | null; active: boolean }) {
  const [remaining, setRemaining] = useState<number | null>(null);
  useEffect(() => {
    if (!active || !deadline) { setRemaining(null); return; }
    const update = () => setRemaining(Math.max(0, Math.ceil((new Date(deadline).getTime() - Date.now()) / 1000)));
    update();
    const timer = window.setInterval(update, 250);
    return () => window.clearInterval(timer);
  }, [deadline, active]);
  if (remaining === null) return null;
  return <span className="turn-countdown" role="timer" aria-label={`${remaining} secondes restantes`}>{remaining} s</span>;
}
