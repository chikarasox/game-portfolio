// ============================================================
// rpg.js - RPGGame、データ定義
// ============================================================

// ============================================================
// 敵定義（データ駆動）- 新規追加
// ============================================================
const ENEMIES = {
    slime: {
        id: 'slime',
        name: 'スライム',
        color: '#4488ff',
        baseHP: 60,
        baseATK: 6,
        baseDEF: 0,
        attackIntervalMs: 1500,
        traits: []
    },
    goblin: {
        id: 'goblin',
        name: 'ゴブリン',
        color: '#44aa44',
        baseHP: 80,
        baseATK: 5,  // 攻撃力控えめ
        baseDEF: 0,
        attackIntervalMs: 700,  // 攻撃頻度が高い
        traits: ['fast_attack']
    },
    skeleton: {
        id: 'skeleton',
        name: 'スケルトン',
        color: '#ccccaa',
        baseHP: 120,
        baseATK: 6,
        baseDEF: 4,  // 防御高め
        attackIntervalMs: 1500,
        traits: ['high_def']
    },
    zombie: {
        id: 'zombie',
        name: 'ゾンビ',
        color: '#88aa66',
        baseHP: 150,
        baseATK: 7,
        baseDEF: 1,
        attackIntervalMs: 1800,
        traits: ['lifesteal']  // 被ダメ時に回復
    },
    darkmage: {
        id: 'darkmage',
        name: 'ダークメイジ',
        color: '#8844aa',
        baseHP: 180,
        baseATK: 5,
        baseDEF: 0,  // 防御少なめ
        attackIntervalMs: 2000,  // 攻撃頻度が少ない
        traits: ['magic_attack']  // 20%で魔法攻撃
    },
    dragon: {
        id: 'dragon',
        name: 'ドラゴン',
        color: '#ff4444',
        baseHP: 500,
        baseATK: 10,
        baseDEF: 3,
        attackIntervalMs: 1200,
        traits: ['boss', 'breath']  // ボス、ブレス攻撃
    }
};

// 通常敵リスト（出現確率制御用）
const NORMAL_ENEMIES_EARLY = ['slime', 'goblin'];  // 序盤（1-2戦目）
const NORMAL_ENEMIES_MID = ['slime', 'goblin', 'skeleton'];  // 中盤（3戦目）
const NORMAL_ENEMIES_LATE = ['slime', 'goblin', 'skeleton', 'zombie', 'darkmage'];  // 後半（4戦目以降）

// レベルアップ選択肢
const UPGRADE_OPTIONS = [
    { id: 'atk', name: '攻撃力UP', desc: '恒久攻撃力 +2', icon: '⚔', color: '#ff6644', apply: (p) => p.permATK += 2 },
    { id: 'def', name: '防御力UP', desc: '恒久防御力 +2', icon: '🛡', color: '#4488ff', apply: (p) => p.permDEF += 2 },
    { id: 'exp', name: 'EXP効率UP', desc: 'EXP獲得 +30%', icon: '✨', color: '#44ff88', apply: (p) => p.expMultiplier += 0.3 },
    { id: 'score', name: 'スコア効率UP', desc: '戦闘スコア +25%', icon: '💎', color: '#ffaa00', apply: (p) => p.scoreMultiplier += 0.25 },
    { id: 'special', name: '必殺強化', desc: '必殺ダメージ +20', icon: '💥', color: '#ff44ff', apply: (p) => p.specialBonus += 20 },
    { id: 'haste', name: '攻撃速度UP', desc: '攻撃間隔 -0.1秒', icon: '⚡', color: '#44ffff', apply: (p) => p.hasteBonus += 100 }
];

