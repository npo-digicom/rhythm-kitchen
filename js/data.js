'use strict';

/**
 * data フォルダの JSON を読み込み、ほかの部品から使いやすい形にまとめます。
 * JSON を書き換えるだけで、食材・料理・空想レシピ・設定が変わります。
 */
const Data = (() => {
  const FILES = {
    settings:    'data/settings.json',
    ingredients: 'data/ingredients.json',
    dishes:      'data/dishes.json',
    fantasy:     'data/fantasy.json',
    vessels:     'data/vessels.json',
  };

  const store = {
    settings: null,
    motions: {},
    ingredients: [],
    byId: {},
    dishes: [],
    portions: [],
    fantasy: null,
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
      pelican: {}, images: {}, sounds: {},
    }, raw.settings);
    store.settings.appearance = Object.assign({ defaultMax: 2 }, store.settings.appearance);
    store.settings.entry = Object.assign({ rescueSec: 2 }, store.settings.entry);
    store.settings.entry.weights = Object.assign(
      { sutto: 45, kurutto: 25, fuchi: 10, bonbon: 12, makikomi: 8 }, store.settings.entry.weights);
    store.settings.phases = store.settings.phases.slice().sort((a, b) => a.startSec - b.startSec)
      .map(ph => Object.assign({ maxOnScreen: 3, spawnEveryBeats: 2, speed: 1, message: '' }, ph));
    store.settings.seagull = Object.assign({
      firstDelaySec: 4, intervalSec: [8, 12], approachSec: 1.8, escapeSec: 3, tapRadius: 90,
    }, store.settings.seagull);
    store.settings.pelican = Object.assign({
      ask: '今日は{dish}が食べたいな', match: '注文どおり!ありがとう!', other: 'これもおいしそう!',
      thanks: 'ありがとう!', rescue: 'とりかえしたよ!',
      orderFavor: 1.6,
    }, store.settings.pelican);

    store.motions = raw.ingredients.motions || {};
    store.ingredients = (raw.ingredients.ingredients || []).map(ing => Object.assign({
      emoji: '❓', color: '#777777', motion: 'fuwafuwa', description: '',
      image: 'images/ingredient_' + ing.id + '.png',
    }, ing));
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
    store.fantasy = raw.fantasy;
    store.vessels = Object.assign({
      start: 'zaru', arriveMessage: '{vessel}がやってきた!', changeMessage: 'やっぱり{vessel}にしよう!',
      vessels: {}, dishToVessel: {},
    }, raw.vessels);
    return store;
  }

  return { load, get: () => store };
})();

/** 見つからなかった画像(何度も読みに行かないように覚えておく) */
const missingImages = new Set();

/** 食材の絵:PNG があればそれを、なければ絵文字を表示する */
function ingredientIconHTML(ing) {
  const img = ing.image && !missingImages.has(ing.image)
    ? `<img src="${ing.image}" alt="" draggable="false" onerror="missingImages.add(this.getAttribute('src'));this.remove()">`
    : '';
  return `<span class="emoji" aria-hidden="true">${ing.emoji}</span>${img}`;
}

/** 文字を HTML に入れても安全な形にする */
function escapeHTML(t) {
  return String(t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
