// ============================================================
// tetris.js - TetrisGame関連
// ============================================================

// テトリス定数（8×18グリッド、125%セルサイズ）
const TETRIS_COLS = 8;
const TETRIS_ROWS = 18;
const TETRIS_HIDDEN_ROWS = 4;  // 上部の見えないスポーン領域
const TETRIS_TOTAL_ROWS = TETRIS_ROWS + TETRIS_HIDDEN_ROWS;  // 内部配列の総行数
const BLOCK_SIZE = 35;
const TETRIS_WIDTH = TETRIS_COLS * BLOCK_SIZE;
const TETRIS_HEIGHT = TETRIS_ROWS * BLOCK_SIZE;

// Tスピンボーナス定数
const TSPIN_BONUS = {
    LINE_1: 200,
    LINE_2: 400,
    LINE_3: 800
};

const TETROMINOS = {
    I: { shapes: [[[1,1,1,1]], [[1],[1],[1],[1]]], color: '#00f5ff' },
    O: { shapes: [[[1,1],[1,1]]], color: '#ffff00' },
    T: { shapes: [[[0,1,0],[1,1,1]], [[1,0],[1,1],[1,0]], [[1,1,1],[0,1,0]], [[0,1],[1,1],[0,1]]], color: '#aa00ff' },
    S: { shapes: [[[0,1,1],[1,1,0]], [[1,0],[1,1],[0,1]]], color: '#00ff00' },
    Z: { shapes: [[[1,1,0],[0,1,1]], [[0,1],[1,1],[1,0]]], color: '#ff0000' },
    J: { shapes: [[[1,0,0],[1,1,1]], [[1,1],[1,0],[1,0]], [[1,1,1],[0,0,1]], [[0,1],[0,1],[1,1]]], color: '#0000ff' },
    L: { shapes: [[[0,0,1],[1,1,1]], [[1,0],[1,0],[1,1]], [[1,1,1],[1,0,0]], [[1,1],[0,1],[0,1]]], color: '#ff8800' }
};
const TETROMINO_TYPES = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];

// T型ミノの回転中心オフセット（各回転状態での中心セル位置）
// shapes配列のインデックスに対応: 0=上向き, 1=右向き, 2=下向き, 3=左向き
const T_CENTER_OFFSETS = [
    { x: 1, y: 1 },  // rotation 0: [[0,1,0],[1,1,1]] → 中心は(1,1)
    { x: 0, y: 1 },  // rotation 1: [[1,0],[1,1],[1,0]] → 中心は(0,1)
    { x: 1, y: 0 },  // rotation 2: [[1,1,1],[0,1,0]] → 中心は(1,0)
    { x: 1, y: 1 }   // rotation 3: [[0,1],[1,1],[0,1]] → 中心は(1,1)
];

// ============================================================
// TetrisGame クラス
// ============================================================
class TetrisGame {
    constructor() { this.reset(); }

    reset(initialGarbage = 0) {
        // 内部配列は TETRIS_TOTAL_ROWS 行（上部に見えない領域を含む）
        this.board = Array(TETRIS_TOTAL_ROWS).fill(null).map(() => Array(TETRIS_COLS).fill(0));
        this.boardColors = Array(TETRIS_TOTAL_ROWS).fill(null).map(() => Array(TETRIS_COLS).fill(null));

        if (initialGarbage > 0) {
            this.addInitialGarbage(initialGarbage);
        }

        this.currentPiece = null;
        this.currentX = 0;
        this.currentY = 0;
        this.currentRotation = 0;
        this.nextPieces = [this.randomPiece(), this.randomPiece(), this.randomPiece()];
        this.holdPiece = null;
        this.holdUsed = false;
        this.score = 0;
        this.lines = 0;
        this.lastDrop = 0;
        this.gameOver = false;

        this.isGrounded = false;
        this.lockTimerMs = 0;
        this.lockResetCount = 0;
        this.totalLockTimeMs = 0;
        this.lockDelayActive = false;

        this.clearingLines = [];
        this.clearAnimTimer = 0;
        this.isClearingAnimation = false;

        // Tスピン判定用：直前の操作が回転だったか
        this.lastMoveWasRotation = false;

        this.spawnPiece();
    }

    addInitialGarbage(lines) {
        for (let i = 0; i < lines; i++) {
            const hole = rng.int(0, TETRIS_COLS - 1);
            this.board.shift();
            this.boardColors.shift();
            const garbageRow = Array(TETRIS_COLS).fill(1);
            garbageRow[hole] = 0;
            this.board.push(garbageRow);
            const colorRow = Array(TETRIS_COLS).fill('#555555');
            colorRow[hole] = null;
            this.boardColors.push(colorRow);
        }
    }

