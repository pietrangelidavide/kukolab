// Luce da set cinematografico, condivisa da tutti i programmi che disegnano oggetti (oggetti di scena, personaggio, viso).
// Una luce principale calda con ombre morbide, un controluce che stacca i contorni, ambiente a due toni (cielo e rimbalzo),
// riflessi di uno studio finto (softbox) e qualche materiale: pelle (luce che attraversa), tessuto, capelli, frutta, metallo, legno.
// Il risultato resta nello spazio dei colori della pagina (gamma) ma può superare 1: la post-produzione ne fa bagliore.

export const KEYDIR = (() => { const v = [-0.62, 0.7, 0.5], l = Math.hypot(...v); return v.map((x) => x / l); })(); // verso la luce principale
export const RIMDIR = (() => { const v = [0.7, 0.32, -0.7], l = Math.hypot(...v); return v.map((x) => x / l); })();  // verso il controluce
export const SIDEDIR = (() => { const v = [0.95, 0.14, -0.12], l = Math.hypot(...v); return v.map((x) => x / l); })(); // luce laterale arancione, da destra

// tipi di materiale (uP.w)
export const MAT = { plain: 0, skin: 1, cloth: 2, hair: 3, organic: 4, metal: 5, glass: 6, wood: 7 };

export const LIGHT_UNIFORMS = `uniform mat4 uLVP; uniform highp sampler2DShadow uSM; uniform vec4 uSMp;
uniform vec3 uKeyC, uAmbT, uAmbB, uRimC, uKeyD, uRimD, uSideC, uSideD, uObjS; uniform float uClip;
`;

