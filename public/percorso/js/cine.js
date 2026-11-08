// Resa da cinema: la scena si disegna in un buffer ad alta gamma (con anti-aliasing), poi passa da bagliore, profondità di campo
// leggera, curva filmica, correzione colore, vignetta, aberrazione e grana. In più la mappa delle ombre dalla luce principale.
// Se il dispositivo non regge i buffer necessari, createCine restituisce null e la scena si disegna come prima, senza effetti.
import { program, M } from './gl.js';
import { KEYDIR } from './light.js';

const V3 = '#version 300 es\n';
const VS_FS = V3 + 'layout(location=0) in vec2 aP; out vec2 vUv; void main(){ vUv = aP*.5 + .5; gl_Position = vec4(aP, 0., 1.); }';

// primo livello del bagliore: dimezza e tiene solo i punti molto luminosi (con una soglia morbida)
const FS_BRIGHT = V3 + `precision highp float; in vec2 vUv; uniform sampler2D uT; uniform vec2 uPx; uniform vec2 uThr; out vec4 o;
void main(){
  vec3 c = (texture(uT, vUv + uPx*vec2(-1.,-1.)).rgb + texture(uT, vUv + uPx*vec2(1.,-1.)).rgb + texture(uT, vUv + uPx*vec2(-1.,1.)).rgb + texture(uT, vUv + uPx*vec2(1.,1.)).rgb)*.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(uThr.x, uThr.y, l);
  o = vec4(c*k, 1.);
}`;
const FS_DOWN = V3 + `precision highp float; in vec2 vUv; uniform sampler2D uT; uniform vec2 uPx; out vec4 o;
void main(){
  vec3 c = texture(uT, vUv).rgb*.25;
  c += (texture(uT, vUv + uPx*vec2(-1.,-1.)).rgb + texture(uT, vUv + uPx*vec2(1.,-1.)).rgb + texture(uT, vUv + uPx*vec2(-1.,1.)).rgb + texture(uT, vUv + uPx*vec2(1.,1.)).rgb)*.1875;
  o = vec4(c, 1.);
}`;
const FS_UP = V3 + `precision highp float; in vec2 vUv; uniform sampler2D uT; uniform vec2 uPx; uniform float uK; out vec4 o;
void main(){
  vec3 c = texture(uT, vUv).rgb*4.;
  c += (texture(uT, vUv + uPx*vec2(-1.,0.)).rgb + texture(uT, vUv + uPx*vec2(1.,0.)).rgb + texture(uT, vUv + uPx*vec2(0.,-1.)).rgb + texture(uT, vUv + uPx*vec2(0.,1.)).rgb)*2.;
  c += texture(uT, vUv + uPx*vec2(-1.,-1.)).rgb + texture(uT, vUv + uPx*vec2(1.,-1.)).rgb + texture(uT, vUv + uPx*vec2(-1.,1.)).rgb + texture(uT, vUv + uPx*vec2(1.,1.)).rgb;
  o = vec4(c/16.*uK, 1.);
}`;
// striscia orizzontale tipo obiettivo anamorfico: sfoca solo in orizzontale i punti più luminosi
const FS_STREAK = V3 + `precision highp float; in vec2 vUv; uniform sampler2D uT; uniform vec2 uPx; out vec4 o;
void main(){
  vec3 c = vec3(0.); float ws = 0.;
  for(int i = -10; i <= 10; i++){ float w = exp(-float(i*i)/38.); c += texture(uT, vUv + vec2(float(i)*uPx.x*2., 0.)).rgb*w; ws += w; }
  o = vec4(c/ws, 1.);
}`;
const FS_POST = V3 + `precision highp float; in vec2 vUv; out vec4 o;
uniform sampler2D uC, uD, uB, uS; uniform vec2 uRes; uniform float uTime, uDofOn, uSat;
uniform vec4 uDof;   // x distanza a fuoco, y raggio massimo (px), z near, w far
uniform vec4 uFx;    // x bagliore, y vignetta, z grana, w aberrazione
uniform vec3 uShT, uHiT, uVigT; uniform float uStreak;
float viewDist(float z){ float n = uDof.z, f = uDof.w; float zn = z*2. - 1.; return 2.*n*f/(f + n - zn*(f - n)); }
float coc(float d){ float x = d - uDof.x; float k = x > 0. ? x/uDof.x*1.7 : -x/uDof.x*2.6; return clamp(k, 0., 1.)*uDof.y; }
float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx)*.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y)*p3.z); }
// spalla filmica: i colori della pagina restano uguali fino a 0.9, sopra si comprimono morbidi invece di tagliarsi
vec3 filmic(vec3 x){
  vec3 hi = max(x - .9, vec3(0.));
  vec3 s = min(x, vec3(.9)) + .1*(1. - exp(-hi/.1));
  return mix(s, s*s*(3. - 2.*s), .1);
}
void main(){
  vec2 px = 1./uRes;
  vec3 col = texture(uC, vUv).rgb;
  float zr = texture(uD, vUv).r;
  if(uDofOn > .5 && zr < .99999){
    float r0 = coc(viewDist(zr));
    if(r0 > .6){
      vec3 acc = col; float ws = 1.;
      for(int i = 0; i < 18; i++){
        float fi = float(i); float a = fi*2.39996 + h12(gl_FragCoord.xy)*6.28; float rr = sqrt((fi + .5)/18.)*r0;
        vec2 uv = vUv + vec2(cos(a), sin(a))*rr*px;
        float zi = texture(uD, uv).r;
        float ri = zi >= .99999 ? r0 : coc(viewDist(zi));
        float w = ri >= rr*.7 ? 1. : 0.;
        acc += texture(uC, uv).rgb*w; ws += w;
      }
      col = acc/ws;
    }
  }
  vec2 cc = vUv - .5; float ca = uFx.w*dot(cc, cc);
  col.r = mix(col.r, texture(uC, vUv + cc*ca).r, .85); col.b = mix(col.b, texture(uC, vUv - cc*ca).b, .85);
  col += texture(uB, vUv).rgb*uFx.x;
  col += texture(uS, vUv).rgb*uStreak*vec3(.95,.97,1.);
  col = filmic(col);
  float l = dot(col, vec3(.2126, .7152, .0722));
  col = mix(vec3(l), col, uSat);
  col += uShT*(1. - l)*(1. - l);
  col *= mix(vec3(1.), uHiT, smoothstep(.45, 1., l));
  float vg = smoothstep(.3, 1.0, length(cc*vec2(uRes.x/uRes.y*.85, 1.)));
  col *= mix(vec3(1.), uVigT, vg*uFx.y);
  col += (h12(gl_FragCoord.xy + fract(uTime)*91.) - .5)*uFx.z*(1.15 - l);
  o = vec4(col, 1.);
}`;

