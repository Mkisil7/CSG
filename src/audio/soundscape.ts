import { ambientMix, openingNotes, type Note, type OpeningFloor, type SoundView, type Timbre } from './design';

const MAX_VOICES = 32;
interface Voice { oscillator: OscillatorNode; gain: GainNode }

/** Synthesized locally: no downloads, tracking, or automatic audio on page load. */
export class Soundscape {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private air: GainNode | null = null;
  private hum: GainNode | null = null;
  private rain: GainNode | null = null;
  private street: GainNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private sustained: AudioScheduledSourceNode[] = [];
  private nodes: AudioNode[] = [];
  private voices = new Set<Voice>();
  private enabled = false;
  private busy = false;
  private disposed = false;
  private nextNature = 0;
  private nextConcert = 0;
  private nextOpening = 0;
  private nextMix = 0;
  private button: HTMLButtonElement;
  private readonly onClick = () => { void this.toggle(); };
  private readonly onVisibility = () => {
    if (!this.context || this.disposed) return;
    this.stopVoices();
    if (document.hidden) void this.context.suspend().catch(() => {});
    else if (this.enabled) void this.resume().catch(() => this.unavailable());
  };

  constructor(root: HTMLElement) {
    this.button = document.createElement('button');
    this.button.className = 'sound-toggle';
    this.button.textContent = 'Sound off';
    this.button.setAttribute('aria-pressed', 'false');
    this.button.title = 'Optional local sound · room, street and weather ambience follows the camera';
    this.button.addEventListener('click', this.onClick);
    root.appendChild(this.button);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  private async toggle(): Promise<void> {
    if (this.busy || this.disposed) return;
    this.busy = true; this.button.disabled = true;
    try {
      if (!this.context) this.initialize();
      const next = !this.enabled;
      this.enabled = next;
      if (next) await this.resume();
      else {
        this.master!.gain.cancelScheduledValues(this.context!.currentTime);
        this.master!.gain.setValueAtTime(0, this.context!.currentTime);
        this.stopVoices();
        await this.context!.suspend();
      }
      if (this.disposed) return;
      this.button.textContent = next ? 'Sound on' : 'Sound off';
      this.button.setAttribute('aria-pressed', String(next));
    } catch {
      this.unavailable();
    } finally {
      this.busy = false; this.button.disabled = false;
    }
  }

  private async resume(): Promise<void> {
    const context = this.context!;
    await context.resume();
    if (this.disposed) return;
    if (!this.enabled || document.hidden) { await context.suspend(); return; }
    this.master!.gain.cancelScheduledValues(context.currentTime);
    this.master!.gain.setTargetAtTime(0.17, context.currentTime, 0.2);
    // Returning to the tab never plays a backlog of nature calls or concert notes.
    this.nextNature = context.currentTime + 5;
    this.nextConcert = context.currentTime + 1;
    this.nextMix = 0;
  }

  private unavailable(): void {
    this.enabled = false;
    this.stopVoices();
    if (this.master && this.context) {
      this.master.gain.cancelScheduledValues(this.context.currentTime);
      this.master.gain.setValueAtTime(0, this.context.currentTime);
      void this.context.suspend().catch(() => {});
    }
    if (!this.disposed) {
      this.button.textContent = 'Sound unavailable';
      this.button.setAttribute('aria-pressed', 'false');
    }
  }

  private initialize(): void {
    const context = new AudioContext();
    this.context = context;
    this.master = context.createGain(); this.master.gain.value = 0; this.master.connect(context.destination);
    // Wind / distant traffic bed, filtered to avoid a harsh hiss.
    const noise = context.createBuffer(1, context.sampleRate * 3, context.sampleRate);
    const samples = noise.getChannelData(0);
    for (let i = 0; i < samples.length; i++) samples[i] = (Math.random() * 2 - 1) * 0.25;
    const source = context.createBufferSource(); source.buffer = noise; source.loop = true;
    const filter = context.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 600;
    this.air = context.createGain(); this.air.gain.value = 0;
    source.connect(filter).connect(this.air).connect(this.master);
    this.rainFilter = context.createBiquadFilter(); this.rainFilter.type = 'lowpass'; this.rainFilter.frequency.value = 1700;
    this.rain = context.createGain(); this.rain.gain.value = 0;
    source.connect(this.rainFilter).connect(this.rain).connect(this.master);
    // Low, distant street texture; no invented individual conversations or voices.
    const streetFilter = context.createBiquadFilter(); streetFilter.type = 'bandpass'; streetFilter.frequency.value = 280; streetFilter.Q.value = 0.6;
    this.street = context.createGain(); this.street.gain.value = 0;
    source.connect(streetFilter).connect(this.street).connect(this.master);
    const hum = context.createOscillator(); hum.type = 'sine'; hum.frequency.value = 75;
    this.hum = context.createGain(); this.hum.gain.value = 0;
    hum.connect(this.hum).connect(this.master);
    this.sustained = [source, hum];
    this.nodes = [source, hum, filter, this.rainFilter, streetFilter, this.air, this.hum, this.rain, this.street, this.master];
    source.start(); hum.start();
  }

  update(view: SoundView): void {
    const context = this.context;
    if (!this.audible() || !context || context.currentTime < this.nextMix) return;
    this.nextMix = context.currentTime + 0.1;
    const mix = ambientMix(view);
    this.target(this.air!.gain, mix.air);
    this.target(this.hum!.gain, mix.room);
    this.target(this.street!.gain, mix.street);
    this.target(this.rain!.gain, mix.rain);
    this.target(this.rainFilter!.frequency, mix.rainCutoff);
    if (context.currentTime >= this.nextNature) {
      this.nextNature = context.currentTime + mix.natureInterval;
      if (mix.natureVolume > 0) {
        const day = view.daylight > 0.5;
        this.note({ frequency: day ? 1200 : 1900, volume: mix.natureVolume, duration: day ? 0.13 : 0.07, delay: 0, timbre: 'soft' });
        this.note({ frequency: day ? 1650 : 1900, volume: mix.natureVolume * 0.65, duration: 0.09, delay: day ? 0.16 : 0.12, timbre: 'soft' });
      }
    }
  }

  private audible(): boolean {
    return this.enabled && !this.disposed && !document.hidden && this.context?.state === 'running';
  }

  private target(parameter: AudioParam, value: number): void {
    const now = this.context!.currentTime;
    if (typeof parameter.cancelAndHoldAtTime === 'function') parameter.cancelAndHoldAtTime(now);
    else {
      const current = parameter.value;
      parameter.cancelScheduledValues(now);
      parameter.setValueAtTime(current, now);
    }
    parameter.setTargetAtTime(value, now, 0.45);
  }

  /** Read-only diagnostics for the development audition panel. */
  get status(): { enabled: boolean; state: string; voices: number } {
    return { enabled: this.enabled, state: this.context?.state ?? 'not started', voices: this.voices.size };
  }

  opening(floor: OpeningFloor): void {
    const context = this.context;
    if (!this.audible() || !context || context.currentTime < this.nextOpening) return;
    this.nextOpening = context.currentTime + 0.15;
    for (const note of openingNotes(floor)) this.note(note);
  }

  concert(proximity: number): void {
    const context = this.context;
    if (!this.audible() || !context || !Number.isFinite(proximity) || proximity <= 0 || context.currentTime < this.nextConcert) return;
    this.nextConcert = context.currentTime + 8;
    [196, 247, 294, 330, 294, 247].forEach((frequency, i) => this.note({
      frequency, volume: 0.045 * Math.min(1, proximity), duration: 0.5, delay: i * 0.3, timbre: 'pluck',
    }));
  }

  private note(note: Note): void {
    if (!this.audible() || !this.context || !this.master) return;
    const partials: Record<Timbre, readonly [number, number, OscillatorType][]> = {
      soft: [[1, 1, 'sine']], pluck: [[1, 0.8, 'triangle'], [2, 0.12, 'sine']],
      wood: [[1, 0.85, 'sine'], [2.76, 0.12, 'sine']],
      bell: [[1, 0.8, 'sine'], [2, 0.22, 'sine']], glass: [[1, 0.7, 'sine'], [3, 0.18, 'sine']],
    };
    for (const [ratio, strength, shape] of partials[note.timbre]) {
      if (this.voices.size >= MAX_VOICES) break;
      const osc = this.context.createOscillator(), gain = this.context.createGain();
      const start = this.context.currentTime + note.delay;
      const duration = note.duration / (ratio === 1 ? 1 : 1.6);
      const attack = note.timbre === 'soft' ? 0.035 : 0.008;
      osc.type = shape; osc.frequency.value = note.frequency * ratio;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(note.volume * strength, start + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
      gain.gain.linearRampToValueAtTime(0, start + duration + 0.02);
      osc.connect(gain).connect(this.master);
      const voice = { oscillator: osc, gain }; this.voices.add(voice);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); this.voices.delete(voice); };
      osc.start(start); osc.stop(start + duration + 0.03);
    }
  }

  private stopVoices(): void {
    for (const { oscillator, gain } of this.voices) {
      oscillator.onended = null;
      oscillator.stop(); oscillator.disconnect(); gain.disconnect();
    }
    this.voices.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true; this.enabled = false;
    this.button.removeEventListener('click', this.onClick);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stopVoices();
    for (const source of this.sustained) source.stop();
    for (const node of this.nodes) node.disconnect();
    if (this.context) void this.context.close().catch(() => {});
    this.button.remove();
  }
}
