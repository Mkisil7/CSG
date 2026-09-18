/** Live frame time only. Initialize from the first animation callback: its
 * timestamp can precede performance.now() during startup. Offline catch-up
 * has its own simulation path and must not be replayed as one giant frame. */
export class FrameClock {
  private previous: number | null = null;

  step(now: number): number {
    if (!Number.isFinite(now) || now < 0) return 0;
    if (this.previous === null) { this.previous = now; return 0; }
    if (now <= this.previous) return 0;
    const seconds = (now - this.previous) / 1000;
    this.previous = now;
    return Math.min(0.1, seconds);
  }
}
