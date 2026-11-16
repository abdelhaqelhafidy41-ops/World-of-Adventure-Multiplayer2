/**
 * Rolling frame-time and FPS performance monitor.
 * Uses a fixed-size ring buffer (zero per-frame allocations) to provide
 * smoothed FPS, 1% low / minimum window FPS, and frame time in milliseconds.
 */
export class PerformanceMonitor {
  private readonly sampleCount = 60;
  private readonly frameTimesMs = new Float32Array(60);
  private writeIndex = 0;
  private filledSamples = 0;

  private lastTimestampMs = 0;
  private smoothedFps = 60;
  private smoothedFrameMs = 16.67;
  private minWindowFps = 60;

  public recordFrame(nowMs: number): { fps: number; frameTimeMs: number } {
    if (this.lastTimestampMs <= 0) {
      this.lastTimestampMs = nowMs;
      return { fps: this.smoothedFps, frameTimeMs: this.smoothedFrameMs };
    }

    const rawDeltaMs = nowMs - this.lastTimestampMs;
    this.lastTimestampMs = nowMs;

    // Ignore tab-switch spikes > 250ms when computing rolling frame average
    if (rawDeltaMs <= 0 || rawDeltaMs > 250) {
      return { fps: this.smoothedFps, frameTimeMs: this.smoothedFrameMs };
    }

    this.frameTimesMs[this.writeIndex] = rawDeltaMs;
    this.writeIndex = (this.writeIndex + 1) % this.sampleCount;
    if (this.filledSamples < this.sampleCount) {
      this.filledSamples++;
    }

    let sumMs = 0;
    let maxMs = 0;
    for (let i = 0; i < this.filledSamples; i++) {
      const val = this.frameTimesMs[i];
      sumMs += val;
      if (val > maxMs) maxMs = val;
    }

    const avgMs = sumMs / Math.max(1, this.filledSamples);
    this.smoothedFrameMs = avgMs;
    this.smoothedFps = avgMs > 0.1 ? 1000 / avgMs : 120;
    this.minWindowFps = maxMs > 0.1 ? 1000 / maxMs : this.smoothedFps;

    return { fps: this.smoothedFps, frameTimeMs: this.smoothedFrameMs };
  }

  public reset(initialFps = 60): void {
    this.writeIndex = 0;
    this.filledSamples = 0;
    this.lastTimestampMs = 0;
    this.smoothedFps = initialFps;
    this.smoothedFrameMs = initialFps > 0 ? 1000 / initialFps : 16.67;
    this.minWindowFps = initialFps;
  }

  public getSmoothedFps(): number {
    return this.smoothedFps;
  }

  public getSmoothedFrameMs(): number {
    return this.smoothedFrameMs;
  }

  public getMinWindowFps(): number {
    return this.minWindowFps;
  }

  public hasWarmSamples(minSamples = 24): boolean {
    return this.filledSamples >= minSamples;
  }
}