export const LIGHT_GLSL = `
vec3 toLin(vec3 c){ return pow(max(c,vec3(0.)), vec3(2.2)); }
vec3 toDsp(vec3 c){ return pow(max(c,vec3(0.)), vec3(1./2.2)); }
float hash13(vec3 p){ p = fract(p*.1031); p += dot(p, p.zyx+31.32); return fract((p.x+p.y)*p.z); }
float vnoise(vec3 x){
  vec3 i = floor(x), f = fract(x); f = f*f*(3.-2.*f);
  return mix(mix(mix(hash13(i),hash13(i+vec3(1,0,0)),f.x), mix(hash13(i+vec3(0,1,0)),hash13(i+vec3(1,1,0)),f.x), f.y),
             mix(mix(hash13(i+vec3(0,0,1)),hash13(i+vec3(1,0,1)),f.x), mix(hash13(i+vec3(0,1,1)),hash13(i+vec3(1,1,1)),f.x), f.y), f.z);
}
vec3 nGrad(vec3 p){ float e = .03; float n0 = vnoise(p); return vec3(vnoise(p+vec3(e,0,0))-n0, vnoise(p+vec3(0,e,0))-n0, vnoise(p+vec3(0,0,e))-n0)/e; }

float shadowAt(vec3 wp, vec3 n){
  if(uSMp.x < .5) return 1.;
  vec4 lp = uLVP*vec4(wp + n*uSMp.w, 1.);
  vec3 p = lp.xyz/lp.w*.5 + .5;
  if(p.x < 0. || p.x > 1. || p.y < 0. || p.y > 1. || p.z > 1.) return 1.;
  float s = 0., r = uSMp.y*1.6;
  for(int i = -1; i <= 1; i++) for(int j = -1; j <= 1; j++) s += texture(uSM, vec3(p.xy + vec2(float(i), float(j))*r, p.z - uSMp.z));
  return s/9.;
}

vec3 studioEnv(vec3 d, float r){
  float up = d.y*.5 + .5;
  vec3 c = mix(uAmbB*.8, uAmbT*1.6, smoothstep(.12,.95,up));
  float w = .05 + r*.55;
  c += uKeyC*1.9*smoothstep(1.-w*1.7, 1.-w*.15, dot(d, uKeyD));
  c += uRimC*2.1*smoothstep(1.-w*1.9, 1.-w*.25, dot(d, uRimD));
  c += vec3(.95,.97,1.)*.9*smoothstep(.22+w*.6, .0, abs(d.x-.82))*smoothstep(-.3,.25,d.y)*smoothstep(.85,.35,abs(d.z));
  return c;
}

float D_GGX(float NoH, float a2){ float d = NoH*NoH*(a2-1.) + 1.; return a2/(3.14159*d*d + 1e-5); }
float V_SmithG(float NoV, float NoL, float a){ float k = a*.5 + 1e-3; return .25/((NoV*(1.-k) + k)*(NoL*(1.-k) + k)); }

// colore dell'oggetto (alb, come nella palette), normale n, direzione verso la camera V, posizione nel mondo wp,
// materiale P = (speculare, lucentezza, bordo, tipo), posizione nell'oggetto obj e matrice per portare le normali nel mondo NM
vec3 shade(vec3 alb, vec3 n, vec3 V, vec3 wp, vec4 P, vec3 obj, mat3 NM){
  float kind = P.w;
  bool skin = kind > .5 && kind < 1.5, cloth = kind > 1.5 && kind < 2.5, hair = kind > 2.5 && kind < 3.5, organic = kind > 3.5 && kind < 4.5, metal = kind > 4.5 && kind < 5.5, wood = kind > 6.5;
  float rough = clamp(sqrt(2./(P.y + 2.)), .07, 1.);
  float spk = P.x;
  if(organic){
    vec3 g = nGrad(obj*7.); n = normalize(n + NM*g*.022);
    alb *= .84 + .32*vnoise(obj*5. + 3.);
    float sp = smoothstep(.72,.86, vnoise(obj*16. + 7.)); alb = mix(alb, alb*.7, sp*.5); // puntini della buccia
  } else if(wood){
    float gr = vnoise(vec3(obj.x*2., obj.y*26., obj.z*2.)); alb *= .9 + .2*gr; n = normalize(n + NM*nGrad(vec3(obj.x*3., obj.y*30., obj.z*3.))*.012);
  } else if(cloth){
    float gf = clamp(kind - 2., 0., .49);
    vec3 qw = obj*uObjS; float aa = 1. - smoothstep(.25, .9, fwidth(qw.x*420.) + fwidth(qw.y*420.)); // trama in unità di scena, sfuma se più fine di un pixel
    float w1 = sin(qw.x*420.)*sin(qw.y*420.), w2 = sin(qw.z*420.)*sin(qw.y*420.); alb *= 1. + .03*aa*(w1 + w2);
    n = normalize(n + NM*nGrad(qw*130.)*.012*aa);
    if(gf > .01){ // capo tecnico: cuciture piatte ai lati, pieghe nell'articolazione piegata, orlo
      float bend = clamp((gf - .02)/.44, 0., 1.);
      float fz = fwidth(obj.z) + 1e-5;
      float s0 = 1. - smoothstep(0., 1.5*fz, abs(obj.z)), s1 = 1. - smoothstep(0., 1.1*fz, abs(abs(obj.z) - 4.5*fz));
      alb *= 1. - .36*s0 - .17*s1;
      float jw = max(smoothstep(.62, 1., obj.y), smoothstep(.38, 0., obj.y));
      float fo = sin(obj.y*72. + vnoise(obj*5.)*5. + obj.x*6.);
      float fa = bend*jw*(.3 + .7*smoothstep(-.2, .9, obj.z));
      alb *= 1. - .24*fa*(.5 + .5*fo);
      n = normalize(n + NM*vec3(0., fo, 0.)*.32*fa);
      alb *= 1. - .4*smoothstep(uClip - .05, uClip, obj.y);
    }
  } else if(hair){ // fili: righe fini lungo la ciocca (la direzione in cui scende)
    float st = vnoise(vec3(obj.x*26., obj.y*1.3, obj.z*26.)), st2 = vnoise(vec3(obj.x*75., obj.y*2.4, obj.z*75.));
    alb *= .78 + .28*st + .16*st2;
    alb *= mix(1.1, .7, .45 + .55*smoothstep(.6, 1.7, obj.y)); // radici più scure, punte più chiare
  }
  if(skin){ // pelle: arrossamenti, macchie e pori in unità di mondo (legati al corpo, non allo schermo)
    vec3 q = obj*uObjS;
    float bl = vnoise(q*13. + 4.), bl2 = vnoise(q*36.), pr = vnoise(q*105.);
    alb = mix(alb, alb*vec3(1.07, .9, .86), smoothstep(.45, .9, bl)*.2);
    alb *= (.965 + .07*bl2)*(.975 + .04*pr);
    n = normalize(n + NM*nGrad(q*105.)*.0042);
  }
  vec3 a = toLin(alb);
  float NoV = max(dot(n, V), 1e-3);
  float NoL = dot(n, uKeyD);
  float sh = shadowAt(wp, n);
  float wrap = skin ? .55 : (cloth ? .3 : (hair ? .2 : 0.));
  float dl = clamp((NoL + wrap)/(1. + wrap), 0., 1.);
  vec3 amb = mix(uAmbB, uAmbT, n.y*.5 + .5);
  vec3 diff = a*(uKeyC*dl*sh + amb);
  if(skin){ // luce che attraversa la pelle: rossa al passaggio tra luce e ombra
    float t = smoothstep(-.35, .1, NoL)*(1. - smoothstep(.1, .6, NoL));
    diff += a*vec3(1., .32, .2)*t*.32*uKeyC*mix(.45, 1., sh);
    diff += a*vec3(1., .45, .32)*amb*.2;
  }
  // speculare principale (GGX)
  vec3 H = normalize(uKeyD + V);
  float NoH = max(dot(n, H), 0.), VoH = max(dot(V, H), 0.), nl = max(NoL, 0.);
  float f0s = mix(.03, .24, clamp(spk*1.5, 0., 1.));
  vec3 f0 = metal ? mix(vec3(f0s), a, .92) : vec3(f0s);
  vec3 F = f0 + (1. - f0)*pow(1. - VoH, 5.);
  vec3 sp = F*D_GGX(NoH, rough*rough)*V_SmithG(NoV, nl, rough)*nl*uKeyC*sh*3.14159*(metal ? 1.4 : 1.);
  if(hair){ // Kajiya-Kay: riflesso lungo il filo (i capelli scendono)
    vec3 T = normalize(vec3(0.,-1.,0.) - n*dot(vec3(0.,-1.,0.), n) + 1e-4);
    float sT = sqrt(max(0., 1. - pow(dot(T, H), 2.)));
    float shift = vnoise(obj*9.)*.12;
    float s1 = pow(max(0., sqrt(max(0., 1. - pow(dot(normalize(T + n*(.18 + shift)), H), 2.)))), 120.);
    float s2 = pow(max(0., sqrt(max(0., 1. - pow(dot(normalize(T - n*(.22 - shift)), H), 2.)))), 38.);
    sp = uKeyC*sh*(s1*.34 + s2*.26*mix(vec3(1.), a*2.4, .8))*smoothstep(-.1, .4, NoL);
  }
  // luce laterale arancione: avvolge il lato destro del corpo (senza ombre, morbida)
  float sNoL = dot(n, uSideD);
  float swr = skin ? .22 : (cloth ? .12 : .06);
  float sdl = clamp((sNoL + swr)/(1. + swr), 0., 1.);
  diff += a*uSideC*sdl*(skin ? 1.12 : 1.);
  { vec3 H2 = normalize(uSideD + V); float nl2 = max(sNoL, 0.);
    vec3 F2 = f0 + (1. - f0)*pow(1. - max(dot(V, H2), 0.), 5.);
    if(!hair) sp += F2*D_GGX(max(dot(n, H2), 0.), rough*rough)*V_SmithG(NoV, nl2, rough)*nl2*uSideC*3.14159*.85; }
  sp = sp/(1. + sp*.22); // riflessi controllati: i picchi non bruciano
  // riflessi dell'ambiente (softbox)
  vec3 R = reflect(-V, n);
  vec3 fe = f0 + (max(vec3(1. - rough), f0) - f0)*pow(1. - NoV, 5.);
  float envK = metal ? 1.1 : (hair ? .1 : (cloth ? .06 : (spk*2.4 + .08)));
  vec3 env = studioEnv(R, rough)*fe*envK*mix(.55, 1., sh);
  if(cloth){ env += uKeyC*pow(1. - NoV, 3.5)*.1*a; }
  // controluce: contorno luminoso sul lato opposto alla camera
  float rimF = pow(1. - NoV, 2.6)*P.z;
  float rimM = smoothstep(-.3, .55, dot(n, uRimD));
  vec3 rim = uRimC*rimF*rimM*(skin ? 1.05 : .8);
  rim += uKeyC*rimF*.06;
  return diff + sp + env + rim;
}
`;

