import { Check, Copy, Menu, Users } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

export type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void };

/** One brand block for the catalogue and the pre-game screens. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`shell-brand${compact ? ' shell-brand--compact' : ''}`}>
    <span className="shell-brand-mark" aria-hidden="true"><i/><i/><i/></span>
    <span className="shell-brand-copy">
      <strong>KOPAKA</strong>
      {!compact && <small>LES JEUX QUI RASSEMBLENT</small>}
    </span>
  </div>;
}

/** Accessible mobile menu. Actions are supplied by the host screen. */
export function GameMenu({ items, label = 'Menu' }: { items: MenuItem[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return <div className="game-menu" ref={root}>
    <button type="button" className="game-menu-trigger icon-button mobile-menu" aria-label={label}
      aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <Menu size={19}/>
    </button>
    {open && <div className="game-menu-panel" role="menu">
      <span className="game-menu-title">{label}</span>
      {items.map(item => <button key={item.label} type="button" role="menuitem" onClick={() => {
        setOpen(false);
        item.onSelect();
      }}>
        {item.icon}
        <span>{item.label}</span>
      </button>)}
    </div>}
  </div>;
}

/** Shared copy-to-clipboard control with visible, accessible feedback. */
export function CopyCodeButton({ code, compact = false, onError }: { code: string; compact?: boolean; onError?: (message: string) => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      onError?.('Copie impossible : sélectionnez le code manuellement.');
    }
  };
  return <button type="button" className={`copy-code-button${compact ? ' copy-code-button--compact' : ''}`}
    onClick={() => void copy()} aria-label={copied ? 'Code copié' : 'Copier le code'}>
    {copied ? <Check size={15}/> : <Copy size={15}/>}
    <span>{copied ? 'Copié' : 'Copier'}</span>
  </button>;
}

/** Uniform salon state across the three games. */
export function RoomStatusPill({ status }: { status: 'waiting' | 'playing' | 'finished' }) {
  const labels = { waiting: 'En attente', playing: 'Partie en cours', finished: 'Manche terminée' } as const;
  return <span className={`room-status room-status--${status}`}>
    <Users size={13} aria-hidden="true"/>
    <span>{labels[status]}</span>
  </span>;
}
