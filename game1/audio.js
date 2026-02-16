// ========================================
// NEURAL ASCENSION - オーディオエンジン (EDM版)
// ========================================
// Web Audio API を使用した EDM風BGM＆SFXシステム。
// BPM128 のキック・ベース・ハイハットによるリズムループ。
// 進化ステージに応じて音色とエネルギーが変化する。
//
// 構造:
//   Kick    … 合成キックドラム（sine + pitch envelope）
//   Bass    … サブベース + フィルタ付きシンセライン
//   HiHat   … フィルタードノイズの短いバースト
//   Pad     … 持続パッド音（雰囲気づけ）
//   Space   … リバーブ＋ディレイ
//   SFX     … クリック／購入／進化の短い効果音

"use strict";

// ========================================
// BPM と定数
// ========================================
const EDM_BPM = 128;
const BEAT_SEC = 60 / EDM_BPM;           // 1拍 = 0.46875s
const SIXTEENTH = BEAT_SEC / 4;           // 16分音符

// ========================================
// 8段階オーディオプリセット
// ========================================
const AUDIO_PRESETS = [
  // 0: 旧猿人の世界 — 控えめ、シンプルなビート
  {
    kick:  { gain: 0.38, pitch: 55, decay: 0.25 },
    bass:  { freq: 55, wave: "sine", filterFreq: 200, gain: 0.18 },
    hihat: { gain: 0.04, filterFreq: 6000, decay: 0.04 },
    pad:   { freq: 110, wave: "sine", filterFreq: 400, gain: 0.06, freq2: 165 },
    space: { reverbSend: 0.10, delayTime: 0, delayFeedback: 0, delayGain: 0 },
    pattern: "minimal",
  },
  // 1: 初期人類 — 少しエネルギーアップ
  {
    kick:  { gain: 0.42, pitch: 58, decay: 0.28 },
    bass:  { freq: 65.41, wave: "sine", filterFreq: 300, gain: 0.20 },
    hihat: { gain: 0.05, filterFreq: 7000, decay: 0.04 },
    pad:   { freq: 130.81, wave: "sine", filterFreq: 600, gain: 0.07, freq2: 196 },
    space: { reverbSend: 0.12, delayTime: 0, delayFeedback: 0, delayGain: 0 },
    pattern: "basic",
  },
  // 2: 農耕文明 — ベースラインが動き出す
  {
    kick:  { gain: 0.45, pitch: 55, decay: 0.30 },
    bass:  { freq: 73.42, wave: "sawtooth", filterFreq: 450, gain: 0.15 },
    hihat: { gain: 0.06, filterFreq: 8000, decay: 0.05 },
    pad:   { freq: 146.83, wave: "triangle", filterFreq: 800, gain: 0.06, freq2: 220 },
    space: { reverbSend: 0.15, delayTime: BEAT_SEC * 0.75, delayFeedback: 0.2, delayGain: 0.06 },
    pattern: "groove",
  },
  // 3: 産業革命 — 力強いビート
  {
    kick:  { gain: 0.50, pitch: 52, decay: 0.32 },
    bass:  { freq: 55, wave: "sawtooth", filterFreq: 600, gain: 0.16 },
    hihat: { gain: 0.07, filterFreq: 9000, decay: 0.05 },
    pad:   { freq: 110, wave: "triangle", filterFreq: 1000, gain: 0.07, freq2: 164.81 },
    space: { reverbSend: 0.18, delayTime: BEAT_SEC * 0.5, delayFeedback: 0.25, delayGain: 0.08 },
    pattern: "driving",
  },
  // 4: 情報化社会 — テクノ寄り
  {
    kick:  { gain: 0.52, pitch: 50, decay: 0.35 },
    bass:  { freq: 65.41, wave: "sawtooth", filterFreq: 800, gain: 0.14 },
    hihat: { gain: 0.08, filterFreq: 10000, decay: 0.04 },
    pad:   { freq: 130.81, wave: "sawtooth", filterFreq: 1200, gain: 0.05, freq2: 196 },
    space: { reverbSend: 0.20, delayTime: BEAT_SEC * 0.375, delayFeedback: 0.30, delayGain: 0.10 },
    pattern: "techno",
  },
  // 5: AI超越 — アグレッシブ
  {
    kick:  { gain: 0.55, pitch: 48, decay: 0.35 },
    bass:  { freq: 55, wave: "sawtooth", filterFreq: 1000, gain: 0.15 },
    hihat: { gain: 0.09, filterFreq: 11000, decay: 0.03 },
    pad:   { freq: 110, wave: "sawtooth", filterFreq: 1500, gain: 0.05, freq2: 146.83 },
    space: { reverbSend: 0.22, delayTime: BEAT_SEC * 0.25, delayFeedback: 0.35, delayGain: 0.10 },
    pattern: "aggressive",
  },
  // 6: 星間文明 — 宇宙的トランス
  {
    kick:  { gain: 0.50, pitch: 45, decay: 0.38 },
    bass:  { freq: 41.2, wave: "sine", filterFreq: 700, gain: 0.18 },
    hihat: { gain: 0.07, filterFreq: 12000, decay: 0.05 },
    pad:   { freq: 82.41, wave: "sine", filterFreq: 2000, gain: 0.08, freq2: 123.47 },
    space: { reverbSend: 0.35, delayTime: BEAT_SEC * 0.75, delayFeedback: 0.40, delayGain: 0.12 },
    pattern: "trance",
  },
  // 7: 超越 — エピック、全開
  {
    kick:  { gain: 0.55, pitch: 42, decay: 0.40 },
    bass:  { freq: 36.71, wave: "sawtooth", filterFreq: 900, gain: 0.16 },
    hihat: { gain: 0.08, filterFreq: 13000, decay: 0.04 },
    pad:   { freq: 73.42, wave: "sawtooth", filterFreq: 2500, gain: 0.07, freq2: 110 },
    space: { reverbSend: 0.40, delayTime: BEAT_SEC * 0.5, delayFeedback: 0.40, delayGain: 0.12 },
    pattern: "epic",
  },
];

