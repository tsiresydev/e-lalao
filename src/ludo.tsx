import { PrivateRoomWelcome } from './private-room-welcome';
import { WaitingIndicator } from './waiting-indicator';
import { RoomChoice } from './room-choice';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, Users } from 'lucide-react';
import { useTurnExpiry } from './room-presence';
import { TurnCountdown } from './turn-countdown';
import { Brand, CopyCodeButton, RoomStatusPill } from './shell';
import { DiceFace, LudoBoard, type LudoRoom } from './ludo-view';
import { audio } from './audio';
import { celebrate } from './celebration';

type Room = LudoRoom;

const client = import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  ? createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY)
  : null;

export function Ludo({ back }: { back: () => void }) {
  const [room, setRoom] = useState<Room | null>(null), [name, setName] = useState(''), [code, setCode] = useState(''),
    [busy, setBusy] = useState(false), [error, setError] = useState('');
  useTurnExpiry(client, 'ludo', room?.code, room?.status === 'playing');
  const [playerLimit, setPlayerLimit] = useState(4);
  const [rolling, setRolling] = useState(false);
  const diceButton = useRef<HTMLButtonElement>(null);
  const request = useRef(0), mutating = useRef(false), alive = useRef(true);
  const previousResult = useRef<{code:string; status:Room['status']} | null>(null);
  useEffect(() => {
    const previous = previousResult.current;
    if (room && previous?.code === room.code && previous.status === 'playing' && room.status === 'finished' && room.winner !== null) {
      const seat = room.players.find(player => player.uid === room.me)?.seat;
      if (room.winner === seat) celebrate();
      void audio.playSound(room.winner === seat ? 'victory' : 'defeat');
    }
    previousResult.current = room ? {code:room.code,status:room.status} : null;
  }, [room]);

  useEffect(() => { alive.current = true; return () => { alive.current = false; request.current++; }; }, []);
  useEffect(() => {
    if (!rolling) return;
    // A hidden tab or an interrupted CSS animation must never lock the controls.
    const unlock = () => { if (document.hidden) setRolling(false); };
    const face = diceButton.current?.querySelector('.ludo-dice-face');
    const cancel = () => setRolling(false);
    document.addEventListener('visibilitychange', unlock);
    face?.addEventListener('animationcancel', cancel);
    return () => { document.removeEventListener('visibilitychange', unlock); face?.removeEventListener('animationcancel', cancel); };
  }, [rolling]);
  useEffect(() => { if (room?.status !== 'playing') setRolling(false); }, [room?.status, room?.code]);

  const call = useCallback(async (fn: string, args: Record<string, unknown>, quiet = false) => {
    if (!client) { setError('Configurez Supabase pour jouer en ligne.'); return; }
    if (quiet && mutating.current) return;
    const id = ++request.current;
    if (!quiet) { mutating.current = true; setBusy(true); setError(''); }
    try {
      const { data: session, error: sessionError } = await client.auth.getSession();
      if (sessionError) throw sessionError;
      if (!session.session) {
        const { error: e } = await client.auth.signInAnonymously();
        if (e) throw e;
      }
      const { data, error: e } = await client.rpc(fn, args);
      if (e) throw e;
      if (data && typeof data === 'object' && 'error' in data) throw new Error(String(data.error));
      if (alive.current && id === request.current) {
        setRoom(data as Room);
        sessionStorage.setItem('ludo-room', (data as Room).code);
      }
    } catch (e) {
      const message = e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Connexion impossible.';
      if (alive.current && quiet && /refusé|introuvable/i.test(message)) {
        sessionStorage.removeItem('ludo-room');
        setRoom(null);
      }
      if (alive.current && !quiet) setError(message);
    } finally {
      if (!quiet) { mutating.current = false; if (alive.current) setBusy(false); }
    }
  }, []);

  useEffect(() => { const saved = sessionStorage.getItem('ludo-room'); if (saved) void call('ludo_state', { p_code: saved }, true); }, [call]);
  useEffect(() => { if (!busy && room) void call('ludo_state', { p_code: room.code }, true); }, [busy, room?.code, call]);
  useEffect(() => {
    if (!room || !client) return;
    const c = client, roomCode = room.code, refresh = () => void call('ludo_state', { p_code: roomCode }, true);
    let channel: ReturnType<typeof c.channel> | undefined, cancelled = false;
    void c.realtime.setAuth().then(() => {
      if (cancelled) return;
      channel = c.channel(`maison-ludo:${roomCode}`, { config: { private: true } })
        .on('broadcast', { event: 'changed' }, refresh)
        .subscribe(status => { if (status === 'SUBSCRIBED') refresh(); });
    }).catch(() => { /* Le polling continue si Realtime est indisponible. */ });
    const timer = window.setInterval(refresh, 15000);
    return () => { cancelled = true; window.clearInterval(timer); if (channel) void c.removeChannel(channel); };
  }, [room?.code, call]);

  const cancelRoom = async () => {
    if (!room || !client || room.host !== room.me || room.status !== 'waiting') return;
    if (!window.confirm('Annuler ce salon ? Tous les joueurs invités seront déconnectés.')) return;
    setBusy(true);
    const { error: e } = await client.rpc('ludo_cancel', { p_code: room.code });
    setBusy(false);
    if (e) { setError(e.message); return; }
    request.current++;
    sessionStorage.removeItem('ludo-room');
    setRoom(null);
    setError('Salon annulé.');
  };

  const leave = async () => {
    if (room && client) {
      if (room.status === 'playing' && !window.confirm('Quitter annule la partie. Continuer ?')) return;
      setBusy(true);
      const { error: e } = await client.rpc('ludo_leave', { p_code: room.code });
      if (e) { setError(e.message); setBusy(false); return; }
    }
    request.current++;
    sessionStorage.removeItem('ludo-room');
    back();
  };

  const me = room?.players.find(p => p.uid === room.me);
  const myTurn = room?.status === 'playing' && room.turn === me?.seat;

  return <div className={`${room ? 'ludo-page ludo-table-view' : 'online-page'}`}>
    <header className={room ? 'ludo-header' : 'online-header'}>
      <button onClick={() => void leave()}><ArrowLeft size={19}/> Retour</button>
      {room ? <strong>LUDO <span>ENTRE AMIS</span></strong> : <Brand compact/>}
      <span>{room ? null : 'PARTIE ENTRE AMIS'}</span>
    </header>

    {!room
      ? <PrivateRoomWelcome description="Créez un salon et partagez son code, ou rejoignez une partie de Ludo. De 2 à 4 joueurs.">
          <RoomChoice busy={busy} error={error} name={name} setName={setName} code={code} setCode={setCode}
            createOptions={<label>Nombre de joueurs<select value={playerLimit} onChange={e => setPlayerLimit(Number(e.target.value))}>
              {[2, 3, 4].map(n => <option key={n} value={n}>{n} joueurs</option>)}
            </select></label>}
            onCreate={() => void call('ludo_create_configured', { p_name: name, p_player_limit: playerLimit })}
            onJoin={() => void call('ludo_join', { p_code: code, p_name: name })}/>
        </PrivateRoomWelcome>
      : <main className="ludo-game">
          <div className="ludo-roomline">
            <span>Code <strong>{room.code}</strong> · {room.players.length}/{room.player_limit ?? 4} joueurs</span>
            <RoomStatusPill status={room.status}/>
            <TurnCountdown deadline={room.turn_deadline} active={room.status === 'playing'}/>
            {room.status === 'waiting' && room.host === room.me &&
              <button className="cancel-room-button" disabled={busy} onClick={() => void cancelRoom()}>Annuler le salon</button>}
            <CopyCodeButton code={room.code} compact onError={setError}/>
          </div>
          <LudoBoard room={room} onMove={pawn => { if (!busy && room) void call('ludo_move', { p_code: room.code, p_pawn: pawn }); }}/>
          <div className="ludo-controls">
            <p role="status">
              {room.status === 'waiting'
                ? room.player_limit === null ? 'Invitez vos amis, puis lancez la partie.' : 'Invitez vos amis : la partie commence automatiquement.'
                : room.status === 'finished' ? room.message
                : myTurn ? room.die ? 'Choisissez un pion en surbrillance.' : 'À vous de lancer le dé !'
                : room.message}
            </p>
            {room.status === 'waiting'
              ? room.player_limit !== null
                ? <WaitingIndicator game="ludo" current={room.players.length} total={room.player_limit}/>
                : room.host === room.me
                  ? <button className="ludo-primary" disabled={busy || room.players.length < (room.player_limit ?? 2)}
                      onClick={() => void call('ludo_start', { p_code: room.code })}>
                      <Users size={18}/> Commencer ({room.players.length}/{room.player_limit ?? 4})
                    </button>
                  : <span>En attente du créateur.</span>
              : room.status === 'playing'
                ? <button ref={diceButton} className={`ludo-dice ${rolling ? 'is-rolling' : ''}`}
                    disabled={!myTurn || room.die !== null || busy || rolling}
                    onClick={() => {
                      setRolling(!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
                      void audio.playSound('dice');
                      void call('ludo_roll', { p_code: room.code });
                    }}
                    onAnimationEnd={event => {
                      if (event.animationName !== 'ludo-dice-roll' && event.animationName !== 'ludo-dice-roll-3d') return;
                      setRolling(false);
                      void audio.playSound('place');
                    }}
                    aria-label={room.die ? `Dé : ${room.die}` : 'Lancer le dé'}>
                    <DiceFace value={room.die} rolling={rolling}/>
                  </button>
                : <button className="ludo-primary" onClick={() => void leave()}>Retour aux jeux</button>}
          </div>
        </main>}
    {error && <div className="ludo-error kp-alert" role="alert">{error}</div>}
  </div>;
}
