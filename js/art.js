'use strict';

/**
 * キャラクターや器の絵。
 * 画像があればそれを使い、なければここにある SVG のダミーを出します。
 *   ペトロス君 → data/settings.json の images.petros(order / home / celebrate / fly / happy / story)
 *   アモネス君 → data/settings.json の images.amones(dive / rise / fly / pose / quarrel)
 *   器         → data/vessels.json の image(ザルは画像なし)
 * 鳥の画像は、どれも「左向き」です。右へ進むときは CSS の .flip で左右反転します。
 */
const Art = (() => {
  // ── ペリカン(ダミー。右向きに描き、CSS で左向きにする) ─────────────────────────────────
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

  // ── カモメ(ダミー)。右向きに描き、CSS で左向きにする。食材の丸とまちがえないよう、丸や名札は付けない ──
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

  // ── ザルの絵(画像なし)。300×120 の枠に、上のふちが y=14 前後になるように描く ──
  let uid = 0;   // 模様の id が重ならないように
  const VESSEL_SVG = {
    zaru() {
      const id = 'weave' + (++uid);
      return `<defs><pattern id="${id}" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
          '<rect width="14" height="14" fill="#D9A55B"/><rect width="7" height="14" fill="#C28A3E"/></pattern></defs>' +
        `<path d="M6 14 Q150 30 294 14 L262 104 Q150 124 38 104 Z" fill="url(#${id})" stroke="#7A4E1C" stroke-width="5"/>` +
        '<ellipse cx="150" cy="14" rx="146" ry="11" fill="#E8BE7A" stroke="#7A4E1C" stroke-width="5"/>';
    },
  };

  function vesselSVG(id) {
    const f = VESSEL_SVG[id] || VESSEL_SVG.zaru;
    return `<svg viewBox="0 0 300 120" preserveAspectRatio="none" aria-hidden="true">${f()}</svg>`;
  }

  /** 器の絵(vessels.json に image があれば画像。squash があれば上下につぶして、ななめから見た形に) */
  function vessel(id) {
    const v = (Data.get().vessels.vessels || {})[id] || {};
    const sq = Number(v.squash) > 0 && Number(v.squash) < 1 ? Number(v.squash) : 0;
    const html = artHTML(v.image || '', vesselSVG(id), 'vessel-art-inner' + (v.image ? ' is-image' : ''));
    return sq ? html.replace('<img ', `<img style="transform:scaleY(${sq});transform-origin:50% 100%" `) : html;
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

  /** ペトロス君の絵。kind = order / home / celebrate / fly / happy / story */
  function pelican(kind) {
    const P = Data.get().settings.images.petros || {};
    return artHTML(P[kind] || P.home || '', PELICAN_SVG, 'pelican-art');
  }

  /** アモネス君の絵。kind = dive / rise / fly / pose / quarrel */
  function seagull(kind) {
    const A = Data.get().settings.images.amones || {};
    return artHTML(A[kind] || A.dive || '', SEAGULL_SVG, 'seagull-art');
  }

  /** 画像の場所の一覧(先に読み込んでおくため) */
  function allBirdImages() {
    const I = Data.get().settings.images;
    return Object.values(I.petros || {}).concat(Object.values(I.amones || {})).filter(x => typeof x === 'string');
  }

  return { artHTML, pelican, vessel, seagull, allBirdImages };
})();
