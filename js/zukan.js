'use strict';

/**
 * 食材図鑑。一度つかまえた食材をブラウザ(localStorage)に記録します。
 * 保存できない環境(プライベートモードなど)でも、遊ぶことはできます。
 */
const Zukan = (() => {
  let key = 'rhythmKitchen.zukan.v1';
  let record = { found: {} };   // { found: { iwashi: { first: '2026-11-05', count: 3 } } }

  function init(storageKey) {
    if (storageKey) key = storageKey;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || 'null');
      if (saved && saved.found) record = saved;
    } catch (e) { /* 読めなければ空から */ }
  }

  function save() {
    try { localStorage.setItem(key, JSON.stringify(record)); } catch (e) { /* 保存できなくても続ける */ }
  }

  function has(id) { return !!record.found[id]; }

  /** つかまえた食材を記録。初めてなら true を返す */
  function add(id) {
    const first = !record.found[id];
    if (first) record.found[id] = { first: new Date().toISOString().slice(0, 10), count: 0 };
    record.found[id].count++;
    save();
    return first;
  }

  // ── 図鑑画面 ────────────────────────────────────────────
  let grid, progress, modal;

  function render() {
    const { ingredients, motions } = Data.get();
    grid = grid || document.getElementById('zukan-grid');
    progress = progress || document.getElementById('zukan-progress');
    const n = ingredients.filter(i => has(i.id)).length;
    progress.textContent = `見つけた食材:${n} / ${ingredients.length}`;
    grid.innerHTML = '';
    ingredients.forEach(ing => {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      if (has(ing.id)) {
        btn.className = 'zukan-cell';
        btn.style.setProperty('--c', ing.color);
        btn.innerHTML = `<span class="z-icon">${ingredientIconHTML(ing)}</span><span class="z-name">${ing.name}</span>`;
        btn.setAttribute('aria-label', ing.name + 'の説明を見る');
        btn.addEventListener('click', () => openDetail(ing, motions[ing.motion]));
      } else {
        btn.className = 'zukan-cell unknown';
        btn.innerHTML = '<span class="z-icon">?</span><span class="z-name">まだ</span>';
        btn.setAttribute('aria-label', 'まだ見つけていない食材');
        btn.addEventListener('click', () => openUnknown());
      }
      li.appendChild(btn);
      grid.appendChild(li);
    });
  }

  function openDetail(ing, motion) {
    modal = modal || document.getElementById('zukan-detail');
    modal.querySelector('.modal-card').style.setProperty('--c', ing.color);
    document.getElementById('zukan-detail-icon').innerHTML = ingredientIconHTML(ing);
    document.getElementById('zukan-detail-name').textContent = ing.name;
    const m = document.getElementById('zukan-detail-motion');
    m.textContent = motion ? `動き方:${motion.label}` : '';
    m.hidden = !motion;
    document.getElementById('zukan-detail-text').textContent = ing.description;
    modal.hidden = false;
    document.getElementById('btn-zukan-close').focus();
  }

  function openUnknown() {
    modal = modal || document.getElementById('zukan-detail');
    modal.querySelector('.modal-card').style.removeProperty('--c');
    document.getElementById('zukan-detail-icon').textContent = '?';
    document.getElementById('zukan-detail-name').textContent = 'まだ見つけていません';
    document.getElementById('zukan-detail-motion').hidden = true;
    document.getElementById('zukan-detail-text').textContent = 'ゲームでつかまえると、ここに説明が出ます。';
    modal.hidden = false;
  }

  function closeDetail() {
    if (modal) modal.hidden = true;
  }

  return { init, has, add, render, closeDetail };
})();