    addGarbage(lines) {
        if (lines <= 0 || this.isClearingAnimation) return;
        for (let i = 0; i < lines; i++) {
            const hole = rng.int(0, TETRIS_COLS - 1);
            this.board.shift();
            this.boardColors.shift();
            const garbageRow = Array(TETRIS_COLS).fill(1);
            garbageRow[hole] = 0;
            this.board.push(garbageRow);
            const colorRow = Array(TETRIS_COLS).fill('#555555');
            colorRow[hole] = null;
            this.boardColors.push(colorRow);
        }
        if (this.currentPiece) {
            this.currentY = Math.max(0, this.currentY - lines);
            // ゲームオーバー判定は固定時に行う
        }
    }

    randomPiece() {
        const type = rng.choice(TETROMINO_TYPES);
        return { type, ...TETROMINOS[type] };
    }

    spawnPiece() {
        this.currentPiece = this.nextPieces.shift();
        this.nextPieces.push(this.randomPiece());
        this.currentRotation = 0;
        const shape = this.currentPiece.shapes[0];
        this.currentX = Math.floor((TETRIS_COLS - shape[0].length) / 2);
        // スポーン位置：見えない領域の下部（TETRIS_HIDDEN_ROWS - 2）
        this.currentY = TETRIS_HIDDEN_ROWS - 2;
        this.resetLockState();
        this.holdUsed = false;
        this.lastMoveWasRotation = false;

        // スポーン時に衝突していても即ゲームオーバーにしない
        // 衝突している場合は1マス上に試す
        if (this.checkCollision(this.currentX, this.currentY, 0)) {
            this.currentY--;
            if (this.checkCollision(this.currentX, this.currentY, 0)) {
                // それでも衝突するなら、固定時にゲームオーバー判定
                // ここでは何もしない（操作を許可）
            }
        }
    }

    hold() {
        if (this.holdUsed || this.gameOver || this.isClearingAnimation) return false;

        const currentType = this.currentPiece.type;
        if (this.holdPiece) {
            this.currentPiece = { type: this.holdPiece, ...TETROMINOS[this.holdPiece] };
        } else {
            this.currentPiece = this.nextPieces.shift();
            this.nextPieces.push(this.randomPiece());
        }
        this.holdPiece = currentType;
        this.holdUsed = true;

        this.currentRotation = 0;
        const shape = this.currentPiece.shapes[0];
        this.currentX = Math.floor((TETRIS_COLS - shape[0].length) / 2);
        this.currentY = TETRIS_HIDDEN_ROWS - 2;
        this.resetLockState();
        this.lastMoveWasRotation = false;

        // スポーン時衝突チェック（即ゲームオーバーにしない）
        if (this.checkCollision(this.currentX, this.currentY, 0)) {
            this.currentY--;
        }
        return true;
    }

    resetLockState() {
        this.isGrounded = false;
        this.lockTimerMs = 0;
        this.lockResetCount = 0;
        this.totalLockTimeMs = 0;
        this.lockDelayActive = false;
    }

    updateGroundedState() {
        this.isGrounded = this.checkCollision(this.currentX, this.currentY + 1, this.currentRotation);
    }

