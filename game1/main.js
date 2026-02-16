// ========================================
// NEURAL ASCENSION - メインゲームロジック（v2 リデザイン版）
// ========================================

"use strict";

// ========================================
// 定数定義
// ========================================

const TICK_INTERVAL_MS = 100;
const SAVE_INTERVAL_MS = 5000;
const SAVE_KEY = "neuralAscension_save";
const CHECKPOINT_KEY = "neuralAscension_checkpoint";
const DEBUG_KEY_COUNT = 5;
const DEBUG_KEY_TIMEOUT_MS = 1500;

// ========================================
// グローバル変数
// ========================================

const audioManager = new AudioManager();
let intensityTickCounter = 0;
let gameData = null;
let gameState = null;
let stageIndexMap = {};
let tickIntervalId = null;
let saveIntervalId = null;
let autoAccumulator = 0n;
let gameSpeed = 1;
let debugMode = false;
let dKeyCount = 0;
let dKeyTimer = null;
let cycleEffectFired = false;
let stageCheckpoint = null;
let currentTab = "enhance";

const BPM = 128;
const BEAT_INTERVAL_MS = 60000 / BPM;
let beatEnergy = 0;
let lastBeatTime = 0;

// ========================================
// シナプスアニメーション
// ========================================

const SYNAPSE_STAGE_PARAMS = [
  { particles: 18, speed: 0.3, connectDist: 70,  particleSize: 1.5, glowSize: 4,  trailLength: 0,   pulseRings: 1, bgAlpha: 0.15 },
  { particles: 25, speed: 0.4, connectDist: 75,  particleSize: 1.6, glowSize: 4,  trailLength: 0,   pulseRings: 1, bgAlpha: 0.15 },
  { particles: 32, speed: 0.45, connectDist: 80,  particleSize: 1.7, glowSize: 5,  trailLength: 0.1, pulseRings: 1, bgAlpha: 0.14 },
  { particles: 40, speed: 0.55, connectDist: 85,  particleSize: 1.8, glowSize: 5,  trailLength: 0.2, pulseRings: 2, bgAlpha: 0.13 },
  { particles: 50, speed: 0.7, connectDist: 90,  particleSize: 1.9, glowSize: 6,  trailLength: 0.3, pulseRings: 2, bgAlpha: 0.12 },
  { particles: 60, speed: 0.85, connectDist: 95,  particleSize: 2.0, glowSize: 7,  trailLength: 0.35, pulseRings: 2, bgAlpha: 0.11 },
  { particles: 70, speed: 1.0, connectDist: 100, particleSize: 2.1, glowSize: 8,  trailLength: 0.4, pulseRings: 3, bgAlpha: 0.10 },
  { particles: 80, speed: 1.1, connectDist: 110, particleSize: 2.2, glowSize: 9,  trailLength: 0.45, pulseRings: 3, bgAlpha: 0.09 },
];

const synapseState = {
  canvas: null, ctx: null, particles: [], pulseWaves: [],
  emitParticles: [], matrixDrops: [], animFrameId: null,
  currentParams: SYNAPSE_STAGE_PARAMS[0],
  orbitalNodes: [],       // 落下中のノード
  orbitalSpawnRate: 0,    // auto購入数に応じたスポーン間隔(秒)
  orbitalSpawnBatch: 0,   // 1回のスポーンで発射する数
  orbitalSpawnTimer: 0,   // スポーン用タイマー
  orbitalSparks: [],      // 着弾パーティクル
  coreWaveRings: [], // クリック時のボタン波紋
};

function createParticle(w, h, x, y) {
  const angle = Math.random() * Math.PI * 2;
  const speed = synapseState.currentParams.speed;
  return {
    x: x !== undefined ? x : Math.random() * w,
    y: y !== undefined ? y : Math.random() * h,
    vx: Math.cos(angle) * speed * (0.5 + Math.random()),
    vy: Math.sin(angle) * speed * (0.5 + Math.random()),
    size: synapseState.currentParams.particleSize * (0.6 + Math.random() * 0.8),
    phase: Math.random() * Math.PI * 2,
    life: 1.0,
    isBurst: false,
  };
}

function initSynapseAnimation() {
  const canvas = document.getElementById("synapse-canvas");
  if (!canvas) return;
  synapseState.canvas = canvas;
  synapseState.ctx = canvas.getContext("2d");
  updateSynapseParams();
  resizeSynapseCanvas();
  window.addEventListener("resize", resizeSynapseCanvas);
  respawnParticles();
  synapseAnimationLoop();
}

