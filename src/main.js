// Kaleidoscope Live - WebGL fragment shader
// Mirrors an audio-reactive source through a polar fold with continuous zoom
// (Mirrors a source through a mirror field, so the source becomes a symmetric
//  pattern that reshapes as it plays. Segments 3-12, four symmetries.)

const vertexSrc = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = (a_pos + 1.0) * 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const fragmentSrc = `#version 300 es
precision highp float;

in vec2 v_uv;
out vec4 fragColor;

uniform float u_time;
uniform vec2  u_resolution;
uniform float u_segments;
uniform float u_symmetry;
uniform float u_mirrorMode;
uniform float u_movement;
uniform float u_twist;
uniform float u_warp;
uniform float u_warpFreq;
uniform float u_hue;
uniform float u_sat;
uniform float u_bass;
uniform float u_treble;
uniform float u_audioLow;
uniform float u_audioMid;
uniform float u_audioHigh;
uniform float u_sourceIsMic;
uniform float u_seed;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

// The core technique: take UV, convert to polar, fold angle by N segments
// with mirror reflection, then sample source at the folded position.
vec2 kaleidoFold(vec2 p, float n) {
  float r = length(p);
  float a = atan(p.y, p.x);
  float seg = 6.2831853 / n;
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  return vec2(cos(a), sin(a)) * r;
}

// Add spiral twist per radius
vec2 addTwist(vec2 p, float twist) {
  float r = length(p);
  float a = atan(p.y, p.x);
  a += r * twist;
  return vec2(cos(a), sin(a)) * r;
}

// Field source: drives the pattern. Default = layered FBM.
// When mic source is enabled, the time varying noise terms use audio amplitudes
// so the pattern visibly reshapes on the beat.
float fieldSource(vec2 p, float t, float bass, float mid, float high) {
  // bass pulse (slow breathing)
  vec2 q = p * 0.5 + vec2(t * 0.03 * (1.0 + bass * 4.0), 0.0);
  float a = fbm(q);
  // mid detail
  vec2 q2 = p * 1.5 + vec2(0.0, t * 0.06 * (1.0 + mid * 3.0));
  a = mix(a, fbm(q2), 0.5 + mid * 0.3);
  // high sparkles
  vec2 q3 = p * 4.0 + vec2(t * 0.1 * (1.0 + high * 5.0));
  a = mix(a, fbm(q3), high * 0.7);
  return a;
}

vec3 palette(float t) {
  vec3 a = vec3(0.5, 0.5, 0.5);
  vec3 b = vec3(0.5, 0.5, 0.5);
  vec3 c = vec3(1.0, 1.0, 1.0);
  vec3 d = vec3(0.0, 0.33, 0.67);
  return a + b * cos(6.2832 * (c * t + d));
}

void main() {
  vec2 uv = (v_uv - 0.5) * 2.0;
  uv.x *= u_resolution.x / u_resolution.y;

  // Time-varying zoom: continuous zoom in (or out) using exponential scale.
  float t = u_time;
  float zoom = pow(1.4, t * u_movement);
  vec2 p = uv * zoom;

  // Spiral twist per unit radius (organic flow)
  p = addTwist(p, u_twist);

  // Audio-reactive warp (subtle per-pixel distortion tied to mid frequency)
  float warpAmt = u_warp * (1.0 + u_audioMid * 2.0);
  p += warpAmt * vec2(
    sin(p.y * 3.0 + t * u_warpFreq),
    cos(p.x * 3.0 + t * u_warpFreq * 0.8)
  );

  // The kaleidoscope fold: the source becomes symmetric
  vec2 k = kaleidoFold(p, u_segments);

  // Source field (audio-reactive FBM)
  float v = fieldSource(k, t, u_audioLow, u_audioMid, u_audioHigh);

  // Color from palette
  float t_pal = v + t * u_hue * 0.05 + u_audioLow * 0.3;
  vec3 col = palette(t_pal);
  col *= 0.6 + u_sat * v * 0.8;

  // Add bass punch (brightness pulse on kick)
  col *= 1.0 + u_audioLow * u_bass * 0.6;

  // Vignette
  float vig = smoothstep(1.6, 0.4, length(uv));
  col *= vig;

  // Subtle grain
  col += (hash(v_uv * 1000.0 + u_seed) - 0.5) * 0.02;

  fragColor = vec4(col, 1.0);
}
`;

class App {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.gl = this.canvas.getContext('webgl2') || this.canvas.getContext('webgl');

    this.state = {
      segments: 6,
      symmetry: 0,
      mirrorMode: 0,
      movement: 0.30,
      twist: 0.40,
      warp: 0.12,
      warpFreq: 1.20,
      hue: 0.15,
      sat: 1.5,
      bass: 2.0,
      treble: 1.5,
      sourceIsMic: false,
      seed: Math.random() * 100,
    };

    this.SYNC_KEY = new URLSearchParams(location.search).get('stream') || 'default';
    this.IS_ADMIN = new URLSearchParams(location.search).has('admin');
    if (this.IS_ADMIN) document.body.classList.add('admin');

    if (!this.gl) {
      document.body.innerHTML = '<div style="color:#f55;padding:20px">WebGL not supported</div>';
      return;
    }

    this.audioCtx = null;
    this.analyser = null;
    this.audioLow = 0; this.audioMid = 0; this.audioHigh = 0;
    this.audioStarted = false;

