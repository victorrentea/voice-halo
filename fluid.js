/* ===========================================================================
   fluid — WebGL Fluid Simulation, împins de voce în jurul cursorului
   ---------------------------------------------------------------------------
   Port al lui Pavel Dobryakov, https://github.com/PavelDoGreat/WebGL-Fluid-Simulation
   (MIT, © 2017 Pavel Dobryakov). Fizica e a LUI, neatinsă: aceleași shadere
   (advecție semi-lagrangiană, curl + vorticity confinement, divergență, Jacobi
   pe presiune, scăderea gradientului, splat gaussian), aceeași ordine a
   pașilor în step(), aceleași constante din `config`, același display cu
   shading + bloom + sunrays.

   Ce s-a schimbat, și numai atât:

   · STIMULUL. La el splat-urile vin din mișcarea mouse-ului: poziția pointerului
     și delta lui × SPLAT_FORCE. Aici vin din VOCE: EMITTERS puncte pe un cerc mic
     în jurul cursorului, fiecare legat de o bandă din spectru (grave sus, înalte
     jos, simetric stânga-dreapta, ca la inelele din pagină). Cât de tare sună
     banda lui, atât de tare „trage" emițătorul spre exterior — exact ca un
     pointer care s-ar mișca radial cu viteza aia. Splat-ul e același apel
     `splat(x, y, dx, dy, color)`, cu aceleași corecții de aspect ca la pointer.
     O mică componentă tangențială răsucește jetul, ca vorticity-ul să aibă ce
     amplifica; în liniște nu se emite nimic și fluidul se stinge singur.
     Mișcarea centrului rămâne și ea stimul, cu splatPointer()-ul original,
     doar atenuat (MOVE_FORCE, MOVE_DYE): vocea e mai intensă decât mișcarea.
   · CULOAREA: generateColor() e tot HSV(h, 1, 1) × 0.15, dar nuanța nu mai e
     aleatoare la fiecare mișcare, ci curge continuu în timp, aceeași pentru toți
     emițătorii — aleatoare ar pâlpâi la fiecare cadru, că „mișcarea" nu se
     oprește, iar nuanțe diferite pe emițători se amestecă în gri. Cantitatea e împărțită (DYE_SHARE), vezi mai jos.
   · SUNRAYS: centrul razelor era fix 0.5,0.5; aici e cursorul (uniform `center`),
     altfel razele ar ieși din mijlocul ecranului și nu de la mouse.
   · DITHERING-ul bloom-ului lua o textură PNG de pe disc; aici e zgomot generat.
   · Fără rAF propriu și fără audio propriu: pagina cheamă draw() o dată pe cadru,
     ca la water.js și comets.js.
   =========================================================================== */
