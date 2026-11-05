'use strict';

/**
 * ペトロスのおはなし。
 *   ・港のこばなし(完成画面で1つ)
 *   ・スタンプ(料理1回で1つ)と、本編のおはなし(スタンプ3つごとに1話)
 *   ・おはなしを読む画面(大きな文字)
 *   ・特別なお客さま(ゲーム中にまれに現れる)
 *   ・スタンプ帳の画面
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
    applyTestParams();
  }

  /**
   * 動作確認用。アドレスの最後に付けると記録を変えられます(report_story.md 参照)。
   *   ?stamps=12      スタンプの数を12にする(本編4話まで開く)
   *   ?guests=all     特別なお客さま6人に会ったことにする
   *   ?reset=story    おはなしの記録を消す
   */
  function applyTestParams() {
    const reset = testParam('reset');
    if (reset === 'story' || reset === 'all') rec = blank();
    const n = parseInt(testParam('stamps'), 10);
    if (n >= 0) rec.stamps = n;
    if (testParam('guests') === 'all') {
      Data.get().story.guests.forEach(g => { if (!rec.guests[g.id]) rec.guests[g.id] = { first: 'test', count: 1 }; });
    }
    if (reset || n >= 0 || testParam('guests')) save();
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

  // ── スタンプ帳 ──────────────────────────────────────────
  const $ = id => document.getElementById(id);

  function characterArt(c) {
    const kinds = {
      pelicanPink: () => Art.pelicanTinted('#FFC6D5', '#F59AB4'),
      pelican: () => Art.pelicanSVG(),
      seagull: () => Art.seagullSVG(),
    };
    const dummy = kinds[c.art] ? kinds[c.art]() : `<span class="guest-emoji">${escapeHTML(c.emoji || '🐦')}</span>`;
    return Art.artHTML(c.image || `images/character_${c.id}.png`, dummy, 'guest-art');
  }

  function renderBook() {
    const L = st().labels;
    const open = chaptersOpen();
    $('book-title').textContent = L.stampBook;
    $('book-characters-heading').textContent = L.charactersHeading;
    $('book-stamps-heading').textContent = L.stampsHeading;
    $('book-chapters-heading').textContent = L.chaptersHeading;
    $('book-guests-heading').textContent = L.guestsHeading;
    $('book-disclaimer').textContent = st().disclaimer;

    // 登場する鳥たち(openAfterChapter があれば、その話が開くまで「?」)
    const chars = $('book-characters');
    chars.innerHTML = '';
    st().characters.forEach(c => {
      const li = document.createElement('li');
      const locked = c.openAfterChapter && open < c.openAfterChapter;
      li.className = 'book-char' + (locked ? ' locked' : '');
      li.innerHTML = locked
        ? `<div class="book-char-art unknown">?</div><div class="book-char-body">` +
          `<p class="book-char-name">?</p><p class="book-char-text">${escapeHTML(L.lockedCharacter)}</p></div>`
        : `<div class="book-char-art">${characterArt(c)}</div><div class="book-char-body">` +
          `<p class="book-char-name">${escapeHTML(c.name)}<span class="book-char-kind">${escapeHTML(c.kind || '')}</span></p>` +
          `<p class="book-char-text">${escapeHTML(c.text || '')}</p></div>`;
      chars.appendChild(li);
    });

    // たまったスタンプ:本編が全部開くまでのマス(3つごとに話の番号)
    const per = perChapter();
    const slots = Math.max(per, st().chapters.length * per);
    $('book-stamps-count').textContent = fill(L.stampsTotal, { n: rec.stamps });
    const grid = $('book-stamps');
    grid.innerHTML = '';
    for (let i = 0; i < slots; i++) {
      const li = document.createElement('li');
      const on = i < rec.stamps;
      li.className = 'stamp' + (on ? ' on' : '');
      li.textContent = on ? stampEmoji(i) : '';
      if ((i + 1) % per === 0) {
        const b = document.createElement('span');
        b.className = 'stamp-goal';
        b.textContent = '📖' + ((i + 1) / per);
        li.appendChild(b);
      }
      grid.appendChild(li);
    }
    const left = stampsUntilNext();
    $('book-stamps-next').textContent = left ? fill(L.stampsUntilNext, { n: left }) : L.allChaptersOpen;

    // 本編(まだの話は「?」)
    const list = $('book-chapters');
    list.innerHTML = '';
    st().chapters.forEach((c, i) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      const no = fill(L.chapterLabel, { n: i + 1 });
      if (i < open) {
        const item = chapterItem(i);
        btn.className = 'book-chapter';
        btn.innerHTML = `<span class="bc-no">${escapeHTML(no)}</span><span class="bc-title">${escapeHTML(c.title)}</span>` +
          (isRead(item.readKey) ? '' : `<span class="bc-new">${escapeHTML(L.newBadge)}</span>`);
        btn.addEventListener('click', () => { Sound.unlock(); openReader(item, renderBook); });
      } else {
        btn.className = 'book-chapter locked';
        btn.disabled = true;
        btn.innerHTML = `<span class="bc-no">${escapeHTML(no)}</span><span class="bc-title">?</span>` +
          `<span class="bc-locked">${escapeHTML(L.lockedChapter)}</span>`;
      }
      li.appendChild(btn);
      list.appendChild(li);
    });

    // 特別なお客さま(まだ会っていない人は「?」)
    const gl = $('book-guests');
    gl.innerHTML = '';
    const met = guests().filter(g => hasMet(g.id)).length;
    $('book-guests-count').textContent = fill(L.specialStamps, { n: met }) + ` / ${guests().length}`;
    guests().forEach(g => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      if (hasMet(g.id)) {
        const item = guestItem(g);
        btn.className = 'zukan-cell book-guest';
        btn.style.setProperty('--c', g.color);
        btn.innerHTML = `<span class="z-icon">${guestArt(g)}</span><span class="z-name">${escapeHTML(g.name)}</span>`;
        btn.addEventListener('click', () => { Sound.unlock(); openReader(item); });
      } else {
        btn.className = 'zukan-cell unknown';
        btn.disabled = true;
        btn.innerHTML = `<span class="z-icon">?</span><span class="z-name">${escapeHTML(L.unknownGuest)}</span>`;
      }
      li.appendChild(btn);
      gl.appendChild(li);
    });
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
    renderBook,
  };
})();
