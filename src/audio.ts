type Sound = 'select' | 'place' | 'capture' | 'return' | 'pass' | 'dice' | 'click' | 'victory' | 'defeat';
const sounds: Record<Sound, { files: string[]; volume: number; music?: boolean }> = {
  select: { files: ['ui/dieGrab1.ogg'], volume: .24 },
  place: { files: ['movement/chipLay1.ogg', 'movement/chipLay2.ogg'], volume: .35 },
  capture: { files: ['gameplay/chipsCollide1.ogg'], volume: .32 },
  return: { files: ['movement/cardSlide1.ogg'], volume: .23 },
  pass: { files: ['ui/click_001.ogg'], volume: .16 },
  dice: { files: ['gameplay/diceThrow1.ogg'], volume: .32 },
  click: { files: ['ui/click_001.ogg'], volume: .18 },
  victory: { files: ['victory/jingles_PIZZI03.ogg'], volume: .35, music: true },
  defeat: { files: ['defeat/jingles_PIZZI04.ogg'], volume: .25, music: true },
};

class AudioManager {
  private context: AudioContext | null = null;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private active = new Map<AudioBufferSourceNode, { music: boolean; gain: GainNode; base: number }>();
  private last = new Map<Sound, number>();
  private variant = 0;
  private ambientGeneration = 0;
  private ambient: { source: AudioBufferSourceNode; gain: GainNode } | null = null;
  enabled = this.read('kopaka-sfx', 'off') === 'on';
  musicEnabled = this.read('kopaka-music', 'off') === 'on';
  volume = Number(this.read('kopaka-volume', '0.6'));
  sfxVolume = Number(this.read('kopaka-sfx-volume', '0.7'));
  musicVolume = Number(this.read('kopaka-music-volume', '0.5'));
  ambientVolume = Number(this.read('kopaka-ambient-volume', '0.35'));

  private read(key: string, fallback: string) {
    try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
  }
  private save(key: string, value: string) {
    try { localStorage.setItem(key, value); } catch { /* private browsing */ }
  }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.save('kopaka-sfx', enabled ? 'on' : 'off');
    if (!enabled) this.stopSound(false);
    else void this.unlock();
  }
  setMasterVolume(volume: number) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : .6));
    this.save('kopaka-volume', String(this.volume));
    this.updateAmbientVolume();
    this.updateActiveVolumes();
  }
  setSfxVolume(volume: number) {
    this.sfxVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : .7));
    this.save('kopaka-sfx-volume', String(this.sfxVolume));
    this.updateActiveVolumes();
  }
  private updateActiveVolumes() {
    if (!this.context) return;
    for (const { music, gain, base } of this.active.values()) {
      gain.gain.setTargetAtTime(base * this.volume * (music ? this.musicVolume : this.sfxVolume), this.context.currentTime, .03);
    }
  }
  setAmbientVolume(volume: number) {
    this.ambientVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : .35));
    this.save('kopaka-ambient-volume', String(this.ambientVolume));
    this.updateAmbientVolume();
  }
  private updateAmbientVolume() {
    if (this.ambient && this.context) {
      this.ambient.gain.gain.setTargetAtTime(this.volume * this.ambientVolume * .45, this.context.currentTime, .1);
    }
  }
  async playAmbient(): Promise<boolean> {
    const generation = ++this.ambientGeneration;
    if (this.ambient) return true;
    try {
      await this.unlock();
      const ctx = this.context;
      if (!ctx || ctx.state !== 'running' || document.hidden) return false;
      const file = 'ambient/forest-ambience.mp3';
      let buffer = this.buffers.get(file);
      if (!buffer) {
        buffer = fetch(`${import.meta.env.BASE_URL}assets/sounds/${file}`)
          .then(response => { if (!response.ok) throw new Error('Ambiance indisponible'); return response.arrayBuffer(); })
          .then(data => ctx.decodeAudioData(data));
        this.buffers.set(file, buffer);
        buffer.catch(() => this.buffers.delete(file));
      }
      const decoded = await buffer;
      if (generation !== this.ambientGeneration || document.hidden) return false;
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = decoded;
      source.loop = true;
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(this.volume * this.ambientVolume * .45, ctx.currentTime + .8);
      source.connect(gain).connect(ctx.destination);
      this.ambient = { source, gain };
      source.onended = () => { source.disconnect(); gain.disconnect(); if (this.ambient?.source === source) this.ambient = null; };
      source.start();
      return true;
    } catch { return false; }
  }
  stopAmbient() {
    this.ambientGeneration++;
    const ambient = this.ambient, ctx = this.context;
    this.ambient = null;
    if (!ambient || !ctx) return;
    const now = ctx.currentTime;
    ambient.gain.gain.cancelScheduledValues(now);
    ambient.gain.gain.setValueAtTime(ambient.gain.gain.value, now);
    ambient.gain.gain.linearRampToValueAtTime(0, now + .35);
    try { ambient.source.stop(now + .35); } catch { /* already stopped */ }
  }
  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    this.save('kopaka-music', enabled ? 'on' : 'off');
    if (enabled) void this.unlock();
    else this.stopSound(true);
  }
  setMusicVolume(volume: number) {
    this.musicVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : .5));
    this.save('kopaka-music-volume', String(this.musicVolume));
    this.updateActiveVolumes();
  }
  async unlock() {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') await this.context.resume();
    } catch { /* Audio is optional and must not interrupt the game. */ }
  }
  async playSound(sound: Sound) {
    const entry = sounds[sound];
    const isEnabled = () => entry.music ? this.musicEnabled : this.enabled;
    if (!isEnabled() || document.hidden) return;
    const now = Date.now();
    if (now - (this.last.get(sound) ?? 0) < 140 || this.active.size >= 4) return;
    this.last.set(sound, now);
    try {
      await this.unlock();
      const ctx = this.context;
      if (!ctx || ctx.state !== 'running' || !isEnabled()) return;
      const file = entry.files[this.variant++ % entry.files.length];
      let buffer = this.buffers.get(file);
      if (!buffer) {
        buffer = fetch(`${import.meta.env.BASE_URL}assets/sounds/${file}`)
          .then(response => { if (!response.ok) throw new Error('Audio indisponible'); return response.arrayBuffer(); })
          .then(data => ctx.decodeAudioData(data));
        this.buffers.set(file, buffer);
        buffer.catch(() => this.buffers.delete(file));
      }
      const decoded = await buffer;
      if (!isEnabled() || document.hidden || this.active.size >= 4) return;
      const source = ctx.createBufferSource(), gain = ctx.createGain();
      source.buffer = decoded;
      gain.gain.value = entry.volume * this.volume * (entry.music ? this.musicVolume : this.sfxVolume);
      source.connect(gain).connect(ctx.destination);
      this.active.set(source, { music: Boolean(entry.music), gain, base: entry.volume });
      source.onended = () => { this.active.delete(source); source.disconnect(); gain.disconnect(); };
      source.start();
    } catch { /* Playback failure must never affect gameplay. */ }
  }
  stopSound(music?: boolean) {
    for (const [source, category] of this.active) {
      if (music !== undefined && category.music !== music) continue;
      try { source.stop(); } catch { /* already stopped */ }
      this.active.delete(source);
    }
  }
}

export const audio = new AudioManager();
