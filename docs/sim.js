// FairDoor simulation, ported line for line from sim.py. It uses the same random number
// generator as Python (MT19937, random.random, random.expovariate), so seed 3 here gives
// exactly the numbers seed 3 gives there.
(function (root) {
  function MT(seed) {
    const mt = new Uint32Array(624); let mti = 625;
    function initGenrand(s) { mt[0] = s >>> 0; for (mti = 1; mti < 624; mti++) { const p = mt[mti - 1] ^ (mt[mti - 1] >>> 30); mt[mti] = (Math.imul(1812433253, p) + mti) >>> 0; } }
    // Python seeds an int through init_by_array with its 32-bit words (0 → [0]).
    function initByArray(key) {
      initGenrand(19650218);
      let i = 1, j = 0, k = Math.max(624, key.length);
      for (; k; k--) {
        const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
        mt[i] = ((mt[i] ^ Math.imul(p, 1664525)) + key[j] + j) >>> 0;
        i++; j++;
        if (i >= 624) { mt[0] = mt[623]; i = 1; }
        if (j >= key.length) j = 0;
      }
      for (k = 623; k; k--) {
        const p = mt[i - 1] ^ (mt[i - 1] >>> 30);
        mt[i] = ((mt[i] ^ Math.imul(p, 1566083941)) - i) >>> 0;
        i++;
        if (i >= 624) { mt[0] = mt[623]; i = 1; }
      }
      mt[0] = 0x80000000;
    }
    function int32() {
      let y;
      if (mti >= 624) {
        for (let kk = 0; kk < 624; kk++) {
          y = (mt[kk] & 0x80000000) | (mt[(kk + 1) % 624] & 0x7fffffff);
          mt[kk] = mt[(kk + 397) % 624] ^ (y >>> 1) ^ (y & 1 ? 0x9908b0df : 0);
        }
        mti = 0;
      }
      y = mt[mti++];
      y ^= y >>> 11; y ^= (y << 7) & 0x9d2c5680; y ^= (y << 15) & 0xefc60000; y ^= y >>> 18;
      return y >>> 0;
    }
    const words = []; let s = Math.abs(seed);
    do { words.push(s % 4294967296); s = Math.floor(s / 4294967296); } while (s > 0);
    initByArray(words);
    const random = () => ((int32() >>> 5) * 67108864 + (int32() >>> 6)) / 9007199254740992;
    return { random, expovariate: (l) => -Math.log(1 - random()) / l };
  }

  function run(policy, { seed = 1, CAP = 4, RATE = 60, TIMEOUT = 20, RETRY = 5, DEADLINE = 600, N = 300, ATTACK_FROM = 300, BOTS = 20, timeline = false } = {}) {
    const rnd = MT(seed);
    const ip = (i) => (i < 110 ? "hostelA" : i < 220 ? "hostelB" : "ip" + i);
    const arrive = [];
    for (let i = 0; i < N; i++) arrive.push(DEADLINE - rnd.expovariate(1 / 90));
    const pending = new Map();
    const push = (t, i) => { if (!pending.has(t)) pending.set(t, []); pending.get(t).push(i); };
    arrive.forEach((t, i) => push(Math.max(0, Math.trunc(t)), i));
    let queue = [], qh = 0;                       // FIFO as array + head index
    const servedOk = new Set(), stamped = new Map();
    let attackServed = 0, legitServed = 0;
    const bucket = new Map();
    const drr = new Map();                        // insertion-ordered, like OrderedDict
    const tl = timeline ? [] : null;
    for (let t = 0; t <= DEADLINE; t++) {
      const fresh = [];
      for (const i of pending.get(t) || []) if (!servedOk.has(i)) fresh.push([t, i, ip(i), false]);
      pending.delete(t);
      if (t >= ATTACK_FROM) for (let k = 0; k < RATE; k++) fresh.push([t, "ATTACKER", "bot" + (k % BOTS), true]);
      if (policy === "per_ip") for (const b of bucket.keys()) bucket.set(b, Math.min(1, bucket.get(b) + 1));
      let refused = 0;
      for (const r of fresh) {
        if (policy === "per_ip") {
          if (!bucket.has(r[2])) bucket.set(r[2], 1);
          if (bucket.get(r[2]) >= 1) { bucket.set(r[2], bucket.get(r[2]) - 1); queue.push(r); }
          else if (!r[3]) { push(t + RETRY, r[1]); refused++; }
        } else if (policy === "fairdoor") {
          const id = r[1];
          if (!r[3] && !stamped.has(id)) stamped.set(id, t);
          if (!drr.has(id)) drr.set(id, []);
          const q = drr.get(id);
          if (q.length < 1) q.push(r);
        } else queue.push(r);
      }
      let sL = 0, sA = 0, timedOut = 0;
      for (let c = 0; c < CAP; c++) {
        let r;
        if (policy === "fairdoor") {
          if (!drr.size) break;
          const [id, q] = drr.entries().next().value;
          drr.delete(id);
          r = q.shift();
          if (q.length) drr.set(id, q);
        } else {
          while (qh < queue.length && t - queue[qh][0] > TIMEOUT) {
            const old = queue[qh++];
            if (!old[3]) { push(t + RETRY, old[1]); timedOut++; }
          }
          if (qh >= queue.length) break;
          r = queue[qh++];
        }
        if (r[3]) { attackServed++; sA++; } else { legitServed++; servedOk.add(r[1]); sL++; }
      }
      if (qh > 4096) { queue = queue.slice(qh); qh = 0; }
      if (tl) tl.push({ t, legit: sL, attack: sA, done: policy === "fairdoor" ? stamped.size : servedOk.size, waiting: policy === "fairdoor" ? drr.size : queue.length - qh, refused, timedOut });
    }
    const madeIt = policy === "fairdoor" ? stamped.size : servedOk.size;
    const total = attackServed + legitServed;
    return { policy, backlog: policy === "fairdoor" ? stamped.size - servedOk.size : 0, legit_ok: madeIt, legit_missed: N - madeIt,
      attacker_share: Math.round((attackServed / Math.max(total, 1)) * 1000) / 1000, timeline: tl };
  }

  function average(policy, runs, opts = {}) {
    const res = [];
    for (let s = 0; s < runs; s++) res.push(run(policy, { ...opts, seed: s }));
    const mean = (k) => res.reduce((a, r) => a + r[k], 0) / res.length;
    return { policy, missed: mean("legit_missed"), share: Math.round(mean("attacker_share") * 1000) / 1000, runs: res };
  }

  const api = { MT, run, average };
  if (typeof module !== "undefined") module.exports = api; else root.FairSim = api;
})(typeof self !== "undefined" ? self : this);
