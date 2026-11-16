/**
 * PaperFold — the Unfolded app's WebGL paper fold, ported for the landing page.
 *
 * A sheet split into two equal halves. The top half (the written line) lifts
 * toward you over a rounded crease, turns, and lands on top of the page, back
 * side up, as a short strip — lit from the top-left, shading the paper below as
 * it passes. The fold is symbolic, as in the app: the flap gets shorter while it
 * stands edge-on. Shaders and lighting are the app's (folded-story/public/fold.js,
 * forward fold of 2026-11-15); what's new is that the words are given as data and
 * the fold can be driven by time (animateTo) or directly (setProgress, e.g. from scroll).
 */

export interface PaperLine {
  text: string;
  /** 'top' = the half that folds over; 'bottom' = the half that stays visible (written under the folded strip). */
  half: 'top' | 'bottom';
  /** CSS colour; defaults to ink. */
  color?: string;
}

/** An image printed faintly onto the paper, like an ink stamp. It bends with the sheet. */
export interface PaperStamp {
  src: string;
  /** Optional second image to swap in (e.g. the unicorn's wink). */
  altSrc?: string;
  /** Size in CSS px. */
  size: number;
  /** 0–1. Low values read as ink soaked into paper. */
  opacity: number;
  /** Degrees; a hand-pressed stamp is never quite straight. */
  rotate: number;
}

export interface PaperFoldOptions {
  /** URL of the paper texture. */
  paperSrc: string;
  lines: PaperLine[];
  /** Earlier players' folds drawn as bands along the top edge. */
  previousFolds?: number;
  /** CSS font for the words, e.g. '400 20px "IBM Plex Sans"'. */
  font: string;
  lineHeight: number;
  /** Printed in the bottom-right corner of the bottom half, so it stays visible after the fold. */
  stamp?: PaperStamp;
}

const VS = `
attribute vec2 a_uv;
uniform vec2 u_size; uniform float u_vc, u_theta, u_r, u_D, u_len;
varying vec2 v_uv; varying vec3 v_n; varying float v_flap;
void main() {
  v_uv = a_uv;
  float x = (a_uv.x - 0.5) * u_size.x;
  float yc = (0.5 - u_vc) * u_size.y;
  float d = (u_vc - a_uv.y) * u_size.y;
  float y = yc - (a_uv.y - u_vc) * u_size.y;
  float z = 0.0;
  vec3 n = vec3(0.0, 0.0, 1.0);
  v_flap = 0.0;
  if (d > 0.0) {
    v_flap = 1.0;
    d *= u_len; // the flap is shorter by the time it comes down (it shrinks while it is edge-on to you)
    float arc = u_r * u_theta;
    float a;
    if (d <= arc) { a = d / u_r; y = yc + u_r * sin(a); z = u_r * (1.0 - cos(a)); }
    else { a = u_theta; float s = d - arc;
      y = yc + u_r * sin(a) + s * cos(a); z = u_r * (1.0 - cos(a)) + s * sin(a); }
    n = vec3(0.0, -sin(a), cos(a));
    float sag = max(sin(u_theta), 0.0) * 10.0 * (1.0 - pow(2.0 * a_uv.x - 1.0, 2.0)) * smoothstep(0.0, u_size.y * 0.5, d);
    z += sag * cos(a);
  }
  float w = 1.0 - z / u_D;
  // things nearer to you grow around the crease line (not around the sheet's middle)
  gl_Position = vec4(x / (u_size.x * 0.5), ((y - yc) + yc * w) / (u_size.y * 0.5), -z / 2000.0, w);
  v_n = n;
}`;

