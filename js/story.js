'use strict';

/**
 * ペトロスのおはなし。
 *   ・港のこばなし(完成画面で1つ)
 *   ・スタンプ(料理1回で1つ)と、本編のおはなし(スタンプ3つごとに1話)
 *   ・おはなしを読む画面(大きな文字)
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

  // ── スタンプと本編 ──────────────────────────────────────
  const perChapter = () => Math.max(1, Data.get().settings.story.stampsPerChapter | 0);
  const stamps = () => rec.stamps;

  /** いま読める本編の話数 */
  function chaptersOpen() {
    return Math.min(st().chapters.length, Math.floor(rec.stamps / perChapter()));
  }

  /** スタンプを1つ足す。新しく開いた話の番号(0から)の一覧を返す */
  function addStamp() {
    const before = chaptersOpen();
    rec.stamps++;
    save();
    const after = chaptersOpen();
    const opened = [];
    for (let i = before; i < after; i++) opened.push(i);
    return opened;
  }

  /** 次の話まで、あといくつ(全部開いていれば 0) */
  function stampsUntilNext() {
    if (chaptersOpen() >= st().chapters.length) return 0;
    return perChapter() - (rec.stamps % perChapter());
  }

  /** スタンプの絵(順番に変わる) */
  const STAMP_EMOJI = ['🐟', '🍅', '🫒', '🍋', '🥖', '🐙', '🧀', '🍆'];
  const stampEmoji = i => STAMP_EMOJI[((i % STAMP_EMOJI.length) + STAMP_EMOJI.length) % STAMP_EMOJI.length];

  const isRead = k => !!rec.read[k];
  function markRead(k) {
    if (!k || rec.read[k]) return;
    rec.read[k] = true;
    save();
  }

  function chapterItem(i) {
    const c = st().chapters[i];
    return {
      readKey: 'c' + i,
      label: fill(st().labels.chapterLabel, { n: i + 1 }),
      title: c.title,
      text: c.text,
    };
  }

  // ── 読む画面 ────────────────────────────────────────────
  let onReaderClose = null;

  /** おはなしを大きな文字で表示する。item = { label, title, text, art, color, readKey } */
  function openReader(item, closed) {
    const m = document.getElementById('reader');
    const card = m.querySelector('.modal-card');
    if (item.color) card.style.setProperty('--c', item.color); else card.style.removeProperty('--c');
    document.getElementById('reader-label').textContent = item.label || '';
    const art = document.getElementById('reader-art');
    art.innerHTML = item.art || '';
    art.hidden = !item.art;
    document.getElementById('reader-title').textContent = item.title || '';
    document.getElementById('reader-text').textContent = item.text || '';
    document.getElementById('btn-reader-close').textContent = st().labels.close;
    m.hidden = false;
    card.scrollTop = 0;
    markRead(item.readKey);
    onReaderClose = closed || null;
    document.getElementById('btn-reader-close').focus();
  }

  function closeReader() {
    document.getElementById('reader').hidden = true;
    const f = onReaderClose;
    onReaderClose = null;
    if (f) f();
  }

  return {
    init, fill, nextKobanashi,
    stamps, stampEmoji, perChapter, chaptersOpen, addStamp, stampsUntilNext, isRead, chapterItem,
    openReader, closeReader,
  };
})();