(function () {
'use strict';

const config = {
  SIM_RESOLUTION: 128,
  DYE_RESOLUTION: 1024,
  DENSITY_DISSIPATION: 1,
  VELOCITY_DISSIPATION: 0.2,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 30,
  SPLAT_RADIUS: 0.25,
  SPLAT_FORCE: 6000,
  SHADING: true,
  BLOOM: true,
  BLOOM_ITERATIONS: 8,
  BLOOM_RESOLUTION: 256,
  BLOOM_INTENSITY: 0.8,
  BLOOM_THRESHOLD: 0.6,
  BLOOM_SOFT_KNEE: 0.7,
  SUNRAYS: true,
  SUNRAYS_RESOLUTION: 196,
  SUNRAYS_WEIGHT: 1.0,
};
if (/Mobi|Android/i.test(navigator.userAgent)) config.DYE_RESOLUTION = 512;   // ca în original

// ── stimulul vocal ──────────────────────────────────────────────────────────
const EMITTERS = 12;      // puncte pe cercul din jurul cursorului
const PUSH_PX = 3;        // cât „se mișcă" un emițător pe cadru, la bandă plină (px CSS)
const SWIRL = 0.35;       // partea tangențială a împingerii, din cea radială
const GATE = 0.04;        // sub atât, banda tace: nu se emite nimic
// Un pointer tras varsă HSV×0.15 o dată pe cadru, într-un singur punct. Doisprezece
// emițători care varsă fiecare atât, tot timpul cât vorbești, albesc tot ecranul
// în două secunde (măsurat: la DENSITY_DISSIPATION 1 echilibrul e de ~12× mai sus).
// Deci fiecare primește doar partea lui: împreună, cât un singur mouse tras.
const DYE_SHARE = 0.08 / EMITTERS;
// ── și mișcarea, ca în original, dar mai slab decât vocea ────────────────────
// Când centrul se mută (mouse-ul real în Walkie Talkie, „plimbarea" în pagină),
// se face exact splatPointer() din original: un splat în punctul curent, cu delta
// mișcării × SPLAT_FORCE. Doar atenuat: o fracțiune din forță și din culoare, ca
// vocea să rămână stimulul principal, iar o mișcare fără voce să lase doar o dâră.
const MOVE_FORCE = 0.35;  // din SPLAT_FORCE
const MOVE_DYE = 0.06;    // din culoarea HSV×0.15 a pointerului original
const MOVE_JUMP = 250;    // px: peste atât nu e mișcare, e salt (ex. mouse pe alt ecran)

let gl = null, ext = null, cv = null, ready = false, failed = false;
let programs, blit, dye, velocity, divergence, curl, pressure, bloom, bloomFramebuffers = [],
    sunrays, sunraysTemp, ditheringTexture, displayMaterial;
let lastW = 0, lastH = 0;

// ─────────────────────────── context & formate ───────────────────────────
function getWebGLContext(canvas) {
  const params = { alpha: true, depth: false, stencil: false, antialias: false, preserveDrawingBuffer: false };
  let g = canvas.getContext('webgl2', params);
  const isWebGL2 = !!g;
  if (!isWebGL2) g = canvas.getContext('webgl', params) || canvas.getContext('experimental-webgl', params);
  if (!g) return null;
  let halfFloat, supportLinearFiltering;
  if (isWebGL2) {
    g.getExtension('EXT_color_buffer_float');
    supportLinearFiltering = g.getExtension('OES_texture_float_linear');
  } else {
    halfFloat = g.getExtension('OES_texture_half_float');
    supportLinearFiltering = g.getExtension('OES_texture_half_float_linear');
  }
  g.clearColor(0.0, 0.0, 0.0, 1.0);
  const halfFloatTexType = isWebGL2 ? g.HALF_FLOAT : halfFloat && halfFloat.HALF_FLOAT_OES;
  let formatRGBA, formatRG, formatR;
  if (isWebGL2) {
    formatRGBA = getSupportedFormat(g, g.RGBA16F, g.RGBA, halfFloatTexType);
    formatRG = getSupportedFormat(g, g.RG16F, g.RG, halfFloatTexType);
    formatR = getSupportedFormat(g, g.R16F, g.RED, halfFloatTexType);
  } else {
    formatRGBA = getSupportedFormat(g, g.RGBA, g.RGBA, halfFloatTexType);
    formatRG = getSupportedFormat(g, g.RGBA, g.RGBA, halfFloatTexType);
    formatR = getSupportedFormat(g, g.RGBA, g.RGBA, halfFloatTexType);
  }
  if (!halfFloatTexType || !formatRGBA) return null;
  return { gl: g, ext: { formatRGBA, formatRG, formatR, halfFloatTexType, supportLinearFiltering } };
}
function getSupportedFormat(g, internalFormat, format, type) {
  if (!supportRenderTextureFormat(g, internalFormat, format, type)) {
    switch (internalFormat) {
      case g.R16F: return getSupportedFormat(g, g.RG16F, g.RG, type);
      case g.RG16F: return getSupportedFormat(g, g.RGBA16F, g.RGBA, type);
      default: return null;
    }
  }
  return { internalFormat, format };
}
function supportRenderTextureFormat(g, internalFormat, format, type) {
  const texture = g.createTexture();
  g.bindTexture(g.TEXTURE_2D, texture);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
  g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
  g.texImage2D(g.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);
  const fbo = g.createFramebuffer();
  g.bindFramebuffer(g.FRAMEBUFFER, fbo);
  g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, texture, 0);
  return g.checkFramebufferStatus(g.FRAMEBUFFER) === g.FRAMEBUFFER_COMPLETE;
}

// ─────────────────────────────── shadere ───────────────────────────────
function compileShader(type, source, keywords) {
  if (keywords) source = keywords.map(k => '#define ' + k + '\n').join('') + source;
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) console.warn('fluid:', gl.getShaderInfoLog(shader));
  return shader;
}
function createProgram(vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) console.warn('fluid:', gl.getProgramInfoLog(p));
  return p;
}
function getUniforms(p) {
  const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; u[name] = gl.getUniformLocation(p, name); }
  return u;
}
class Program {
  constructor(vs, fs) { this.program = createProgram(vs, fs); this.uniforms = getUniforms(this.program); }
  bind() { gl.useProgram(this.program); }
}
class Material {
  constructor(vs, fsSource) { this.vs = vs; this.fsSource = fsSource; this.programs = {}; this.active = null; this.uniforms = {}; }
  setKeywords(keywords) {
    const hash = keywords.join('|');
    let p = this.programs[hash];
    if (!p) { p = createProgram(this.vs, compileShader(gl.FRAGMENT_SHADER, this.fsSource, keywords)); this.programs[hash] = p; }
    if (p === this.active) return;
    this.uniforms = getUniforms(p); this.active = p;
  }
  bind() { gl.useProgram(this.active); }
}

