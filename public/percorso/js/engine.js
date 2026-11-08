// Motore: WebGL2 scritto a mano. Geometrie, shader, texture, tavolozza.
// Tavolozza di KUKO LAB: nero, arancio del marchio e un bianco caldo. Il resto della scena è miscela di questi; attrezzi e materiali hanno i loro colori veri.
import { M, lathe, smooth, sweep, leaf, upload, program } from './gl.js';
import { LIGHT_GLSL, LIGHT_UNIFORMS } from './light.js';
export { M, lathe, smooth, sweep, leaf, upload };

/* ---------- tavolozza ---------- */
export const hx = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const SAND = hx('#EFE8DC'), MOCHA = hx('#0B0B0D'), PINK = hx('#E86028');
export const PAL = {
  sand: SAND, mocha: MOCHA, pink: PINK,
  sandL: mixc(SAND, [1, 1, 1], 0.55),          // luce sulla sabbia
  sandD: mixc(SAND, MOCHA, 0.16),               // sabbia in ombra
  tan: mixc(SAND, MOCHA, 0.38),                 // sabbia scura
  khaki: mixc(SAND, MOCHA, 0.62),               // verde moka schiarito (foglie, bucce)
  olive: mixc(SAND, MOCHA, 0.82),               // verde moka quasi pieno
  pinkS: mixc(PINK, SAND, 0.55),                // rosa molto smorzato
  pinkD: mixc(PINK, MOCHA, 0.32),               // rosa in ombra
};

