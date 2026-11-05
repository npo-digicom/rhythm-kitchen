'use strict';

/**
 * 食材の動き方(6つの型)。
 * それぞれ「出てくる位置」と「時間ごとの位置」を決めています。
 *
 * create(box, opts) → 動きの状態を作る
 * update(state, dt)  → 位置 {x, y, rot, scale, alpha, done} を返す
 *
 * box  : 動ける範囲 { w, top, floor }(floor はザルの上のあたり)
 * opts : { seconds, size, beatSec }
 */
const Motions = (() => {
  const rand = (a, b) => a + Math.random() * (b - a);
  const side = () => (Math.random() < 0.5 ? 1 : -1);

  // 左右どちらかから入って反対側へ抜ける x 座標
  function crossX(box, r, dir, p) {
    const from = dir > 0 ? -r : box.w + r;
    const to   = dir > 0 ? box.w + r : -r;
    return from + (to - from) * p;
  }

  const types = {
    // ビューン:画面を素早く横切る
    byun: {
      create(box, o) {
        return { dir: side(), y: rand(box.top + o.size, box.floor - o.size * 1.2) };
      },
      pos(s, p, t, box, o) {
        return { x: crossX(box, o.size, s.dir, p), y: s.y + Math.sin(t * 9) * 4, rot: s.dir * 8 };
      },
    },

    // ぐるぐる:回りながらゆっくり進む
    guruguru: {
      create(box, o) {
        const r = Math.min(52, box.w * 0.12);
        return { dir: side(), r, cy: rand(box.top + o.size + r, box.floor - o.size - r), spin: side() };
      },
      pos(s, p, t, box, o) {
        const w = (Math.PI * 2) / 2.6;   // 2.6秒でひと回り
        const a = t * w * s.spin;
        return {
          x: crossX(box, o.size + s.r, s.dir, p) + Math.cos(a) * s.r,
          y: s.cy + Math.sin(a) * s.r,
          rot: (a * 180) / Math.PI,
        };
      },
    },

    // ふわふわ:上下に漂う
    fuwafuwa: {
      create(box, o) {
        const amp = Math.min(70, (box.floor - box.top) * 0.12);
        return { dir: side(), amp, y: rand(box.top + o.size + amp, box.floor - o.size - amp), ph: rand(0, 6) };
      },
      pos(s, p, t, box, o) {
        const wave = Math.sin(t * (Math.PI * 2 / 3.2) + s.ph);
        return { x: crossX(box, o.size, s.dir, p), y: s.y + wave * s.amp, rot: wave * 10 };
      },
    },

    // ピョンピョン:跳ねながら進む(1拍に1回ジャンプ)
    pyonpyon: {
      create(box, o) {
        const h = Math.min(110, (box.floor - box.top) * 0.18);
        const base = rand(box.top + o.size + h + 40, box.floor - o.size * 0.6);
        return { dir: side(), h, base };
      },
      pos(s, p, t, box, o) {
        const hop = Math.abs(Math.sin((t / o.beatSec) * Math.PI));
        const squash = hop < 0.12 ? 0.88 : 1;
        return { x: crossX(box, o.size, s.dir, p), y: s.base - hop * s.h, rot: s.dir * (hop - 0.5) * 20, sy: squash };
      },
    },

    // ポンポン:上から落ちてきて、弾みながら横へ移動
    ponpon: {
      create(box, o) {
        const dir = side();
        const height = (box.floor - box.top) * rand(0.42, 0.6);
        const g = 1500;
        const x = dir > 0 ? rand(o.size, box.w * 0.35) : rand(box.w * 0.65, box.w - o.size);
        const dist = (dir > 0 ? box.w + o.size - x : x + o.size);
        return {
          x, y: -o.size, vy: 0, g,
          vx: dir * dist / o.seconds,
          bounceV: Math.sqrt(2 * g * height),
          floorY: box.floor - o.size * 0.55,
        };
      },
      step(s, dt, box, o) {
        s.vy += s.g * dt;
        s.y += s.vy * dt;
        s.x += s.vx * dt;
        let sy = 1;
        if (s.y > s.floorY) { s.y = s.floorY; s.vy = -s.bounceV; sy = 0.82; }
        const out = s.x < -o.size * 1.2 || s.x > box.w + o.size * 1.2;
        return { x: s.x, y: s.y, rot: s.x * 0.8, sy, done: out };
      },
    },

    // すいー:下からゆっくり浮かんでくる
    suii: {
      create(box, o) {
        return { x: rand(o.size * 1.2, box.w - o.size * 1.2), ph: rand(0, 6) };
      },
      pos(s, p, t, box, o) {
        const from = box.floor + o.size * 0.5;
        const to = -o.size * 1.5;
        const sway = Math.sin(t * (Math.PI * 2 / 4) + s.ph);
        return {
          x: Math.min(box.w - o.size * 0.6, Math.max(o.size * 0.6, s.x + sway * 34)),
          y: from + (to - from) * p,
          rot: sway * 8,
          alpha: Math.min(1, p * 8),
        };
      },
    },
  };

  function create(type, box, opts) {
    const def = types[type] || types.fuwafuwa;
    return { def, t: 0, box, opts, s: def.create(box, opts) };
  }

  function update(m, dt) {
    m.t += dt;
    if (m.def.step) return m.def.step(m.s, dt, m.box, m.opts);
    const p = m.t / m.opts.seconds;
    const r = m.def.pos(m.s, Math.min(p, 1), m.t, m.box, m.opts);
    r.done = p >= 1;
    return r;
  }

  return { create, update, names: Object.keys(types) };
})();
