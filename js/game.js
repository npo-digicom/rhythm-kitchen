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
  // 器への入り方:すっと/くるっと/ふちに当たって落ちる/ボンボン跳ねて外へ/巻き込んで外へ
  const ENTRY_MODES = ['sutto', 'kurutto', 'fuchi', 'bonbon', 'makikomi'];

  let S;                       // 設定(settings.json)
  let field, layer, fx, basket, pile, timerFill, catchMsg, startCount, finaleText, msgText;

  // 状態
  let playing = false;
  let rafId = null;
  let lastNow = 0;
  let gameTime = 0;
  let lastBeat = -1;
  let active = [];             // 画面にいる食材
  let appeared = {};           // { id: 出てきた回数 }(上限 maxAppear まで)
  let lastSpawnId = null;
  let lastSpawnAt = -99;
  let comeback = [];           // にがした食材(しばらくしてまた出す。回数の上限の中だけ)
  let phaseIndex = -1;         // いまの区間(settings.json の phases)
  let vesselId = 'zaru';       // いまの器
  let vesselDish = null;       // 器を決めたときの料理
  let pileBottom = 70;         // 器の底から食材を積み始める高さ
  let caught = {};             // { id: 個数 }(器の中+飛んでいる途中+こぼれて戻せる途中)
  let basketItems = [];        // 器の中の食材 { ing, slotIndex, el }
  let freeSlots = [];          // 空いた置き場所
  let nextSlot = 0;
  let loose = [];              // 器からこぼれて、タップで戻せる食材
  let gull = null;             // いま来ているカモメ
  let nextGullAt = null;       // 次にカモメが来る時間
  let gullCount = 0;
  let onFinish = null;
  let catchTimer = null;
  let useBeatSound = true;
  let order = null;            // ペリカンの注文(料理)
  let orderIds = new Set();    // 注文の料理に使う食材
  let popTimer = null;
  let guestPlans = [];         // このゲームで来る特別なお客さま { guest, at }
  let guestNow = null;         // いま画面にいるお客さま
  let guestsMet = [];          // このゲームでタップして会えたお客さま

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
    msgText    = document.getElementById('msg-text');
    field.addEventListener('pointerdown', onTap);
    document.getElementById('btn-order-ok').addEventListener('click', () => {
      Sound.unlock();
      document.getElementById('order-overlay').hidden = true;
      begin();
    });
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
  /**
   * 始める前に、ペリカンが注文を言う。「まかせて!」でゲーム開始。
   */
  function start(orderDish, finishCallback) {
    onFinish = finishCallback;
    order = orderDish;
    orderIds = Dishes.dishIngredientIds(order);
    resetField();

    document.getElementById('order-chip').hidden = true;
    document.getElementById('order-pelican').innerHTML = Art.pelican();
    document.getElementById('order-text').innerHTML =
      escapeHTML(Data.get().settings.pelican.ask).replace('{dish}', `<b>${escapeHTML(order.name)}</b>`);
    document.getElementById('order-emoji').textContent = (order.emoji || []).join(' ');
    document.getElementById('order-overlay').hidden = false;
    Sound.play('pelican');
  }

  function resetField() {
    setVessel(Data.get().vessels.start || 'zaru');
    vesselDish = null;
    layer.innerHTML = '';
    fx.innerHTML = '';
    pile.innerHTML = '';
    document.getElementById('pelican-pop').hidden = true;
    timerFill.style.transform = 'scaleX(1)';
  }

  function begin() {
    document.getElementById('order-chip-pelican').innerHTML = Art.pelican();
    document.getElementById('order-chip-name').textContent = order.name;
    document.getElementById('order-chip').hidden = false;
    drawTimerMarks();
    playing = true;
    gameTime = 0;
    lastBeat = -1;
    active = [];
    appeared = {};
    lastSpawnId = null;
    lastSpawnAt = -99;
    comeback = [];
    phaseIndex = -1;
    caught = {};
    basketItems = [];
    freeSlots = [];
    nextSlot = 0;
    loose = [];
    gull = null;
    nextGullAt = null;
    gullCount = 0;
    guestPlans = Story.planGuests();
    guestNow = null;
    guestsMet = [];
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

    updatePhase();

    const beatSec = 60 / S.bpm;
    const beat = Math.floor(gameTime / beatSec);
    if (beat > lastBeat) {
      lastBeat = beat;
      onBeat(beat);
    }

    updateIngredients(dt);
    updateLoose(dt);
    updateSeagull(dt);
    updateGuest(dt);

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

    const ph = phase();
    const every = Math.max(1, ph.spawnEveryBeats | 0);
    const spawnUntil = S.gameSeconds - S.stopSpawningBeforeEndSec;
    if (beat >= 2 && beat % every === 0 && gameTime < spawnUntil) {
      if (active.length < ph.maxOnScreen && paceAllows(spawnUntil)) spawn();
    }
  }

  /**
   * 食材の残り回数が終わりまで持つように、出すペースをならす。
   * 画面に1つも無いときは、すぐ出す(何も無い時間を作らない)。
   */
  function paceAllows(spawnUntil) {
    if (active.length === 0) return true;
    if (S.appearance.pacing === false) return true;
    const stock = Data.get().ingredients.reduce((n, x) => n + Math.max(0, maxAppear(x.id) - (appeared[x.id] || 0)), 0);
    if (stock <= 0) return false;
    const interval = Math.max(0, spawnUntil - gameTime) / stock;
    return gameTime - lastSpawnAt >= interval * 0.9;
  }

  // ── 区間(前半・中盤・終盤) ─────────────────────────────
  function phase() { return S.phases[Math.max(0, phaseIndex)]; }

  function updatePhase() {
    let i = 0;
    S.phases.forEach((ph, k) => { if (gameTime >= ph.startSec) i = k; });
    if (i === phaseIndex) return;
    phaseIndex = i;
    onPhaseStart(S.phases[i]);
  }

  function onPhaseStart(ph) {
    if (ph.message) showBig(msgText, ph.message, 1800);
    // 終盤の始め:それまでの食材にいちばん近い料理の器がやってくる
    if (ph.seagulls && nextGullAt == null) nextGullAt = gameTime + S.seagull.firstDelaySec;
    if (ph.vesselChange) {
      vesselDish = Dishes.choose(caught, order && order.id);
      changeVessel(vesselFor(vesselDish), Data.get().vessels.arriveMessage);
    }
  }

  // ── 器 ──────────────────────────────────────────────────
  function vesselFor(dish) {
    const V = Data.get().vessels;
    return (dish && V.dishToVessel[dish.id]) || V.start || 'zaru';
  }
  function vesselInfo(id) { return Data.get().vessels.vessels[id] || {}; }

  function setVessel(id) {
    vesselId = id;
    document.getElementById('vessel-art').innerHTML = Art.vessel(id);
    const pb = vesselInfo(id).pileBottom;
    pileBottom = pb == null ? 70 : pb;
    pile.style.bottom = pileBottom + 'px';
  }

  /**
   * 器を入れ替える:食材がふわっと持ち上がり、古い器が去って新しい器が来て、
   * 食材がそこへ移る。done は入れ替え終わりに呼ばれる。
   */
  function changeVessel(id, message, done) {
    if (id === vesselId) { if (done) done(); return; }
    const art = document.getElementById('vessel-art');
    const label = vesselInfo(id).label || '器';
    if (message) showBig(msgText, message.replace('{vessel}', label), 2000);
    Sound.play('vessel');
    const oldBottom = pileBottom;
    // 食材は持ち上がる
    pile.animate([
      { transform: 'translateY(0)' },
      { transform: 'translateY(-70px)', offset: 0.35 },
      { transform: 'translateY(-70px)', offset: 0.65 },
      { transform: 'translateY(0)' },
    ], { duration: 1400, easing: 'ease-in-out' });
    // 古い器は左へ、新しい器は右から
    art.animate([
      { transform: 'translateX(0)', opacity: 1 },
      { transform: 'translateX(-130%) rotate(-8deg)', opacity: 0 },
    ], { duration: 520, easing: 'ease-in' }).onfinish = () => {
      setVessel(id);
      // 積む高さが変わったぶん、持ち上がった位置からそのまま下りるように
      pile.animate([{ marginBottom: (oldBottom - pileBottom) + 'px' }, { marginBottom: '0px' }],
        { duration: 600, easing: 'ease-out' });
      art.animate([
        { transform: 'translateX(130%) rotate(8deg)', opacity: 0 },
        { transform: 'translateX(-4%) rotate(-2deg)', opacity: 1, offset: 0.75 },
        { transform: 'translateX(0)', opacity: 1 },
      ], { duration: 620, easing: 'ease-out' }).onfinish = () => {
        Sound.playDrop();
        if (done) done();
      };
    };
  }

  // 区切りの位置に、時間のバーへ目印をつける
  function drawTimerMarks() {
    const marks = document.getElementById('timer-marks');
    marks.innerHTML = '';
    S.phases.forEach(ph => {
      if (ph.startSec <= 0 || ph.startSec >= S.gameSeconds) return;
      const m = document.createElement('span');
      m.className = 'timer-mark';
      // バーは右から減っていくので、のこり時間の位置に目印
      m.style.left = (100 - (ph.startSec / S.gameSeconds) * 100) + '%';
      marks.appendChild(m);
    });
  }

  // ── 食材を出す ──────────────────────────────────────────
  // ── 出てくる回数の上限 ─────────────────────────────────
  function maxAppear(id) {
    const ing = Data.get().byId[id];
    return ing && ing.maxAppear != null ? ing.maxAppear : S.appearance.defaultMax;
  }
  function pendingComebacks(id) { return comeback.filter(c => c.id === id).length; }
  /** あと何回出られるか(また出てくる予約の分は引いておく) */
  function remainingAppear(id) {
    return maxAppear(id) - (appeared[id] || 0) - pendingComebacks(id);
  }

  /** にがした・落ちた食材を「また出てくる」予約に入れる(上限の中だけ) */
  function scheduleComeback(id) {
    if (remainingAppear(id) > 0) comeback.push({ id, at: gameTime + S.respawnDelaySec });
  }

  function nextIngredient() {
    const { byId, ingredients } = Data.get();
    const onScreen = new Set(active.map(a => a.ing.id));
    // にがした食材が戻ってくる時間になっていれば、それを優先
    const i = comeback.findIndex(c => c.at <= gameTime && !onScreen.has(c.id));
    if (i >= 0) {
      const id = comeback.splice(i, 1)[0].id;
      return byId[id];
    }
    // 残り回数が多いもの・注文の料理に使うものほど出やすい
    const favor = Number(S.pelican.orderFavor) || 1;
    const cands = ingredients.filter(x => !onScreen.has(x.id) && remainingAppear(x.id) > 0);
    const pool = cands.length > 1 ? cands.filter(x => x.id !== lastSpawnId) : cands;
    if (pool.length === 0) return null;
    const w = pool.map(x => remainingAppear(x.id) * (orderIds.has(x.id) ? favor : 1));
    let r = Math.random() * w.reduce((a, b) => a + b, 0);
    for (let k = 0; k < pool.length; k++) {
      r -= w[k];
      if (r <= 0) return pool[k];
    }
    return pool[pool.length - 1];
  }

  function spawn() {
    const ing = nextIngredient();
    if (!ing) return;
    appeared[ing.id] = (appeared[ing.id] || 0) + 1;
    lastSpawnId = ing.id;
    lastSpawnAt = gameTime;
    const g = geometry();
    const motionDef = Data.get().motions[ing.motion] || {};
    const seconds = (motionDef.seconds || 8) / ((S.speedScale || 1) * (phase().speed || 1));

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
        // にがしても失敗にしない:回数の上限の中なら、しばらくしてまた出てくる
        a.el.remove();
        scheduleComeback(a.ing.id);
        return false;
      }
      return true;
    });
  }

  // ── タップ ──────────────────────────────────────────────
  function onTap(e) {
    if (e.target.closest('button')) return;   // 注文の「まかせて!」ボタンなど
    e.preventDefault();
    Sound.unlock();
    if (!playing) return;
    const fr = field.getBoundingClientRect();
    const x = e.clientX - fr.left;
    const y = e.clientY - fr.top;
    ripple(x, y);

    // いちばん先はカモメ(タップで追い払う)
    if (gull && (gull.state === 'approach' || gull.state === 'escape') &&
        Math.hypot(gull.x - x, gull.y - y) < S.seagull.tapRadius) {
      shooSeagull();
      return;
    }

    // 特別なお客さま(タップで特別なスタンプ)
    if (guestNow && guestNow.state === 'float' &&
        Math.hypot(guestNow.x - x, guestNow.y - y) < Data.get().settings.story.guestTapRadius) {
      meetGuest();
      return;
    }

    // こぼれた食材が先(タップで器に戻す)。当たりの範囲は広め
    let lb = null, lbD = Infinity;
    loose.forEach(l => {
      const d = Math.hypot(l.x - x, l.y - y);
      if (d < 85 && d < lbD) { lb = l; lbD = d; }
    });
    if (lb) { rescueLoose(lb); return; }

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

  // ── 網ですくってザル(器)へ ────────────────────────────
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

    // 入り方を決める(食材ごとの出やすさ)
    let mode = pickEntry(a.ing);
    if (mode === 'makikomi' && !basketItems.some(b => b.el)) mode = 'bonbon';

    // 食材が器へ飛んでいく(ふちに当たるときは、ふちをめがけて)
    const slotIndex = takeSlot();
    const target = mode === 'fuchi' ? rimPoint(a.x) : slotPos(slotIndex);
    flyTo(a.el, a.x, a.y, a.size, target, 780, () => {
      a.el.remove();
      entryLand(mode, a.ing, slotIndex, target);
    });
  }

  /** 食材の丸を、放物線で target へ飛ばす */
  function flyTo(el, x, y, size, target, ms, done) {
    const half = size / 2;
    const midX = (x + target.x) / 2;
    const midY = Math.min(y, target.y) - 90;
    const sc = 44 / size;   // 器の中では小さく
    el.animate([
      { transform: `translate3d(${x - half}px, ${y - half}px, 0) scale(1)`, offset: 0 },
      { transform: `translate3d(${x - half}px, ${y - half - 30}px, 0) scale(1.1)`, offset: 0.25 },
      { transform: `translate3d(${midX - half}px, ${midY - half}px, 0) scale(0.8) rotate(180deg)`, offset: 0.6 },
      { transform: `translate3d(${target.x - half}px, ${target.y - half}px, 0) scale(${sc}) rotate(360deg)`, offset: 1 },
    ], { duration: ms, easing: 'ease-in-out', fill: 'forwards' }).onfinish = done;
  }

  let forcedEntry = null;   // 動作確認用
  function pickEntry(ing) {
    if (forcedEntry) return forcedEntry;
    const E = S.entry;
    const w = Object.assign({}, E.weights, ing.entry || {});
    const trouble = phase().troubleScale == null ? 1 : phase().troubleScale;
    ['fuchi', 'bonbon', 'makikomi'].forEach(k => { w[k] = (Number(w[k]) || 0) * trouble; });
    const keys = ENTRY_MODES.filter(k => Number(w[k]) > 0);
    const total = keys.reduce((n, k) => n + Number(w[k]), 0);
    if (!total) return 'sutto';
    let r = Math.random() * total;
    for (const k of keys) { r -= Number(w[k]); if (r <= 0) return k; }
    return 'sutto';
  }

  /** 器に着いたところで、入り方ごとの動き */
  function entryLand(mode, ing, slotIndex, target) {
    if (mode === 'sutto') {
      addToBasket(ing, slotIndex);
      Sound.playDrop();
    } else if (mode === 'kurutto') {
      // その場でくるっと宙返りしてから入る
      const el = makeLooseEl(ing, false);
      const tr = (dy, rot, s) => `translate3d(${target.x}px, ${target.y + dy}px, 0) rotate(${rot}deg) scale(${s})`;
      Sound.play('spin');
      el.animate([
        { transform: tr(0, 0, 1) },
        { transform: tr(-60, 200, 1.2), offset: 0.45 },
        { transform: tr(-30, 330, 1.1), offset: 0.7 },
        { transform: tr(0, 360, 1) },
      ], { duration: 650, easing: 'ease-in-out' }).onfinish = () => {
        el.remove();
        addToBasket(ing, slotIndex);
        Sound.playDrop();
      };
    } else if (mode === 'fuchi') {
      // ふちに当たって、下へ落ちていく(落ちる途中でタップすれば拾える)
      releaseSlot(slotIndex);
      Sound.play('bonk');
      const dir = target.x < field.clientWidth / 2 ? -1 : 1;
      addLoose(ing, fallPath(target.x, target.y, dir));
    } else if (mode === 'bonbon') {
      // ボンボン跳ねて外へ(跳ねている間にタップすれば戻せる)
      releaseSlot(slotIndex);
      Sound.play('boing');
      const dir = target.x < field.clientWidth / 2 ? -1 : 1;
      addLoose(ing, bouncePath(target.x, target.y, dir));
    } else if (mode === 'makikomi') {
      // 弾いて、中の別の食材を1つ巻き込んで外へ(どちらもタップで戻せる)
      releaseSlot(slotIndex);
      Sound.play('boing');
      const victims = basketItems.filter(b => b.el);
      const v = victims[Math.floor(Math.random() * victims.length)];
      const vp = elCenter(v.el);
      removeFromBasket(v);
      const dir = Math.random() < 0.5 ? -1 : 1;
      addLoose(ing, bouncePath(target.x, target.y, dir));
      addLoose(v.ing, bouncePath(vp.x, vp.y, -dir));
    }
  }

  // ── 器からこぼれた食材(タップで戻せる) ─────────────────
  function makeLooseEl(ing, tappable) {
    const el = document.createElement('div');
    el.className = 'loose' + (tappable ? ' tappable' : '');
    el.style.setProperty('--c', ing.color);
    el.innerHTML = `<div class="loose-body">${ingredientIconHTML(ing)}</div>` +
      (tappable ? '<div class="loose-hint">タップ!</div>' : '');
    fx.appendChild(el);
    return el;
  }

  function addLoose(ing, path) {
    const el = makeLooseEl(ing, true);
    const l = { ing, el, body: el.querySelector('.loose-body'), path, t: 0, dur: S.entry.rescueSec, x: 0, y: 0 };
    loose.push(l);
    placeLoose(l);
    return l;
  }

  function placeLoose(l) {
    const p = l.path(Math.min(1, l.t / l.dur), l.t);
    l.x = p.x;
    l.y = p.y;
    l.el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
    // 回すのは食材だけ(「タップ!」の札は回さない)
    l.body.style.transform = `rotate(${p.rot || 0}deg)`;
  }

  function updateLoose(dt) {
    loose = loose.filter(l => {
      l.t += dt;
      placeLoose(l);
      if (l.t < l.dur) return true;
      // 間に合わなかった:器からは出ていくが、回数の上限の中ならまた現れる
      l.el.remove();
      caught[l.ing.id] = Math.max(0, (caught[l.ing.id] || 0) - 1);
      scheduleComeback(l.ing.id);
      return false;
    });
  }

  /** こぼれた食材をタップして戻す */
  function rescueLoose(l, quiet) {
    loose = loose.filter(x => x !== l);
    const slotIndex = takeSlot();
    const to = slotPos(slotIndex);
    if (!quiet) {
      Sound.play('rescue');
      popWord(l.x, l.y - 40, 'セーフ!');
    }
    l.el.classList.remove('tappable');
    const hint = l.el.querySelector('.loose-hint');
    if (hint) hint.remove();
    l.el.animate([
      { transform: `translate3d(${l.x}px, ${l.y}px, 0) scale(1.2)` },
      { transform: `translate3d(${(l.x + to.x) / 2}px, ${Math.min(l.y, to.y) - 80}px, 0) scale(1.1) rotate(180deg)`, offset: 0.5 },
      { transform: `translate3d(${to.x}px, ${to.y}px, 0) scale(1) rotate(360deg)` },
    ], { duration: quiet ? 300 : 600, easing: 'ease-in-out', fill: 'forwards' }).onfinish = () => {
      l.el.remove();
      addToBasket(l.ing, slotIndex);
      Sound.playDrop();
    };
  }

  // 落ちる道すじ:ちょっと跳ね上がってから、画面の下へ
  function fallPath(x0, y0, dir) {
    const dur = S.entry.rescueSec;
    const yEnd = field.clientHeight + 40;
    const v0 = -170;
    const g = 2 * (yEnd - y0 - v0 * dur) / (dur * dur);
    const xs = Math.min(field.clientWidth - 34, Math.max(34, x0));
    return (p, t) => ({
      x: Math.min(field.clientWidth - 30, Math.max(30, xs + dir * 46 * p)),
      y: y0 + v0 * t + 0.5 * g * t * t,
      rot: dir * 220 * p,
    });
  }

  // 跳ねる道すじ:3回ボンボン跳ねながら、画面の横へ出ていく
  function bouncePath(x0, y0, dir) {
    const w = field.clientWidth;
    const dist = dir > 0 ? w + 40 - x0 : x0 + 40;
    const hops = 3;
    return p => ({
      x: x0 + dir * dist * p,
      y: y0 - Math.abs(Math.sin(p * hops * Math.PI)) * 110 * (1 - p * 0.4),
      rot: dir * 360 * p,
    });
  }

  function popWord(x, y, text) {
    const w = document.createElement('div');
    w.className = 'pop-word';
    w.textContent = text;
    w.style.left = x + 'px';
    w.style.top = y + 'px';
    fx.appendChild(w);
    setTimeout(() => w.remove(), 1000);
  }

  function showCatch(ing, isNew) {
    catchMsg.innerHTML = `${ing.emoji} ${ing.name}!` + (isNew ? '<span class="new">図鑑に追加</span>' : '');
    catchMsg.style.borderColor = ing.color;
    catchMsg.classList.add('show');
    clearTimeout(catchTimer);
    catchTimer = setTimeout(() => catchMsg.classList.remove('show'), 1400);
  }

  // ── 器の中 ──────────────────────────────────────────────
  // 置き場所:下の段から順に積んでいく(7個,6個,5個…)。空いた場所は使い回す
  const slotCache = [];
  function pileSlot(k) {
    if (slotCache[k]) return slotCache[k];
    const per = 28;
    const layerN = Math.floor(k / per);
    let n = k % per, row = 0, cap = 7;
    while (n >= cap) { n -= cap; row++; cap--; }
    const spacing = 32;
    const sx = (n - (cap - 1) / 2) * spacing + (Math.random() * 10 - 5) + (layerN % 2 ? 14 : 0);
    const sy = row * 22 + layerN * 8 + Math.random() * 4;
    return (slotCache[k] = { sx, sy });
  }

  function takeSlot() {
    if (freeSlots.length) {
      freeSlots.sort((a, b) => a - b);
      return freeSlots.shift();
    }
    return nextSlot++;
  }
  function releaseSlot(k) { if (!freeSlots.includes(k)) freeSlots.push(k); }

  /** 置き場所の、画面の中での位置 */
  function slotPos(k) {
    const fr = field.getBoundingClientRect();
    const br = basket.getBoundingClientRect();
    const slot = pileSlot(k);
    return {
      x: br.left - fr.left + br.width / 2 + slot.sx,
      y: br.bottom - fr.top - pileBottom - slot.sy - 22,
    };
  }

  /** 器のふち(左か右の、近いほう) */
  function rimPoint(fromX) {
    const fr = field.getBoundingClientRect();
    const br = basket.getBoundingClientRect();
    const cx = br.left - fr.left + br.width / 2;
    const dir = fromX < cx ? -1 : 1;
    return { x: cx + dir * br.width * 0.46, y: br.bottom - fr.top - 86 };
  }

  function elCenter(el) {
    const fr = field.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    return { x: r.left - fr.left + r.width / 2, y: r.top - fr.top + r.height / 2 };
  }

  function addToBasket(ing, slotIndex) {
    const item = { ing, slotIndex, el: null };
    if (pile.querySelectorAll('.pile-item').length < PILE_DOM_MAX) {
      const slot = pileSlot(slotIndex);
      const el = document.createElement('div');
      el.className = 'pile-item';
      el.style.left = `calc(50% + ${slot.sx}px)`;
      el.style.bottom = slot.sy + 'px';
      el.style.zIndex = String(slotIndex + 1);
      el.innerHTML = ingredientIconHTML(ing);
      pile.appendChild(el);
      item.el = el;
    }
    basketItems.push(item);
    return item;
  }

  function removeFromBasket(item) {
    basketItems = basketItems.filter(b => b !== item);
    if (item.el) item.el.remove();
    releaseSlot(item.slotIndex);
  }

  // ── カモメ(器の食材を1つくわえて逃げようとする) ───────
  const GULL_W = 130, GULL_H = 84;

  function updateSeagull(dt) {
    const G = S.seagull;
    if (!gull) {
      if (!phase().seagulls || nextGullAt == null) return;
      // 終わり間近には来ない(逃げる時間が足りないため)
      if (gameTime >= nextGullAt && gameTime < S.gameSeconds - G.approachSec - G.escapeSec - 1.5) spawnSeagull();
      return;
    }
    if (gull.state !== 'approach' && gull.state !== 'escape') return;   // 演出中
    gull.t += dt;
    if (gull.state === 'approach') {
      const p = Math.min(1, gull.t / G.approachSec);
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
      const target = basketItems.includes(gull.item) && gull.item.el ? elCenter(gull.item.el) : gull.target;
      gull.target = target;
      placeGull(gull.sx + (target.x - gull.sx) * e, gull.sy + (target.y - 34 - gull.sy) * e - Math.sin(p * Math.PI) * 50);
      if (p >= 1) grabItem();
    } else {
      const p = Math.min(1, gull.t / G.escapeSec);
      placeGull(gull.gx + (gull.ex - gull.gx) * p, gull.gy + (gull.ey - gull.gy) * p + Math.sin(gull.t * 7) * 10);
      if (p >= 1) pelicanRescue();
    }
  }

  function spawnSeagull() {
    const G = S.seagull;
    const items = basketItems.filter(b => b.el);
    if (items.length === 0) { nextGullAt = gameTime + 2; return; }
    const item = items[Math.floor(Math.random() * items.length)];
    const w = field.clientWidth;
    const dir = Math.random() < 0.5 ? 1 : -1;     // 1 = 左から右へ
    const el = document.createElement('div');
    el.className = 'gull' + (dir < 0 ? ' flip' : '');
    el.innerHTML = `<div class="gull-art">${Art.seagull()}</div><div class="gull-carry"></div>` +
      (gullCount === 0 ? '<div class="gull-hint">タップで追い払おう!</div>' : '');
    fx.appendChild(el);
    gullCount++;
    const top = document.getElementById('hud').getBoundingClientRect().bottom - field.getBoundingClientRect().top;
    gull = {
      el, item, dir, t: 0, state: 'approach',
      sx: dir > 0 ? -GULL_W : w + GULL_W, sy: top + 120,
      target: elCenter(item.el),
      ex: dir > 0 ? w - 80 : 80, ey: top + 150,    // 逃げる先(画面の上のほう。まだ見えるところ)
      x: 0, y: 0,
    };
    placeGull(gull.sx, gull.sy);
    Sound.play('seagull');
  }

  function placeGull(x, y) {
    gull.x = x;
    gull.y = y;
    gull.el.style.transform = `translate3d(${x - GULL_W / 2}px, ${y - GULL_H / 2}px, 0)`;
  }

  // 食材をくわえる
  function grabItem() {
    // ねらっていた食材が、もう器に無いとき(こぼれた等)は別の食材。何も無ければ手ぶらで帰る
    if (!basketItems.includes(gull.item)) {
      const others = basketItems.filter(b => b.el);
      if (others.length === 0) { gull.state = 'shooed'; flyAway(gull, 900); return; }
      gull.item = others[Math.floor(Math.random() * others.length)];
    }
    const item = gull.item;
    const ing = item.ing;
    // 器から取る(caught はそのまま。食材はかならず戻ってくる)
    removeFromBasket(item);
    gull.ing = ing;
    gull.el.querySelector('.gull-carry').innerHTML = ingredientIconHTML(ing);
    gull.el.classList.add('carrying');
    gull.state = 'escape';
    gull.t = 0;
    gull.gx = gull.x;
    gull.gy = gull.y;
    // 逃げるのは来た方向の先へ
    Sound.play('seagull');
  }

  /** カモメをタップ:追い払って、食材を器に戻す */
  function shooSeagull() {
    const g = gull;
    g.state = 'shooed';
    Sound.play('shoo');
    popWord(g.x, g.y - 50, 'えいっ!');
    const hint = g.el.querySelector('.gull-hint');
    if (hint) hint.remove();
    if (g.ing) dropBackToBasket(g.ing, g.x, g.y + 30);
    g.el.classList.remove('carrying');
    flyAway(g, 600);
    setTimeout(() => {
      Sound.play('pelican');
      pelicanSay(S.pelican.thanks, 1800);
    }, 350);
  }

  // カモメが画面の外へ飛んでいく
  function flyAway(g, ms) {
    const away = g.dir > 0 ? -1 : 1;   // 来た方向へ戻る
    const x2 = g.x + away * (field.clientWidth + GULL_W);
    g.el.classList.toggle('flip', away < 0);
    g.el.animate([
      { transform: `translate3d(${g.x - GULL_W / 2}px, ${g.y - GULL_H / 2}px, 0)` },
      { transform: `translate3d(${x2 - GULL_W / 2}px, ${g.y - GULL_H / 2 - 260}px, 0)` },
    ], { duration: ms, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
      g.el.remove();
      if (gull === g) endGull();
    };
  }

  function endGull() {
    gull = null;
    const [a, b] = S.seagull.intervalSec || [8, 12];
    nextGullAt = gameTime + a + Math.random() * Math.max(0, b - a);
  }

  /** 食材を (x, y) から器へ戻す */
  function dropBackToBasket(ing, x, y) {
    const slotIndex = takeSlot();
    const to = slotPos(slotIndex);
    const el = makeLooseEl(ing, false);
    el.animate([
      { transform: `translate3d(${x}px, ${y}px, 0)` },
      { transform: `translate3d(${(x + to.x) / 2}px, ${Math.min(y, to.y) - 40}px, 0) rotate(180deg)`, offset: 0.4 },
      { transform: `translate3d(${to.x}px, ${to.y}px, 0) rotate(360deg)` },
    ], { duration: 700, easing: 'ease-in', fill: 'forwards' }).onfinish = () => {
      el.remove();
      addToBasket(ing, slotIndex);
      Sound.playDrop();
    };
  }

  /** 間に合わなかったら、ペリカンが陽気に飛んできて取り返してくれる */
  function pelicanRescue() {
    const g = gull;
    g.state = 'rescue';
    const hint = g.el.querySelector('.gull-hint');
    if (hint) hint.remove();
    const w = field.clientWidth;
    const from = g.dir > 0 ? 1 : -1;   // カモメの行く先の側から来る
    const pel = document.createElement('div');
    pel.className = 'pelican-fly' + (from > 0 ? ' flip' : '');
    pel.innerHTML = `<div class="pelican-fly-art">${Art.pelican()}</div><div class="pelican-fly-carry"></div>` +
      `<div class="speech pelican-fly-speech" hidden></div>`;
    fx.appendChild(pel);
    const P = 120;
    const at = (x, y) => `translate3d(${x - P / 2}px, ${y - P / 2}px, 0)`;
    const sx = from > 0 ? w + P : -P, sy = g.y + 160;
    const meetX = g.x - from * 30, meetY = g.y + 20;
    Sound.play('pelican');
    pel.animate([{ transform: at(sx, sy) }, { transform: at(meetX, meetY) }],
      { duration: 650, easing: 'ease-out', fill: 'forwards' }).onfinish = () => {
      // カモメはびっくりして逃げ、食材はペリカンのくちばしへ
      popWord(g.x, g.y - 50, 'ギャッ!');
      Sound.play('seagull');
      g.el.classList.remove('carrying');
      const ing = g.ing;
      pel.querySelector('.pelican-fly-carry').innerHTML = ingredientIconHTML(ing);
      flyAway(g, 500);
      const sp = pel.querySelector('.pelican-fly-speech');
      sp.textContent = S.pelican.rescue;
      sp.hidden = false;
      // 器へ運ぶ
      const slotIndex = takeSlot();
      const to = slotPos(slotIndex);
      pel.animate([{ transform: at(meetX, meetY) }, { transform: at(to.x, to.y - 70) }],
        { duration: 900, delay: 350, easing: 'ease-in-out', fill: 'forwards' }).onfinish = () => {
        pel.querySelector('.pelican-fly-carry').innerHTML = '';
        addToBasket(ing, slotIndex);
        Sound.play('rescue');
        popWord(to.x, to.y - 90, 'おかえり!');
        pel.animate([{ transform: at(to.x, to.y - 70) }, { transform: at(to.x + from * (w + P), to.y - 420) }],
          { duration: 800, delay: 500, easing: 'ease-in', fill: 'forwards' }).onfinish = () => pel.remove();
      };
    };
  }

  /** ゲームが終わるとき:カモメがくわえている食材は器へ戻す */
  function clearSeagull() {
    if (!gull) return;
    const g = gull;
    if (g.ing && (g.state === 'escape')) dropBackToBasket(g.ing, g.x, g.y + 30);
    if (g.state === 'approach' || g.state === 'escape') flyAway(g, 500);
    gull = null;
  }

  // ── 特別なお客さま ──────────────────────────────────────
  // キラキラ光りながら、ゆっくり画面を横切る。タップすると特別なスタンプ。ゲームは止めない
  const GUEST_SIZE = 116;

  function updateGuest(dt) {
    const C = Data.get().settings.story;
    const stay = Math.max(3, Number(C.guestStaySec) || 11);
    if (!guestNow) {
      if (!guestPlans.length || gameTime < guestPlans[0].at) return;
      const plan = guestPlans.shift();
      // 終わり間近なら来ない(横切る時間が足りないため)
      if (gameTime < S.gameSeconds - stay - 1) spawnGuest(plan.guest, stay);
      return;
    }
    const g = guestNow;
    if (g.state !== 'float') return;
    g.t += dt;
    const p = g.t / g.stay;
    const x = g.sx + (g.ex - g.sx) * p;
    const y = g.baseY + Math.sin(g.t * 1.3) * 26;
    placeGuest(x, y);
    g.sparkleIn -= dt;
    if (g.sparkleIn <= 0) {
      g.sparkleIn = 0.16;
      sparkle(x + (Math.random() - 0.5) * GUEST_SIZE * 1.3, y + (Math.random() - 0.5) * GUEST_SIZE * 1.2, false);
    }
    if (p >= 1) { g.el.remove(); guestNow = null; }
  }

  function spawnGuest(guest, stay) {
    const w = field.clientWidth;
    const fr = field.getBoundingClientRect();
    const top = document.getElementById('hud').getBoundingClientRect().bottom - fr.top;
    const floor = basket.getBoundingClientRect().top - fr.top;
    // 器より上の、まん中あたりを通る
    const lo = top + GUEST_SIZE * 0.8, hi = Math.max(lo, floor - GUEST_SIZE * 1.1);
    const dir = Math.random() < 0.5 ? 1 : -1;
    const el = document.createElement('div');
    el.className = 'guest' + (guest.golden ? ' golden' : '');
    el.style.setProperty('--c', guest.color || '#C9A100');
    el.innerHTML = '<div class="guest-halo"></div>' +
      `<div class="guest-body">${Story.guestArt(guest)}</div>` +
      `<div class="guest-hint">✨ ${escapeHTML(Data.get().story.labels.guestHint)}</div>`;
    fx.appendChild(el);
    guestNow = {
      guest, el, t: 0, stay, state: 'float', sparkleIn: 0,
      sx: dir > 0 ? -GUEST_SIZE * 0.6 : w + GUEST_SIZE * 0.6,
      ex: dir > 0 ? w + GUEST_SIZE * 0.6 : -GUEST_SIZE * 0.6,
      baseY: lo + Math.random() * (hi - lo),
      x: 0, y: 0,
    };
    placeGuest(guestNow.sx, guestNow.baseY);
    Sound.play('sparkle');
  }

  function placeGuest(x, y) {
    guestNow.x = x;
    guestNow.y = y;
    guestNow.el.style.transform = `translate3d(${x - GUEST_SIZE / 2}px, ${y - GUEST_SIZE / 2}px, 0)`;
  }

  /** キラッと光る粒。big=true のときは大きく広がる */
  function sparkle(x, y, big) {
    const s = document.createElement('span');
    s.className = 'sparkle' + (big ? ' big' : '');
    s.textContent = Math.random() < 0.5 ? '✦' : '✧';
    s.style.left = x + 'px';
    s.style.top = y + 'px';
    if (big) {
      const a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 70;
      s.style.setProperty('--dx', Math.cos(a) * d + 'px');
      s.style.setProperty('--dy', Math.sin(a) * d + 'px');
    }
    fx.appendChild(s);
    setTimeout(() => s.remove(), big ? 1100 : 900);
  }

  function meetGuest() {
    const g = guestNow;
    g.state = 'met';
    Story.meetGuest(g.guest.id);
    guestsMet.push(g.guest);
    Sound.play('sparkle');
    for (let i = 0; i < 18; i++) sparkle(g.x, g.y, true);
    g.el.classList.add('met');
    const L = Data.get().story.labels;
    const msg = document.createElement('div');
    msg.className = 'guest-thanks';
    msg.style.setProperty('--c', g.guest.color || '#C9A100');
    msg.innerHTML = `<b>${escapeHTML(Story.fill(L.guestThanks, { name: g.guest.name }))}</b>` +
      `<span>🏅 ${escapeHTML(L.guestStamp)}</span>`;
    fx.appendChild(msg);
    setTimeout(() => msg.remove(), 2600);
    g.el.animate([
      { transform: g.el.style.transform, opacity: 1 },
      { transform: `translate3d(${g.x - GUEST_SIZE / 2}px, ${g.y - GUEST_SIZE / 2 - 120}px, 0) scale(1.3)`, opacity: 0 },
    ], { duration: 1400, easing: 'ease-in', fill: 'forwards' }).onfinish = () => g.el.remove();
    guestNow = null;
  }

  /** ゲームが終わるとき:まだいるお客さまは、ふわっと消える */
  function clearGuest() {
    guestPlans = [];
    if (!guestNow) return;
    const el = guestNow.el;
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 600, fill: 'forwards' }).onfinish = () => el.remove();
    guestNow = null;
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
    // こぼれている途中の食材は、やさしく器に戻す
    loose.slice().forEach(l => rescueLoose(l, true));
    clearSeagull();
    clearGuest();

    showBig(finaleText, 'そこまで!', 0);

    // 最後に料理を決める。器を決めたあとで料理が変わったら、完成の前に器を入れ替える
    const dish = Dishes.choose(caught, order && order.id);
    setTimeout(() => {
      finaleText.hidden = true;
      if (vesselDish && vesselFor(dish) !== vesselId) {
        changeVessel(vesselFor(dish), Data.get().vessels.changeMessage, () => setTimeout(() => cook(dish), 500));
      } else {
        cook(dish);
      }
    }, 1300);
  }

  // 煙がもくもく →「ボン!」→ チン! → 完成画面へ
  function cook(dish) {
    const later = (ms, fn) => setTimeout(fn, ms);
    later(0, () => {
      basket.classList.add('shake');
      Sound.playSmoke();
      smokePuffs();
    });
    later(1700, () => {
      basket.classList.remove('shake');
      pile.classList.add('gone');
      flash();
      finaleText.classList.add('boom');
      showBig(finaleText, 'ボン!', 0);
      Sound.playPop();
    });
    later(2500, () => Sound.playDing());
    later(3600, () => {
      finaleText.hidden = true;
      finaleText.classList.remove('boom');
      if (onFinish) onFinish({ caught: Object.assign({}, caught), order, dish, guests: guestsMet.slice() });
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

  // ── ペリカンのひとこと ─────────────────────────────────
  function pelicanSay(text, ms) {
    const box = document.getElementById('pelican-pop');
    const art = document.getElementById('pelican-pop-art');
    if (!art.firstChild) art.innerHTML = Art.pelican();
    document.getElementById('pelican-pop-text').textContent = text;
    box.hidden = false;
    box.classList.remove('show');
    void box.offsetWidth;
    box.classList.add('show');
    clearTimeout(popTimer);
    popTimer = setTimeout(() => { box.hidden = true; }, ms || 1800);
  }

  /** ゲームを途中でやめる(画面を離れるとき用) */
  function stop() {
    playing = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    Sound.stopBGM();
  }

  /** 動作確認用:時間を sec 秒すすめる(開発者ツールで Game.debugSkip(30) など) */
  function debugSkip(sec) { gameTime += sec; }
  /** 動作確認用:いまの状態 */
  function debugState() {
    return { gameTime, phase: phase() && phase().id, appeared, active: active.length,
      basket: basketItems.length, loose: loose.length, caught: Object.assign({}, caught) };
  }

  /** 動作確認用:入り方を固定する(Game.debugForceEntry('bonbon') など。null で元に戻す) */
  function debugForceEntry(mode) { forcedEntry = mode; }
  /** 動作確認用:すぐにカモメを呼ぶ */
  function debugSeagull() { if (!gull) nextGullAt = gameTime; }
  /** 動作確認用:すぐに特別なお客さまを呼ぶ(Game.debugGuest() / Game.debugGuest('gold')) */
  function debugGuest(id) {
    if (!playing || guestNow) return;
    const g = (id && Story.guests().find(x => x.id === id)) || Story.pickGuest();
    if (g) guestPlans.unshift({ guest: g, at: gameTime });
  }

  return { init, start, stop, pelicanSay, debugSkip, debugState, debugForceEntry, debugSeagull, debugGuest };
})();
