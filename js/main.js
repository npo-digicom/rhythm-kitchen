'use strict';

/**
 * 画面の切り替えと、完成画面の表示。
 */
const App = (() => {
  const $ = id => document.getElementById(id);
  let current = 'start';
  let beforeZukan = 'start';
  let bgmTried = false;
  let effectsTried = false;
  let celebrateTimers = [];
  let lastResult = null;

  function show(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    $('screen-' + name).classList.add('active');
    current = name;
    const sc = $('screen-' + name).querySelector('.scroll');
    if (sc) sc.scrollTop = 0;
  }

  // 「押した」の判定は click を使う(スクロールしながら触っても誤って押されにくい)
  function onPress(id, fn) {
    $(id).addEventListener('click', e => { Sound.unlock(); fn(e); });
  }

  async function boot() {
    try {
      await Data.load();
    } catch (err) {
      const box = $('load-error');
      box.hidden = false;
      box.textContent =
        'データを読み込めませんでした。(' + err.message + ')' +
        ' index.html を直接開いている場合は、report_redesign.md の「試し方」を見てください。';
      $('btn-start').textContent = '読み込みエラー';
      return;
    }

    Zukan.init(Data.get().settings.zukanStorageKey);
    Game.init();

    $('btn-start').disabled = false;
    $('btn-start').textContent = 'はじめる';

    onPress('btn-start', startGame);
    onPress('btn-retry', startGame);
    onPress('btn-zukan-from-start', openZukan);
    onPress('btn-zukan-from-complete', openZukan);
    onPress('btn-zukan-back', () => { Zukan.closeDetail(); show(beforeZukan); });
    onPress('btn-zukan-close', () => Zukan.closeDetail());
    $('zukan-detail').addEventListener('click', e => {
      if (e.target.id === 'zukan-detail') Zukan.closeDetail();
    });
    onPress('btn-fantasy', () => renderFantasy(true));
  }

  async function startGame() {
    const S = Data.get().settings;
    // 曲と効果音ファイルは最初の1回だけ読み込む(無ければ拍の音・合成音)
    const needBgm = !bgmTried && S.bgm && S.bgm.file;
    const needFx = !effectsTried && Object.keys(S.sounds || {}).some(k => !k.startsWith('_') && S.sounds[k]);
    if (needBgm || needFx) {
      const btn = $('btn-start');
      btn.disabled = true;
      btn.textContent = 'じゅんび中…';
      await Promise.all([
        needBgm ? Sound.loadBGM(S.bgm.file) : null,
        needFx ? Sound.loadEffects(S.sounds) : null,
      ]);
      btn.disabled = false;
      btn.textContent = 'はじめる';
    }
    bgmTried = true;
    effectsTried = true;
    clearCelebration();
    show('game');
    // 画面の大きさが決まってから始める
    requestAnimationFrame(() => Game.start(Dishes.pickOrder(), onGameFinish));
  }

  function openZukan() {
    beforeZukan = current;
    Zukan.render();
    show('zukan');
  }

  // ── 完成画面 ────────────────────────────────────────────
  function onGameFinish(result) {
    const { byId, ingredients } = Data.get();
    const caught = result.caught;
    const total = Object.values(caught).reduce((a, b) => a + b, 0);
    const order = result.order || null;
    // ゲームの終わりに決まった料理があればそれを使う(器と料理をそろえるため)
    const dish = result.dish || Dishes.choose(caught, order && order.id);
    const portion = Dishes.portion(total);
    // つかまえた食材(図鑑の順に並べる)
    const caughtIngs = ingredients.filter(i => caught[i.id]);
    lastResult = { caught, caughtIngs, dish, portion };

    $('dish-name').textContent = dish.name;
    $('dish-subtitle').textContent = dish.subtitle || '';
    $('portion-badge').textContent = '盛り付け:' + portion.label;
    $('portion-message').textContent = portion.message || '';
    renderDishVisual(dish, portion, caught, byId);

    const list = $('caught-list');
    list.innerHTML = '';
    if (caughtIngs.length === 0) {
      list.innerHTML = '<li class="caught-empty" style="border:none">今日は、においだけで作りました。次はつかまえてみましょう!</li>';
    } else {
      caughtIngs.forEach(ing => {
        const li = document.createElement('li');
        li.style.setProperty('--c', ing.color);
        li.innerHTML = `<span class="ci-emoji" aria-hidden="true">${ing.emoji}</span>${ing.name}`;
        list.appendChild(li);
      });
    }

    const r = dish.easyRecipe || {};
    $('recipe-title').textContent = r.title || dish.name;
    $('recipe-servings').textContent = r.servings ? `(${r.servings})` : '';
    fillList($('recipe-materials'), r.materials || []);
    fillList($('recipe-steps'), r.steps || []);

    const f = Data.get().fantasy;
    $('fantasy-heading').textContent = f.heading || '🌈 空想レシピ';
    $('fantasy-notice').textContent = f.notice || 'これは空想の料理です。';
    renderFantasy(false);

    show('complete');
    celebrate(order, dish);
  }

  // ── 注文の結果:どちらもお祝い ──────────────────────────
  function celebrate(order, dish) {
    const P = Data.get().settings.pelican;
    const box = $('order-result');
    if (!order) { box.hidden = true; return; }
    box.hidden = false;
    const match = order.id === dish.id;
    box.classList.toggle('match', match);
    $('order-result-pelican').innerHTML = Art.pelican();
    $('order-result-text').textContent = match ? P.match : P.other;

    clearCelebration();
    const layer = $('celebrate-layer');
    const later = (ms, fn) => celebrateTimers.push(setTimeout(fn, ms));
    if (match) {
      // ファンファーレと紙吹雪
      later(250, () => Sound.play('fanfare'));
      const colors = ['#E53935', '#FDD835', '#43A047', '#1E88E5', '#8E24AA', '#FB8C00'];
      for (let i = 0; i < 60; i++) {
        const c = document.createElement('span');
        c.className = 'confetti';
        c.style.left = (Math.random() * 100) + '%';
        c.style.background = colors[i % colors.length];
        c.style.setProperty('--dx', (Math.random() * 80 - 40) + 'px');
        c.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
        c.style.animationDelay = (Math.random() * 1.2) + 's';
        c.style.animationDuration = (2.4 + Math.random() * 1.6) + 's';
        layer.appendChild(c);
      }
    } else {
      // 花束と風船が飛ぶ
      later(250, () => Sound.play('celebrate'));
      const items = ['🎈', '💐', '🎈', '🌸', '🎈', '💐', '🌷', '🎈', '🌼', '🎈', '💐', '🎈'];
      items.forEach((em, i) => {
        const b = document.createElement('span');
        b.className = 'balloon';
        b.textContent = em;
        b.style.left = (4 + (i / items.length) * 88 + Math.random() * 4) + '%';
        b.style.setProperty('--sway', (Math.random() * 40 - 20) + 'px');
        b.style.animationDelay = (Math.random() * 1.4) + 's';
        b.style.animationDuration = (3.4 + Math.random() * 1.4) + 's';
        layer.appendChild(b);
      });
    }
    later(6000, clearCelebration);
  }

  function clearCelebration() {
    celebrateTimers.forEach(clearTimeout);
    celebrateTimers = [];
    const layer = $('celebrate-layer');
    if (layer) layer.innerHTML = '';
  }

  function fillList(el, items) {
    el.innerHTML = '';
    items.forEach(t => {
      const li = document.createElement('li');
      li.textContent = t;
      el.appendChild(li);
    });
  }

  /**
   * 料理の絵。dishes.json の image(PNG)があればそれを、
   * なければ器と絵文字のダミーを、盛り付けに合わせた大きさで表示する。
   */
  function renderDishVisual(dish, portion, caught, byId) {
    const box = $('dish-visual');
    box.innerHTML = '';
    const sizes = { kobachi: 0.6, hitosara: 0.8, oozara: 1 };
    const scale = sizes[portion.id] || 0.8;

    const dummy = buildVessel(dish, portion, caught, byId);
    box.appendChild(dummy);

    const src = (dish.images && dish.images[portion.id]) || dish.image;
    if (src) {
      const img = new Image();
      img.className = 'dish-img';
      img.alt = dish.name;
      img.style.maxHeight = Math.round(230 * scale) + 'px';
      img.onload = () => { dummy.remove(); box.appendChild(img); };
      img.src = src;
    }
  }

  function buildVessel(dish, portion, caught, byId) {
    const counts = { kobachi: 4, hitosara: 7, oozara: 13 };
    const n = counts[portion.id] || 7;
    // 料理の絵文字に、つかまえて料理に使った食材の絵文字も混ぜる
    const used = Dishes.usedIngredients(dish, caught).map(id => byId[id].emoji);
    const pool = used.concat(dish.emoji || ['🍽️']);
    const v = document.createElement('div');
    v.className = 'vessel ' + (portion.id in counts ? portion.id : 'hitosara');
    v.setAttribute('role', 'img');
    v.setAttribute('aria-label', dish.name + '(' + portion.label + ')');
    // 器は料理ごと(data/vessels.json の dishToVessel)。盛り付けで大きさが変わる
    const V = Data.get().vessels;
    const vid = V.dishToVessel[dish.id] || V.start || 'zaru';
    const widths = { kobachi: 170, hitosara: 226, oozara: 280 };
    const w = widths[v.className.split(' ')[1]];
    const artH = Math.round(w * 0.42);
    const pb = (V.vessels[vid] || {}).pileBottom;
    v.innerHTML = `<div class="vessel-dish-art" style="width:${w}px;height:${artH}px">${Art.vessel(vid)}</div>`;

    // 下の段から山のように積む
    const fontSize = portion.id === 'kobachi' ? 40 : portion.id === 'oozara' ? 46 : 44;
    const rows = [];
    let left = n, cap = portion.id === 'oozara' ? 5 : portion.id === 'hitosara' ? 4 : 3;
    while (left > 0) { const k = Math.min(cap, left); rows.push(k); left -= k; cap = Math.max(1, cap - 1); }
    let idx = 0;
    const baseBottom = Math.round(artH * ((pb == null ? 70 : pb) / 92) * 0.8);
    rows.forEach((k, row) => {
      for (let i = 0; i < k; i++) {
        const s = document.createElement('span');
        s.className = 'vessel-food';
        s.textContent = pool[idx % pool.length];
        idx++;
        s.style.fontSize = fontSize + 'px';
        s.style.bottom = (baseBottom + row * fontSize * 0.62) + 'px';
        s.style.marginLeft = ((i - (k - 1) / 2) * fontSize * 0.82 - fontSize / 2) + 'px';
        s.style.transform = `rotate(${(Math.random() * 24 - 12).toFixed(0)}deg)`;
        v.appendChild(s);
      }
    });
    return v;
  }

  function renderFantasy(animate) {
    if (!lastResult) return;
    const names = lastResult.caughtIngs.map(i => i.name);
    const fr = Dishes.fantasy(names, lastResult.dish && lastResult.dish.id);
    $('fantasy-title').textContent = fr.title;
    fillList($('fantasy-steps'), fr.steps);
    $('fantasy-comment').textContent = fr.comment;
    if (animate) {
      const card = document.querySelector('.fantasy-card');
      card.classList.remove('refresh');
      void card.offsetWidth;
      card.classList.add('refresh');
    }
  }

  // showResult は動作確認用(つかまえた食材を渡すと完成画面を出せます)
  return { boot, show, showResult: onGameFinish };
})();

document.addEventListener('DOMContentLoaded', () => App.boot());
