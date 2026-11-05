'use strict';

/**
 * キャラクターや器の絵。
 * PNG 画像があればそれを使い、なければここにある SVG のダミーを出します。
 *   ペリカン  → images/pelican.png
 *   器        → images/vessel_<id>.png(data/vessels.json の image)
 *   カモメ    → images/seagull.png
 */
const Art = (() => {
  // ── ペリカン(ダミー) ─────────────────────────────────
  const PELICAN_SVG =
    '<svg viewBox="0 0 120 120" aria-hidden="true">' +
      // 足
      '<g stroke="#E07B00" stroke-width="5" stroke-linecap="round" fill="none">' +
        '<path d="M48 96 L46 112 L38 114"/><path d="M62 96 L64 112 L72 114"/>' +
      '</g>' +
      // からだ
      '<ellipse cx="54" cy="78" rx="34" ry="24" fill="#FFFFFF" stroke="#3A2A1A" stroke-width="4"/>' +
      '<path d="M30 70 Q52 60 74 76 Q56 92 30 84 Z" fill="#DCE3EA" stroke="#3A2A1A" stroke-width="3"/>' +
      // 首と頭
      '<path d="M66 62 Q64 46 72 36" stroke="#3A2A1A" stroke-width="18" stroke-linecap="round" fill="none"/>' +
      '<path d="M66 62 Q64 46 72 36" stroke="#FFFFFF" stroke-width="11" stroke-linecap="round" fill="none"/>' +
      '<circle cx="78" cy="32" r="15" fill="#FFFFFF" stroke="#3A2A1A" stroke-width="4"/>' +
      // くちばしと、のど袋
      '<path d="M88 40 Q104 62 116 46 Z" fill="#FFB547" stroke="#3A2A1A" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M88 30 L118 42 L116 46 L88 40 Z" fill="#FF9A1F" stroke="#3A2A1A" stroke-width="3" stroke-linejoin="round"/>' +
      // 目とほっぺ
      '<circle cx="81" cy="28" r="3.6" fill="#2B1700"/><circle cx="82.2" cy="26.8" r="1.2" fill="#fff"/>' +
      '<circle cx="74" cy="37" r="3.5" fill="#FF9AA2" opacity="0.8"/>' +
    '</svg>';

  // ── カモメ(ダミー)。右向き。食材の丸とまちがえないよう、丸や名札は付けない ──
  const SEAGULL_SVG =
    '<svg viewBox="0 0 140 90" aria-hidden="true">' +
      // 奥の羽
      '<g class="wing wing-back"><path d="M66 46 Q54 12 26 2 Q50 26 80 46 Z" fill="#7F8C99" stroke="#2A2A2A" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M26 2 Q34 10 40 14 L34 6 Z" fill="#222"/></g>' +
      // しっぽ
      '<path d="M40 50 L14 42 L18 60 Z" fill="#FFFFFF" stroke="#2A2A2A" stroke-width="3" stroke-linejoin="round"/>' +
      '<path d="M14 42 L20 50 L18 60" fill="#222"/>' +
      // からだと頭
      '<ellipse cx="70" cy="54" rx="34" ry="15" fill="#FFFFFF" stroke="#2A2A2A" stroke-width="3"/>' +
      '<circle cx="104" cy="44" r="13" fill="#FFFFFF" stroke="#2A2A2A" stroke-width="3"/>' +
      // くちばし(黄色に赤い点)
      '<path d="M114 42 L136 48 L114 51 Z" fill="#F9C80E" stroke="#2A2A2A" stroke-width="2.5" stroke-linejoin="round"/>' +
      '<circle cx="128" cy="48.5" r="2.2" fill="#E53935"/>' +
      // いたずらっぽい目
      '<circle cx="108" cy="41" r="2.8" fill="#111"/>' +
      '<path d="M101 34 L113 37" stroke="#111" stroke-width="3" stroke-linecap="round"/>' +
      // 手前の羽
      '<g class="wing wing-front"><path d="M64 50 Q60 10 92 0 Q80 26 84 50 Z" fill="#A9B4BF" stroke="#2A2A2A" stroke-width="3" stroke-linejoin="round"/>' +
        '<path d="M92 0 Q86 8 85 16 L90 6 Z" fill="#222"/></g>' +
    '</svg>';

  // ── 器(ダミー)。どれも 300×120 の枠に、上のふちが y=14 前後になるように描く ──
  let uid = 0;   // 模様の id が重ならないように
  const VESSEL_SVG = {
    zaru() {
      const id = 'weave' + (++uid);
      return `<defs><pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
          '<rect width="14" height="14" fill="#D9A55B"/><rect width="7" height="14" fill="#C28A3E"/></pattern></defs>' +
        `<path d="M6 14 Q150 30 294 14 L262 104 Q150 124 38 104 Z" fill="url(#${id})" stroke="#7A4E1C" stroke-width="5"/>` +
        '<ellipse cx="150" cy="14" rx="146" ry="11" fill="#E8BE7A" stroke="#7A4E1C" stroke-width="5"/>';
    },
    donburi() {
      return '<path d="M118 104 L182 104 L178 118 L122 118 Z" fill="#1C3A66" stroke="#10213D" stroke-width="4"/>' +
        '<path d="M14 16 Q24 104 118 108 L182 108 Q276 104 286 16 Z" fill="#24477A" stroke="#10213D" stroke-width="5"/>' +
        '<g fill="none" stroke="#FFFFFF" stroke-width="4" opacity="0.9">' +
          [40, 80, 120, 160, 200, 240].map(x => `<path d="M${x} 62 a18 18 0 0 1 36 0"/><path d="M${x + 8} 62 a10 10 0 0 1 20 0"/>`).join('') +
        '</g>' +
        '<path d="M22 34 Q150 46 278 34" fill="none" stroke="#D84315" stroke-width="6"/>' +
        '<ellipse cx="150" cy="16" rx="136" ry="10" fill="#F5EFE3" stroke="#10213D" stroke-width="5"/>';
    },
    paella_pan() {
      return '<g fill="none" stroke="#1E1E1E" stroke-width="7">' +
          '<ellipse cx="16" cy="44" rx="13" ry="8"/><ellipse cx="284" cy="44" rx="13" ry="8"/></g>' +
        '<path d="M24 38 L44 92 Q150 112 256 92 L276 38 Z" fill="#3A3A3A" stroke="#1E1E1E" stroke-width="5"/>' +
        '<ellipse cx="150" cy="38" rx="128" ry="16" fill="#555555" stroke="#1E1E1E" stroke-width="5"/>' +
        '<ellipse cx="150" cy="40" rx="104" ry="10" fill="#E0A030" opacity="0.55"/>';
    },
    salad_bowl() {
      return '<path d="M14 18 Q22 106 150 112 Q278 106 286 18 Z" fill="#C8894A" stroke="#6B3F17" stroke-width="5"/>' +
        '<g fill="none" stroke="#A86A30" stroke-width="3" opacity="0.8">' +
          '<path d="M40 40 Q150 70 260 40"/><path d="M60 64 Q150 90 240 64"/><path d="M90 88 Q150 102 210 88"/></g>' +
        '<ellipse cx="150" cy="18" rx="136" ry="11" fill="#E2B07A" stroke="#6B3F17" stroke-width="5"/>';
    },
    flower_platter() {
      const flower = (x, y, c) =>
        `<g transform="translate(${x} ${y})">` +
          [0, 72, 144, 216, 288].map(a => `<circle cx="${(Math.cos(a * Math.PI / 180) * 6).toFixed(1)}" cy="${(Math.sin(a * Math.PI / 180) * 4).toFixed(1)}" r="4.5" fill="${c}"/>`).join('') +
          '<circle r="3" fill="#FFC107"/></g>';
      const spots = [[30, 76, '#E91E63'], [62, 98, '#1E88E5'], [104, 108, '#E91E63'], [150, 110, '#43A047'],
        [196, 108, '#1E88E5'], [238, 98, '#E91E63'], [270, 76, '#43A047'], [60, 52, '#1E88E5'], [240, 52, '#1E88E5'],
        [110, 44, '#43A047'], [190, 44, '#E91E63'], [150, 42, '#1E88E5']];
      return '<ellipse cx="150" cy="80" rx="146" ry="36" fill="#FFFFFF" stroke="#2B6CB0" stroke-width="5"/>' +
        spots.map(p => flower(p[0], p[1], p[2])).join('') +
        '<ellipse cx="150" cy="80" rx="100" ry="20" fill="#FBFBF7" stroke="#9EC1E6" stroke-width="3"/>';
    },
    tray_plates() {
      const plate = x => `<ellipse cx="${x}" cy="76" rx="40" ry="15" fill="#FFFFFF" stroke="#7A6A55" stroke-width="4"/>` +
        `<ellipse cx="${x}" cy="76" rx="26" ry="8" fill="none" stroke="#C9B9A0" stroke-width="2"/>`;
      return '<rect x="6" y="54" width="288" height="56" rx="12" fill="#8B5A2B" stroke="#4E2F12" stroke-width="5"/>' +
        '<rect x="18" y="62" width="264" height="40" rx="8" fill="#A87040"/>' +
        plate(66) + plate(150) + plate(234);
    },
  };

  function vesselSVG(id) {
    const f = VESSEL_SVG[id] || VESSEL_SVG.zaru;
    return `<svg viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">${f()}</svg>`;
  }

  /** 器の絵(images/vessel_<id>.png があれば画像) */
  function vessel(id) {
    const v = (Data.get().vessels.vessels || {})[id] || {};
    return artHTML(v.image || `images/vessel_${id}.png`, vesselSVG(id), 'vessel-art-inner');
  }

  /**
   * 画像があれば画像、なければダミーを出す HTML。
   * 画像が読めたら .has-img が付き、ダミーは隠れる。
   */
  function artHTML(src, dummy, cls) {
    const img = src && !missingImages.has(src)
      ? `<img src="${src}" alt="" draggable="false"` +
        ` onload="this.parentNode.classList.add('has-img')"` +
        ` onerror="missingImages.add(this.getAttribute('src'));this.remove()">`
      : '';
    return `<span class="art ${cls || ''}"><span class="art-dummy">${dummy}</span>${img}</span>`;
  }

  function pelican() {
    const S = Data.get().settings;
    const src = (S.images && S.images.pelican) || 'images/pelican.png';
    return artHTML(src, PELICAN_SVG, 'pelican-art');
  }

  function seagull() {
    const S = Data.get().settings;
    const src = (S.images && S.images.seagull) || 'images/seagull.png';
    return artHTML(src, SEAGULL_SVG, 'seagull-art');
  }

  return { artHTML, pelican, vessel, seagull };
})();
