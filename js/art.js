'use strict';

/**
 * キャラクターや器の絵。
 * PNG 画像があればそれを使い、なければここにある SVG のダミーを出します。
 *   ペリカン  → images/pelican.png
 *   (器・カモメは、あとの区切りで追加)
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

  return { artHTML, pelican };
})();
