'use strict';

/**
 * 音のまとめ役(Web Audio API)。
 * 効果音はすべてプログラムで合成しているので、音のファイルは不要です。
 * 効果音をファイルに差し替えたいときは、data/settings.json の sounds に
 *   "fanfare": "audio/fanfare.mp3"
 * のように名前とファイルを書きます(名前は下の SYNTH を参照)。
 *
 * 曲(BGM):
 *   data/settings.json の bgm に、ファイルと「くり返す部分」(loopStart〜loopEnd 秒)を書きます。
 *   つなぎ目は fadeSec 秒のフェードで、なめらかに重ねます。
 *   ファイルが無い・読めないときは、静かに拍の音だけで進みます。
 *
 * 音のオン・オフ:setMuted(true/false)。すべての音は master(音量のつまみ)を通ります。
 */
const Sound = (() => {
  let ctx = null;
  let unlocked = false;
  let bgmBuffer = null;
  let bgmGain = null;          // 曲全体の音量
  let bgmTimer = null;         // 次のくり返しを予約するタイマー
  let bgmVoices = [];          // 鳴っている(鳴る予定の)曲のかけら
  let bgmOpts = null;
  let noiseBuffer = null;
  let master = null;           // すべての音の出口(オン・オフ用)
  let muted = false;

  function getCtx() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 1;
      master.connect(ctx.destination);
    }
    return ctx;
  }

  /** 音の出口(ここにつなぐと、オン・オフが効く) */
  function out() { getCtx(); return master; }

  /** 音のオン・オフ */
  function setMuted(m) {
    muted = !!m;
    if (master) {
      const t = ctx.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(muted ? 0 : 1, t + 0.15);
    }
  }
  function isMuted() { return muted; }

  /**
   * iPhone の Safari では、タップの処理の中で一度音を鳴らさないと
   * 音が出ません。ボタンを押したときに必ず呼んでください。
   */
  function unlock() {
    // iPhone のマナーモード(消音スイッチ)でも曲が鳴るように(対応している Safari だけ)
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* 無視 */ }
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
    gain.connect(out());
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
    gain.connect(out());
    src.start(start);
    src.stop(start + dur + 0.02);
  }

  // 低い音から高い音へ、金管楽器っぽい音(ファンファーレ用)
  function brass(freq, start, dur, vol) {
    const c = getCtx();
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(700, start);
    filter.frequency.linearRampToValueAtTime(3200, start + 0.05);
    filter.frequency.exponentialRampToValueAtTime(1400, start + dur);
    const gain = c.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.03);
    gain.gain.setValueAtTime(vol * 0.8, start + Math.max(0.04, dur - 0.08));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    filter.connect(gain);
    gain.connect(out());
    [-6, 6].forEach(det => {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, start);
      o.detune.setValueAtTime(det, start);
      o.connect(filter);
      o.start(start);
      o.stop(start + dur + 0.05);
    });
  }

  // 音の高さを途中で変える(ボヨーン・キャー用)
  function sweep(type, points, start, vol) {
    const c = getCtx();
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(points[0][1], start);
    points.slice(1).forEach(([t, f]) => osc.frequency.linearRampToValueAtTime(f, start + t));
    const dur = points[points.length - 1][0];
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.linearRampToValueAtTime(vol, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(gain);
    gain.connect(out());
    osc.start(start);
    osc.stop(start + dur + 0.05);
    return osc;
  }

  /**
   * 合成の効果音。名前ごとに1つ。
   * settings.json の sounds に同じ名前でファイルを書くと、そちらが鳴ります。
   */
  const SYNTH = {
    // 拍の音(4拍目ごとに少し高い)
    beat(accent) {
      const t = getCtx().currentTime;
      tone('square', accent ? 1400 : 1100, t, 0.04, accent ? 0.07 : 0.05);
    },
    // 網ですくう「サッ」+ポロン
    scoop() {
      const t = getCtx().currentTime;
      noise(t, 0.22, 0.35, 'bandpass', 900, 3500);
      tone('triangle', 660, t + 0.12, 0.25, 0.35);
      tone('triangle', 990, t + 0.2, 0.3, 0.25);
    },
    // 空振り(失敗ではないので控えめ)
    miss() {
      const t = getCtx().currentTime;
      noise(t, 0.15, 0.12, 'bandpass', 1500, 700);
    },
    // ザル(器)に入る「ポトッ」
    drop() {
      const t = getCtx().currentTime;
      tone('sine', 300, t, 0.12, 0.3, 160);
    },
    // 煙がもくもく
    smoke() {
      const t = getCtx().currentTime;
      noise(t, 1.6, 0.18, 'lowpass', 400, 1800);
    },
    // 「ボン!」
    pop() {
      const t = getCtx().currentTime;
      tone('sine', 160, t, 0.5, 0.9, 40);
      noise(t, 0.35, 0.6, 'lowpass', 2500, 200);
    },
    // 電子レンジの「チン!」
    ding() {
      const c = getCtx();
      [[880, 0], [1100, 0.18], [1320, 0.36]].forEach(([freq, delay]) => {
        tone('sine', freq, c.currentTime + delay, 1.0, 0.5);
      });
    },
    // 注文どおりの料理ができたときのファンファーレ
    fanfare() {
      const t = getCtx().currentTime + 0.05;
      const G4 = 392, C5 = 523.3, E5 = 659.3, G5 = 784, C6 = 1046.5;
      brass(G4, t, 0.13, 0.16);
      brass(G4, t + 0.16, 0.13, 0.16);
      brass(G4, t + 0.32, 0.13, 0.16);
      brass(C5, t + 0.48, 0.5, 0.2);
      brass(E5, t + 1.0, 0.16, 0.16);
      brass(G5, t + 1.18, 0.16, 0.16);
      [C5, E5, G5, C6].forEach(f => brass(f, t + 1.38, 1.3, 0.11));
    },
    // 注文と違う料理のとき(風船と花束の、ふわっと明るい音)
    celebrate() {
      const t = getCtx().currentTime + 0.05;
      [784, 988, 1175, 1568, 1319, 1568, 2093].forEach((f, i) => {
        tone('sine', f, t + i * 0.09, 0.5, 0.22);
      });
      [0.1, 0.45, 0.8].forEach(d => tone('sine', 520, t + d, 0.12, 0.25, 260));
    },
    // 特別なお客さまの「キラキラーン」
    sparkle() {
      const t = getCtx().currentTime;
      [1568, 2093, 2637, 3136, 2637, 3520].forEach((f, i) => tone('sine', f, t + i * 0.06, 0.6, 0.16));
      [784, 1175].forEach((f, i) => tone('triangle', f, t + 0.3 + i * 0.12, 0.9, 0.18));
    },
    // ペリカンの陽気な声「プップー」
    pelican() {
      const t = getCtx().currentTime;
      sweep('square', [[0, 330], [0.12, 390]], t, 0.09);
      sweep('square', [[0, 390], [0.22, 300]], t + 0.17, 0.09);
    },
    // カモメの「キャー」
    seagull() {
      const t = getCtx().currentTime;
      [0, 0.28].forEach(d => {
        sweep('sawtooth', [[0, 1300], [0.06, 1750], [0.22, 950]], t + d, 0.05);
      });
    },
    // カモメを追い払った「シュッ」
    shoo() {
      const t = getCtx().currentTime;
      noise(t, 0.3, 0.35, 'bandpass', 600, 4000);
      tone('triangle', 880, t + 0.08, 0.2, 0.25, 1400);
    },
    // 食材が戻ってきた(取り返した)
    rescue() {
      const t = getCtx().currentTime;
      [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, t + i * 0.07, 0.25, 0.25));
    },
    // ふちに当たる「コン」
    bonk() {
      const t = getCtx().currentTime;
      tone('sine', 700, t, 0.1, 0.4, 420);
      noise(t, 0.05, 0.25, 'highpass', 2000);
    },
    // 跳ねる「ボヨン」
    boing() {
      const t = getCtx().currentTime;
      sweep('triangle', [[0, 180], [0.08, 560], [0.3, 240]], t, 0.3);
    },
    // くるっと回る「ヒュルン」
    spin() {
      const t = getCtx().currentTime;
      sweep('triangle', [[0, 500], [0.25, 1300]], t, 0.18);
    },
    // 器がやってきた「ジャーン」
    vessel() {
      const t = getCtx().currentTime;
      tone('triangle', 523, t, 0.25, 0.3);
      tone('triangle', 784, t + 0.15, 0.6, 0.25);
      tone('triangle', 1047, t + 0.15, 0.6, 0.2);
    },
  };

  // 効果音ファイル(読み込めたものだけ)
  const effectBuffers = {};

  /** settings.json の sounds に書かれた効果音ファイルを読み込む(無ければ合成音のまま) */
  async function loadEffects(map) {
    if (!map) return;
    const c = getCtx();
    await Promise.all(Object.keys(map).map(async name => {
      const url = map[name];
      if (!url || name.startsWith('_')) return;
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const ab = await res.arrayBuffer();
        effectBuffers[name] = await new Promise((ok, ng) => c.decodeAudioData(ab, ok, ng));
      } catch (e) { /* 読めなければ合成音 */ }
    }));
  }

  /** 名前で効果音を鳴らす */
  function play(name, arg) {
    try {
      const buf = effectBuffers[name];
      if (buf) {
        const c = getCtx();
        const src = c.createBufferSource();
        src.buffer = buf;
        src.connect(out());
        src.start();
        return;
      }
      if (SYNTH[name]) SYNTH[name](arg);
    } catch (e) { /* 音が鳴らなくてもゲームは続ける */ }
  }

  // 前からある呼び方も使えるように
  const playBeat  = accent => play('beat', accent);
  const playScoop = () => play('scoop');
  const playMiss  = () => play('miss');
  const playDrop  = () => play('drop');
  const playSmoke = () => play('smoke');
  const playPop   = () => play('pop');
  const playDing  = () => play('ding');

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
  function isBGMPlaying() { return !!bgmTimer; }

  /**
   * 曲の loopStart〜loopEnd の部分をくり返し流す。
   * かけらを少しずつ重ねて置き、重なったところをフェードでつなぐ。
   * opts = { volume, loopStart, loopEnd, fadeSec }
   */
  function startBGM(opts) {
    if (!bgmBuffer) return;
    stopBGM(0.05);
    const c = getCtx();
    const dur = bgmBuffer.duration;
    const o = Object.assign({ volume: 0.7, loopStart: 0, loopEnd: 0, fadeSec: 0.6 }, opts || {});
    const a = Math.max(0, Math.min(dur - 1, Number(o.loopStart) || 0));
    let b = Number(o.loopEnd) || dur;
    if (b <= a + 1 || b > dur) b = dur;
    const fade = Math.max(0.02, Math.min(Number(o.fadeSec) || 0.6, (b - a) / 4));
    bgmOpts = { a, b, fade, len: b - a };
    bgmGain = c.createGain();
    bgmGain.gain.value = o.volume == null ? 0.7 : o.volume;
    bgmGain.connect(out());
    let next = c.currentTime + 0.08;
    const schedule = () => {
      // 2秒先までのかけらを予約しておく
      while (next < c.currentTime + 2) {
        bgmVoices.push(playPiece(next));
        next += bgmOpts.len - bgmOpts.fade;
      }
      const now = c.currentTime;
      bgmVoices = bgmVoices.filter(v => v.end > now);
    };
    schedule();
    bgmTimer = setInterval(schedule, 400);
  }

  /** 曲のかけらを1つ:フェードインして始まり、フェードアウトで終わる */
  function playPiece(when) {
    const c = getCtx();
    const { a, len, fade } = bgmOpts;
    const src = c.createBufferSource();
    src.buffer = bgmBuffer;
    const g = c.createGain();
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(1, when + fade);
    g.gain.setValueAtTime(1, when + len - fade);
    g.gain.linearRampToValueAtTime(0, when + len);
    src.connect(g);
    g.connect(bgmGain);
    src.start(when, a, len);
    return { src, end: when + len };
  }

  /** 曲を止める(ふわっと小さくしてから) */
  function stopBGM(fadeOut) {
    if (bgmTimer) clearInterval(bgmTimer);
    bgmTimer = null;
    if (!bgmGain) return;
    const f = fadeOut == null ? 0.8 : fadeOut;
    try {
      const t = getCtx().currentTime;
      bgmGain.gain.cancelScheduledValues(t);
      bgmGain.gain.setValueAtTime(bgmGain.gain.value, t);
      bgmGain.gain.linearRampToValueAtTime(0.0001, t + f);
      bgmVoices.forEach(v => { try { v.src.stop(t + f + 0.05); } catch (_) {} });
    } catch (_) {}
    bgmVoices = [];
    bgmGain = null;
  }

  return {
    unlock, play, loadEffects,
    playBeat, playScoop, playMiss, playDrop, playSmoke, playPop, playDing,
    loadBGM, hasBGM, isBGMPlaying, startBGM, stopBGM,
    setMuted, isMuted,
  };
})();