const baseVertex = `
  precision highp float;
  attribute vec2 aPosition;
  varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
  uniform vec2 texelSize;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }`;
const blurVertex = `
  precision highp float;
  attribute vec2 aPosition;
  varying vec2 vUv; varying vec2 vL; varying vec2 vR;
  uniform vec2 texelSize;
  void main () {
    vUv = aPosition * 0.5 + 0.5;
    float offset = 1.33333333;
    vL = vUv - texelSize * offset;
    vR = vUv + texelSize * offset;
    gl_Position = vec4(aPosition, 0.0, 1.0);
  }`;
const blurFrag = `
  precision mediump float; precision mediump sampler2D;
  varying vec2 vUv; varying vec2 vL; varying vec2 vR;
  uniform sampler2D uTexture;
  void main () {
    vec4 sum = texture2D(uTexture, vUv) * 0.29411764;
    sum += texture2D(uTexture, vL) * 0.35294117;
    sum += texture2D(uTexture, vR) * 0.35294117;
    gl_FragColor = sum;
  }`;
const copyFrag = `
  precision mediump float; precision mediump sampler2D;
  varying highp vec2 vUv; uniform sampler2D uTexture;
  void main () { gl_FragColor = texture2D(uTexture, vUv); }`;
const clearFrag = `
  precision mediump float; precision mediump sampler2D;
  varying highp vec2 vUv; uniform sampler2D uTexture; uniform float value;
  void main () { gl_FragColor = value * texture2D(uTexture, vUv); }`;
const colorFrag = `
  precision mediump float; uniform vec4 color;
  void main () { gl_FragColor = color; }`;
const displayFrag = `
  precision highp float; precision highp sampler2D;
  varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
  uniform sampler2D uTexture; uniform sampler2D uBloom; uniform sampler2D uSunrays; uniform sampler2D uDithering;
  uniform vec2 ditherScale; uniform vec2 texelSize;
  vec3 linearToGamma (vec3 color) {
    color = max(color, vec3(0));
    return max(1.055 * pow(color, vec3(0.416666667)) - 0.055, vec3(0));
  }
  void main () {
    vec3 c = texture2D(uTexture, vUv).rgb;
  #ifdef SHADING
    vec3 lc = texture2D(uTexture, vL).rgb;
    vec3 rc = texture2D(uTexture, vR).rgb;
    vec3 tc = texture2D(uTexture, vT).rgb;
    vec3 bc = texture2D(uTexture, vB).rgb;
    float dx = length(rc) - length(lc);
    float dy = length(tc) - length(bc);
    vec3 n = normalize(vec3(dx, dy, length(texelSize)));
    vec3 l = vec3(0.0, 0.0, 1.0);
    float diffuse = clamp(dot(n, l) + 0.7, 0.7, 1.0);
    c *= diffuse;
  #endif
  #ifdef BLOOM
    vec3 bloom = texture2D(uBloom, vUv).rgb;
  #endif
  #ifdef SUNRAYS
    float sunrays = texture2D(uSunrays, vUv).r;
    c *= sunrays;
  #ifdef BLOOM
    bloom *= sunrays;
  #endif
  #endif
  #ifdef BLOOM
    float noise = texture2D(uDithering, vUv * ditherScale).r;
    noise = noise * 2.0 - 1.0;
    bloom += noise / 255.0;
    bloom = linearToGamma(bloom);
    c += bloom;
  #endif
    float a = max(c.r, max(c.g, c.b));
    gl_FragColor = vec4(c, a);
  }`;
const bloomPrefilterFrag = `
  precision mediump float; precision mediump sampler2D;
  varying vec2 vUv; uniform sampler2D uTexture; uniform vec3 curve; uniform float threshold;
  void main () {
    vec3 c = texture2D(uTexture, vUv).rgb;
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - curve.x, 0.0, curve.y);
    rq = curve.z * rq * rq;
    c *= max(rq, br - threshold) / max(br, 0.0001);
    gl_FragColor = vec4(c, 0.0);
  }`;
const bloomBlurFrag = `
  precision mediump float; precision mediump sampler2D;
  varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform sampler2D uTexture;
  void main () {
    vec4 sum = vec4(0.0);
    sum += texture2D(uTexture, vL); sum += texture2D(uTexture, vR);
    sum += texture2D(uTexture, vT); sum += texture2D(uTexture, vB);
    sum *= 0.25;
    gl_FragColor = sum;
  }`;
const bloomFinalFrag = `
  precision mediump float; precision mediump sampler2D;
  varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB; uniform sampler2D uTexture; uniform float intensity;
  void main () {
    vec4 sum = vec4(0.0);
    sum += texture2D(uTexture, vL); sum += texture2D(uTexture, vR);
    sum += texture2D(uTexture, vT); sum += texture2D(uTexture, vB);
    sum *= 0.25;
    gl_FragColor = sum * intensity;
  }`;
