(function(){const t=document.createElement("link").relList;if(t&&t.supports&&t.supports("modulepreload"))return;for(const i of document.querySelectorAll('link[rel="modulepreload"]'))a(i);new MutationObserver(i=>{for(const o of i)if(o.type==="childList")for(const s of o.addedNodes)s.tagName==="LINK"&&s.rel==="modulepreload"&&a(s)}).observe(document,{childList:!0,subtree:!0});function e(i){const o={};return i.integrity&&(o.integrity=i.integrity),i.referrerPolicy&&(o.referrerPolicy=i.referrerPolicy),i.crossOrigin==="use-credentials"?o.credentials="include":i.crossOrigin==="anonymous"?o.credentials="omit":o.credentials="same-origin",o}function a(i){if(i.ep)return;i.ep=!0;const o=e(i);fetch(i.href,o)}})();const n=`#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = (a_pos + 1.0) * 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`,u=`#version 300 es
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
`;class d{constructor(){if(this.canvas=document.getElementById("gl"),this.gl=this.canvas.getContext("webgl2")||this.canvas.getContext("webgl"),this.state={segments:6,symmetry:0,mirrorMode:0,movement:.3,twist:.4,warp:.12,warpFreq:1.2,hue:.15,sat:1.5,bass:2,treble:1.5,sourceIsMic:!1,seed:Math.random()*100},this.SYNC_KEY=new URLSearchParams(location.search).get("stream")||"default",this.IS_ADMIN=new URLSearchParams(location.search).has("admin"),this.IS_ADMIN&&document.body.classList.add("admin"),!this.gl){document.body.innerHTML='<div style="color:#f55;padding:20px">WebGL not supported</div>';return}this.audioCtx=null,this.analyser=null,this.audioLow=0,this.audioMid=0,this.audioHigh=0,this.audioStarted=!1,this.init(),this.setupAdmin(),this.startAudio(),this.loop()}compile(t,e){const a=this.gl,i=a.createShader(t);if(a.shaderSource(i,e),a.compileShader(i),!a.getShaderParameter(i,a.COMPILE_STATUS))throw new Error(a.getShaderInfoLog(i));return i}init(){const t=this.gl,e=t.createProgram();if(t.attachShader(e,this.compile(t.VERTEX_SHADER,n)),t.attachShader(e,this.compile(t.FRAGMENT_SHADER,u)),t.linkProgram(e),!t.getProgramParameter(e,t.LINK_STATUS))throw new Error(t.getProgramInfoLog(e));this.prog=e,this.U={},["u_time","u_resolution","u_segments","u_symmetry","u_mirrorMode","u_movement","u_twist","u_warp","u_warpFreq","u_hue","u_sat","u_bass","u_treble","u_audioLow","u_audioMid","u_audioHigh","u_sourceIsMic","u_seed"].forEach(s=>{this.U[s]=t.getUniformLocation(e,s)});const a=t.createBuffer();t.bindBuffer(t.ARRAY_BUFFER,a),t.bufferData(t.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]),t.STATIC_DRAW);const i=t.createVertexArray();t.bindVertexArray(i);const o=t.getAttribLocation(e,"a_pos");t.enableVertexAttribArray(o),t.vertexAttribPointer(o,2,t.FLOAT,!1,0,0),this.resize(),window.addEventListener("resize",()=>this.resize())}resize(){const t=Math.min(window.devicePixelRatio||1,2);this.canvas.width=window.innerWidth*t,this.canvas.height=window.innerHeight*t,this.canvas.style.width=window.innerWidth+"px",this.canvas.style.height=window.innerHeight+"px"}startAudio(){const t=document.getElementById("audioBtn");t.onclick=async()=>{if(this.audioStarted){t.textContent="🎤 Audio",t.classList.remove("active"),this.audioStarted=!1,this.audioCtx&&this.audioCtx.suspend();return}try{const e=await navigator.mediaDevices.getUserMedia({audio:!0});this.audioCtx=new(window.AudioContext||window.webkitAudioContext);const a=this.audioCtx.createMediaStreamSource(e);this.analyser=this.audioCtx.createAnalyser(),this.analyser.fftSize=512,this.analyser.smoothingTimeConstant=.6,a.connect(this.analyser),this.audioData=new Uint8Array(this.analyser.frequencyBinCount),this.audioStarted=!0,t.textContent="🎤 Audio ON",t.classList.add("active")}catch(e){alert("Mic access denied: "+e.message)}}}updateAudio(){if(this.audioStarted&&this.analyser){this.analyser.getByteFrequencyData(this.audioData);let t=0,e=0,a=0;const i=this.audioData.length;for(let o=0;o<12;o++)t+=this.audioData[o];for(let o=12;o<80;o++)e+=this.audioData[o];for(let o=80;o<i;o++)a+=this.audioData[o];t/=12*255,e/=68*255,a/=(i-80)*255,this.audioLow=t,this.audioMid=e,this.audioHigh=a,document.getElementById("audioInfo").textContent=`Audio: bass ${(t*100).toFixed(0)}% mid ${(e*100).toFixed(0)}% treble ${(a*100).toFixed(0)}%`}else this.audioLow=.15+.05*Math.sin(performance.now()/4e3),this.audioMid=.15+.05*Math.sin(performance.now()/3e3),this.audioHigh=.15+.05*Math.sin(performance.now()/2e3)}loop(){const t=performance.now()/1e3;this.updateAudio();const e=this.gl;e.viewport(0,0,this.canvas.width,this.canvas.height),e.useProgram(this.prog),e.uniform1f(this.U.u_time,t),e.uniform2f(this.U.u_resolution,this.canvas.width,this.canvas.height),e.uniform1f(this.U.u_segments,this.state.segments),e.uniform1f(this.U.u_symmetry,this.state.symmetry),e.uniform1f(this.U.u_mirrorMode,this.state.mirrorMode),e.uniform1f(this.U.u_movement,this.state.movement),e.uniform1f(this.U.u_twist,this.state.twist),e.uniform1f(this.U.u_warp,this.state.warp),e.uniform1f(this.U.u_warpFreq,this.state.warpFreq),e.uniform1f(this.U.u_hue,this.state.hue),e.uniform1f(this.U.u_sat,this.state.sat),e.uniform1f(this.U.u_bass,this.state.bass),e.uniform1f(this.U.u_treble,this.state.treble),e.uniform1f(this.U.u_audioLow,this.audioLow),e.uniform1f(this.U.u_audioMid,this.audioMid),e.uniform1f(this.U.u_audioHigh,this.audioHigh),e.uniform1f(this.U.u_sourceIsMic,this.audioStarted?1:0),e.uniform1f(this.U.u_seed,this.state.seed),e.drawArrays(e.TRIANGLES,0,6),requestAnimationFrame(()=>this.loop())}setupAdmin(){const t=[["segments","segments","vSegments",parseInt],["symmetry","symmetry",null,parseFloat],["mirrorMode","mirrorMode",null,parseFloat],["movement","movement","vMovement",parseFloat],["twist","twist","vTwist",parseFloat],["warp","warp","vWarp",parseFloat],["warpFreq","warpFreq","vWarpFreq",parseFloat],["hue","hue","vHue",parseFloat],["sat","sat","vSat",parseFloat],["bass","bass","vBass",parseFloat],["treble","treble","vTreble",parseFloat]];for(const[e,a,i,o]of t){const s=document.getElementById(e);s&&(s.value=this.state[a],i&&(document.getElementById(i).textContent=String(this.state[a])),s.addEventListener("input",()=>{this.state[a]=o(s.value),i&&(document.getElementById(i).textContent=String(this.state[a])),this.state.seed=Math.random()*100}))}document.getElementById("adminToggle").onclick=()=>{document.body.classList.toggle("admin"),setTimeout(()=>this.resize(),100)},document.getElementById("hideTopbar").onclick=()=>{document.getElementById("topbar").style.display="none",document.getElementById("audioInfo").style.display="none",document.getElementById("adminToggle").style.display="none"}}}new d;