const FS = `
precision highp float;
uniform sampler2D u_tex; uniform float u_vc, u_theta, u_H, u_edge, u_soft, u_below;
varying vec2 v_uv; varying vec3 v_n; varying float v_flap;
void main() {
  vec4 c = texture2D(u_tex, v_uv);
  if (c.a < 0.03) discard;
  vec3 L = normalize(vec3(-0.25, 0.55, 0.8));
  vec3 n = normalize(v_n);
  if (n.z < -0.001) {
    // The back of the sheet: plain paper, with a clean edge (half see-through edge pixels would punch holes in the page under it).
    if (c.a < 0.5) discard;
    n = -n; c = vec4(0.945, 0.935, 0.905, 1.0); // the app's is a cooler grey; this page's paper is warm
  }
  float diff = max(dot(n, L), 0.0);
  float shade = 0.72 + 0.28 * (diff / L.z);
  if (v_flap < 0.5) {
    // the flap hangs over the page, so the page is in its shadow up to (and softly past) the flap's free edge
    float dist = (v_uv.y - u_vc) * u_H;
    shade -= 0.18 * (1.0 - smoothstep(u_edge - u_soft, u_edge + u_soft, dist)) * smoothstep(u_below - 6.0, u_below - 1.0, dist);
  } else if (normalize(v_n).z < 0.0) {
    // the flap's back: a soft darker band where it bends away at the crease
    float up = (u_vc - v_uv.y) * u_H;
    shade -= smoothstep(2.2, 3.14, u_theta) * 0.05 * exp(-up / 30.0);
  }
  gl_FragColor = vec4(c.rgb * clamp(shade, 0.0, 1.02), c.a);
}`;

const CREASE = 0.5; // the sheet is two equal halves
const PERSPECTIVE = 1400; // like CSS perspective
const INSET = 24; // room around the sheet for its shadow
const BAND = 5; // spacing of earlier players' folds
const STRIP = 48; // the folded flap lands as a strip this tall (the app's size)
const PAD_X = 32; // text inset from the sheet edge
const COLS = 24;
const ROWS = 160; // finely divided so the curve is smooth