function resizeSynapseCanvas() {
  const panel = document.getElementById("left-panel");
  if (!panel || !synapseState.canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = panel.getBoundingClientRect();
  synapseState.canvas.width = rect.width * dpr;
  synapseState.canvas.height = rect.height * dpr;
  synapseState.ctx.scale(dpr, dpr);
}

function getUpgradeVisualBonus() {
  const bonus = { particles: 0, connectDist: 0 };
  if (!gameState || !gameData) return bonus;

  let autoOwned = 0;
  for (const upgrade of gameData.upgrades) {
    const owned = gameState.upgrades[upgrade.id] || 0;
    if (upgrade.type === "auto") autoOwned += owned;
  }

  // auto系: パーティクルが増え接続が密に
  bonus.particles = Math.min(Math.floor(autoOwned / 2), 40);
  bonus.connectDist = Math.min(autoOwned * 0.5, 30);

  return bonus;
}

function getMultiplierUpgradeCount() {
  if (!gameState || !gameData) return 0;
  let count = 0;
  for (const upgrade of gameData.upgrades) {
    if (upgrade.type === "multiplier") count += (gameState.upgrades[upgrade.id] || 0);
  }
  return count;
}

function getClickUpgradeCount() {
  if (!gameState || !gameData) return 0;
  let count = 0;
  for (const upgrade of gameData.upgrades) {
    if (upgrade.type === "click") count += (gameState.upgrades[upgrade.id] || 0);
  }
  return count;
}

function updateSynapseParams() {
  const idx = gameState ? gameState.currentStageIndex : 0;
  const base = SYNAPSE_STAGE_PARAMS[Math.min(idx, SYNAPSE_STAGE_PARAMS.length - 1)];
  const bonus = getUpgradeVisualBonus();
  synapseState.currentParams = {
    particles: base.particles + bonus.particles,
    speed: base.speed,
    connectDist: base.connectDist + bonus.connectDist,
    particleSize: base.particleSize,
    glowSize: base.glowSize,
    trailLength: base.trailLength,
    pulseRings: base.pulseRings,
    bgAlpha: base.bgAlpha,
  };
}

function respawnParticles() {
  const canvas = synapseState.canvas;
  if (!canvas) return;
  const w = canvas.width / (window.devicePixelRatio || 1);
  const h = canvas.height / (window.devicePixelRatio || 1);
  const target = synapseState.currentParams.particles;
  while (synapseState.particles.length < target) synapseState.particles.push(createParticle(w, h));
  if (synapseState.particles.length > target) synapseState.particles.length = target;
}

function rebuildOrbitalNodes() {
  if (!gameState || !gameData) {
    synapseState.orbitalNodes = [];
    synapseState.orbitalSpawnRate = 0;
    synapseState.orbitalSparks = [];
    return;
  }

  let autoOwned = 0;
  for (const upgrade of gameData.upgrades) {
    if (upgrade.type === "auto") autoOwned += (gameState.upgrades[upgrade.id] || 0);
  }

  // 購入数に応じてスポーン間隔を短く＆1回の発射数を増やす
  if (autoOwned > 0) {
    synapseState.orbitalSpawnRate = Math.max(0.15, 1.2 - autoOwned * 0.05);
    synapseState.orbitalSpawnBatch = 1 + Math.floor(autoOwned / 4); // 4個購入ごとに+1発
  } else {
    synapseState.orbitalSpawnRate = 0;
    synapseState.orbitalSpawnBatch = 0;
    synapseState.orbitalNodes = [];
    synapseState.orbitalSparks = [];
  }
}

function synapseBurst(canvasX, canvasY) {
  const params = synapseState.currentParams;
  const burstCount = 5 + params.pulseRings * 3;
  const w = synapseState.canvas.width / (window.devicePixelRatio || 1);
  const h = synapseState.canvas.height / (window.devicePixelRatio || 1);
  for (let i = 0; i < burstCount; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = params.speed * (2 + Math.random() * 3);
    const p = createParticle(w, h, canvasX, canvasY);
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.isBurst = true;
    p.life = 1.0;
    p.size = params.particleSize * (1.0 + Math.random());
    synapseState.particles.push(p);
  }
  for (let i = 0; i < params.pulseRings; i++) {
    synapseState.pulseWaves.push({ x: canvasX, y: canvasY, radius: 5, maxRadius: 60 + i * 30, alpha: 0.6 });
  }
}

function synapseAnimationLoop() {
  const { canvas, ctx, particles, pulseWaves, currentParams } = synapseState;
  if (!canvas || !ctx) return;

  const now = performance.now();
  if (now - lastBeatTime >= BEAT_INTERVAL_MS) {
    lastBeatTime = now - ((now - lastBeatTime) % BEAT_INTERVAL_MS);
    beatEnergy = 1.0;
  } else {
    beatEnergy *= 0.92;
    if (beatEnergy < 0.01) beatEnergy = 0;
  }

  const anyBuffActive = gameState &&
    (gameState.inspirationBuffPct !== 100 || gameState.overclockBuffPct !== 100);
  const effectiveBeat = anyBuffActive ? Math.min(beatEnergy * 1.8, 1.0) : beatEnergy;
  const beatScale = 1 + effectiveBeat * 0.22;
  document.documentElement.style.setProperty("--beat-scale", String(beatScale));

  // 脳背景画像のBPM同期 + 色相シフト
  const brainBg = document.getElementById("brain-bg");
  if (brainBg) {
    const brainBase = parseFloat(brainBg.style.getPropertyValue("--brain-scale")) || 0.7;
    const brainBeatScale = brainBase * (1 + effectiveBeat * 0.05);
    const brainOpacity = 0.35 + effectiveBeat * 0.12;
    // 60秒で1周する緩やかな色相回転（img要素に直接適用）
    const hueShift = (now / 1000 * 6) % 360;
    brainBg.style.transform = `translate(-50%, -50%) scale(${brainBeatScale})`;
    brainBg.style.opacity = brainOpacity;
    const brainImg = brainBg.querySelector("img");
    if (brainImg) brainImg.style.filter = `saturate(0.9) brightness(0.9) hue-rotate(${hueShift}deg)`;
  }

  const dpr = window.devicePixelRatio || 1;
  const w = canvas.width / dpr;
  const h = canvas.height / dpr;

  ctx.fillStyle = `rgba(10, 10, 15, ${currentParams.bgAlpha})`;
  ctx.fillRect(0, 0, w, h);

  const accent = getComputedStyle(document.body).getPropertyValue("--accent").trim() || "#00d4ff";
  const time = performance.now() * 0.001;

  // 好奇心(multiplier)購入数に応じた漂流加速係数（1.0〜3.0）
  const mulCount = getMultiplierUpgradeCount();
  const driftAccel = 1.0 + Math.min(mulCount * 0.08, 2.0);

  // マトリックスレイン
  const { matrixDrops } = synapseState;
  const dropRate = 1 + Math.floor(currentParams.particles / 20);
  for (let di = 0; di < dropRate; di++) {
    if (matrixDrops.length < 300) {
      matrixDrops.push({ x: Math.random() * w, y: -Math.random() * 20, speed: 0.5 + Math.random() * 1.5, size: 0.3 + Math.random() * 0.5, alpha: 0.08 + Math.random() * 0.15, tailLen: 3 + Math.random() * 12 });
    }
  }
  for (let i = matrixDrops.length - 1; i >= 0; i--) {
    const d = matrixDrops[i];
    d.y += d.speed * driftAccel;
    if (d.y > h + d.tailLen) { matrixDrops.splice(i, 1); continue; }
    ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x, d.y - d.tailLen);
    const tailGrad = ctx.createLinearGradient(d.x, d.y, d.x, d.y - d.tailLen);
    tailGrad.addColorStop(0, withAlpha(accent, d.alpha * 0.6));
    tailGrad.addColorStop(1, withAlpha(accent, 0));
    ctx.strokeStyle = tailGrad; ctx.lineWidth = d.size; ctx.stroke();
    ctx.beginPath(); ctx.arc(d.x, d.y, d.size * 0.8, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(accent, d.alpha); ctx.fill();
  }

  // パーティクル
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx * driftAccel; p.y += p.vy * driftAccel;
    if (p.isBurst) {
      p.life -= 0.02; p.vx *= 0.97; p.vy *= 0.97;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
    }
    if (!p.isBurst) {
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      p.x = Math.max(0, Math.min(w, p.x)); p.y = Math.max(0, Math.min(h, p.y));
    }
    const flicker = 0.6 + 0.4 * Math.sin(time * 2 + p.phase);
    const alpha = (p.isBurst ? p.life : 1.0) * flicker;
    const glowSize = currentParams.glowSize * (p.isBurst ? p.life * 1.5 : 1.0) * (1 + effectiveBeat * 0.8);
    const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
    gradient.addColorStop(0, withAlpha(accent, alpha * 0.5));
    gradient.addColorStop(1, withAlpha(accent, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(p.x - glowSize, p.y - glowSize, glowSize * 2, glowSize * 2);
    const coreSize = p.size * (1 + effectiveBeat * 0.7);
    ctx.beginPath(); ctx.arc(p.x, p.y, coreSize, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(accent, alpha * 0.9); ctx.fill();
  }

  // 接続線
  const dist = currentParams.connectDist;
  const dist2 = dist * dist;
  const normalParticles = particles.filter(p => !p.isBurst);
  for (let i = 0; i < normalParticles.length; i++) {
    for (let j = i + 1; j < normalParticles.length; j++) {
      const a = normalParticles[i], b = normalParticles[j];
      const dx = a.x - b.x, dy = a.y - b.y, d2 = dx * dx + dy * dy;
      if (d2 < dist2) {
        const proximity = 1 - Math.sqrt(d2) / dist;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
        ctx.strokeStyle = withAlpha(accent, proximity * 0.3);
        ctx.lineWidth = proximity * 1.5; ctx.stroke();
      }
    }
  }

  // 波紋
  for (let i = pulseWaves.length - 1; i >= 0; i--) {
    const wave = pulseWaves[i];
    wave.radius += 2.5; wave.alpha *= 0.95;
    ctx.beginPath(); ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
    ctx.strokeStyle = withAlpha(accent, wave.alpha); ctx.lineWidth = 1.5; ctx.stroke();
    if (wave.alpha < 0.01 || wave.radius > wave.maxRadius) pulseWaves.splice(i, 1);
  }

  // 隕石ノード（Meteor Nodes — 外側から中心へ落下）
  const brainCoreForOrbit = document.getElementById("brain-core");
  if (brainCoreForOrbit && canvas) {
    const orbitCoreRect = brainCoreForOrbit.getBoundingClientRect();
    const orbitCanvasRect = canvas.getBoundingClientRect();
    const cx = orbitCoreRect.left + orbitCoreRect.width / 2 - orbitCanvasRect.left;
    const cy = orbitCoreRect.top + orbitCoreRect.height / 2 - orbitCanvasRect.top;

    // スポーン処理（購入数が多いほど大量に降り注ぐ）
    if (synapseState.orbitalSpawnRate > 0) {
      synapseState.orbitalSpawnTimer -= 1 / 60;
      if (synapseState.orbitalSpawnTimer <= 0) {
        synapseState.orbitalSpawnTimer = synapseState.orbitalSpawnRate;
        const batch = synapseState.orbitalSpawnBatch || 1;
        for (let b = 0; b < batch; b++) {
          const angle = Math.random() * Math.PI * 2;
          const dist = 80 + Math.random() * 80;
          const speed = 0.6 + Math.random() * 1.2;
          synapseState.orbitalNodes.push({
            x: cx + Math.cos(angle) * dist,
            y: cy + Math.sin(angle) * dist,
            speed,
            size: 1.5 + Math.random() * 1.5,
            trail: [],
          });
        }
      }
    }
    // 同時飛行数の上限（パフォーマンス）
    if (synapseState.orbitalNodes.length > 80) synapseState.orbitalNodes.splice(0, synapseState.orbitalNodes.length - 80);

    const TRAIL_MAX = 20;
    const meteorColor = (gameState && gameState.overclockBuffPct !== 100) ? "#ff3333" : accent;

    // 落下中ノードの更新・描画
    for (let i = synapseState.orbitalNodes.length - 1; i >= 0; i--) {
      const node = synapseState.orbitalNodes[i];
      const dx = cx - node.x, dy = cy - node.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // 中心に到達 → パーティクル化して消滅
      if (dist < 5) {
        synapseState.orbitalNodes.splice(i, 1);
        // 着弾スパーク
        for (let s = 0; s < 6; s++) {
          const sa = Math.random() * Math.PI * 2;
          const sv = 0.8 + Math.random() * 1.5;
          synapseState.orbitalSparks.push({
            x: cx, y: cy,
            vx: Math.cos(sa) * sv, vy: Math.sin(sa) * sv,
            life: 1.0, size: 1.0 + Math.random() * 0.8,
          });
        }
        continue;
      }

      // 中心へ向かって加速（近いほど速い）
      const accel = 1 + 30 / dist;
      const nx = dx / dist, ny_dir = dy / dist;
      node.x += nx * node.speed * accel;
      node.y += ny_dir * node.speed * accel;

      // 軌跡を記録
      node.trail.push({ x: node.x, y: node.y });
      if (node.trail.length > TRAIL_MAX) node.trail.shift();

      // 軌跡描画（尾を引く）
      if (node.trail.length > 1) {
        for (let t = 1; t < node.trail.length; t++) {
          const prev = node.trail[t - 1], curr = node.trail[t];
          const progress = t / node.trail.length;
          ctx.beginPath();
          ctx.moveTo(prev.x, prev.y);
          ctx.lineTo(curr.x, curr.y);
          ctx.strokeStyle = withAlpha(meteorColor, progress * 0.35);
          ctx.lineWidth = node.size * progress * 0.7;
          ctx.stroke();
        }
      }

      // グロー
      const glowR = node.size * 3;
      const nodeGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, glowR);
      nodeGrad.addColorStop(0, withAlpha(meteorColor, 0.6));
      nodeGrad.addColorStop(0.4, withAlpha(meteorColor, 0.15));
      nodeGrad.addColorStop(1, withAlpha(meteorColor, 0));
      ctx.fillStyle = nodeGrad;
      ctx.fillRect(node.x - glowR, node.y - glowR, glowR * 2, glowR * 2);

      // 光点コア
      const coreGrad = ctx.createRadialGradient(node.x, node.y, 0, node.x, node.y, node.size);
      coreGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
      coreGrad.addColorStop(1, withAlpha(meteorColor, 0.9));
      ctx.beginPath();
      ctx.arc(node.x, node.y, node.size, 0, Math.PI * 2);
      ctx.fillStyle = coreGrad;
      ctx.fill();
    }

    // 着弾スパーク描画
    for (let i = synapseState.orbitalSparks.length - 1; i >= 0; i--) {
      const sp = synapseState.orbitalSparks[i];
      sp.x += sp.vx; sp.y += sp.vy;
      sp.vx *= 0.94; sp.vy *= 0.94;
      sp.life -= 0.04;
      if (sp.life <= 0) { synapseState.orbitalSparks.splice(i, 1); continue; }
      const spSize = sp.size * sp.life;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, spSize, 0, Math.PI * 2);
      ctx.fillStyle = withAlpha(meteorColor, sp.life * 0.8);
      ctx.fill();
    }
    // パーティクル上限
    if (synapseState.orbitalSparks.length > 200) synapseState.orbitalSparks.splice(0, synapseState.orbitalSparks.length - 200);
  }

  // クリック波紋リング（ボタン外縁が波打つエフェクト）
  const waveColor = (gameState && gameState.overclockBuffPct !== 100) ? "#ff3333" : accent;
  for (let i = synapseState.coreWaveRings.length - 1; i >= 0; i--) {
    const ring = synapseState.coreWaveRings[i];
    ring.life -= 0.02;
    ring.phase += ring.phaseSpeed;
    ring.noiseTime += 0.08;
    if (ring.life <= 0) { synapseState.coreWaveRings.splice(i, 1); continue; }

    const lifeEase = ring.life * ring.life;
    ctx.beginPath();
    for (let s = 0; s <= ring.segments; s++) {
      const theta = (Math.PI * 2 / ring.segments) * s;
      const smoothWave = Math.sin(theta * 3 + ring.phase) * ring.amplitude * lifeEase;
      const noiseIdx = s % ring.noiseOffsets.length;
      const noise = Math.sin(ring.noiseTime * 3 + ring.noiseOffsets[noiseIdx]) * ring.noiseAmp * lifeEase;
      const r = ring.baseRadius + smoothWave + noise;
      const px = ring.cx + Math.cos(theta) * r;
      const py = ring.cy + Math.sin(theta) * r;
      if (s === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = withAlpha(waveColor, lifeEase * 0.8);
    ctx.lineWidth = 1.2 + lifeEase * 1.3;
    ctx.stroke();
  }

  // ボタン外縁放射（ひらめき or OverClock 発動中のみ）
  const brainCore = document.getElementById("brain-core");
  const { emitParticles } = synapseState;
  const isInspActive = gameState && gameState.inspirationBuffPct !== 100;
  const isOcActive = gameState && gameState.overclockBuffPct !== 100;
  const bothActive = isInspActive && isOcActive;
  const intensityMul = bothActive ? 2 : 1;
  if (brainCore && canvas && (isInspActive || isOcActive)) {
    const coreRect = brainCore.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    const coreCx = coreRect.left + coreRect.width / 2 - canvasRect.left;
    const coreCy = coreRect.top + coreRect.height / 2 - canvasRect.top;
    const coreRadius = coreRect.width / 2;
    const emitRate = (2 + Math.floor(currentParams.particles / 12)) * intensityMul;
    const emitThisFrame = beatEnergy > 0.8 ? emitRate * 4 : emitRate;
    for (let i = 0; i < emitThisFrame; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spawnR = coreRadius * (0.9 + Math.random() * 0.3);
      const speed = currentParams.speed * (1.8 + Math.random() * 2.5) * intensityMul;
      const size = (0.3 + Math.random() * 0.7) * intensityMul;
      emitParticles.push({ x: coreCx + Math.cos(angle) * spawnR, y: coreCy + Math.sin(angle) * spawnR, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, size, life: 0.5 + Math.random() * 0.5, isOc: isOcActive });
    }
  }
  for (let i = emitParticles.length - 1; i >= 0; i--) {
    const ep = emitParticles[i];
    ep.x += ep.vx; ep.y += ep.vy; ep.life -= 0.015; ep.vx *= 0.985; ep.vy *= 0.985;
    if (ep.life <= 0 || ep.x < -10 || ep.x > w + 10 || ep.y < -10 || ep.y > h + 10) { emitParticles.splice(i, 1); continue; }
    const epColor = ep.isOc ? "#ff3333" : accent;
    const epSize = ep.size * (1 + effectiveBeat * 0.6);
    const epAlpha = ep.life * 0.7;
    const epGlow = epSize * 3;
    const epGrad = ctx.createRadialGradient(ep.x, ep.y, 0, ep.x, ep.y, epGlow);
    epGrad.addColorStop(0, withAlpha(epColor, epAlpha * 0.4));
    epGrad.addColorStop(1, withAlpha(epColor, 0));
    ctx.fillStyle = epGrad; ctx.fillRect(ep.x - epGlow, ep.y - epGlow, epGlow * 2, epGlow * 2);
    ctx.beginPath(); ctx.arc(ep.x, ep.y, epSize, 0, Math.PI * 2);
    ctx.fillStyle = withAlpha(epColor, epAlpha); ctx.fill();
  }
  const emitCap = bothActive ? 1000 : 500;
  if (emitParticles.length > emitCap) emitParticles.splice(0, emitParticles.length - emitCap);

  synapseState.animFrameId = requestAnimationFrame(synapseAnimationLoop);
}

function withAlpha(hex, alpha) {
  let r = 0, g = 0, b = 0;
  if (hex.length === 4) { r = parseInt(hex[1]+hex[1],16); g = parseInt(hex[2]+hex[2],16); b = parseInt(hex[3]+hex[3],16); }
  else if (hex.length === 7) { r = parseInt(hex.substring(1,3),16); g = parseInt(hex.substring(3,5),16); b = parseInt(hex.substring(5,7),16); }
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, alpha))})`;
}

function lerpColor(hex1, hex2, t) {
  const parse = (h) => [parseInt(h.substring(1,3),16), parseInt(h.substring(3,5),16), parseInt(h.substring(5,7),16)];
  const expand = (h) => h.length === 4 ? "#"+h[1]+h[1]+h[2]+h[2]+h[3]+h[3] : h;
  const c1 = parse(expand(hex1)), c2 = parse(expand(hex2));
  const r = Math.round(c1[0]+(c2[0]-c1[0])*t), g = Math.round(c1[1]+(c2[1]-c1[1])*t), b = Math.round(c1[2]+(c2[2]-c1[2])*t);
  return `#${r.toString(16).padStart(2,"0")}${g.toString(16).padStart(2,"0")}${b.toString(16).padStart(2,"0")}`;
}

// ========================================
// BigInt ユーティリティ
// ========================================

function bigIntPow(base, exp) {
  if (exp === 0n) return 1n;
  let result = 1n, b = base, e = exp;
  while (e > 0n) { if (e % 2n === 1n) result *= b; b *= b; e /= 2n; }
  return result;
}

function bigIntCeilDiv(numerator, denominator) {
  if (denominator === 0n) throw new Error("0除算エラー");
  if (numerator === 0n) return 0n;
  return (numerator + denominator - 1n) / denominator;
}

