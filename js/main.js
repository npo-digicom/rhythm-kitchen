'use strict';

/**
 * 画面の切り替えと、完成画面の表示。
 */
const App = (() => {
  const $ = id => document.getElementById(id);
  let current = 'start';
  let beforeZukan = 'start';
  let bgmTried = false;
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
    // 曲は最初の1回だけ読み込む(無ければ拍の音だけ)
    if (!bgmTried && S.bgm && S.bgm.file) {
      bgmTried = true;
      const btn = $('btn-start');
      btn.disabled = true;
      btn.textContent = 'じゅんび中…';
      await Sound.loadBGM(S.bgm.file);
      btn.disabled = false;
      btn.textContent = 'はじめる';
    }
    show('game');
    // 画面の大きさが決まってから始める
    requestAnimationFrame(() => Game.start(onGameFinish));
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
    const dish = Dishes.choose(caught);
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
    v.innerHTML = '<div class="vessel-dish"></div>';

    // 下の段から山のように積む
    const fontSize = portion.id === 'kobachi' ? 40 : portion.id === 'oozara' ? 46 : 44;
    const rows = [];
    let left = n, cap = portion.id === 'oozara' ? 5 : portion.id === 'hitosara' ? 4 : 3;
    while (left > 0) { const k = Math.min(cap, left); rows.push(k); left -= k; cap = Math.max(1, cap - 1); }
    let idx = 0;
    const baseBottom = portion.id === 'kobachi' ? 34 : 22;
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
    const fr = Dishes.fantasy(names);
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
