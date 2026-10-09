// FairDoor's world: one door, three hundred students and a flood.
// Stage 0, the rush. Stage 1, per-IP limiting: two hostel crowds stall while the flood pours in.
// Stage 2 onward, FairDoor: one lane per identity, the flood confined to its own lane.
import { createWorld, THREE, smooth } from "./world.js";

const ACC = new THREE.Color("#12734a");
const INK = new THREE.Color("#15120e");
const HOT = new THREE.Color("#e2462c");
const GREEN = new THREE.Color("#2fa66a");

const DX = 3.4;           // the door's x position; people walk +x into it
const FLOOR = -1.6;

createWorld(document.getElementById("world"), async ({ scene, camera, mobile }) => {
  /* ---------- the door ---------- */
  const door = new THREE.Group();
  const frameMat = new THREE.MeshStandardMaterial({ color: INK, roughness: 0.55 });
  const H = 2.7, W = 1.5, T = 0.13;
  const postA = new THREE.Mesh(new THREE.BoxGeometry(T, H, T), frameMat);
  const postB = postA.clone();
  postA.position.set(0, FLOOR + H / 2, -W / 2); postB.position.set(0, FLOOR + H / 2, W / 2);
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(T, T, W + T), frameMat);
  lintel.position.set(0, FLOOR + H, 0);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, W), new THREE.MeshStandardMaterial({ color: ACC, roughness: 0.4 }));
  sill.position.set(0, FLOOR + 0.015, 0);
  [postA, postB, lintel, sill].forEach((m) => { m.castShadow = true; m.receiveShadow = true; door.add(m); });
  // the light in the doorway
  const glowMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uT: { value: 0 }, uC: { value: GREEN }, uA: { value: 0.55 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }",
    fragmentShader: "varying vec2 vUv; uniform float uT; uniform vec3 uC; uniform float uA; void main(){ float x = abs(vUv.x-.5)*2.; float y = vUv.y; float a = (1.-x*x) * smoothstep(1.,.0,y) * (.55+.08*sin(uT*1.7+y*6.)); gl_FragColor = vec4(uC, a*uA); }",
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(W - T, H - T), glowMat);
  glow.rotation.y = Math.PI / 2; glow.position.set(0, FLOOR + (H - T) / 2, 0);
  door.add(glow);
  door.position.x = DX;
  scene.add(door);

  /* ---------- people ---------- */
  const NS = mobile ? 180 : 300, NF = mobile ? 90 : 160;
  const sGeo = new THREE.SphereGeometry(0.058, 14, 10);
  const sMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
  const students = new THREE.InstancedMesh(sGeo, sMat, NS);
  students.castShadow = true;
  const fGeo = new THREE.BoxGeometry(0.085, 0.085, 0.085);
  const fMat = new THREE.MeshStandardMaterial({ color: HOT, roughness: 0.5 });
  const flood = new THREE.InstancedMesh(fGeo, fMat, NF);
  flood.castShadow = true;
  scene.add(students, flood);

  let seed = 7; const R = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const S = [], F = [];
  for (let i = 0; i < NS; i++) S.push({ u: R(), sp: 0.035 + R() * 0.03, lane: R() * 2 - 1.15, j: i % 12, hostel: i < NS * 0.37 ? 0 : i < NS * 0.73 ? 1 : 2, n: R() * 6.28, p: new THREE.Vector3(-10 + R() * 12, FLOOR + 0.058, (R() - 0.5) * 6), stamp: 0 });
  for (let i = 0; i < NF; i++) F.push({ u: R(), sp: 0.09 + R() * 0.07, bot: i % 20, n: R() * 6.28, p: new THREE.Vector3(-14, FLOOR + 0.055, 0), on: 0 });

  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), tgt = new THREE.Vector3(), col = new THREE.Color(), pos = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const X0 = -11, X1 = DX + 2.6;          // walk from X0, through the door at DX, fade out by X1
  const funnel = (x) => smooth(DX - 4.5, DX - 0.2, x);   // 0 far away → 1 in the doorway

  function studentTarget(s, st, k1, k2, t) {
    // k1: how much per-IP stalling (problem stage), k2: how much fair lanes (FairDoor stages)
    const x = THREE.MathUtils.lerp(X0, X1, s.u);
    const f = funnel(x);
    // rush: loose crowd funnelling into the door
    let z = s.lane * 2.6 * (1 - f) + s.lane * 0.45 * f + Math.sin(t * 0.7 + s.n) * 0.15 * (1 - f);
    let y = FLOOR + 0.058 + Math.abs(Math.sin(t * 6 + s.n)) * 0.03;
    let xx = x;
    // per-IP: hostel students bunch into two crowds held before the door
    if (k1 > 0 && s.hostel < 2) {
      const cz = s.hostel === 0 ? -2.0 : 0.6;
      const cx = DX - 2.8 + Math.sin(s.n * 3) * 0.9;
      const zz = cz + Math.cos(s.n * 5) * 0.7;
      xx = THREE.MathUtils.lerp(xx, Math.min(xx, cx), k1);
      z = THREE.MathUtils.lerp(z, zz, k1 * (x > cx - 2 ? 1 : 0.4));
    }
    // FairDoor: twelve tidy lanes converging on the doorway, evenly spaced
    if (k2 > 0) {
      const lz = (s.j - 7) * 0.3;
      const zl = lz * (1 - f) + lz * 0.12 * f;
      z = THREE.MathUtils.lerp(z, zl, k2);
      y = THREE.MathUtils.lerp(y, FLOOR + 0.058, k2);
    }
    return tgt.set(xx, y, z);
  }
  function floodTarget(b, k1, k2, t) {
    const x = THREE.MathUtils.lerp(X0 - 2, X1, b.u);
    const f = funnel(x);
    const bz = (b.bot - 12) * 0.2;
    let z = bz * (1 - f) + bz * 0.08 * f + Math.sin(t * 2 + b.n) * 0.06;
    let xx = x, y = FLOOR + 0.055 + Math.abs(Math.sin(t * 9 + b.n)) * 0.05;
    if (k2 > 0) {   // one identity, one lane: the flood waits in a single file at the far edge
      const lz = -3.4;
      z = THREE.MathUtils.lerp(z, lz * (1 - f) + 0 * f, k2);
      xx = THREE.MathUtils.lerp(xx, Math.min(xx, DX - 0.6 - (b.bot % 20) * 0.02), k2 * 0.6);
    }
    return tgt.set(xx, y, z);
  }

  const look = new THREE.Vector3();
  // camera keyframes per stage: [camX, camY, camZ, lookX, lookY, lookZ]
  const CAM = [
    [-0.4, 1.0, 11.0, 0.2, 0.8, -0.8],
    [-0.8, 1.6, 11.0, 0.0, 0.55, -0.8],
    [-1.8, 2.6, 10.6, -1.7, 0.35, -0.8],
    [0.6, 1.3, 10.6, 0.8, 0.6, -0.8],
    [-2.4, 5.2, 9.6, -2.0, -0.1, -1.0],
    [0.0, 0.9, 12.0, 0.0, 2.1, -1.0],
    [0.0, 0.9, 12.0, 0.0, 2.1, -1.0],
    [0.0, 0.9, 13.0, 0.4, 2.1, -1.0],
    [0.0, 1.0, 13.0, 0.4, 1.4, -1.0],
  ];
  const camAt = (stage) => {
    const i = Math.max(0, Math.min(CAM.length - 2, Math.floor(stage))), f = smooth(0.15, 0.85, stage - i);
    return CAM[i].map((v, j) => v + (CAM[i + 1][j] - v) * f);
  };

  return (st) => {
    const t = st.t, dt = st.dt;
    const k1 = smooth(0.55, 1.2, st.stage) * (1 - smooth(1.65, 2.3, st.stage));   // per-IP chapter
    const k2 = smooth(1.75, 2.45, st.stage);                                       // FairDoor chapters
    const floodOn = smooth(0.6, 1.2, st.stage);
    const offX = st.mobile ? -1.9 : 0;

    // students
    for (let i = 0; i < NS; i++) {
      const s = S[i];
      let speed = s.sp;
      if (k1 > 0 && s.hostel < 2) speed *= 1 - 0.85 * k1;           // throttled behind the shared IP
      if (k2 > 0) speed = THREE.MathUtils.lerp(speed, 0.045, k2);   // steady turns
      s.u += speed * dt;
      if (s.u > 1) { s.u -= 1; s.stamp = 0; s.p.x = X0; }
      studentTarget(s, st, k1, k2, t);
      s.p.lerp(tgt, 1 - Math.exp(-6 * dt));
      const x = s.p.x;
      const fade = 1 - smooth(DX + 0.6, X1, x);
      const enter = smooth(X0, X0 + 1.2, x);
      if (k2 > 0.5 && x > DX - 1.6) s.stamp = Math.min(1, s.stamp + dt * 3);
      sc.setScalar(Math.max(0.0001, fade * enter));
      m4.compose(pos.set(x + offX, s.p.y, s.p.z), q, sc);
      students.setMatrixAt(i, m4);
      students.setColorAt(i, col.copy(INK).lerp(GREEN, s.stamp * k2));
    }
    students.instanceMatrix.needsUpdate = true; students.instanceColor.needsUpdate = true;

    // flood
    for (let i = 0; i < NF; i++) {
      const b = F[i];
      let speed = b.sp * (1 - 0.8 * k2);
      b.u += speed * dt;
      if (b.u > 1) { b.u -= 1; b.p.x = X0 - 2; }
      floodTarget(b, k1, k2, t);
      b.p.lerp(tgt, 1 - Math.exp(-7 * dt));
      const fade = 1 - smooth(DX + 0.6, X1, b.p.x);
      const s = Math.max(0.0001, floodOn * fade * smooth(X0 - 2, X0 - 0.5, b.p.x));
      sc.setScalar(s);
      q.setFromAxisAngle(UP, t * 2 + b.n); sc.setScalar(s);
      m4.compose(pos.set(b.p.x + offX, b.p.y, b.p.z), q, sc);
      flood.setMatrixAt(i, m4);
    }
    q.identity();
    flood.instanceMatrix.needsUpdate = true;

    door.position.x = DX + offX;
    glowMat.uniforms.uT.value = t;
    glowMat.uniforms.uC.value.copy(GREEN).lerp(HOT, k1 * 0.8);

    const c = camAt(st.stage);
    const mz = st.mobile ? 6 : 0;
    camera.position.set(c[0] + st.px * 0.4, c[1] - st.py * 0.25, c[2] + mz);
    look.set(c[3], c[4], c[5]);
    camera.lookAt(look);
  };
}, { bg: "#e8e1d3", fog: [11, 34] });