// ========================================
// 数値フォーマット（日本語単位）
// ========================================

const JP_UNITS = [
  { threshold: 10000000000000000000000000n, suffix: "秭", divisor: 10000000000000000000000000n },
  { threshold: 100000000000000000000n, suffix: "垓", divisor: 100000000000000000000n },
  { threshold: 10000000000000000n, suffix: "京", divisor: 10000000000000000n },
  { threshold: 1000000000000n, suffix: "兆", divisor: 1000000000000n },
  { threshold: 100000000n, suffix: "億", divisor: 100000000n },
  { threshold: 10000n, suffix: "万", divisor: 10000n },
];

function formatBigInt(n) {
  if (n < 0n) return "-" + formatBigInt(-n);
  if (n < 10000n) {
    const str = n.toString();
    let result = "";
    for (let i = 0; i < str.length; i++) {
      if (i > 0 && (str.length - i) % 3 === 0) result += ",";
      result += str[i];
    }
    return result;
  }

  // 最大の適合単位を見つける
  for (const unit of JP_UNITS) {
    if (n >= unit.threshold) {
      const upper = n / unit.divisor;
      const remainder = n % unit.divisor;

      // 上位部分をフォーマット（再帰的に日本語単位適用）
      const upperStr = formatBigInt(upper);

      // 下位部分: 次の単位未満の端数を表示
      if (remainder === 0n) {
        return upperStr + unit.suffix;
      }

      // 次の下位単位を見つける
      const currentIdx = JP_UNITS.indexOf(unit);
      let lowerStr = "";
      if (currentIdx < JP_UNITS.length - 1) {
        // 下位部分を再帰フォーマット
        const lowerFormatted = formatBigInt(remainder);
        if (lowerFormatted !== "0") {
          lowerStr = lowerFormatted;
        }
      } else {
        // 万の下位は普通の数字
        if (remainder > 0n) {
          lowerStr = addCommas(remainder.toString());
        }
      }

      return upperStr + unit.suffix + lowerStr;
    }
  }

  return addCommas(n.toString());
}

