#!/usr/bin/env node
/**
 * NEURAL ASCENSION — 到達時間シミュレーター
 *
 * 前提:
 * - クリックなし（自動生産のみ）
 * - 毎秒、最もコスト効率の良いアップグレードを購入
 * - 壁ステージではwallbreaker→key の順に優先購入
 * - ルートは cyber（自動生産2倍）を選択
 * - primal upgradeの上限: synapse_spark 30, instinct 30, curiosity 8
 * - 進化可能になったら即進化
 */

"use strict";

const fs = require("fs");
const path = require("path");

const gameData = JSON.parse(
  fs.readFileSync(path.join(__dirname, "gameData.json"), "utf-8")
);

// ========================================
// 設定
// ========================================
const ROUTE = "cyber"; // "bio" or "cyber"
const CLICKS_PER_SEC = 5; // 一般的なプレイヤーの連打速度
const COST_GROWTH_NUM = 135n;
const COST_GROWTH_DEN = 100n;
const MUL_COST_GROWTH_NUM = 200n;
const MUL_COST_GROWTH_DEN = 100n;

// ステージID → index マップ
const stageIndexMap = {};
gameData.stages.forEach((s, i) => (stageIndexMap[s.id] = i));

// 閾値
const thresholds = gameData.config.stageThreshold.map((s) => BigInt(s));

// 適合度テーブル
const obsolescenceTable = gameData.config.obsolescencePctByDiff;

// ========================================
// シミュレーション状態
// ========================================
let state = {
  neurons: 0n,
  totalNeurons: 0n,
  currentStageIndex: 0,
  upgrades: {},    // id → count
  route: null,
  time: 0,         // 経過秒数
};

// ========================================
// ヘルパー関数
// ========================================

function getObsolescencePct(upgrade) {
  if (upgrade.type === "wallbreaker" || upgrade.type === "key") return 100;
  if (upgrade.category === "primal") return 100;
  const upgradeStageIndex = stageIndexMap[upgrade.stageRequired] || 0;
  const diff = Math.max(0, state.currentStageIndex - upgradeStageIndex);
  return diff < obsolescenceTable.length
    ? obsolescenceTable[diff]
    : obsolescenceTable[obsolescenceTable.length - 1];
}

function getEffectiveCostPct() {
  const mod = gameData.config.stageModifiers[state.currentStageIndex];
  if (!mod || !mod.costPct) return 100;
  // キー購入済みなら100
  for (const u of gameData.upgrades) {
    if (u.type !== "key") continue;
    if (u.gatesEvolutionFrom !== state.currentStageIndex) continue;
    if ((state.upgrades[u.id] || 0) > 0) return 100;
  }
  return mod.costPct;
}

function getUpgradeCost(upgrade) {
  const owned = BigInt(state.upgrades[upgrade.id] || 0);
  const base = BigInt(upgrade.baseCost);
  const costPct = BigInt(getEffectiveCostPct());

  let cost = base;
  const isMultiplier = upgrade.type === "multiplier" && !upgrade.category;
  const growthNum = isMultiplier ? MUL_COST_GROWTH_NUM : COST_GROWTH_NUM;
  const growthDen = isMultiplier ? MUL_COST_GROWTH_DEN : COST_GROWTH_DEN;

  for (let i = 0n; i < owned; i++) {
    cost = (cost * growthNum) / growthDen;
  }
  return (cost * costPct) / 100n;
}

function isUnlocked(upgrade) {
  const reqIdx = stageIndexMap[upgrade.stageRequired];
  if (reqIdx === undefined) return true;
  if (state.currentStageIndex < reqIdx) return false;
  if (upgrade.requiresUpgrade) {
    if ((state.upgrades[upgrade.requiresUpgrade] || 0) === 0) return false;
  }
  return true;
}

function getMaxOwned(upgrade) {
  if (upgrade.type === "wallbreaker" || upgrade.type === "key") return 1;
  if (upgrade.maxOwned) return upgrade.maxOwned;
  return 999;
}