// 移動中ランダムイベント
const ROAD_EVENTS = [
    { type: 'item', name: '宝箱発見！', icon: '📦', color: '#ffd700',
      effect: 'ATK+1', apply: (p) => p.permATK += 1 },
    { type: 'item', name: '回復の泉', icon: '💧', color: '#44aaff',
      effect: 'DEF+1', apply: (p) => p.permDEF += 1 },
    { type: 'item', name: '落ちてる剣', icon: '🗡', color: '#cccccc',
      effect: 'ATK+2', apply: (p) => p.permATK += 2 },
    { type: 'item', name: '経験の書', icon: '📖', color: '#88ff88',
      effect: 'EXP+30', apply: (p) => p.exp += 30 },
    { type: 'npc', name: '旅の商人', icon: '🧙', color: '#aa88ff',
      effect: 'スコア倍率+10%', apply: (p) => p.scoreMultiplier += 0.1 },
    { type: 'npc', name: '老賢者', icon: '👴', color: '#ffaa44',
      effect: 'EXP倍率+15%', apply: (p) => p.expMultiplier += 0.15 },
    { type: 'npc', name: '鍛冶屋', icon: '🔨', color: '#ff6644',
      effect: '必殺+10', apply: (p) => p.specialBonus += 10 },
    { type: 'trap', name: '落とし穴！', icon: '🕳', color: '#ff4444',
      effect: 'ATK-1', apply: (p) => p.permATK = Math.max(0, p.permATK - 1) },
    { type: 'curse', name: '呪いの霧', icon: '🌫', color: '#8844aa',
      effect: '落下速度UP', apply: (p) => p.dropSpeedDebuff = (p.dropSpeedDebuff || 0) + 1 },
    { type: 'curse', name: '地震！', icon: '💥', color: '#aa4444',
      effect: 'お邪魔+2行', apply: (p, game) => { if(game) game.pendingGarbage += 2; } },
    { type: 'curse', name: '重力異常', icon: '⬇', color: '#ff88ff',
      effect: '落下速度UP', apply: (p) => p.dropSpeedDebuff = (p.dropSpeedDebuff || 0) + 1 },
];

// 選択肢イベント
const CHOICE_EVENTS = [
    {
        name: '分かれ道',
        icon: '🛤',
        desc: '道が二手に分かれている...',
        choices: [
            { label: '安全な道', desc: 'EXP+20', apply: (p) => p.exp += 20 },
            { label: '危険な道', desc: 'ATK+2 or ATK-1', apply: (p) => {
                if (rng.next() > 0.3) p.permATK += 2;
                else p.permATK = Math.max(0, p.permATK - 1);
            }}
        ]
    },
    {
        name: '謎の祭壇',
        icon: '⛩',
        desc: '古びた祭壇がある...',
        choices: [
            { label: '祈る', desc: 'DEF+2、落下速度UP', apply: (p) => { p.permDEF += 2; p.dropSpeedDebuff = (p.dropSpeedDebuff || 0) + 1; } },
            { label: '無視', desc: '何も起きない', apply: (p) => {} }
        ]
    },
    {
        name: '傷ついた冒険者',
        icon: '🤕',
        desc: '助けを求めている...',
        choices: [
            { label: '助ける', desc: 'EXP+40, ATK+1', apply: (p) => { p.exp += 40; p.permATK += 1; }},
            { label: '見捨てる', desc: 'スコア+50%', apply: (p) => p.scoreMultiplier += 0.5 }
        ]
    }
];

// ============================================================
// RPGGame クラス
// ============================================================
class RPGGame {
    constructor() { this.reset(); }

    reset() {
        this.level = 1;
        this.exp = 0;
        this.permATK = 0;
        this.permDEF = 0;
        this.expMultiplier = 1.0;
        this.scoreMultiplier = 1.0;
        this.specialBonus = 0;
        this.hasteBonus = 0;
        this.dropSpeedDebuff = 0;

        this.distance = 0;
        this.kills = 0;
        this.zone = 1;

        // 戦闘カウント（ボス出現判定用）- 新規追加
        this.battleCount = 0;
        this.lastEnemyId = null;  // 連続出現抑制用
        this.pendingZoneUp = false;  // ボス撃破後のゾーンアップ予約

        this.tempBuffATK = 0;
        this.tempBuffDEF = 0;
        this.specialReady = false;
        this.battleRound = 0;
        this.damageTaken = 0;
        this.attacksRemaining = 0;

        // ドラゴンブレス用：次ラウンド追加ゴミ - 新規追加
        this.nextRoundExtraGarbageLines = 0;

        this.enemy = null;
        this.enemyHp = 0;
        this.enemyMaxHp = 0;

        this.lastWarriorAttack = 0;
        this.lastEnemyAttack = 0;

        this.walkFrame = 0;
        this.walkTimer = 0;
        this.attackAnim = 0;
        this.enemyShake = 0;
        this.specialUsed = false;

        this.battleLog = [];
        this.floatingTexts = [];

        this.specialCharging = false;
        this.specialChargeTimer = 0;
        this.specialChargeDuration = 1500;

        this.lastEventCheck = 0;
    }