function addCommas(str) {
  let result = "";
  for (let i = 0; i < str.length; i++) {
    if (i > 0 && (str.length - i) % 3 === 0) result += ",";
    result += str[i];
  }
  return result;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) { const m = Math.floor(seconds / 60); const s = seconds % 60; return `${m}分${s}秒`; }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}時間${m}分`;
}

// ========================================
// ゲーム状態の初期化
// ========================================

function createInitialState() {
  return {
    neurons: 0n,
    totalNeurons: 0n,
    stageNeurons: 0n,
    neuronsPerClick: 1n,
    neuronsPerSecond: 0n,
    currentStageIndex: 0,
    upgrades: {},
    abilityUpgrades: {},
    overclockBuffPct: 100,
    overclockBuffEndTime: 0,
    overclockBuffPurchaseCount: 0,
    inspirationBuffPct: 100,
    inspirationEndTime: 0,
    inspirationCooldownEnd: 0,
    shownEvolutionStages: [],
    endingSeen: false,
    cycleCount: 1,
    lastSaved: Date.now(),
    // 統計用フィールド
    totalClicks: 0,
    totalInspirationCount: 0,
    totalNeuronsAllTime: 0n,
    playStartTime: Date.now(),
  };
}

// ========================================
// サイクル関連ヘルパー
// ========================================

function getCyclePermanentMul() {
  const cfg = gameData && gameData.config && gameData.config.cycleSystem;
  const base = (cfg && cfg.permanentMultiplierBase) || 0.6;
  return GameLogic.getCyclePermanentMultiplier(gameState.cycleCount, base);
}

function getStageThreshold(stageIndex) {
  const cfg = gameData.config;
  let baseThreshold;
  if (cfg && cfg.stageThreshold && cfg.stageThreshold[stageIndex] != null) {
    baseThreshold = BigInt(cfg.stageThreshold[stageIndex]);
  } else {
    baseThreshold = BigInt(gameData.stages[stageIndex].requiredTotalNeurons);
  }
  if (baseThreshold === 0n) return 0n;

  const cycleCfg = cfg && cfg.cycleSystem;
  return GameLogic.getCycleScaledThreshold(
    baseThreshold,
    gameState.cycleCount,
    (cycleCfg && cycleCfg.permanentMultiplierBase) || 0.6,
    (cycleCfg && cycleCfg.thresholdGrowthBase) || 1.1
  );
}

// ========================================
// 1個あたりの効果を小数で計算（表示用）
// ========================================

function getPerUnitEffect(upgradeType) {
  // 能力アップグレードによる強化倍率を通常のNumber（小数）で計算
  let enhNum = 1, enhDen = 1;
  if (gameData.abilityUpgrades) {
    for (const ab of gameData.abilityUpgrades) {
      if (!gameState.abilityUpgrades[ab.id]) continue;
      if (ab.target === upgradeType) {
        enhNum *= ab.multiplier; // 125
        enhDen *= 100;
      }
    }
  }
  return enhNum / enhDen; // 例: 1.25, 1.5625, ...
}

function formatPerUnit(value) {
  // 整数ならそのまま、小数なら小数点以下2桁
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

function simulateUpgradePurchase(upgrade) {
  const id = upgrade.id;
  const curClickRaw = getEffectiveClick();
  const curNpsRaw = getEffectiveNps();
  const prev = gameState.upgrades[id] || 0;
  gameState.upgrades[id] = prev + 1;
  recalculateProduction();
  const nextClickRaw = getEffectiveClick();
  const nextNpsRaw = getEffectiveNps();
  gameState.upgrades[id] = prev;
  recalculateProduction();
  return {
    clickBefore: formatBigInt(curClickRaw), click: formatBigInt(nextClickRaw),
    npsBefore: formatBigInt(curNpsRaw), nps: formatBigInt(nextNpsRaw),
    clickPct: formatIncreasePct(curClickRaw, nextClickRaw),
    npsPct: formatIncreasePct(curNpsRaw, nextNpsRaw),
  };
}

function formatIncreasePct(before, after) {
  if (before <= 0n) return "+0%";
  const diff = after - before;
  // diff * 10000 / before で小数2桁相当（百分率×100）
  const basisPoints = diff * 10000n / before;
  const intPart = basisPoints / 100n;
  const fracPart = basisPoints % 100n;
  if (basisPoints === 0n) return "+0%";
  const fracAbs = fracPart < 0n ? -fracPart : fracPart;
  return `+${intPart}.${String(fracAbs).padStart(2, "0")}%`;
}

// ========================================
// 生産量の再計算
// ========================================

function recalculateProduction() {
  // Step 1: 能力アップグレードによる「1個あたりの効果」強化倍率を計算
  //   例: シナプス強化I+IIを購入 → clickEnhNum/Den = 125*125 / 100*100
  let clickEnhNum = 1n, clickEnhDen = 1n;
  let autoEnhNum = 1n, autoEnhDen = 1n;
  let mulEnhNum = 1n, mulEnhDen = 1n;

  if (gameData.abilityUpgrades) {
    // 通常の能力アップグレード（×1.25 積み重ね）
    for (const ab of gameData.abilityUpgrades) {
      if (!gameState.abilityUpgrades[ab.id]) continue;
      if (ab.isRelease) continue; // 解放は別処理
      const mul = BigInt(ab.multiplier); // 125
      switch (ab.target) {
        case "click": clickEnhNum *= mul; clickEnhDen *= 100n; break;
        case "auto": autoEnhNum *= mul; autoEnhDen *= 100n; break;
        case "multiplier": mulEnhNum *= mul; mulEnhDen *= 100n; break;
      }
    }
    // 解放アイテム（累計倍率を置換）
    for (const ab of gameData.abilityUpgrades) {
      if (!ab.isRelease || !gameState.abilityUpgrades[ab.id]) continue;
      const relMul = BigInt(ab.releaseMultiplier); // 400
      switch (ab.target) {
        case "click": clickEnhNum = relMul; clickEnhDen = 100n; break;
        case "auto": autoEnhNum = relMul; autoEnhDen = 100n; break;
        case "multiplier": mulEnhNum = relMul; mulEnhDen = 100n; break;
      }
    }
  }

  // Step 2: 基礎能力の効果を計算（1個あたりの効果に強化倍率を適用）
  //   click: baseClick = 1 + (effect * owned * clickEnhNum / clickEnhDen)
  //   auto:  baseAuto  = effect * owned * autoEnhNum / autoEnhDen
  //   mul:   globalMul = 1 + (effect-1) * owned * mulEnhNum / mulEnhDen
  //   → 分数のまま保持して最後に割る
  let baseClickNum = clickEnhDen;  // "1" の部分（= clickEnhDen / clickEnhDen）
  let baseAutoNum = 0n;
  let globalMulNum = mulEnhDen;    // "1" の部分（= mulEnhDen / mulEnhDen）

  for (const upgrade of gameData.upgrades) {
    const owned = gameState.upgrades[upgrade.id] || 0;
    if (owned === 0) continue;
    const effect = BigInt(upgrade.effect);
    const ownedBig = BigInt(owned);
    switch (upgrade.type) {
      case "click":
        // 強化後の1個あたり効果 = effect * clickEnhNum / clickEnhDen
        baseClickNum += effect * ownedBig * clickEnhNum;
        break;
      case "auto":
        baseAutoNum += effect * ownedBig * autoEnhNum;
        break;
      case "multiplier":
        // 強化後の1個あたり加算 = (effect-1) * mulEnhNum / mulEnhDen
        globalMulNum += (effect - 1n) * ownedBig * mulEnhNum;
        break;
    }
  }

  // Step 3: 最終基礎値
  //   neuronsPerClick = (baseClickNum / clickEnhDen) * (globalMulNum / mulEnhDen)
  gameState.neuronsPerClick = baseClickNum * globalMulNum / (clickEnhDen * mulEnhDen);
  gameState.neuronsPerSecond = baseAutoNum * globalMulNum / (autoEnhDen * mulEnhDen);

  if (gameState.neuronsPerClick < 1n) gameState.neuronsPerClick = 1n;
}

// ========================================
// 最終生産値（全修飾子込み）
// ========================================

function getEffectiveClick() {
  const cfg = gameData.config;
  const pMul = getCyclePermanentMul();
  const inspPct = gameState.inspirationBuffPct;
  const ocBuffPct = gameState.overclockBuffPct;
  const combinedBuff = Math.round(inspPct * ocBuffPct / 100);

  return GameLogic.calculateFinalClick(
    gameState.neuronsPerClick,
    gameState.currentStageIndex,
    pMul.num, pMul.den,
    combinedBuff,
    cfg
  );
}

function getEffectiveNps() {
  const cfg = gameData.config;
  const pMul = getCyclePermanentMul();
  const inspPct = gameState.inspirationBuffPct;
  const ocBuffPct = gameState.overclockBuffPct;
  const combinedBuff = Math.round(inspPct * ocBuffPct / 100);

  return GameLogic.calculateFinalNps(
    gameState.neuronsPerSecond,
    gameState.currentStageIndex,
    pMul.num, pMul.den,
    combinedBuff,
    cfg
  );
}

// ========================================
// アップグレードコスト
// ========================================

function calculateUpgradeCost(baseCostStr, owned, upgrade) {
  const baseCost = BigInt(baseCostStr);
  const ownedBig = BigInt(owned);
  let growthNum = 115n, growthDen = 100n;
  if (upgrade && upgrade.costGrowth) {
    growthNum = BigInt(upgrade.costGrowth.numerator);
    growthDen = BigInt(upgrade.costGrowth.denominator);
  }
  const numerator = baseCost * bigIntPow(growthNum, ownedBig);
  const denominator = bigIntPow(growthDen, ownedBig);
  return bigIntCeilDiv(numerator, denominator);
}

// ========================================
// 進化
// ========================================

function canEvolve() {
  const nextIndex = gameState.currentStageIndex + 1;
  if (nextIndex >= gameData.stages.length) return false;
  return gameState.stageNeurons >= getStageThreshold(nextIndex);
}

function checkEvolution() {
  const nextIndex = gameState.currentStageIndex + 1;
  if (nextIndex >= gameData.stages.length) return;
  const evolveBtn = document.getElementById("evolve-btn");
  if (gameState.stageNeurons >= getStageThreshold(nextIndex)) {
    evolveBtn.classList.remove("hidden");
  } else {
    evolveBtn.classList.add("hidden");
  }
}

function performEvolution() {
  if (!canEvolve()) return;
  const nextIndex = gameState.currentStageIndex + 1;
  if (nextIndex >= gameData.stages.length) return;
  const nextStage = gameData.stages[nextIndex];

  gameState.currentStageIndex = nextIndex;

  // 進化ゲージのみリセット（所持ニューロンは維持）
  gameState.stageNeurons = 0n;

  // OverClockバフリセット
  gameState.overclockBuffPct = 100;
  gameState.overclockBuffEndTime = 0;
  gameState.overclockBuffPurchaseCount = 0;

  audioManager.playEvolutionSfx();
  audioManager.setStage(nextIndex);

  document.getElementById("evolve-btn").classList.add("hidden");
  applyStageTheme(nextStage);
  updateSynapseParams();
  respawnParticles();
  recalculateProduction();
  showEvolutionModal(nextStage);
  updateAllUI();
  saveCheckpoint();
  saveGame();
}

// ========================================
// サイクル（周回）
// ========================================

function canCycle() {
  const finalIndex = gameData.stages.length - 1;
  if (gameState.currentStageIndex !== finalIndex) return false;
  const threshold = getCycleThreshold();
  return gameState.stageNeurons >= threshold;
}

function getCycleThreshold() {
  const base = BigInt(gameData.config.cycleSystem.cycleThreshold || "1000000000");
  return GameLogic.getCycleScaledThreshold(base, gameState.cycleCount,
    gameData.config.cycleSystem.thresholdGrowthBase || 1.1);
}

function hasAllAbilityUpgrades() {
  if (!gameData.abilityUpgrades) return false;
  for (const ab of gameData.abilityUpgrades) {
    if (!gameState.abilityUpgrades[ab.id]) return false;
  }
  return true;
}

function performCycleReset() {
  if (!canCycle()) return;

  const newCycleCount = gameState.cycleCount + 1;

  // 周回前に全周回累計ニューロンを加算
  gameState.totalNeuronsAllTime += gameState.totalNeurons;

  gameState.neurons = 0n;
  gameState.totalNeurons = 0n;
  gameState.stageNeurons = 0n;
  gameState.neuronsPerClick = 1n;
  gameState.neuronsPerSecond = 0n;
  gameState.currentStageIndex = 0;
  gameState.upgrades = {};
  // abilityUpgrades は周回で引き継ぎ（解放状況・倍率を維持）
  gameState.overclockBuffPct = 100;
  gameState.overclockBuffEndTime = 0;
  gameState.overclockBuffPurchaseCount = 0;
  gameState.inspirationBuffPct = 100;
  gameState.inspirationEndTime = 0;
  gameState.inspirationCooldownEnd = 0;
  gameState.shownEvolutionStages = [];
  gameState.cycleCount = newCycleCount;

  autoAccumulator = 0n;
  cycleEffectFired = false;

  const stage = gameData.stages[0];
  applyStageTheme(stage);
  updateSynapseParams();
  synapseState.particles = [];
  respawnParticles();
  rebuildOrbitalNodes();

  if (audioManager.initialized) {
    audioManager.playEvolutionSfx();
    audioManager.setStage(0);
  }

  recalculateProduction();

  document.getElementById("cycle-modal").classList.add("hidden");

  updateAllUI();
  saveCheckpoint();
  saveGame();

  const pMul = getCyclePermanentMul();
  const pMulDisplay = (pMul.num / pMul.den).toFixed ? `${(pMul.num / pMul.den)}` : `${pMul.num / pMul.den}`;
  showNotification(`サイクル ${newCycleCount} — 永続乗数 ×${(pMul.num / 100).toFixed(1)} で再び始まりの地へ`);
}

function showEndingModal() {
  const modal = document.getElementById("ending-modal");
  if (!modal) return;
  gameState.endingSeen = true;
  saveGame();
  modal.classList.remove("hidden");
}

function fireCycleEffect() {
  const container = document.getElementById("cycle-effect");
  if (!container) return;

  const starCount = 20;
  for (let i = 0; i < starCount; i++) {
    const star = document.createElement("div");
    star.className = "conv-star";
    const angle = (Math.PI * 2 * i) / starCount + (Math.random() - 0.5) * 0.4;
    const dist = 120 + Math.random() * 200;
    star.style.top = "50%"; star.style.left = "50%";
    star.style.setProperty("--star-dx", Math.cos(angle) * dist + "px");
    star.style.setProperty("--star-dy", Math.sin(angle) * dist + "px");
    star.style.setProperty("--star-delay", (Math.random() * 0.6) + "s");
    star.style.setProperty("--star-dur", (1.5 + Math.random() * 1) + "s");
    const size = 2 + Math.random() * 3;
    star.style.width = size + "px"; star.style.height = size + "px";
    container.appendChild(star);
  }

  container.classList.remove("hidden"); container.classList.add("active");
  document.body.classList.add("conv-shaking");
  setTimeout(() => document.body.classList.remove("conv-shaking"), 120);
  if (audioManager.initialized) audioManager.playEvolutionSfx();

  setTimeout(() => {
    container.classList.remove("active"); container.classList.add("hidden");
    container.querySelectorAll(".conv-star").forEach(el => el.remove());
  }, 4000);
}

// ========================================
// ひらめきバフ
// ========================================

function tickInspirationBuff() {
  const cfg = gameData && gameData.config && gameData.config.inspirationBuff;
  if (!cfg) return;
  const now = Date.now();

  if (gameState.inspirationBuffPct !== 100 && gameState.inspirationEndTime > 0) {
    if (now >= gameState.inspirationEndTime) {
      gameState.inspirationBuffPct = 100;
      gameState.inspirationEndTime = 0;
      gameState.inspirationCooldownEnd = now + cfg.cooldownSec * 1000;
      showBuffAnnounce("💡 ひらめきの効果が切れた...", "#ffcc00");
    }
    return;
  }

  if (gameState.inspirationCooldownEnd > now) return;

  const chancePerTick = (cfg.lotteryPctPerSec || 5) / 10;
  if (Math.random() * 100 < chancePerTick) {
    gameState.inspirationBuffPct = cfg.buffPct || 160;
    gameState.inspirationEndTime = now + cfg.durationSec * 1000;
    gameState.totalInspirationCount++;
    triggerInspirationVisualEffect();
    audioManager.playBuffChoirSfx("inspiration");
    showBuffAnnounce(`💡 ひらめき発動！ 全生産 +${(cfg.buffPct || 160) - 100}% (${cfg.durationSec}秒)`, "#ffcc00");
  }
}

function triggerInspirationVisualEffect() {
  const canvas = synapseState.canvas;
  if (canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    for (let i = 0; i < 3; i++) synapseBurst(w * (0.3 + Math.random() * 0.4), h * (0.3 + Math.random() * 0.4));
  }
  document.body.classList.remove("inspiration-flash");
  void document.body.offsetWidth;
  document.body.classList.add("inspiration-flash");
  setTimeout(() => document.body.classList.remove("inspiration-flash"), 800);
}

function updateInspirationUI() {
  const banner = document.getElementById("inspiration-banner");
  const leftTimer = document.getElementById("inspiration-left-timer");
  if (leftTimer) leftTimer.classList.add("hidden"); // バナーに統合のため常に非表示
  if (!banner) return;
  const now = Date.now();
  const active = gameState.inspirationBuffPct !== 100 && gameState.inspirationEndTime > now;
  if (!active) { banner.classList.add("hidden"); return; }
  banner.classList.remove("hidden");
  const remaining = Math.ceil((gameState.inspirationEndTime - now) / 1000);
  const buffBonus = gameState.inspirationBuffPct - 100;
  document.getElementById("inspiration-timer").textContent = `${remaining}s  +${buffBonus}%`;
}

// ========================================
// OverClockバフ
// ========================================

function tickOverclockBuff() {
  if (gameState.overclockBuffPct === 100) return;
  if (gameState.overclockBuffEndTime <= 0) return;
  if (Date.now() >= gameState.overclockBuffEndTime) {
    gameState.overclockBuffPct = 100;
    gameState.overclockBuffEndTime = 0;
    showBuffAnnounce("🔥 OverClockの効果が切れた...", "#ff3333");
  }
}

function calculateOverclockBuffCost() {
  const cfg = gameData && gameData.config && gameData.config.overclockBuff;
  if (!cfg) return 0n;
  const si = gameState.currentStageIndex;
  const baseCostStr = cfg.baseCostByStage && cfg.baseCostByStage[si];
  if (!baseCostStr || baseCostStr === "0") return 0n;
  const baseCost = BigInt(baseCostStr);
  const count = gameState.overclockBuffPurchaseCount || 0;
  if (count === 0) return baseCost;
  // growthBase を分数で処理（1.5 → 150/100, 2 → 200/100）
  const growthRaw = cfg.costGrowthBase || 2;
  const growthNum = BigInt(Math.round(growthRaw * 100));
  const growthDen = 100n;
  const countBig = BigInt(count);
  return baseCost * bigIntPow(growthNum, countBig) / bigIntPow(growthDen, countBig);
}

function purchaseOverclockBuff() {
  const cfg = gameData && gameData.config && gameData.config.overclockBuff;
  if (!cfg) return;
  if (gameState.overclockBuffPct !== 100 && gameState.overclockBuffEndTime > Date.now()) return;
  const cost = calculateOverclockBuffCost();
  if (cost === 0n || gameState.neurons < cost) return;

  gameState.neurons -= cost;
  gameState.overclockBuffPct = cfg.buffPct || 250;
  gameState.overclockBuffEndTime = Date.now() + (cfg.durationSec || 180) * 1000;
  gameState.overclockBuffPurchaseCount = (gameState.overclockBuffPurchaseCount || 0) + 1;

  audioManager.playPurchaseSfx();
  audioManager.playBuffChoirSfx("overclock");
  triggerOverclockBuffVisualEffect();
  showBuffAnnounce(`🔥 OverClock発動！ 全生産 ×${((cfg.buffPct || 250) / 100).toFixed(1)} (${Math.floor((cfg.durationSec || 180) / 60)}分)`, "#ff3333");

  recalculateProduction();
  updateStatsDisplay();
  buildUpgradeList();
  updateUpgradeList();
  saveGame();
}

function triggerOverclockBuffVisualEffect() {
  const canvas = synapseState.canvas;
  if (canvas) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width / dpr, h = canvas.height / dpr;
    for (let i = 0; i < 5; i++) synapseBurst(w * (0.2 + Math.random() * 0.6), h * (0.2 + Math.random() * 0.6));
  }
  document.body.classList.remove("overclock-buff-flash");
  void document.body.offsetWidth;
  document.body.classList.add("overclock-buff-flash");
  setTimeout(() => document.body.classList.remove("overclock-buff-flash"), 1000);
}

function updateOverclockBuffUI() {
  const banner = document.getElementById("overclock-buff-banner");
  if (!banner) return;
  const now = Date.now();
  const active = gameState.overclockBuffPct !== 100 && gameState.overclockBuffEndTime > now;
  const brainCore = document.getElementById("brain-core");
  if (brainCore) brainCore.classList.toggle("overclock-active", active);
  // OverClock中は全体カラーを赤に、解除時はステージ色に復元
  if (active) {
    document.body.style.setProperty("--accent", "#ff3333");
    document.body.style.setProperty("--accent-glow", "rgba(255, 51, 51, 0.3)");
  } else {
    document.body.style.removeProperty("--accent");
    document.body.style.removeProperty("--accent-glow");
  }
  if (!active) { banner.classList.add("hidden"); return; }
  banner.classList.remove("hidden");
  const remainMs = gameState.overclockBuffEndTime - now;
  const remainSec = Math.ceil(remainMs / 1000);
  const mm = Math.floor(remainSec / 60), ss = remainSec % 60;
  document.getElementById("overclock-buff-timer").textContent = `${mm}:${String(ss).padStart(2, "0")}`;
}

// ========================================
// クリック処理
// ========================================

function handleBrainClick() {
  if (!audioManager.initialized) { audioManager.init(); audioManager.setStage(gameState.currentStageIndex); }
  audioManager.playClickSfx();

  gameState.totalClicks++;

  const actualGain = getEffectiveClick();
  gameState.neurons += actualGain;
  gameState.totalNeurons += actualGain;
  gameState.stageNeurons += actualGain;

  const brainCore = document.getElementById("brain-core");
  brainCore.classList.remove("pulse"); void brainCore.offsetWidth; brainCore.classList.add("pulse");
  showClickFloater(actualGain);

  if (synapseState.canvas && brainCore) {
    const coreRect = brainCore.getBoundingClientRect();
    const canvasRect = synapseState.canvas.getBoundingClientRect();
    const cx = coreRect.left + coreRect.width / 2 - canvasRect.left;
    const cy = coreRect.top + coreRect.height / 2 - canvasRect.top;
    synapseBurst(cx, cy);

    // クリック波紋リング: click系購入数で揺れの速度・激しさが増す
    const clickCount = getClickUpgradeCount();
    const amplitude = 3 + Math.min(clickCount * 0.4, 10); // 緩やかな波高（3〜13px）
    const phaseSpeed = 0.12 + Math.min(clickCount * 0.03, 0.6); // 回転速度（0.12〜0.72）
    const noiseAmp = Math.min(clickCount * 0.5, 12); // ランダム揺らぎ振幅（0〜12px）
    // セグメントごとのノイズオフセットを事前生成
    const segments = 90;
    const noiseOffsets = [];
    for (let s = 0; s <= segments; s++) noiseOffsets.push(Math.random() * Math.PI * 2);
    synapseState.coreWaveRings.push({
      cx, cy,
      baseRadius: coreRect.width / 2,
      amplitude,
      phaseSpeed,
      noiseAmp,
      noiseOffsets,
      segments,
      life: 1.0,
      phase: 0,
      noiseTime: 0,
    });
  }

  checkEvolution();
  updateStatsDisplay();
  updateUpgradeList();
}

function showClickFloater(amount) {
  const container = document.getElementById("floater-container");
  const floater = document.createElement("div");
  const isBuffed = gameState.inspirationBuffPct !== 100 || gameState.overclockBuffPct !== 100;
  floater.className = "click-floater" + (isBuffed ? " click-floater-buffed" : "");
  floater.textContent = "+" + formatBigInt(amount);
  const btn = document.getElementById("brain-core");
  const rect = btn.getBoundingClientRect();
  floater.style.left = (rect.left + Math.random() * rect.width) + "px";
  floater.style.top = (rect.top + Math.random() * 20) + "px";
  container.appendChild(floater);
  setTimeout(() => floater.remove(), 1000);
}

// ========================================
// アップグレード購入
// ========================================

function purchaseUpgrade(upgradeId) {
  const upgrade = gameData.upgrades.find(u => u.id === upgradeId);
  if (!upgrade) return;
  const owned = gameState.upgrades[upgradeId] || 0;
  const cost = calculateUpgradeCost(upgrade.baseCost, owned, upgrade);
  if (gameState.neurons < cost) return;

  gameState.neurons -= cost;
  audioManager.playPurchaseSfx();
  gameState.upgrades[upgradeId] = owned + 1;

  recalculateProduction();
  updateSynapseParams();
  respawnParticles();
  rebuildOrbitalNodes();
  updateStatsDisplay();
  buildUpgradeList();
  updateUpgradeList();
  updateEvolutionProgress();
  checkEvolution();
  saveGame();
}

function purchaseAbilityUpgrade(abilityId) {
  const ab = gameData.abilityUpgrades.find(a => a.id === abilityId);
  if (!ab) return;
  if (gameState.abilityUpgrades[abilityId]) return; // 購入済み
  if (ab.requires && !gameState.abilityUpgrades[ab.requires]) return; // 前提未達

  const cost = BigInt(ab.cost);
  if (gameState.neurons < cost) return;

  gameState.neurons -= cost;
  audioManager.playPurchaseSfx();
  gameState.abilityUpgrades[abilityId] = true;

  recalculateProduction();
  updateStatsDisplay();
  buildUpgradeList();
  updateUpgradeList();
  saveGame();
}

// ========================================
// テーマ管理
// ========================================

function applyStageTheme(stage) {
  document.body.className = "";
  document.body.classList.add(stage.themeClass);
  updateBrainBg();
}

function updateBrainBg() {
  const bg = document.getElementById("brain-bg");
  const img = document.getElementById("brain-bg-img");
  if (!img || !bg) return;
  const si = gameState.currentStageIndex;
  let src;
  if (si <= 2) src = "images/brain_001.png";
  else if (si <= 4) src = "images/brain_002.png";
  else src = "images/brain_003.png";
  if (img.src !== src && !img.src.endsWith(src)) img.src = src;
  // ステージ0: 0.7 → ステージ7: 1.4 で段階的に拡大
  const scale = 0.7 + si * 0.1;
  bg.style.setProperty("--brain-scale", scale);
}

// ========================================
// ゲームティック
// ========================================

function gameTick() {
  tickInspirationBuff();
  tickOverclockBuff();

  const effectiveNps = getEffectiveNps();
  if (effectiveNps > 0n) {
    autoAccumulator += effectiveNps * BigInt(gameSpeed);
    const gained = autoAccumulator / 10n;
    autoAccumulator = autoAccumulator % 10n;
    if (gained > 0n) { gameState.neurons += gained; gameState.totalNeurons += gained; gameState.stageNeurons += gained; }
  }

  checkEvolution();

  intensityTickCounter++;
  if (intensityTickCounter >= 10 && audioManager.initialized) {
    intensityTickCounter = 0;
    audioManager.setIntensity(calculateAudioIntensity());
  }

  updateStatsDisplay();
  updateUpgradeList();
  updateEvolutionProgress();
  updateInspirationUI();
  updateOverclockBuffUI();
  updateCycleUI();
}

// ========================================
// UI更新
// ========================================

function updateAllUI() {
  updateStatsDisplay();
  updateStageInfo();
  updateStageTimeline();
  updateEvolutionProgress();
  updateInspirationUI();
  updateOverclockBuffUI();
  updateCycleDisplay();
  updateCycleUI();
  buildUpgradeList();
  updateUpgradeList();
}

function updateStatsDisplay() {
  const neuronEl = document.getElementById("neuron-count");
  const newText = formatBigInt(gameState.neurons);
  if (neuronEl.textContent !== newText) {
    neuronEl.textContent = newText;
    const isBuffed = gameState.inspirationBuffPct !== 100 || gameState.overclockBuffPct !== 100;
    neuronEl.classList.remove("bumping", "bumping-buffed"); void neuronEl.offsetWidth;
    neuronEl.classList.add(isBuffed ? "bumping-buffed" : "bumping");
  }
  document.getElementById("per-click-display").textContent = formatBigInt(getEffectiveClick());
  document.getElementById("per-second-display").textContent = formatBigInt(getEffectiveNps());

  const digitLen = gameState.neurons.toString().length;
  let fontSize;
  if (digitLen <= 6) fontSize = "2rem";
  else if (digitLen <= 9) fontSize = "1.6rem";
  else if (digitLen <= 12) fontSize = "1.3rem";
  else if (digitLen <= 15) fontSize = "1.1rem";
  else fontSize = "0.9rem";
  neuronEl.style.setProperty("--neuron-font-size", fontSize);
}

function updateStageInfo() {
  const stage = gameData.stages[gameState.currentStageIndex];
  document.getElementById("stage-name").textContent = stage.name;
  document.getElementById("stage-description").textContent = stage.description.replace(/\\n/g, "\n");
  document.getElementById("header-stage-name").textContent = stage.name;
  document.getElementById("header-stage-subtitle").textContent = stage.subtitle;
  // core-emoji: 将来的にpng画像を設定予定
  // document.getElementById("core-emoji").textContent = stage.coreEmoji;
}

function updateStageTimeline() {
  const container = document.getElementById("stage-timeline");
  container.innerHTML = "";
  gameData.stages.forEach((stage, index) => {
    const node = document.createElement("div");
    node.className = "timeline-node";
    node.textContent = index + 1;
    node.title = stage.name;
    if (index < gameState.currentStageIndex) node.classList.add("completed");
    else if (index === gameState.currentStageIndex) node.classList.add("active");
    container.appendChild(node);
    if (index < gameData.stages.length - 1) {
      const connector = document.createElement("div");
      connector.className = "timeline-connector";
      if (index < gameState.currentStageIndex) connector.classList.add("completed");
      container.appendChild(connector);
    }
  });
}

function updateEvolutionProgress() {
  const nextIndex = gameState.currentStageIndex + 1;
  const section = document.getElementById("evolution-section");

  if (nextIndex >= gameData.stages.length) {
    section.classList.add("max-stage");
    document.getElementById("evolution-label").textContent = "最終形態に到達";
    document.getElementById("evolution-progress-fill").style.width = "100%";
    document.getElementById("evolution-current").textContent = "∞";
    document.getElementById("evolution-required").textContent = "∞";
    document.getElementById("evolve-btn").classList.add("hidden");
    return;
  }

  section.classList.remove("max-stage");
  const required = getStageThreshold(nextIndex);
  let progress = 0;
  if (required > 0n) {
    progress = Number((gameState.stageNeurons * 100n) / required);
    if (progress > 100) progress = 100;
  }
  document.getElementById("evolution-progress-fill").style.width = progress + "%";
  document.getElementById("evolution-current").textContent = formatBigInt(gameState.stageNeurons);
  document.getElementById("evolution-required").textContent = formatBigInt(required);
  document.getElementById("evolution-label").textContent = `次の進化: ${gameData.stages[nextIndex].name}`;
}

function updateCycleDisplay() {
  const el = document.getElementById("cycle-display");
  if (!el) return;
  const cycle = gameState.cycleCount;
  const pMul = getCyclePermanentMul();
  document.getElementById("cycle-count-text").textContent = `サイクル ${cycle}`;
  if (cycle > 1) {
    document.getElementById("cycle-permanent-text").textContent = `永続乗数 ×${(pMul.num / 100).toFixed(1)}`;
    el.classList.remove("hidden");
  } else {
    el.classList.add("hidden");
  }
}

function updateCycleUI() {
  const section = document.getElementById("cycle-section");
  if (!section) return;
  const finalIndex = gameData.stages.length - 1;

  if (gameState.currentStageIndex !== finalIndex) {
    section.classList.add("hidden");
    return;
  }

  section.classList.remove("hidden");

  // 進捗バー更新
  const threshold = getCycleThreshold();
  const current = gameState.stageNeurons < threshold ? gameState.stageNeurons : threshold;
  const pct = threshold > 0n ? Number(current * 10000n / threshold) / 100 : 0;

  const fill = document.getElementById("cycle-progress-fill");
  if (fill) fill.style.width = pct + "%";
  const curEl = document.getElementById("cycle-progress-current");
  const reqEl = document.getElementById("cycle-progress-required");
  if (curEl) curEl.textContent = formatBigInt(current);
  if (reqEl) reqEl.textContent = formatBigInt(threshold);

  const btn = document.getElementById("cycle-btn");
  if (canCycle()) {
    // 全アップグレード取得 + 閾値達成 → エンディング表示（ゲーム全体で1回のみ）
    if (hasAllAbilityUpgrades() && !gameState.endingSeen) {
      showEndingModal();
      return;
    }
    // 閾値達成 → エフェクト＆ボタン有効化
    if (!cycleEffectFired) {
      cycleEffectFired = true;
      fireCycleEffect();
    }
    btn.classList.remove("hidden");
    btn.disabled = false;
  } else {
    btn.classList.add("hidden");
    btn.disabled = true;
  }
}

// ========================================
// アップグレードリスト構築
// ========================================

function buildUpgradeList() {
  const container = document.getElementById("upgrade-list");
  clearTimeout(tooltipDelayTimer);
  const tooltip = document.getElementById("upgrade-tooltip");
  if (tooltip) tooltip.classList.remove("visible");
  container.innerHTML = "";

  if (currentTab === "enhance") {
    // 基礎能力3種
    const section = document.createElement("div");
    section.className = "primal-section";
    section.innerHTML = `
      <div class="primal-section-header">
        <span class="primal-section-title">🧬 基礎能力</span>
        <span class="primal-section-sub">無限に購入可能。指数的にコストが成長する。</span>
      </div>
    `;
    for (const upgrade of gameData.upgrades) {
      section.appendChild(createUpgradeCard(upgrade));
    }
    container.appendChild(section);

    // OverClockバフカード
    const ocCard = createOverclockBuffCard();
    if (ocCard) container.appendChild(ocCard);
  } else if (currentTab === "ability") {
    // 能力アップグレード
    const section = document.createElement("div");
    section.className = "ability-section";
    section.innerHTML = `
      <div class="primal-section-header">
        <span class="primal-section-title">⚡ 能力アップグレード</span>
        <span class="primal-section-sub">各1回購入。対応する強化の1個あたりの効果を×1.25</span>
      </div>
    `;

    if (gameData.abilityUpgrades) {
      // 表示対象をフィルタ: 購入済み or 購入可能 or 1つ先(ロック表示)のみ
      const visible = gameData.abilityUpgrades.filter(ab => {
        // 購入済み → 常に表示
        if (gameState.abilityUpgrades[ab.id]) return true;
        // 前提なし → 表示
        if (!ab.requires) return true;
        // 前提が購入済み → 表示（購入可能 or ロック表示）
        if (gameState.abilityUpgrades[ab.requires]) return true;
        // 前提の前提を辿って「1つ先」かどうか判定
        const reqAb = gameData.abilityUpgrades.find(a => a.id === ab.requires);
        // 前提アイテムが前提なし or 前提の前提が購入済み → 前提が「次に買える」ので1つ先として表示
        if (reqAb && (!reqAb.requires || gameState.abilityUpgrades[reqAb.requires])) return true;
        return false;
      });
      visible.sort((a, b) => {
        const ap = gameState.abilityUpgrades[a.id] ? 1 : 0;
        const bp = gameState.abilityUpgrades[b.id] ? 1 : 0;
        return ap - bp;
      });
      for (const ab of visible) {
        section.appendChild(createAbilityCard(ab));
      }
    }
    container.appendChild(section);
  }
}

function buildTooltipHTML(upgrade) {
  const sim = simulateUpgradePurchase(upgrade);
  switch (upgrade.type) {
    case "click":
      return `<span class="tooltip-label">クリック効率</span> <span class="tooltip-value">${sim.clickBefore}</span> <span class="tooltip-arrow">→</span> <span class="tooltip-value">${sim.click} /click</span>`;
    case "auto":
      return `<span class="tooltip-label">自動効率</span> <span class="tooltip-value">${sim.npsBefore}</span> <span class="tooltip-arrow">→</span> <span class="tooltip-value">${sim.nps} /sec</span>`;
    case "multiplier":
      return `<span class="tooltip-label">クリック効率</span> <span class="tooltip-value">${sim.clickBefore}</span> <span class="tooltip-arrow">→</span> <span class="tooltip-value">${sim.click} /click</span><br>`
        + `<span class="tooltip-label">自動効率</span> <span class="tooltip-value">${sim.npsBefore}</span> <span class="tooltip-arrow">→</span> <span class="tooltip-value">${sim.nps} /sec</span>`;
    default:
      return "";
  }
}

function buildOverclockTooltipHTML() {
  const cfg = gameData.config.overclockBuff;
  const buffPct = cfg.buffPct || 250;
  const durationSec = cfg.durationSec || 180;
  const durationMin = Math.floor(durationSec / 60);
  const buffMul = (buffPct / 100).toFixed(1);
  // 現在値
  const curClick = getEffectiveClick();
  const curNps = getEffectiveNps();
  // OC適用後をシミュレート
  const prevOcPct = gameState.overclockBuffPct;
  gameState.overclockBuffPct = buffPct;
  const nextClick = getEffectiveClick();
  const nextNps = getEffectiveNps();
  gameState.overclockBuffPct = prevOcPct;
  return `<span class="tooltip-label">全生産 ×${buffMul}（${durationMin}分間）</span><br>`
    + `<span class="tooltip-label">クリック効率</span> <span class="tooltip-value">${formatBigInt(curClick)}</span> <span class="tooltip-arrow">→</span> <span class="tooltip-value">${formatBigInt(nextClick)} /click</span><br>`
    + `<span class="tooltip-label">自動効率</span> <span class="tooltip-value">${formatBigInt(curNps)}</span> <span class="tooltip-arrow">→</span> <span class="tooltip-value">${formatBigInt(nextNps)} /sec</span>`;
}

function positionTooltip(tooltip, mouseX, mouseY) {
  const gap = 12;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // 一旦表示して寸法を取得
  tooltip.style.left = "0px";
  tooltip.style.top = "0px";
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  // 基本: カーソルの右下
  let x = mouseX + gap;
  let y = mouseY + gap;
  // 右端にはみ出す → カーソルの左側
  if (x + tw > vw - 8) x = mouseX - tw - gap;
  // 下端にはみ出す → カーソルの上側
  if (y + th > vh - 8) y = mouseY - th - gap;
  // 左端・上端の安全マージン
  if (x < 8) x = 8;
  if (y < 8) y = 8;
  tooltip.style.left = x + "px";
  tooltip.style.top = y + "px";
}

let tooltipDelayTimer = null;

function attachUpgradeTooltip(card, upgrade) {
  const tooltip = document.getElementById("upgrade-tooltip");
  card.addEventListener("mouseenter", () => {
    clearTimeout(tooltipDelayTimer);
    tooltipDelayTimer = setTimeout(() => {
      tooltip.innerHTML = buildTooltipHTML(upgrade);
      tooltip.classList.add("visible");
    }, 500);
  });
  card.addEventListener("mousemove", (e) => {
    positionTooltip(tooltip, e.clientX, e.clientY);
  });
  card.addEventListener("mouseleave", () => {
    clearTimeout(tooltipDelayTimer);
    tooltip.classList.remove("visible");
  });
}

function createUpgradeCard(upgrade) {
  const card = document.createElement("div");
  card.className = "upgrade-card";
  card.dataset.upgradeId = upgrade.id;

  const owned = gameState.upgrades[upgrade.id] || 0;
  const typeLabels = { click: "クリック", auto: "自動", multiplier: "乗数" };
  const typeBadgeClass = { click: "badge-click", auto: "badge-auto", multiplier: "badge-multiplier" };

  card.innerHTML = `
    <div class="upgrade-header">
      <span class="upgrade-name">
        <span class="upgrade-type-badge ${typeBadgeClass[upgrade.type] || ""}">${typeLabels[upgrade.type]}</span>
        ${upgrade.name}
      </span>
      <span class="upgrade-owned">x${owned}</span>
    </div>
    <div class="upgrade-description">${upgrade.description}</div>
    <div class="upgrade-footer">
      <span class="upgrade-cost">◆ ---</span>
    </div>
  `;

  attachUpgradeTooltip(card, upgrade);
  card.addEventListener("click", () => purchaseUpgrade(upgrade.id));
  return card;
}

function getCumulativeEnhancePct(ab) {
  // このカードまでのチェーン長を数える（requires を辿る）
  let depth = 1;
  let current = ab;
  while (current.requires) {
    depth++;
    current = gameData.abilityUpgrades.find(a => a.id === current.requires);
    if (!current) break;
  }
  // 1.25^depth - 1 をパーセンテージで返す
  const pct = (Math.pow(ab.multiplier / 100, depth) - 1) * 100;
  return Math.round(pct);
}

function createAbilityCard(ab) {
  const card = document.createElement("div");
  card.className = "upgrade-card ability-card";
  card.dataset.abilityId = ab.id;

  const purchased = !!gameState.abilityUpgrades[ab.id];
  const locked = ab.requires && !gameState.abilityUpgrades[ab.requires];
  const cost = BigInt(ab.cost);
  const canAfford = !purchased && !locked && gameState.neurons >= cost;

  // 解放アイテムの???マスク判定
  const isRelease = !!ab.isRelease;
  const isRevealed = !isRelease || (ab.requires && !!gameState.abilityUpgrades[ab.requires]);
  const isMasked = isRelease && !isRevealed;

  const targetLabels = { click: "シナプスの火花", auto: "本能の目覚め", multiplier: "好奇心" };
  const targetBadgeClass = { click: "badge-click", auto: "badge-auto", multiplier: "badge-multiplier" };

  if (purchased) card.classList.add("purchased-unique");
  else if (isMasked) card.classList.add("locked-ability");
  else if (locked) card.classList.add("locked-ability");
  else if (canAfford) card.classList.add("affordable");
  else card.classList.add("too-expensive");

  // 表示テキスト
  const displayName = isMasked ? "???" : ab.name;
  const displayDesc = isMasked ? "条件達成で解放" : ab.description;

  let costText;
  if (purchased) {
    costText = "購入済み ✓";
  } else if (isMasked) {
    const reqAb = gameData.abilityUpgrades.find(a => a.id === ab.requires);
    costText = `🔒 ${reqAb ? reqAb.name : "前提"} を購入すると解放`;
  } else if (locked) {
    const reqAb = gameData.abilityUpgrades.find(a => a.id === ab.requires);
    costText = `🔒 ${reqAb ? reqAb.name : "前提"} が必要`;
  } else {
    costText = `◆ ${formatBigInt(cost)}`;
  }

  let effectText;
  if (isMasked) {
    effectText = "???";
  } else if (isRelease) {
    effectText = `${targetLabels[ab.target]}の効率 累計 +${ab.releaseMultiplier}%`;
  } else {
    effectText = `${targetLabels[ab.target]}の効率 累計 +${getCumulativeEnhancePct(ab)}%`;
  }

  const badgeText = isMasked ? "?" : (isRelease ? "解放" : "");
  const badgeClass = isRelease ? "badge-release" : (targetBadgeClass[ab.target] || "");

  card.innerHTML = `
    <div class="upgrade-header">
      <span class="upgrade-name">
        <span class="upgrade-type-badge ${isMasked ? 'badge-masked' : badgeClass}">${isMasked ? '?' : (isRelease ? '解放' : targetLabels[ab.target])}</span>
        ${displayName}
      </span>
      <span class="upgrade-owned">${purchased ? "✓" : ""}</span>
    </div>
    <div class="upgrade-description">${displayDesc}</div>
    <div class="upgrade-footer">
      <span class="upgrade-cost">${costText}</span>
      <span class="upgrade-effect">${effectText}</span>
    </div>
  `;

  if (!purchased && !locked && !isMasked) {
    card.addEventListener("click", () => purchaseAbilityUpgrade(ab.id));
  }

  return card;
}

function createOverclockBuffCard() {
  const cfg = gameData && gameData.config && gameData.config.overclockBuff;
  if (!cfg) return null;
  const si = gameState.currentStageIndex;
  const stageInfo = cfg.stageData && cfg.stageData[si];
  if (!stageInfo) return null;

  const now = Date.now();
  const isActive = gameState.overclockBuffPct !== 100 && gameState.overclockBuffEndTime > now;
  const cost = calculateOverclockBuffCost();
  const canAfford = !isActive && cost > 0n && gameState.neurons >= cost;

  const section = document.createElement("div");
  section.className = "overclock-buff-section";
  section.id = "overclock-buff-section";

  let costText = "", cardClass = "overclock-buff-card";
  if (isActive) {
    costText = "稼働中";
    cardClass += " active-buff";
  } else if (cost === 0n) {
    costText = "利用不可"; cardClass += " too-expensive";
  } else {
    costText = `◆ ${formatBigInt(cost)}`;
    cardClass += canAfford ? " affordable" : " too-expensive";
  }

  const durationMin = Math.floor((cfg.durationSec || 180) / 60);
  const buffMul = ((cfg.buffPct || 250) / 100).toFixed(1);

  section.innerHTML = `
    <div class="overclock-buff-section-header">
      <span class="overclock-buff-section-title">🔥 OverClockバフ</span>
      <span class="overclock-buff-section-sub">一時的に全生産を大幅強化。</span>
    </div>
    <div class="${cardClass}" id="overclock-buff-card">
      <div class="upgrade-header">
        <span class="upgrade-name">
          <span class="upgrade-type-badge badge-overclock-buff">OC</span>
          ${stageInfo.name}
        </span>
        <span class="upgrade-owned">×${gameState.overclockBuffPurchaseCount || 0}</span>
      </div>
      <div class="upgrade-description">${stageInfo.flavor}</div>
      <div class="upgrade-footer">
        <span class="upgrade-cost">${costText}</span>
      </div>
    </div>
  `;

  const card = section.querySelector("#overclock-buff-card");
  if (cost > 0n) card.addEventListener("click", () => purchaseOverclockBuff());

  // ツールチップ（マウス追従）
  const tooltip = document.getElementById("upgrade-tooltip");
  card.addEventListener("mouseenter", () => {
    clearTimeout(tooltipDelayTimer);
    tooltipDelayTimer = setTimeout(() => {
      tooltip.innerHTML = buildOverclockTooltipHTML();
      tooltip.classList.add("visible");
    }, 500);
  });
  card.addEventListener("mousemove", (e) => {
    positionTooltip(tooltip, e.clientX, e.clientY);
  });
  card.addEventListener("mouseleave", () => {
    clearTimeout(tooltipDelayTimer);
    tooltip.classList.remove("visible");
  });

  return section;
}

function updateUpgradeList() {
  // OverClockバフカード更新
  const ocBuffCard = document.getElementById("overclock-buff-card");
  if (ocBuffCard) {
    const ocCfg = gameData.config && gameData.config.overclockBuff;
    if (ocCfg) {
      const now = Date.now();
      const isActive = gameState.overclockBuffPct !== 100 && gameState.overclockBuffEndTime > now;
      const ownedEl = ocBuffCard.querySelector(".upgrade-owned");
      if (ownedEl) ownedEl.textContent = `×${gameState.overclockBuffPurchaseCount || 0}`;
      const costEl = ocBuffCard.querySelector(".upgrade-cost");
      ocBuffCard.classList.remove("affordable", "too-expensive", "active-buff");
      if (isActive) {
        ocBuffCard.classList.add("active-buff");
        if (costEl) costEl.textContent = "稼働中";
      } else {
        const cost = calculateOverclockBuffCost();
        if (cost === 0n) { ocBuffCard.classList.add("too-expensive"); if (costEl) costEl.textContent = "利用不可"; }
        else {
          const canAfford = gameState.neurons >= cost;
          ocBuffCard.classList.toggle("affordable", canAfford);
          ocBuffCard.classList.toggle("too-expensive", !canAfford);
          if (costEl) costEl.textContent = `◆ ${formatBigInt(cost)}`;
        }
      }
    }
  }

  // 基礎能力カード更新
  const cards = document.querySelectorAll(".upgrade-card:not(.ability-card)");
  for (const card of cards) {
    const upgradeId = card.dataset.upgradeId;
    if (!upgradeId) continue;
    const upgrade = gameData.upgrades.find(u => u.id === upgradeId);
    if (!upgrade) continue;
    const owned = gameState.upgrades[upgradeId] || 0;
    const cost = calculateUpgradeCost(upgrade.baseCost, owned, upgrade);
    const canAfford = gameState.neurons >= cost;
    card.classList.toggle("affordable", canAfford);
    card.classList.toggle("too-expensive", !canAfford);
    const ownedEl = card.querySelector(".upgrade-owned");
    if (ownedEl) ownedEl.textContent = `x${owned}`;
    const costEl = card.querySelector(".upgrade-cost");
    if (costEl) costEl.textContent = `◆ ${formatBigInt(cost)}`;

  }

  // 能力アップグレードカード更新
  const abCards = document.querySelectorAll(".ability-card");
  for (const card of abCards) {
    const abilityId = card.dataset.abilityId;
    if (!abilityId) continue;
    const ab = gameData.abilityUpgrades.find(a => a.id === abilityId);
    if (!ab) continue;
    const purchased = !!gameState.abilityUpgrades[abilityId];
    const locked = ab.requires && !gameState.abilityUpgrades[ab.requires];
    if (purchased) continue;
    if (locked) continue;
    const cost = BigInt(ab.cost);
    const canAfford = gameState.neurons >= cost;
    card.classList.remove("affordable", "too-expensive", "locked-ability");
    card.classList.toggle("affordable", canAfford);
    card.classList.toggle("too-expensive", !canAfford);
    const costEl = card.querySelector(".upgrade-cost");
    if (costEl) costEl.textContent = `◆ ${formatBigInt(cost)}`;
  }

  // タブバッジ更新（購入可能なアイテムがあれば！表示）
  updateTabBadges();
}

function updateTabBadges() {
  const neurons = gameState.neurons;

  // 強化タブ: 基礎能力3種 or OverClockが買えるか
  let enhanceHas = false;
  for (const upgrade of gameData.upgrades) {
    const owned = gameState.upgrades[upgrade.id] || 0;
    const cost = calculateUpgradeCost(upgrade.baseCost, owned, upgrade);
    if (neurons >= cost) { enhanceHas = true; break; }
  }
  if (!enhanceHas) {
    const ocCost = calculateOverclockBuffCost();
    const now = Date.now();
    const isOcActive = gameState.overclockBuffPct !== 100 && gameState.overclockBuffEndTime > now;
    if (!isOcActive && ocCost > 0n && neurons >= ocCost) enhanceHas = true;
  }

  // アップグレードタブ: 未購入かつロック解除済みのアビリティが買えるか
  let abilityHas = false;
  if (gameData.abilityUpgrades) {
    for (const ab of gameData.abilityUpgrades) {
      if (gameState.abilityUpgrades[ab.id]) continue;
      if (ab.requires && !gameState.abilityUpgrades[ab.requires]) continue;
      if (neurons >= BigInt(ab.cost)) { abilityHas = true; break; }
    }
  }

  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    const tabName = tab.dataset.tab;
    const hasAffordable = tabName === "enhance" ? enhanceHas : abilityHas;
    let badge = tab.querySelector(".tab-badge");
    if (hasAffordable) {
      if (!badge) {
        badge = document.createElement("span");
        badge.className = "tab-badge";
        badge.textContent = "!";
        tab.appendChild(badge);
      }
    } else if (badge) {
      badge.remove();
    }
  });
}

// ========================================
// タブ切り替え
// ========================================

function setupTabButtons() {
  const tabs = document.querySelectorAll(".tab-btn");
  tabs.forEach(tab => {
    tab.addEventListener("click", () => {
      tabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      currentTab = tab.dataset.tab;
      buildUpgradeList();
      updateUpgradeList();
    });
  });
}

// ========================================
// モーダル
// ========================================

function showOfflineModal(elapsedSeconds, gained) {
  document.getElementById("offline-time").textContent = formatDuration(elapsedSeconds);
  document.getElementById("offline-neurons").textContent = formatBigInt(gained);
  const modal = document.getElementById("offline-modal");
  modal.classList.remove("hidden");
  document.getElementById("offline-ok-btn").onclick = () => modal.classList.add("hidden");
}

function showEvolutionModal(newStage) {
  const stageIndex = gameData.stages.indexOf(newStage);
  // 同一周回で既に表示済みならスキップ
  if (gameState.shownEvolutionStages && gameState.shownEvolutionStages.includes(stageIndex)) return;
  // 表示済みフラグを記録
  if (!gameState.shownEvolutionStages) gameState.shownEvolutionStages = [];
  gameState.shownEvolutionStages.push(stageIndex);

  document.getElementById("evolution-new-stage").textContent = newStage.name;
  document.getElementById("evolution-new-description").textContent = newStage.description.replace(/\\n/g, "\n");
  const modal = document.getElementById("evolution-modal");
  modal.classList.remove("hidden");
  document.getElementById("evolution-ok-btn").onclick = () => modal.classList.add("hidden");
}

// ========================================
// チェックポイント
// ========================================

function saveCheckpoint() {
  stageCheckpoint = {
    neurons: gameState.neurons.toString(),
    totalNeurons: gameState.totalNeurons.toString(),
    stageNeurons: gameState.stageNeurons.toString(),
    currentStageIndex: gameState.currentStageIndex,
    upgrades: { ...gameState.upgrades },
    abilityUpgrades: { ...gameState.abilityUpgrades },
    cycleCount: gameState.cycleCount,
    shownEvolutionStages: [...(gameState.shownEvolutionStages || [])],
  };
  try { localStorage.setItem(CHECKPOINT_KEY, JSON.stringify(stageCheckpoint)); }
  catch (e) { console.error("チェックポイント保存失敗:", e); }
}

function loadCheckpoint() {
  try {
    const str = localStorage.getItem(CHECKPOINT_KEY);
    if (!str) return false;
    stageCheckpoint = JSON.parse(str);
    return true;
  } catch (e) { return false; }
}

function restoreFromCheckpoint() {
  if (!stageCheckpoint) return;
  gameState.neurons = BigInt(stageCheckpoint.neurons);
  gameState.totalNeurons = BigInt(stageCheckpoint.totalNeurons);
  gameState.stageNeurons = BigInt(stageCheckpoint.stageNeurons || "0");
  gameState.currentStageIndex = stageCheckpoint.currentStageIndex;
  gameState.upgrades = { ...stageCheckpoint.upgrades };
  gameState.abilityUpgrades = { ...(stageCheckpoint.abilityUpgrades || {}) };
  gameState.cycleCount = stageCheckpoint.cycleCount || 1;
  gameState.shownEvolutionStages = [...(stageCheckpoint.shownEvolutionStages || [])];

  autoAccumulator = 0n;
  cycleEffectFired = false;

  recalculateProduction();
  const stage = gameData.stages[gameState.currentStageIndex];
  applyStageTheme(stage);
  updateSynapseParams();
  synapseState.particles = [];
  respawnParticles();
  rebuildOrbitalNodes();
  if (audioManager.initialized) audioManager.setStage(gameState.currentStageIndex);

  document.getElementById("reset-modal").classList.add("hidden");
  document.getElementById("cycle-modal").classList.add("hidden");

  updateAllUI();
  saveGame();
  showNotification(`${stage.name} の最初からやり直しました`);
}

// ========================================
// リセット
// ========================================

function openResetModal() {
  const modal = document.getElementById("reset-modal");
  document.getElementById("reset-step-select").classList.remove("hidden");
  document.getElementById("reset-step-confirm").classList.add("hidden");
  const stageLabel = document.getElementById("reset-checkpoint-stage");
  if (stageCheckpoint && gameData) {
    const stage = gameData.stages[stageCheckpoint.currentStageIndex];
    stageLabel.textContent = stage ? stage.name : "";
  } else stageLabel.textContent = "";
  modal.classList.remove("hidden");
}

function closeResetModal(returnToOption) {
  document.getElementById("reset-modal").classList.add("hidden");
  if (returnToOption) openOptionModal();
}
function showFullResetConfirm() { document.getElementById("reset-step-select").classList.add("hidden"); document.getElementById("reset-step-confirm").classList.remove("hidden"); }
function executeFullReset() {
  const prefix = "neuralAscension_";
  const keysToDelete = [];
  for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); if (key && key.startsWith(prefix)) keysToDelete.push(key); }
  for (const key of keysToDelete) localStorage.removeItem(key);
  location.reload();
}
function cancelFullReset() { document.getElementById("reset-step-confirm").classList.add("hidden"); document.getElementById("reset-step-select").classList.remove("hidden"); }

// ========================================
// 統計モーダル
// ========================================

function showStatsModal() {
  updateStatsContent();
  document.getElementById("stats-modal").classList.remove("hidden");
}

function closeStatsModal(returnToOption) {
  document.getElementById("stats-modal").classList.add("hidden");
  if (returnToOption) openOptionModal();
}

function updateStatsContent() {
  const s = gameState;
  const stage = gameData.stages[s.currentStageIndex];

  // 基本情報
  document.getElementById("stats-neurons").textContent = formatBigInt(s.neurons);
  document.getElementById("stats-total-neurons").textContent = formatBigInt(s.totalNeurons);
  const allTimeTotal = s.totalNeuronsAllTime + s.totalNeurons;
  document.getElementById("stats-alltime-neurons").textContent = formatBigInt(allTimeTotal);

  // 生産
  document.getElementById("stats-per-click").textContent = formatBigInt(getEffectiveClick());
  document.getElementById("stats-per-sec").textContent = formatBigInt(getEffectiveNps());

  // プレイ統計
  document.getElementById("stats-total-clicks").textContent = s.totalClicks.toLocaleString();
  document.getElementById("stats-overclock-count").textContent = s.overclockBuffPurchaseCount.toLocaleString();
  document.getElementById("stats-inspiration-count").textContent = s.totalInspirationCount.toLocaleString();

  // 進行状況
  document.getElementById("stats-stage").textContent = stage ? stage.name : "-";
  document.getElementById("stats-cycle").textContent = `サイクル ${s.cycleCount}`;
  const permMul = getCyclePermanentMul();
  document.getElementById("stats-perm-mul").textContent = `×${(permMul.num / 100).toFixed(1)}`;

  // アップグレード
  const synapseOwned = countAbilityByPrefix("synapse_enhance_");
  const autoOwned = countAbilityByPrefix("auto_enhance_");
  const mulOwned = countAbilityByPrefix("mul_enhance_");
  document.getElementById("stats-synapse-count").textContent = synapseOwned;
  document.getElementById("stats-auto-enhance-count").textContent = autoOwned;
  document.getElementById("stats-mul-count").textContent = mulOwned;

  const totalAbility = gameData.abilityUpgrades ? gameData.abilityUpgrades.length : 0;
  const ownedAbility = gameData.abilityUpgrades
    ? gameData.abilityUpgrades.filter(a => s.abilityUpgrades[a.id]).length : 0;
  document.getElementById("stats-ability-progress").textContent = `${ownedAbility} / ${totalAbility}`;

  // 時間
  const elapsed = Math.floor((Date.now() - s.playStartTime) / 1000);
  document.getElementById("stats-playtime").textContent = formatPlayTime(elapsed);
}

function countAbilityByPrefix(prefix) {
  let count = 0;
  if (!gameData.abilityUpgrades) return 0;
  for (const ab of gameData.abilityUpgrades) {
    if (ab.id.startsWith(prefix) && gameState.abilityUpgrades[ab.id]) count++;
  }
  return count;
}

function formatPlayTime(totalSeconds) {
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return `${days}日 ${hours}時間 ${minutes}分`;
  if (hours > 0) return `${hours}時間 ${minutes}分 ${seconds}秒`;
  if (minutes > 0) return `${minutes}分 ${seconds}秒`;
  return `${seconds}秒`;
}

function showNotification(message) {
  const container = document.getElementById("notification-container");
  const notif = document.createElement("div");
  notif.className = "notification";
  notif.textContent = message;
  container.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

function showBuffAnnounce(message, color) {
  const container = document.getElementById("buff-announce-container");
  if (!container) return;
  const el = document.createElement("div");
  el.className = "buff-announce-item";
  el.textContent = message;
  el.style.color = color;
  container.appendChild(el);
  setTimeout(() => el.remove(), 5000);
}

// ========================================
// セーブ / ロード
// ========================================

function saveGame() {
  const saveData = {
    version: 2,
    neurons: gameState.neurons.toString(),
    totalNeurons: gameState.totalNeurons.toString(),
    stageNeurons: gameState.stageNeurons.toString(),
    currentStageIndex: gameState.currentStageIndex,
    upgrades: { ...gameState.upgrades },
    abilityUpgrades: { ...gameState.abilityUpgrades },
    overclockBuffPct: gameState.overclockBuffPct,
    overclockBuffEndTime: gameState.overclockBuffEndTime,
    overclockBuffPurchaseCount: gameState.overclockBuffPurchaseCount,
    inspirationBuffPct: gameState.inspirationBuffPct,
    inspirationEndTime: gameState.inspirationEndTime,
    inspirationCooldownEnd: gameState.inspirationCooldownEnd,
    cycleCount: gameState.cycleCount,
    shownEvolutionStages: gameState.shownEvolutionStages || [],
    endingSeen: gameState.endingSeen || false,
    lastSaved: Date.now(),
    totalClicks: gameState.totalClicks || 0,
    totalInspirationCount: gameState.totalInspirationCount || 0,
    totalNeuronsAllTime: gameState.totalNeuronsAllTime.toString(),
    playStartTime: gameState.playStartTime || Date.now(),
  };
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(saveData)); }
  catch (e) { console.error("セーブに失敗しました:", e); }
}

function loadGame() {
  const savedStr = localStorage.getItem(SAVE_KEY);
  if (!savedStr) return false;
  try {
    const data = JSON.parse(savedStr);

    // 旧バージョン検出
    if (!data.version || data.version < 2) {
      setTimeout(() => {
        showNotification("ゲームがリニューアルされました！ データをリセットします。");
        localStorage.removeItem(SAVE_KEY);
        localStorage.removeItem(CHECKPOINT_KEY);
      }, 500);
      return false;
    }

    gameState.neurons = BigInt(data.neurons || "0");
    gameState.totalNeurons = BigInt(data.totalNeurons || "0");
    gameState.stageNeurons = BigInt(data.stageNeurons || "0");
    gameState.currentStageIndex = data.currentStageIndex || 0;
    gameState.upgrades = data.upgrades || {};
    gameState.abilityUpgrades = data.abilityUpgrades || {};
    gameState.overclockBuffPct = data.overclockBuffPct || 100;
    gameState.overclockBuffEndTime = data.overclockBuffEndTime || 0;
    gameState.overclockBuffPurchaseCount = data.overclockBuffPurchaseCount || 0;
    gameState.inspirationBuffPct = data.inspirationBuffPct || 100;
    gameState.inspirationEndTime = data.inspirationEndTime || 0;
    gameState.inspirationCooldownEnd = data.inspirationCooldownEnd || 0;
    gameState.cycleCount = data.cycleCount || 1;
    gameState.shownEvolutionStages = data.shownEvolutionStages || [];
    gameState.endingSeen = data.endingSeen || false;
    gameState.totalClicks = data.totalClicks || 0;
    gameState.totalInspirationCount = data.totalInspirationCount || 0;
    gameState.totalNeuronsAllTime = BigInt(data.totalNeuronsAllTime || "0");
    gameState.playStartTime = data.playStartTime || Date.now();

    recalculateProduction();

    // オフライン進行
    const lastSaved = data.lastSaved || Date.now();
    const elapsedMs = Date.now() - lastSaved;
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    if (elapsedSeconds > 0 && gameState.neuronsPerSecond > 0n) {
      const offlineGain = gameState.neuronsPerSecond * BigInt(elapsedSeconds);
      gameState.neurons += offlineGain;
      gameState.totalNeurons += offlineGain;
      gameState.stageNeurons += offlineGain;
      if (elapsedSeconds >= 5) {
        setTimeout(() => showOfflineModal(elapsedSeconds, offlineGain), 500);
      }
    }

    // サイクル完了済みチェック
    const finalIndex = gameData.stages.length - 1;
    if (gameState.currentStageIndex === finalIndex) cycleEffectFired = true;

    if (!loadCheckpoint()) saveCheckpoint();
    return true;
  } catch (e) { console.error("セーブデータの読み込みに失敗しました:", e); return false; }
}

// ========================================
// オーディオ統合
// ========================================

function calculateAudioIntensity() {
  if (!gameState) return 0;
  const neuronDigits = gameState.neurons.toString().length;
  const perSecDigits = gameState.neuronsPerSecond.toString().length;
  const neuronFactor = Math.min(1, Math.max(0, (neuronDigits - 1) / 19));
  const speedFactor = Math.min(1, Math.max(0, (perSecDigits - 1) / 14));
  return Math.min(1, neuronFactor * 0.6 + speedFactor * 0.4);
}

function setupAudioControls() {
  const ambientSlider = document.getElementById("ambient-slider");
  const sfxSlider = document.getElementById("sfx-slider");
  const muteBtn = document.getElementById("mute-btn");
  ambientSlider.addEventListener("input", () => audioManager.setAmbientVolume(ambientSlider.value / 100));
  sfxSlider.addEventListener("input", () => audioManager.setSfxVolume(sfxSlider.value / 100));
  muteBtn.addEventListener("click", () => {
    const newMuted = !audioManager.muted;
    audioManager.setMute(newMuted);
    muteBtn.textContent = newMuted ? "UNMUTE" : "MUTE";
    muteBtn.classList.toggle("muted", newMuted);
  });
}

function openOptionModal() {
  document.getElementById("option-modal").classList.remove("hidden");
}

function closeOptionModal() {
  document.getElementById("option-modal").classList.add("hidden");
}

// ========================================
// デバッグモード
// ========================================

function toggleDebugMode() {
  debugMode = !debugMode;
  document.getElementById("debug-panel").classList.toggle("hidden", !debugMode);
  if (debugMode) { showNotification("DEBUG MODE: ON"); buildDebugStageButtons(); }
  else showNotification("DEBUG MODE: OFF");
}

function buildDebugStageButtons() {
  const container = document.getElementById("debug-stage-buttons");
  container.innerHTML = "";
  gameData.stages.forEach((stage, index) => {
    const btn = document.createElement("button");
    btn.type = "button"; btn.textContent = stage.name;
    btn.addEventListener("click", () => debugSetStage(index));
    container.appendChild(btn);
  });
}

function debugAddNeurons(amount) {
  gameState.neurons += amount;
  gameState.totalNeurons += amount;
  gameState.stageNeurons += amount;
  updateAllUI();
  showNotification(`DEBUG: +${formatBigInt(amount)} neurons`);
}

function debugSetStage(stageIndex) {
  if (stageIndex < 0 || stageIndex >= gameData.stages.length) return;
  gameState.currentStageIndex = stageIndex;
  const stage = gameData.stages[stageIndex];
  applyStageTheme(stage);
  updateSynapseParams();
  respawnParticles();
  audioManager.setStage(stageIndex);
  recalculateProduction();
  updateAllUI();
  showNotification(`DEBUG: Stage → ${stage.name}`);
}

function debugResetSave() {
  if (!confirm("セーブデータを完全に削除しますか？")) return;
  localStorage.removeItem(SAVE_KEY);
  gameState = createInitialState();
  autoAccumulator = 0n;
  const stage = gameData.stages[0];
  applyStageTheme(stage);
  updateSynapseParams();
  synapseState.particles = [];
  respawnParticles();
  rebuildOrbitalNodes();
  recalculateProduction();
  document.getElementById("cycle-modal").classList.add("hidden");
  updateAllUI();
  showNotification("DEBUG: セーブデータを初期化しました");
}

function debugMaxAllUpgrades() {
  for (const upgrade of gameData.upgrades) {
    gameState.upgrades[upgrade.id] = 50;
  }
  if (gameData.abilityUpgrades) {
    for (const ab of gameData.abilityUpgrades) {
      gameState.abilityUpgrades[ab.id] = true;
    }
  }
  recalculateProduction();
  updateSynapseParams();
  respawnParticles();
  rebuildOrbitalNodes();
  buildUpgradeList();
  updateAllUI();
  showNotification("DEBUG: 全Upgradeを最大購入しました");
}

function debugCycleReady() {
  const finalIndex = gameData.stages.length - 1;
  if (gameState.currentStageIndex !== finalIndex) debugSetStage(finalIndex);
  const threshold = getStageThreshold(finalIndex);
  const stageThreshold = getStageThreshold(finalIndex);
  if (gameState.stageNeurons < stageThreshold) {
    const needed = stageThreshold - gameState.stageNeurons + 1n;
    gameState.neurons += needed;
    gameState.totalNeurons += needed;
    gameState.stageNeurons += needed;
  }
  updateAllUI();
  showNotification("DEBUG: サイクル完了条件達成");
}

function debugToggleSpeed() {
  gameSpeed = gameSpeed === 1 ? 10 : 1;
  document.getElementById("debug-speed-btn").textContent = `速度10倍: ${gameSpeed === 10 ? "ON" : "OFF"}`;
  showNotification(`DEBUG: 速度 ×${gameSpeed}`);
}

function setupDebugPanel() {
  document.querySelectorAll("#debug-neuron-buttons button").forEach(btn => {
    btn.addEventListener("click", () => debugAddNeurons(BigInt(btn.dataset.amount)));
  });
  document.getElementById("debug-maxall-btn").addEventListener("click", debugMaxAllUpgrades);
  document.getElementById("debug-cycle-btn").addEventListener("click", debugCycleReady);
  document.getElementById("debug-reset-btn").addEventListener("click", debugResetSave);
  document.getElementById("debug-speed-btn").addEventListener("click", debugToggleSpeed);

  document.addEventListener("keydown", (e) => {
    if (e.key === "d" || e.key === "D") {
      dKeyCount++;
      clearTimeout(dKeyTimer);
      dKeyTimer = setTimeout(() => dKeyCount = 0, DEBUG_KEY_TIMEOUT_MS);
      if (dKeyCount >= DEBUG_KEY_COUNT) { toggleDebugMode(); dKeyCount = 0; }
    }
  });
}

// ========================================
// ゲーム初期化
// ========================================

async function initGame() {
  try {
    const response = await fetch("gameData.json");
    if (!response.ok) throw new Error(`gameData.json の読み込みに失敗: ${response.status}`);
    gameData = await response.json();

    stageIndexMap = {};
    gameData.stages.forEach((stage, index) => stageIndexMap[stage.id] = index);

    gameState = createInitialState();
    const loaded = loadGame();

    if (!loaded) {
      recalculateProduction();
      saveCheckpoint();
      showNotification("ニューロンの旅が始まる...");
    }

    const currentStage = gameData.stages[gameState.currentStageIndex];
    applyStageTheme(currentStage);
    recalculateProduction();

    updateAllUI();
    setupTabButtons();
    setupDebugPanel();
    setupAudioControls();
    initSynapseAnimation();
    rebuildOrbitalNodes();

    document.getElementById("brain-core").addEventListener("click", handleBrainClick);
    document.getElementById("evolve-btn").addEventListener("click", performEvolution);

    // サイクルボタン → 確認モーダル
    document.getElementById("cycle-btn").addEventListener("click", () => {
      const modal = document.getElementById("cycle-modal");
      const nextCycle = gameState.cycleCount + 1;
      const pMul = GameLogic.getCyclePermanentMultiplier(nextCycle, (gameData.config.cycleSystem && gameData.config.cycleSystem.permanentMultiplierBase) || 0.6);
      document.getElementById("cycle-modal-info").textContent = `サイクル ${nextCycle} — 永続乗数 ×${(pMul.num / 100).toFixed(1)}`;
      modal.classList.remove("hidden");
    });
    document.getElementById("cycle-confirm-btn").addEventListener("click", performCycleReset);
    document.getElementById("cycle-cancel-btn").addEventListener("click", () => document.getElementById("cycle-modal").classList.add("hidden"));
    document.getElementById("ending-ok-btn").addEventListener("click", () => {
      document.getElementById("ending-modal").classList.add("hidden");
      // エンディング後、サイクルエフェクト＆ボタン有効化
      if (!cycleEffectFired) {
        cycleEffectFired = true;
        fireCycleEffect();
      }
      const btn = document.getElementById("cycle-btn");
      btn.classList.remove("hidden");
      btn.disabled = false;
    });

    document.getElementById("option-btn").addEventListener("click", openOptionModal);
    document.getElementById("option-close-btn").addEventListener("click", closeOptionModal);
    document.getElementById("option-modal").addEventListener("click", (e) => {
      if (e.target.id === "option-modal") closeOptionModal();
    });
    document.getElementById("option-stats-btn").addEventListener("click", () => {
      closeOptionModal();
      showStatsModal();
    });
    document.getElementById("option-reset-btn").addEventListener("click", () => {
      closeOptionModal();
      openResetModal();
    });

    document.getElementById("stats-close-btn").addEventListener("click", () => closeStatsModal(true));
    document.getElementById("stats-modal").addEventListener("click", (e) => {
      if (e.target.id === "stats-modal") closeStatsModal(true);
    });
    document.getElementById("reset-checkpoint-btn").addEventListener("click", restoreFromCheckpoint);
    document.getElementById("reset-full-btn").addEventListener("click", showFullResetConfirm);
    document.getElementById("reset-full-confirm-btn").addEventListener("click", executeFullReset);
    document.getElementById("reset-full-cancel-btn").addEventListener("click", cancelFullReset);
    document.getElementById("reset-cancel-btn").addEventListener("click", () => closeResetModal(true));

    tickIntervalId = setInterval(gameTick, TICK_INTERVAL_MS);
    saveIntervalId = setInterval(saveGame, SAVE_INTERVAL_MS);

    console.log("NEURAL ASCENSION v2 initialized successfully.");
  } catch (error) {
    console.error("ゲームの初期化に失敗しました:", error);
    document.body.innerHTML = `
      <div style="color: #ff4466; padding: 40px; text-align: center; font-family: monospace;">
        <h1>ERROR</h1>
        <p>ゲームデータの読み込みに失敗しました。</p>
        <p>HTTPサーバー経由でアクセスしてください。</p>
        <p style="color: #888; font-size: 0.8rem; margin-top: 20px;">例: python -m http.server 8000</p>
        <p style="color: #555; font-size: 0.7rem; margin-top: 10px;">${error.message}</p>
      </div>
    `;
  }
}

document.addEventListener("DOMContentLoaded", initGame);