const sunraysMaskFrag = `
  precision highp float; precision highp sampler2D;
  varying vec2 vUv; uniform sampler2D uTexture;
  void main () {
    vec4 c = texture2D(uTexture, vUv);
    float br = max(c.r, max(c.g, c.b));
    c.a = 1.0 - min(max(br * 20.0, 0.0), 0.8);
    gl_FragColor = c;
  }`;
// singura abatere de la shaderul lui: `center` în loc de 0.5 — razele pleacă de la cursor
const sunraysFrag = `
  precision highp float; precision highp sampler2D;
  varying vec2 vUv; uniform sampler2D uTexture; uniform float weight; uniform vec2 center;
  #define ITERATIONS 16
  void main () {
    float Density = 0.3; float Decay = 0.95; float Exposure = 0.7;
    vec2 coord = vUv;
    vec2 dir = vUv - center;
    dir *= 1.0 / float(ITERATIONS) * Density;
    float illuminationDecay = 1.0;
    float color = texture2D(uTexture, vUv).a;
    for (int i = 0; i < ITERATIONS; i++) {
      coord -= dir;
      float col = texture2D(uTexture, coord).a;
      color += col * illuminationDecay * weight;
      illuminationDecay *= Decay;
    }
    gl_FragColor = vec4(color * Exposure, 0.0, 0.0, 1.0);
  }`;
const splatFrag = `
  precision highp float; precision highp sampler2D;
  varying vec2 vUv; uniform sampler2D uTarget; uniform float aspectRatio; uniform vec3 color; uniform vec2 point; uniform float radius;
  void main () {
    vec2 p = vUv - point.xy;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    gl_FragColor = vec4(base + splat, 1.0);
  }`;
const advectionFrag = `
  precision highp float; precision highp sampler2D;
  varying vec2 vUv; uniform sampler2D uVelocity; uniform sampler2D uSource;
  uniform vec2 texelSize; uniform vec2 dyeTexelSize; uniform float dt; uniform float dissipation;
  vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
    vec2 st = uv / tsize - 0.5;
    vec2 iuv = floor(st);
    vec2 fuv = fract(st);
    vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
    vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
    vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
    vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
    return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
  }
  void main () {
  #ifdef MANUAL_FILTERING
    vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
    vec4 result = bilerp(uSource, coord, dyeTexelSize);
  #else
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    vec4 result = texture2D(uSource, coord);
  #endif
    float decay = 1.0 + dissipation * dt;
    gl_FragColor = result / decay;
  }`;
const divergenceFrag = `
  precision mediump float; precision mediump sampler2D;
  varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;
    vec2 C = texture2D(uVelocity, vUv).xy;
    if (vL.x < 0.0) { L = -C.x; }
    if (vR.x > 1.0) { R = -C.x; }
    if (vT.y > 1.0) { T = -C.y; }
    if (vB.y < 0.0) { B = -C.y; }
    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
  }`;
const curlFrag = `
  precision mediump float; precision mediump sampler2D;
  varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
  uniform sampler2D uVelocity;
  void main () {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    float vorticity = R - L - T + B;
    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
  }`;
const vorticityFrag = `
  precision highp float; precision highp sampler2D;
  varying vec2 vUv; varying vec2 vL; varying vec2 vR; varying vec2 vT; varying vec2 vB;
  uniform sampler2D uVelocity; uniform sampler2D uCurl; uniform float curl; uniform float dt;
  void main () {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity += force * dt;
    velocity = min(max(velocity, -1000.0), 1000.0);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }`;
const pressureFrag = `
  precision mediump float; precision mediump sampler2D;
  varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
  uniform sampler2D uPressure; uniform sampler2D uDivergence;
  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    float divergence = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
  }`;
const gradientSubtractFrag = `
  precision mediump float; precision mediump sampler2D;
  varying highp vec2 vUv; varying highp vec2 vL; varying highp vec2 vR; varying highp vec2 vT; varying highp vec2 vB;
  uniform sampler2D uPressure; uniform sampler2D uVelocity;
  void main () {
    float L = texture2D(uPressure, vL).x;
    float R = texture2D(uPressure, vR).x;
    float T = texture2D(uPressure, vT).x;
    float B = texture2D(uPressure, vB).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
  }`;