    getRequiredExp() {
        return BALANCE.BASE_EXP + BALANCE.EXP_PER_LEVEL * (this.level - 1);
    }

    addExp(amount) {
        this.exp += Math.floor(amount * this.expMultiplier);
        if (this.exp >= this.getRequiredExp()) {
            return true;
        }
        return false;
    }

    levelUp() {
        this.exp -= this.getRequiredExp();
        this.level++;
    }

    getWarriorATK() {
        return BALANCE.WARRIOR_BASE_ATK + this.level + this.permATK + this.tempBuffATK;
    }

    getWarriorDEF() {
        return Math.floor(this.level / 2) + this.permDEF + this.tempBuffDEF;
    }

    getWarriorAttackInterval() {
        return Math.max(300, BALANCE.WARRIOR_ATTACK_INTERVAL - this.hasteBonus);
    }

    // ============================================================
    // 敵生成（ゾーン制改修：ドラゴン撃破でゾーンアップ）
    // ============================================================
    spawnEnemy() {
        this.battleCount++;

        // ボス撃破後のゾーンアップ（次の敵出現時に適用）
        if (this.pendingZoneUp) {
            this.zone++;
            this.pendingZoneUp = false;
        }

        let enemyData;
        let isBoss = false;

        // 5回に1回はボス（ドラゴン）
        if (this.battleCount % 5 === 0) {
            enemyData = ENEMIES.dragon;
            isBoss = true;
        } else {
            // 通常敵を戦闘回数に応じて選択
            let pool;
            if (this.battleCount <= 2) {
                pool = NORMAL_ENEMIES_EARLY;
            } else if (this.battleCount === 3) {
                pool = NORMAL_ENEMIES_MID;
            } else {
                pool = NORMAL_ENEMIES_LATE;
            }

            // 直前と同じ敵を避ける（可能であれば）
            let candidates = pool.filter(id => id !== this.lastEnemyId);
            if (candidates.length === 0) candidates = pool;

            const enemyId = rng.choice(candidates);
            enemyData = ENEMIES[enemyId];
            this.lastEnemyId = enemyId;
        }

        // ゾーン補正計算（zone 2以降で大幅強化）
        const zoneBonus = Math.max(0, this.zone - 1);  // zone1=0, zone2=1, zone3=2...

        // 敵オブジェクト作成
        this.enemy = {
            id: enemyData.id,
            name: enemyData.name,
            color: enemyData.color,
            traits: [...enemyData.traits],
            isBoss: isBoss
        };

        // === HP計算 ===
        // zone1: baseHP + level補正
        // zone2+: baseHP + 25*zoneBonus + level補正（大幅増）
        const hpZoneBonus = zoneBonus * 25;
        const hpLevelBonus = (this.level - 1) * 4;
        this.enemyMaxHp = enemyData.baseHP + hpZoneBonus + hpLevelBonus;
        // ドラゴンは上限なし（ゾーンが上がるほど強大に）
        this.enemyHp = this.enemyMaxHp;

        // === ATK計算（お邪魔を受けやすく）===
        // zone1: baseATK
        // zone2+: baseATK + 3*zoneBonus
        this.enemy.atk = enemyData.baseATK + zoneBonus * 3;

        // === DEF計算（倒しにくく）===
        // zone1: baseDEF
        // zone2+: baseDEF + 3*zoneBonus（防御大幅増）
        this.enemy.def = enemyData.baseDEF + zoneBonus * 3;

        // === 攻撃間隔計算（攻撃頻度アップ）===
        // zone1: 基本値
        // zone2+: -150ms per zone（最低400ms）
        const intervalReduction = zoneBonus * 150;
        this.enemy.attackIntervalMs = Math.max(400, enemyData.attackIntervalMs - intervalReduction);

        // 次ラウンド追加ゴミリセット
        this.nextRoundExtraGarbageLines = 0;

        this.battleLog = [];
        this.addFloatingText(this.enemy.name, 160, 150, this.enemy.color, 28, 2000);
        if (isBoss) {
            this.addFloatingText('★ BOSS ★', 160, 120, '#ffd700', 24, 2500);
        }
        this.addFloatingText('ZONE ' + this.zone, 160, 180, '#fff', 18, 1500);
    }

