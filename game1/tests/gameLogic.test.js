// ========================================
// NEURAL ASCENSION v2 - GameLogic テスト
// ========================================
import { describe, it, expect } from "vitest";
import GameLogic from "../gameLogic.js";

// テスト用の config オブジェクト（v2版）
const testConfig = {
  stageMultiplier: [100, 110, 120, 140, 160, 185, 215, 250],
  cycleSystem: {
    permanentMultiplierBase: 0.6,
    thresholdGrowthBase: 1.1,
  },
};

// ========================================
// calculateFinalClick テスト
// ========================================
describe("calculateFinalClick", () => {
  const base = 100n;

  it("基本的なクリック値を返す（サイクル1、バフなし）", () => {
    // stageMult=100, cycle=100/100, buff=100
    const result = GameLogic.calculateFinalClick(base, 0, 100, 100, 100, testConfig);
    expect(result).toBe(100n);
  });

  it("ステージ乗数が正しく適用される", () => {
    // ステージ1: mult=110 → 100 * 110/100 = 110
    const s1 = GameLogic.calculateFinalClick(base, 1, 100, 100, 100, testConfig);
    expect(s1).toBe(110n);
  });

  it("サイクル永続乗数が正しく適用される", () => {
    // cycle2: num=160, den=100 → 100 * 100/100 * 160/100 = 160
    const result = GameLogic.calculateFinalClick(base, 0, 160, 100, 100, testConfig);
    expect(result).toBe(160n);
  });

  it("バフが正しく適用される", () => {
    // buff=200 → 100 * 100/100 * 100/100 * 200/100 = 200
    const result = GameLogic.calculateFinalClick(base, 0, 100, 100, 200, testConfig);
    expect(result).toBe(200n);
  });

  it("全修飾子の積み重ね", () => {
    // stage1(110%) + cycle(160/100) + buff(250)
    // 100 * 110/100 * 160/100 * 250/100 = 440
    const result = GameLogic.calculateFinalClick(base, 1, 160, 100, 250, testConfig);
    expect(result).toBe(440n);
  });

  it("最小値は1n", () => {
    // buff=0 → result would be 0 → clamped to 1
    const result = GameLogic.calculateFinalClick(1n, 0, 100, 100, 0, testConfig);
    expect(result).toBe(1n);
  });

  it("configがnullの場合はbaseClickを返す", () => {
    const result = GameLogic.calculateFinalClick(base, 0, 100, 100, 100, null);
    expect(result).toBe(100n);
  });
});

// ========================================
// calculateFinalNps テスト
// ========================================
describe("calculateFinalNps", () => {
  const base = 100n;

  it("baseNps が 0n のとき 0n を返す", () => {
    expect(GameLogic.calculateFinalNps(0n, 0, 100, 100, 100, testConfig)).toBe(0n);
  });

  it("基本的なNPS値を返す", () => {
    const result = GameLogic.calculateFinalNps(base, 0, 100, 100, 100, testConfig);
    expect(result).toBe(100n);
  });

  it("ステージ乗数が正しく適用される", () => {
    // ステージ2: mult=120 → 100 * 120/100 = 120
    const s2 = GameLogic.calculateFinalNps(base, 2, 100, 100, 100, testConfig);
    expect(s2).toBe(120n);
  });

  it("サイクル乗数+バフの組み合わせ", () => {
    // cycle(160/100) + buff(160) → 100 * 100/100 * 160/100 * 160/100 = 256
    const result = GameLogic.calculateFinalNps(base, 0, 160, 100, 160, testConfig);
    expect(result).toBe(256n);
  });

  it("configがnullの場合はbaseNpsを返す", () => {
    const result = GameLogic.calculateFinalNps(base, 0, 100, 100, 100, null);
    expect(result).toBe(100n);
  });
});

