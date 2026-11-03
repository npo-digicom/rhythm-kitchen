'use strict';

const Game = (() => {
  // ── 定数 ────────────────────────────────────────────────────
  const BPM            = 80;
  const BEAT_MS        = 60000 / BPM;   // 750 ms / 拍
  const GAME_MS        = 90000;          // 90 秒
  const TRAVEL_MS      = BEAT_MS * 2;   // 1500 ms: 出現→まな板中央
  const SPAWN_MS       = BEAT_MS * 4;   // 3000 ms: 食材の間隔
  const PERFECT_MS     = 220;           // ±この時間内: きれいに切れた
  const GOOD_MS        = 550;           // ±この時間内: 少し大きめ

  const INGREDIENTS = [
    { id: 'iwashi',   name: 'イワシ',         color: '#4A7FA5', emoji: '🐟',
      fact: 'DHAとEPAが豊富で、記憶力や血流のサポートに役立つ魚です。' },
    { id: 'tamanegi', name: '玉ねぎ',         color: '#E8891A', emoji: '🧅',
      fact: '加熱すると甘みが増します。血液をさらさらにする成分が入っています。' },
    { id: 'ninniku',  name: 'にんにく',       color: '#8DB22A', emoji: '🧄',
      fact: 'アリシンが疲れを取る働きをします。少量で香りが豊かになります。' },
    { id: 'tomato',   name: 'トマト',         color: '#C0392B', emoji: '🍅',
      fact: 'リコピンは加熱すると吸収率がアップ。骨を守る抗酸化物質です。' },
    { id: 'olive',    name: 'オリーブ',       color: '#5D8233', emoji: '🫒',
      fact: '地中海の恵み。塩漬けオリーブがプサリ・プラキに風味を加えます。' },
    { id: 'lemon',    name: 'レモン',         color: '#C8A800', emoji: '🍋',
      fact: 'ビタミンCが鉄の吸収を高めます。絞りたての香りが食欲をそそります。' },
    { id: 'paseri',   name: 'パセリ',         color: '#27AE60', emoji: '🌿',
      fact: '鉄分とビタミンKが豊富な緑の飾り。香りが料理を引き立てます。' },
    { id: 'oliveoil', name: 'オリーブオイル', color: '#C49A10', emoji: '🫙',
      fact: 'オレイン酸が善玉コレステロールを増やします。地中海料理の要です。' },
  ];

  // ── 状態 ────────────────────────────────────────────────────
  let playing       = false;
  let startTime     = 0;       // performance.now() at game start
  let nextSpawnAt   = 0;       // performance.now() of next spawn
  let ingIndex      = 0;
  let active        = [];      // { el, spawnTime, targetElapsed, def, cut }
  let rafId         = null;
  let factTimer     = null;
  let lastBeatStep  = -1;      // 最後に鳴らした拍番号

  // ── DOM ─────────────────────────────────────────────────────
  let lane, timerFill, factBox, factQuality, factContent;

  // ── 初期化 ──────────────────────────────────────────────────
  function init() {
    lane        = document.getElementById('lane');
    timerFill   = document.getElementById('timer-fill');
    factBox     = document.getElementById('fact-box');
    factQuality = document.getElementById('fact-quality');
    factContent = document.getElementById('fact-text');

    document.getElementById('btn-start').addEventListener('pointerup', onStartTap);
    document.getElementById('btn-retry').addEventListener('pointerup', onRetryTap);

    // 切るボタンと、ゲームエリア全体をタップ可能に
    const gameArea = document.getElementById('game-area');
    gameArea.addEventListener('pointerdown', onCutTap);

    const btnCut = document.getElementById('btn-cut');
    btnCut.addEventListener('pointerdown', onCutTap);
  }

  function onStartTap() {
    Audio.unlock();
    startGame();
  }
  function onRetryTap() {
    showScreen('start');
  }

  // ── 画面切替 ────────────────────────────────────────────────
  function showScreen(name) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById('screen-' + name).classList.add('active');
  }

  // ── ゲーム開始 ──────────────────────────────────────────────
  function startGame() {
    playing      = true;
    ingIndex     = 0;
    active       = [];
    lastBeatStep = -1;
    lane.innerHTML = '';
    factBox.classList.remove('visible');

    const now   = performance.now();
    startTime   = now;
    nextSpawnAt = now + 3000; // 最初の食材は3秒後に出現（まな板着は4.5秒）

    // BGMがある場合はここでロード＆再生:
    // Audio.loadBGM('audio/bgm.mp3').then(() => Audio.startBGM());

    showScreen('game');
    rafId = requestAnimationFrame(loop);
  }

  // ── ゲーム終了 ──────────────────────────────────────────────
  function endGame() {
    playing = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    Audio.stopBGM();
    Audio.playDing();
    setTimeout(() => showScreen('complete'), 1400);
  }

  // ── メインループ ─────────────────────────────────────────────
  function loop(now) {
    const elapsed = now - startTime;

    // タイマーバー更新
    timerFill.style.width = Math.min(elapsed / GAME_MS * 100, 100) + '%';

    // 拍クリック
    tickBeats(elapsed);

    // 食材スポーン
    if (playing && now >= nextSpawnAt && elapsed < GAME_MS - 5500) {
      spawn(now, elapsed);
      nextSpawnAt = now + SPAWN_MS;
    }

    // 食材位置更新
    const cX    = window.innerWidth / 2;
    const speed = (cX + 80) / TRAVEL_MS; // px/ms、中央到達がちょうど TRAVEL_MS

    active = active.filter(ing => {
      if (ing.cut) return false;

      const t       = now - ing.spawnTime;
      const centerX = -80 + speed * t;                   // 食材円の中心 x
      ing.el.style.left = (centerX - 40) + 'px';         // 幅80px の左端

      // ウィンドウを超えてタップされなかった場合は自動で切る
      if (elapsed - ing.targetElapsed > GOOD_MS + 300) {
        autoCut(ing);
        return false;
      }

      // 画面外右に出たら削除
      if (centerX > window.innerWidth + 90) return false;

      return true;
    });

    if (elapsed >= GAME_MS) { endGame(); return; }

    rafId = requestAnimationFrame(loop);
  }

  // ── 拍クリック管理 ──────────────────────────────────────────
  function tickBeats(elapsed) {
    const step = Math.floor(elapsed / BEAT_MS);
    if (step > lastBeatStep) {
      Audio.playBeat();
      lastBeatStep = step;
    }
  }

  // ── 食材を出現させる ─────────────────────────────────────────
  function spawn(now, elapsed) {
    const def = INGREDIENTS[ingIndex % INGREDIENTS.length];
    ingIndex++;

    const el = document.createElement('div');
    el.className = 'ingredient';
    el.innerHTML =
      `<div class="ingredient-circle" style="background:${def.color}">` +
        `<img src="images/ingredient_${def.id}.png" alt="${def.name}"` +
             ` onerror="this.style.display='none'">` +
        `<span>${def.emoji}</span>` +
      `</div>` +
      `<span class="ingredient-label">${def.name}</span>`;

    lane.appendChild(el);

    active.push({
      el,
      def,
      spawnTime:     now,
      targetElapsed: elapsed + TRAVEL_MS,  // まな板に届くゲーム経過時間
      cut:           false,
    });
  }

  // ── タップ処理 ──────────────────────────────────────────────
  function onCutTap(e) {
    e.stopPropagation();
    Audio.unlock();
    if (!playing) return;

    const elapsed = performance.now() - startTime;

    // 一番近い未カット食材を探す
    let best = null, bestDelta = Infinity;
    active.forEach(ing => {
      if (ing.cut) return;
      const d = Math.abs(elapsed - ing.targetElapsed);
      if (d < bestDelta) { bestDelta = d; best = ing; }
    });

    if (!best || bestDelta > GOOD_MS) {
      // 食材がないときもフィードバック音
      Audio.playCut(false);
      return;
    }

    cutIngredient(best, bestDelta <= PERFECT_MS ? 'perfect' : 'good');
  }

  // ── 食材を切る ───────────────────────────────────────────────
  function cutIngredient(ing, quality) {
    ing.cut = true;
    ing.el.classList.add('cut');
    Audio.playCut(quality === 'perfect');

    showFact(
      ing.def,
      quality === 'perfect' ? 'きれいに切れました！' : 'すこし大きめに切れました'
    );
    removeLater(ing.el, 720);
  }

  function autoCut(ing) {
    ing.cut = true;
    ing.el.classList.add('cut');
    removeLater(ing.el, 650);
  }

  function removeLater(el, ms) {
    setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, ms);
  }

  // ── ひとこと話を表示 ─────────────────────────────────────────
  function showFact(def, msg) {
    if (factTimer) clearTimeout(factTimer);
    factQuality.textContent = msg;
    factContent.textContent = def.fact;
    factBox.classList.add('visible');

    factTimer = setTimeout(() => {
      factBox.classList.remove('visible');
    }, 2800);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', () => Game.init());