/* ---------- geometrie ---------- */
export function sphere(seg = 28) {
  const p = []; for (let i = 0; i <= seg; i++) { const a = Math.PI * i / seg; p.push([Math.sin(a), -Math.cos(a)]); }
  return lathe(p, seg);
}
export function cyl(seg = 36) { return lathe([[0, -0.5], [1, -0.5], [1, -0.5], [1, 0.5], [1, 0.5], [0, 0.5]], seg); }
export function torus(R = 1, r = 0.25, seg = 48, tube = 14) {
  const p = []; for (let i = 0; i <= tube; i++) { const a = Math.PI * 2 * i / tube; p.push([R + r * Math.cos(a), r * Math.sin(a)]); }
  return lathe(p, seg);
}
function flat(tris) { // tris: array di [a,b,c] punti 3D; normali piatte
  const pos = [], nor = [], idx = [];
  tris.forEach((t, i) => {
    const [a, b, c] = t, ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    pos.push(...a, ...b, ...c); nor.push(nx, ny, nz, nx, ny, nz, nx, ny, nz); idx.push(i * 3, i * 3 + 1, i * 3 + 2);
  });
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint32Array(idx) };
}
export function box() {
  const q = (a, b, c, d) => [[a, b, c], [a, c, d]], h = 0.5, T = [];
  const v = (x, y, z) => [x * h, y * h, z * h];
  T.push(...q(v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)));      // +z
  T.push(...q(v(1, -1, -1), v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1)));  // -z
  T.push(...q(v(1, -1, 1), v(1, -1, -1), v(1, 1, -1), v(1, 1, 1)));      // +x
  T.push(...q(v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1)));  // -x
  T.push(...q(v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1), v(-1, 1, -1)));      // +y
  T.push(...q(v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)));  // -y
  return flat(T);
}
// tronco di piramide aperto in alto (borsa): larghezza/profondità in basso e in alto, altezza 1 (da -0.5 a 0.5)
export function bag(wb, wt, db, dt) {
  const B = [[-wb, -.5, db], [wb, -.5, db], [wb, -.5, -db], [-wb, -.5, -db]], Tp = [[-wt, .5, dt], [wt, .5, dt], [wt, .5, -dt], [-wt, .5, -dt]];
  const T = [];
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; T.push([B[i], B[j], Tp[j]], [B[i], Tp[j], Tp[i]]); }
  T.push([B[0], B[3], B[2]], [B[0], B[2], B[1]]);
  for (let i = 0; i < 4; i++) { const j = (i + 1) % 4; T.push([B[j], B[i], Tp[i]], [B[j], Tp[i], Tp[j]]); } // retro (doppia faccia)
  return flat(T);
}
// poligono convesso 2D (z=0) estruso su profondità d, centrato in z
export function extrude(poly, d = 0.1) {
  const T = [], n = poly.length, z0 = -d / 2, z1 = d / 2;
  let cx = 0, cy = 0; poly.forEach((p) => { cx += p[0] / n; cy += p[1] / n; });
  for (let i = 0; i < n; i++) {
    const a = poly[i], b = poly[(i + 1) % n];
    T.push([[cx, cy, z1], [a[0], a[1], z1], [b[0], b[1], z1]]); T.push([[cx, cy, z0], [b[0], b[1], z0], [a[0], a[1], z0]]);
    T.push([[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1]]); T.push([[a[0], a[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]]);
  }
  return flat(T);
}
export const halfDisc = (r = 1, n = 28) => { const p = []; for (let i = 0; i <= n; i++) { const a = Math.PI * (1 + i / n); p.push([Math.cos(a) * r, Math.sin(a) * r + r * 0.5]); } return p; };
export const rrect = (w, h, r, n = 5) => { // rettangolo arrotondato (convesso)
  const p = [], cs = [[w / 2 - r, h / 2 - r, 0], [-w / 2 + r, h / 2 - r, 1], [-w / 2 + r, -h / 2 + r, 2], [w / 2 - r, -h / 2 + r, 3]];
  cs.forEach(([cx, cy, q]) => { for (let i = 0; i <= n; i++) { const a = Math.PI / 2 * (q + i / n); p.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } });
  return p;
};
export function helix(turns = 2, R = 0.5, h = 3, n = 60, phase = 0) { const pts = [], rad = []; for (let i = 0; i <= n; i++) { const t = i / n, a = phase + t * turns * Math.PI * 2; pts.push([Math.cos(a) * R, (t - 0.5) * h, Math.sin(a) * R]); rad.push(0.035); } return sweep(pts, rad, 8); }

/* ---------- shader ---------- */
const V3 = '#version 300 es\n';
const VS_MESH = V3 + `layout(location=0) in vec3 aPos; layout(location=1) in vec3 aNor;
uniform mat4 uM; uniform mat4 uVP; out vec3 vW; out vec3 vN; out vec3 vObj; out mat3 vNM;
void main(){ vec4 w = uM*vec4(aPos,1.); vW = w.xyz; mat3 nm = transpose(inverse(mat3(uM))); vNM = nm; vN = nm*aNor; vObj = aPos; gl_Position = uVP*w; }`;
const FS_MESH = V3 + `precision highp float;
in vec3 vW; in vec3 vN; in vec3 vObj; in mat3 vNM; uniform vec3 uEye, uCol, uFogC; uniform vec4 uP; uniform vec2 uFog; uniform float uAlpha; uniform vec3 uGlow;
${LIGHT_UNIFORMS}${LIGHT_GLSL}
out vec4 o;
void main(){
  vec3 n = normalize(vN); if(!gl_FrontFacing) n = -n;
  vec3 V = normalize(uEye - vW);
  vec3 c = toDsp(shade(uCol, n, V, vW, uP, vObj, vNM)) + uGlow;
  float fd = length(uEye - vW); float f = smoothstep(uFog.x,uFog.y,fd);
  c = mix(c,uFogC,f*.8);
  o = vec4(c*uAlpha,uAlpha);
}`;
// solo profondità, per la mappa delle ombre
const VS_SHADOW = V3 + `layout(location=0) in vec3 aPos; uniform mat4 uM; uniform mat4 uLVP; void main(){ gl_Position = uLVP*uM*vec4(aPos,1.); }`;
const FS_SHADOW = V3 + `precision highp float; out vec4 o; void main(){ o = vec4(1.); }`;
const VS_QUAD = V3 + `layout(location=0) in vec2 aP; uniform mat4 uMVP; out vec2 vUv; out vec2 vP;
void main(){ vP = aP; vUv = vec2(aP.x+.5, .5-aP.y); gl_Position = uMVP*vec4(aP,0.,1.); }`;
const FS_TEX = V3 + `precision highp float; in vec2 vUv; in vec2 vP; uniform sampler2D uTex; uniform float uAlpha, uMode, uBias, uPIn, uPOut, uAsp; uniform vec3 uTint, uPink, uRim; uniform vec2 uRes; out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float vn(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float sdBox(vec2 p, vec2 b, float r){ vec2 d = abs(p)-b+r; return length(max(d,0.))+min(max(d.x,d.y),0.)-r; }
void main(){
  vec4 t = texture(uTex, vUv, uBias);   // premoltiplicata
  if(uMode > 3.5){ o = vec4(uTint*t.a, t.a)*uAlpha; return; }
  float a = 1.; float rim = 0.;
  if(uMode > 2.5){            // fotografia: angoli morbidi
    float d = sdBox(vP*vec2(uAsp,1.), vec2(.5*uAsp,.5), .035); a = 1.-smoothstep(-.004,.004,d);
  } else if(uMode > 1.5){     // piatto: maschera tonda con bordo
    float r = length(vP)*2.; a = 1.-smoothstep(.97,1.,r);
    float ring = smoothstep(.92,.945,r)*(1.-smoothstep(.97,.99,r));
    t.rgb = mix(t.rgb, uRim, ring*.9);
  } else if(uMode > .5){      // figura: dissolvenza a scansione con bordo rosa
    vec2 s = gl_FragCoord.xy/uRes;
    float f = .52*(1.-s.y) + .30*vn(s*vec2(7.,5.)+3.) + .18*vn(s*vec2(19.,13.)-1.5);
    float pi = mix(-.12,1.12,uPIn), po = mix(-.12,1.12,uPOut);
    a = (1.-smoothstep(pi-.012,pi+.012,f)) * smoothstep(po-.012,po+.012,f);
    float bw = .016;
    rim = (1.-smoothstep(0.,bw,abs(f-pi)))*step(.001,uPIn)*step(uPIn,.999) + (1.-smoothstep(0.,bw,abs(f-po)))*step(.001,uPOut)*step(uPOut,.999);
    t.rgb *= uTint;
  }
  vec3 c = t.rgb*a; float al = t.a*a;
  c += uPink*rim*t.a*.6; al = max(al, rim*t.a*.6);
  o = vec4(c*uAlpha, al*uAlpha);
}`;
const FS_FX = V3 + `precision highp float; in vec2 vUv; in vec2 vP; uniform float uKind, uAlpha, uTime, uA, uB, uC; uniform vec3 uCol, uCol2; out vec4 o;
float h21(vec2 p){ p = fract(p*vec2(123.34,456.21)); p += dot(p,p+45.32); return fract(p.x*p.y); }
float box(vec2 p, vec2 b, float r){ vec2 d = abs(p)-b+r; return length(max(d,0.))+min(max(d.x,d.y),0.)-r; }
void main(){
  vec2 p = vP; float a = 0.; vec3 c = uCol;
  if(uKind < .5){ float r = length(p)*2.; a = pow(max(1.-r,0.),uA); }                         // alone morbido
  else if(uKind < 1.5){ // piastrelle (cucina): moduli con fuga
    vec2 g = vec2(uA, uA*uB); vec2 q = fract(p*g+.5)-.5; float d = box(q, vec2(.5-.035), .09);
    float id = h21(floor(p*g+.5)); c = mix(uCol, uCol2, id*.55); a = (1.-smoothstep(-.012,.01,d)); a *= 1.-.0*id;
  } else if(uKind < 2.5){ // griglia tecnica
    vec2 g = p*uA; vec2 f = abs(fract(g-.5)-.5)/fwidth(g);
    float line = 1.-min(min(f.x,f.y),1.); vec2 g2 = g*.2; vec2 f2 = abs(fract(g2-.5)-.5)/fwidth(g2); float big = 1.-min(min(f2.x,f2.y),1.);
    a = line*.35 + big*.65; a *= smoothstep(.5,.15,length(p));
  } else if(uKind < 3.5){ // fasci di luce
    float x = p.x + p.y*uA; float s = .5+.5*sin(x*uB*6.2831+uTime*.2); a = pow(s,6.)*smoothstep(-.5,.5,p.y)*smoothstep(.5,.2,abs(p.x)*1.2);
  } else if(uKind < 4.5){ // arco / finestra
    float d = box(p+vec2(0.,-.0), vec2(.5,.5), .5*uA); a = 1.-smoothstep(-.004,.004,d);
  } else if(uKind < 5.5){ // anelli sottili
    float r = length(p)*2.; float ring = 0.; for(int i=0;i<4;i++){ float rr = .35+float(i)*.2+.015*sin(uTime*.3+float(i)); ring = max(ring, 1.-smoothstep(0.,.006+.0006*float(i),abs(r-rr))); }
    a = ring*(1.-smoothstep(.8,1.,r));
  } else if(uKind < 6.5){ // ombra a terra
    float r = length(p*vec2(1.,1.6))*2.; a = pow(max(1.-r,0.),uA);
  } else if(uKind < 7.5){ // onda: un solo anello che si espande (uA raggio, uB spessore)
    float r = length(p)*2.; a = 1.-smoothstep(0.,uB,abs(r-uA));
  } else { a = 1.; }
  o = vec4(c*a*uAlpha, a*uAlpha);
}`;
const VS_BG = V3 + `layout(location=0) in vec2 aP; out vec2 vUv; void main(){ vUv = aP*.5+.5; gl_Position = vec4(aP,.9999,1.); }`;
const FS_BG = V3 + `precision highp float; in vec2 vUv; uniform vec3 uTop, uBot, uGlow, uVig; uniform vec2 uGlowPos; uniform float uGlowK, uAsp, uTime, uVigK; out vec4 o;
float h21(vec2 p){ return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453); }
void main(){
  vec3 c = mix(uBot, uTop, smoothstep(0.,1.,vUv.y));
  float g = exp(-pow(length((vUv-uGlowPos)*vec2(uAsp,1.)),2.)*1.7); c = mix(c,uGlow,g*uGlowK);
  float v = pow(length((vUv-.5)*vec2(uAsp*.55,1.))*1.25,2.); c = mix(c,uVig,clamp(v*uVigK,0.,1.));
  c += (h21(gl_FragCoord.xy+fract(uTime)*37.)-.5)*.014;
  o = vec4(c,1.);
}`;
const VS_PT = V3 + `layout(location=0) in vec4 aA; layout(location=1) in vec4 aB; uniform mat4 uVP; uniform float uPx; out vec4 vC; out float vS;
void main(){ vec4 p = uVP*vec4(aA.xyz,1.); gl_Position = p; gl_PointSize = max(1.,aA.w*uPx/p.w); vC = aB; vS = aA.w; }`;
const FS_PT = V3 + `precision highp float; in vec4 vC; uniform float uSoft; out vec4 o;
void main(){ vec2 q = gl_PointCoord*2.-1.; float r = length(q); float a = (1.-smoothstep(1.-uSoft,1.,r))*vC.a; o = vec4(vC.rgb*a,a); }`;

/* ---------- contesto ---------- */
export function createGL(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const P = {
    mesh: program(gl, VS_MESH, FS_MESH), shadow: program(gl, VS_SHADOW, FS_SHADOW), tex: program(gl, VS_QUAD, FS_TEX), fx: program(gl, VS_QUAD, FS_FX),
    bg: program(gl, VS_BG, FS_BG), pt: program(gl, VS_PT, FS_PT),
  };
  // quadrato unitario e triangolo a schermo intero
  const qv = gl.createVertexArray(); gl.bindVertexArray(qv);
  const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-.5, -.5, .5, -.5, .5, .5, -.5, -.5, .5, .5, -.5, .5]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
  const bv = gl.createVertexArray(); gl.bindVertexArray(bv);
  const bb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bb);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindVertexArray(null);
  // particelle
  const pv = gl.createVertexArray(); gl.bindVertexArray(pv);
  const pa = gl.createBuffer(), pb = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, pa); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, pb); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { gl, P, qv, bv, pv, pa, pb };
}

export function texFromBitmap(gl, bmp, { mip = true, premul = true } = {}) {
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premul);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bmp);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mip ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  if (mip) gl.generateMipmap(gl.TEXTURE_2D);
  return { t, w: bmp.width, h: bmp.height };
}
