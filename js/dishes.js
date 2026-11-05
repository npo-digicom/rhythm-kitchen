'use strict';

/**
 * 料理の決まり方と、空想レシピ作り。
 */
const Dishes = (() => {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // dishes.json の ingredients の1行を「どれかがあればOK」の id リストにする
  function reqIds(req) {
    if (typeof req === 'string') return [req];
    if (Array.isArray(req)) return req;
    return req.any || [];
  }

  /**
   * つかまえた食材 { id: 個数 } から、一番近い料理を選ぶ。
   * 近さ = 料理の材料がどれだけそろったか(7割)
   *      + つかまえた食材のうち料理に使うものの割合(3割)
   * 同じ点なら preferId(ペリカンの注文)の料理、
   * それも無ければ dishes.json で先に書いたものが選ばれる。
   */
  function choose(caught, preferId) {
    const { dishes } = Data.get();
    const total = Object.values(caught).reduce((a, b) => a + b, 0);
    const preferred = dishes.find(d => d.id === preferId);
    if (total === 0) return preferred || pick(dishes);

    let best = null, bestScore = -1, preferredScore = -1;
    dishes.forEach(dish => {
      const reqs = dish.ingredients || [];
      const used = new Set();
      let matched = 0;
      reqs.forEach(r => {
        const ids = reqIds(r);
        if (ids.some(id => caught[id])) matched++;
        ids.forEach(id => used.add(id));
      });
      const coverage = reqs.length ? matched / reqs.length : 0;
      let usedCount = 0;
      used.forEach(id => { usedCount += caught[id] || 0; });
      const score = coverage * 0.7 + (usedCount / total) * 0.3;
      if (score > bestScore + 1e-9) { bestScore = score; best = dish; }
      if (dish === preferred) preferredScore = score;
    });
    // 同じ点なら、注文の料理を選ぶ
    if (preferred && preferredScore >= bestScore - 1e-9) return preferred;
    return best;
  }

  /** ペリカンの注文:料理を1つ選ぶ(前回と同じにならないように) */
  let lastOrderId = null;
  function pickOrder() {
    const { dishes } = Data.get();
    const pool = dishes.length > 1 ? dishes.filter(d => d.id !== lastOrderId) : dishes;
    const d = pick(pool);
    lastOrderId = d.id;
    return d;
  }

  /** 料理に使う食材の id の一覧 */
  function dishIngredientIds(dish) {
    const ids = new Set();
    (dish.ingredients || []).forEach(r => reqIds(r).forEach(id => ids.add(id)));
    return ids;
  }

  /** つかまえた数で盛り付けを決める */
  function portion(count) {
    const { portions } = Data.get();
    let p = portions[0];
    portions.forEach(x => { if (count >= x.minCount) p = x; });
    return p;
  }

  /** つかまえた食材のうち、料理に使うもの */
  function usedIngredients(dish, caught) {
    const ids = new Set();
    (dish.ingredients || []).forEach(r => reqIds(r).forEach(id => { if (caught[id]) ids.add(id); }));
    return [...ids];
  }

  // ── 空想レシピ ──────────────────────────────────────────
  let lastTitle = '';

  function fill(text, vars) {
    return text.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  }

  /**
   * つかまえた食材の名前リストから、空想レシピを1つ作る。
   * dishId を渡すと、fantasy.json の dishExtras にあるその料理用の部品もまぜる。
   * 前回と同じ題名にならないように作り直す。
   */
  function fantasy(names, dishId) {
    const base = Data.get().fantasy;
    // 料理ごとの部品(dishExtras)があれば、ふだんの部品にまぜる
    const extra = (base.dishExtras && dishId && base.dishExtras[dishId]) || {};
    const f = Object.assign({}, base);
    ['titlePatterns', 'steps', 'comments'].forEach(k => {
      if (Array.isArray(extra[k]) && extra[k].length) {
        // 料理ごとの部品が出やすいように2回ずつ入れる
        f[k] = (base[k] || []).concat(extra[k], extra[k]);
      }
    });
    let pool = names.slice();
    if (pool.length === 0) pool = shuffle(Data.get().ingredients.map(i => i.name)).slice(0, 3);

    let result;
    for (let tries = 0; tries < 8; tries++) {
      const ing = shuffle(pool);
      const vars = {
        a: ing[0],
        b: ing[1] || ing[0],
        c: ing[2] || ing[1] || ing[0],
        country: pick(f.countries),
        form: pick(f.forms),
      };
      // 食材が1種類だけのときは、同じ名前が並ぶ題名を避ける
      const patterns = f.titlePatterns.filter(p => ing.length >= 3 || !p.includes('{c}'))
        .filter(p => ing.length >= 2 || !p.includes('{b}'));
      const title = fill(pick(patterns.length ? patterns : f.titlePatterns), vars);
      const n = () => String(2 + Math.floor(Math.random() * 6));
      const steps = shuffle(f.steps).slice(0, 4).map(s => fill(s, Object.assign({ n: n() }, vars)));
      steps.push(fill(pick(f.finishes), Object.assign({ n: n() }, vars)));
      const comment = fill(pick(f.comments), vars);
      result = { title, steps, comment };
      if (title !== lastTitle) break;
    }
    lastTitle = result.title;
    return result;
  }

  return { choose, pickOrder, dishIngredientIds, portion, usedIngredients, fantasy };
})();