    checkCollision(x, y, rotation) {
        const shape = this.currentPiece.shapes[rotation % this.currentPiece.shapes.length];
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    const newX = x + col;
                    const newY = y + row;
                    if (newX < 0 || newX >= TETRIS_COLS || newY >= TETRIS_TOTAL_ROWS) return true;
                    if (newY >= 0 && this.board[newY][newX]) return true;
                }
            }
        }
        return false;
    }

    move(dx, dy) {
        if (this.gameOver || this.isClearingAnimation) return false;
        const newX = this.currentX + dx;
        const newY = this.currentY + dy;
        if (!this.checkCollision(newX, newY, this.currentRotation)) {
            const wasGrounded = this.isGrounded;
            this.currentX = newX;
            this.currentY = newY;
            this.updateGroundedState();
            this.lastMoveWasRotation = false;  // 移動したので回転フラグリセット
            if (wasGrounded && this.lockDelayActive) {
                if (!this.isGrounded) {
                    this.lockTimerMs = 0;
                } else if (this.lockResetCount < BALANCE.LOCK_MAX_RESETS) {
                    this.lockTimerMs = 0;
                    this.lockResetCount++;
                }
            }
            return true;
        }
        return false;
    }

    // 時計回り回転
    rotateCW() {
        if (this.gameOver || this.isClearingAnimation) return false;
        const numRotations = this.currentPiece.shapes.length;
        const newRotation = (this.currentRotation + 1) % numRotations;
        return this._tryRotate(newRotation);
    }

    // 反時計回り回転
    rotateCCW() {
        if (this.gameOver || this.isClearingAnimation) return false;
        const numRotations = this.currentPiece.shapes.length;
        const newRotation = (this.currentRotation - 1 + numRotations) % numRotations;
        return this._tryRotate(newRotation);
    }

    // 回転の共通処理（壁蹴り含む）
    _tryRotate(newRotation) {
        // 壁蹴りオフセット（左右・上下に1マス試す）
        const kicks = [
            { x: 0, y: 0 },
            { x: -1, y: 0 },
            { x: 1, y: 0 },
            { x: 0, y: -1 },
            { x: -1, y: -1 },
            { x: 1, y: -1 },
            { x: -2, y: 0 },
            { x: 2, y: 0 }
        ];

        for (const kick of kicks) {
            if (!this.checkCollision(this.currentX + kick.x, this.currentY + kick.y, newRotation)) {
                const wasGrounded = this.isGrounded;
                this.currentX += kick.x;
                this.currentY += kick.y;
                this.currentRotation = newRotation;
                this.updateGroundedState();
                this.lastMoveWasRotation = true;  // 回転成功
                if (wasGrounded && this.lockDelayActive) {
                    if (!this.isGrounded) {
                        this.lockTimerMs = 0;
                    } else if (this.lockResetCount < BALANCE.LOCK_MAX_RESETS) {
                        this.lockTimerMs = 0;
                        this.lockResetCount++;
                    }
                }
                return true;
            }
        }
        return false;
    }

    // 旧rotate()メソッド（互換性のため残す、時計回りとして動作）
    rotate() {
        return this.rotateCW();
    }

    hardDrop() {
        if (this.gameOver || this.isClearingAnimation) return { linesCleared: 0 };
        // ハードドロップ前の最後の操作が回転だったかを保持
        const wasRotation = this.lastMoveWasRotation;
        while (this.move(0, 1)) {}
        // ハードドロップ自体は移動だが、直前が回転ならTスピン判定に使う
        this.lastMoveWasRotation = wasRotation;
        return this.lockPiece();
    }

    // Tスピン判定：T型ミノで、回転で固定し、4角のうち3つ以上が埋まっている
    checkTSpin() {
        if (this.currentPiece.type !== 'T') return false;
        if (!this.lastMoveWasRotation) return false;

        // T型の中心位置を計算
        const centerOffset = T_CENTER_OFFSETS[this.currentRotation % 4];
        const centerX = this.currentX + centerOffset.x;
        const centerY = this.currentY + centerOffset.y;

        // 4角の位置: (x-1,y-1), (x+1,y-1), (x-1,y+1), (x+1,y+1)
        const corners = [
            { x: centerX - 1, y: centerY - 1 },
            { x: centerX + 1, y: centerY - 1 },
            { x: centerX - 1, y: centerY + 1 },
            { x: centerX + 1, y: centerY + 1 }
        ];

        let filledCorners = 0;
        for (const corner of corners) {
            // 壁・床・既存ブロックで埋まっているかチェック
            if (corner.x < 0 || corner.x >= TETRIS_COLS || corner.y >= TETRIS_TOTAL_ROWS) {
                filledCorners++;
            } else if (corner.y >= 0 && this.board[corner.y][corner.x]) {
                filledCorners++;
            } else if (corner.y < 0) {
                // 上端より上は壁扱い
                filledCorners++;
            }
        }

        return filledCorners >= 3;
    }

    lockPiece() {
        const shape = this.currentPiece.shapes[this.currentRotation % this.currentPiece.shapes.length];
        const isTSpin = this.checkTSpin();
        let hasBlockAboveVisible = false;

        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    const boardY = this.currentY + row;
                    const boardX = this.currentX + col;
                    if (boardY >= 0 && boardY < TETRIS_TOTAL_ROWS && boardX >= 0 && boardX < TETRIS_COLS) {
                        this.board[boardY][boardX] = 1;
                        this.boardColors[boardY][boardX] = this.currentPiece.color;
                    }
                    // 可視領域より上にブロックがあるかチェック
                    if (boardY < TETRIS_HIDDEN_ROWS) {
                        hasBlockAboveVisible = true;
                    }
                }
            }
        }

        // ゲームオーバー判定：固定後に見えない領域にブロックが残っている
        if (hasBlockAboveVisible) {
            // 見えない領域にブロックがあるかチェック
            for (let row = 0; row < TETRIS_HIDDEN_ROWS; row++) {
                for (let col = 0; col < TETRIS_COLS; col++) {
                    if (this.board[row][col]) {
                        this.gameOver = true;
                        break;
                    }
                }
                if (this.gameOver) break;
            }
        }

        const result = this.clearLines(isTSpin);
        if (!result.animating) {
            this.spawnPiece();
        }
        return result;
    }

    clearLines(isTSpin = false) {
        this.clearingLines = [];
        // 全行（見えない領域含む）をチェック
        for (let row = TETRIS_TOTAL_ROWS - 1; row >= 0; row--) {
            if (this.board[row].every(cell => cell !== 0)) {
                this.clearingLines.push(row);
            }
        }

        if (this.clearingLines.length > 0) {
            this.isClearingAnimation = true;
            this.clearAnimTimer = 0;
            this._pendingTSpin = isTSpin;
            this._pendingTSpinLines = this.clearingLines.length;
            return { linesCleared: 0, pieceLocked: true, animating: true };
        }

        return { linesCleared: 0, pieceLocked: true, animating: false, specialClear: false };
    }

    finishLineClear() {
        const linesCleared = this.clearingLines.length;
        const isTSpin = this._pendingTSpin || false;

        this.clearingLines.sort((a, b) => b - a);
        for (const row of this.clearingLines) {
            this.board.splice(row, 1);
            this.boardColors.splice(row, 1);
        }
        for (let i = 0; i < linesCleared; i++) {
            this.board.unshift(Array(TETRIS_COLS).fill(0));
            this.boardColors.unshift(Array(TETRIS_COLS).fill(null));
        }

        let specialClear = false;
        let specialClearLines = 0;
        let bonusScore = 0;

        if (linesCleared > 0) {
            this.lines += linesCleared;
            this.score += BALANCE.SCORE_PER_LINE[linesCleared] || 0;

            // Tスピンボーナス
            if (isTSpin) {
                specialClear = true;
                specialClearLines = linesCleared;
                if (linesCleared === 1) bonusScore = TSPIN_BONUS.LINE_1;
                else if (linesCleared === 2) bonusScore = TSPIN_BONUS.LINE_2;
                else if (linesCleared >= 3) bonusScore = TSPIN_BONUS.LINE_3;
                this.score += bonusScore;
                console.log(`T-SPIN! ${linesCleared}ライン消去 ボーナス+${bonusScore}`);
            }
        }

        this.clearingLines = [];
        this.isClearingAnimation = false;
        this._pendingTSpin = false;
        this._pendingTSpinLines = 0;

        return {
            linesCleared,
            specialClear,
            specialClearLines,
            bonusScore
        };
    }

    update(deltaTime, currentTime, dropInterval) {
        if (this.gameOver) return { linesCleared: 0, pieceLocked: false };

        if (this.isClearingAnimation) {
            this.clearAnimTimer += deltaTime;
            if (this.clearAnimTimer >= BALANCE.LINE_CLEAR_DURATION) {
                const result = this.finishLineClear();
                this.spawnPiece();
                return { ...result, pieceLocked: false };
            }
            return { linesCleared: 0, pieceLocked: false };
        }

        this.updateGroundedState();

        if (this.isGrounded) {
            this.lockDelayActive = true;
            this.lockTimerMs += deltaTime;
            this.totalLockTimeMs += deltaTime;
            if (this.lockTimerMs >= BALANCE.LOCK_DELAY_MS || this.totalLockTimeMs >= BALANCE.LOCK_TOTAL_MAX_MS) {
                return this.lockPiece();
            }
        } else {
            if (currentTime - this.lastDrop > dropInterval) {
                this.move(0, 1);
                this.lastDrop = currentTime;
            }
        }
        return { linesCleared: 0, pieceLocked: false };
    }

    draw(ctx, offsetX, offsetY, showLockIndicator = false, bgColor = '#111122', gridColor = '#222244') {
        ctx.fillStyle = bgColor;
        ctx.fillRect(offsetX, offsetY, TETRIS_WIDTH, TETRIS_HEIGHT);

        ctx.strokeStyle = gridColor;
        ctx.lineWidth = 1;
        for (let x = 0; x <= TETRIS_COLS; x++) {
            ctx.beginPath();
            ctx.moveTo(offsetX + x * BLOCK_SIZE, offsetY);
            ctx.lineTo(offsetX + x * BLOCK_SIZE, offsetY + TETRIS_HEIGHT);
            ctx.stroke();
        }
        for (let y = 0; y <= TETRIS_ROWS; y++) {
            ctx.beginPath();
            ctx.moveTo(offsetX, offsetY + y * BLOCK_SIZE);
            ctx.lineTo(offsetX + TETRIS_WIDTH, offsetY + y * BLOCK_SIZE);
            ctx.stroke();
        }

        // 可視領域のみ描画（TETRIS_HIDDEN_ROWS以降）
        for (let row = TETRIS_HIDDEN_ROWS; row < TETRIS_TOTAL_ROWS; row++) {
            for (let col = 0; col < TETRIS_COLS; col++) {
                if (this.board[row][col]) {
                    const displayRow = row - TETRIS_HIDDEN_ROWS;
                    const isClearingRow = this.clearingLines.includes(row);
                    if (isClearingRow) {
                        const progress = this.clearAnimTimer / BALANCE.LINE_CLEAR_DURATION;
                        const flash = Math.sin(progress * Math.PI * 6) * 0.5 + 0.5;
                        ctx.globalAlpha = 1 - progress * 0.7;
                        ctx.fillStyle = `hsl(${60 + flash * 60}, 100%, ${50 + flash * 40}%)`;
                        ctx.fillRect(offsetX + col * BLOCK_SIZE + 1, offsetY + displayRow * BLOCK_SIZE + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
                        ctx.globalAlpha = 1.0;
                    } else {
                        this.drawBlock(ctx, offsetX + col * BLOCK_SIZE, offsetY + displayRow * BLOCK_SIZE, this.boardColors[row][col]);
                    }
                }
            }
        }

        if (this.isClearingAnimation && this.clearingLines.length > 0) {
            const progress = this.clearAnimTimer / BALANCE.LINE_CLEAR_DURATION;
            for (const row of this.clearingLines) {
                if (row < TETRIS_HIDDEN_ROWS) continue;  // 見えない領域はスキップ
                const displayRow = row - TETRIS_HIDDEN_ROWS;
                const expandWidth = progress * TETRIS_WIDTH;
                const centerX = offsetX + TETRIS_WIDTH / 2;
                ctx.fillStyle = `rgba(255, 255, 255, ${0.8 * (1 - progress)})`;
                ctx.fillRect(centerX - expandWidth / 2, offsetY + displayRow * BLOCK_SIZE, expandWidth, BLOCK_SIZE);

                for (let i = 0; i < 5; i++) {
                    const px = offsetX + Math.random() * TETRIS_WIDTH;
                    const py = offsetY + displayRow * BLOCK_SIZE + BLOCK_SIZE / 2;
                    const size = 3 + Math.random() * 5;
                    ctx.fillStyle = `hsla(${Math.random() * 60 + 30}, 100%, 70%, ${0.8 * (1 - progress)})`;
                    ctx.beginPath();
                    ctx.arc(px, py - progress * 30, size, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // Tスピン演出
            if (this._pendingTSpin) {
                ctx.fillStyle = `rgba(170, 0, 255, ${0.5 * (1 - progress)})`;
                ctx.font = 'bold 24px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('T-SPIN!', offsetX + TETRIS_WIDTH / 2, offsetY + TETRIS_HEIGHT / 2 - 20 - progress * 30);
                ctx.textAlign = 'left';
            }
        }

        if (this.currentPiece && !this.gameOver && !this.isClearingAnimation) {
            let ghostY = this.currentY;
            while (!this.checkCollision(this.currentX, ghostY + 1, this.currentRotation)) ghostY++;
            // ゴースト表示（可視領域のみ）
            if (ghostY >= TETRIS_HIDDEN_ROWS) {
                this.drawPieceAt(ctx, offsetX, offsetY, this.currentX, ghostY - TETRIS_HIDDEN_ROWS, this.currentRotation, 0.3);
            }

            let alpha = 1.0;
            if (this.lockDelayActive && this.isGrounded) {
                alpha = 0.6 + Math.sin(Date.now() / 50) * 0.2;
            }
            // 現在ピース表示（可視領域のみ）
            const displayY = this.currentY - TETRIS_HIDDEN_ROWS;
            this.drawPieceAt(ctx, offsetX, offsetY, this.currentX, displayY, this.currentRotation, alpha);
        }

        if (showLockIndicator && this.lockDelayActive && this.isGrounded && !this.isClearingAnimation) {
            const progress = this.lockTimerMs / BALANCE.LOCK_DELAY_MS;
            ctx.fillStyle = '#333';
            ctx.fillRect(offsetX, offsetY + TETRIS_HEIGHT + 5, TETRIS_WIDTH, 8);
            ctx.fillStyle = progress > 0.7 ? '#ff4444' : '#ffaa44';
            ctx.fillRect(offsetX, offsetY + TETRIS_HEIGHT + 5, TETRIS_WIDTH * progress, 8);
        }
    }

    drawBlock(ctx, x, y, color, alpha = 1.0) {
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, BLOCK_SIZE - 2);
        ctx.fillStyle = 'rgba(255,255,255,0.3)';
        ctx.fillRect(x + 1, y + 1, BLOCK_SIZE - 2, 3);
        ctx.fillRect(x + 1, y + 1, 3, BLOCK_SIZE - 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(x + BLOCK_SIZE - 4, y + 4, 3, BLOCK_SIZE - 5);
        ctx.fillRect(x + 4, y + BLOCK_SIZE - 4, BLOCK_SIZE - 5, 3);
        ctx.globalAlpha = 1.0;
    }

    drawPieceAt(ctx, offsetX, offsetY, px, py, rotation, alpha) {
        const shape = this.currentPiece.shapes[rotation % this.currentPiece.shapes.length];
        for (let row = 0; row < shape.length; row++) {
            for (let col = 0; col < shape[row].length; col++) {
                if (shape[row][col]) {
                    const drawY = py + row;
                    // 可視領域内のブロックのみ描画
                    if (drawY >= 0) {
                        this.drawBlock(ctx, offsetX + (px + col) * BLOCK_SIZE, offsetY + drawY * BLOCK_SIZE, this.currentPiece.color, alpha);
                    }
                }
            }
        }
    }

    drawNext(ctx, x, y) {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(x, y, 90, 180);
        ctx.strokeStyle = '#4a4a6a';
        ctx.strokeRect(x, y, 90, 180);
        ctx.fillStyle = '#aaa';
        ctx.font = '11px monospace';
        ctx.fillText('NEXT', x + 30, y + 14);

        for (let i = 0; i < 3; i++) {
            const piece = this.nextPieces[i];
            if (piece) {
                const shape = piece.shapes[0];
                const bs = i === 0 ? 15 : 12;
                const ox = x + 45 - (shape[0].length * bs) / 2;
                const oy = y + 35 + i * 50 - (shape.length * bs) / 2;
                ctx.globalAlpha = i === 0 ? 1.0 : 0.6;
                for (let row = 0; row < shape.length; row++) {
                    for (let col = 0; col < shape[row].length; col++) {
                        if (shape[row][col]) {
                            ctx.fillStyle = piece.color;
                            ctx.fillRect(ox + col * bs + 1, oy + row * bs + 1, bs - 2, bs - 2);
                        }
                    }
                }
                ctx.globalAlpha = 1.0;
            }
        }
    }

    drawHold(ctx, x, y) {
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(x, y, 90, 70);
        ctx.strokeStyle = this.holdUsed ? '#333' : '#4a4a6a';
        ctx.strokeRect(x, y, 90, 70);
        ctx.fillStyle = this.holdUsed ? '#666' : '#aaa';
        ctx.font = '11px monospace';
        ctx.fillText('HOLD', x + 28, y + 14);

        if (this.holdPiece) {
            const piece = TETROMINOS[this.holdPiece];
            const shape = piece.shapes[0];
            const bs = 15;
            const ox = x + 45 - (shape[0].length * bs) / 2;
            const oy = y + 42 - (shape.length * bs) / 2;
            ctx.globalAlpha = this.holdUsed ? 0.4 : 1.0;
            for (let row = 0; row < shape.length; row++) {
                for (let col = 0; col < shape[row].length; col++) {
                    if (shape[row][col]) {
                        ctx.fillStyle = piece.color;
                        ctx.fillRect(ox + col * bs + 1, oy + row * bs + 1, bs - 2, bs - 2);
                    }
                }
            }
            ctx.globalAlpha = 1.0;
        }
    }
}
