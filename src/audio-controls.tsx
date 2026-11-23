import { useEffect, useRef, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { audio } from './audio';

export function AudioControls() {
  const [enabled, setEnabled] = useState(audio.enabled);
  const [volume, setVolume] = useState(audio.volume);
  const [sfxVolume, setSfxVolume] = useState(audio.sfxVolume);
  const [musicEnabled, setMusicEnabled] = useState(audio.musicEnabled);
  const [musicVolume, setMusicVolume] = useState(audio.musicVolume);
  const [ambient, setAmbient] = useState(false);
  const [ambientVolume, setAmbientVolume] = useState(audio.ambientVolume);
  const [ambientError, setAmbientError] = useState('');
  const ambientRequest = useRef(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onVisibility = () => { if (document.hidden) { ambientRequest.current++; audio.stopAmbient(); setAmbient(false); } };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { ambientRequest.current++; document.removeEventListener('visibilitychange', onVisibility); audio.stopAmbient(); };
  }, []);
  return <div className="audio-controls" role="group" aria-label="Réglages audio">
    <button type="button" onClick={() => { void audio.playSound('click'); setOpen(!open); }} aria-expanded={open} aria-label="Réglages audio">
      {enabled || musicEnabled ? <Volume2 size={18}/> : <VolumeX size={18}/>}
    </button>
    {open && <div className="audio-settings">
      <label><input type="checkbox" checked={enabled} onChange={event => { audio.setEnabled(event.target.checked); setEnabled(event.target.checked); }}/> Effets sonores</label>
      <label>Volume effets <input aria-label="Volume effets" type="range" min="0" max="1" step="0.05" value={sfxVolume}
        onChange={event => { const value = Number(event.target.value); audio.setSfxVolume(value); setSfxVolume(value); }}/></label>
      <label>Volume général <input aria-label="Volume général" type="range" min="0" max="1" step="0.05" value={volume}
        onChange={event => { const value = Number(event.target.value); audio.setMasterVolume(value); setVolume(value); }}/></label>
      <label><input type="checkbox" checked={musicEnabled} onChange={event => { audio.setMusicEnabled(event.target.checked); setMusicEnabled(event.target.checked); }}/> Musique de résultat</label>
      <label>Volume musique <input aria-label="Volume musique" type="range" min="0" max="1" step="0.05" value={musicVolume}
        onChange={event => { const value = Number(event.target.value); audio.setMusicVolume(value); setMusicVolume(value); }}/></label>
      <label><input type="checkbox" checked={ambient} onChange={event => {
        const enabled = event.target.checked;
        const request = ++ambientRequest.current;
        setAmbient(enabled); setAmbientError('');
        if (enabled) void audio.playAmbient().then(ok => { if (!ok && request === ambientRequest.current && !document.hidden) { setAmbient(false); setAmbientError('Impossible de lire l’ambiance.'); } });
        else audio.stopAmbient();
      }}/> Ambiance forêt</label>
      <label>Volume ambiance <input aria-label="Volume ambiance" type="range" min="0" max="1" step="0.05" value={ambientVolume}
        onChange={event => { const value = Number(event.target.value); audio.setAmbientVolume(value); setAmbientVolume(value); }}/></label>
      {ambientError && <span role="status">{ambientError}</span>}
    </div>}
  </div>;
}