// ========================================
// リズムパターン定義
// ========================================
// 16ステップ（1小節）。K=kick, H=hihat, .=rest
const RHYTHM_PATTERNS = {
  //                  1...2...3...4...  (16ステップ、各4文字=1拍)
  minimal:   { kick: "K...........K...", hihat: "....H.......H..." },
  basic:     { kick: "K.......K.......", hihat: "....H.......H..." },
  groove:    { kick: "K.......K.K.....", hihat: "..H...H...H...H." },
  driving:   { kick: "K...K...K...K...", hihat: "..H...H...H...H." },
  techno:    { kick: "K...K...K...K...", hihat: "..H...H...H...H." },
  aggressive:{ kick: "K..K..K.K...K.K.", hihat: ".HH..HH..HH..HH." },
  trance:    { kick: "K...K...K...K...", hihat: "..H...H...H..HH." },
  epic:      { kick: "K..K.K..K..K.K..", hihat: ".HHH.HHH.HHH.HH." },
};

// ========================================
// AudioManager クラス
// ========================================

class AudioManager {
  constructor() {
    this.ctx = null;
    this.initialized = false;
    this.muted = false;
    this.ambientVolume = 0.5;
    this.sfxVolume = 0.5;
    this.currentStage = -1;
    this.intensity = 0;

    // オーディオノード
    this.masterGain = null;
    this.ambientBus = null;
    this.ambientVol = null;
    this.sfxBus = null;

    // リバーブ
    this.reverbSend = null;
    this.convolver = null;
    this.reverbReturn = null;

    // ディレイ
    this.delaySend = null;
    this.delay = null;
    this.delayFeedback = null;
    this.delayReturn = null;

    // ノイズバッファ（ハイハット用）
    this.noiseBuffer = null;

    // 現在のレイヤーノード群
    this.bassNodes = null;
    this.padNodes = null;

    // リズムスケジューラ
    this._schedulerTimer = null;
    this._nextStepTime = 0;
    this._currentStep = 0;
    this._currentPattern = null;
    this._currentPreset = null;
  }

  // ========================================
  // 初期化
  // ========================================

  init() {
    if (this.initialized) return;

    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn("Web Audio API is not supported:", e);
      return;
    }

    // ノイズバッファ生成（ハイハット用、短め）
    this.noiseBuffer = this._createNoiseBuffer(0.5);