    startBattleRound(score, linesCleared) {
        this.battleRound++;

        const adjustedScore = Math.floor(score * this.scoreMultiplier);
        this.tempBuffATK = Math.min(BALANCE.MAX_BUFF_ATK, Math.floor(adjustedScore / BALANCE.BUFF_ATK_PER_SCORE));
        this.tempBuffDEF = Math.min(BALANCE.MAX_BUFF_DEF, Math.floor(adjustedScore / BALANCE.BUFF_DEF_PER_SCORE));
        this.specialReady = adjustedScore >= BALANCE.SPECIAL_THRESHOLD;
        this.specialUsed = false;
        this.specialCharging = false;
        this.specialChargeTimer = 0;
        this.damageTaken = 0;

        this.attacksRemaining = linesCleared || 0;

        this.lastWarriorAttack = performance.now();
        this.lastEnemyAttack = performance.now() + 800;

        this.addFloatingText(`ROUND ${this.battleRound}`, 160, 120, '#ffd700', 24, 1500);
        this.addFloatingText(`${this.attacksRemaining} ATTACKS!`, 160, 150, '#44ff88', 20, 1500);
        if (this.tempBuffATK > 0) {
            this.addFloatingText(`ATK+${this.tempBuffATK}`, 120, 180, '#ff6644', 18, 1200);
        }
        if (this.tempBuffDEF > 0) {
            this.addFloatingText(`DEF+${this.tempBuffDEF}`, 200, 180, '#4488ff', 18, 1200);
        }
        if (this.specialReady) {
            this.addFloatingText('SPECIAL READY!', 160, 210, '#ff44ff', 20, 1500);
        }
    }

    addFloatingText(text, x, y, color, size = 24, duration = 1500) {
        this.floatingTexts.push({
            text, x, y, color, size, duration,
            startTime: performance.now(),
            offsetY: 0
        });
    }

    updateFloatingTexts() {
        const now = performance.now();
        this.floatingTexts = this.floatingTexts.filter(ft => {
            const elapsed = now - ft.startTime;
            ft.offsetY = elapsed * 0.05;
            return elapsed < ft.duration;
        });
    }

