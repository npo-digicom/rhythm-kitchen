'use strict';

/**
 * 音のまとめ役(Web Audio API)。
 * 効果音はすべてプログラムで合成しているので、音のファイルは不要です。
 *
 * 曲(BGM)の差し替え:
 *   data/settings.json の bgm.file に 'audio/piccadilly.mp3' のように書くだけ。
 *   ファイルが無い・読めないときは、静かに拍の音だけで進みます。
 */
const Sound = (() => {
  let ctx = null;
  let unlocked = false;
  let bgmBuffer = null;
  let bgmSource = null;
  let bgmGain = null;
  let noiseBuffer = null;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
  }

  /**
   * iPhone の Safari では、タップの処理の中で一度音を鳴らさないと
   * 音が出ません。ボタンを押したときに必ず呼んでください。
   */
  function unlock() {
    const c = getCtx();
    if (c.state === 'suspended') c.resume();
    if (unlocked) return;
    // 無音を一瞬鳴らしてロックを外す
    const buf = c.createBuffer(1, 1, 22050);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.connect(c.destination);
    src.start(0);
    unlocked = true;
  }

  // 画面を切り替えて戻ってきたとき、止まった音を再開する
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state === 'suspended' && unlocked) ctx.resume();
  });

  function getNoise() {
    if (noiseBuffer) return noiseBuffer;
    const c = getCtx();
    noiseBuffer = c.createBuffer(1, c.sampleRate, c.sampleRate);
    const d = noiseBuffer.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuffer;
  }

  function tone(type, freq, start, dur, vol, endFreq) {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(endFreq, start + dur);
    gain.gain.setValueAtTime(vol, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  function noise(start, dur, vol, filterType, f1, f2) {
    const c = getCtx();
    const src = c.createBufferSource();
    src.buffer = getNoise();
    const filter = c.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.setValueAtTime(f1, start);
    if (f2) filter.frequency.exponentialRampToValueAtTime(f2, start + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(vol, start + dur * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(c.destination);
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  /** 拍の音(80拍/分のクリック) */
  function playBeat(accent) {
    const t = getCtx().currentTime;
    tone('square', accent ? 1400 : 1100, t, 0.04, accent ? 0.07 : 0.05);
  }

  /** 網ですくう「サッ」+ ポロンという音 */
  function playScoop() {
    const t = getCtx().currentTime;
    noise(t, 0.22, 0.35, 'bandpass', 900, 3500);
    tone('triangle', 660, t + 0.12, 0.25, 0.35);
    tone('triangle', 990, t + 0.2, 0.3, 0.25);
  }

  /** 空振りのときのやさしい音(失敗ではないので控えめ) */
  function playMiss() {
    const t = getCtx().currentTime;
    noise(t, 0.15, 0.12, 'bandpass', 1500, 700);
  }

  /** ザルに入ったときの「ポトッ」 */
  function playDrop() {
    const t = getCtx().currentTime;
    tone('sine', 300, t, 0.12, 0.3, 160);
  }

  /** 煙がもくもく出る音 */
  function playSmoke() {
    const t = getCtx().currentTime;
    noise(t, 1.6, 0.18, 'lowpass', 400, 1800);
  }

  /** 「ボン!」 */
  function playPop() {
    const t = getCtx().currentTime;
    tone('sine', 160, t, 0.5, 0.9, 40);
    noise(t, 0.35, 0.6, 'lowpass', 2500, 200);
  }

  /** 電子レンジの「チン!」 — 完成時 */
  function playDing() {
    const c = getCtx();
    [[880, 0], [1100, 0.18], [1320, 0.36]].forEach(([freq, delay]) => {
      tone('sine', freq, c.currentTime + delay, 1.0, 0.5);
    });
  }

  /** 曲ファイルを読み込む(無い場合は静かに無視) */
  async function loadBGM(url) {
    if (!url) return false;
    try {
      const c = getCtx();
      const res = await fetch(url);
      if (!res.ok) return false;
      const ab = await res.arrayBuffer();
      bgmBuffer = await new Promise((ok, ng) => c.decodeAudioData(ab, ok, ng));
      return true;
    } catch (e) {
      bgmBuffer = null;
      return false;
    }
  }

  function hasBGM() { return !!bgmBuffer; }

  function startBGM(volume) {
    if (!bgmBuffer) return;
    stopBGM();
    const c = getCtx();
    bgmSource = c.createBufferSource();
    bgmSource.buffer = bgmBuffer;
    bgmSource.loop = true;
    bgmGain = c.createGain();
    bgmGain.gain.value = volume == null ? 0.8 : volume;
    bgmSource.connect(bgmGain);
    bgmGain.connect(c.destination);
    bgmSource.start();
  }

  function stopBGM() {
    if (!bgmSource) return;
    try {
      const t = getCtx().currentTime;
      bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
      bgmGain.gain.linearRampToValueAtTime(0.0001, t + 0.6);
      bgmSource.stop(t + 0.65);
    } catch (_) {}
    bgmSource = null;
  }

  return {
    unlock, playBeat, playScoop, playMiss, playDrop, playSmoke, playPop, playDing,
    loadBGM, hasBGM, startBGM, stopBGM,
  };
})();
