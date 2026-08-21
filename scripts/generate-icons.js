/* ============================================================
   Gerador de ícones PWA - Grupo Aureos | Alerta de LEADS
   ------------------------------------------------------------
   Gera o ícone do app (badge com gradiente + letras "GA")
   sem nenhuma dependência externa (encoder PNG em Node puro).

   Uso:  node scripts/generate-icons.js
         node scripts/generate-icons.js --preview   (visualiza em ASCII)
   Saída: pwa/icons/icon-192.png
          pwa/icons/icon-512.png
          pwa/icons/icon-maskable-512.png
   ============================================================ */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

/* ---------- Mini encoder PNG (sem dependências) ---------- */
const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
    return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
    const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;  // bit depth
    ihdr[9] = 6;  // color type: RGBA

    const raw = Buffer.alloc((width * 4 + 1) * height);
    for (let y = 0; y < height; y++) {
        raw[y * (width * 4 + 1)] = 0; // filter: none
        rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
    }
    const idat = zlib.deflateSync(raw);
    return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* ---------- Utilitários de desenho ---------- */
function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

// Cobertura suavizada (anti-aliasing) a partir de uma distância assinada em pixels
function cover(d) { return clamp01(0.5 - d); }

function distSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    const L2 = dx * dx + dy * dy;
    let t = L2 ? ((px - x1) * dx + (py - y1) * dy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function sdfRoundRect(px, py, cx, cy, hw, hh, r) {
    const qx = Math.abs(px - cx) - (hw - r);
    const qy = Math.abs(py - cy) - (hh - r);
    return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r;
}

function lerpColor(a, b, t) {
    return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t)
    ];
}

// Gradiente diagonal (canto superior esquerdo -> canto inferior direito)
function gradientAt(px, py, size, from, to) {
    const t = clamp01(((px / size) + (py / size)) / 2);
    return lerpColor(from, to, t);
}

/* ---------- Letras geométricas: G e A ---------- */

// A: dois traços diagonais (vértice no topo) + barra horizontal
function distToA(px, py, cx, topY, height, width, t) {
    const botY = topY + height;
    const dL = distSeg(px, py, cx, topY, cx - width / 2, botY);
    const dR = distSeg(px, py, cx, topY, cx + width / 2, botY);
    const barY = topY + height * 0.58;
    const barHalf = width * 0.44;
    const dB = distSeg(px, py, cx - barHalf, barY, cx + barHalf, barY);
    return Math.min(dL, dR, dB) - t / 2;
}

// G: anel com abertura à direita + traço horizontal para dentro
function insideG(px, py, cx, cy, R, t, opening) {
    const dx = px - cx, dy = py - cy;
    const r = Math.hypot(dx, dy);
    const inRing = Math.abs(r - (R - t / 2)) <= t / 2;
    const ang = Math.abs(Math.atan2(dy, dx));
    const inWedge = ang < opening;               // abertura à direita
    const inTail = distSeg(px, py, cx + R * 0.95, cy, cx + R * 0.2, cy) <= t / 2;
    return (inRing && !inWedge) || inTail;
}

/* ---------- Renderização ---------- */
const SS = 4; // supersampling 4x4 para bordas suaves

function renderIcon(size, opts) {
    const img = Buffer.alloc(size * size * 4);
    const { bg, badge, letters } = opts;
    const cx = size / 2, cy = size / 2;

    // Geometria do layout das letras ("GA" centralizado)
    const H = letters.height;
    const R = H / 2;                        // raio do anel do G
    const Aw = letters.aWidth;              // largura do A
    const gap = letters.gap;
    const t = letters.stroke;               // espessura dos traços
    const lockup = 2 * R + gap + Aw;        // largura total do "GA"
    const leftEdge = cx - lockup / 2;
    const gx = leftEdge + R;                // centro do anel do G
    const ax = leftEdge + 2 * R + gap + Aw / 2; // centro do A
    const topY = cy - H / 2;

    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let r = 0, g = 0, b = 0;
            for (let sy = 0; sy < SS; sy++) {
                for (let sx = 0; sx < SS; sx++) {
                    const px = x + (sx + 0.5) / SS;
                    const py = y + (sy + 0.5) / SS;
                    let col = bg.gradient
                        ? gradientAt(px, py, size, bg.from, bg.to)
                        : bg.value;

                    if (badge) {
                        // sombra do badge
                        const sh = cover(sdfRoundRect(px, py + badge.shadowOffset, cx, cy + badge.shadowOffset, badge.hw * 1.02, badge.hh * 1.02, badge.r * 1.02));
                        if (sh > 0) {
                            col = [
                                Math.round(col[0] * (1 - sh * 0.4)),
                                Math.round(col[1] * (1 - sh * 0.4)),
                                Math.round(col[2] * (1 - sh * 0.4))
                            ];
                        }

                        // badge (gradiente) sobre o fundo
                        const bc = cover(sdfRoundRect(px, py, cx, cy, badge.hw, badge.hh, badge.r));
                        if (bc > 0) {
                            const bCol = gradientAt(px, py, size, badge.from, badge.to);
                            col = [
                                Math.round(col[0] * (1 - bc) + bCol[0] * bc),
                                Math.round(col[1] * (1 - bc) + bCol[1] * bc),
                                Math.round(col[2] * (1 - bc) + bCol[2] * bc)
                            ];
                        }
                    }

                    // letras "GA" em branco
                    if (letters.enabled) {
                        const aCov = cover(distToA(px, py, ax, topY, H, Aw, t));
                        const gCov = insideG(px, py, gx, cy, R, t, letters.opening) ? 1 : 0;
                        const lc = Math.max(aCov, gCov);
                        if (lc > 0) {
                            col = [
                                Math.round(col[0] * (1 - lc) + letters.color[0] * lc),
                                Math.round(col[1] * (1 - lc) + letters.color[1] * lc),
                                Math.round(col[2] * (1 - lc) + letters.color[2] * lc)
                            ];
                        }
                    }

                    r += col[0]; g += col[1]; b += col[2];
                }
            }
            const n = SS * SS;
            const idx = (y * size + x) * 4;
            img[idx] = Math.round(r / n);
            img[idx + 1] = Math.round(g / n);
            img[idx + 2] = Math.round(b / n);
            img[idx + 3] = 255;
        }
    }
    return encodePNG(size, size, img);
}