// ─────────────────────────────── framebuffere ───────────────────────────────
function createFBO(w, h, internalFormat, format, type, param) {
  gl.activeTexture(gl.TEXTURE0);
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, param);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, type, null);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.viewport(0, 0, w, h);
  gl.clear(gl.COLOR_BUFFER_BIT);
  return {
    texture, fbo, width: w, height: h, texelSizeX: 1.0 / w, texelSizeY: 1.0 / h,
    attach(id) { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, texture); return id; },
  };
}
function createDoubleFBO(w, h, internalFormat, format, type, param) {
  let fbo1 = createFBO(w, h, internalFormat, format, type, param);
  let fbo2 = createFBO(w, h, internalFormat, format, type, param);
  return {
    width: w, height: h, texelSizeX: fbo1.texelSizeX, texelSizeY: fbo1.texelSizeY,
    get read() { return fbo1; }, set read(v) { fbo1 = v; },
    get write() { return fbo2; }, set write(v) { fbo2 = v; },
    swap() { const t = fbo1; fbo1 = fbo2; fbo2 = t; },
  };
}
function getResolution(resolution) {
  let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
  if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
  const min = Math.round(resolution), max = Math.round(resolution * aspectRatio);
  return gl.drawingBufferWidth > gl.drawingBufferHeight ? { width: max, height: min } : { width: min, height: max };
}
function initFramebuffers() {
  const simRes = getResolution(config.SIM_RESOLUTION), dyeRes = getResolution(config.DYE_RESOLUTION);
  const texType = ext.halfFloatTexType, rgba = ext.formatRGBA, rg = ext.formatRG, r = ext.formatR;
  const filtering = ext.supportLinearFiltering ? gl.LINEAR : gl.NEAREST;
  gl.disable(gl.BLEND);
  dye = createDoubleFBO(dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, filtering);
  velocity = createDoubleFBO(simRes.width, simRes.height, rg.internalFormat, rg.format, texType, filtering);
  divergence = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  curl = createFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  pressure = createDoubleFBO(simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  // bloom
  const bres = getResolution(config.BLOOM_RESOLUTION);
  bloom = createFBO(bres.width, bres.height, rgba.internalFormat, rgba.format, texType, filtering);
  bloomFramebuffers = [];
  for (let i = 0; i < config.BLOOM_ITERATIONS; i++) {
    const w = bres.width >> (i + 1), h = bres.height >> (i + 1);
    if (w < 2 || h < 2) break;
    bloomFramebuffers.push(createFBO(w, h, rgba.internalFormat, rgba.format, texType, filtering));
  }
  // sunrays
  const sres = getResolution(config.SUNRAYS_RESOLUTION);
  sunrays = createFBO(sres.width, sres.height, r.internalFormat, r.format, texType, filtering);
  sunraysTemp = createFBO(sres.width, sres.height, r.internalFormat, r.format, texType, filtering);
}

// ──────────────────────────────── init ────────────────────────────────
function init(canvas) {
  cv = canvas;
  const c = getWebGLContext(canvas);
  if (!c) { failed = true; console.warn('fluid: fără WebGL cu texturi half-float'); return; }
  gl = c.gl; ext = c.ext;
  if (!ext.supportLinearFiltering) {                  // exact degradarea din original
    config.DYE_RESOLUTION = 512; config.SHADING = false; config.BLOOM = false; config.SUNRAYS = false;
  }
  const V = compileShader(gl.VERTEX_SHADER, baseVertex);
  const BV = compileShader(gl.VERTEX_SHADER, blurVertex);
  const F = (src, kw) => compileShader(gl.FRAGMENT_SHADER, src, kw);
  programs = {
    blur: new Program(BV, F(blurFrag)),
    copy: new Program(V, F(copyFrag)),
    clear: new Program(V, F(clearFrag)),
    color: new Program(V, F(colorFrag)),
    bloomPrefilter: new Program(V, F(bloomPrefilterFrag)),
    bloomBlur: new Program(V, F(bloomBlurFrag)),
    bloomFinal: new Program(V, F(bloomFinalFrag)),
    sunraysMask: new Program(V, F(sunraysMaskFrag)),
    sunrays: new Program(V, F(sunraysFrag)),
    splat: new Program(V, F(splatFrag)),
    advection: new Program(V, F(advectionFrag, ext.supportLinearFiltering ? null : ['MANUAL_FILTERING'])),
    divergence: new Program(V, F(divergenceFrag)),
    curl: new Program(V, F(curlFrag)),
    vorticity: new Program(V, F(vorticityFrag)),
    pressure: new Program(V, F(pressureFrag)),
    gradientSubtract: new Program(V, F(gradientSubtractFrag)),
  };
  displayMaterial = new Material(V, displayFrag);
  const kw = [];
  if (config.SHADING) kw.push('SHADING');
  if (config.BLOOM) kw.push('BLOOM');
  if (config.SUNRAYS) kw.push('SUNRAYS');
  displayMaterial.setKeywords(kw);

  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.enableVertexAttribArray(0);
  blit = (target, clear = false) => {
    if (target == null) { gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight); gl.bindFramebuffer(gl.FRAMEBUFFER, null); }
    else { gl.viewport(0, 0, target.width, target.height); gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo); }
    if (clear) { gl.clearColor(0.0, 0.0, 0.0, 1.0); gl.clear(gl.COLOR_BUFFER_BIT); }
    gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  };

  // dithering: în original e LDR_LLL1_0.png; aici zgomot alb, 64×64, repetat
  const N = 64, px = new Uint8Array(N * N * 4);
  for (let i = 0; i < px.length; i++) px[i] = (Math.random() * 256) | 0;
  ditheringTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, ditheringTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, N, N, 0, gl.RGB, gl.UNSIGNED_BYTE,
                new Uint8Array([...Array(N * N)].flatMap((_, i) => [px[i * 4], px[i * 4], px[i * 4]])));
  ditheringTexture.width = ditheringTexture.height = N;
  ditheringTexture.attach = id => { gl.activeTexture(gl.TEXTURE0 + id); gl.bindTexture(gl.TEXTURE_2D, ditheringTexture); return id; };
  ready = true;
}

