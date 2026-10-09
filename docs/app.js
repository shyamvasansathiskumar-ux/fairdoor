/* FairDoor page logic: the clock, small diagrams, the stamp demo and the live simulation. */
(() => {
  const $ = (id) => document.getElementById(id);
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 23:58 and counting ---------- */
  const t0 = Date.now();
  function clock() {
    const s = (Math.floor((Date.now() - t0) / 1000) % 120) + 58 * 60 + 23 * 3600;
    const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    $("clock").textContent = [h, m, ss].map((v) => String(v).padStart(2, "0")).join(":");
  }
  clock(); setInterval(clock, 1000);

  /* ---------- problem diagrams ---------- */
  $("natDots").innerHTML = "<i></i>".repeat(110);
  $("botDots").innerHTML = "<i></i>".repeat(20);

  /* ---------- round-robin lanes ---------- */
  const lanes = [
    { id: "2025CSE0412", n: 1 }, { id: "2025CSE0177", n: 1 }, { id: "ATTACKER", n: 9, bot: true },
    { id: "2025ECE0031", n: 1 }, { id: "2025MEC0290", n: 1 },
  ];
  $("lanes").innerHTML = lanes.map((l) => `<div class="ln${l.bot ? " bot" : ""}"><span>${l.id}</span><div class="q">${"<i></i>".repeat(l.n)}</div></div>`).join("");
  const lnEls = [...$("lanes").querySelectorAll(".ln")];
  let turn = 0;
  if (!reduce) setInterval(() => { lnEls.forEach((e, i) => e.classList.toggle("turn", i === turn)); turn = (turn + 1) % lnEls.length; }, 700);
  else lnEls[0].classList.add("turn");

  /* ---------- flag log ---------- */
  const flags = [
    ["g", "23:58:02  2025CSE0412  served           turn 1 of 214"],
    ["r", "23:58:02  ATTACKER     queued, not served identity over fair share"],
    ["g", "23:58:03  2025ECE0031  stamped 23:58:03 server saturated"],
    ["r", "23:58:03  ATTACKER     dropped          one request already in flight"],
    ["g", "23:58:04  2025MEC0290  served           turn 1 of 215"],
    ["r", "23:58:05  2025CSE0412  refused          stamp replayed"],
    ["g", "00:02:41  2025ECE0031  accepted         stamp verifies, hash matches"],
  ];
  let fi = 0;
  const log = $("flaglog");
  function addFlag() {
    const [c, txt] = flags[fi++ % flags.length], d = document.createElement("div");
    d.className = c; d.textContent = txt; log.append(d);
    while (log.children.length > 7) log.firstChild.remove();
  }
  for (let i = 0; i < 6; i++) addFlag();
  if (!reduce) setInterval(addFlag, 1600);

  /* ---------- the stamp, for real ---------- */
  const enc = new TextEncoder();
  const hex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  let key, issued = null;
  crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]).then((k) => (key = k));
  const sha = async (s) => hex(await crypto.subtle.digest("SHA-256", enc.encode(s)));
  const msgOf = (student, time, h) => enc.encode(`${student}|${time}|${h}`);
  $("stIssue").addEventListener("click", async () => {
    const student = $("stStudent").value.trim(), time = $("stTime").value.trim(), body = $("stBody").value;
    const hms = /^([01]\d|2[0-3]):([0-5]\d):([0-5]\d)$/.exec(time);
    if (!hms) return msg("bad", "Arrival time should be a time of day like 23:59:41.");
    if (!student) return msg("bad", "Enter a student ID.");
    const h = await sha(body);
    const sig = hex(await crypto.subtle.sign("HMAC", key, msgOf(student, time, h)));
    issued = { student, time, h, sig };
    $("stOut").textContent = `${student} · ${time} · sha256:${h.slice(0, 16)}… · hmac:${sig.slice(0, 32)}…`;
    $("stampbox").hidden = false; $("stVerify").disabled = false; $("stEdit").disabled = false;
    msg("", `Stamp issued at ${time}. The deadline is 23:59:59. The browser will resubmit when the queue clears.`);
  });
  async function resubmit(body) {
    if (!issued) return;
    const h = await sha(body);
    const sig = new Uint8Array(issued.sig.match(/../g).map((x) => parseInt(x, 16)));
    const ok = await crypto.subtle.verify("HMAC", key, sig, msgOf(issued.student, issued.time, h));
    if (ok && issued.time <= "23:59:59") msg("ok", `ACCEPTED at 00:03:10 as on time: the stamp verifies and the submission still hashes to ${h.slice(0, 12)}…, arrival ${issued.time}.`);
    else msg("bad", `REFUSED: the submission now hashes to ${h.slice(0, 12)}…, not ${issued.h.slice(0, 12)}…. It was changed after the stamp, so the stamp no longer covers it.`);
  }
  $("stVerify").addEventListener("click", () => resubmit($("stBody").value));
  $("stEdit").addEventListener("click", () => {
    if (!$("stBody").value.endsWith(" (edited at 00:02)")) $("stBody").value += " (edited at 00:02)";
    resubmit($("stBody").value);
  });
  function msg(c, t) { $("stMsg").className = "msg " + c; $("stMsg").textContent = t; }

  /* ---------- simulation ---------- */
  const ctl = ["rate", "bots", "cap", "runs"], out = { rate: "vRate", bots: "vBots", cap: "vCap", runs: "vRuns" };
  ctl.forEach((c) => $(c).addEventListener("input", () => ($(out[c]).textContent = $(c).value)));
  const NAMES = { none: "No limiter", per_ip: "Per-IP limit", fairdoor: "FairDoor" };
  $("bars").innerHTML = ["none", "per_ip", "fairdoor"].map((p) => `<div class="bar-row ${p}"><span class="nm">${NAMES[p]}</span><div class="tr"><i class="fill"></i></div><span class="val">–</span></div>`).join("");
  let tlPolicy = "fairdoor";
  function opts() { return { RATE: +$("rate").value, BOTS: +$("bots").value, CAP: +$("cap").value }; }
  function runAll() {
    const o = opts(), runs = +$("runs").value;
    const t = performance.now();
    const res = ["none", "per_ip", "fairdoor"].map((p) => FairSim.average(p, runs, o));
    const max = Math.max(1, ...res.map((r) => r.missed));
    res.forEach((r) => {
      const row = document.querySelector(`.bar-row.${r.policy}`);
      row.querySelector(".fill").style.width = `${(r.missed / Math.max(max, 10)) * 100}%`;
      row.querySelector(".val").innerHTML = `${+r.missed.toFixed(1)} missed<small>flood got ${Math.round(r.share * 100)}%</small>`;
    });
    $("simMsg").className = "msg";
    $("simMsg").textContent = `${runs * 3} runs in ${Math.round(performance.now() - t)} ms, out of 300 students.`;
    drawTimeline();
    return res;
  }
  function drawTimeline() {
    const r = FairSim.run(tlPolicy, { ...opts(), seed: 0, timeline: true });
    const cv = $("tlc"), dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = 220;
    cv.width = W * dpr; cv.height = H * dpr;
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const css = getComputedStyle(document.documentElement);
    const INK = css.getPropertyValue("--ink").trim(), HOT = css.getPropertyValue("--hot").trim(), ACC = css.getPropertyValue("--acc").trim(), MUTE = css.getPropertyValue("--mute").trim(), LINE = "rgba(21,18,14,.12)";
    const pl = 34, pr = 34, pt = 10, pb = 26, cw = W - pl - pr, ch = H - pt - pb, n = r.timeline.length, cap = +$("cap").value;
    const bw = cw / n;
    g.font = "11px 'Geist Mono', monospace"; g.fillStyle = MUTE; g.strokeStyle = LINE; g.lineWidth = 1;
    for (let v = 0; v <= cap; v += Math.max(1, Math.ceil(cap / 4))) { const y = pt + ch - (v / cap) * ch; g.beginPath(); g.moveTo(pl, y); g.lineTo(pl + cw, y); g.stroke(); g.textAlign = "right"; g.fillText(v, pl - 8, y + 4); }
    g.textAlign = "center";
    [0, 120, 240, 360, 480, 600].forEach((s) => g.fillText(s === 600 ? "deadline" : `${s / 60}m`, pl + (s / 600) * cw, H - 8));
    r.timeline.forEach((d, i) => {
      const x = pl + i * bw, hl = (d.legit / cap) * ch, ha = (d.attack / cap) * ch;
      g.fillStyle = INK; g.fillRect(x, pt + ch - hl, Math.max(1, bw), hl);
      g.fillStyle = HOT; g.fillRect(x, pt + ch - hl - ha, Math.max(1, bw), ha);
    });
    g.strokeStyle = ACC; g.lineWidth = 2.2; g.beginPath();
    r.timeline.forEach((d, i) => { const x = pl + i * bw, y = pt + ch - (d.done / 300) * ch; i ? g.lineTo(x, y) : g.moveTo(x, y); });
    g.stroke();
    g.fillStyle = ACC; g.textAlign = "left";
    const last = r.timeline[n - 1];
    g.fillText(`${last.done}/300`, pl + cw + 4, pt + ch - (last.done / 300) * ch + 4);
  }
  document.querySelectorAll("#seg button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll("#seg button").forEach((x) => x.classList.toggle("on", x === b));
    tlPolicy = b.dataset.p; drawTimeline();
  }));
  $("simRun").addEventListener("click", () => {
    const b = $("simRun"); b.disabled = true; b.textContent = "Running…";
    setTimeout(() => { try { runAll(); } finally { b.disabled = false; b.textContent = "Run"; } }, 30);
  });
  $("simReset").addEventListener("click", () => {
    Object.entries({ rate: 60, bots: 20, cap: 4, runs: 10 }).forEach(([k, v]) => { $(k).value = v; $(out[k]).textContent = v; });
    runAll();
  });
  let rT; addEventListener("resize", () => { clearTimeout(rT); rT = setTimeout(drawTimeline, 150); });
  const first = runAll();
  window.__simCheck = first.map((r) => [r.policy, r.missed, r.share]);

  /* ---------- pinned horizontal ---------- */
  (function pin() {
    const sec = $("idea"), cards = $("cards");
    if (!window.gsap || !window.ScrollTrigger || reduce || innerWidth < 900) { sec.classList.add("no-pin"); return; }
    const dist = () => Math.max(0, cards.scrollWidth - innerWidth);
    gsap.to(cards, { x: () => -dist(), ease: "none",
      scrollTrigger: { trigger: "#hscroll", start: "top 12%", end: () => "+=" + dist(), pin: true, scrub: 0.8, invalidateOnRefresh: true, anticipatePin: 1 } });
  })();
})();