    // === シグナルチェーン ===
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = 1.0;
    this.masterGain.connect(this.ctx.destination);

    // アンビエントバス
    this.ambientBus = this.ctx.createGain();
    this.ambientBus.gain.value = 1.0;

    this.ambientVol = this.ctx.createGain();
    this.ambientVol.gain.value = this.ambientVolume;
    this.ambientBus.connect(this.ambientVol);
    this.ambientVol.connect(this.masterGain);

    // リバーブ
    this.reverbSend = this.ctx.createGain();
    this.reverbSend.gain.value = 0;
    this.convolver = this.ctx.createConvolver();
    this.convolver.buffer = this._createImpulseResponse(2, 4);
    this.reverbReturn = this.ctx.createGain();
    this.reverbReturn.gain.value = 0.5;

    this.ambientVol.connect(this.reverbSend);
    this.reverbSend.connect(this.convolver);
    this.convolver.connect(this.reverbReturn);
    this.reverbReturn.connect(this.masterGain);

    // ディレイ
    this.delaySend = this.ctx.createGain();
    this.delaySend.gain.value = 0;
    this.delay = this.ctx.createDelay(2.0);
    this.delay.delayTime.value = 0.3;
    this.delayFeedback = this.ctx.createGain();
    this.delayFeedback.gain.value = 0;
    this.delayReturn = this.ctx.createGain();
    this.delayReturn.gain.value = 0;

    this.ambientVol.connect(this.delaySend);
    this.delaySend.connect(this.delay);
    this.delay.connect(this.delayFeedback);
    this.delayFeedback.connect(this.delay);
    this.delay.connect(this.delayReturn);
    this.delayReturn.connect(this.masterGain);

    // SFXバス
    this.sfxBus = this.ctx.createGain();
    this.sfxBus.gain.value = this.sfxVolume;
    this.sfxBus.connect(this.masterGain);

