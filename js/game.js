'use strict';

/**
 * ゲーム本体:食材を出して動かし、タップで網ですくってザルに入れる。
 * 点数は数えますが画面には出しません(料理と盛り付けを決めるためだけに使います)。
 */
const Game = (() => {
  // 網の絵(SVG)
  const NET_SVG =
    '<svg viewBox="0 0 150 150" aria-hidden="true">' +
      '<line x1="100" y1="100" x2="140" y2="146" stroke="#7A4E1C" stroke-width="12" stroke-linecap="round"/>' +
      '<circle cx="62" cy="62" r="50" fill="rgba(255,255,255,0.35)" stroke="#4A4A4A" stroke-width="8"/>' +
      '<g stroke="#4A4A4A" stroke-width="3" opacity="0.75">' +
        '<line x1="22" y1="40" x2="102" y2="40"/><line x1="14" y1="62" x2="110" y2="62"/>' +
        '<line x1="22" y1="84" x2="102" y2="84"/><line x1="40" y1="20" x2="40" y2="104"/>' +
        '<line x1="62" y1="12" x2="62" y2="112"/><line x1="84" y1="20" x2="84" y2="104"/>' +
      '</g>' +
    '</svg>';

  const PILE_DOM_MAX = 70;     // ザルに描く食材の最大数(多すぎると重くなるため)

  let S;                       // 設定(settings.json)
  let field, layer, fx, basket, pile, timerFill, catchMsg, startCount, finaleText;

  // 状態
  let playing = false;
  let rafId = null;
  let lastNow = 0;
  let gameTime = 0;
  let lastBeat = -1;
  let active = [];             // 画面にいる食材
  let deck = [];               // 次に出す食材の山札
  let comeback = [];           // にがした食材(しばらくしてまた出す)
  let caught = {};             // { id: 個数 }
  let pileCount = 0;
  let onFinish = null;
  let catchTimer = null;
  let useBeatSound = true;

  function init() {
    S = Data.get().settings;
    field      = document.getElementById('field');
    layer      = document.getElementById('ingredients-layer');
    fx         = document.getElementById('effects-layer');
    basket     = document.getElementById('basket');
    pile       = document.getElementById('pile');
    timerFill  = document.getElementById('timer-fill');
    catchMsg   = document.getElementById('catch-msg');
    startCount = document.getElementById('start-count');
    finaleText = document.getElementById('finale-text');
    field.addEventListener('pointerdown', onTap);
  }

  // ── 範囲と大きさ ────────────────────────────────────────
  function geometry() {
    const fr = field.getBoundingClientRect();
    const br = basket.getBoundingClientRect();
    const hud = document.getElementById('hud').getBoundingClientRect();
    const w = fr.width;
    const size = Math.round(Math.max(80, Math.min(100, w * 0.23)));
    return {
      fr, br, size,
      box: {
        w,
        top: hud.bottom - fr.top + 8,
        floor: br.top - fr.top + 40,   // ザルのふちのあたりまで
      },
    };
  }

  // ── 開始 ────────────────────────────────────────────────
  function start(finishCallback) {
    onFinish = finishCallback;
    playing = true;
    gameTime = 0;
    lastBeat = -1;
    active = [];
    deck = [];
    comeback = [];
    caught = {};
    pileCount = 0;
    layer.innerHTML = '';
    fx.innerHTML = '';
    pile.innerHTML = '';
    pile.classList.remove('gone');
    basket.classList.remove('shake');
    finaleText.hidden = true;
    finaleText.classList.remove('boom');
    catchMsg.classList.remove('show');
    timerFill.style.transform = 'scaleX(1)';

    useBeatSound = S.beatSound && (!Sound.hasBGM() || (S.bgm && S.bgm.beatSoundWithBgm));
    if (Sound.hasBGM()) Sound.startBGM(S.bgm && S.bgm.volume);

    showBig(startCount, 'はじめ!', 1300);

    lastNow = performance.now();
    rafId = requestAnimationFrame(loop);
  }

  function showBig(el, text, ms) {
    el.textContent = text;
    el.hidden = false;
    // アニメーションをやり直す
    el.style.animation = 'none';
    void el.offsetWidth;
    el.style.animation = '';
    if (ms) setTimeout(() => { el.hidden = true; }, ms);
  }

  // ── メインループ ────────────────────────────────────────
  function loop(now) {
    // 別のアプリに切り替えて戻ったときに時間が飛ばないよう、1回の進みは最大0.05秒
    const dt = Math.min((now - lastNow) / 1000, 0.05);
    lastNow = now;
    gameTime += dt;

    const remain = Math.max(0, 1 - gameTime / S.gameSeconds);
    timerFill.style.transform = `scaleX(${remain})`;

    const beatSec = 60 / S.bpm;
    const beat = Math.floor(gameTime / beatSec);
    if (beat > lastBeat) {
      lastBeat = beat;
      onBeat(beat);
    }

    updateIngredients(dt);

    if (gameTime >= S.gameSeconds) {
      finish();
      return;
    }
    rafId = requestAnimationFrame(loop);
  }

  function onBeat(beat) {
    if (useBeatSound) Sound.playBeat(beat % 4 === 0);
    basket.classList.remove('beat');
    void basket.offsetWidth;
    basket.classList.add('beat');

    const every = Math.max(1, S.spawnEveryBeats | 0);
    const spawnUntil = S.gameSeconds - S.stopSpawningBeforeEndSec;
    if (beat >= 2 && beat % every === 0 && gameTime < spawnUntil) {
      const p = gameTime / S.gameSeconds;
      const max = Math.round(S.maxOnScreenStart + (S.maxOnScreenEnd - S.maxOnScreenStart) * p);
      if (active.length < max) spawn();
    }
  }

  // ── 食材を出す ──────────────────────────────────────────
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function nextIngredient() {
    const onScreen = new Set(active.map(a => a.ing.id));
    // にがした食材が戻ってくる時間になっていれば、それを優先
    const i = comeback.findIndex(c => c.at <= gameTime && !onScreen.has(c.id));
    if (i >= 0) {
      const id = comeback.splice(i, 1)[0].id;
      return Data.get().byId[id];
    }
    const all = Data.get().ingredients;
    for (let tries = 0; tries < all.length * 2; tries++) {
      if (deck.length === 0) deck = shuffle(all.map(x => x.id));
      const id = deck.pop();
      if (!onScreen.has(id)) return Data.get().byId[id];
    }
    return null;
  }

  function spawn() {
    const ing = nextIngredient();
    if (!ing) return;
    const g = geometry();
    const motionDef = Data.get().motions[ing.motion] || {};
    const seconds = (motionDef.seconds || 8) / (S.speedScale || 1);

    const el = document.createElement('div');
    el.className = 'ing';
    el.style.setProperty('--ing-size', g.size + 'px');
    el.style.setProperty('--c', ing.color);
    el.innerHTML =
      `<div class="ing-body">${ingredientIconHTML(ing)}</div>` +
      `<div class="ing-label">${ing.name}</div>`;
    layer.appendChild(el);

    const motion = Motions.create(ing.motion, g.box, {
      seconds, size: g.size, beatSec: 60 / S.bpm,
    });
    const a = { ing, el, motion, size: g.size, x: -999, y: -999 };
    active.push(a);
    place(a, Motions.update(motion, 0));
  }

  function place(a, r) {
    a.x = r.x;
    a.y = r.y;
    const half = a.size / 2;
    a.el.style.transform =
      `translate3d(${r.x - half}px, ${r.y - half}px, 0) rotate(${r.rot || 0}deg) scale(1, ${r.sy || 1})`;
    a.el.style.opacity = r.alpha == null ? 1 : r.alpha;
  }

  function updateIngredients(dt) {
    active = active.filter(a => {
      const r = Motions.update(a.motion, dt);
      place(a, r);
      if (r.done) {
        // にがしても失敗にしない:しばらくしたら、また出てくる
        a.el.remove();
        comeback.push({ id: a.ing.id, at: gameTime + S.respawnDelaySec });
        return false;
      }
      return true;
    });
  }

  // ── タップ ──────────────────────────────────────────────
  function onTap(e) {
    e.preventDefault();
    Sound.unlock();
    if (!playing) return;
    const fr = field.getBoundingClientRect();
    const x = e.clientX - fr.left;
    const y = e.clientY - fr.top;
    ripple(x, y);

    // 見た目より大きい範囲で当たりにする(半径 + 45px)
    let best = null, bestD = Infinity;
    active.forEach(a => {
      const d = Math.hypot(a.x - x, a.y - y);
      const reach = a.size / 2 + 45;
      if (d < reach && d < bestD) { best = a; bestD = d; }
    });
    if (best) scoop(best);
    else Sound.playMiss();
  }

  function ripple(x, y) {
    const r = document.createElement('div');
    r.className = 'ripple';
    r.style.left = x + 'px';
    r.style.top = y + 'px';
    fx.appendChild(r);
    setTimeout(() => r.remove(), 500);
  }

  // ── 網ですくってザルへ ──────────────────────────────────
  function scoop(a) {
    active = active.filter(x => x !== a);
    a.el.classList.add('caught');
    const id = a.ing.id;
    caught[id] = (caught[id] || 0) + 1;
    const isNew = Zukan.add(id);
    Sound.playScoop();
    showCatch(a.ing, isNew);

    // 網がサッとすくう
    const net = document.createElement('div');
    net.className = 'net';
    net.innerHTML = NET_SVG;
    fx.appendChild(net);
    const at = (dx, dy, rot, sc) => `translate(${a.x + dx}px, ${a.y + dy}px) rotate(${rot}deg) scale(${sc})`;
    net.animate([
      { transform: at(70, 80, 60, 0.6), opacity: 0 },
      { transform: at(8, 8, -5, 1.05), opacity: 1, offset: 0.4 },
      { transform: at(0, -10, -30, 1), opacity: 1, offset: 0.7 },
      { transform: at(0, -30, -40, 0.9), opacity: 0 },
    ], { duration: 520, easing: 'ease-out' }).onfinish = () => net.remove();

    // 食材がザルへ飛んでいく
    const target = pileTarget();
    const half = a.size / 2;
    const from = `translate3d(${a.x - half}px, ${a.y - half}px, 0)`;
    const midX = (a.x + target.x) / 2;
    const midY = Math.min(a.y, target.y) - 90;
    const anim = a.el.animate([
      { transform: from + ' scale(1)', offset: 0 },
      { transform: `translate3d(${a.x - half}px, ${a.y - half - 30}px, 0) scale(1.1)`, offset: 0.25 },
      { transform: `translate3d(${midX - half}px, ${midY - half}px, 0) scale(0.8) rotate(180deg)`, offset: 0.6 },
      { transform: `translate3d(${target.x - half}px, ${target.y - half}px, 0) scale(0.45) rotate(360deg)`, offset: 1 },
    ], { duration: 780, easing: 'ease-in-out', fill: 'forwards' });
    anim.onfinish = () => {
      a.el.remove();
      addToPile(a.ing, target);
      Sound.playDrop();
    };
  }

  function showCatch(ing, isNew) {
    catchMsg.innerHTML = `${ing.emoji} ${ing.name}!` + (isNew ? '<span class="new">図鑑に追加</span>' : '');
    catchMsg.style.borderColor = ing.color;
    catchMsg.classList.add('show');
    clearTimeout(catchTimer);
    catchTimer = setTimeout(() => catchMsg.classList.remove('show'), 1400);
  }

  // ザルの中の山:下の段から順に積んでいく(7個,6個,5個…)
  function pileSlot(k) {
    const per = 28;
    const layerN = Math.floor(k / per);
    let n = k % per, row = 0, cap = 7;
    while (n >= cap) { n -= cap; row++; cap--; }
    const spacing = 32;
    const sx = (n - (cap - 1) / 2) * spacing + (Math.random() * 10 - 5) + (layerN % 2 ? 14 : 0);
    const sy = row * 22 + layerN * 8 + Math.random() * 4;
    return { sx, sy };
  }

  function pileTarget() {
    const fr = field.getBoundingClientRect();
    const br = basket.getBoundingClientRect();
    const slot = pileSlot(pileCount);
    pileCount++;
    return {
      slot,
      x: br.left - fr.left + br.width / 2 + slot.sx,
      y: br.bottom - fr.top - 70 - slot.sy - 22,
    };
  }

  function addToPile(ing, target) {
    if (pile.children.length >= PILE_DOM_MAX) return;
    const item = document.createElement('div');
    item.className = 'pile-item';
    item.style.left = `calc(50% + ${target.slot.sx}px)`;
    item.style.bottom = target.slot.sy + 'px';
    item.style.zIndex = String(pileCount);
    item.innerHTML = ingredientIconHTML(ing);
    pile.appendChild(item);
  }

  // ── 終了:煙がもくもく →「ボン!」→ チン! ─────────────────
  function finish() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    timerFill.style.transform = 'scaleX(0)';
    Sound.stopBGM();

    // 残っている食材は去っていく
    active.forEach(a => {
      a.el.animate([{ opacity: a.el.style.opacity || 1 }, { opacity: 0 }], { duration: 500, fill: 'forwards' })
        .onfinish = () => a.el.remove();
    });
    active = [];

    showBig(finaleText, 'そこまで!', 0);

    const later = (ms, fn) => setTimeout(fn, ms);
    later(1300, () => {
      finaleText.hidden = true;
      basket.classList.add('shake');
      Sound.playSmoke();
      smokePuffs();
    });
    later(3000, () => {
      basket.classList.remove('shake');
      pile.classList.add('gone');
      flash();
      finaleText.classList.add('boom');
      showBig(finaleText, 'ボン!', 0);
      Sound.playPop();
    });
    later(3800, () => Sound.playDing());
    later(4900, () => {
      finaleText.hidden = true;
      finaleText.classList.remove('boom');
      if (onFinish) onFinish({ caught: Object.assign({}, caught) });
    });
  }

  function pileCenter() {
    const fr = field.getBoundingClientRect();
    const br = basket.getBoundingClientRect();
    return { x: br.left - fr.left + br.width / 2, y: br.top - fr.top + 30 };
  }

  function smokePuffs() {
    const c = pileCenter();
    for (let i = 0; i < 12; i++) {
      setTimeout(() => {
        const p = document.createElement('div');
        p.className = 'smoke';
        p.style.left = c.x + (Math.random() * 140 - 70) + 'px';
        p.style.top = c.y + (Math.random() * 20) + 'px';
        p.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px');
        fx.appendChild(p);
        setTimeout(() => p.remove(), 1700);
      }, i * 130);
    }
  }

  function flash() {
    const c = pileCenter();
    const f = document.createElement('div');
    f.className = 'flash';
    f.style.left = c.x + 'px';
    f.style.top = c.y + 'px';
    fx.appendChild(f);
    setTimeout(() => f.remove(), 800);
  }

  /** ゲームを途中でやめる(画面を離れるとき用) */
  function stop() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    Sound.stopBGM();
  }

  return { init, start, stop };
})();
