'use strict';

/**
 * ペトロスのおはなし。
 *   ・港のこばなし(完成画面で1つ)
 * 文章はすべて data/story.json にあります。
 * 記録はブラウザ(localStorage)に保存します。保存できない環境でも遊べます。
 */
const Story = (() => {
  let key = 'rhythmKitchen.story.v1';
  let rec = null;

  function blank() {
    return { stamps: 0, read: {}, guests: {}, lastKoba: -1 };
  }

  function init(storageKey) {
    if (storageKey) key = storageKey;
    rec = blank();
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && typeof saved === 'object') rec = Object.assign(blank(), saved);
    } catch (e) { /* 読めなければ空から */ }
  }

  function save() {
    try { localStorage.setItem(key, JSON.stringify(rec)); } catch (e) { /* 保存できなくても続ける */ }
  }

  const st = () => Data.get().story;

  /** 文の {n} {name} などを置きかえる */
  function fill(text, vars) {
    return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  }

  // ── 港のこばなし ────────────────────────────────────────
  /** 直前と同じにならないように、こばなしを1つ選ぶ */
  function nextKobanashi() {
    const list = st().kobanashi;
    if (list.length === 0) return '';
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && i === rec.lastKoba) {
      i = (i + 1 + Math.floor(Math.random() * (list.length - 1))) % list.length;
    }
    rec.lastKoba = i;
    save();
    return list[i];
  }

  return { init, fill, nextKobanashi };
})();
