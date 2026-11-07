'use strict';

/**
 * data フォルダの JSON を読み込み、ほかの部品から使いやすい形にまとめます。
 * JSON を書き換えるだけで、食材・料理・おはなし・設定が変わります。
 */
const Data = (() => {
  const FILES = {
    settings:    'data/settings.json',
    ingredients: 'data/ingredients.json',
    dishes:      'data/dishes.json',
    story:       'data/story.json',
    vessels:     'data/vessels.json',
  };

  const store = {
    settings: null,
    motions: {},
    ingredients: [],
    gameIngredients: [],
    byId: {},
    dishes: [],
    portions: [],
    story: null,
    vessels: null,
  };

  async function fetchJSON(url) {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(url + ' (' + res.status + ')');
    try {
      return await res.json();
    } catch (e) {
      throw new Error(url + ' の書き方に間違いがあります');
    }
  }

  async function load() {
    const keys = Object.keys(FILES);
    const results = await Promise.all(keys.map(k => fetchJSON(FILES[k])));
    const raw = {};
    keys.forEach((k, i) => { raw[k] = results[i]; });

    store.settings = Object.assign({
      gameSeconds: 90, bpm: 80, beatSound: true, bgm: {}, speedScale: 1,
      phases: [
        { id: 'early', startSec: 0, maxOnScreen: 2, spawnEveryBeats: 3, speed: 0.85 },
        { id: 'middle', startSec: 30, maxOnScreen: 4, spawnEveryBeats: 2, speed: 1.15 },
        { id: 'final', startSec: 60, maxOnScreen: 3, spawnEveryBeats: 2, speed: 1, vesselChange: true, seagulls: true },
      ],
      appearance: {}, entry: {}, seagull: {},
      respawnDelaySec: 4, stopSpawningBeforeEndSec: 4,
      zukanStorageKey: 'rhythmKitchen.zukan.v1',
      storyStorageKey: 'rhythmKitchen.petrosStory.v1',
      soundStorageKey: 'rhythmKitchen.sound.v1',
      pelican: {}, images: {}, sounds: {},
    }, raw.settings);
    store.settings.appearance = Object.assign({ defaultMax: 2 }, store.settings.appearance);
    store.settings.entry = Object.assign({ rescueSec: 2 }, store.settings.entry);
    store.settings.entry.weights = Object.assign(
      { sutto: 45, kurutto: 25, fuchi: 10, bonbon: 12, makikomi: 8 }, store.settings.entry.weights);
    store.settings.phases = store.settings.phases.slice().sort((a, b) => a.startSec - b.startSec)
      .map(ph => Object.assign({ maxOnScreen: 3, spawnEveryBeats: 2, speed: 1, message: '' }, ph));
    store.settings.entry.offOrderWeights = Object.assign(
      { sutto: 40, kurutto: 10, fuchi: 0, bonbon: 50, makikomi: 0 }, store.settings.entry.offOrderWeights);
    store.settings.bgm = Object.assign({ file: '', loopStart: 0, loopEnd: 0, fadeSec: 0.6, volume: 0.7, credit: '' },
      store.settings.bgm);
    store.settings.images = Object.assign({ petros: {}, amones: {} }, store.settings.images);
    store.settings.seagull = Object.assign({
      firstDelaySec: 4, intervalSec: [8, 12], approachSec: 1.8, escapeSec: 3, tapRadius: 90,
    }, store.settings.seagull);
    store.settings.pelican = Object.assign({
      ask: '今日は{dish}が食べたいな', match: '注文どおり!ありがとう!', other: 'これもおいしそう!',
      thanks: 'ありがとう!', rescue: 'とりかえしたよ!', cardComplete: 'そろいました!',
      orderFavor: 3,
    }, store.settings.pelican);

    store.motions = raw.ingredients.motions || {};
    store.ingredients = (raw.ingredients.ingredients || []).map(ing => {
      const x = Object.assign({ emoji: '❓', color: '#777777', motion: 'fuwafuwa', description: '', image: '', inGame: true }, ing);
      x.variants = Array.isArray(x.variants) ? x.variants.filter(v => v && v.image) : [];
      if (!x.image && x.variants.length) x.image = x.variants[0].image;
      // 画像のない食材はゲームに出さない(図鑑では「?」のまま)
      if (!x.image) x.inGame = false;
      return x;
    });
    store.gameIngredients = store.ingredients.filter(x => x.inGame);
    store.byId = {};
    store.ingredients.forEach(ing => {
      if (!store.motions[ing.motion]) {
        console.warn('動きの型が見つかりません:', ing.id, ing.motion, '→ fuwafuwa で動かします');
        ing.motion = 'fuwafuwa';
      }
      store.byId[ing.id] = ing;
    });

    store.dishes = raw.dishes.dishes || [];
    store.portions = (raw.dishes.portions || []).slice().sort((a, b) => a.minCount - b.minCount);
    store.story = normalizeStory(raw.story);
    store.vessels = Object.assign({
      start: 'zaru', arriveMessage: '{vessel}がやってきた!', changeMessage: 'やっぱり{vessel}にしよう!',
      vessels: {}, dishToVessel: {},
    }, raw.vessels);
    return store;
  }

  /** story.json を、書き間違いがあっても動くように整える */
  function normalizeStory(st) {
    st = st || {};
    const arr = v => (Array.isArray(v) ? v : []);
    const imgs = v => arr(v).filter(x => typeof x === 'string' && x);
    const ep = st.epilogue || {};
    return {
      labels: Object.assign({
        bookTitle: 'ペトロス君の物語',
        charactersHeading: '登場するみんな', chaptersHeading: '本編', chapterLabel: '第{n}話',
        lockedCharacter: 'タップすると、わかります', lockedChapter: 'まだ届いていません',
        lockedEpilogue: '第10話のあとに届きます',
        newChapter: '📮 新しいおはなしが届きました', newEpilogue: '📮 おしまいのページが届きました',
        tapToRead: 'タップして読む', allOpened: 'つづきは、またこんど',
        progress: '読めるおはなし:{n} / {total}', newBadge: 'NEW', close: 'とじる',
      }, st.labels),
      intro: st.intro || '',
      characters: arr(st.characters).filter(c => c && c.name)
        .map((c, i) => Object.assign({ id: 'c' + i, text: '', image: '' }, c)),
      chapters: arr(st.chapters).filter(c => c && c.text)
        .map(c => ({ title: c.title || '', text: c.text, images: imgs(c.images) })),
      epilogue: ep.text ? { title: ep.title || 'おしまいに', heading: ep.heading || '', text: ep.text, images: imgs(ep.images) } : null,
      disclaimer: st.disclaimer || '',
    };
  }

  return { load, get: () => store };
})();

/** 見つからなかった画像(何度も読みに行かないように覚えておく) */
const missingImages = new Set();

/** 食材の絵:画像があればそれを、読めなければ絵文字を表示する */
function ingredientIconHTML(ing, src) {
  src = src || ing.image;
  const emoji = `<span class="emoji" aria-hidden="true">${ing.emoji}</span>`;
  if (!src || missingImages.has(src)) return emoji;
  return `<img class="ing-img" src="${src}" alt="" draggable="false" data-emoji="${escapeHTML(ing.emoji)}" onerror="iconFallback(this)">`;
}

/** 画像が読めなかったとき、絵文字に置きかえる */
function iconFallback(img) {
  missingImages.add(img.getAttribute('src'));
  const s = document.createElement('span');
  s.className = 'emoji';
  s.setAttribute('aria-hidden', 'true');
  s.textContent = img.dataset.emoji || '';
  img.replaceWith(s);
}

/** 画像を先に読み込んでおく(ゲーム中に絵が遅れて出ないように) */
function preloadImages(list) {
  list.forEach(src => { if (src && !missingImages.has(src)) { const i = new Image(); i.src = src; } });
}

/** 文字を HTML に入れても安全な形にする */
function escapeHTML(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
