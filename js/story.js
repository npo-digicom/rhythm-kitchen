'use strict';

/**
 * ペトロスのおはなし。
 *   ・港のこばなし(完成画面で1つ)
 *   ・スタンプ(料理1回で1つ)と、本編のおはなし(スタンプ3つごとに1話)
 *   ・おはなしを読む画面(大きな文字)
 *   ・特別なお客さま(ゲーム中にまれに現れる)
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

  // ── 特別なお客さま ──────────────────────────────────────
  const hasMet = id => !!rec.guests[id];
  const guests = () => st().guests;

  /** 会ったことを記録する。初めてなら true */
  function meetGuest(id) {
    const first = !rec.guests[id];
    if (first) rec.guests[id] = { first: new Date().toISOString().slice(0, 10), count: 0 };
    rec.guests[id].count++;
    save();
    return first;
  }

  /**
   * お客さまを1人選ぶ。出やすさ = story.json の weight
   * × まだ会っていなければ settings の unmetFavor 倍。
   */
  function pickGuest(exclude) {
    const favor = Math.max(1, Number(Data.get().settings.story.unmetFavor) || 1);
    const pool = guests().filter(g => !(exclude || []).includes(g.id))
      .map(g => ({ g, w: Math.max(0, Number(g.weight) || 0) * (hasMet(g.id) ? 1 : favor) }))
      .filter(x => x.w > 0);
    const total = pool.reduce((a, x) => a + x.w, 0);
    if (total <= 0) return null;
    let r = Math.random() * total;
    for (const x of pool) { r -= x.w; if (r < 0) return x.g; }
    return pool[pool.length - 1].g;
  }

  /**
   * このゲームで来るお客さまと、来る時間を決める。
   * 動作確認用:アドレスの最後に ?guest=1(毎回来る)や ?guest=gold(その人が毎回来る)。
   */
  function planGuests() {
    const C = Data.get().settings.story;
    const force = testParam('guest');
    const max = Math.max(0, C.maxGuestsPerGame | 0);
    const [a, b] = Array.isArray(C.guestAppearSec) ? C.guestAppearSec : [15, 65];
    const plans = [];
    for (let k = 0; k < (force ? Math.max(1, max) : max); k++) {
      if (!force && !(Math.random() < Number(C.guestChance))) continue;
      const forced = force && guests().find(g => g.id === force);
      const g = forced || pickGuest(plans.map(p => p.guest.id));
      if (!g) break;
      const at = force && k === 0 ? 4 : a + Math.random() * Math.max(0, b - a);
      plans.push({ guest: g, at });
    }
    return plans.sort((x, y) => x.at - y.at);
  }

  /** お客さまの絵。images/guest_<id>.png があれば画像、なければ絵文字(金色のペトロスは金色のペリカン) */
  function guestArt(g) {
    const dummy = g.golden
      ? Art.pelicanTinted('#FFD54F', '#FFB300')
      : `<span class="guest-emoji">${escapeHTML(g.emoji)}</span>`;
    return Art.artHTML(g.image, dummy, 'guest-art' + (g.golden ? ' golden' : ''));
  }

  function guestItem(g) {
    return {
      readKey: 'g:' + g.id,
      label: st().labels.guestLabel,
      title: g.name,
      text: g.text,
      art: guestArt(g),
      color: g.color,
      guest: true,
    };
  }

  // ── 動作確認用(アドレスの ?stamps=12 など) ──────────────
  function testParam(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
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
    guests, hasMet, meetGuest, pickGuest, planGuests, guestArt, guestItem,
  };
})();
