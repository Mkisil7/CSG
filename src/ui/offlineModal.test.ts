import { describe, expect, it, vi } from 'vitest';
import type { OfflineReport } from '../core/offline';
import { offlineSummary, showOfflineModal, showCatchupProgress } from './offlineModal';
import { GAME_MINUTES_PER_SECOND } from '../core/types';

function report(overrides: Partial<OfflineReport> = {}): OfflineReport {
  return { townName: 'Our town', awayRealSeconds: 240, simulatedGameMinutes: 240 * GAME_MINUTES_PER_SECOND,
    coinsEarned: 60, moveIns: 1, moveOuts: 0, promotions: 1, missionsCompleted: 1,
    peakAverageWaitMinutes: 7.5, highlights: [], ...overrides };
}

describe('a readable, honest return to town', () => {
  it.each(['click', 'cancel'])('keeps the progress dialog open until actual catch-up stops (%s)', (action) => {
    const stop = Object.assign(new EventTarget(), { disabled: false, textContent: 'Return now' });
    const bar = { value: 0 }, status = { textContent: '' };
    class Dialog extends EventTarget {
      open = false;
      showModal() { this.open = true; }
      close() { this.open = false; }
      querySelector(selector: string) {
        return selector === '[data-catchup-stop]' ? stop : selector === 'progress' ? bar : status;
      }
    }
    const dialog = new Dialog(), root = { innerHTML: '', querySelector: () => dialog };
    const view = showCatchupProgress(root as unknown as HTMLElement);
    expect(dialog.open).toBe(true); expect(view.signal.aborted).toBe(false);
    view.update({ completedMinutes: 25, totalMinutes: 100 });
    expect(bar.value).toBe(25); expect(status.textContent).toContain('25%');
    const event = new Event(action, { cancelable: true });
    (action === 'cancel' ? dialog : stop).dispatchEvent(event);
    expect(view.signal.aborted).toBe(true); expect(stop.disabled).toBe(true);
    expect(dialog.open).toBe(true); // Do not expose a partially running town.
    if (action === 'cancel') expect(event.defaultPrevented).toBe(true);
    view.finish(); expect(dialog.open).toBe(false); expect(root.innerHTML).toBe('');
  });
  it('labels net balance and already-received rewards without a claim button or invented story', () => {
    const html = offlineSummary(report());
    expect(html).toContain('balance grew by <b>60</b>');
    expect(html).toContain('Rewards are already in your balance');
    expect(html).toContain('Highest sampled average lift wait');
    expect(html).toContain('paused while you read');
    expect(html).toContain('class="offline-title" tabindex="-1" autofocus');
    expect(html).not.toContain('A few moments you missed');
    expect(html).not.toContain('not simulated');
    expect(offlineSummary(report({ coinsEarned: -23 }))).toContain('balance fell by <b>23</b> coins after income and upkeep');
  });
  it('explains capped time and escapes actual names and memories', () => {
    const html = offlineSummary(report({ townName: '<img onerror="x">', awayRealSeconds: 24 * 3600,
      simulatedGameMinutes: 10 * 3600 * GAME_MINUTES_PER_SECOND,
      highlights: [{ id: 1, day: 2, kind: 'career', title: '<script>Maya</script>', text: 'Cook at A&B', residentIds: ['missing'] }] }));
    expect(html).toContain('Away for 24h 0m'); expect(html).toContain('Simulated 10h 0m at 1×');
    expect(html).toContain('the rest of your time away was not simulated');
    expect(html).not.toContain('<script>'); expect(html).not.toContain('<img');
    expect(html).toContain('&lt;script&gt;Maya'); expect(html).toContain('Cook at A&amp;B');
    expect(html).not.toContain('data-resident='); // Departed people remain honest memories, not broken links.
    const early = offlineSummary(report({ awayRealSeconds: 240, simulatedGameMinutes: 239 * GAME_MINUTES_PER_SECOND }));
    expect(early).toContain('the rest of your time away was not simulated');
    expect(offlineSummary(report({ simulatedGameMinutes: 0 }))).toContain('Simulated 0 seconds');
  });
  it.each([false, true])('uses the native modal and routes dismissal to journal=%s exactly once', (journal) => {
    const back = new EventTarget(), read = new EventTarget();
    class Dialog extends EventTarget {
      open = false; returnValue = '';
      showModal() { this.open = true; }
      close(value = '') { this.returnValue = value; this.open = false; this.dispatchEvent(new Event('close')); }
      querySelector(selector: string) { return selector === '[data-return-dismiss]' ? back : read; }
    }
    const dialog = new Dialog(), root = { innerHTML: '', querySelector: () => dialog };
    const onDismiss = vi.fn();
    expect(showOfflineModal(root as unknown as HTMLElement, report(), onDismiss)).toBe(dialog);
    expect(dialog.open).toBe(true); expect(root.innerHTML).toContain('aria-labelledby="offline-title"');
    (journal ? read : back).dispatchEvent(new Event('click'));
    expect(dialog.open).toBe(false); expect(root.innerHTML).toBe('');
    expect(onDismiss).toHaveBeenCalledTimes(1); expect(onDismiss).toHaveBeenCalledWith(journal);
    dialog.dispatchEvent(new Event('close')); expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
