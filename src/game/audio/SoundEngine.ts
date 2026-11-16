/**
 * 100% Procedural Web Audio API sound engine for World of Adventure.
 * Zero external audio file dependencies.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private effectsGain: GainNode | null = null;
  private voiceGain: GainNode | null = null;
  private muted = false;
  private masterVolume = 0.85;
  private musicVolume = 0.7;
  private effectsVolume = 0.9;
  private voiceVolume = 0.9;
  private footstepVolume = 0.3;
  private noiseBuffer: AudioBuffer | null = null;
  private longNoiseBuffer: AudioBuffer | null = null;

  // Persistent ambient weather audio graph
  private rainSource: AudioBufferSourceNode | null = null;
  private rainFilter: BiquadFilterNode | null = null;
  private rainGain: GainNode | null = null;
  private windSource: AudioBufferSourceNode | null = null;
  private windFilter: BiquadFilterNode | null = null;
  private windGain: GainNode | null = null;

  public unlock(): void {
    if (typeof window === 'undefined') return;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AudioCtx) return;
      this.ctx = new AudioCtx();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.muted ? 0 : this.masterVolume * 0.55;
      this.masterGain.connect(this.ctx.destination);

      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicVolume;
      this.musicGain.connect(this.masterGain);

      this.effectsGain = this.ctx.createGain();
      this.effectsGain.gain.value = this.effectsVolume;
      this.effectsGain.connect(this.masterGain);

      this.voiceGain = this.ctx.createGain();
      this.voiceGain.gain.value = this.voiceVolume;
      this.voiceGain.connect(this.masterGain);

      this.noiseBuffer = this.createNoiseBuffer(this.ctx, 0.5);
      this.longNoiseBuffer = this.createPinkNoiseBuffer(this.ctx, 3.0);
      this.initWeatherAmbientGraph(this.ctx, this.musicGain, this.longNoiseBuffer);
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
  }

  public setAudioVolumes(vols: {
    masterVolume?: number;
    musicVolume?: number;
    effectsVolume?: number;
    voiceVolume?: number;
    footstepVolume?: number;
    muted?: boolean;
  }): void {
    if (vols.masterVolume !== undefined) {
      this.masterVolume = Math.max(0, Math.min(1, vols.masterVolume));
    }
    if (vols.musicVolume !== undefined) {
      this.musicVolume = Math.max(0, Math.min(1, vols.musicVolume));
    }
    if (vols.effectsVolume !== undefined) {
      this.effectsVolume = Math.max(0, Math.min(1, vols.effectsVolume));
    }
    if (vols.voiceVolume !== undefined) {
      this.voiceVolume = Math.max(0, Math.min(1, vols.voiceVolume));
    }
    if (vols.footstepVolume !== undefined) {
      this.footstepVolume = Math.max(0, Math.min(1, vols.footstepVolume));
    }
    if (vols.muted !== undefined) {
      this.muted = vols.muted;
    }

    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.masterGain) {
      this.masterGain.gain.setTargetAtTime(
        this.muted ? 0 : this.masterVolume * 0.55,
        now,
        0.04,
      );
    }
    if (this.musicGain) {
      this.musicGain.gain.setTargetAtTime(this.musicVolume, now, 0.04);
    }
    if (this.effectsGain) {
      this.effectsGain.gain.setTargetAtTime(this.effectsVolume, now, 0.04);
    }
    if (this.voiceGain) {
      this.voiceGain.gain.setTargetAtTime(this.voiceVolume, now, 0.04);
    }
  }

  public setMuted(muted: boolean): void {
    this.setAudioVolumes({ muted });
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private createNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  private createPinkNoiseBuffer(ctx: AudioContext, durationSec: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * durationSec);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + white * 0.099046;
      b1 = 0.963 * b1 + white * 0.2965164;
      b2 = 0.57 * b2 + white * 1.0526913;
      data[i] = Math.max(-1, Math.min(1, (b0 + b1 + b2 + white * 0.1848) * 0.18));
    }
    return buffer;
  }

  private initWeatherAmbientGraph(
    ctx: AudioContext,
    master: GainNode,
    pinkNoise: AudioBuffer,
  ): void {
    // Rain steady bed
    const rainSrc = ctx.createBufferSource();
    rainSrc.buffer = pinkNoise;
    rainSrc.loop = true;

    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'lowpass';
    rainFilter.frequency.value = 1600;
    rainFilter.Q.value = 0.7;

    const rainGain = ctx.createGain();
    rainGain.gain.value = 0;

    rainSrc.connect(rainFilter);
    rainFilter.connect(rainGain);
    rainGain.connect(master);
    rainSrc.start();

    // Wind gust layer
    const windSrc = ctx.createBufferSource();
    windSrc.buffer = pinkNoise;
    windSrc.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 340;
    windFilter.Q.value = 2.6;

    const windGain = ctx.createGain();
    windGain.gain.value = 0;

    windSrc.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(master);
    windSrc.start(ctx.currentTime, 1.1);

    this.rainSource = rainSrc;
    this.rainFilter = rainFilter;
    this.rainGain = rainGain;
    this.windSource = windSrc;
    this.windFilter = windFilter;
    this.windGain = windGain;
  }

  /**
   * Smoothly updates continuous ambient rain and wind audio levels.
   */
  public updateWeatherAudio(
    rainIntensity: number,
    windStrength: number,
    active: boolean,
    elapsed = 0,
  ): void {
    if (!this.ctx || !this.rainGain || !this.windGain || !this.rainFilter || !this.windFilter) {
      return;
    }
    const now = this.ctx.currentTime;
    const isAudible = active && !this.muted;

    const targetRainGain = isAudible ? Math.max(0, Math.min(0.24, rainIntensity * 0.22)) : 0;
    const targetRainFreq = 950 + rainIntensity * 1650;

    // Gentle wind gust modulation
    const gust = 0.8 + 0.2 * Math.sin(elapsed * 0.65) * Math.cos(elapsed * 0.27);
    const windAudibleThreshold = Math.max(0, windStrength - 0.18) / 0.82;
    const targetWindGain = isAudible
      ? Math.max(0, Math.min(0.16, windAudibleThreshold * 0.14 * gust))
      : 0;
    const targetWindFreq = 240 + windStrength * 420 * gust;

    this.rainGain.gain.setTargetAtTime(targetRainGain, now, 0.25);
    this.rainFilter.frequency.setTargetAtTime(targetRainFreq, now, 0.25);
    this.windGain.gain.setTargetAtTime(targetWindGain, now, 0.3);
    this.windFilter.frequency.setTargetAtTime(targetWindFreq, now, 0.3);
  }

  /**
   * Synthesizes layered procedural thunder (crack for nearby strikes + rolling sub-bass rumble).
   */
  public playThunder(intensity = 0.85, distanceMeters = 400): void {
    if (this.muted || !this.ctx || !this.masterGain || !this.longNoiseBuffer) return;
    const now = this.ctx.currentTime;
    const distFactor = Math.max(0.32, Math.min(1.0, 1 - (distanceMeters - 180) / 950));
    const power = Math.max(0.25, Math.min(1.0, intensity)) * distFactor;
    const rumbleDuration = 2.1 + (1 - distFactor) * 1.9;

    // 1. Deep rolling noise bed
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.longNoiseBuffer;

    const rumbleFilter = this.ctx.createBiquadFilter();
    rumbleFilter.type = 'lowpass';
    rumbleFilter.frequency.setValueAtTime(160 + distFactor * 260, now);
    rumbleFilter.frequency.exponentialRampToValueAtTime(38, now + rumbleDuration);
    rumbleFilter.Q.value = 1.1;

    const rumbleGain = this.ctx.createGain();
    rumbleGain.gain.setValueAtTime(0.001, now);
    rumbleGain.gain.linearRampToValueAtTime(0.46 * power, now + 0.09);
    rumbleGain.gain.setValueAtTime(0.36 * power, now + 0.28);
    rumbleGain.gain.linearRampToValueAtTime(0.29 * power, now + 0.65);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + rumbleDuration);

    const effectsBus = this.effectsGain ?? this.masterGain;
    noise.connect(rumbleFilter);
    rumbleFilter.connect(rumbleGain);
    rumbleGain.connect(effectsBus);
    noise.start(now, Math.random() * 0.7, rumbleDuration + 0.05);

    // 2. Sub-bass pressure wave
    const subOsc = this.ctx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(56 + distFactor * 22, now);
    subOsc.frequency.exponentialRampToValueAtTime(26, now + 1.35);

    const subGain = this.ctx.createGain();
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.28 * power, now + 0.06);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 1.45);

    subOsc.connect(subGain);
    subGain.connect(effectsBus);
    subOsc.start(now);
    subOsc.stop(now + 1.5);

    // 3. Sharp initial thunderclap crack for closer strikes (< 420m)
    if (distanceMeters < 420 && this.noiseBuffer) {
      const crack = this.ctx.createBufferSource();
      crack.buffer = this.noiseBuffer;

      const crackFilter = this.ctx.createBiquadFilter();
      crackFilter.type = 'bandpass';
      crackFilter.frequency.setValueAtTime(980, now);
      crackFilter.frequency.exponentialRampToValueAtTime(190, now + 0.34);
      crackFilter.Q.value = 0.85;

      const crackGain = this.ctx.createGain();
      crackGain.gain.setValueAtTime(0.001, now);
      crackGain.gain.linearRampToValueAtTime(0.34 * power, now + 0.014);
      crackGain.gain.exponentialRampToValueAtTime(0.001, now + 0.38);

      crack.connect(crackFilter);
      crackFilter.connect(crackGain);
      crackGain.connect(effectsBus);
      crack.start(now, 0, 0.4);
    }
  }

  public playFootstep(
    movement: boolean | 'walking' | 'running' | 'sprinting' | 'crouching' = false,
  ): void {
    const out = this.effectsGain ?? this.masterGain;
    if (
      this.muted ||
      this.footstepVolume <= 0.001 ||
      !this.ctx ||
      !out ||
      !this.noiseBuffer
    ) {
      return;
    }
    const mode: 'walking' | 'running' | 'sprinting' | 'crouching' =
      typeof movement === 'boolean'
        ? movement
          ? 'sprinting'
          : 'walking'
        : movement;

    const now = this.ctx.currentTime;

    // Soft grass/earth rustle using band-passed noise burst
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const baseFreq =
      mode === 'crouching'
        ? 410 + Math.random() * 90
        : mode === 'walking'
          ? 520 + Math.random() * 130
          : mode === 'running'
            ? 620 + Math.random() * 160
            : 710 + Math.random() * 180;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(baseFreq, now);
    filter.Q.setValueAtTime(1.25, now);

    // Calibrated so default footstepVolume (0.3) produces ~28–30% of prior loudness
    const stateBasePeak =
      mode === 'crouching'
        ? 0.045
        : mode === 'walking'
          ? 0.095
          : mode === 'running'
            ? 0.13
            : 0.16;
    const peak = Math.max(0.001, Math.min(0.25, stateBasePeak * this.footstepVolume));

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(peak, now + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.11);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(out);

    noise.start(now, Math.random() * 0.2, 0.12);
  }

  public playJump(): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(155, now);
    osc.frequency.exponentialRampToValueAtTime(340, now + 0.16);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playLand(impactStrength = 1): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;
    const strength = Math.min(Math.max(impactStrength, 0.3), 1.8);

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(115 * strength, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.14);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.22 * strength, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.17);
  }

  public playUiClick(): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(740, now + 0.06);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.075);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playAttackSwing(): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(920, now);
    filter.frequency.exponentialRampToValueAtTime(340, now + 0.14);
    filter.Q.setValueAtTime(1.4, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.22, now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(out);
    noise.start(now, 0, 0.16);
  }

  public playHitImpact(isCrit = false): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = isCrit ? 'sawtooth' : 'triangle';
    osc.frequency.setValueAtTime(isCrit ? 290 : 200, now);
    osc.frequency.exponentialRampToValueAtTime(62, now + 0.12);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(isCrit ? 0.28 : 0.21, now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.14);
  }

  public playEnemyDefeat(): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(360, now);
    osc.frequency.setValueAtTime(520, now + 0.07);
    osc.frequency.exponentialRampToValueAtTime(680, now + 0.22);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.26);
  }

  public playPlayerHurt(): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(145, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + 0.16);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.24, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playInteract(): void {
    const out = this.voiceGain ?? this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.setValueAtTime(587.33, now + 0.06);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(0.14, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.24);
  }

  public playBowDraw(): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(185, now + 0.16);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.09, now + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.19);
  }

  public playBowFullCharge(): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(660, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.09);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.08, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.15);
  }

  public playBowRelease(charge = 1): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;
    const clamped = Math.max(0, Math.min(1, charge));

    // Bowstring twang
    const twang = this.ctx.createOscillator();
    twang.type = 'triangle';
    twang.frequency.setValueAtTime(210 + clamped * 110, now);
    twang.frequency.exponentialRampToValueAtTime(75, now + 0.14);

    const twangGain = this.ctx.createGain();
    twangGain.gain.setValueAtTime(0.001, now);
    twangGain.gain.exponentialRampToValueAtTime(0.16 + clamped * 0.12, now + 0.012);
    twangGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    twang.connect(twangGain);
    twangGain.connect(out);
    twang.start(now);
    twang.stop(now + 0.17);

    // Arrow whoosh
    if (this.noiseBuffer) {
      const noise = this.ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1100 + clamped * 900, now);
      filter.frequency.exponentialRampToValueAtTime(420, now + 0.15);
      filter.Q.setValueAtTime(1.6, now);

      const nGain = this.ctx.createGain();
      nGain.gain.setValueAtTime(0.001, now);
      nGain.gain.exponentialRampToValueAtTime(0.12 + clamped * 0.12, now + 0.015);
      nGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

      noise.connect(filter);
      filter.connect(nGain);
      nGain.connect(out);
      noise.start(now, 0, 0.18);
    }
  }

  public playBowEmpty(): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.06);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  public playArrowStick(): void {
    const out = this.effectsGain ?? this.masterGain;
    if (this.muted || !this.ctx || !out) return;
    const now = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(68, now + 0.075);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.11, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(out);
    osc.start(now);
    osc.stop(now + 0.09);
  }

  public dispose(): void {
    try {
      this.rainSource?.stop();
    } catch {
      // Ignore already stopped
    }
    try {
      this.windSource?.stop();
    } catch {
      // Ignore already stopped
    }
    this.rainSource = null;
    this.windSource = null;
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
      this.masterGain = null;
    }
  }
}