    this.init();
    this.setupAdmin();
    this.startAudio();
    this.loop();
  }

  compile(type, src) {
    const gl = this.gl;
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error(gl.getShaderInfoLog(s));
    }
    return s;
  }

  init() {
    const gl = this.gl;
    const prog = gl.createProgram();
    gl.attachShader(prog, this.compile(gl.VERTEX_SHADER, vertexSrc));
    gl.attachShader(prog, this.compile(gl.FRAGMENT_SHADER, fragmentSrc));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog));
    }
    this.prog = prog;

    this.U = {};
    ['u_time', 'u_resolution', 'u_segments', 'u_symmetry', 'u_mirrorMode',
     'u_movement', 'u_twist', 'u_warp', 'u_warpFreq', 'u_hue', 'u_sat',
     'u_bass', 'u_treble', 'u_audioLow', 'u_audioMid', 'u_audioHigh',
     'u_sourceIsMic', 'u_seed'].forEach(n => {
      this.U[n] = gl.getUniformLocation(prog, n);
    });

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const aPos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = window.innerWidth + 'px';
    this.canvas.style.height = window.innerHeight + 'px';
  }

  startAudio() {
    const btn = document.getElementById('audioBtn');
    btn.onclick = async () => {
      if (this.audioStarted) {
        btn.textContent = '🎤 Audio';
        btn.classList.remove('active');
        this.audioStarted = false;
        if (this.audioCtx) this.audioCtx.suspend();
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = this.audioCtx.createMediaStreamSource(stream);
        this.analyser = this.audioCtx.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.6;
        src.connect(this.analyser);
        this.audioData = new Uint8Array(this.analyser.frequencyBinCount);
        this.audioStarted = true;
        btn.textContent = '🎤 Audio ON';
        btn.classList.add('active');
      } catch (e) {
        alert('Mic access denied: ' + e.message);
      }
    };
  }

  updateAudio() {
    if (this.audioStarted && this.analyser) {
      this.analyser.getByteFrequencyData(this.audioData);
      // Three bands: low (0-12), mid (12-80), high (80-end)
      let lo = 0, mi = 0, hi = 0;
      const len = this.audioData.length;
      for (let i = 0; i < 12; i++) lo += this.audioData[i];
      for (let i = 12; i < 80; i++) mi += this.audioData[i];
      for (let i = 80; i < len; i++) hi += this.audioData[i];
      lo /= 12 * 255; mi /= 68 * 255; hi /= (len - 80) * 255;
      this.audioLow = lo; this.audioMid = mi; this.audioHigh = hi;
      document.getElementById('audioInfo').textContent =
        `Audio: bass ${(lo*100).toFixed(0)}% mid ${(mi*100).toFixed(0)}% treble ${(hi*100).toFixed(0)}%`;
    } else {
      // Idle - very slow drift so the pattern still has subtle movement
      this.audioLow = 0.15 + 0.05 * Math.sin(performance.now() / 4000);
      this.audioMid = 0.15 + 0.05 * Math.sin(performance.now() / 3000);
      this.audioHigh = 0.15 + 0.05 * Math.sin(performance.now() / 2000);
    }
  }

  loop() {
    const t = performance.now() / 1000;
    this.updateAudio();

    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.prog);
    gl.uniform1f(this.U.u_time, t);
    gl.uniform2f(this.U.u_resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.U.u_segments, this.state.segments);
    gl.uniform1f(this.U.u_symmetry, this.state.symmetry);
    gl.uniform1f(this.U.u_mirrorMode, this.state.mirrorMode);
    gl.uniform1f(this.U.u_movement, this.state.movement);
    gl.uniform1f(this.U.u_twist, this.state.twist);
    gl.uniform1f(this.U.u_warp, this.state.warp);
    gl.uniform1f(this.U.u_warpFreq, this.state.warpFreq);
    gl.uniform1f(this.U.u_hue, this.state.hue);
    gl.uniform1f(this.U.u_sat, this.state.sat);
    gl.uniform1f(this.U.u_bass, this.state.bass);
    gl.uniform1f(this.U.u_treble, this.state.treble);
    gl.uniform1f(this.U.u_audioLow, this.audioLow);
    gl.uniform1f(this.U.u_audioMid, this.audioMid);
    gl.uniform1f(this.U.u_audioHigh, this.audioHigh);
    gl.uniform1f(this.U.u_sourceIsMic, this.audioStarted ? 1 : 0);
    gl.uniform1f(this.U.u_seed, this.state.seed);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    requestAnimationFrame(() => this.loop());
  }

  setupAdmin() {
    const bindings = [
      ['segments', 'segments', 'vSegments', parseInt],
      ['symmetry', 'symmetry', null, parseFloat],
      ['mirrorMode', 'mirrorMode', null, parseFloat],
      ['movement', 'movement', 'vMovement', parseFloat],
      ['twist', 'twist', 'vTwist', parseFloat],
      ['warp', 'warp', 'vWarp', parseFloat],
      ['warpFreq', 'warpFreq', 'vWarpFreq', parseFloat],
      ['hue', 'hue', 'vHue', parseFloat],
      ['sat', 'sat', 'vSat', parseFloat],
      ['bass', 'bass', 'vBass', parseFloat],
      ['treble', 'treble', 'vTreble', parseFloat],
    ];
    for (const [id, key, valId, parser] of bindings) {
      const el = document.getElementById(id);
      if (!el) continue;
      el.value = this.state[key];
      if (valId) document.getElementById(valId).textContent = String(this.state[key]);
      el.addEventListener('input', () => {
        this.state[key] = parser(el.value);
        if (valId) document.getElementById(valId).textContent = String(this.state[key]);
        this.state.seed = Math.random() * 100;
      });
    }

    document.getElementById('adminToggle').onclick = () => {
      document.body.classList.toggle('admin');
      // Force canvas re-measure
      setTimeout(() => this.resize(), 100);
    };
    document.getElementById('hideTopbar').onclick = () => {
      document.getElementById('topbar').style.display = 'none';
      document.getElementById('audioInfo').style.display = 'none';
      document.getElementById('adminToggle').style.display = 'none';
    };
  }
}

new App();
