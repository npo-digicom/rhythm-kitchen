'use strict';

/**
 * ペトロス君の物語。
 *   ・本編(全10話):ゲームを1回終えるごとに1話ずつ読めるようになる
 *   ・おしまいに(港の小話):第10話のあとに読める
 *   ・登場者:最初は「?」。タップすると説明と絵が出る
 *   ・読む画面(大きな文字)と、「ペトロス君の物語」の画面
 * 文章はすべて data/story.json にあります。
 * 記録はブラウザ(localStorage)に保存します。保存できない環境でも遊べます。
 */
const Story = (() => {
  let key = 'rhythmKitchen.petrosStory.v1';
  let rec = null;

  function blank() {
    return { opened: 0, last: -1, read: {}, revealed: {} };
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
   * 動作確認用。アドレスの最後に付けると記録を変えられます(report_final.md 参照)。
   *   ?story=all     本編10話とおしまいにを全部読めるようにし、登場者も全部見せる
   *   ?story=3       本編3話まで読めるようにする
   *   ?reset=story   物語の記録を消す(?reset=all は図鑑の記録も消す)
   */
  function applyTestParams() {
    const reset = testParam('reset');
    if (reset === 'story' || reset === 'all') rec = blank();
    const v = testParam('story');
    if (v === 'all') {
      rec.opened = total();
      rec.last = total() - 1;
      st().characters.forEach(c => { rec.revealed[c.id] = true; });
    } else if (v != null && /^\d+$/.test(v)) {
      rec.opened = Math.min(total(), parseInt(v, 10));
      rec.last = rec.opened - 1;
    }
    if (reset || v != null) save();
  }

  function testParam(name) {
    try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; }
  }

  function save() {
    try { localStorage.setItem(key, JSON.stringify(rec)); } catch (e) { /* 保存できなくても続ける */ }
  }

  const st = () => Data.get().story;
  const total = () => st().chapters.length;
  const opened = () => Math.min(total(), rec.opened);
  const epilogueOpen = () => !!st().epilogue && total() > 0 && opened() >= total();

  /** 文の {n} などを置きかえる */
  function fill(text, vars) {
    return String(text || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m));
  }

  // ── ゲームを1回終えたとき ───────────────────────────────
  /**
   * 1話開く。返り値 { items: 新しく読めるもの, finished: もう全部開いていた }
   */
  function onGameFinished() {
    if (opened() >= total()) return { items: [], finished: true };
    const i = opened();
    rec.opened = i + 1;
    rec.last = i;
    save();
    const items = [chapterItem(i)];
    if (epilogueOpen()) items.push(epilogueItem());
    return { items, finished: false };
  }

  // ── 読むもの ────────────────────────────────────────────
  function chapterItem(i) {
    const c = st().chapters[i];
    return {
      readKey: 'c' + i,
      kind: 'chapter',
      label: fill(st().labels.chapterLabel, { n: i + 1 }),
      title: c.title,
      text: c.text,
      images: c.images,
    };
  }

  function epilogueItem() {
    const e = st().epilogue;
    return {
      readKey: 'epilogue',
      kind: 'epilogue',
      label: e.title,
      title: e.heading,
      text: e.text,
      images: e.images,
      last: true,
    };
  }

  const isRead = k => !!rec.read[k];
  function markRead(k) {
    if (!k || rec.read[k]) return;
    rec.read[k] = true;
    save();
  }

  /** トップページの「おはなし」:初めての人には紹介文、遊んだことのある人には最後に開いた話 */
  function homeStory() {
    const i = Math.min(rec.last, total() - 1);
    if (i < 0 || opened() === 0) return { label: '', text: st().intro };
    return { label: fill(st().labels.chapterLabel, { n: i + 1 }), text: st().chapters[i].text };
  }

  // ── 「ペトロス君の物語」の画面 ──────────────────────────
  const $ = id => document.getElementById(id);

  function renderBook() {
    const L = st().labels;
    $('book-title').textContent = L.bookTitle;
    $('book-banner-art').innerHTML = Art.pelican('story');
    $('book-progress').textContent = fill(L.progress, { n: opened(), total: total() });
    $('book-characters-heading').textContent = L.charactersHeading;
    $('book-chapters-heading').textContent = L.chaptersHeading;

    // 登場者:最初は「?」。タップすると説明と絵が出る(一度見たら、そのまま)
    const chars = $('book-characters');
    chars.innerHTML = '';
    st().characters.forEach(c => {
      const li = document.createElement('li');
      if (rec.revealed[c.id]) {
        li.className = 'book-char';
        li.innerHTML = (c.image ? `<div class="book-char-art">${Art.artHTML(c.image, '', 'char-art')}</div>` : '') +
          `<div class="book-char-body"><p class="book-char-name">${escapeHTML(c.name)}</p>` +
          `<p class="book-char-text">${escapeHTML(c.text)}</p></div>`;
      } else {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'book-char locked';
        btn.innerHTML = '<span class="book-char-art unknown" aria-hidden="true">?</span>' +
          `<span class="book-char-body"><span class="book-char-name">?</span>` +
          `<span class="book-char-text">${escapeHTML(L.lockedCharacter)}</span></span>`;
        btn.setAttribute('aria-label', '登場者を見る');
        btn.addEventListener('click', () => {
          Sound.unlock();
          Sound.play('sparkle');
          rec.revealed[c.id] = true;
          save();
          renderBook();
          const el = chars.children[st().characters.indexOf(c)];
          if (el) el.classList.add('just-revealed');
        });
        li.appendChild(btn);
      }
      chars.appendChild(li);
    });

    // 本編(まだの話は「?」)と、おしまいに
    const list = $('book-chapters');
    list.innerHTML = '';
    const addRow = (no, label, item, lockedText) => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      if (item) {
        btn.className = 'book-chapter' + (item.kind === 'epilogue' ? ' is-epilogue' : '');
        btn.innerHTML = `<span class="bc-no">${escapeHTML(no)}</span>` +
          `<span class="bc-title">${escapeHTML(label)}</span>` +
          (isRead(item.readKey) ? '' : `<span class="bc-new">${escapeHTML(L.newBadge)}</span>`);
        btn.addEventListener('click', () => { Sound.unlock(); openReader(item, renderBook); });
      } else {
        btn.className = 'book-chapter locked';
        btn.disabled = true;
        btn.innerHTML = `<span class="bc-no">${escapeHTML(no)}</span><span class="bc-title">?</span>` +
          `<span class="bc-locked">${escapeHTML(lockedText)}</span>`;
      }
      li.appendChild(btn);
      list.appendChild(li);
    };
    st().chapters.forEach((c, i) => {
      const no = fill(L.chapterLabel, { n: i + 1 });
      const item = i < opened() ? chapterItem(i) : null;
      addRow(no, c.title || snippet(c.text), item, L.lockedChapter);
    });
    if (st().epilogue) {
      const e = st().epilogue;
      addRow(e.title, e.heading || e.title, epilogueOpen() ? epilogueItem() : null, L.lockedEpilogue);
    }
  }

  /** 話の書き出し(一覧に出す) */
  function snippet(t) {
    const s = String(t).replace(/\s+/g, '');
    const cut = s.search(/[。!?]/);
    const first = cut > 0 ? s.slice(0, cut) : s;
    return first.length > 13 ? first.slice(0, 12) + '…' : first + '…';
  }

  // ── 読む画面 ────────────────────────────────────────────
  let onReaderClose = null;

  /** おはなしを大きな文字で表示する */
  function openReader(item, closed) {
    const m = $('reader');
    const card = m.querySelector('.modal-card');
    card.classList.toggle('is-epilogue', item.kind === 'epilogue');
    $('reader-label').textContent = item.label || '';
    const art = $('reader-art');
    const imgs = (item.images || []).slice(0, 2);
    art.innerHTML = imgs.map(src => `<span class="reader-art-one">${Art.artHTML(src, '', 'char-art')}</span>`).join('');
    art.hidden = imgs.length === 0;
    const title = $('reader-title');
    title.textContent = item.title || '';
    title.hidden = !item.title;
    $('reader-text').textContent = item.text || '';
    // 物語の最後のページには、おことわりとクレジット
    const foot = $('reader-foot');
    if (item.last) {
      foot.hidden = false;
      $('reader-disclaimer').textContent = st().disclaimer;
      $('reader-credit').textContent = Data.get().settings.bgm.credit || '';
    } else {
      foot.hidden = true;
    }
    $('btn-reader-close').textContent = st().labels.close;
    m.hidden = false;
    card.scrollTop = 0;
    markRead(item.readKey);
    onReaderClose = closed || null;
    $('btn-reader-close').focus({ preventScroll: true });
  }

  function closeReader() {
    $('reader').hidden = true;
    const f = onReaderClose;
    onReaderClose = null;
    if (f) f();
  }

  return {
    init, fill, onGameFinished, homeStory, chapterItem, epilogueItem,
    opened, total, isRead, openReader, closeReader, renderBook,
  };
})();
