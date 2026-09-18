import { describe, expect, it, vi } from 'vitest';
import { Town } from '../core/town';
import { createPostcard, postcardFilename } from './postcard';

describe('postcard keepsake', () => {
  it('uses a safe, nonempty filename for named and Unicode towns', () => {
    expect(postcardFilename('Maya’s / town')).toBe('Maya-s-town-postcard.png');
    expect(postcardFilename('東京 🌇')).toBe('tower-town-postcard.png');
    expect(postcardFilename('a'.repeat(100))).toBe(`${'a'.repeat(32)}-postcard.png`);
  });
  it('composes a full-resolution image with actual town identity and statistics', () => {
    const context = { fillRect: vi.fn(), drawImage: vi.fn(), fillText: vi.fn() };
    const canvas = { width: 0, height: 0, getContext: () => context };
    vi.stubGlobal('document', { createElement: () => canvas });
    try {
      const town = new Town(); town.identity.name = 'Our little place';
      const source = { width: 1504, height: 730 } as HTMLCanvasElement;
      expect(createPostcard(source, town)).toBe(canvas);
      expect([canvas.width, canvas.height]).toEqual([1600, 1100]);
      expect(context.drawImage).toHaveBeenCalledWith(source, 48, 178, 1504, 730);
      expect(context.fillText).toHaveBeenCalledWith('Our little place', 48, 135, 1420);
      expect(context.fillText.mock.calls.some(([text]) => text.includes(`${town.population} neighbors`))).toBe(true);
    } finally { vi.unstubAllGlobals(); }
  });
});
