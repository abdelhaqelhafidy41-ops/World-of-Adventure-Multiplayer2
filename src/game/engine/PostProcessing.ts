import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import type {
  AntiAliasingMode,
  PostProcessingTier,
} from './GraphicsQualityManager';

/**
 * Configurable GPU post-processing pipeline supporting:
 * - Direct bypass (`renderer.render`) when postProcessing === 'off' and antiAliasing !== 'fxaa'
 * - Half/quarter-res HDR UnrealBloomPass
 * - OutputPass (ACESFilmic tone mapping + SRGB conversion)
 * - Optional FXAA pass or MSAA render target when composer is active
 */
export class PostProcessingPipeline {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;

  private composer: EffectComposer;
  private renderTarget: THREE.WebGLRenderTarget;
  private readonly renderPass: RenderPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly outputPass: OutputPass;
  private readonly fxaaPass: ShaderPass;

  private postTier: PostProcessingTier = 'high';
  private aaMode: AntiAliasingMode = 'fxaa';
  private width: number;
  private height: number;
  private pixelRatio = 1;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number,
    pixelRatio = 1,
    postTier: PostProcessingTier = 'high',
    aaMode: AntiAliasingMode = 'fxaa',
  ) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = pixelRatio;
    this.postTier = postTier;
    this.aaMode = aaMode;

    this.renderTarget = this.createRenderTarget(this.width, this.height, this.pixelRatio, aaMode);
    this.composer = new EffectComposer(renderer, this.renderTarget);
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(this.width, this.height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    const halfW = Math.max(1, Math.floor(this.width * 0.5));
    const halfH = Math.max(1, Math.floor(this.height * 0.5));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(halfW, halfH),
      0.22,
      0.42,
      0.9,
    );
    this.composer.addPass(this.bloomPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);

    this.fxaaPass = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaaPass);

    this.syncPassStates();
    this.updateFxaaResolution();
  }

  private createRenderTarget(
    width: number,
    height: number,
    pixelRatio: number,
    aaMode: AntiAliasingMode,
  ): THREE.WebGLRenderTarget {
    const rtW = Math.max(1, Math.floor(width * pixelRatio));
    const rtH = Math.max(1, Math.floor(height * pixelRatio));
    const samples = aaMode === 'msaa' ? 4 : 0;
    return new THREE.WebGLRenderTarget(rtW, rtH, {
      type: THREE.HalfFloatType,
      samples,
    });
  }

  public isBypassed(): boolean {
    return this.postTier === 'off' && this.aaMode !== 'fxaa';
  }

  public setMode(postTier: PostProcessingTier, aaMode: AntiAliasingMode): void {
    const msaaChanged = (this.aaMode === 'msaa') !== (aaMode === 'msaa');
    this.postTier = postTier;
    this.aaMode = aaMode;

    if (msaaChanged) {
      const nextRt = this.createRenderTarget(
        this.width,
        this.height,
        this.pixelRatio,
        aaMode,
      );
      this.composer.reset(nextRt);
      this.renderTarget.dispose();
      this.renderTarget = nextRt;
    }

    this.syncPassStates();
    this.updateBloomResolution();
    this.updateFxaaResolution();
  }

  private syncPassStates(): void {
    this.bloomPass.enabled = this.postTier !== 'off';
    this.fxaaPass.enabled = this.aaMode === 'fxaa';
    this.outputPass.enabled = true;
  }

  private updateBloomResolution(): void {
    const factor = this.postTier === 'low' ? 0.25 : 0.5;
    this.bloomPass.resolution.set(
      Math.max(1, Math.floor(this.width * factor)),
      Math.max(1, Math.floor(this.height * factor)),
    );
  }

  private updateFxaaResolution(): void {
    const invW = 1 / Math.max(1, this.width * this.pixelRatio);
    const invH = 1 / Math.max(1, this.height * this.pixelRatio);
    const resUniform = this.fxaaPass.material?.uniforms?.['resolution'];
    if (resUniform?.value) {
      resUniform.value.set(invW, invH);
    }
  }

  public update(nightFactor: number, lightningFlash: number): void {
    if (!this.bloomPass.enabled) return;
    const tierScale =
      this.postTier === 'low' ? 0.72 : this.postTier === 'medium' ? 0.88 : 1.0;
    this.bloomPass.strength =
      (0.2 + nightFactor * 0.12 + lightningFlash * 0.24) * tierScale;
    this.bloomPass.threshold = THREE.MathUtils.lerp(0.92, 0.82, nightFactor);
  }

  public render(): void {
    if (this.isBypassed()) {
      this.renderer.render(this.scene, this.camera);
      return;
    }
    this.composer.render();
  }

  public setSize(width: number, height: number, pixelRatio: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.pixelRatio = pixelRatio;
    this.composer.setPixelRatio(pixelRatio);
    this.composer.setSize(this.width, this.height);
    this.updateBloomResolution();
    this.updateFxaaResolution();
  }

  public dispose(): void {
    this.bloomPass.dispose();
    this.outputPass.dispose();
    this.fxaaPass.dispose();
    this.composer.dispose();
    this.renderTarget.dispose();
  }
}
