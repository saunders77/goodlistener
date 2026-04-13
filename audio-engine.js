(function () {
  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function dbfsToGain(dbfs) {
    return Math.pow(10, dbfs / 20);
  }

  function gainToDbfs(gain) {
    return 20 * Math.log10(Math.max(gain, 0.0001));
  }

  function createDistortionCurve(amount) {
    var samples = 256;
    var curve = new Float32Array(samples);
    var drive = amount === 0 ? 1 : amount * 4;

    for (var i = 0; i < samples; i += 1) {
      var x = (i * 2) / samples - 1;
      curve[i] = ((Math.PI + drive) * x) / (Math.PI + drive * Math.abs(x));
    }

    return curve;
  }

  function safeSetAudioParam(param, value, context) {
    var now = context.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    param.linearRampToValueAtTime(value, now + 0.03);
  }

  function OscillatorVoice(context, destination, id, options) {
    this.context = context;
    this.destination = destination;
    this.id = id;

    this.settings = {
      active: false,
      waveform: options.waveform || "sine",
      volume: typeof options.volume === "number" ? options.volume : -12,
      frequency: typeof options.frequency === "number" ? options.frequency : 220,
      detune: typeof options.detune === "number" ? options.detune : 0,
      vibratoDepth: typeof options.vibratoDepth === "number" ? options.vibratoDepth : 0,
      vibratoRate: typeof options.vibratoRate === "number" ? options.vibratoRate : 5,
      pan: typeof options.pan === "number" ? options.pan : 0,
      filterCutoff: typeof options.filterCutoff === "number" ? options.filterCutoff : 12000,
      filterQ: typeof options.filterQ === "number" ? options.filterQ : 0.7,
      distortion: typeof options.distortion === "number" ? options.distortion : 0,
      delayTime: typeof options.delayTime === "number" ? options.delayTime : 0.18,
      delayMix: typeof options.delayMix === "number" ? options.delayMix : 0.12,
      delayFeedback: typeof options.delayFeedback === "number" ? options.delayFeedback : 0.2
    };

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

    this.applyAllSettings();
  }

  OscillatorVoice.prototype.applyAllSettings = function () {
    this.setWaveform(this.settings.waveform);
    this.setFrequency(this.settings.frequency);
    this.setDetune(this.settings.detune);
    this.setVibratoDepth(this.settings.vibratoDepth);
    this.setVibratoRate(this.settings.vibratoRate);
    this.setPan(this.settings.pan);
    this.setVolume(this.settings.volume);
    this.setFilterCutoff(this.settings.filterCutoff);
    this.setFilterQ(this.settings.filterQ);
    this.setDistortion(this.settings.distortion);
    this.setDelayTime(this.settings.delayTime);
    this.setDelayMix(this.settings.delayMix);
    this.setDelayFeedback(this.settings.delayFeedback);
    this.setActive(this.settings.active);
  };

  OscillatorVoice.prototype.setActive = function (value) {
    this.settings.active = Boolean(value);
    safeSetAudioParam(this.activeGain.gain, this.settings.active ? 1 : 0, this.context);
  };

  OscillatorVoice.prototype.setWaveform = function (value) {
    this.settings.waveform = value;
    this.source.type = value;
  };

  OscillatorVoice.prototype.setVolume = function (value) {
    this.settings.volume = clamp(value, -40, 0);
    safeSetAudioParam(this.volumeGain.gain, dbfsToGain(this.settings.volume), this.context);
  };

  OscillatorVoice.prototype.setFrequency = function (value) {
    this.settings.frequency = clamp(value, 20, 20000);
    safeSetAudioParam(this.source.frequency, this.settings.frequency, this.context);
  };

  OscillatorVoice.prototype.setDetune = function (value) {
    this.settings.detune = clamp(value, -2400, 2400);
    safeSetAudioParam(this.source.detune, this.settings.detune, this.context);
  };

  OscillatorVoice.prototype.setVibratoDepth = function (value) {
    this.settings.vibratoDepth = clamp(value, 0, 200);
    safeSetAudioParam(this.lfoGain.gain, this.settings.vibratoDepth, this.context);
  };

  OscillatorVoice.prototype.setVibratoRate = function (value) {
    this.settings.vibratoRate = clamp(value, 0.01, 40);
    safeSetAudioParam(this.lfo.frequency, this.settings.vibratoRate, this.context);
  };

  OscillatorVoice.prototype.setPan = function (value) {
    this.settings.pan = clamp(value, -1, 1);
    safeSetAudioParam(this.panNode.pan, this.settings.pan, this.context);
  };

  OscillatorVoice.prototype.setFilterCutoff = function (value) {
    this.settings.filterCutoff = clamp(value, 40, 20000);
    this.filterNode.type = "lowpass";
    safeSetAudioParam(this.filterNode.frequency, this.settings.filterCutoff, this.context);
  };

  OscillatorVoice.prototype.setFilterQ = function (value) {
    this.settings.filterQ = clamp(value, 0.1, 30);
    safeSetAudioParam(this.filterNode.Q, this.settings.filterQ, this.context);
  };

  OscillatorVoice.prototype.setDistortion = function (value) {
    this.settings.distortion = clamp(value, 0, 100);
    this.shaperNode.curve = this.settings.distortion === 0
      ? null
      : createDistortionCurve(this.settings.distortion);
    this.shaperNode.oversample = this.settings.distortion === 0 ? "none" : "4x";
  };

  OscillatorVoice.prototype.setDelayTime = function (value) {
    this.settings.delayTime = clamp(value, 0, 1);
    safeSetAudioParam(this.delayNode.delayTime, this.settings.delayTime, this.context);
  };

  OscillatorVoice.prototype.setDelayMix = function (value) {
    this.settings.delayMix = clamp(value, 0, 1);
    safeSetAudioParam(this.delayWetGain.gain, this.settings.delayMix, this.context);
    safeSetAudioParam(this.dryGain.gain, 1 - this.settings.delayMix, this.context);
  };

  OscillatorVoice.prototype.setDelayFeedback = function (value) {
    this.settings.delayFeedback = clamp(value, 0, 0.95);
    safeSetAudioParam(this.feedbackGain.gain, this.settings.delayFeedback, this.context);
  };

  OscillatorVoice.prototype.update = function (property, value) {
    switch (property) {
      case "active":
        this.setActive(value);
        break;
      case "waveform":
        this.setWaveform(value);
        break;
      case "volume":
        this.setVolume(value);
        break;
      case "frequency":
        this.setFrequency(value);
        break;
      case "detune":
        this.setDetune(value);
        break;
      case "vibratoDepth":
        this.setVibratoDepth(value);
        break;
      case "vibratoRate":
        this.setVibratoRate(value);
        break;
      case "pan":
        this.setPan(value);
        break;
      case "filterCutoff":
        this.setFilterCutoff(value);
        break;
      case "filterQ":
        this.setFilterQ(value);
        break;
      case "distortion":
        this.setDistortion(value);
        break;
      case "delayTime":
        this.setDelayTime(value);
        break;
      case "delayMix":
        this.setDelayMix(value);
        break;
      case "delayFeedback":
        this.setDelayFeedback(value);
        break;
      default:
        break;
    }
  };

  OscillatorVoice.prototype.dispose = function () {
    var stopTime = this.context.currentTime + 0.04;
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

  function AudioEngine() {
    this.context = null;
    this.masterGain = null;
    this.voices = new Map();
    this.nextVoiceId = 1;
  }

  AudioEngine.prototype.ensureContext = function () {
    if (!this.context) {
      var ContextClass = window.AudioContext || window.webkitAudioContext;

      if (!ContextClass) {
        throw new Error("Web Audio API is not supported in this browser.");
      }

      this.context = new ContextClass();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = dbfsToGain(-2.5);
      this.masterGain.connect(this.context.destination);
    }

    return this.context;
  };

  AudioEngine.prototype.start = function () {
    this.ensureContext();
    return this.context.resume();
  };

  AudioEngine.prototype.setMasterVolume = function (value) {
    this.ensureContext();
    safeSetAudioParam(this.masterGain.gain, dbfsToGain(clamp(value, -40, 0)), this.context);
  };

  AudioEngine.prototype.getMasterVolume = function () {
    return this.masterGain ? gainToDbfs(this.masterGain.gain.value) : -2.5;
  };

  AudioEngine.prototype.addVoice = function (options) {
    this.ensureContext();
    var id = "osc-" + this.nextVoiceId;
    var voice = new OscillatorVoice(this.context, this.masterGain, id, options || {});

    this.voices.set(id, voice);
    this.nextVoiceId += 1;

    return {
      id: id,
      settings: Object.assign({}, voice.settings)
    };
  };

  AudioEngine.prototype.updateVoice = function (id, property, value) {
    var voice = this.voices.get(id);

    if (!voice) {
      return;
    }

    voice.update(property, value);
  };

  AudioEngine.prototype.removeVoice = function (id) {
    var voice = this.voices.get(id);

    if (!voice) {
      return;
    }

    voice.dispose();
    this.voices.delete(id);
  };

  window.GoodListenerAudio = {
    AudioEngine: AudioEngine
  };
}());