// scala dell'oggetto lungo i suoi tre assi (lunghezza delle colonne della matrice): porta le coordinate dell'oggetto in unità di scena
export const objScale = (m) => [Math.hypot(m[0], m[1], m[2]), Math.hypot(m[4], m[5], m[6]), Math.hypot(m[8], m[9], m[10])];

// carica nel programma tutti i valori della luce (da chiamare con il programma già attivo)
export function setLight(gl, u, F) {
  if (!F || !F.light3) return;
  const L = F.light3;
  gl.uniformMatrix4fv(u.uLVP, false, L.lvp);
  gl.uniform4f(u.uSMp, L.smOn ? 1 : 0, 1 / L.smSize, L.bias, L.nOff);
  gl.uniform3fv(u.uKeyC, L.keyC); gl.uniform3fv(u.uAmbT, L.ambT); gl.uniform3fv(u.uAmbB, L.ambB); gl.uniform3fv(u.uRimC, L.rimC);
  gl.uniform3fv(u.uKeyD, KEYDIR); gl.uniform3fv(u.uRimD, RIMDIR);
  gl.uniform3fv(u.uSideC, L.sideC || [0, 0, 0]); gl.uniform3fv(u.uSideD, SIDEDIR);
  gl.activeTexture(gl.TEXTURE7); gl.bindTexture(gl.TEXTURE_2D, L.smTex); gl.uniform1i(u.uSM, 7);
  gl.activeTexture(gl.TEXTURE0);
}
