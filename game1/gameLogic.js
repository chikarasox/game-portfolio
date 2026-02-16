// ========================================
// NEURAL ASCENSION - ゲームロジックモジュール（純粋関数）
// ========================================
// テスト容易性のために副作用のない純粋関数を提供する。
// ブラウザでは window.GameLogic、Node.js では module.exports で利用可能。

"use strict";

const GameLogic = (() => {

  // ----------------------------------------
  // 最終生産値の計算（簡素化版）
  // ----------------------------------------

  /**
   * 最終クリック値を全修飾子込みで計算する。
   *
   * @param {bigint} baseClick      - 基礎クリック値（能力UG乗数適用済み）
   * @param {number} stageIndex     - 現在のステージインデックス
   * @param {number} cyclePermanentNum - サイクル永続乗数の分子
   * @param {number} cyclePermanentDen - サイクル永続乗数の分母
   * @param {number} buffPct        - 合成バフ倍率（100=通常）
   * @param {object} config         - gameData.config
   * @returns {bigint}
   */
  function calculateFinalClick(baseClick, stageIndex, cyclePermanentNum, cyclePermanentDen, buffPct, config) {
    if (!config) return baseClick;

    const stageMult = BigInt((config.stageMultiplier && config.stageMultiplier[stageIndex]) || 100);
    const cycleNum = BigInt(cyclePermanentNum);
    const cycleDen = BigInt(cyclePermanentDen);
    const buff = BigInt(buffPct);

    // base * stageMult/100 * cycleNum/cycleDen * buff/100
    const numerator = baseClick * stageMult * cycleNum * buff;
    const denominator = 100n * cycleDen * 100n;

    const result = numerator / denominator;
    return result > 0n ? result : 1n;
  }

  /**
   * 最終 NPS 値を全修飾子込みで計算する。
   */
  function calculateFinalNps(baseNps, stageIndex, cyclePermanentNum, cyclePermanentDen, buffPct, config) {
    if (baseNps === 0n) return 0n;
    if (!config) return baseNps;

    const stageMult = BigInt((config.stageMultiplier && config.stageMultiplier[stageIndex]) || 100);
    const cycleNum = BigInt(cyclePermanentNum);
    const cycleDen = BigInt(cyclePermanentDen);
    const buff = BigInt(buffPct);

    const numerator = baseNps * stageMult * cycleNum * buff;
    const denominator = 100n * cycleDen * 100n;

    return numerator / denominator;
  }

  // ----------------------------------------
  // サイクル永続乗数
  // ----------------------------------------

  /**
   * サイクル永続乗数を分数で返す。
   * P(cycle) = 1 + 0.6 × (cycle - 1)
   * → num = 100 + 60*(cycle-1), den = 100
   * @param {number} cycleCount - サイクル番号（1始まり）
   * @param {number} permanentMultiplierBase - 0.6
   * @returns {{ num: number, den: number }}
   */
  function getCyclePermanentMultiplier(cycleCount, permanentMultiplierBase) {
    const base = permanentMultiplierBase || 0.6;
    const num = 100 + Math.round(base * 100) * (cycleCount - 1);
    const den = 100;
    return { num, den };
  }

  /**
   * サイクル適用後のステージ閾値を計算する。
   * T(cycle) = base * P(cycle) * thresholdGrowthBase^(cycle-1)
   * @param {bigint} baseThreshold - 基礎閾値
   * @param {number} cycleCount - サイクル番号
   * @param {number} permanentMultiplierBase - 0.6
   * @param {number} thresholdGrowthBase - 1.1
   * @returns {bigint}
   */
  function getCycleScaledThreshold(baseThreshold, cycleCount, permanentMultiplierBase, thresholdGrowthBase) {
    if (cycleCount <= 1) return baseThreshold;

    const pMul = getCyclePermanentMultiplier(cycleCount, permanentMultiplierBase);
    // thresholdGrowthBase^(cycle-1) を分数で表現（精度: 小数4桁）
    const growthPow = Math.pow(thresholdGrowthBase || 1.1, cycleCount - 1);
    const growthNum = Math.round(growthPow * 10000);
    const growthDen = 10000;

    const result = baseThreshold * BigInt(pMul.num) * BigInt(growthNum) / (BigInt(pMul.den) * BigInt(growthDen));
    return result > 0n ? result : 1n;
  }

  // ----------------------------------------
  // 公開 API
  // ----------------------------------------

  return {
    calculateFinalClick,
    calculateFinalNps,
    getCyclePermanentMultiplier,
    getCycleScaledThreshold,
  };

})();

// Node.js / テスト環境用エクスポート
if (typeof module !== "undefined" && module.exports) {
  module.exports = GameLogic;
}
