// The paper on the writing screen, drawn with WebGL so it can really bend:
// the written half curls back over a rounded crease (a wide soft arc that tightens into a fold),
// lit from the top-left, shading the paper below as it passes, and ends behind the sheet.
// Ported from the prototype Natalie approved on 2026-11-04.
//
// The page shows the real text boxes while you write; at the moment you fold,
// the words are copied onto the paper texture (same positions) so they fold with it.

const Fold = (() => {
  const VC = 0.5;          // crease position: the sheet is two equal halves
  const D = 1400;          // perspective distance, like CSS perspective
  const INSET = 24;        // the sheet sits 24px in from the canvas edges (room for its shadow)
  const BAND = 5;          // spacing of earlier players' folds along the top edge

  let gl = null, canvas, prog, U, tex, sheet;
  let W = 0, H = 0, dpr = 1, theta = 0, folds = 0, anim = 0;
  let words = [];          // the sentence, copied from the page when you fold

  const VS = `
  attribute vec2 a_uv;
  uniform vec2 u_size; uniform float u_vc, u_theta, u_r, u_D;
  varying vec2 v_uv; varying vec3 v_n; varying float v_flap;
  void main() {
    v_uv = a_uv;
    float x = (a_uv.x - 0.5) * u_size.x;
    float yc = (0.5 - u_vc) * u_size.y;
    float d = (u_vc - a_uv.y) * u_size.y;          // distance above the crease
    float y = yc - (a_uv.y - u_vc) * u_size.y;
    float z = 0.0;
    vec3 n = vec3(0.0, 0.0, 1.0);
    v_flap = 0.0;
    if (d > 0.0) {
      v_flap = 1.0;
      float arc = u_r * u_theta;
      float a;
      if (d <= arc) { a = d / u_r; y = yc + u_r * sin(a); z = -u_r * (1.0 - cos(a)); }
      else { a = u_theta; float s = d - arc;
        y = yc + u_r * sin(a) + s * cos(a); z = -u_r * (1.0 - cos(a)) - s * sin(a); }
      n = vec3(0.0, sin(a), cos(a));
      // paper doesn't stay perfectly flat while it turns: a soft sag across the width
      float sag = sin(u_theta) * 10.0 * (1.0 - pow(2.0 * a_uv.x - 1.0, 2.0)) * smoothstep(0.0, u_size.y * 0.5, d);
      z -= sag * cos(a);
    }
    gl_Position = vec4(x / (u_size.x * 0.5), y / (u_size.y * 0.5), -z / 2000.0, 1.0 - z / u_D);
    v_n = n;
  }`;
  const FS = `
  precision highp float;
  uniform sampler2D u_tex; uniform float u_vc, u_theta, u_H;
  varying vec2 v_uv; varying vec3 v_n; varying float v_flap;
  void main() {
    vec4 c = texture2D(u_tex, v_uv);
    if (c.a < 0.03) discard;
    vec3 L = normalize(vec3(-0.25, 0.55, 0.8));
    vec3 n = normalize(v_n);
    if (n.z < -0.001) { n = -n; c.rgb = vec3(0.93, 0.93, 0.925); }   // the back of the sheet: plain paper
    float diff = max(dot(n, L), 0.0);
    float shade = 0.72 + 0.28 * (diff / L.z);
    if (v_flap < 0.5) {
      // the turning flap shades the paper just below the crease, then leaves a soft crease shadow
      float dist = (v_uv.y - u_vc) * u_H;
      shade -= sin(u_theta) * 0.22 * exp(-dist / 26.0) + smoothstep(1.2, 3.14, u_theta) * 0.10 * exp(-dist / 7.0);
    }
    gl_FragColor = vec4(c.rgb * clamp(shade, 0.0, 1.15), c.a);
  }`;

  const COLS = 24, ROWS = 160;
  let indexCount = 0;

  function init(el) {
    canvas = el;
    gl = canvas.getContext('webgl', { premultipliedAlpha: false, antialias: true, alpha: true });
    if (!gl) return false;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { gl = null; return false; }
    gl.useProgram(prog);
    U = (n) => gl.getUniformLocation(prog, n);

    // A finely divided sheet, so the curve is smooth.
    const uv = [], idx = [];
    for (let j = 0; j <= ROWS; j++) for (let i = 0; i <= COLS; i++) uv.push(i / COLS, j / ROWS);
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
      const a = j * (COLS + 1) + i, b = a + 1, c = a + COLS + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    indexCount = idx.length;
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uv), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_uv');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    tex = gl.createTexture();

    sheet = new Image();
    sheet.onload = () => { paint(); draw(); };
    return true;
  }

  // The paper picture is big (1.6 MB), so it's fetched only when asked (after onboarding, or on the
  // first turn), never while the first screens and the avatars are loading. Safe to call twice.
  function loadPaper() {
    if (sheet && !sheet.getAttribute('src')) sheet.src = 'img/paper.png';
  }

  // Where things sit on the sheet, in CSS px from the canvas top. app.js places the text boxes with these.
  const foldsHeight = () => (folds ? 6 + folds * BAND + 4 : 0);
  const textTop = () => 6 + foldsHeight() + 22;

  // Paint the texture: the flat sheet, earlier players' folds along its top, and (once you fold) the words.
  function paint() {
    if (!gl || !W || !sheet.getAttribute('src') || !sheet.complete) return;
    const tc = document.createElement('canvas');
    tc.width = Math.round(W * dpr); tc.height = Math.round(H * dpr);
    const g = tc.getContext('2d');
    g.scale(dpr, dpr);
    const x0 = INSET, x1 = W - INSET, y0 = 6;
    g.drawImage(sheet, x0, y0, x1 - x0, H - y0 - 4);
    for (let i = 0; i < folds; i++) {
      const y = y0 + 6 + i * BAND;
      const gr = g.createLinearGradient(0, y, 0, y + 8);
      gr.addColorStop(0, 'rgba(255,255,255,.55)');
      gr.addColorStop(0.45, 'rgba(255,255,255,0)');
      gr.addColorStop(0.8, 'rgba(0,0,0,.06)');
      gr.addColorStop(1, 'rgba(0,0,0,.18)');
      g.fillStyle = gr;
      g.fillRect(x0, y, x1 - x0, 8);
    }
    g.direction = 'rtl';
    g.textAlign = 'right';
    g.textBaseline = 'middle';
    for (const w of words) {
      g.font = w.font;
      g.fillStyle = w.color;
      g.fillText(w.text, w.right, w.mid);
    }
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, tc);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  function draw() {
    if (!gl || !W) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // Real paper bows into a wide soft arc first and only tightens into a crisp crease at the end.
    const p = theta / Math.PI, rEnd = 7 + folds * 1.5, R0 = H * VC * 0.55;
    gl.uniform2f(U('u_size'), W, H);
    gl.uniform1f(U('u_vc'), VC);
    gl.uniform1f(U('u_theta'), theta);
    gl.uniform1f(U('u_r'), rEnd + (R0 - rEnd) * Math.pow(1 - p, 1.6));
    gl.uniform1f(U('u_D'), D);
    gl.uniform1f(U('u_H'), H);
    gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
  }

  // Size the sheet: `half` is the height of each half (written / blank), in CSS px.
  function layout(width, half) {
    W = width; H = half * 2;
    dpr = Math.min(3, window.devicePixelRatio || 1);
    if (canvas) {
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.height = `${H}px`;
    }
    paint(); draw();
  }

  // A new turn: a flat sheet, `n` earlier folds along the top, no words yet.
  function reset(n) {
    loadPaper(); // in case nothing asked for it earlier
    cancelAnimationFrame(anim);
    folds = n; theta = 0; words = [];
    paint(); draw();
  }

  // Copy the sentence off the page onto the paper, word by word, at the exact spots the page drew them.
  function copyWords(paintEl) {
    const box = canvas.getBoundingClientRect();
    const style = getComputedStyle(paintEl);
    const font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    words = [];
    for (const span of paintEl.children) {
      if (span.classList.contains('placeholder')) continue;
      const node = span.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      const color = getComputedStyle(span).color;
      for (const m of node.data.matchAll(/\S+/g)) {
        const range = document.createRange();
        range.setStart(node, m.index);
        range.setEnd(node, m.index + m[0].length);
        const r = range.getClientRects()[0];
        if (!r) continue;
        words.push({ text: m[0], font, color, right: r.right - box.left, mid: r.top - box.top + r.height / 2 });
      }
    }
    paint(); draw();
  }

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  function animateTo(target, ms) {
    cancelAnimationFrame(anim);
    if (!gl || matchMedia('(prefers-reduced-motion: reduce)').matches) {
      theta = target; draw();
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const from = theta, t0 = performance.now();
      const step = (now) => {
        const t = Math.min(1, (now - t0) / ms);
        theta = from + (target - from) * ease(t);
        draw();
        if (t < 1) anim = requestAnimationFrame(step); else resolve();
      };
      anim = requestAnimationFrame(step);
    });
  }

  return {
    init, loadPaper, layout, reset, copyWords, textTop, foldsHeight,
    ready: () => !!gl,
    fold: () => animateTo(Math.PI, 1100),
    lift: () => animateTo(0.12 * Math.PI, 650),   // peek: the flap comes back up
    refold: () => animateTo(Math.PI, 750),
  };
})();
