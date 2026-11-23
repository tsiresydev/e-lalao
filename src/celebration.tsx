import { useEffect, useState, type ComponentType } from 'react';

const eventName = 'kopaka:celebration';

/** A presentation event only: it does not carry or alter game state. */
export function celebrate() {
  if (!document.hidden && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    window.dispatchEvent(new Event(eventName));
  }
}

/** One shared, lazily loaded WebGL overlay for all games. */
export function CelebrationOverlay() {
  const [active, setActive] = useState(false);
  const [Scene, setScene] = useState<ComponentType<{onComplete:()=>void}> | null>(null);
  useEffect(() => {
    const show = () => setActive(true);
    window.addEventListener(eventName, show);
    return () => window.removeEventListener(eventName, show);
  }, []);
  useEffect(() => {
    if (!active || Scene) return;
    let mounted = true;
    void import('./victory-celebration').then(module => {
      if (mounted) setScene(() => module.default);
    }).catch(() => { if (mounted) setActive(false); });
    return () => { mounted = false; };
  }, [active, Scene]);
  return active && Scene ? <Scene onComplete={() => setActive(false)}/> : null;
}