    this.initialized = true;
    console.log("AudioManager initialized (EDM mode, BPM " + EDM_BPM + ").");
  }

  // ========================================
  // パブリック API
  // ========================================

  setStage(stageIndex) {
    if (!this.initialized) return;
    const idx = Math.max(0, Math.min(stageIndex, AUDIO_PRESETS.length - 1));
    if (idx === this.currentStage) return;
    this._crossfadeTo(idx);
  }

  setIntensity(value) {
    if (!this.initialized) return;
    this.intensity = Math.max(0, Math.min(1, value));
    if (this.currentStage < 0) return;

    const preset = AUDIO_PRESETS[this.currentStage];
    const now = this.ctx.currentTime;
    const TAU = 0.5;

    // ベースフィルタ: intensity で開く
    if (this.bassNodes && this.bassNodes.filter) {
      const filterMod = this.intensity * 300;
      this.bassNodes.filter.frequency.setTargetAtTime(
        preset.bass.filterFreq + filterMod, now, TAU
      );
    }

    // パッドゲイン: intensity で少し大きく
    if (this.padNodes && this.padNodes.gain) {
      const padMod = preset.pad.gain * (1 + this.intensity * 0.4);
      this.padNodes.gain.gain.setTargetAtTime(padMod, now, TAU);
    }

    // リバーブ: intensity で増加
    const reverbMod = preset.space.reverbSend * (1 + this.intensity * 0.3);
    this.reverbSend.gain.setTargetAtTime(Math.min(0.6, reverbMod), now, TAU);
  }

  setMute(muted) {
    this.muted = muted;
    if (!this.initialized) return;
    this.masterGain.gain.setTargetAtTime(muted ? 0 : 1, this.ctx.currentTime, 0.05);
  }

  setAmbientVolume(vol) {
    this.ambientVolume = Math.max(0, Math.min(1, vol));
    if (!this.initialized) return;
    this.ambientVol.gain.setTargetAtTime(this.ambientVolume, this.ctx.currentTime, 0.05);
  }

  setSfxVolume(vol) {
    this.sfxVolume = Math.max(0, Math.min(1, vol));
    if (!this.initialized) return;
    this.sfxBus.gain.setTargetAtTime(this.sfxVolume, this.ctx.currentTime, 0.05);
  }

  // ========================================
  // SFX（効果音）
  // ========================================

  playClickSfx() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const stage = Math.max(0, this.currentStage);
    const baseFreq = 400 + stage * 60;

    const osc = this.ctx.createOscillator();
    osc.type = stage < 4 ? "sine" : "triangle";
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 1.4, now + 0.04);

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.13, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(env);
    env.connect(this.sfxBus);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  playPurchaseSfx() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;
    const stage = Math.max(0, this.currentStage);
    const baseFreq = 350 + stage * 40;

    [0, 0.07].forEach((offset, i) => {
      const osc = this.ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = baseFreq * (i === 0 ? 1 : 1.5);

      const env = this.ctx.createGain();
      env.gain.setValueAtTime(0, now + offset);
      env.gain.linearRampToValueAtTime(0.1, now + offset + 0.02);
      env.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.15);

      osc.connect(env);
      env.connect(this.sfxBus);
      osc.start(now + offset);
      osc.stop(now + offset + 0.15);
    });
  }

  playEvolutionSfx() {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;

    // ライザー（上昇スウィープ）
    const osc1 = this.ctx.createOscillator();
    osc1.type = "sawtooth";
    osc1.frequency.setValueAtTime(80, now);
    osc1.frequency.exponentialRampToValueAtTime(600, now + 1.2);

    const osc2 = this.ctx.createOscillator();
    osc2.type = "sawtooth";
    osc2.frequency.setValueAtTime(120, now);
    osc2.frequency.exponentialRampToValueAtTime(900, now + 1.2);

    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(150, now);
    filter.frequency.exponentialRampToValueAtTime(4000, now + 1.2);
    filter.Q.value = 4;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0, now);
    env.gain.linearRampToValueAtTime(0.15, now + 0.2);
    env.gain.setTargetAtTime(0.15, now + 0.2, 0.4);
    env.gain.setTargetAtTime(0.001, now + 1.0, 0.2);

    // インパクト（ドロップ感）
    const impactOsc = this.ctx.createOscillator();
    impactOsc.type = "sine";
    impactOsc.frequency.setValueAtTime(120, now + 1.2);
    impactOsc.frequency.exponentialRampToValueAtTime(30, now + 1.6);

    const impactEnv = this.ctx.createGain();
    impactEnv.gain.setValueAtTime(0, now + 1.15);
    impactEnv.gain.linearRampToValueAtTime(0.25, now + 1.2);
    impactEnv.gain.exponentialRampToValueAtTime(0.001, now + 1.8);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(env);
    env.connect(this.sfxBus);
    impactOsc.connect(impactEnv);
    impactEnv.connect(this.sfxBus);

    osc1.start(now); osc2.start(now);
    osc1.stop(now + 2); osc2.stop(now + 2);
    impactOsc.start(now + 1.15);
    impactOsc.stop(now + 2);
  }

  // ========================================
  // バフ発動コーラスSFX
  // ========================================

  playBuffChoirSfx(type) {
    if (!this.initialized) return;
    const now = this.ctx.currentTime;

    // ひらめき: 明るい長三和音(C4-E4-G4), OverClock: 力強い短三和音+5度(C3-Eb3-G3-C4)
    const chords = {
      inspiration: [261.63, 329.63, 392.00, 523.25],
      overclock:   [130.81, 155.56, 196.00, 261.63],
    };
    const notes = chords[type] || chords.inspiration;
    const duration = type === "overclock" ? 3.5 : 3.0;
    const gain = type === "overclock" ? 0.10 : 0.08;

    // フォルマントフィルタ（"aah"母音の近似: F1≈800Hz, F2≈1200Hz）
    const formant1 = this.ctx.createBiquadFilter();
    formant1.type = "bandpass";
    formant1.frequency.value = 800;
    formant1.Q.value = 5;

    const formant2 = this.ctx.createBiquadFilter();
    formant2.type = "bandpass";
    formant2.frequency.value = 1200;
    formant2.Q.value = 5;

    const formantMix = this.ctx.createGain();
    formantMix.gain.value = 1.0;

    // リバーブ用のコンボルバ（コーラス専用の長い残響）
    const choirReverb = this.ctx.createConvolver();
    choirReverb.buffer = this._createImpulseResponse(3, 2.5);
    const reverbGain = this.ctx.createGain();
    reverbGain.gain.value = 0.4;

    // マスターエンベロープ（ゆっくり立ち上がり、長いサスティン、フェードアウト）
    const masterEnv = this.ctx.createGain();
    masterEnv.gain.setValueAtTime(0, now);
    masterEnv.gain.linearRampToValueAtTime(gain, now + 0.8);
    masterEnv.gain.setValueAtTime(gain, now + duration - 1.5);
    masterEnv.gain.linearRampToValueAtTime(0.001, now + duration);

    // 各音程に対してデチューンした複数ボイスを生成
    const allOscs = [];
    for (const freq of notes) {
      // 1音程あたり3ボイス（微妙にデチューン）
      const detunes = [-6, 0, 6];
      for (const dt of detunes) {
        const osc = this.ctx.createOscillator();
        osc.type = "sawtooth";
        osc.frequency.value = freq;
        osc.detune.value = dt + (Math.random() - 0.5) * 4;

        // ビブラート（LFO）
        const vibLfo = this.ctx.createOscillator();
        vibLfo.type = "sine";
        vibLfo.frequency.value = 4.5 + Math.random() * 1.5;
        const vibDepth = this.ctx.createGain();
        vibDepth.gain.value = 3;
        vibLfo.connect(vibDepth);
        vibDepth.connect(osc.frequency);

        // フォルマントフィルタへ分岐
        osc.connect(formant1);
        osc.connect(formant2);

        osc.start(now);
        osc.stop(now + duration + 0.5);
        vibLfo.start(now);
        vibLfo.stop(now + duration + 0.5);
        allOscs.push(osc, vibLfo);
      }
    }

    // シグナルチェーン: フォルマント → ミックス → エンベロープ → SFXバス + リバーブ
    formant1.connect(formantMix);
    formant2.connect(formantMix);
    formantMix.connect(masterEnv);
    masterEnv.connect(this.sfxBus);
    masterEnv.connect(choirReverb);
    choirReverb.connect(reverbGain);
    reverbGain.connect(this.sfxBus);
  }

  // ========================================
  // 内部: バッファ生成
  // ========================================

  _createNoiseBuffer(durationSec) {
    const length = this.ctx.sampleRate * durationSec;
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  _createImpulseResponse(durationSec, decay) {
    const length = this.ctx.sampleRate * durationSec;
    const impulse = this.ctx.createBuffer(2, length, this.ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = impulse.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  // ========================================
  // 内部: キックドラム合成
  // ========================================

  _playKick(time, preset) {
    const k = preset.kick;

    // ピッチエンベロープ付きサイン波
    const osc = this.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(k.pitch * 3, time);
    osc.frequency.exponentialRampToValueAtTime(k.pitch, time + 0.04);
    osc.frequency.exponentialRampToValueAtTime(k.pitch * 0.5, time + k.decay);

    // クリック成分（アタック）
    const clickOsc = this.ctx.createOscillator();
    clickOsc.type = "triangle";
    clickOsc.frequency.setValueAtTime(1200, time);
    clickOsc.frequency.exponentialRampToValueAtTime(200, time + 0.02);

    const clickEnv = this.ctx.createGain();
    clickEnv.gain.setValueAtTime(k.gain * 0.5, time);
    clickEnv.gain.exponentialRampToValueAtTime(0.001, time + 0.025);

    // メインエンベロープ
    const env = this.ctx.createGain();
    env.gain.setValueAtTime(k.gain, time);
    env.gain.setValueAtTime(k.gain, time + 0.005);
    env.gain.exponentialRampToValueAtTime(0.001, time + k.decay);

    // ディストーション（軽い飽和感）
    const waveshaper = this.ctx.createWaveShaper();
    waveshaper.curve = this._makeDistortionCurve(8);

    osc.connect(env);
    clickOsc.connect(clickEnv);
    clickEnv.connect(waveshaper);
    env.connect(waveshaper);
    waveshaper.connect(this.ambientBus);

    osc.start(time);
    osc.stop(time + k.decay + 0.05);
    clickOsc.start(time);
    clickOsc.stop(time + 0.03);
  }

  _makeDistortionCurve(amount) {
    const samples = 256;
    const curve = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      const x = (i * 2) / samples - 1;
      curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x));
    }
    return curve;
  }

  // ========================================
  // 内部: ハイハット合成
  // ========================================

  _playHiHat(time, preset) {
    const h = preset.hihat;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = h.filterFreq;
    filter.Q.value = 1.0;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(h.gain, time);
    env.gain.exponentialRampToValueAtTime(0.001, time + h.decay);

    src.connect(filter);
    filter.connect(env);
    env.connect(this.ambientBus);

    src.start(time);
    src.stop(time + h.decay + 0.01);
  }

  // ========================================
  // 内部: ベースライン
  // ========================================

  _createBassLayer(preset) {
    const b = preset.bass;
    const nodes = {};

    nodes.osc = this.ctx.createOscillator();
    nodes.osc.type = b.wave;
    nodes.osc.frequency.value = b.freq;

    // サブベース（1オクターブ下のサイン）
    nodes.sub = this.ctx.createOscillator();
    nodes.sub.type = "sine";
    nodes.sub.frequency.value = b.freq / 2;

    nodes.filter = this.ctx.createBiquadFilter();
    nodes.filter.type = "lowpass";
    nodes.filter.frequency.value = b.filterFreq;
    nodes.filter.Q.value = 2.0;

    // サイドチェーン風のゲインダッキング
    nodes.sidechain = this.ctx.createGain();
    nodes.sidechain.gain.value = 1.0;

    nodes.gain = this.ctx.createGain();
    nodes.gain.gain.value = 0;

    nodes.osc.connect(nodes.filter);
    nodes.sub.connect(nodes.filter);
    nodes.filter.connect(nodes.sidechain);
    nodes.sidechain.connect(nodes.gain);
    nodes.gain.connect(this.ambientBus);

    nodes.osc.start();
    nodes.sub.start();

    return nodes;
  }

  // ========================================
  // 内部: パッド音
  // ========================================

  _createPadLayer(preset) {
    const p = preset.pad;
    const nodes = {};

    nodes.osc = this.ctx.createOscillator();
    nodes.osc.type = p.wave;
    nodes.osc.frequency.value = p.freq;

    nodes.osc2 = this.ctx.createOscillator();
    nodes.osc2.type = p.wave;
    nodes.osc2.frequency.value = p.freq2;

    // ゆっくりしたデチューンLFO
    nodes.lfo = this.ctx.createOscillator();
    nodes.lfo.type = "sine";
    nodes.lfo.frequency.value = 0.15;
    nodes.lfoGain = this.ctx.createGain();
    nodes.lfoGain.gain.value = 2;
    nodes.lfo.connect(nodes.lfoGain);
    nodes.lfoGain.connect(nodes.osc.frequency);
    nodes.lfoGain.connect(nodes.osc2.frequency);

    nodes.filter = this.ctx.createBiquadFilter();
    nodes.filter.type = "lowpass";
    nodes.filter.frequency.value = p.filterFreq;
    nodes.filter.Q.value = 0.7;

    nodes.gain = this.ctx.createGain();
    nodes.gain.gain.value = 0;

    nodes.osc.connect(nodes.filter);
    nodes.osc2.connect(nodes.filter);
    nodes.filter.connect(nodes.gain);
    nodes.gain.connect(this.ambientBus);

    nodes.osc.start();
    nodes.osc2.start();
    nodes.lfo.start();

    return nodes;
  }

  // ========================================
  // 内部: サイドチェーン風ダッキング
  // ========================================

  _triggerSidechain(time) {
    if (!this.bassNodes || !this.bassNodes.sidechain) return;
    const sc = this.bassNodes.sidechain.gain;
    sc.setValueAtTime(0.15, time);
    sc.linearRampToValueAtTime(1.0, time + BEAT_SEC * 0.4);
  }

  // ========================================
  // 内部: リズムスケジューラ
  // ========================================

  _startScheduler() {
    this._stopScheduler();
    this._currentStep = 0;
    this._nextStepTime = this.ctx.currentTime + 0.1;
    this._scheduleAhead();
  }

  _stopScheduler() {
    if (this._schedulerTimer) {
      clearInterval(this._schedulerTimer);
      this._schedulerTimer = null;
    }
  }

  _scheduleAhead() {
    const LOOK_AHEAD = 0.15; // 150ms先読み
    const INTERVAL = 50;     // 50msごとにチェック

    this._schedulerTimer = setInterval(() => {
      if (!this.ctx || !this._currentPattern || !this._currentPreset) return;
      const now = this.ctx.currentTime;

      while (this._nextStepTime < now + LOOK_AHEAD) {
        this._scheduleStep(this._nextStepTime);
        this._nextStepTime += SIXTEENTH;
        this._currentStep = (this._currentStep + 1) % 16;
      }
    }, INTERVAL);
  }

  _scheduleStep(time) {
    const pattern = this._currentPattern;
    const preset = this._currentPreset;
    const step = this._currentStep;

    // キック
    if (step < pattern.kick.length && pattern.kick[step] === "K") {
      this._playKick(time, preset);
      this._triggerSidechain(time);
    }

    // ハイハット
    if (step < pattern.hihat.length && pattern.hihat[step] === "H") {
      this._playHiHat(time, preset);
    }
  }

  // ========================================
  // 内部: クロスフェード遷移
  // ========================================

  _crossfadeTo(stageIndex) {
    const FADE_SEC = 2;
    const TAU = FADE_SEC / 3;
    const now = this.ctx.currentTime;
    const preset = AUDIO_PRESETS[stageIndex];

    // 旧ノードのフェードアウト
    if (this.bassNodes) {
      const oldBass = this.bassNodes;
      const oldPad = this.padNodes;

      if (oldBass.gain) oldBass.gain.gain.setTargetAtTime(0, now, TAU);
      if (oldPad && oldPad.gain) oldPad.gain.gain.setTargetAtTime(0, now, TAU);

      setTimeout(() => {
        this._cleanupLayer(oldBass);
        this._cleanupLayer(oldPad);
      }, FADE_SEC * 1000 + 500);
    }

    // 新ノードの生成＆フェードイン
    this.bassNodes = this._createBassLayer(preset);
    this.padNodes = this._createPadLayer(preset);

    this.bassNodes.gain.gain.setValueAtTime(0.001, now);
    this.padNodes.gain.gain.setValueAtTime(0.001, now);
    this.bassNodes.gain.gain.setTargetAtTime(preset.bass.gain, now + 0.05, TAU);
    this.padNodes.gain.gain.setTargetAtTime(preset.pad.gain, now + 0.05, TAU);

    // 空間エフェクトの遷移
    this.reverbSend.gain.setTargetAtTime(preset.space.reverbSend, now, TAU);

    if (preset.space.delayTime > 0) {
      this.delay.delayTime.setTargetAtTime(preset.space.delayTime, now, TAU);
      this.delayFeedback.gain.setTargetAtTime(preset.space.delayFeedback, now, TAU);
      this.delayReturn.gain.setTargetAtTime(preset.space.delayGain, now, TAU);
      this.delaySend.gain.setTargetAtTime(0.3, now, TAU);
    } else {
      this.delaySend.gain.setTargetAtTime(0, now, TAU);
      this.delayReturn.gain.setTargetAtTime(0, now, TAU);
    }

    // リズムパターン切り替え
    this._currentPreset = preset;
    this._currentPattern = RHYTHM_PATTERNS[preset.pattern] || RHYTHM_PATTERNS.basic;

    if (!this._schedulerTimer) {
      this._startScheduler();
    }

    this.currentStage = stageIndex;
  }

  // ========================================
  // 内部: クリーンアップ
  // ========================================

  _cleanupLayer(nodes) {
    if (!nodes) return;
    const stoppable = ["osc", "osc2", "sub", "lfo", "noiseSrc", "pulseLfo"];
    for (const key of stoppable) {
      if (nodes[key]) {
        try { nodes[key].stop(); } catch (e) { /* already stopped */ }
      }
    }
    for (const key of Object.keys(nodes)) {
      if (nodes[key] && typeof nodes[key].disconnect === "function") {
        try { nodes[key].disconnect(); } catch (e) { /* already disconnected */ }
      }
    }
  }
}
