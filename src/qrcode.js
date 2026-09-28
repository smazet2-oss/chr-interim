'use strict';
// Générateur de QR codes sans dépendance (mode octet, versions 1 à 10), rendu en SVG.
// Adapté de l'algorithme de référence de Project Nayuki (licence MIT).

const NIVEAUX = { L: [0, 1], M: [1, 0], Q: [2, 3], H: [3, 2] }; // [index des tables, bits de format]
// Octets de correction par bloc et nombre de blocs, par niveau (L, M, Q, H) et par version (1 à 10).
const ECC_PAR_BLOC = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28],
];
const NB_BLOCS = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8],
];
const VERSION_MAX = 10;
const bit = (x, i) => ((x >>> i) & 1) !== 0;

function modulesBruts(v) {
  let r = (16 * v + 128) * v + 64;
  if (v >= 2) {
    const n = Math.floor(v / 7) + 2;
    r -= (25 * n - 10) * n - 55;
    if (v >= 7) r -= 36;
  }
  return r;
}
const octetsDonnees = (v, e) => Math.floor(modulesBruts(v) / 8) - ECC_PAR_BLOC[e][v] * NB_BLOCS[e][v];

/* Reed-Solomon sur GF(2^8), polynôme 0x11D. */
function mul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z;
}
function diviseur(degre) {
  const r = new Array(degre).fill(0); r[degre - 1] = 1;
  let racine = 1;
  for (let i = 0; i < degre; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = mul(r[j], racine); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    racine = mul(racine, 0x02);
  }
  return r;
}
function reste(data, div) {
  const r = div.map(() => 0);
  for (const b of data) {
    const f = b ^ r.shift(); r.push(0);
    div.forEach((c, i) => { r[i] ^= mul(c, f); });
  }
  return r;
}

/** Découpe en blocs, ajoute la correction d'erreurs et entrelace. */
function avecCorrection(data, v, e) {
  const nb = NB_BLOCS[e][v], lecc = ECC_PAR_BLOC[e][v], brut = Math.floor(modulesBruts(v) / 8);
  const courts = nb - brut % nb, lcourt = Math.floor(brut / nb), div = diviseur(lecc), blocs = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const d = data.slice(k, k + lcourt - lecc + (i < courts ? 0 : 1)); k += d.length;
    const ecc = reste(d, div);
    if (i < courts) d.push(0);
    blocs.push(d.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocs[0].length; i++) blocs.forEach((b, j) => { if (i !== lcourt - lecc || j >= courts) out.push(b[i]); });
  return out;
}

