// ============================================================
// main.js - Game統合クラス、入力、ループ、起動 (Part 1/2)
// ============================================================

// ============================================================
// ランキング管理（localStorage使用）
// ============================================================
const RankingManager = {
    STORAGE_KEY: 'tetris_rpg_ranking',
    MAX_ENTRIES: 10,

    load() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    },

    save(rankings) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(rankings));
        } catch (e) {
            console.warn('ランキング保存に失敗しました');
        }
    },

    add(score, zone, kills, level) {
        const rankings = this.load();
        const entry = {
            score: score,
            zone: zone,
            kills: kills,
            level: level,
            date: new Date().toLocaleDateString('ja-JP')
        };
        rankings.push(entry);
        // スコア降順、同スコアならゾーン降順でソート
        rankings.sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return b.zone - a.zone;
        });
        // 上位10件のみ保持
        const trimmed = rankings.slice(0, this.MAX_ENTRIES);
        this.save(trimmed);
        // 今回の順位を返す（1-indexed）
        return trimmed.findIndex(r => r === entry) + 1 || rankings.indexOf(entry) + 1;
    },

    getRank(score, zone) {
        const rankings = this.load();
        let rank = 1;
        for (const r of rankings) {
            if (r.score > score || (r.score === score && r.zone > zone)) {
                rank++;
            }
        }
        return rank;
    }
};

// ============================================================
// Game 統合クラス
// ============================================================
class Game {
    constructor() {
        this.tetrisCanvas = document.getElementById('tetrisCanvas');
        this.rpgCanvas = document.getElementById('rpgCanvas');
        this.tetrisCtx = this.tetrisCanvas.getContext('2d');
        this.rpgCtx = this.rpgCanvas.getContext('2d');

        this.tetris = new TetrisGame();
        this.rpg = new RPGGame();

        this.phase = GamePhase.TITLE;
        this.lastTime = 0;

        this.phaseTimer = 0;
        this.battleTimeLeft = 0;
        this.battleScore = 0;
        this.battleStartScore = 0;
        this.battleLinesCleared = 0;
        this.pendingGarbage = 0;

        this.battleResult = null;

        this.victoryWaiting = false;
        this.victoryWaitTimer = 0;

        this.currentEvent = null;
        this.currentChoiceEvent = null;
        this.selectedChoice = 0;

        this.upgradeOptions = [];
        this.selectedUpgrade = 0;

        this.prevPhase = null;

        // ランキング関連
        this.lastRank = 0;        // 直前のゲームの順位
        this.showingRankingFromGameOver = false;  // ゲームオーバーからランキング表示中か

        // === 画像リソース ===
        this.images = {};
        this.imagesLoaded = false;
        this.loadImages();

        this.setupInput();
        requestAnimationFrame(t => this.gameLoop(t));
    }

    // === 画像読み込み ===
    loadImages() {
        const imageList = {
            // 背景
            bg_field: 'picture/bg_field.png',
            bg_battle: 'picture/bg_battle.png',
            // 戦士
            warrior_idle: 'picture/warrior_idle.png',
            warrior_walk1: 'picture/warrior_walk1.png',
            warrior_walk2: 'picture/warrior_walk2.png',
            warrior_attack: 'picture/warrior_attack.png',
            warrior_special: 'picture/warrior_special.png',
            // 敵
            enemy_slime: 'picture/enemy_slime.png',
            enemy_goblin: 'picture/enemy_goblin.png',
            enemy_skeleton: 'picture/enemy_skeleton.png',
            enemy_zombie: 'picture/enemy_zombie.png',
            enemy_darkmage: 'picture/enemy_darkmage.png',
            enemy_dragon: 'picture/enemy_dragon.png'
        };

        let loadedCount = 0;
        const totalImages = Object.keys(imageList).length;

        for (const [key, src] of Object.entries(imageList)) {
            const img = new Image();
            img.onload = () => {
                loadedCount++;
                if (loadedCount === totalImages) {
                    this.imagesLoaded = true;
                    console.log('All images loaded!');
                }
            };
            img.onerror = () => {
                console.warn(`Failed to load image: ${src}`);
                loadedCount++;
                if (loadedCount === totalImages) {
                    this.imagesLoaded = true;
                }
            };
            img.src = src;
            this.images[key] = img;
        }
    }

    setupInput() {
        document.addEventListener('keydown', e => this.handleInput(e));
    }

