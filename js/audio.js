'use strict';

/**
 * Audio module — Web Audio API wrapper.
 * All sounds are synthesised; no external files required.
 *
 * BGM 差し替え方法:
 *   Audio.loadBGM('audio/bgm.mp3').then(() => Audio.startBGM());
 * を game.js の startGame() 内でコメント解除するだけ。
 */
const Audio = (() => {
  let ctx = null;
  let unlocked = false;
  let bgmBuffer = null;
  let bgmSource = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
  }

  /** iOSではユーザー操作のハンドラ内で呼ぶこと */
  function unlock() {
    if (unlocked) return;
    const c = getCtx();
    // 無音バッファを再生してロック解除
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
    if (c.state === 'suspended') c.resume();
    unlocked = true;
  }

  /** 拍のクリック音（短い高音） */
  function playBeat() {
    const c = getCtx();
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.frequency.value = 1200;
    osc.type = 'square';
    const t = c.currentTime;
    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);
    osc.start(t);
    osc.stop(t + 0.04);
  }

  /**
   * 切り音
   * @param {boolean} perfect - true: きれいに切れた, false: 少し大きめ
   */
  function playCut(perfect) {
    const c = getCtx();
    const osc  = c.createOscillator();
    const gain = c.createGain();
    osc.connect(gain);
    gain.connect(c.destination);
    osc.type = 'triangle';
    osc.frequency.value = perfect ? 520 : 380;
    const t = c.currentTime;
    gain.gain.setValueAtTime(0.5, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + (perfect ? 0.35 : 0.25));
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** 電子レンジの「チン！」 — 完成時 */
  function playDing() {
    const c = getCtx();
    [[880, 0], [1100, 0.18], [1320, 0.36]].forEach(([freq, delay]) => {
      const osc  = c.createOscillator();
      const gain = c.createGain();
      osc.connect(gain);
      gain.connect(c.destination);
      osc.type = 'sine';
      osc.frequency.value = freq;
      const t = c.currentTime + delay;
      gain.gain.setValueAtTime(0.55, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
      osc.start(t);
      osc.stop(t + 1.0);
    });
  }

  /** BGMファイルをロード（存在しない場合は静かに無視） */
  async function loadBGM(url) {
    try {
      const c   = getCtx();
      const res = await fetch(url);
      const ab  = await res.arrayBuffer();
      bgmBuffer = await c.decodeAudioData(ab);
    } catch (e) {
      // BGMファイルがない場合は無視（ビートクリックのみで進行）
    }
  }

  function startBGM() {
    if (!bgmBuffer) return;
    const c = getCtx();
    bgmSource = c.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    bgmSource.connect(c.destination);
    bgmSource.start();
  }

  function stopBGM() {
    if (!bgmSource) return;
    try { bgmSource.stop(); } catch (_) {}
    bgmSource = null;
  }

  return { unlock, playBeat, playCut, playDing, loadBGM, startBGM, stopBGM };
})();