    // ============================================================
    // オート戦闘（敵の個性を反映）- 大幅改修
    // ============================================================
    updateAutoBattle(currentTime) {
        if (!this.enemy || this.enemyHp <= 0) return 'victory';

        this.updateFloatingTexts();

        // === 必殺技チャージ処理 ===
        if (this.specialCharging) {
            this.specialChargeTimer += 16;

            if (this.specialChargeTimer % 200 < 16) {
                this.addFloatingText('...', 160, 200 + rng.int(-20, 20), '#ff44ff', 24, 300);
            }

            if (this.specialChargeTimer >= this.specialChargeDuration) {
                this.specialCharging = false;
                this.specialChargeTimer = 0;
                this.specialUsed = true;

                const dmg = BALANCE.SPECIAL_BASE_DMG + BALANCE.SPECIAL_LEVEL_BONUS * this.level + BALANCE.SPECIAL_BUFF_BONUS * this.tempBuffATK + this.specialBonus;

                this.addFloatingText('💥 SPECIAL ATTACK! 💥', 160, 120, '#ff44ff', 28, 2500);
                this.addFloatingText(dmg.toString(), 200, 180, '#ffff00', 48, 2000);
                this.addFloatingText('MASSIVE DAMAGE!', 160, 230, '#ff8844', 20, 1800);
                soundManager.playSE('special');

                // ゾンビ: 被ダメ時回復（必殺技も対象）
                this.applyZombieLifesteal(dmg);

                this.enemyHp -= dmg;
                this.attackAnim = 1;
                this.enemyShake = 2;
                this.lastWarriorAttack = currentTime;

                if (this.enemyHp <= 0) {
                    this.enemyHp = 0;
                    this.addFloatingText('DEFEATED!', 160, 150, '#ffd700', 32, 2000);
                    return 'victory';
                }
            }
        }

        // === 戦士の攻撃 ===
        if (currentTime - this.lastWarriorAttack > this.getWarriorAttackInterval()) {
            if (this.specialReady && !this.specialUsed && !this.specialCharging) {
                this.specialCharging = true;
                this.specialChargeTimer = 0;
                this.addFloatingText('CHARGING...', 160, 150, '#ff44ff', 32, 1500);
                this.addFloatingText('⚡ POWER UP ⚡', 160, 190, '#ffff00', 24, 1200);
                return 'ongoing';
            }

            if (this.attacksRemaining > 0) {
                this.attacksRemaining--;

                let dmg = Math.max(1, this.getWarriorATK() - this.enemy.def);
                let isCritical = rng.next() < 0.15;

                if (isCritical) {
                    dmg = Math.floor(dmg * 1.5);
                    this.addFloatingText('CRITICAL!', 160, 180, '#ffff00', 28, 1200);
                }
                this.addFloatingText(dmg.toString(), 200, 200, isCritical ? '#ffff00' : '#44ff88', 24, 1000);
                this.addFloatingText(`残り${this.attacksRemaining}`, 160, 240, '#888', 14, 800);
                soundManager.playSE('hit');

                // ゾンビ: 被ダメ時回復
                this.applyZombieLifesteal(dmg);

                this.enemyHp -= dmg;
                this.attackAnim = 1;
                this.enemyShake = 1;
                this.lastWarriorAttack = currentTime;

                if (this.enemyHp <= 0) {
                    this.enemyHp = 0;
                    this.addFloatingText('DEFEATED!', 160, 150, '#ffd700', 32, 2000);
                    return 'victory';
                }
            } else {
                this.lastWarriorAttack = currentTime;
            }
        }

        if (this.attacksRemaining <= 0 && (this.specialUsed || !this.specialReady) && !this.specialCharging) {
            return 'no_attacks';
        }

        // === 敵の攻撃（個性反映）===
        const enemyAttackInterval = this.enemy.attackIntervalMs || BALANCE.ENEMY_ATTACK_INTERVAL;
        if (currentTime - this.lastEnemyAttack > enemyAttackInterval) {
            this.executeEnemyAttack();
            this.lastEnemyAttack = currentTime;
        }

        return 'ongoing';
    }

    // ============================================================
    // 敵の攻撃処理（個性反映）- 新規追加
    // ============================================================
    executeEnemyAttack() {
        let taken = Math.max(0, this.enemy.atk - this.getWarriorDEF());
        let attackType = 'normal';

        // ダークメイジ: 20%で魔法攻撃（防御無視、ダメージ1.5倍）
        if (this.enemy.traits.includes('magic_attack') && rng.next() < 0.2) {
            taken = Math.floor(this.enemy.atk * 1.5);
            attackType = 'magic';
            this.addFloatingText('🔮 MAGIC!', 120, 250, '#aa44ff', 20, 1000);
        }

        // ドラゴン: 15%でブレス（次ラウンド追加ゴミ +2〜+4）
        if (this.enemy.traits.includes('breath') && rng.next() < 0.15) {
            const breathGarbage = rng.int(2, 4);
            // 累計上限（最大8行まで）
            this.nextRoundExtraGarbageLines = Math.min(8, this.nextRoundExtraGarbageLines + breathGarbage);
            this.addFloatingText('🔥 DRAGON BREATH! 🔥', 160, 100, '#ff6600', 22, 2000);
            this.addFloatingText(`次ラウンド ゴミ+${breathGarbage}`, 160, 130, '#ff4444', 16, 1800);
            // ブレス時は通常攻撃もする
        }

        this.damageTaken += taken;
        if (taken > 0) {
            const color = attackType === 'magic' ? '#aa44ff' : '#ff4444';
            this.addFloatingText(taken.toString(), 80, 280, color, 22, 1000);
            soundManager.playSE('damage');
        } else {
            this.addFloatingText('BLOCK!', 80, 280, '#4488ff', 24, 1000);
        }
    }