function recalcProduction() {
  let baseClick = 1n;
  let baseAuto = 0n;
  let mulNum = 1n;
  let mulDen = 1n;

  for (const upgrade of gameData.upgrades) {
    const owned = state.upgrades[upgrade.id] || 0;
    if (owned === 0) continue;
    if (upgrade.type === "wallbreaker" || upgrade.type === "key") continue;

    const effect = BigInt(upgrade.effect);
    const ownedBig = BigInt(owned);
    const pct = BigInt(getObsolescencePct(upgrade));

    switch (upgrade.type) {
      case "click":
        baseClick += (effect * ownedBig * pct) / 100n;
        break;
      case "auto":
        baseAuto += (effect * ownedBig * pct) / 100n;
        break;
      case "multiplier":
        mulNum *= 100n + (effect - 1n) * ownedBig * pct;
        mulDen *= 100n;
        break;
    }
  }

  // ルート補正
  let routeClickMul = 100n, routeAutoMul = 100n;
  if (state.route) {
    const rm = gameData.config.routeMultipliers[state.route];
    routeClickMul = BigInt(rm.click);
    routeAutoMul = BigInt(rm.nps);
  }

  const npc = (baseClick * mulNum * routeClickMul) / (mulDen * 100n);
  const nps = (baseAuto * mulNum * routeAutoMul) / (mulDen * 100n);
  return { npc, nps };
}

function canEvolve() {
  const nextIdx = state.currentStageIndex + 1;
  if (nextIdx >= gameData.stages.length) return false;
  if (state.totalNeurons < thresholds[nextIdx]) return false;
  // キーチェック
  for (const u of gameData.upgrades) {
    if (u.type !== "key") continue;
    if (u.gatesEvolutionFrom !== state.currentStageIndex) continue;
    if ((state.upgrades[u.id] || 0) === 0) return false;
  }
  return true;
}

function getConvergenceProgress() {
  const finalIdx = gameData.stages.length - 1;
  if (state.currentStageIndex !== finalIdx) return 0;
  const threshold = thresholds[finalIdx];
  const mul = BigInt(gameData.config.convergenceMultiplier || 5);
  const target = threshold * mul;
  if (target === 0n) return 100;
  const earned = state.totalNeurons - threshold;
  if (earned <= 0n) return 0;
  return Math.min(100, Number((earned * 100n) / target));
}

// ========================================
// 購入戦略: 最もNPS効率の良いアップグレードを貪欲に購入
// ========================================
function getBestPurchase() {
  const { nps: currentNps } = recalcProduction();
  let bestUpgrade = null;
  let bestEfficiency = 0n; // (nps増分 * 1e12) / cost  で比較
  let bestCost = 0n;

  for (const upgrade of gameData.upgrades) {
    if (!isUnlocked(upgrade)) continue;
    const owned = state.upgrades[upgrade.id] || 0;
    if (owned >= getMaxOwned(upgrade)) continue;

    const cost = getUpgradeCost(upgrade);
    if (cost <= 0n) continue;

    // wallbreaker/keyは優先購入（買えるなら即買い）
    if (upgrade.type === "wallbreaker" || upgrade.type === "key") {
      if (state.neurons >= cost) {
        return { upgrade, cost, priority: true };
      }
      continue;
    }

    // NPS増分をシミュレート
    state.upgrades[upgrade.id] = owned + 1;
    const { nps: newNps } = recalcProduction();
    state.upgrades[upgrade.id] = owned; // 戻す

    const npsDelta = newNps - currentNps;
    if (npsDelta <= 0n) continue;

    // 効率 = npsDelta / cost （BigIntで比較するためスケーリング）
    const efficiency = (npsDelta * 1000000000000n) / cost;
    if (efficiency > bestEfficiency) {
      bestEfficiency = efficiency;
      bestUpgrade = upgrade;
      bestCost = cost;
    }
  }

  if (bestUpgrade) {
    return { upgrade: bestUpgrade, cost: bestCost, priority: false };
  }
  return null;
}