const smooth = (a: number, b: number, x: number) => {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
};
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class PaperFold {
  private gl: WebGLRenderingContext;
  private program: WebGLProgram;
  private texture: WebGLTexture;
  private indexCount = 0;
  private paper = new Image();
  private stampImage = new Image();
  private stampAltImage = new Image();
  private stampAlt = false;
  private width = 0;
  private height = 0;
  private dpr = 1;
  private theta = 0; // 0 = flat, end() (a touch past π) = fully folded
  private frame = 0;
  private resizeObserver: ResizeObserver;

  /** Returns null when WebGL isn't available, so the caller can show a fallback. */
  static create(canvas: HTMLCanvasElement, options: PaperFoldOptions): PaperFold | null {
    const gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: true, alpha: true });
    if (!gl) return null;
    try {
      return new PaperFold(canvas, gl, options);
    } catch {
      return null;
    }
  }

  private constructor(
    private canvas: HTMLCanvasElement,
    gl: WebGLRenderingContext,
    private options: PaperFoldOptions,
  ) {
    this.gl = gl;
    this.program = this.compile();
    this.buildMesh();
    this.texture = gl.createTexture()!;

    this.resizeObserver = new ResizeObserver(() => this.layout());
    this.resizeObserver.observe(canvas);
  }

  /** Resolves once the paper and fonts are ready and the first frame is drawn. */
  async load(): Promise<void> {
    this.paper.src = this.options.paperSrc;
    const { stamp } = this.options;
    const images = [this.paper.decode(), document.fonts.load(this.options.font)];
    if (stamp) {
      this.stampImage.src = stamp.src;
      images.push(this.stampImage.decode());
      if (stamp.altSrc) {
        this.stampAltImage.src = stamp.altSrc;
        images.push(this.stampAltImage.decode());
      }
    }
    await Promise.all(images);
    this.layout();
  }

  /** Replace the words on the sheet (e.g. one more letter while typing) and redraw. */
  setLines(lines: PaperLine[]): void {
    this.options = { ...this.options, lines };
    this.paint();
    this.draw();
  }

  /** Swap the stamp to its alternate image (e.g. the wink) and back. */
  setStampAlt(on: boolean): void {
    this.stampAlt = on;
    this.paint();
    this.draw();
  }

  /** 0 = flat sheet, 1 = folded. Use for scroll-driven folds. */
  setProgress(progress: number): void {
    cancelAnimationFrame(this.frame);
    this.theta = Math.min(1, Math.max(0, progress)) * this.end();
    this.draw();
  }

  /** Animates to a fold progress (0–1). Jumps straight there with reduced motion. */
  animateTo(progress: number, ms: number): Promise<void> {
    cancelAnimationFrame(this.frame);
    const target = progress * this.end();
    if (prefersReducedMotion()) {
      this.theta = target;
      this.draw();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const from = this.theta;
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / ms);
        this.theta = from + (target - from) * easeInOutCubic(t);
        this.draw();
        if (t < 1) this.frame = requestAnimationFrame(step);
        else resolve();
      };
      this.frame = requestAnimationFrame(step);
    });
  }

  // The same three moves the app uses.
  fold = () => this.animateTo(1, 1100);
  /** Peek: the flap comes back up. `to` is the fold progress to open to (the app uses 0.12 — almost flat). */
  lift = (to = 0.12) => this.animateTo(to, 650);
  refold = () => this.animateTo(1, 750);
  unfold = () => this.animateTo(0, 700);

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
  }

  // ---------------------------------------------------------------- internals

  // The fold's shape, as in the app. How tight the crease ends: tight, so the flap lies on the page.
  private roll = () => 4 + (this.options.previousFolds ?? 0) * 0.5;
  private flapLen = () => this.height * CREASE - 6;
  /** How long the flap is at angle t: full length while the writing shows, shorter once it stands edge-on. */
  private lenAt = (t: number) => {
    const short = Math.min(this.flapLen(), STRIP + this.roll() * Math.PI + 2);
    return this.flapLen() + (short - this.flapLen()) * smooth(0.4 * Math.PI, 0.72 * Math.PI, t);
  };
  /** The fold ends a touch past flat: the flap's free edge comes to rest on the page. */
  private end = () => Math.PI + (2 * this.roll() - 1.5) / Math.max(40, STRIP);
  /** Where the folded flap's free edge rests, in px from the sheet's top. */
  private landed = () => {
    const r = this.roll();
    const e = this.end();
    const s = Math.max(0, this.lenAt(e) - r * e);
    return this.height * CREASE - (r * Math.sin(e) + s * Math.cos(e));
  };

  private compile(): WebGLProgram {
    const { gl } = this;
    const shader = (type: number, source: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, source);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, shader(gl.VERTEX_SHADER, VS));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error('link');
    gl.useProgram(program);
    return program;
  }

  private buildMesh(): void {
    const { gl } = this;
    const uv: number[] = [];
    const indices: number[] = [];
    for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) uv.push(i / COLS, j / ROWS);
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const a = j * (COLS + 1) + i;
        const b = a + 1;
        const c = a + COLS + 1;
        const d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
    this.indexCount = indices.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'a_uv');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }

  /** Match the canvas to its CSS size (the CSS sets width and aspect-ratio). */
  private layout(): void {
    // clientWidth/Height = the layout size, ignoring CSS transforms. getBoundingClientRect() would
    // include them: re-measuring while the sheet is scaled down (the landing page's step 2) painted
    // the words for a half-size sheet, so they came back double-sized and overlapping.
    const { clientWidth: width, clientHeight: height } = this.canvas;
    if (!width || !height) return;
    this.width = width;
    this.height = height;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.paint();
    this.draw();
  }

  /** Paint the texture: the sheet, earlier folds along its top, and the words. */
  private paint(): void {
    if (!this.width || !this.paper.complete || !this.paper.naturalWidth) return;
    const { gl, width: W, height: H, dpr } = this;
    const { font, lineHeight, lines, previousFolds = 0 } = this.options;

    const tc = document.createElement('canvas');
    tc.width = Math.round(W * dpr);
    tc.height = Math.round(H * dpr);
    const g = tc.getContext('2d')!;
    g.scale(dpr, dpr);

    const x0 = INSET;
    const x1 = W - INSET;
    const y0 = 6;
    g.drawImage(this.paper, x0, y0, x1 - x0, H - y0 - 4);

    for (let i = 0; i < previousFolds; i++) {
      const y = y0 + 6 + i * BAND;
      const band = g.createLinearGradient(0, y, 0, y + 8);
      band.addColorStop(0, 'rgba(255,255,255,.55)');
      band.addColorStop(0.45, 'rgba(255,255,255,0)');
      band.addColorStop(0.8, 'rgba(0,0,0,.06)');
      band.addColorStop(1, 'rgba(0,0,0,.18)');
      g.fillStyle = band;
      g.fillRect(x0, y, x1 - x0, 8);
    }

    // Words, wrapped to the sheet width, starting near the top of each half.
    g.font = font;
    g.textBaseline = 'middle';
    const maxWidth = x1 - x0 - PAD_X * 2;
    const foldsHeight = previousFolds ? 6 + previousFolds * BAND + 4 : 0;
    // The bottom half's words start under where the folded strip lands.
    const cursor = { top: y0 + foldsHeight + 28, bottom: this.landed() + 14 };
    const ink = getComputedStyle(document.documentElement).getPropertyValue('--ink').trim() || '#141414';

    for (const line of lines) {
      g.fillStyle = line.color ?? ink;
      for (const row of wrap(g, line.text, maxWidth)) {
        g.fillText(row, x0 + PAD_X, cursor[line.half] + lineHeight / 2);
        cursor[line.half] += lineHeight;
      }
    }

    this.paintStamp(g, x1, H);

    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /** The stamp: multiplied into the paper like ink, slightly rotated, in the bottom-right corner. */
  private paintStamp(g: CanvasRenderingContext2D, right: number, H: number): void {
    const { stamp } = this.options;
    if (!stamp) return;
    const image = this.stampAlt && stamp.altSrc ? this.stampAltImage : this.stampImage;
    if (!image.naturalWidth) return;
    const cx = right - PAD_X - stamp.size / 2 + 8;
    const cy = H - 4 - PAD_X - stamp.size / 2 + 8;
    g.save();
    g.globalAlpha = stamp.opacity;
    g.globalCompositeOperation = 'multiply';
    g.translate(cx, cy);
    g.rotate((stamp.rotate * Math.PI) / 180);
    g.drawImage(image, -stamp.size / 2, -stamp.size / 2, stamp.size, stamp.size);
    g.restore();
  }

  private draw(): void {
    if (!this.width) return;
    const { gl, program, width: W, height: H } = this;
    const u = (name: string) => gl.getUniformLocation(program, name);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Real paper bows into a wide soft arc first and only tightens into a crisp crease at the end.
    const theta = this.theta;
    const p = Math.min(1, theta / Math.PI);
    const rEnd = this.roll();
    const r0 = H * CREASE * 0.55;
    const len = this.lenAt(theta);
    const r = Math.min(rEnd + (r0 - rEnd) * Math.pow(1 - p, 1.6), Math.max(rEnd, len * 0.3)); // a short flap can't bow as widely
    // Where the flap's free edge is (px below the crease, and how high above the page), for its shadow.
    const s = Math.max(0, len - r * theta);
    const below = -(r * Math.sin(theta) + s * Math.cos(theta));
    const high = Math.max(0, r * (1 - Math.cos(theta)) + s * Math.sin(theta));
    gl.uniform2f(u('u_size'), W, H);
    gl.uniform1f(u('u_vc'), CREASE);
    gl.uniform1f(u('u_theta'), theta);
    gl.uniform1f(u('u_r'), r);
    gl.uniform1f(u('u_len'), len / this.flapLen());
    gl.uniform1f(u('u_below'), below);
    gl.uniform1f(u('u_edge'), below + 0.69 * high); // the light sits above the page, so the shadow falls further down
    gl.uniform1f(u('u_soft'), 2.5 + 0.25 * high);
    gl.uniform1f(u('u_D'), PERSPECTIVE);
    gl.uniform1f(u('u_H'), H);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0);
  }
}

/** Greedy word-wrap for canvas text. */
function wrap(g: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const rows: string[] = [];
  let row = '';
  for (const word of text.split(/\s+/)) {
    const next = row ? `${row} ${word}` : word;
    if (row && g.measureText(next).width > maxWidth) {
      rows.push(row);
      row = word;
    } else {
      row = next;
    }
  }
  if (row) rows.push(row);
  return rows;
}
