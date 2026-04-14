(() => {
  const COMPACT_STATE_PREFIX = "g2:";
  const DEFAULT_OSCILLATOR_SETTINGS = {
    active: false,
    waveform: "sine",
    volume: -12,
    frequency: 220,
    detune: 0,
    vibratoDepth: 0,
    vibratoRate: 5,
    pan: 0,
    filterCutoff: 12000,
    filterQ: 0.7,
    distortion: 0,
    delayTime: 0.18,
    delayMix: 0.12,
    delayFeedback: 0.2
  };
  const MAX_OUTPUT_DB = -2;
  const SPATIAL_SMOOTHING_SECONDS = 0.075;
  const DOPPLER_SMOOTHING_SECONDS = 0.06;
  const REAL_SPEED_OF_SOUND_FT_PER_SECOND = 343 * 3.280839895013123;
  const SIMULATED_SPEED_OF_SOUND_FT_PER_SECOND = REAL_SPEED_OF_SOUND_FT_PER_SECOND / 10;
  const ALIAS_TO_CONTROL = {
    a: "active",
    w: "waveform",
    v: "volume",
    f: "frequency",
    d: "detune",
    x: "vibratoDepth",
    y: "vibratoRate",
    p: "pan",
    c: "filterCutoff",
    q: "filterQ",
    o: "distortion",
    t: "delayTime",
    m: "delayMix",
    b: "delayFeedback"
  };
  const ALIAS_TO_WAVEFORM = {
    s: "sine",
    t: "triangle",
    q: "square",
    w: "sawtooth"
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function dbfsToGain(dbfs) {
    return Math.pow(10, dbfs / 20);
  }

  function rampAudioParam(param, value, context) {
    const now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + 0.03);
  }

  function smoothAudioParam(param, value, context, timeConstant) {
    const now = context.currentTime;

    if (typeof param.cancelAndHoldAtTime === "function") {
      param.cancelAndHoldAtTime(now);
    } else {
      param.cancelScheduledValues(now);
      param.setValueAtTime(param.value, now);
    }

    param.setTargetAtTime(value, now, timeConstant);
  }

  function createDistortionCurve(amount) {
    const samples = 256;
    const curve = new Float32Array(samples);
    const drive = amount === 0 ? 1 : amount * 4;

    for (let index = 0; index < samples; index += 1) {
      const x = (index * 2) / samples - 1;
      curve[index] = ((Math.PI + drive) * x) / (Math.PI + drive * Math.abs(x));
    }

    return curve;
  }

  function parseCompactOscillator(serializedOscillator) {
    const settings = Object.assign({}, DEFAULT_OSCILLATOR_SETTINGS);

    if (!serializedOscillator || serializedOscillator === "_") {
      return settings;
    }

    serializedOscillator.split(",").forEach((token) => {
      const alias = token.charAt(0);
      const controlName = ALIAS_TO_CONTROL[alias];
      const rawValue = token.slice(1);

      if (!controlName) {
        throw new Error("Unknown oscillator token in mosquito.txt.");
      }

      if (controlName === "active") {
        settings.active = true;
        return;
      }

      if (controlName === "waveform") {
        settings.waveform = ALIAS_TO_WAVEFORM[rawValue] || DEFAULT_OSCILLATOR_SETTINGS.waveform;
        return;
      }

      settings[controlName] = Number.parseFloat(rawValue);
    });

    return settings;
  }

  function parseMosquitoSoundCode(soundCode) {
    const trimmed = soundCode.trim();

    if (!trimmed.startsWith(COMPACT_STATE_PREFIX)) {
      throw new Error("Mosquito sound code must use the compact g2 format.");
    }

    const payload = trimmed.slice(COMPACT_STATE_PREFIX.length);

    return {
      oscillators: payload ? payload.split("|").map(parseCompactOscillator) : []
    };
  }

  function normalizeOscillatorVolumes(oscillators) {
    let loudestDb = -Infinity;

    for (const oscillator of oscillators) {
      if (!oscillator.active) {
        continue;
      }

      loudestDb = Math.max(loudestDb, oscillator.volume);
    }

    if (!Number.isFinite(loudestDb)) {
      return {
        dbOffset: 0,
        oscillators
      };
    }

    const dbOffset = -loudestDb;

    return {
      dbOffset,
      oscillators: oscillators.map((oscillator) => Object.assign({}, oscillator, {
        volume: oscillator.volume + dbOffset
      }))
    };
  }

  function MosquitoVoice(context, destination, settings) {
    this.context = context;
    this.destination = destination;
    this.settings = Object.assign({}, DEFAULT_OSCILLATOR_SETTINGS, settings);

    this.source = context.createOscillator();
    this.filterNode = context.createBiquadFilter();
    this.shaperNode = context.createWaveShaper();
    this.dryGain = context.createGain();
    this.delayNode = context.createDelay(1);
    this.delayWetGain = context.createGain();
    this.feedbackGain = context.createGain();
    this.panNode = context.createStereoPanner();
    this.volumeGain = context.createGain();
    this.activeGain = context.createGain();
    this.lfo = context.createOscillator();
    this.lfoGain = context.createGain();

    this.source.connect(this.filterNode);
    this.filterNode.connect(this.shaperNode);

    this.shaperNode.connect(this.dryGain);
    this.dryGain.connect(this.panNode);

    this.shaperNode.connect(this.delayNode);
    this.delayNode.connect(this.delayWetGain);
    this.delayWetGain.connect(this.panNode);
    this.delayNode.connect(this.feedbackGain);
    this.feedbackGain.connect(this.delayNode);

    this.panNode.connect(this.volumeGain);
    this.volumeGain.connect(this.activeGain);
    this.activeGain.connect(destination);

    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.source.frequency);

    this.source.start();
    this.lfo.start();
    this.pitchShiftCents = 0;

    this.applyAllSettings();
  }

  MosquitoVoice.prototype.applyAllSettings = function () {
    this.source.type = this.settings.waveform;
    this.filterNode.type = "lowpass";

    rampAudioParam(this.source.frequency, clamp(this.settings.frequency, 20, 20000), this.context);
    rampAudioParam(this.lfoGain.gain, clamp(this.settings.vibratoDepth, 0, 200), this.context);
    rampAudioParam(this.lfo.frequency, clamp(this.settings.vibratoRate, 0.01, 40), this.context);
    rampAudioParam(this.panNode.pan, clamp(this.settings.pan, -1, 1), this.context);
    rampAudioParam(this.volumeGain.gain, dbfsToGain(clamp(this.settings.volume, -40, 0)), this.context);
    rampAudioParam(this.filterNode.frequency, clamp(this.settings.filterCutoff, 40, 20000), this.context);
    rampAudioParam(this.filterNode.Q, clamp(this.settings.filterQ, 0.1, 30), this.context);
    rampAudioParam(this.delayNode.delayTime, clamp(this.settings.delayTime, 0, 1), this.context);
    rampAudioParam(this.delayWetGain.gain, clamp(this.settings.delayMix, 0, 1), this.context);
    rampAudioParam(this.dryGain.gain, 1 - clamp(this.settings.delayMix, 0, 1), this.context);
    rampAudioParam(this.feedbackGain.gain, clamp(this.settings.delayFeedback, 0, 0.95), this.context);
    rampAudioParam(this.activeGain.gain, this.settings.active ? 1 : 0, this.context);

    this.shaperNode.curve = this.settings.distortion === 0
      ? null
      : createDistortionCurve(clamp(this.settings.distortion, 0, 100));
    this.shaperNode.oversample = this.settings.distortion === 0 ? "none" : "4x";
    this.updatePitchShiftCents(this.pitchShiftCents, true);
  };

  MosquitoVoice.prototype.updatePitchShiftCents = function (pitchShiftCents, immediate) {
    const totalDetune = clamp(this.settings.detune + pitchShiftCents, -2400, 2400);

    this.pitchShiftCents = pitchShiftCents;

    if (immediate) {
      this.source.detune.cancelScheduledValues(this.context.currentTime);
      this.source.detune.setValueAtTime(totalDetune, this.context.currentTime);
      return;
    }

    smoothAudioParam(
      this.source.detune,
      totalDetune,
      this.context,
      DOPPLER_SMOOTHING_SECONDS
    );
  };

  MosquitoVoice.prototype.dispose = function () {
    const stopTime = this.context.currentTime + 0.04;

    this.activeGain.gain.cancelScheduledValues(this.context.currentTime);
    this.activeGain.gain.setValueAtTime(this.activeGain.gain.value, this.context.currentTime);
    this.activeGain.gain.linearRampToValueAtTime(0, stopTime);

    this.source.stop(stopTime + 0.03);
    this.lfo.stop(stopTime + 0.03);

    this.source.disconnect();
    this.filterNode.disconnect();
    this.shaperNode.disconnect();
    this.dryGain.disconnect();
    this.delayNode.disconnect();
    this.delayWetGain.disconnect();
    this.feedbackGain.disconnect();
    this.panNode.disconnect();
    this.volumeGain.disconnect();
    this.activeGain.disconnect();
    this.lfo.disconnect();
    this.lfoGain.disconnect();
  };

  function MosquitoAudio(soundCode) {
    const parsed = parseMosquitoSoundCode(soundCode);
    const normalized = normalizeOscillatorVolumes(parsed.oscillators);

    this.oscillators = normalized.oscillators;
    this.normalizationDb = normalized.dbOffset;
    this.context = null;
    this.voiceBus = null;
    this.outputTrimGain = null;
    this.distanceGain = null;
    this.scenePan = null;
    this.voices = [];
    this.pendingGain = 0;
    this.pendingPan = 0;
    this.pendingPitchFactor = 1;
    this.startPromise = null;
    this.outputTrimDb = MAX_OUTPUT_DB;
  }

  MosquitoAudio.prototype.ensureContext = function () {
    if (this.context) {
      return this.context;
    }

    const ContextClass = window.AudioContext || window.webkitAudioContext;

    if (!ContextClass) {
      throw new Error("Web Audio API is not supported in this browser.");
    }

    this.context = new ContextClass();
    this.voiceBus = this.context.createGain();
    this.outputTrimGain = this.context.createGain();
    this.distanceGain = this.context.createGain();
    this.scenePan = this.context.createStereoPanner();

    this.voiceBus.connect(this.outputTrimGain);
    this.outputTrimGain.connect(this.distanceGain);
    this.distanceGain.connect(this.scenePan);
    this.scenePan.connect(this.context.destination);

    this.outputTrimGain.gain.value = dbfsToGain(this.outputTrimDb);
    this.distanceGain.gain.value = this.pendingGain;
    this.scenePan.pan.value = this.pendingPan;

    for (const oscillator of this.oscillators) {
      this.voices.push(new MosquitoVoice(this.context, this.voiceBus, oscillator));
    }

    return this.context;
  };

  MosquitoAudio.prototype.start = function () {
    if (this.startPromise) {
      return this.startPromise;
    }

    try {
      this.ensureContext();
    } catch (error) {
      return Promise.reject(error);
    }

    this.startPromise = this.context.resume()
      .catch((error) => {
        this.startPromise = null;
        throw error;
      });

    return this.startPromise;
  };

  MosquitoAudio.prototype.updateSpatial = function (distanceFeet, pan, distanceRateFeetPerSecond) {
    const clampedDistance = Math.max(distanceFeet, 0.0001);
    const nextGain = clampedDistance <= 1 ? 1 : 1 / clampedDistance;
    const dopplerFactor = clamp(
      (SIMULATED_SPEED_OF_SOUND_FT_PER_SECOND - distanceRateFeetPerSecond) /
        SIMULATED_SPEED_OF_SOUND_FT_PER_SECOND,
      0.25,
      4
    );
    const pitchShiftCents = 1200 * Math.log2(dopplerFactor);

    this.pendingGain = clamp(nextGain, 0, 1);
    this.pendingPan = clamp(pan, -1, 1);
    this.pendingPitchFactor = dopplerFactor;

    if (!this.context) {
      return;
    }

    smoothAudioParam(
      this.distanceGain.gain,
      this.pendingGain,
      this.context,
      SPATIAL_SMOOTHING_SECONDS
    );
    smoothAudioParam(
      this.scenePan.pan,
      this.pendingPan,
      this.context,
      SPATIAL_SMOOTHING_SECONDS
    );

    for (const voice of this.voices) {
      voice.updatePitchShiftCents(pitchShiftCents, false);
    }
  };

  MosquitoAudio.prototype.dispose = function () {
    for (const voice of this.voices) {
      voice.dispose();
    }

    this.voices = [];

    if (this.scenePan) {
      this.scenePan.disconnect();
    }

    if (this.distanceGain) {
      this.distanceGain.disconnect();
    }

    if (this.outputTrimGain) {
      this.outputTrimGain.disconnect();
    }

    if (this.voiceBus) {
      this.voiceBus.disconnect();
    }
  };

  window.GoodListenerGameAudio = {
    MosquitoAudio,
    SIMULATED_SPEED_OF_SOUND_FT_PER_SECOND
  };
})();