// ========================================
// メインシミュレーションループ
// ========================================
function formatTime(seconds) {
  if (seconds < 60) return `${seconds}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${seconds % 60}秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h < 24) return `${h}時間${m}分`;
  const d = Math.floor(h / 24);
  return `${d}日${h % 24}時間${m}分`;
}

function formatBigInt(n) {
  if (n < 1000n) return n.toString();
  const suffixes = ["", "K", "M", "B", "T", "Qa", "Qi", "Sx", "Sp", "Oc"];
  let idx = 0;
  let val = n;
  while (val >= 1000n && idx < suffixes.length - 1) {
    val = val / 1000n;
    idx++;
  }
  return val.toString() + suffixes[idx];
}

function simulate() {
  console.log("=== NEURAL ASCENSION 到達時間シミュレーション ===");
  console.log(`ルート: ${ROUTE} | クリック/秒: ${CLICKS_PER_SEC}`);
  console.log(`収束倍率: ×${gameData.config.convergenceMultiplier}`);
  console.log("");

  const stageEntryTimes = [];
  let lastLogTime = 0;

  while (true) {
    const { npc, nps } = recalcProduction();

    // 1秒経過
    const gain = nps + npc * BigInt(CLICKS_PER_SEC);
    state.neurons += gain;
    state.totalNeurons += gain;
    state.time++;

    // 購入ループ（1秒に複数購入可能）
    let purchased = true;
    while (purchased) {
      purchased = false;
      const best = getBestPurchase();
      if (best && state.neurons >= best.cost) {
        state.neurons -= best.cost;
        state.upgrades[best.upgrade.id] =
          (state.upgrades[best.upgrade.id] || 0) + 1;
        purchased = true;
      }
    }

    // 進化チェック
    if (canEvolve()) {
      const prevStage = state.currentStageIndex;
      state.currentStageIndex++;
      const stageName = gameData.stages[state.currentStageIndex].name;
      stageEntryTimes.push({
        stage: state.currentStageIndex,
        name: stageName,
        time: state.time,
      });
      console.log(
        `[${formatTime(state.time)}] ▲ Stage ${state.currentStageIndex}: ${stageName}` +
        ` | NPS: ${formatBigInt(recalcProduction().nps)}/s` +
        ` | Total: ${formatBigInt(state.totalNeurons)}`
      );

      // ルート選択（stage 4到達時）
      if (state.currentStageIndex >= 4 && !state.route) {
        state.route = ROUTE;
        console.log(`  → ルート選択: ${ROUTE.toUpperCase()}`);
      }
    }

    // 収束チェック
    const convPct = getConvergenceProgress();
    if (convPct >= 100) {
      console.log("");
      console.log(`[${formatTime(state.time)}] ★ 宇宙収束率 100% 到達！`);
      console.log(`  総ニューロン: ${formatBigInt(state.totalNeurons)}`);
      console.log(`  NPS: ${formatBigInt(recalcProduction().nps)}/s`);
      break;
    }

    // 定期ログ（stage7以降、10%刻み）
    if (state.currentStageIndex === gameData.stages.length - 1) {
      if (convPct > 0 && convPct % 10 === 0 && convPct !== lastLogTime) {
        lastLogTime = convPct;
        console.log(
          `  [${formatTime(state.time)}] 収束率: ${convPct}%` +
          ` | NPS: ${formatBigInt(recalcProduction().nps)}/s`
        );
      }
    }

    // 安全弁: 365日超えたら打ち切り
    if (state.time > 365 * 24 * 3600) {
      console.log("");
      console.log(`[打ち切り] 365日経過しても収束100%に到達せず`);
      console.log(`  現在の収束率: ${convPct}%`);
      console.log(`  NPS: ${formatBigInt(recalcProduction().nps)}/s`);
      break;
    }
  }

  // サマリー
  console.log("");
  console.log("=== ステージ到達タイムライン ===");
  for (const entry of stageEntryTimes) {
    console.log(`  Stage ${entry.stage} (${entry.name}): ${formatTime(entry.time)}`);
  }
  console.log(`  収束100%: ${formatTime(state.time)}`);
  console.log("");

  // アップグレード最終状態
  console.log("=== 最終アップグレード状態 ===");
  for (const u of gameData.upgrades) {
    const owned = state.upgrades[u.id] || 0;
    if (owned > 0) {
      console.log(`  ${u.name}: ${owned}個`);
    }
  }
}

simulate();
