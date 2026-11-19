import { Users } from 'lucide-react';
import type { ReactNode } from 'react';

/** Shared entry screen for the private-room flow of each game. */
export function PrivateRoomWelcome({description,children}:{description:string;children:ReactNode}) {
  return <main className="online-main">
    <div className="eyebrow">LE PLAISIR DE JOUER ENSEMBLE</div>
    <h1>Votre salon <em>privé.</em></h1>
    <p className="online-subtitle">Invitez vos proches et retrouvez-vous autour de la table.</p>
    <div className="online-welcome"><div className="online-intro">
      <div className="invite-icon"><Users size={22}/></div>
      <h2>Une partie entre amis</h2>
      <p>{description}</p>
      {children}
    </div></div>
  </main>;
}