// ========================================
// getCyclePermanentMultiplier テスト
// ========================================
describe("getCyclePermanentMultiplier", () => {
  it("サイクル1では乗数1.0 (num=100, den=100)", () => {
    const result = GameLogic.getCyclePermanentMultiplier(1, 0.6);
    expect(result.num).toBe(100);
    expect(result.den).toBe(100);
  });

  it("サイクル2では乗数1.6 (num=160, den=100)", () => {
    const result = GameLogic.getCyclePermanentMultiplier(2, 0.6);
    expect(result.num).toBe(160);
    expect(result.den).toBe(100);
  });

  it("サイクル3では乗数2.2 (num=220, den=100)", () => {
    const result = GameLogic.getCyclePermanentMultiplier(3, 0.6);
    expect(result.num).toBe(220);
    expect(result.den).toBe(100);
  });

  it("サイクル5では乗数3.4 (num=340, den=100)", () => {
    const result = GameLogic.getCyclePermanentMultiplier(5, 0.6);
    expect(result.num).toBe(340);
    expect(result.den).toBe(100);
  });

  it("baseが未指定の場合デフォルト0.6が使われる", () => {
    const result = GameLogic.getCyclePermanentMultiplier(2, undefined);
    expect(result.num).toBe(160);
    expect(result.den).toBe(100);
  });
});

// ========================================
// getCycleScaledThreshold テスト
// ========================================
describe("getCycleScaledThreshold", () => {
  it("サイクル1では基礎閾値がそのまま返る", () => {
    const result = GameLogic.getCycleScaledThreshold(1000n, 1, 0.6, 1.1);
    expect(result).toBe(1000n);
  });

  it("サイクル2では閾値がスケーリングされる", () => {
    // P(2) = 160/100, growth = 1.1^1 = 11000/10000
    // 1000 * 160 * 11000 / (100 * 10000) = 1760
    const result = GameLogic.getCycleScaledThreshold(1000n, 2, 0.6, 1.1);
    expect(result).toBe(1760n);
  });

  it("サイクル3ではさらに大きくスケーリングされる", () => {
    // P(3) = 220/100, growth = 1.1^2 ≈ 1.21 → 12100/10000
    // 1000 * 220 * 12100 / (100 * 10000) = 2662
    const result = GameLogic.getCycleScaledThreshold(1000n, 3, 0.6, 1.1);
    expect(result).toBe(2662n);
  });

  it("閾値0でもサイクル2以上では最小値1が返る", () => {
    const result = GameLogic.getCycleScaledThreshold(0n, 5, 0.6, 1.1);
    expect(result).toBe(1n);
  });

  it("結果が0以下にならない（最小値1）", () => {
    // 非常に小さい閾値でも1以上を返す
    const result = GameLogic.getCycleScaledThreshold(1n, 2, 0.6, 1.1);
    expect(result >= 1n).toBe(true);
  });
});

// ========================================
// 統合テスト: ステージ別の生産量
// ========================================
describe("統合テスト: ステージ別生産量", () => {
  it("全ステージで正しい乗数が適用される", () => {
    const base = 1000n;
    const expected = [1000n, 1100n, 1200n, 1400n, 1600n, 1850n, 2150n, 2500n];

    for (let i = 0; i < expected.length; i++) {
      const result = GameLogic.calculateFinalClick(base, i, 100, 100, 100, testConfig);
      expect(result).toBe(expected[i]);
    }
  });

  it("OverClockバフ(250%)でクリック値が2.5倍になる", () => {
    const base = 100n;
    const normal = GameLogic.calculateFinalClick(base, 0, 100, 100, 100, testConfig);
    const buffed = GameLogic.calculateFinalClick(base, 0, 100, 100, 250, testConfig);
    expect(buffed).toBe(normal * 250n / 100n);
  });

  it("ひらめき(160%) + OverClock(250%) の組み合わせバフ", () => {
    // combinedBuff = 160 * 250 / 100 = 400
    const base = 100n;
    const result = GameLogic.calculateFinalClick(base, 0, 100, 100, 400, testConfig);
    expect(result).toBe(400n);
  });

  it("サイクル2での生産量がサイクル1より大きい", () => {
    const base = 100n;
    const cycle1 = GameLogic.calculateFinalClick(base, 0, 100, 100, 100, testConfig);
    const cycle2Mul = GameLogic.getCyclePermanentMultiplier(2, 0.6);
    const cycle2 = GameLogic.calculateFinalClick(base, 0, cycle2Mul.num, cycle2Mul.den, 100, testConfig);
    expect(cycle2 > cycle1).toBe(true);
    expect(cycle2).toBe(160n); // 100 * 160/100
  });
});
