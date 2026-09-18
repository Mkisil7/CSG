import { afterEach, describe, expect, it, vi } from 'vitest';
import { Town } from '../core/town';
import { RoomControls, roomCaption } from './roomControls';

class Element extends EventTarget {
  hidden = false; disabled = false; className = ''; textContent = ''; title = '';
  dataset: Record<string, string> = {}; attributes = new Map<string, string>(); children: Element[] = [];
  setAttribute(key: string, value: string) { this.attributes.set(key, value); }
  append(element: Element) { this.children.push(element); }
  focus() { (document as unknown as { activeElement: Element }).activeElement = this; }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click')); }
  set innerHTML(_value: string) {
    this.children = ['-2', '-0.3', 'reset', '0.3', '2', 'caption'].map(value => {
      const child = new Element();
      if (value === 'caption') child.dataset.roomCaption = '';
      else if (value === 'reset') child.dataset.reset = '';
      else child.dataset[value.includes('.') ? 'zoom' : 'pan'] = value;
      return child;
    });
  }
  querySelectorAll(selector: string) {
    return this.children.filter(child => selector === '[data-pan]' ? 'pan' in child.dataset : 'zoom' in child.dataset);
  }
  querySelector(selector: string) {
    if (selector === '[data-reset]') return this.children[2];
    if (selector === '[data-room-caption]') return this.children[5];
    return this.children[selector.includes('-0.3') ? 1 : 3];
  }
}
afterEach(() => { vi.unstubAllGlobals(); });
function setup() {
  const app = new Element(), canvas = new Element();
  vi.stubGlobal('document', { activeElement: null, createElement: () => new Element(), getElementById: () => app });
  const state = { active: true, zoom: 2.4, label: 'Floor 3 · Raincheck Coffee' };
  const actions = { state: () => state, pan: vi.fn(), zoom: vi.fn(), reset: vi.fn(() => { state.active = false; }),
    key: vi.fn((key: string) => { if (key !== 'Escape') return false; state.active = false; return true; }) };
  const controls = new RoomControls(canvas as unknown as HTMLCanvasElement, actions);
  const root = controls.root as unknown as Element; controls.update();
  return { controls, root, canvas, state, actions, caption: root.children[5] };
}

describe('room exploration captions', () => {
  it('names the camera-centered floor, follows renames, and identifies the rooftop', () => {
    const game = new Town().towers()[0], floor = game.tower.addFloor('restaurant', 'coffee'); floor.name = 'Raincheck';
    expect(roomCaption(game.tower.floors, 4.5, 'Willow')).toBe('Floor 1 · Raincheck');
    floor.name = 'New name'; expect(roomCaption(game.tower.floors, 3, 'Willow')).toBe('Floor 1 · New name');
    expect(roomCaption(game.tower.floors, 6, 'Willow')).toBe('Rooftop · Willow');
    expect(roomCaption(game.tower.floors, -1, 'Willow')).toBe(`Floor 0 · ${game.tower.floors[0].name}`);
    expect(roomCaption(game.tower.floors, NaN, 'Willow')).toBe(''); expect(roomCaption([], 0, 'Willow')).toBe('');
  });
  it('updates names as text without replacing focused controls, and preserves keyboard guidance', () => {
    const s = setup(), button = s.root.children[0]; button.focus();
    s.state.label = 'Floor 4 · <img src=x onerror=alert(1)> & friends'; s.controls.update();
    expect(s.caption.textContent).toBe(s.state.label); expect(s.caption.children).toHaveLength(0);
    expect(s.caption.title).toContain('arrow keys'); expect(s.root.attributes.get('aria-description')).toContain('Esc resets');
    expect(s.root.children[0]).toBe(button); expect(document.activeElement).toBe(button);
    s.state.label = ''; s.controls.update(); expect(s.caption.textContent).toContain('Drag to explore');
  });
  it('keeps bounds, covered state, panning and full-tower reset functional', () => {
    const s = setup(); expect(s.root.hidden).toBe(false);
    s.root.children[0].click(); s.root.children[4].click(); expect(s.actions.pan.mock.calls).toEqual([[-2], [2]]);
    s.root.children[1].click(); expect(s.actions.zoom).toHaveBeenCalledWith(-0.3);
    s.state.zoom = 1.5; s.controls.update(); expect(s.root.children[1].disabled).toBe(true);
    s.state.zoom = 3; s.controls.update(); expect(s.root.children[3].disabled).toBe(true);
    s.controls.update(true); expect(s.root.hidden).toBe(true); s.controls.update(); expect(s.root.hidden).toBe(false);
    s.root.children[2].click(); expect(s.root.hidden).toBe(true); expect(document.activeElement).toBe(s.canvas);
  });
  it('returns focus to the scene after Escape', () => {
    const s = setup(), event = new Event('keydown', { cancelable: true }); Object.defineProperty(event, 'key', { value: 'Escape' });
    s.root.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
    expect(s.root.hidden).toBe(true); expect(document.activeElement).toBe(s.canvas);
  });
});