export function createCine(C) {
  const { gl } = C;
  const half = gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float');
  let colFmt = half ? gl.RGBA16F : gl.RGBA8;
  const maxS = gl.getParameter(gl.MAX_SAMPLES) || 0;
  const samples = Math.min(4, maxS);
  const SM_SIZE = 2048;
  const err = () => gl.getError();
  err();

  // ---- mappa delle ombre (sempre presente: i programmi la leggono anche quando le ombre sono spente)
  const sm = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, sm);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, SM_SIZE, SM_SIZE, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
  const smFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, smFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, sm, 0);
  gl.drawBuffers([gl.NONE]); gl.readBuffer(gl.NONE);
  const smOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  let post = null, bloomP = null;
  try {
    bloomP = { bright: program(gl, VS_FS, FS_BRIGHT), down: program(gl, VS_FS, FS_DOWN), up: program(gl, VS_FS, FS_UP), streak: program(gl, VS_FS, FS_STREAK) };
    post = program(gl, VS_FS, FS_POST);
  } catch (e) { console.warn('[cinema] shader non compilati, resa semplice:', e.message); }

  const T = { w: 0, h: 0, ok: false };
  const mkTex = (w, h, fmt, filter = gl.LINEAR) => {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    if (fmt === gl.DEPTH_COMPONENT24) gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, fmt, w, h, 0, gl.RGBA, fmt === gl.RGBA16F ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  };
  const kill = () => { for (const k of ['msFbo', 'msCol', 'msDep', 'rFbo', 'rCol', 'rDep']) if (T[k]) { (k.endsWith('Fbo') ? gl.deleteFramebuffer : k.startsWith('ms') ? gl.deleteRenderbuffer : gl.deleteTexture).call(gl, T[k]); T[k] = null; } (T.lv || []).forEach((l) => { gl.deleteTexture(l.t); gl.deleteFramebuffer(l.f); }); T.lv = []; };

  function build(w, h) {
    kill(); T.w = w; T.h = h; T.ok = false; err();
    // scena con anti-aliasing
    T.msCol = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, T.msCol); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, colFmt, w, h);
    T.msDep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, T.msDep); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.DEPTH_COMPONENT24, w, h);
    T.msFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFbo);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, T.msCol);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, T.msDep);
    const a = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    // risolto (leggibile dai programmi)
    T.rCol = mkTex(w, h, colFmt); T.rDep = mkTex(w, h, gl.DEPTH_COMPONENT24, gl.NEAREST);
    T.rFbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, T.rFbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, T.rCol, 0);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, T.rDep, 0);
    const b = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    // bagliore: 5 livelli a metà, quarto, ottavo...
    T.lv = []; let lw = w, lh = h; let c = true;
    for (let i = 0; i < 5; i++) {
      lw = Math.max(2, lw >> 1); lh = Math.max(2, lh >> 1);
      const t = mkTex(lw, lh, colFmt), f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
      c = c && gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; T.lv.push({ t, f, w: lw, h: lh });
    }
    // striscia anamorfica a un quarto
    { const sw = Math.max(2, w >> 2), shh = Math.max(2, h >> 2); const t = mkTex(sw, shh, colFmt), f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); T.st = { t, f, w: sw, h: shh }; }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return a && b && c && !err();
  }
  function resize(w, h) {
    if (!post || !bloomP) { T.ok = false; return; }
    if (w === T.w && h === T.h && T.ok) return;
    T.ok = build(w, h);
    if (!T.ok && colFmt === gl.RGBA16F) { colFmt = gl.RGBA8; T.ok = build(w, h); } // senza buffer a mezza precisione: otto bit
    if (!T.ok) console.warn('[cinema] buffer non disponibili, resa semplice');
  }

  const light = { smOn: false, smSize: SM_SIZE, bias: 0.0012, nOff: 0.035, lvp: M.id(), smTex: sm, keyC: [1, 1, 1], ambT: [.4, .4, .4], ambB: [.3, .3, .3], rimC: [1, 1, 1] };

  // matrice della luce: ortogonale, centrata sul palcoscenico
  function lightMatrix(target = [0, 0.2, 0.2], half = 6.4) {
    const eye = [target[0] + KEYDIR[0] * 18, target[1] + KEYDIR[1] * 18, target[2] + KEYDIR[2] * 18];
    return M.mul(M.ortho(-half, half, -half, half, 2, 40), M.look(eye, target));
  }

  let depthOk = true;
  return {
    light, T, smOk, hdr: !!half, samples,
    get ok() { return T.ok && smOk; },
    resize,
    // ---- ombre
    shadowBegin(target, half) {
      light.lvp = lightMatrix(target, half);
      gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, null); gl.activeTexture(gl.TEXTURE0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, smFbo);
      gl.viewport(0, 0, SM_SIZE, SM_SIZE);
      gl.colorMask(false, false, false, false);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true); gl.clearDepth(1); gl.clear(gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.POLYGON_OFFSET_FILL); gl.polygonOffset(2, 4);
      gl.useProgram(C.P.shadow.p); gl.uniformMatrix4fv(C.P.shadow.u.uLVP, false, light.lvp);
    },
    shadowEnd() {
      gl.disable(gl.POLYGON_OFFSET_FILL); gl.colorMask(true, true, true, true);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); light.smOn = true;
    },
    // ---- scena
    sceneBegin() { gl.bindFramebuffer(gl.FRAMEBUFFER, T.msFbo); gl.viewport(0, 0, T.w, T.h); },
    sceneEnd(p) {
      // risolve (colore e profondità)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, T.msFbo); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, T.rFbo);
      gl.blitFramebuffer(0, 0, T.w, T.h, 0, 0, T.w, T.h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
      if (depthOk && err()) { depthOk = false; console.warn('[cinema] profondità non risolvibile: niente sfocatura dello sfondo'); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND); gl.depthMask(true);
      gl.bindVertexArray(C.bv);
      // bagliore
      const lv = T.lv;
      let q = bloomP.bright; gl.useProgram(q.p); gl.bindFramebuffer(gl.FRAMEBUFFER, lv[0].f); gl.viewport(0, 0, lv[0].w, lv[0].h);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.rCol); gl.uniform1i(q.u.uT, 0); gl.uniform2f(q.u.uPx, 1 / T.w, 1 / T.h); gl.uniform2f(q.u.uThr, p.thr[0], p.thr[1]);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      q = bloomP.down; gl.useProgram(q.p); gl.uniform1i(q.u.uT, 0);
      for (let i = 1; i < lv.length; i++) { gl.bindFramebuffer(gl.FRAMEBUFFER, lv[i].f); gl.viewport(0, 0, lv[i].w, lv[i].h); gl.bindTexture(gl.TEXTURE_2D, lv[i - 1].t); gl.uniform2f(q.u.uPx, 1 / lv[i - 1].w, 1 / lv[i - 1].h); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      // striscia a partire dal livello a 1/4 (lv[1])
      q = bloomP.streak; gl.useProgram(q.p); gl.bindFramebuffer(gl.FRAMEBUFFER, T.st.f); gl.viewport(0, 0, T.st.w, T.st.h);
      gl.bindTexture(gl.TEXTURE_2D, lv[1].t); gl.uniform1i(q.u.uT, 0); gl.uniform2f(q.u.uPx, 1 / lv[1].w, 1 / lv[1].h); gl.drawArrays(gl.TRIANGLES, 0, 3);
      // risalita additiva
      q = bloomP.up; gl.useProgram(q.p); gl.uniform1i(q.u.uT, 0); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      for (let i = lv.length - 1; i > 0; i--) { gl.bindFramebuffer(gl.FRAMEBUFFER, lv[i - 1].f); gl.viewport(0, 0, lv[i - 1].w, lv[i - 1].h); gl.bindTexture(gl.TEXTURE_2D, lv[i].t); gl.uniform2f(q.u.uPx, 1 / lv[i].w, 1 / lv[i].h); gl.uniform1f(q.u.uK, 1.0 + i * 0.12); gl.drawArrays(gl.TRIANGLES, 0, 3); }
      gl.disable(gl.BLEND);
      // composizione finale
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, T.w, T.h);
      q = post; gl.useProgram(q.p);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T.rCol); gl.uniform1i(q.u.uC, 0);
      gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, T.rDep); gl.uniform1i(q.u.uD, 1);
      gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, lv[0].t); gl.uniform1i(q.u.uB, 2);
      gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, T.st.t); gl.uniform1i(q.u.uS, 3);
      gl.uniform2f(q.u.uRes, T.w, T.h); gl.uniform1f(q.u.uTime, p.time); gl.uniform1f(q.u.uDofOn, depthOk && p.dof ? 1 : 0); gl.uniform1f(q.u.uSat, p.sat);
      gl.uniform4f(q.u.uDof, p.focus, p.dofPx, p.near, p.far); gl.uniform4f(q.u.uFx, p.bloom, p.vig, p.grain, p.ca);
      gl.uniform3fv(q.u.uShT, p.shT); gl.uniform3fv(q.u.uHiT, p.hiT); gl.uniform3fv(q.u.uVigT, p.vigT); gl.uniform1f(q.u.uStreak, p.streak);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.activeTexture(gl.TEXTURE0); gl.bindVertexArray(null);
    },
  };
}