    handleInput(e) {
        soundManager.init();
        soundManager.resume();

        if (e.key === 'm' || e.key === 'M') {
            soundManager.toggleMute();
            return;
        }

        if (this.phase === GamePhase.TITLE) {
            if (e.key === 'Enter') {
                this.startGame();
            } else if (e.key === 'r' || e.key === 'R') {
                this.showingRankingFromGameOver = false;
                this.phase = GamePhase.RANKING;
            } else {
                soundManager.playBgm('title');
            }
            return;
        }

        if (this.phase === GamePhase.RANKING) {
            if (e.key === 'Escape' || e.key === 'Enter' || e.key === 'r' || e.key === 'R') {
                this.phase = GamePhase.TITLE;
            }
            return;
        }

        if (this.phase === GamePhase.GAMEOVER) {
            if (e.key === 'Enter') {
                // ランキングに登録してランキング画面へ
                this.lastRank = RankingManager.add(
                    this.tetris.score,
                    this.rpg.zone,
                    this.rpg.kills,
                    this.rpg.level
                );
                this.showingRankingFromGameOver = true;
                this.phase = GamePhase.RANKING;
            }
            return;
        }

        if (this.phase === GamePhase.LEVELUP_CHOICE) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                this.selectedUpgrade = (this.selectedUpgrade - 1 + 3) % 3;
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                this.selectedUpgrade = (this.selectedUpgrade + 1) % 3;
            } else if (e.key === 'Enter' || e.key === '1' || e.key === '2' || e.key === '3') {
                let idx = this.selectedUpgrade;
                if (e.key === '1') idx = 0;
                if (e.key === '2') idx = 1;
                if (e.key === '3') idx = 2;
                this.upgradeOptions[idx].apply(this.rpg);
                this.rpg.levelUp();
                this.phase = this.prevPhase || GamePhase.MOVE;
            }
            return;
        }

        if (this.phase === GamePhase.EVENT_CHOICE) {
            if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
                this.selectedChoice = 0;
            } else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
                this.selectedChoice = 1;
            } else if (e.key === 'Enter' || e.key === '1' || e.key === '2') {
                let idx = this.selectedChoice;
                if (e.key === '1') idx = 0;
                if (e.key === '2') idx = 1;
                this.currentChoiceEvent.choices[idx].apply(this.rpg);
                this.currentChoiceEvent = null;
                this.phase = GamePhase.MOVE;
            }
            return;
        }

        if (this.phase === GamePhase.EVENT) {
            if (e.key === 'Enter') {
                this.currentEvent = null;
                this.phase = GamePhase.MOVE;
            }
            return;
        }

        if (e.key === 'p' || e.key === 'P') {
            if (this.phase === GamePhase.PAUSED) {
                this.phase = this.prevPhase;
            } else if (this.phase === GamePhase.MOVE || this.phase === GamePhase.BATTLE_TETRIS) {
                this.prevPhase = this.phase;
                this.phase = GamePhase.PAUSED;
            }
            return;
        }

        if (this.phase === GamePhase.PAUSED) return;

        if (this.phase === GamePhase.MOVE || this.phase === GamePhase.BATTLE_TETRIS) {
            switch (e.key) {
                case 'ArrowLeft':
                    if (this.tetris.move(-1, 0)) soundManager.playSE('move');
                    break;
                case 'ArrowRight':
                    if (this.tetris.move(1, 0)) soundManager.playSE('move');
                    break;
                case 'ArrowDown':
                    if (this.tetris.move(0, 1)) soundManager.playSE('softdrop');
                    break;
                case 'ArrowUp':
                    e.preventDefault();
                    this.tetris.hardDrop();
                    soundManager.playSE('harddrop');
                    break;
                case ' ':
                    e.preventDefault();
                    if (this.tetris.rotateCW()) soundManager.playSE('rotate');
                    break;
                case 'x':
                case 'X':
                    // 時計回り回転
                    if (this.tetris.rotateCW()) soundManager.playSE('rotate');
                    break;
                case 'z':
                case 'Z':
                    // 反時計回り回転
                    if (this.tetris.rotateCCW()) soundManager.playSE('rotate');
                    break;
                case 'c':
                case 'C':
                    if (this.tetris.hold()) soundManager.playSE('hold');
                    break;
            }
        }
    }

    startGame() {
        this.tetris.reset();
        this.rpg.reset();
        this.phase = GamePhase.MOVE;
        this.phaseTimer = 0;
        this.battleTimeLeft = 0;
        this.battleScore = 0;
        this.battleLinesCleared = 0;
        this.pendingGarbage = 0;
        soundManager.playBgm('explore');
    }

    enterPhase(newPhase, data = null) {
        this.phase = newPhase;
        this.phaseTimer = 0;

        switch (newPhase) {
            case GamePhase.MOVE:
                this.rpg.distance = 0;
                this.rpg.lastEventCheck = 0;
                this.battleResult = null;
                soundManager.playBgm('explore');
                break;

            case GamePhase.ENCOUNTER:
                this.rpg.spawnEnemy();
                soundManager.stopBgm();
                soundManager.playSE('encounter');
                break;

            case GamePhase.BATTLE_TETRIS:
                this.battleTimeLeft = BALANCE.BATTLE_TIME;
                this.battleStartScore = this.tetris.score;
                this.battleLinesCleared = 0;
                if (this.pendingGarbage > 0) {
                    this.tetris.addGarbage(this.pendingGarbage);
                    this.pendingGarbage = 0;
                }
                soundManager.playBgm('battle');
                break;

            case GamePhase.AUTO_BATTLE:
                this.rpg.startBattleRound(this.battleScore, this.battleLinesCleared);
                break;

            case GamePhase.BATTLE_RESULT:
                this.battleResult = data;
                soundManager.playBgm('result');
                soundManager.playSE('victory');
                break;

            case GamePhase.EVENT:
                this.currentEvent = data;
                soundManager.playSE('event');
                break;

            case GamePhase.EVENT_CHOICE:
                this.currentChoiceEvent = data;
                this.selectedChoice = 0;
                soundManager.playSE('event');
                break;
        }
    }

    generateUpgradeOptions() {
        const opts = [...UPGRADE_OPTIONS];
        for (let i = opts.length - 1; i > 0; i--) {
            const j = Math.floor(rng.next() * (i + 1));
            [opts[i], opts[j]] = [opts[j], opts[i]];
        }
        return opts.slice(0, 3);
    }

    gameLoop(currentTime) {
        const deltaTime = Math.min(currentTime - this.lastTime, 100);
        this.lastTime = currentTime;

        this.update(deltaTime, currentTime);
        this.draw();

        requestAnimationFrame(t => this.gameLoop(t));
    }

    update(deltaTime, currentTime) {
        if (this.phase === GamePhase.TITLE ||
            this.phase === GamePhase.PAUSED ||
            this.phase === GamePhase.GAMEOVER ||
            this.phase === GamePhase.LEVELUP_CHOICE ||
            this.phase === GamePhase.EVENT_CHOICE) {
            return;
        }

        this.rpg.updateAnimation(deltaTime);

        switch (this.phase) {
            case GamePhase.MOVE:
                this.updateMovePhase(deltaTime, currentTime);
                break;
            case GamePhase.EVENT:
                this.updateEventPhase(deltaTime);
                break;
            case GamePhase.ENCOUNTER:
                this.updateEncounterPhase(deltaTime);
                break;
            case GamePhase.BATTLE_TETRIS:
                this.updateBattleTetrisPhase(deltaTime, currentTime);
                break;
            case GamePhase.AUTO_BATTLE:
                this.updateAutoBattlePhase(deltaTime, currentTime);
                break;
            case GamePhase.BATTLE_RESULT:
                this.updateBattleResultPhase(deltaTime);
                break;
        }
    }

    updateMovePhase(deltaTime, currentTime) {
        if (this.pendingGarbage > 0) {
            this.tetris.addGarbage(this.pendingGarbage);
            this.pendingGarbage = 0;
        }

        const debuffFactor = Math.pow(0.85, this.rpg.dropSpeedDebuff);
        const dropInterval = Math.floor(BALANCE.MOVE_DROP_INTERVAL * debuffFactor);

        const result = this.tetris.update(deltaTime, currentTime, dropInterval);

        if (result.linesCleared > 0) {
            if (result.linesCleared >= 4) {
                soundManager.playSE('tetris');
            } else {
                soundManager.playSE('clear' + result.linesCleared);
            }
        } else if (result.pieceLocked) {
            soundManager.playSE('lock');
        }

        let expGain = 0;
        if (result.pieceLocked) {
            expGain += BALANCE.EXP_PER_LOCK;
        }
        if (result.linesCleared > 0) {
            expGain += BALANCE.EXP_PER_LINE[result.linesCleared] || 0;
        }
        if (expGain > 0 && this.rpg.addExp(expGain)) {
            soundManager.playSE('levelup');
            this.upgradeOptions = this.generateUpgradeOptions();
            this.selectedUpgrade = 0;
            this.prevPhase = GamePhase.MOVE;
            this.phase = GamePhase.LEVELUP_CHOICE;
            return;
        }

        if (this.tetris.gameOver) {
            soundManager.stopBgm();
            soundManager.playSE('gameover');
            this.phase = GamePhase.GAMEOVER;
            return;
        }

        const prevDist = this.rpg.distance;
        if (this.rpg.updateWalk(deltaTime)) {
            this.enterPhase(GamePhase.ENCOUNTER);
            return;
        }

        const checkDist = Math.floor(this.rpg.distance / BALANCE.EVENT_CHECK_INTERVAL);
        const prevCheck = Math.floor(prevDist / BALANCE.EVENT_CHECK_INTERVAL);
        if (checkDist > prevCheck && this.rpg.lastEventCheck < checkDist) {
            this.rpg.lastEventCheck = checkDist;
            if (rng.next() < BALANCE.EVENT_CHANCE) {
                this.triggerRandomEvent();
            }
        }
    }

    triggerRandomEvent() {
        if (rng.next() < 0.2) {
            const event = rng.choice(CHOICE_EVENTS);
            this.enterPhase(GamePhase.EVENT_CHOICE, event);
        } else {
            const event = rng.choice(ROAD_EVENTS);
            event.apply(this.rpg, this);
            this.enterPhase(GamePhase.EVENT, event);
        }
    }

    updateEventPhase(deltaTime) {
        this.phaseTimer += deltaTime;
        if (this.phaseTimer >= BALANCE.EVENT_DURATION) {
            this.currentEvent = null;
            this.phase = GamePhase.MOVE;
        }
    }

    updateEncounterPhase(deltaTime) {
        this.phaseTimer += deltaTime;
        if (this.phaseTimer >= BALANCE.ENCOUNTER_DURATION) {
            this.enterPhase(GamePhase.BATTLE_TETRIS);
        }
    }

    updateBattleTetrisPhase(deltaTime, currentTime) {
        this.battleTimeLeft -= deltaTime;

        if (this.battleTimeLeft <= 0) {
            this.battleScore = this.tetris.score - this.battleStartScore;
            this.enterPhase(GamePhase.AUTO_BATTLE);
            return;
        }

        const debuffFactor = Math.pow(0.85, this.rpg.dropSpeedDebuff);
        const dropInterval = Math.floor(BALANCE.BATTLE_DROP_INTERVAL * debuffFactor);

        const result = this.tetris.update(deltaTime, currentTime, dropInterval);

        if (result.linesCleared > 0) {
            this.battleLinesCleared += result.linesCleared;
            if (result.linesCleared >= 4) {
                soundManager.playSE('tetris');
            } else {
                soundManager.playSE('clear' + result.linesCleared);
            }
        } else if (result.pieceLocked) {
            soundManager.playSE('lock');
        }

        if (this.tetris.gameOver) {
            soundManager.stopBgm();
            soundManager.playSE('gameover');
            this.phase = GamePhase.GAMEOVER;
        }
    }

    updateAutoBattlePhase(deltaTime, currentTime) {
        if (this.victoryWaiting) {
            this.victoryWaitTimer += deltaTime;
            if (this.victoryWaitTimer >= BALANCE.VICTORY_WAIT_DURATION) {
                const battleResult = this.rpg.defeatEnemy();
                this.victoryWaiting = false;
                this.victoryWaitTimer = 0;
                this.enterPhase(GamePhase.BATTLE_RESULT, battleResult);
            }
            return;
        }

        const result = this.rpg.updateAutoBattle(currentTime);

        if (result === 'victory') {
            this.victoryWaiting = true;
            this.victoryWaitTimer = 0;
            this.rpg.battleLog.push('');
            this.rpg.battleLog.push('══════════════════');
            this.rpg.battleLog.push('  ★ 勝利！ ★');
            this.rpg.battleLog.push('══════════════════');
        } else if (result === 'no_attacks') {
            this.pendingGarbage = this.rpg.getNextRoundGarbage();
            this.rpg.addFloatingText('攻撃終了！', 160, 150, '#ffaa00', 24, 1500);
            if (this.pendingGarbage > 0) {
                this.rpg.addFloatingText(`ゴミ+${this.pendingGarbage}行`, 160, 180, '#ff4444', 20, 1500);
            }
            this.enterPhase(GamePhase.BATTLE_TETRIS);
        }

        this.phaseTimer += deltaTime;
    }

    updateBattleResultPhase(deltaTime) {
        this.phaseTimer += deltaTime;
        if (this.phaseTimer >= BALANCE.BATTLE_RESULT_DURATION) {
            this.enterPhase(GamePhase.MOVE);
        }
    }

    // ============================================================
    // 描画
    // ============================================================
    draw() {
        this.drawTetrisSide();
        this.drawRPGSide();
        this.drawOverlays();
    }

    drawTetrisSide() {
        const ctx = this.tetrisCtx;
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, this.tetrisCanvas.width, this.tetrisCanvas.height);

        const offsetX = 10;
        const offsetY = 100;

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px monospace';
        let phaseText = '';
        let phaseColor = '#fff';
        switch (this.phase) {
            case GamePhase.MOVE: phaseText = '【探索中】'; phaseColor = '#44ff88'; break;
            case GamePhase.EVENT: phaseText = '【イベント】'; phaseColor = '#ffd700'; break;
            case GamePhase.EVENT_CHOICE: phaseText = '【選択】'; phaseColor = '#ffaa00'; break;
            case GamePhase.ENCOUNTER: phaseText = '【遭遇！】'; phaseColor = '#ff8844'; break;
            case GamePhase.BATTLE_TETRIS: phaseText = '【戦闘テトリス】'; phaseColor = '#ff4444'; break;
            case GamePhase.AUTO_BATTLE: phaseText = '【戦闘観戦】'; phaseColor = '#ffff44'; break;
            case GamePhase.BATTLE_RESULT: phaseText = '【勝利！】'; phaseColor = '#ffd700'; break;
            case GamePhase.LEVELUP_CHOICE: phaseText = '【レベルアップ】'; phaseColor = '#ffd700'; break;
            case GamePhase.PAUSED: phaseText = '【ポーズ】'; phaseColor = '#aaa'; break;
        }
        ctx.fillStyle = phaseColor;
        ctx.fillText(phaseText, offsetX, 25);

        if (this.phase === GamePhase.MOVE) {
            ctx.fillStyle = '#aaa';
            ctx.font = '12px monospace';
            ctx.fillText(`Lv.${this.rpg.level}  EXP: ${this.rpg.exp}/${this.rpg.getRequiredExp()}`, offsetX, 45);

            const expRatio = this.rpg.exp / this.rpg.getRequiredExp();
            ctx.fillStyle = '#333';
            ctx.fillRect(offsetX, 50, TETRIS_WIDTH, 10);
            ctx.fillStyle = '#44ff88';
            ctx.fillRect(offsetX, 50, TETRIS_WIDTH * expRatio, 10);
            ctx.strokeStyle = '#666';
            ctx.strokeRect(offsetX, 50, TETRIS_WIDTH, 10);

            const distRatio = this.rpg.distance / BALANCE.ENCOUNTER_DISTANCE;
            ctx.fillStyle = '#aaa';
            ctx.font = '10px monospace';
            ctx.fillText(`次の戦闘まで`, offsetX, 75);
            ctx.fillStyle = '#333';
            ctx.fillRect(offsetX, 80, TETRIS_WIDTH, 8);
            ctx.fillStyle = '#ff8844';
            ctx.fillRect(offsetX, 80, TETRIS_WIDTH * distRatio, 8);
        }

        if (this.phase === GamePhase.BATTLE_TETRIS) {
            // 攻撃回数（消した行数）を目立つように表示
            ctx.fillStyle = '#44ff88';
            ctx.font = 'bold 18px monospace';
            ctx.fillText(`攻撃回数: ${this.battleLinesCleared}`, offsetX + 10, 50);

            const score = this.tetris.score;
            const adjScore = Math.floor(score * this.rpg.scoreMultiplier);
            const buffATK = Math.min(BALANCE.MAX_BUFF_ATK, Math.floor(adjScore / BALANCE.BUFF_ATK_PER_SCORE));
            const buffDEF = Math.min(BALANCE.MAX_BUFF_DEF, Math.floor(adjScore / BALANCE.BUFF_DEF_PER_SCORE));
            const specialReady = adjScore >= BALANCE.SPECIAL_THRESHOLD;

            ctx.font = '11px monospace';
            ctx.fillStyle = '#aaa';
            ctx.fillText(`スコア: ${score}`, offsetX, 98);
            ctx.fillStyle = '#ff6644';
            ctx.fillText(`ATK+${buffATK}`, offsetX + 90, 98);
            ctx.fillStyle = '#4488ff';
            ctx.fillText(`DEF+${buffDEF}`, offsetX + 145, 98);
            if (specialReady) {
                ctx.fillStyle = '#ffff44';
                ctx.fillText(`必殺!`, offsetX + 200, 98);
            }
        }

        const playablePhases = [GamePhase.MOVE, GamePhase.EVENT, GamePhase.EVENT_CHOICE, GamePhase.BATTLE_TETRIS, GamePhase.LEVELUP_CHOICE, GamePhase.PAUSED];
        if (playablePhases.includes(this.phase)) {
            // 戦闘中は暗い赤背景、通常は青系背景
            const isBattle = this.phase === GamePhase.BATTLE_TETRIS;
            const bgColor = isBattle ? '#1a0a0a' : '#111122';
            const gridColor = isBattle ? '#331818' : '#222244';

            // === 戦闘パート: フィーバーモード風背景エフェクト ===
            if (isBattle) {
                this.drawBattleFeverBackground(ctx, offsetX, offsetY);
            }

            this.tetris.draw(ctx, offsetX, offsetY, true, bgColor, gridColor);
            this.tetris.drawHold(ctx, offsetX + TETRIS_WIDTH + 10, offsetY);
            this.tetris.drawNext(ctx, offsetX + TETRIS_WIDTH + 10, offsetY + 80);

            // === 戦闘パート: 枠を派手に ===
            if (isBattle) {
                this.drawBattleFeverFrame(ctx, offsetX, offsetY);
            }
        } else if (this.phase === GamePhase.BATTLE_RESULT) {
            ctx.globalAlpha = 0.3;
            this.tetris.draw(ctx, offsetX, offsetY, false);
            ctx.globalAlpha = 1.0;
            this.drawBattleResultOnTetris(ctx, offsetX, offsetY);
        } else {
            ctx.globalAlpha = 0.3;
            this.tetris.draw(ctx, offsetX, offsetY, false);
            ctx.globalAlpha = 1.0;

            ctx.fillStyle = 'rgba(0,0,0,0.7)';
            ctx.fillRect(offsetX, offsetY + TETRIS_HEIGHT / 2 - 30, TETRIS_WIDTH, 60);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'center';
            if (this.phase === GamePhase.ENCOUNTER) {
                ctx.fillText('敵が現れた！', offsetX + TETRIS_WIDTH / 2, offsetY + TETRIS_HEIGHT / 2 + 8);
            } else {
                ctx.fillText('戦闘観戦中...', offsetX + TETRIS_WIDTH / 2, offsetY + TETRIS_HEIGHT / 2 + 8);
            }
            ctx.textAlign = 'left';
        }
    }

    // === 戦闘パート: フィーバーモード風背景エフェクト ===
    drawBattleFeverBackground(ctx, offsetX, offsetY) {
        const time = performance.now() / 1000;
        const w = TETRIS_WIDTH;
        const h = TETRIS_HEIGHT;

        // 背景グラデーション（赤〜オレンジのアニメーション）
        const gradY = Math.sin(time * 2) * 0.2 + 0.5;
        const grad = ctx.createLinearGradient(offsetX, offsetY, offsetX, offsetY + h);
        grad.addColorStop(0, `hsl(${350 + Math.sin(time) * 15}, 60%, 8%)`);
        grad.addColorStop(gradY, `hsl(${20 + Math.sin(time * 1.5) * 20}, 70%, 15%)`);
        grad.addColorStop(1, `hsl(${350 + Math.cos(time) * 15}, 60%, 5%)`);
        ctx.fillStyle = grad;
        ctx.fillRect(offsetX, offsetY, w, h);

        // 浮遊パーティクル（炎のような粒子）
        ctx.globalAlpha = 0.6;
        for (let i = 0; i < 20; i++) {
            const seed = i * 137.5;
            const px = offsetX + (Math.sin(seed + time * 0.5) * 0.5 + 0.5) * w;
            const py = offsetY + h - ((time * 50 + seed * 3) % (h + 50));
            const size = 2 + Math.sin(seed + time * 3) * 1.5;
            const hue = 20 + Math.sin(seed) * 30;

            ctx.fillStyle = `hsl(${hue}, 100%, ${50 + Math.sin(time * 5 + i) * 20}%)`;
            ctx.beginPath();
            ctx.arc(px, py, size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1.0;

        // 左右の炎エフェクト
        const flameGradL = ctx.createLinearGradient(offsetX, offsetY, offsetX + 30, offsetY);
        flameGradL.addColorStop(0, `rgba(255, ${80 + Math.sin(time * 8) * 40}, 0, 0.4)`);
        flameGradL.addColorStop(1, 'rgba(255, 100, 0, 0)');
        ctx.fillStyle = flameGradL;
        ctx.fillRect(offsetX, offsetY, 30, h);

        const flameGradR = ctx.createLinearGradient(offsetX + w - 30, offsetY, offsetX + w, offsetY);
        flameGradR.addColorStop(0, 'rgba(255, 100, 0, 0)');
        flameGradR.addColorStop(1, `rgba(255, ${80 + Math.cos(time * 8) * 40}, 0, 0.4)`);
        ctx.fillStyle = flameGradR;
        ctx.fillRect(offsetX + w - 30, offsetY, 30, h);
    }

    drawBattleFeverFrame(ctx, offsetX, offsetY) {
        const time = performance.now() / 1000;
        const w = TETRIS_WIDTH;
        const h = TETRIS_HEIGHT;

        // 枠のグロー効果
        ctx.shadowColor = `hsl(${20 + Math.sin(time * 3) * 20}, 100%, 50%)`;
        ctx.shadowBlur = 15 + Math.sin(time * 5) * 5;

        ctx.strokeStyle = `hsl(${30 + Math.sin(time * 2) * 20}, 100%, ${55 + Math.sin(time * 4) * 15}%)`;
        ctx.lineWidth = 3;
        ctx.strokeRect(offsetX, offsetY, w, h);

        ctx.shadowBlur = 0;

        // コーナーに炎マーク
        const corners = [[offsetX, offsetY], [offsetX + w, offsetY], [offsetX, offsetY + h], [offsetX + w, offsetY + h]];
        corners.forEach((c, i) => {
            const pulse = Math.sin(time * 6 + i * 1.5) * 0.3 + 0.7;
            ctx.fillStyle = `rgba(255, ${100 + Math.sin(time * 8 + i) * 50}, 0, ${pulse})`;
            ctx.beginPath();
            ctx.arc(c[0], c[1], 6, 0, Math.PI * 2);
            ctx.fill();
        });

        // 「BATTLE」テキスト点滅
        const alpha = 0.7 + Math.sin(time * 4) * 0.3;
        ctx.fillStyle = `rgba(255, 100, 50, ${alpha})`;
        ctx.font = 'bold 12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('BATTLE', offsetX + w / 2, offsetY + h + 15);
        ctx.textAlign = 'left';
    }

    drawBattleResultOnTetris(ctx, offsetX, offsetY) {
        if (!this.battleResult) return;

        const r = this.battleResult;
        const centerX = offsetX + TETRIS_WIDTH / 2;
        const centerY = offsetY + TETRIS_HEIGHT / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(offsetX, offsetY + 50, TETRIS_WIDTH, TETRIS_HEIGHT - 100);

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('VICTORY!', centerX, centerY - 80);

        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.fillText(`${r.enemyName}を撃破！`, centerX, centerY - 45);

        ctx.fillStyle = r.fastKill ? '#ffff44' : '#aaa';
        ctx.font = '14px monospace';
        ctx.fillText(`${r.rounds}ラウンドで勝利`, centerX, centerY - 20);

        // ゾーンアップ演出（ボス撃破時）
        if (r.zoneUp) {
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 16px monospace';
            ctx.fillText(`ZONE ${r.newZone} 突入!`, centerX, centerY + 5);
        }

        ctx.fillStyle = '#44ff88';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('-- 報酬 --', centerX, centerY + 30);

        ctx.fillStyle = '#ff6644';
        ctx.font = '16px monospace';
        ctx.fillText(`恒久ATK +${r.rewardATK}`, centerX, centerY + 55);

        ctx.fillStyle = '#4488ff';
        ctx.fillText(`恒久DEF +${r.rewardDEF}`, centerX, centerY + 80);

        if (r.fastKill) {
            ctx.fillStyle = '#ffff44';
            ctx.font = '12px monospace';
            ctx.fillText('★ QUICK KILL BONUS! ★', centerX, centerY + 105);
        }

        const timeLeft = Math.ceil((BALANCE.BATTLE_RESULT_DURATION - this.phaseTimer) / 1000);
        ctx.fillStyle = '#666';
        ctx.font = '12px monospace';
        ctx.fillText(`次へ... ${timeLeft}秒`, centerX, centerY + 140);

        ctx.textAlign = 'left';
    }

    drawRPGSide() {
        const ctx = this.rpgCtx;
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, this.rpgCanvas.width, this.rpgCanvas.height);

        const w = this.rpgCanvas.width;
        const h = this.rpgCanvas.height;

        this.drawRPGBackground(ctx, w, h);

        if (this.phase === GamePhase.MOVE || this.phase === GamePhase.LEVELUP_CHOICE) {
            this.drawWalkingScene(ctx, w, h);
        } else if (this.phase === GamePhase.EVENT) {
            this.drawWalkingScene(ctx, w, h);
            this.drawEventPopup(ctx, w, h);
        } else if (this.phase === GamePhase.EVENT_CHOICE) {
            this.drawWalkingScene(ctx, w, h);
            this.drawChoiceEventPopup(ctx, w, h);
        } else if (this.phase === GamePhase.ENCOUNTER) {
            this.drawEncounterScene(ctx, w, h);
        } else if (this.phase === GamePhase.BATTLE_TETRIS || this.phase === GamePhase.AUTO_BATTLE) {
            this.drawBattleScene(ctx, w, h);
            this.drawFloatingTexts(ctx);
        } else if (this.phase === GamePhase.BATTLE_RESULT) {
            this.drawBattleResultScene(ctx, w, h);
        }

        this.drawStatusPanel(ctx, w, h);
    }

    drawFloatingTexts(ctx) {
        const now = performance.now();
        for (const ft of this.rpg.floatingTexts) {
            const elapsed = now - ft.startTime;
            const alpha = 1 - (elapsed / ft.duration);
            ctx.globalAlpha = Math.max(0, alpha);
            ctx.fillStyle = ft.color;
            ctx.font = `bold ${ft.size}px monospace`;
            ctx.textAlign = 'center';
            ctx.fillText(ft.text, ft.x, ft.y - ft.offsetY);
        }
        ctx.globalAlpha = 1.0;
        ctx.textAlign = 'left';
    }

    drawEventPopup(ctx, w, h) {
        if (!this.currentEvent) return;
        const e = this.currentEvent;

        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillRect(20, h * 0.35, w - 40, 150);
        ctx.strokeStyle = e.color;
        ctx.lineWidth = 3;
        ctx.strokeRect(20, h * 0.35, w - 40, 150);

        ctx.fillStyle = e.color;
        ctx.font = '48px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(e.icon, w / 2, h * 0.35 + 55);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 20px monospace';
        ctx.fillText(e.name, w / 2, h * 0.35 + 95);

        ctx.fillStyle = '#44ff88';
        ctx.font = '16px monospace';
        ctx.fillText(e.effect, w / 2, h * 0.35 + 125);

        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.fillText('[ Enter でスキップ ]', w / 2, h * 0.35 + 145);

        ctx.textAlign = 'left';
    }

    drawChoiceEventPopup(ctx, w, h) {
        if (!this.currentChoiceEvent) return;
        const e = this.currentChoiceEvent;

        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(15, h * 0.25, w - 30, 280);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 3;
        ctx.strokeRect(15, h * 0.25, w - 30, 280);

        ctx.fillStyle = '#ffd700';
        ctx.font = '40px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(e.icon, w / 2, h * 0.25 + 50);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 18px monospace';
        ctx.fillText(e.name, w / 2, h * 0.25 + 85);

        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.fillText(e.desc, w / 2, h * 0.25 + 110);

        e.choices.forEach((choice, i) => {
            const y = h * 0.25 + 145 + i * 55;
            const selected = i === this.selectedChoice;

            ctx.fillStyle = selected ? '#4488ff' : '#333';
            ctx.fillRect(30, y, w - 60, 45);
            ctx.strokeStyle = selected ? '#fff' : '#666';
            ctx.lineWidth = selected ? 2 : 1;
            ctx.strokeRect(30, y, w - 60, 45);

            ctx.fillStyle = selected ? '#fff' : '#aaa';
            ctx.font = 'bold 16px monospace';
            ctx.fillText(`${i + 1}. ${choice.label}`, w / 2, y + 22);

            ctx.fillStyle = selected ? '#88ff88' : '#666';
            ctx.font = '12px monospace';
            ctx.fillText(choice.desc, w / 2, y + 38);
        });

        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.fillText('↑↓で選択 | Enter/1-2で決定', w / 2, h * 0.25 + 265);

        ctx.textAlign = 'left';
    }

    drawRPGBackground(ctx, w, h) {
        // 画像が読み込まれていれば使用
        if (this.imagesLoaded) {
            const bgKey = this.rpg.enemy ? 'bg_battle' : 'bg_field';
            const bgImg = this.images[bgKey];
            if (bgImg && bgImg.complete) {
                ctx.drawImage(bgImg, 0, 0, w, h);
                return;
            }
        }

        // フォールバック: 従来のグラデーション描画
        const sky = ctx.createLinearGradient(0, 0, 0, h * 0.5);
        if (this.rpg.enemy) {
            sky.addColorStop(0, '#4a3050');
            sky.addColorStop(1, '#6a4060');
        } else {
            sky.addColorStop(0, '#4a80b0');
            sky.addColorStop(1, '#7ab0d0');
        }
        ctx.fillStyle = sky;
        ctx.fillRect(0, 0, w, h * 0.5);

        const grass = ctx.createLinearGradient(0, h * 0.5, 0, h);
        grass.addColorStop(0, '#4a9050');
        grass.addColorStop(1, '#3a7040');
        ctx.fillStyle = grass;
        ctx.fillRect(0, h * 0.5, w, h * 0.5);

        ctx.fillStyle = '#a08060';
        ctx.fillRect(0, h * 0.65, w, 50);
    }

    drawWalkingScene(ctx, w, h) {
        this.drawWarrior(ctx, w * 0.4, h * 0.66, true);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 16px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('探索中...', w / 2, h * 0.70);
        ctx.font = '14px monospace';
        ctx.fillText(`${Math.floor(this.rpg.distance)}m / ${BALANCE.ENCOUNTER_DISTANCE}m`, w / 2, h * 0.72);
        ctx.textAlign = 'left';
    }

    drawEncounterScene(ctx, w, h) {
        this.drawWarrior(ctx, w * 0.30, h * 0.67, false);

        const alpha = Math.min(1, this.phaseTimer / 500);
        ctx.globalAlpha = alpha;
        this.drawEnemy(ctx, w * 0.7, h * 0.60);
        ctx.globalAlpha = 1;

        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${this.rpg.enemy.name} が現れた！`, w / 2, h * 0.4);
        ctx.textAlign = 'left';
    }

    drawBattleScene(ctx, w, h) {
        if (this.rpg.specialCharging) {
            const progress = this.rpg.specialChargeTimer / this.rpg.specialChargeDuration;

            ctx.fillStyle = `rgba(255, 68, 255, ${0.1 + progress * 0.2})`;
            ctx.fillRect(0, 0, w, h);

            ctx.strokeStyle = `rgba(255, 255, 0, ${0.3 + progress * 0.5})`;
            ctx.lineWidth = 2 + progress * 3;
            for (let i = 0; i < 12; i++) {
                const angle = (i / 12) * Math.PI * 2 + performance.now() / 500;
                const innerR = 30 + progress * 20;
                const outerR = 100 + progress * 80;
                ctx.beginPath();
                ctx.moveTo(w * 0.2 + Math.cos(angle) * innerR, h * 0.55 + Math.sin(angle) * innerR * 0.6);
                ctx.lineTo(w * 0.2 + Math.cos(angle) * outerR, h * 0.55 + Math.sin(angle) * outerR * 0.6);
                ctx.stroke();
            }

            const gradient = ctx.createRadialGradient(w * 0.2, h * 0.55, 10, w * 0.2, h * 0.55, 80 + progress * 40);
            gradient.addColorStop(0, `rgba(255, 68, 255, ${0.5 * progress})`);
            gradient.addColorStop(0.5, `rgba(255, 255, 0, ${0.3 * progress})`);
            gradient.addColorStop(1, 'rgba(255, 68, 255, 0)');
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(w * 0.2, h * 0.55, 80 + progress * 40, 0, Math.PI * 2);
            ctx.fill();

            ctx.fillStyle = '#333';
            ctx.fillRect(w * 0.1, h * 0.7, w * 0.2, 15);
            ctx.fillStyle = '#ff44ff';
            ctx.fillRect(w * 0.1, h * 0.7, w * 0.2 * progress, 15);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(w * 0.1, h * 0.7, w * 0.2, 15);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 12px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('CHARGING', w * 0.2, h * 0.7 - 5);
            ctx.textAlign = 'left';
        }

        this.drawWarrior(ctx, w * 0.23, h * 0.67, false);
        this.drawEnemy(ctx, w * 0.7, h * 0.60);

        if (this.rpg.enemy) {
            const hpRatio = this.rpg.enemyHp / this.rpg.enemyMaxHp;
            const barX = 20;
            const barY = h * 0.3;
            const barW = w - 40;
            const barH = 30;

            ctx.fillStyle = '#000';
            ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
            ctx.fillStyle = '#222';
            ctx.fillRect(barX, barY, barW, barH);

            const hpGrad = ctx.createLinearGradient(barX, barY, barX, barY + barH);
            if (hpRatio > 0.5) {
                hpGrad.addColorStop(0, '#66ff66');
                hpGrad.addColorStop(1, '#228822');
            } else if (hpRatio > 0.25) {
                hpGrad.addColorStop(0, '#ffff66');
                hpGrad.addColorStop(1, '#888822');
            } else {
                hpGrad.addColorStop(0, '#ff6666');
                hpGrad.addColorStop(1, '#882222');
            }
            ctx.fillStyle = hpGrad;
            ctx.fillRect(barX, barY, barW * hpRatio, barH);
            ctx.strokeStyle = '#fff';
            ctx.lineWidth = 2;
            ctx.strokeRect(barX, barY, barW, barH);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`${this.rpg.enemy.name}`, w / 2, barY - 10);
            ctx.font = 'bold 18px monospace';
            ctx.fillText(`${this.rpg.enemyHp} / ${this.rpg.enemyMaxHp}`, w / 2, barY + barH / 2 + 7);
            ctx.textAlign = 'left';
        }

        if (this.phase === GamePhase.AUTO_BATTLE) {
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(10, h * 0.65, 140, 60);
            ctx.strokeStyle = '#44ff88';
            ctx.lineWidth = 2;
            ctx.strokeRect(10, h * 0.65, 140, 60);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px monospace';
            ctx.fillText('WARRIOR', 20, h * 0.65 + 20);
            ctx.fillStyle = '#ff6644';
            ctx.font = '12px monospace';
            ctx.fillText(`ATK ${this.rpg.getWarriorATK()}`, 20, h * 0.65 + 38);
            ctx.fillStyle = '#4488ff';
            ctx.fillText(`DEF ${this.rpg.getWarriorDEF()}`, 85, h * 0.65 + 38);

            if (this.rpg.specialReady && !this.rpg.specialUsed) {
                ctx.fillStyle = '#ff44ff';
                ctx.font = 'bold 12px monospace';
                ctx.fillText('SPECIAL!', 20, h * 0.65 + 55);
            }

            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(w - 110, h * 0.65, 100, 40);
            ctx.strokeStyle = '#ff4444';
            ctx.strokeRect(w - 110, h * 0.65, 100, 40);

            ctx.fillStyle = '#ff6644';
            ctx.font = 'bold 12px monospace';
            ctx.fillText('DAMAGE', w - 100, h * 0.65 + 18);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 18px monospace';
            ctx.fillText(`${this.rpg.damageTaken}`, w - 100, h * 0.65 + 36);

            // === 残り攻撃回数カウントダウン（中央下部に大きく表示）===
            if (!this.victoryWaiting) {
                const remaining = this.rpg.attacksRemaining;
                const centerX = w / 2;
                const centerY = h * 0.85;

                // 背景
                ctx.fillStyle = 'rgba(0,0,0,0.85)';
                ctx.beginPath();
                ctx.arc(centerX, centerY, 45, 0, Math.PI * 2);
                ctx.fill();

                // 枠（残り回数に応じて色変化）
                let ringColor = '#44ff88';  // 余裕
                if (remaining <= 2) ringColor = '#ff4444';  // 危険
                else if (remaining <= 5) ringColor = '#ffaa00';  // 注意

                ctx.strokeStyle = ringColor;
                ctx.lineWidth = 4;
                ctx.beginPath();
                ctx.arc(centerX, centerY, 45, 0, Math.PI * 2);
                ctx.stroke();

                // ラベル
                ctx.fillStyle = '#aaa';
                ctx.font = '10px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('ATTACKS', centerX, centerY - 22);

                // 残り回数（大きく）
                ctx.fillStyle = ringColor;
                ctx.font = 'bold 36px monospace';
                ctx.fillText(`${remaining}`, centerX, centerY + 15);

                ctx.textAlign = 'left';
            }

            if (this.victoryWaiting) {
                const waitLeft = Math.ceil((BALANCE.VICTORY_WAIT_DURATION - this.victoryWaitTimer) / 1000);
                ctx.fillStyle = 'rgba(0,0,0,0.7)';
                ctx.fillRect(w / 2 - 80, h * 0.45, 160, 50);
                ctx.strokeStyle = '#ffd700';
                ctx.lineWidth = 3;
                ctx.strokeRect(w / 2 - 80, h * 0.45, 160, 50);

                ctx.fillStyle = '#ffd700';
                ctx.font = 'bold 20px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('VICTORY!', w / 2, h * 0.45 + 25);
                ctx.fillStyle = '#fff';
                ctx.font = '14px monospace';
                ctx.fillText(`${waitLeft}...`, w / 2, h * 0.45 + 43);
                ctx.textAlign = 'left';
            }
        }

        // === 戦闘テトリス中: 残り時間を画面下部に表示 ===
        if (this.phase === GamePhase.BATTLE_TETRIS) {
            const timeLeft = Math.max(0, Math.ceil(this.battleTimeLeft / 1000));
            const timerY = h - 40;  // 画面下部

            // 背景
            ctx.fillStyle = 'rgba(0,0,0,0.8)';
            ctx.fillRect(w / 2 - 80, timerY - 25, 160, 50);
            ctx.strokeStyle = timeLeft <= 10 ? '#ff4444' : '#44ff88';
            ctx.lineWidth = 3;
            ctx.strokeRect(w / 2 - 80, timerY - 25, 160, 50);

            // 残り時間
            ctx.fillStyle = timeLeft <= 10 ? '#ff4444' : '#fff';
            ctx.font = 'bold 28px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`残り ${timeLeft}秒`, w / 2, timerY + 10);
            ctx.textAlign = 'left';
        }
    }

    drawWarrior(ctx, x, y, walking) {
        const walkOffset = walking ? Math.sin(this.rpg.walkFrame * Math.PI / 2) * 4 : 0;

        // 画像が読み込まれていれば使用
        if (this.imagesLoaded) {
            let imgKey = 'warrior_idle';
            let imgWidth = 220;  // 表示幅
            let imgHeight = 328; // 表示高さ

            if (this.rpg.specialCharging) {
                imgKey = 'warrior_special';
                imgWidth = 280;
            } else if (this.rpg.attackAnim > 0.3) {
                imgKey = 'warrior_attack';
                imgWidth = 280;
            } else if (walking) {
                // 歩きアニメ（walk1とwalk2を交互に）
                imgKey = (this.rpg.walkFrame % 2 === 0) ? 'warrior_walk1' : 'warrior_walk2';
            }

            const img = this.images[imgKey];
            if (img && img.complete) {
                // 画像の中心を基準点に合わせる
                const drawX = x - imgWidth / 2;
                const drawY = y - imgHeight + 10 + walkOffset;
                ctx.drawImage(img, drawX, drawY, imgWidth, imgHeight);
                return;
            }
        }

        // フォールバック: 従来の描画
        const atkOffset = this.rpg.attackAnim * 20;

        ctx.fillStyle = '#ffcc99';
        ctx.fillRect(x - 12, y - 45 + walkOffset, 24, 45);

        ctx.beginPath();
        ctx.arc(x, y - 55 + walkOffset, 15, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#654321';
        ctx.beginPath();
        ctx.arc(x, y - 62 + walkOffset, 12, Math.PI, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#4a6fa5';
        ctx.fillRect(x - 12, y - 38 + walkOffset, 24, 30);

        const legOffset = walking ? Math.sin(this.rpg.walkFrame * Math.PI / 2) * 6 : 0;
        ctx.fillStyle = '#3d3d3d';
        ctx.fillRect(x - 10, y + walkOffset, 8, 20 + legOffset);
        ctx.fillRect(x + 2, y + walkOffset, 8, 20 - legOffset);

        ctx.fillStyle = '#c0c0c0';
        ctx.save();
        ctx.translate(x + 18 + atkOffset, y - 25 + walkOffset);
        ctx.rotate(-Math.PI / 4 - this.rpg.attackAnim * 0.5);
        ctx.fillRect(0, -4, 35, 8);
        ctx.fillStyle = '#8b4513';
        ctx.fillRect(-6, -6, 10, 12);
        ctx.restore();
    }

    drawEnemy(ctx, x, y) {
        if (!this.rpg.enemy) return;

        const shake = this.rpg.enemyShake * (Math.random() - 0.5) * 10;
        const enemy = this.rpg.enemy;

        // 画像が読み込まれていれば使用
        if (this.imagesLoaded) {
            // 敵IDから画像キーを決定
            const imgKey = 'enemy_' + enemy.id;
            const img = this.images[imgKey];

            if (img && img.complete) {
                // 敵ごとの表示サイズ
                let imgWidth, imgHeight;
                switch (enemy.id) {
                    case 'slime':
                        imgWidth = 280; imgHeight = 208; break;
                    case 'goblin':
                        imgWidth = 224; imgHeight = 280; break;
                    case 'skeleton':
                        imgWidth = 224; imgHeight = 336; break;
                    case 'zombie':
                        imgWidth = 224; imgHeight = 336; break;
                    case 'darkmage':
                        imgWidth = 280; imgHeight = 352; break;
                    case 'dragon':
                        imgWidth = 480; imgHeight = 512; break;
                    default:
                        imgWidth = 240; imgHeight = 320;
                }

                // 画像の中心下部を基準点に合わせる
                const drawX = x - imgWidth / 2 + shake;
                const drawY = y - imgHeight + 10;
                ctx.drawImage(img, drawX, drawY, imgWidth, imgHeight);
                return;
            }
        }

        // フォールバック: 従来の描画
        ctx.fillStyle = enemy.color;

        if (enemy.name === 'スライム') {
            ctx.beginPath();
            ctx.ellipse(x + shake, y - 10, 40, 30, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#fff';
            ctx.beginPath();
            ctx.arc(x - 12 + shake, y - 15, 10, 0, Math.PI * 2);
            ctx.arc(x + 12 + shake, y - 15, 10, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(x - 8 + shake, y - 15, 5, 0, Math.PI * 2);
            ctx.arc(x + 16 + shake, y - 15, 5, 0, Math.PI * 2);
            ctx.fill();
        } else if (enemy.name === 'ドラゴン') {
            ctx.fillRect(x - 35 + shake, y - 50, 70, 55);
            ctx.beginPath();
            ctx.moveTo(x + 35 + shake, y - 35);
            ctx.lineTo(x + 60 + shake, y - 25);
            ctx.lineTo(x + 35 + shake, y - 15);
            ctx.fill();
            ctx.fillStyle = '#cc3333';
            ctx.beginPath();
            ctx.moveTo(x - 10 + shake, y - 50);
            ctx.lineTo(x - 40 + shake, y - 80);
            ctx.lineTo(x + 15 + shake, y - 50);
            ctx.fill();
            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(x + 45 + shake, y - 28, 6, 0, Math.PI * 2);
            ctx.fill();
        } else if (enemy.name === 'ダークメイジ') {
            ctx.fillStyle = '#2a1a4a';
            ctx.beginPath();
            ctx.moveTo(x + shake, y - 70);
            ctx.lineTo(x - 30 + shake, y + 5);
            ctx.lineTo(x + 30 + shake, y + 5);
            ctx.fill();
            ctx.fillStyle = enemy.color;
            ctx.beginPath();
            ctx.arc(x + shake, y - 45, 15, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#8b4513';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(x + 35 + shake, y - 55);
            ctx.lineTo(x + 35 + shake, y);
            ctx.stroke();
            ctx.fillStyle = '#ff00ff';
            ctx.beginPath();
            ctx.arc(x + 35 + shake, y - 60, 10, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillRect(x - 18 + shake, y - 50, 36, 55);
            ctx.beginPath();
            ctx.arc(x + shake, y - 60, 18, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ff0';
            ctx.beginPath();
            ctx.arc(x - 6 + shake, y - 62, 5, 0, Math.PI * 2);
            ctx.arc(x + 6 + shake, y - 62, 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawBattleLog(ctx, w, h) {
        if (this.rpg.battleRound > 0) {
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(w / 2 - 50, h * 0.73, 100, 30);
            ctx.strokeStyle = '#666';
            ctx.strokeRect(w / 2 - 50, h * 0.73, 100, 30);

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(`ROUND ${this.rpg.battleRound}`, w / 2, h * 0.73 + 20);
            ctx.textAlign = 'left';
        }
    }

    drawBattleResultScene(ctx, w, h) {
        if (!this.battleResult) return;

        const r = this.battleResult;

        this.drawWarrior(ctx, w * 0.54, h * 0.70, false);

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('VICTORY!', w / 2, h * 0.35);

        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.fillText(`${r.enemyName}を撃破！`, w / 2, h * 0.42);

        // ゾーンアップ演出（ボス撃破時）
        if (r.zoneUp) {
            ctx.fillStyle = '#ff4444';
            ctx.font = 'bold 20px monospace';
            ctx.fillText(`★ ZONE ${r.newZone} 突入! ★`, w / 2, h * 0.50);
            ctx.fillStyle = '#ffaa00';
            ctx.font = '12px monospace';
            ctx.fillText('敵が強化されます...', w / 2, h * 0.55);
        }

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(20, h * 0.62, w - 40, 100);
        ctx.strokeStyle = r.zoneUp ? '#ff4444' : '#ffd700';
        ctx.lineWidth = r.zoneUp ? 3 : 1;
        ctx.strokeRect(20, h * 0.62, w - 40, 100);
        ctx.lineWidth = 1;

        ctx.fillStyle = '#44ff88';
        ctx.font = 'bold 16px monospace';
        ctx.fillText('-- 報酬獲得 --', w / 2, h * 0.68);

        ctx.fillStyle = '#ff6644';
        ctx.font = '14px monospace';
        ctx.fillText(`恒久ATK +${r.rewardATK}  →  合計: ${this.rpg.permATK}`, w / 2, h * 0.73);

        ctx.fillStyle = '#4488ff';
        ctx.fillText(`恒久DEF +${r.rewardDEF}  →  合計: ${this.rpg.permDEF}`, w / 2, h * 0.78);

        if (r.fastKill) {
            ctx.fillStyle = '#ffff44';
            ctx.font = '12px monospace';
            ctx.fillText('★ 1ラウンドクリアボーナス! ★', w / 2, h * 0.83);
        }

        ctx.textAlign = 'left';
    }

    drawStatusPanel(ctx, w, h) {
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(10, 10, w - 20, 100);
        ctx.strokeStyle = '#4a6fa5';
        ctx.strokeRect(10, 10, w - 20, 100);

        ctx.fillStyle = '#fff';
        ctx.font = '12px monospace';
        ctx.fillText(`Lv.${this.rpg.level}  撃破: ${this.rpg.kills}  Zone: ${this.rpg.zone}`, 20, 30);
        ctx.fillText(`恒久ATK: +${this.rpg.permATK}  恒久DEF: +${this.rpg.permDEF}`, 20, 50);
        ctx.fillText(`EXP倍率: x${this.rpg.expMultiplier.toFixed(1)}  スコア倍率: x${this.rpg.scoreMultiplier.toFixed(2)}`, 20, 70);

        if (this.rpg.enemy) {
            ctx.fillStyle = '#ff8844';
            ctx.fillText(`敵: ${this.rpg.enemy.name} ATK:${this.rpg.enemy.atk} DEF:${this.rpg.enemy.def}`, 20, 90);
        }
    }

    drawOverlays() {
        if (this.phase === GamePhase.TITLE) {
            this.drawTitleOverlay();
        }
        if (this.phase === GamePhase.RANKING) {
            this.drawRankingOverlay();
        }
        if (this.phase === GamePhase.PAUSED) {
            this.drawPauseOverlay();
        }
        if (this.phase === GamePhase.LEVELUP_CHOICE) {
            this.drawLevelUpOverlay();
        }
        if (this.phase === GamePhase.BATTLE_RESULT) {
            this.drawBattleResultOverlay();
        }
        if (this.phase === GamePhase.GAMEOVER) {
            this.drawGameOverOverlay();
        }
    }

    drawBattleResultOverlay() {
        const ctx = this.rpgCtx;
        const w = this.rpgCanvas.width;
        const h = this.rpgCanvas.height;

        const progress = this.phaseTimer / BALANCE.BATTLE_RESULT_DURATION;
        for (let i = 0; i < 20; i++) {
            const angle = (i / 20) * Math.PI * 2 + progress * Math.PI;
            const dist = 50 + Math.sin(progress * Math.PI * 4 + i) * 30;
            const x = w / 2 + Math.cos(angle) * dist;
            const y = h * 0.5 + Math.sin(angle) * dist * 0.5;
            const size = 2 + Math.sin(progress * Math.PI * 8 + i * 2) * 2;

            ctx.fillStyle = `hsla(${50 + i * 10}, 100%, 70%, ${0.5 + Math.sin(progress * Math.PI * 6 + i) * 0.3})`;
            ctx.beginPath();
            ctx.arc(x, y, size, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawTitleOverlay() {
        const ctx = this.rpgCtx;
        const w = this.rpgCanvas.width;
        const h = this.rpgCanvas.height;

        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('TETRIS', w / 2, h * 0.25);
        ctx.fillStyle = '#ff6644';
        ctx.fillText('× RPG', w / 2, h * 0.33);

        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.fillText('Phase Battle v2', w / 2, h * 0.40);

        ctx.fillStyle = '#44ff88';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('Press ENTER to Start', w / 2, h * 0.52);

        ctx.fillStyle = '#ffaa00';
        ctx.font = '12px monospace';
        ctx.fillText('Press R for Ranking', w / 2, h * 0.58);

        ctx.fillStyle = '#888';
        ctx.font = '11px monospace';
        ctx.fillText('【遊び方】', w / 2, h * 0.70);
        ctx.font = '10px monospace';
        ctx.fillText('探索中にアイテムやNPCに遭遇', w / 2, h * 0.75);
        ctx.fillText('戦闘テトリスで行を消す=攻撃回数', w / 2, h * 0.80);
        ctx.fillText('より高いZone・スコアを目指せ！', w / 2, h * 0.85);

        ctx.textAlign = 'left';

        const tctx = this.tetrisCtx;
        tctx.fillStyle = 'rgba(0,0,0,0.9)';
        tctx.fillRect(0, 0, this.tetrisCanvas.width, this.tetrisCanvas.height);
    }

    drawPauseOverlay() {
        const ctx = this.rpgCtx;
        const w = this.rpgCanvas.width;
        const h = this.rpgCanvas.height;

        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#fff';
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED', w / 2, h / 2);
        ctx.font = '14px monospace';
        ctx.fillText('Press P to Resume', w / 2, h / 2 + 40);
        ctx.textAlign = 'left';
    }

    drawLevelUpOverlay() {
        [this.tetrisCtx, this.rpgCtx].forEach(ctx => {
            const w = ctx.canvas.width;
            const h = ctx.canvas.height;

            ctx.fillStyle = 'rgba(0,0,0,0.85)';
            ctx.fillRect(0, 0, w, h);
        });

        const ctx = this.rpgCtx;
        const w = this.rpgCanvas.width;
        const h = this.rpgCanvas.height;

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 28px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('LEVEL UP!', w / 2, 60);

        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.fillText(`Lv.${this.rpg.level} → Lv.${this.rpg.level + 1}`, w / 2, 90);

        const startY = 130;
        const cardH = 90;
        const cardW = w - 40;

        this.upgradeOptions.forEach((opt, i) => {
            const y = startY + i * (cardH + 15);
            const selected = i === this.selectedUpgrade;

            ctx.fillStyle = selected ? opt.color : '#2a2a4a';
            ctx.beginPath();
            ctx.roundRect(20, y, cardW, cardH, 8);
            ctx.fill();

            ctx.strokeStyle = selected ? '#fff' : '#555';
            ctx.lineWidth = selected ? 3 : 1;
            ctx.stroke();

            ctx.fillStyle = selected ? '#fff' : '#888';
            ctx.font = 'bold 18px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${i + 1}`, 35, y + 30);

            ctx.fillStyle = opt.color;
            ctx.fillRect(60, y + 12, 40, 40);
            ctx.fillStyle = '#fff';
            ctx.font = '22px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(opt.icon, 80, y + 40);

            ctx.fillStyle = selected ? '#fff' : '#ccc';
            ctx.font = 'bold 16px monospace';
            ctx.textAlign = 'left';
            ctx.fillText(opt.name, 115, y + 35);

            ctx.fillStyle = selected ? '#ddd' : '#888';
            ctx.font = '12px monospace';
            ctx.fillText(opt.desc, 115, y + 55);

            if (selected) {
                ctx.fillStyle = '#fff';
                ctx.font = '18px monospace';
                ctx.fillText('▶', 5, y + cardH / 2 + 6);
            }
        });

        ctx.fillStyle = '#666';
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('↑↓で選択 | Enter/1-3で決定', w / 2, h - 30);
        ctx.textAlign = 'left';
    }

    drawGameOverOverlay() {
        const ctx = this.rpgCtx;
        const w = this.rpgCanvas.width;
        const h = this.rpgCanvas.height;

        ctx.fillStyle = 'rgba(0,0,0,0.9)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#ff4444';
        ctx.font = 'bold 32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('GAME OVER', w / 2, h * 0.2);

        // 今回の成績
        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 18px monospace';
        ctx.fillText('-- YOUR RESULT --', w / 2, h * 0.35);

        ctx.fillStyle = '#fff';
        ctx.font = '16px monospace';
        ctx.fillText(`スコア: ${this.tetris.score}`, w / 2, h * 0.45);
        ctx.fillStyle = '#ff6644';
        ctx.fillText(`到達Zone: ${this.rpg.zone}`, w / 2, h * 0.52);
        ctx.fillStyle = '#aaa';
        ctx.font = '14px monospace';
        ctx.fillText(`Lv.${this.rpg.level}  撃破: ${this.rpg.kills}`, w / 2, h * 0.60);

        // 現在の順位予想
        const expectedRank = RankingManager.getRank(this.tetris.score, this.rpg.zone);
        if (expectedRank <= 10) {
            ctx.fillStyle = '#44ff88';
            ctx.font = 'bold 14px monospace';
            ctx.fillText(`ランキング ${expectedRank}位 相当！`, w / 2, h * 0.70);
        }

        ctx.fillStyle = '#ffaa00';
        ctx.font = 'bold 14px monospace';
        ctx.fillText('Press ENTER for Ranking', w / 2, h * 0.82);
        ctx.textAlign = 'left';

        // テトリス側にも表示
        const tctx = this.tetrisCtx;
        tctx.fillStyle = 'rgba(0,0,0,0.85)';
        tctx.fillRect(0, 0, this.tetrisCanvas.width, this.tetrisCanvas.height);
        tctx.fillStyle = '#fff';
        tctx.font = 'bold 20px monospace';
        tctx.textAlign = 'center';
        tctx.fillText('GAME OVER', this.tetrisCanvas.width / 2, this.tetrisCanvas.height / 2 - 20);
        tctx.fillStyle = '#ffd700';
        tctx.font = '16px monospace';
        tctx.fillText(`Score: ${this.tetris.score}`, this.tetrisCanvas.width / 2, this.tetrisCanvas.height / 2 + 20);
        tctx.textAlign = 'left';
    }

    drawRankingOverlay() {
        const ctx = this.rpgCtx;
        const w = this.rpgCanvas.width;
        const h = this.rpgCanvas.height;

        ctx.fillStyle = 'rgba(0,0,0,0.95)';
        ctx.fillRect(0, 0, w, h);

        ctx.fillStyle = '#ffd700';
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('RANKING', w / 2, 40);

        const rankings = RankingManager.load();

        if (rankings.length === 0) {
            ctx.fillStyle = '#888';
            ctx.font = '14px monospace';
            ctx.fillText('まだ記録がありません', w / 2, h * 0.5);
        } else {
            const startY = 70;
            const rowH = 32;

            // ========================================
            // ランキング表示の位置設定（ここで調整可能）
            // ========================================
            const colRank  = 45;   // 順位のX座標（右揃え）
            const colScore = 130;  // スコアのX座標（右揃え）
            const colZone  = 190;  // ZoneのX座標（右揃え）
            const colKills = 240;  // 撃破数のX座標（右揃え）
            const colDate  = 255;  // 日付のX座標（左揃え）

            // ヘッダー
            ctx.fillStyle = '#888';
            ctx.font = '10px monospace';
            ctx.textAlign = 'right';
            ctx.fillText('順位', colRank, startY);
            ctx.fillText('スコア', colScore, startY);
            ctx.fillText('Zone', colZone, startY);
            ctx.fillText('撃破', colKills, startY);
            ctx.textAlign = 'left';
            ctx.fillText('日付', colDate, startY);

            rankings.forEach((r, i) => {
                const y = startY + 20 + i * rowH;
                const isNew = this.showingRankingFromGameOver && (i + 1) === this.lastRank;

                // 背景（新記録ハイライト）
                if (isNew) {
                    ctx.fillStyle = 'rgba(255, 215, 0, 0.2)';
                    ctx.fillRect(10, y - 12, w - 20, rowH - 4);
                }

                // 順位
                ctx.fillStyle = i < 3 ? ['#ffd700', '#c0c0c0', '#cd7f32'][i] : '#888';
                ctx.font = 'bold 14px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(`${i + 1}`, colRank, y + 5);

                // スコア
                ctx.fillStyle = isNew ? '#ffff44' : '#fff';
                ctx.font = '14px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(`${r.score}`, colScore, y + 5);

                // Zone
                ctx.fillStyle = '#ff6644';
                ctx.font = 'bold 14px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(`${r.zone}`, colZone, y + 5);

                // 撃破数
                ctx.fillStyle = '#aaa';
                ctx.font = '12px monospace';
                ctx.textAlign = 'right';
                ctx.fillText(`${r.kills}`, colKills, y + 5);

                // 日付
                ctx.fillStyle = '#666';
                ctx.font = '9px monospace';
                ctx.textAlign = 'left';
                ctx.fillText(r.date, colDate, y + 5);
            });
        }

        // 今回の成績（ゲームオーバーから来た場合）
        if (this.showingRankingFromGameOver && this.lastRank > 0) {
            ctx.fillStyle = '#44ff88';
            ctx.font = 'bold 14px monospace';
            ctx.textAlign = 'center';
            if (this.lastRank <= 10) {
                ctx.fillText(`今回の記録: ${this.lastRank}位 にランクイン！`, w / 2, h - 55);
            } else {
                ctx.fillText(`今回の記録: ランク外`, w / 2, h - 55);
            }
        }

        ctx.fillStyle = '#888';
        ctx.font = '12px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('Press ENTER or R to return', w / 2, h - 25);
        ctx.textAlign = 'left';

        // テトリス側
        const tctx = this.tetrisCtx;
        tctx.fillStyle = 'rgba(0,0,0,0.9)';
        tctx.fillRect(0, 0, this.tetrisCanvas.width, this.tetrisCanvas.height);

        tctx.fillStyle = '#ffd700';
        tctx.font = 'bold 16px monospace';
        tctx.textAlign = 'center';
        tctx.fillText('TOP 3', this.tetrisCanvas.width / 2, 50);

        if (rankings.length > 0) {
            rankings.slice(0, 3).forEach((r, i) => {
                const y = 90 + i * 50;
                tctx.fillStyle = ['#ffd700', '#c0c0c0', '#cd7f32'][i];
                tctx.font = 'bold 14px monospace';
                tctx.fillText(`${i + 1}位`, this.tetrisCanvas.width / 2, y);
                tctx.fillStyle = '#fff';
                tctx.font = '12px monospace';
                tctx.fillText(`${r.score} pts`, this.tetrisCanvas.width / 2, y + 18);
                tctx.fillStyle = '#ff6644';
                tctx.fillText(`Zone ${r.zone}`, this.tetrisCanvas.width / 2, y + 34);
            });
        }
        tctx.textAlign = 'left';
    }
}

// ============================================================
// ゲーム開始
// ============================================================
window.onload = () => { new Game(); };

