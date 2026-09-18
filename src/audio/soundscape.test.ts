import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Soundscape } from './soundscape';
import type { SoundView } from './design';

class Parameter {
  value = 0;
  setValueAtTime = vi.fn((value: number) => { this.value = value; });
  setTargetAtTime = vi.fn((value: number) => { this.value = value; });
  linearRampToValueAtTime = vi.fn();
  exponentialRampToValueAtTime = vi.fn();
  cancelScheduledValues = vi.fn();
  cancelAndHoldAtTime = vi.fn();
}
class AudioNodeMock {
  gain = new Parameter(); frequency = new Parameter(); Q = new Parameter();
  type = ''; loop = false; buffer: unknown; onended: (() => void) | null = null;
  connect = vi.fn((other: AudioNodeMock) => other);
  disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class Context {
  static instances: Context[] = [];
  currentTime = 0; sampleRate = 1200; state = 'suspended';
  destination = new AudioNodeMock();
  oscillators: AudioNodeMock[] = []; sources: AudioNodeMock[] = []; gains: AudioNodeMock[] = []; filters: AudioNodeMock[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  suspend = vi.fn(async () => { this.state = 'suspended'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  createBuffer = vi.fn((_channels: number, samples: number) => ({ getChannelData: () => new Float32Array(samples) }));
  createBufferSource() { const node = new AudioNodeMock(); this.sources.push(node); return node; }
  createOscillator() { const node = new AudioNodeMock(); this.oscillators.push(node); return node; }
  createGain() { const node = new AudioNodeMock(); this.gains.push(node); return node; }
  createBiquadFilter() { const node = new AudioNodeMock(); this.filters.push(node); return node; }
  constructor() { Context.instances.push(this); }
}
class Element {
  textContent = ''; title = ''; className = ''; disabled = false;
  attrs = new Map<string, string>(); handlers = new Map<string, () => void>(); children: Element[] = [];
  setAttribute(key: string, value: string) { this.attrs.set(key, value); }
  addEventListener(key: string, handler: () => void) { this.handlers.set(key, handler); }
  removeEventListener(key: string) { this.handlers.delete(key); }
  appendChild(child: Element) { this.children.push(child); }
  remove = vi.fn();
}
let documentMock: Element & { hidden: boolean; createElement: () => Element };
const fixtures: Soundscape[] = [];
const view: SoundView = { daylight: 1, timeOfDay: 720, viewWidth: 25, population: 30, weather: 'clear' };
async function flush() { for (let i = 0; i < 8; i++) await Promise.resolve(); }
function fixture() {
  const root = new Element(), sound = new Soundscape(root as unknown as HTMLElement); fixtures.push(sound);
  const button = root.children[0];
  return { sound, button, click: async () => { button.handlers.get('click')!(); await flush(); } };
}
beforeEach(() => {
  Context.instances = [];
  documentMock = Object.assign(new Element(), { hidden: false, createElement: () => new Element() });
  vi.stubGlobal('document', documentMock); vi.stubGlobal('AudioContext', Context);
});
afterEach(() => { for (const sound of fixtures) sound.dispose(); fixtures.length = 0; vi.unstubAllGlobals(); });

describe('opt-in sound lifecycle', () => {
  it('creates no audio before a user gesture and ignores events while off', () => {
    const { sound, button } = fixture();
    sound.update(view); sound.opening({ type: 'restaurant', subtype: 'coffee' }); sound.concert(1);
    expect(Context.instances).toHaveLength(0); expect(button.attrs.get('aria-pressed')).toBe('false');
    expect(sound.status).toEqual({ enabled: false, state: 'not started', voices: 0 });
  });

  it('reuses one context, suspends when muted, and does not replay stopped opening notes', async () => {
    const f = fixture(); await f.click(); const context = Context.instances[0];
    expect(f.button.textContent).toBe('Sound on'); expect(context.sources).toHaveLength(1);
    f.sound.opening({ type: 'shop', subtype: 'boutique' });
    expect(f.sound.status.voices).toBe(6);
    const voices = context.oscillators.slice(1);
    await f.click();
    expect(context.state).toBe('suspended'); expect(f.sound.status.voices).toBe(0);
    expect(context.gains[0].gain.value).toBe(0);
    for (const voice of voices) { expect(voice.stop).toHaveBeenCalledTimes(2); expect(voice.disconnect).toHaveBeenCalledOnce(); }
    f.sound.opening({ type: 'residential' }); f.sound.concert(1);
    await f.click();
    expect(Context.instances).toHaveLength(1); expect(f.sound.status.voices).toBe(0);
    expect(context.state).toBe('running'); expect(f.button.attrs.get('aria-pressed')).toBe('true');
  });

  it('throttles smooth ambient automation and allocates no extra nodes when zooming', async () => {
    const f = fixture(); await f.click(); const c = Context.instances[0];
    for (let frame = 0; frame < 120; frame++) {
      c.currentTime = frame / 60;
      f.sound.update({ ...view, viewWidth: 20 + frame, weather: 'rain' });
    }
    expect(c.sources).toHaveLength(1); expect(c.oscillators).toHaveLength(1);
    expect(c.filters).toHaveLength(3); expect(c.gains).toHaveLength(5);
    for (const gain of c.gains.slice(1)) {
      expect(gain.gain.setTargetAtTime.mock.calls.length).toBeGreaterThan(10);
      expect(gain.gain.setTargetAtTime.mock.calls.length).toBeLessThanOrEqual(20);
      expect(gain.gain.cancelAndHoldAtTime.mock.calls.length).toBe(gain.gain.setTargetAtTime.mock.calls.length);
    }
  });

  it('supports browsers without cancelAndHoldAtTime', async () => {
    const f = fixture(); await f.click(); const c = Context.instances[0];
    for (const gain of c.gains) Object.assign(gain.gain, { cancelAndHoldAtTime: undefined });
    for (const filter of c.filters) Object.assign(filter.frequency, { cancelAndHoldAtTime: undefined });
    expect(() => f.sound.update(view)).not.toThrow();
    expect(c.gains[1].gain.cancelScheduledValues).toHaveBeenCalledOnce();
    expect(c.gains[1].gain.setValueAtTime).toHaveBeenCalledOnce();
  });

  it('cancels one-shots in hidden tabs and resumes ambience without a sound backlog', async () => {
    const f = fixture(); await f.click(); const c = Context.instances[0];
    c.currentTime = 10; f.sound.opening({ type: 'landmark', landmark: 'observatory' });
    expect(f.sound.status.voices).toBeGreaterThan(0);
    documentMock.hidden = true; documentMock.handlers.get('visibilitychange')!(); await flush();
    expect(c.state).toBe('suspended'); expect(f.sound.status.voices).toBe(0);
    const nodes = c.oscillators.length;
    c.currentTime = 100; f.sound.update(view); f.sound.concert(1); f.sound.opening({ type: 'residential' });
    expect(c.oscillators).toHaveLength(nodes);
    documentMock.hidden = false; documentMock.handlers.get('visibilitychange')!(); await flush();
    f.sound.update(view); f.sound.concert(1);
    expect(c.state).toBe('running'); expect(f.sound.status.voices).toBe(0);
    c.currentTime += 1.1; f.sound.concert(0.4); expect(f.sound.status.voices).toBe(12);
  });

  it('bounds overlapping cues and disconnects every ended voice', async () => {
    const f = fixture(); await f.click(); const c = Context.instances[0];
    for (let i = 0; i < 100; i++) {
      c.currentTime += 0.2; f.sound.opening({ type: 'restaurant', subtype: 'fastfood' }); f.sound.concert(1);
    }
    expect(f.sound.status.voices).toBe(32);
    const voices = c.oscillators.slice(1);
    for (const voice of voices) voice.onended!();
    expect(f.sound.status.voices).toBe(0);
    for (const voice of voices) expect(voice.disconnect).toHaveBeenCalledOnce();
    c.currentTime += 1; f.sound.opening({ type: 'residential' }); expect(f.sound.status.voices).toBe(4);
  });

  it('serializes rapid enable clicks and safely handles a denied audio start', async () => {
    const f = fixture();
    f.button.handlers.get('click')!(); f.button.handlers.get('click')!(); await flush();
    expect(Context.instances).toHaveLength(1); expect(f.sound.status.enabled).toBe(true);
    await f.click(); const c = Context.instances[0];
    c.resume.mockRejectedValueOnce(new Error('Audio blocked'));
    await f.click();
    expect(f.sound.status.enabled).toBe(false); expect(f.button.textContent).toBe('Sound unavailable');
    expect(f.button.attrs.get('aria-pressed')).toBe('false'); expect(f.button.disabled).toBe(false);
    expect(c.gains[0].gain.value).toBe(0);
    await f.click(); expect(f.sound.status.enabled).toBe(true);
  });

  it('re-suspends if the tab becomes hidden while resume is pending', async () => {
    const f = fixture(); await f.click(); await f.click(); const c = Context.instances[0];
    let finish!: () => void;
    c.resume.mockImplementationOnce(() => new Promise<void>((resolve) => { finish = () => { c.state = 'running'; resolve(); }; }));
    f.button.handlers.get('click')!();
    documentMock.hidden = true; documentMock.handlers.get('visibilitychange')!();
    finish(); await flush();
    expect(c.state).toBe('suspended'); expect(f.sound.status.voices).toBe(0);
  });

  it('releases sources, voices, graph and listeners exactly once', async () => {
    const f = fixture(); await f.click(); const c = Context.instances[0];
    f.sound.opening({ type: 'shop', subtype: 'electronics' });
    f.sound.dispose(); f.sound.dispose();
    expect(c.close).toHaveBeenCalledOnce(); expect(c.sources[0].stop).toHaveBeenCalledOnce();
    expect(c.oscillators[0].stop).toHaveBeenCalledOnce();
    for (const node of [...c.sources, ...c.oscillators, ...c.gains, ...c.filters]) expect(node.disconnect).toHaveBeenCalledOnce();
    expect(documentMock.handlers.has('visibilitychange')).toBe(false);
    expect(f.button.handlers.has('click')).toBe(false); expect(f.button.remove).toHaveBeenCalledOnce();
    expect(f.sound.status.voices).toBe(0);
    f.sound.update(view); f.sound.opening({ type: 'residential' }); expect(f.sound.status.voices).toBe(0);
  });
});