function resize(w, h, dpr) {
  const W = Math.round(w * dpr), H = Math.round(h * dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  if (W === lastW && H === lastH) return;
  cv.width = W; cv.height = H; lastW = W; lastH = H;
  initFramebuffers();        // la redimensionare fluidul o ia de la capăt: n-are ce păstra
}

// ─────────────────────────────── pașii ───────────────────────────────
function step(dt) {
  gl.disable(gl.BLEND);
  const P = programs;
  P.curl.bind();
  gl.uniform2f(P.curl.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
  gl.uniform1i(P.curl.uniforms.uVelocity, velocity.read.attach(0));
  blit(curl);

  P.vorticity.bind();
  gl.uniform2f(P.vorticity.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
  gl.uniform1i(P.vorticity.uniforms.uVelocity, velocity.read.attach(0));
  gl.uniform1i(P.vorticity.uniforms.uCurl, curl.attach(1));
  gl.uniform1f(P.vorticity.uniforms.curl, config.CURL);
  gl.uniform1f(P.vorticity.uniforms.dt, dt);
  blit(velocity.write); velocity.swap();

  P.divergence.bind();
  gl.uniform2f(P.divergence.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
  gl.uniform1i(P.divergence.uniforms.uVelocity, velocity.read.attach(0));
  blit(divergence);

  P.clear.bind();
  gl.uniform1i(P.clear.uniforms.uTexture, pressure.read.attach(0));
  gl.uniform1f(P.clear.uniforms.value, config.PRESSURE);
  blit(pressure.write); pressure.swap();

  P.pressure.bind();
  gl.uniform2f(P.pressure.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
  gl.uniform1i(P.pressure.uniforms.uDivergence, divergence.attach(0));
  for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
    gl.uniform1i(P.pressure.uniforms.uPressure, pressure.read.attach(1));
    blit(pressure.write); pressure.swap();
  }

  P.gradientSubtract.bind();
  gl.uniform2f(P.gradientSubtract.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
  gl.uniform1i(P.gradientSubtract.uniforms.uPressure, pressure.read.attach(0));
  gl.uniform1i(P.gradientSubtract.uniforms.uVelocity, velocity.read.attach(1));
  blit(velocity.write); velocity.swap();

  P.advection.bind();
  gl.uniform2f(P.advection.uniforms.texelSize, velocity.texelSizeX, velocity.texelSizeY);
  if (!ext.supportLinearFiltering) gl.uniform2f(P.advection.uniforms.dyeTexelSize, velocity.texelSizeX, velocity.texelSizeY);
  const velocityId = velocity.read.attach(0);
  gl.uniform1i(P.advection.uniforms.uVelocity, velocityId);
  gl.uniform1i(P.advection.uniforms.uSource, velocityId);
  gl.uniform1f(P.advection.uniforms.dt, dt);
  gl.uniform1f(P.advection.uniforms.dissipation, config.VELOCITY_DISSIPATION);
  blit(velocity.write); velocity.swap();

  if (!ext.supportLinearFiltering) gl.uniform2f(P.advection.uniforms.dyeTexelSize, dye.texelSizeX, dye.texelSizeY);
  gl.uniform1i(P.advection.uniforms.uVelocity, velocity.read.attach(0));
  gl.uniform1i(P.advection.uniforms.uSource, dye.read.attach(1));
  gl.uniform1f(P.advection.uniforms.dissipation, config.DENSITY_DISSIPATION);
  blit(dye.write); dye.swap();
}

function render(cx, cy) {
  if (config.BLOOM) applyBloom(dye.read, bloom);
  if (config.SUNRAYS) { applySunrays(dye.read, dye.write, sunrays, cx, cy); blurSunrays(sunrays, sunraysTemp, 1); }
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.enable(gl.BLEND);
  // fundal negru opac (TRANSPARENT = false, BACK_COLOR = negru): pagina îl compune cu `screen`
  programs.color.bind();
  gl.uniform4f(programs.color.uniforms.color, 0, 0, 0, 1);
  blit(null);
  const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
  displayMaterial.bind();
  const U = displayMaterial.uniforms;
  if (config.SHADING) gl.uniform2f(U.texelSize, 1.0 / width, 1.0 / height);
  gl.uniform1i(U.uTexture, dye.read.attach(0));
  if (config.BLOOM) {
    gl.uniform1i(U.uBloom, bloom.attach(1));
    gl.uniform1i(U.uDithering, ditheringTexture.attach(2));
    gl.uniform2f(U.ditherScale, width / ditheringTexture.width, height / ditheringTexture.height);
  }
  if (config.SUNRAYS) gl.uniform1i(U.uSunrays, sunrays.attach(3));
  blit(null);
}

function applyBloom(source, destination) {
  if (bloomFramebuffers.length < 2) return;
  let last = destination;
  gl.disable(gl.BLEND);
  const P = programs;
  P.bloomPrefilter.bind();
  const knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
  gl.uniform3f(P.bloomPrefilter.uniforms.curve, config.BLOOM_THRESHOLD - knee, knee * 2, 0.25 / knee);
  gl.uniform1f(P.bloomPrefilter.uniforms.threshold, config.BLOOM_THRESHOLD);
  gl.uniform1i(P.bloomPrefilter.uniforms.uTexture, source.attach(0));
  blit(last);
  P.bloomBlur.bind();
  for (const dest of bloomFramebuffers) {
    gl.uniform2f(P.bloomBlur.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(P.bloomBlur.uniforms.uTexture, last.attach(0));
    blit(dest); last = dest;
  }
  gl.blendFunc(gl.ONE, gl.ONE);
  gl.enable(gl.BLEND);
  for (let i = bloomFramebuffers.length - 2; i >= 0; i--) {
    const baseTex = bloomFramebuffers[i];
    gl.uniform2f(P.bloomBlur.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
    gl.uniform1i(P.bloomBlur.uniforms.uTexture, last.attach(0));
    gl.viewport(0, 0, baseTex.width, baseTex.height);
    blit(baseTex); last = baseTex;
  }
  gl.disable(gl.BLEND);
  P.bloomFinal.bind();
  gl.uniform2f(P.bloomFinal.uniforms.texelSize, last.texelSizeX, last.texelSizeY);
  gl.uniform1i(P.bloomFinal.uniforms.uTexture, last.attach(0));
  gl.uniform1f(P.bloomFinal.uniforms.intensity, config.BLOOM_INTENSITY);
  blit(destination);
}
function applySunrays(source, mask, destination, cx, cy) {
  gl.disable(gl.BLEND);
  const P = programs;
  P.sunraysMask.bind();
  gl.uniform1i(P.sunraysMask.uniforms.uTexture, source.attach(0));
  blit(mask);
  P.sunrays.bind();
  gl.uniform1f(P.sunrays.uniforms.weight, config.SUNRAYS_WEIGHT);
  gl.uniform2f(P.sunrays.uniforms.center, cx, cy);
  gl.uniform1i(P.sunrays.uniforms.uTexture, mask.attach(0));
  blit(destination);
}
function blurSunrays(target, temp, iterations) {
  const P = programs;
  P.blur.bind();
  for (let i = 0; i < iterations; i++) {
    gl.uniform2f(P.blur.uniforms.texelSize, target.texelSizeX, 0.0);
    gl.uniform1i(P.blur.uniforms.uTexture, target.attach(0));
    blit(temp);
    gl.uniform2f(P.blur.uniforms.texelSize, 0.0, target.texelSizeY);
    gl.uniform1i(P.blur.uniforms.uTexture, temp.attach(0));
    blit(target);
  }
}

// ─────────────────────────────── splat ───────────────────────────────
function splat(x, y, dx, dy, color) {
  const P = programs;
  P.splat.bind();
  gl.uniform1i(P.splat.uniforms.uTarget, velocity.read.attach(0));
  gl.uniform1f(P.splat.uniforms.aspectRatio, cv.width / cv.height);
  gl.uniform2f(P.splat.uniforms.point, x, y);
  gl.uniform3f(P.splat.uniforms.color, dx, dy, 0.0);
  gl.uniform1f(P.splat.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
  blit(velocity.write); velocity.swap();
  gl.uniform1i(P.splat.uniforms.uTarget, dye.read.attach(0));
  gl.uniform3f(P.splat.uniforms.color, color.r, color.g, color.b);
  blit(dye.write); dye.swap();
}
function correctRadius(radius) { const a = cv.width / cv.height; if (a > 1) radius *= a; return radius; }
function correctDeltaX(delta) { const a = cv.width / cv.height; if (a < 1) delta *= a; return delta; }
function correctDeltaY(delta) { const a = cv.width / cv.height; if (a > 1) delta /= a; return delta; }
function HSVtoRGB(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return { r: v, g: t, b: p };
    case 1: return { r: q, g: v, b: p };
    case 2: return { r: p, g: v, b: t };
    case 3: return { r: p, g: q, b: v };
    case 4: return { r: t, g: p, b: v };
    default: return { r: v, g: p, b: q };
  }
}
// generateColor() din original: HSV(h, 1, 1) × 0.15 — doar nuanța nu mai e aleatoare
function generateColor(h, k) {
  const c = HSVtoRGB(((h % 1) + 1) % 1, 1.0, 1.0);
  c.r *= 0.15 * k; c.g *= 0.15 * k; c.b *= 0.15 * k;
  return c;
}

// ── vocea în loc de pointer ─────────────────────────────────────────────────
// FĂRĂ `dtF` aici: simularea avansează cel mult 1/60 s pe cadru (ca în original),
// deci și injecția e per PAS de simulare, nu per timp real. Înmulțită cu dtF, la
// 20 fps intra de 3× mai mult dye pe pas, cu aceeași stingere — telefonul încărcat
// și capturile galeriei ieșeau albe.
// Pentru fiecare emițător: un „pointer" virtual care stă pe cercul de rază
// `ringPx` în jurul cursorului și, cât îi sună banda, se mișcă spre exterior cu
// PUSH_PX·e pixeli pe cadru. De acolo încolo e codul lui splatPointer():
// delta în coordonate uv, corectată de aspect, × SPLAT_FORCE.
function voiceSplats(t, energyAt, level, cx, cy, ringPx, dtF, w, h) {
  const spin = t * 0.15;                          // cercul de emițători se rotește lent
  // o singură nuanță la un moment dat, ca pointerul din original (el sare la alta la
  // fiecare 1/COLOR_UPDATE_SPEED s, aici curge): roata întreagă în ~8 s, deci
  // culorile ies ca straturi împinse în afară, nu amestecate în gri
  const hue = t * 0.12;
  for (let k = 0; k < EMITTERS; k++) {
    const a = spin + (k / EMITTERS) * Math.PI * 2;
    // simetric stânga-dreapta: grave sus, înalte jos (ca inelele din pagină)
    const u = Math.abs(((k / EMITTERS + 0.5) % 1) * 2 - 1);
    // Mai mult nivel general decât bandă: vocea stă aproape toată în grave, iar cu
    // banda singură tot fluidul pleca într-o singură parte a cursorului, ca un jet.
    const e = Math.max(0, level * 0.7 + energyAt(u * 0.85) * 0.35 - GATE);
    if (e <= 0) continue;
    const cs = Math.cos(a), sn = Math.sin(a);
    const px = cx + cs * ringPx, py = cy + sn * ringPx;
    const m = PUSH_PX * e;
    const mx = (cs - sn * SWIRL) * m, my = (sn + cs * SWIRL) * m;
    const dx = correctDeltaX(mx / w) * config.SPLAT_FORCE;
    const dy = correctDeltaY(-my / h) * config.SPLAT_FORCE;
    splat(px / w, 1 - py / h, dx, dy, generateColor(hue + k / EMITTERS * 0.12, Math.min(1, e * 1.6) * DYE_SHARE));
  }
}

function motionSplat(t, cx, cy, w, h) {
  if (prevCx === null) { prevCx = cx; prevCy = cy; return; }
  const mx = cx - prevCx, my = cy - prevCy;
  prevCx = cx; prevCy = cy;
  const d = Math.hypot(mx, my);
  if (d < 0.5 || d > MOVE_JUMP) return;
  const dx = correctDeltaX(mx / w) * config.SPLAT_FORCE * MOVE_FORCE;
  const dy = correctDeltaY(-my / h) * config.SPLAT_FORCE * MOVE_FORCE;
  splat(cx / w, 1 - cy / h, dx, dy, generateColor(t * 0.12, MOVE_DYE));
}

// ─────────────────────────────── API ───────────────────────────────
let lastT = null, prevCx = null, prevCy = null;
function draw(canvas, t, energyAt, level, cx, cy, ringPx, dpr, dtF) {
  if (failed) return;
  if (!ready) { init(canvas); if (failed) return; }
  resize(innerWidth, innerHeight, dpr);
  // dt ca în original: timpul real, plafonat la 1/60 s
  const dt = lastT === null ? 1 / 60 : Math.min(Math.max(0, t - lastT), 0.016666);
  lastT = t;
  motionSplat(t, cx, cy, innerWidth, innerHeight);
  voiceSplats(t, energyAt, level, cx, cy, ringPx, dtF, innerWidth, innerHeight);
  step(dt);
  render(cx / innerWidth, 1 - cy / innerHeight);
}
function reset() {
  lastT = null; prevCx = prevCy = null;
  if (!ready) return;
  initFramebuffers();
}

window.fluidScene = { draw, reset, config };
})();