/* ---------- Definição dos ícones ---------- */
const BRAND_FROM = [255, 138, 31];  // laranja claro (topo esquerdo)
const BRAND_TO = [217, 72, 15];     // laranja queimado (base direita)
const DARK_BG = [18, 18, 20];       // #121214

function regularSpec(size) {
    const s = size * 0.78; // tamanho do badge
    return {
        bg: { gradient: false, value: DARK_BG },
        badge: {
            hw: s / 2, hh: s / 2, r: s * 0.22,
            shadowOffset: size * 0.014,
            from: BRAND_FROM, to: BRAND_TO
        },
        letters: {
            enabled: true,
            color: [255, 255, 255],
            height: s * 0.42,
            aWidth: s * 0.34,
            gap: s * 0.12,
            stroke: s * 0.095,
            opening: 0.35
        }
    };
}

function maskableSpec(size) {
    return {
        bg: { gradient: true, from: BRAND_FROM, to: BRAND_TO },
        badge: null,
        letters: {
            enabled: true,
            color: [255, 255, 255],
            height: size * 0.34,
            aWidth: size * 0.27,
            gap: size * 0.09,
            stroke: size * 0.08,
            opening: 0.35
        }
    };
}

/* ---------- Geração ---------- */
const OUT_DIR = path.join(__dirname, '..', 'pwa', 'icons');
const PREVIEW = process.argv.includes('--preview');

const icons = [
    { file: 'icon-192.png',          size: 192, spec: regularSpec(192) },
    { file: 'icon-512.png',          size: 512, spec: regularSpec(512) },
    { file: 'icon-maskable-512.png', size: 512, spec: maskableSpec(512) }
];

fs.mkdirSync(OUT_DIR, { recursive: true });

for (const icon of icons) {
    const out = path.join(OUT_DIR, icon.file);
    fs.writeFileSync(out, renderIcon(icon.size, icon.spec));
    console.log(`Gerado: ${path.relative(process.cwd(), out)} (${icon.size}x${icon.size})`);
}

console.log('Ícones PWA gerados com sucesso!');

// Pré-visualização ASCII do ícone (para conferir o desenho das letras)
if (PREVIEW) {
    const size = 48;
    const png = renderIcon(size, regularSpec(size));
    let off = 8, raw = null;
    while (off < png.length) {
        const len = png.readUInt32BE(off);
        const type = png.toString('ascii', off + 4, off + 8);
        if (type === 'IDAT') {
            raw = zlib.inflateSync(png.slice(off + 8, off + 8 + len));
            break;
        }
        off += 12 + len;
    }
    console.log('\nPré-visualização ASCII (GA em 48px):\n');
    const chars = ' .:-=+*#%@';
    for (let y = 0; y < size; y++) {
        let line = '';
        for (let x = 0; x < size; x++) {
            const i = (y * (size * 4 + 1)) + 1 + x * 4;
            const luma = 0.299 * raw[i] + 0.587 * raw[i + 1] + 0.114 * raw[i + 2];
            line += chars[Math.min(9, Math.floor(luma / 26))];
        }
        console.log(line);
    }
}

// Exporta as funções para permitir testes/verificações externas
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { renderIcon, regularSpec, maskableSpec, encodePNG };
}