    // ============================================================
    // ゾンビ: ライフスティール処理 - 新規追加
    // ============================================================
    applyZombieLifesteal(damageDealt) {
        if (!this.enemy.traits.includes('lifesteal')) return;

        // 受けたダメージの20%回復（min1, max5）
        let heal = Math.floor(damageDealt * 0.2);
        heal = Math.max(1, Math.min(5, heal));

        this.enemyHp += heal;
        // 最大HPを超えない
        this.enemyHp = Math.min(this.enemyHp, this.enemyMaxHp);

        this.addFloatingText(`+${heal} HEAL`, 220, 160, '#88ff88', 16, 800);
    }

    defeatEnemy() {
        const rounds = this.battleRound;
        this.kills++;

        let rewardATK = BALANCE.VICTORY_PERM_ATK;
        let rewardDEF = BALANCE.VICTORY_PERM_DEF;

        const wasBoss = this.enemy && this.enemy.isBoss;

        // ボス撃破ボーナス＆ゾーンアップ予約
        if (wasBoss) {
            rewardATK += 2;
            rewardDEF += 1;
            // ★ドラゴン撃破でゾーンアップ予約（次の敵出現時に適用）
            this.pendingZoneUp = true;
        }

        if (rounds <= 1) {
            rewardATK += BALANCE.FAST_VICTORY_BONUS_ATK;
            rewardDEF += BALANCE.FAST_VICTORY_BONUS_DEF;
        }

        this.permATK += rewardATK;
        this.permDEF += rewardDEF;

        const result = {
            enemyName: this.enemy.name,
            rounds: rounds,
            rewardATK: rewardATK,
            rewardDEF: rewardDEF,
            fastKill: rounds <= 1,
            isBoss: wasBoss,
            zoneUp: wasBoss,  // ゾーンアップ予約されたか
            newZone: wasBoss ? this.zone + 1 : this.zone  // 次のゾーン（予告表示用）
        };

        this.enemy = null;
        this.battleRound = 0;
        this.tempBuffATK = 0;
        this.tempBuffDEF = 0;
        this.specialReady = false;
        this.nextRoundExtraGarbageLines = 0;

        return result;
    }

    // ============================================================
    // 次ラウンドゴミ計算（ドラゴンブレス対応）- 改修
    // ============================================================
    getNextRoundGarbage() {
        // base = clamp(floor(totalTakenDamage / 12), 0, 8)
        const base = Math.min(BALANCE.MAX_GARBAGE, Math.floor(this.damageTaken / BALANCE.DAMAGE_PER_GARBAGE));
        // total = clamp(base + nextRoundExtraGarbageLines, 0, 12)
        const total = Math.min(12, base + this.nextRoundExtraGarbageLines);
        return total;
    }

    updateWalk(deltaTime) {
        this.distance += BALANCE.WALK_SPEED * (deltaTime / 1000);
        this.walkTimer += deltaTime;
        if (this.walkTimer > 150) {
            this.walkFrame = (this.walkFrame + 1) % 4;
            this.walkTimer = 0;
        }
        return this.distance >= BALANCE.ENCOUNTER_DISTANCE;
    }

    updateAnimation(deltaTime) {
        if (this.attackAnim > 0) this.attackAnim -= deltaTime / 200;
        if (this.enemyShake > 0) this.enemyShake -= deltaTime / 150;
    }
}
