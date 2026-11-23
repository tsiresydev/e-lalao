import { ArrowLeft, LogIn, Plus, X } from 'lucide-react';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

type Props = {
  busy:boolean;
  error:string;
  name:string;
  setName:(value:string)=>void;
  code:string;
  setCode:(value:string)=>void;
  onCreate:()=>void;
  onJoin:()=>void;
  createOptions?:ReactNode;
};

export function RoomChoice({busy,error,name,setName,code,setCode,onCreate,onJoin,createOptions}:Props) {
  const [open,setOpen]=useState(false), [action,setAction]=useState<'create'|'join'|null>(null);
  const dialog=useRef<HTMLDialogElement>(null), title=useId();
  useEffect(()=>{const element=dialog.current;if(!element)return;if(open&&!element.open)element.showModal();if(!open&&element.open)element.close();},[open]);
  const close=()=>{if(!busy){setOpen(false);setAction(null);}};
  return <>
    <button type="button" className="room-choice-trigger kp-button kp-button--primary" onClick={()=>setOpen(true)}><Plus size={17}/> Créer ou rejoindre une partie</button>
    <dialog ref={dialog} className="room-choice-dialog" aria-labelledby={title} onCancel={event=>{event.preventDefault();close();}} onClose={()=>{setOpen(false);setAction(null);}}>
      <div className="room-choice-head"><div><span>PARTIE PRIVÉE</span><h2 id={title}>{action==='create'?'Créer une partie':action==='join'?'Rejoindre une partie':'Comment jouer ?'}</h2></div><button type="button" className="room-choice-close" onClick={close} disabled={busy} aria-label="Fermer"><X size={22}/></button></div>
      {!action?<div className="room-choice-actions"><button type="button" onClick={()=>setAction('create')}><span className="room-choice-action-icon"><Plus size={20}/></span><span><strong>Créer une partie</strong><small>Invitez vos amis avec un code.</small></span></button><button type="button" onClick={()=>setAction('join')}><span className="room-choice-action-icon"><LogIn size={20}/></span><span><strong>Rejoindre une partie</strong><small>Utilisez le code reçu d’un ami.</small></span></button></div>:<form onSubmit={event=>{event.preventDefault();if(action==='create')onCreate();else onJoin();}}>
        <label>Votre pseudo<input autoFocus value={name} onChange={event=>setName(event.target.value)} maxLength={20} autoComplete="nickname" required /></label>
        {action==='create'?createOptions:<label>Code d’invitation<input value={code} onChange={event=>setCode(event.target.value.toUpperCase())} maxLength={8} minLength={8} autoComplete="off" required /></label>}
        {error&&<p className="room-choice-error kp-alert" role="alert">{error}</p>}
        <div className="room-choice-footer"><button type="button" className="room-choice-back" onClick={()=>setAction(null)} disabled={busy}><ArrowLeft size={16}/> Retour</button><button type="submit" className="room-choice-submit" disabled={busy||!name.trim()||(action==='join'&&code.trim().length!==8)}>{busy?'Patientez…':action==='create'?'Créer le salon':'Rejoindre'}</button></div>
      </form>}
    </dialog>
  </>;
}
