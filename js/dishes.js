'use strict';

/**
 * 料理の決まり方。
 */
const Dishes = (() => {
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];

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

  return { choose, pickOrder, dishIngredientIds, portion, usedIngredients };
})();