class Matrice {
  constructor(v, e) {
    this.v = v; this.e = e; this.n = v * 4 + 17;
    this.m = Array.from({ length: this.n }, () => new Array(this.n).fill(false));
    this.f = Array.from({ length: this.n }, () => new Array(this.n).fill(false));
  }
  fixe(x, y, noir) { this.m[y][x] = noir; this.f[y][x] = true; }
  motifs() {
    const n = this.n;
    for (let i = 0; i < n; i++) { this.fixe(6, i, i % 2 === 0); this.fixe(i, 6, i % 2 === 0); }
    for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < n && y >= 0 && y < n) this.fixe(x, y, d !== 2 && d !== 4);
      }
    }
    const pos = this.alignements(), k = pos.length;
    for (let i = 0; i < k; i++) for (let j = 0; j < k; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === k - 1) || (i === k - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.fixe(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    this.format(0);
    if (this.v >= 7) {
      let r = this.v;
      for (let i = 0; i < 12; i++) r = (r << 1) ^ ((r >>> 11) * 0x1f25);
      const bits = (this.v << 12) | r;
      for (let i = 0; i < 18; i++) { const a = n - 11 + (i % 3), b = Math.floor(i / 3); this.fixe(a, b, bit(bits, i)); this.fixe(b, a, bit(bits, i)); }
    }
  }
  alignements() {
    if (this.v === 1) return [];
    const k = Math.floor(this.v / 7) + 2, pas = Math.ceil((this.v * 4 + 4) / (k * 2 - 2)) * 2, r = [6];
    for (let p = this.n - 7; r.length < k; p -= pas) r.splice(1, 0, p);
    return r;
  }
  format(masque) {
    const d = (NIVEAUX[this.e][1] << 3) | masque;
    let r = d;
    for (let i = 0; i < 10; i++) r = (r << 1) ^ ((r >>> 9) * 0x537);
    const b = ((d << 10) | r) ^ 0x5412, n = this.n;
    for (let i = 0; i <= 5; i++) this.fixe(8, i, bit(b, i));
    this.fixe(8, 7, bit(b, 6)); this.fixe(8, 8, bit(b, 7)); this.fixe(7, 8, bit(b, 8));
    for (let i = 9; i < 15; i++) this.fixe(14 - i, 8, bit(b, i));
    for (let i = 0; i < 8; i++) this.fixe(n - 1 - i, 8, bit(b, i));
    for (let i = 8; i < 15; i++) this.fixe(8, n - 15 + i, bit(b, i));
    this.fixe(8, n - 8, true);
  }
  placer(octets) {
    const n = this.n; let i = 0;
    for (let droite = n - 1; droite >= 1; droite -= 2) {
      if (droite === 6) droite = 5;
      for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
        const x = droite - j, haut = ((droite + 1) & 2) === 0, y = haut ? n - 1 - vert : vert;
        if (!this.f[y][x] && i < octets.length * 8) { this.m[y][x] = bit(octets[i >>> 3], 7 - (i & 7)); i++; }
      }
    }
  }
  masquer(k) {
    const T = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, x => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0][k];
    for (let y = 0; y < this.n; y++) for (let x = 0; x < this.n; x++) if (!this.f[y][x] && T(x, y)) this.m[y][x] = !this.m[y][x];
  }
  /** Pénalité standard (règles N1 à N4) pour choisir le masque le plus lisible. */
  penalite() {
    const n = this.n, m = this.m; let p = 0, noirs = 0;
    const lignes = [...Array(n).keys()].map(y => m[y]), colonnes = [...Array(n).keys()].map(x => m.map(r => r[x]));
    const finder = [true, false, true, true, true, false, true];
    for (const L of [...lignes, ...colonnes]) {
      let run = 1;
      for (let i = 1; i <= n; i++) {
        if (i < n && L[i] === L[i - 1]) run++;
        else { if (run >= 5) p += run - 2; run = 1; }
      }
      for (let i = 0; i + 7 <= n; i++) {
        if (!finder.every((v, k) => L[i + k] === v)) continue;
        const avant = i >= 4 && [1, 2, 3, 4].every(k => !L[i - k]), apres = i + 11 <= n && [7, 8, 9, 10].every(k => !L[i + k]);
        if (avant || apres) p += 40;
      }
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) {
      const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3;
    }
    for (const r of m) for (const c of r) if (c) noirs++;
    const t = n * n;
    return p + (Math.ceil(Math.abs(noirs * 20 - t * 10) / t) - 1) * 10;
  }
}

/** Matrice (tableau de lignes de booléens) du QR code d'un texte. */
function matrice(texte, niveau = 'M') {
  const e = NIVEAUX[niveau][0], octets = [...Buffer.from(String(texte), 'utf8')];
  let v = 1;
  const bitsNecessaires = ver => 4 + (ver <= 9 ? 8 : 16) + octets.length * 8;
  while (v <= VERSION_MAX && bitsNecessaires(v) > octetsDonnees(v, e) * 8) v++;
  if (v > VERSION_MAX) throw new Error('Texte trop long pour un QR code.');
  const cap = octetsDonnees(v, e) * 8, bits = [];
  const ajoute = (val, len) => { for (let i = len - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
  ajoute(0x4, 4); ajoute(octets.length, v <= 9 ? 8 : 16); octets.forEach(b => ajoute(b, 8));
  ajoute(0, Math.min(4, cap - bits.length));
  ajoute(0, (8 - bits.length % 8) % 8);
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) ajoute(pad, 8);
  const donnees = [];
  for (let i = 0; i < bits.length; i += 8) donnees.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  const q = new Matrice(v, niveau);
  q.motifs(); q.placer(avecCorrection(donnees, v, e));
  let meilleur = 0, min = Infinity;
  for (let k = 0; k < 8; k++) {
    q.masquer(k); q.format(k);
    const s = q.penalite(); if (s < min) { min = s; meilleur = k; }
    q.masquer(k);
  }
  q.masquer(meilleur); q.format(meilleur);
  return q.m;
}

/** QR code en SVG (marge de 4 modules). */
function svg(texte, { niveau = 'M', taille = null, couleur = '#112233', marge = 4, titre = '' } = {}) {
  const m = matrice(texte, niveau), n = m.length, t = n + marge * 2;
  let d = '';
  m.forEach((r, y) => r.forEach((c, x) => { if (c) d += `M${x + marge} ${y + marge}h1v1h-1z`; }));
  const dim = taille ? ` width="${taille}" height="${taille}"` : '';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}"${dim} shape-rendering="crispEdges" role="img"${titre ? ` aria-label="${esc(titre)}"` : ''}><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="${couleur}"/></svg>`;
}

module.exports = { matrice, svg };
