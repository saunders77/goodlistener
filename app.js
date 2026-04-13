(function () {
  var audio = new window.GoodListenerAudio.AudioEngine();

  var oscillatorList = document.getElementById("oscillator-list");
  var template = document.getElementById("oscillator-template");
  var startAudioButton = document.getElementById("start-audio");
  var addOscillatorButton = document.getElementById("add-oscillator");
  var masterVolumeInput = document.getElementById("master-volume");
  var masterVolumeValue = document.getElementById("master-volume-value");
  var stateCodeInput = document.getElementById("state-code");
  var copyStateButton = document.getElementById("copy-state");
  var loadStateButton = document.getElementById("load-state");
  var audioStatus = document.getElementById("audio-status");
  var suppressStateRefresh = false;
  var DEFAULT_MASTER_VOLUME = -2.5;
  var LOG_CONTROL_RANGES = {
    frequency: {
      min: 20,
      max: 20000
    },
    filterCutoff: {
      min: 80,
      max: 12000
    }
  };
  var DEFAULT_OSCILLATOR_SETTINGS = {
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

  function formatValue(control, value) {
    switch (control) {
      case "volume":
        return Number(value).toFixed(1) + " dBFS";
      case "delayMix":
      case "delayFeedback":
      case "distortion":
        return Math.round(value * (control === "distortion" ? 1 : 100)) + "%";
      case "frequency":
      case "filterCutoff":
        return Math.round(value) + " Hz";
      case "detune":
        return Math.round(value) + " cents";
      case "vibratoDepth":
        return Number(value).toFixed(1) + " Hz";
      case "vibratoRate":
        return Number(value).toFixed(1) + " Hz";
      case "pan":
        if (Math.abs(value) < 0.01) {
          return "Center";
        }

        return value < 0
          ? Math.round(Math.abs(value) * 100) + "% Left"
          : Math.round(value * 100) + "% Right";
      case "filterQ":
        return Number(value).toFixed(1) + " Q";
      case "delayTime":
        return Number(value).toFixed(2) + " s";
      default:
        return String(value);
    }
  }

  function updateMasterVolumeLabel(value) {
    masterVolumeValue.textContent = formatValue("volume", value);
  }

  function isLogarithmicControl(controlName) {
    return Boolean(LOG_CONTROL_RANGES[controlName]);
  }

  function clampLogarithmicControlValue(controlName, value) {
    var range = LOG_CONTROL_RANGES[controlName];

    return Math.round(Math.min(range.max, Math.max(range.min, value)));
  }

  function logarithmicControlToSliderValue(controlName, controlValue) {
    var range = LOG_CONTROL_RANGES[controlName];
    var clamped = clampLogarithmicControlValue(controlName, controlValue);

    return Math.log(clamped / range.min) / Math.log(range.max / range.min);
  }

  function sliderValueToLogarithmicControl(controlName, sliderValue) {
    var range = LOG_CONTROL_RANGES[controlName];
    var normalized = Math.min(1, Math.max(0, Number(sliderValue)));

    return clampLogarithmicControlValue(
      controlName,
      range.min * Math.pow(range.max / range.min, normalized)
    );
  }

  function controlValueToInputValue(controlName, value) {
    if (isLogarithmicControl(controlName)) {
      return logarithmicControlToSliderValue(controlName, value);
    }

    return value;
  }

  function inputValueToControlValue(controlName, input) {
    if (input.type === "checkbox") {
      return input.checked;
    }

    if (input.tagName === "SELECT") {
      return input.value;
    }

    if (isLogarithmicControl(controlName)) {
      return sliderValueToLogarithmicControl(controlName, input.value);
    }

    return Number(input.value);
  }

  function encodeState(state) {
    return window.btoa(unescape(encodeURIComponent(JSON.stringify(state))));
  }

  function decodeState(code) {
    return JSON.parse(decodeURIComponent(escape(window.atob(code.trim()))));
  }

  function readControlValue(input) {
    return inputValueToControlValue(input.getAttribute("data-control"), input);
  }

  function getCurrentState() {
    var cards = oscillatorList.querySelectorAll(".oscillator-card");
    var oscillators = Array.prototype.map.call(cards, function (card) {
      var controls = card.querySelectorAll("[data-control]");
      var settings = {};

      Array.prototype.forEach.call(controls, function (input) {
        settings[input.getAttribute("data-control")] = readControlValue(input);
      });

      return settings;
    });

    return {
      version: 1,
      masterVolume: Number(masterVolumeInput.value),
      oscillators: oscillators
    };
  }

  function refreshStateCode() {
    if (suppressStateRefresh) {
      return;
    }

    stateCodeInput.value = encodeState(getCurrentState());
  }

  function clearAllOscillators() {
    var cards = Array.prototype.slice.call(oscillatorList.querySelectorAll(".oscillator-card"));

    cards.forEach(function (card) {
      if (card.dataset.voiceId) {
        audio.removeVoice(card.dataset.voiceId);
      }

      card.remove();
    });
  }

  function normalizeState(rawState) {
    var normalized = {
      masterVolume: DEFAULT_MASTER_VOLUME,
      oscillators: []
    };

    if (rawState && typeof rawState.masterVolume === "number") {
      normalized.masterVolume = rawState.masterVolume;
    }

    if (rawState && Array.isArray(rawState.oscillators)) {
      normalized.oscillators = rawState.oscillators.map(function (settings) {
        return Object.assign({}, DEFAULT_OSCILLATOR_SETTINGS, settings || {});
      });
    }

    return normalized;
  }

  function applyState(rawState) {
    var state = normalizeState(rawState);

    suppressStateRefresh = true;
    clearAllOscillators();

    masterVolumeInput.value = state.masterVolume;
    updateMasterVolumeLabel(state.masterVolume);
    audio.setMasterVolume(state.masterVolume);

    state.oscillators.forEach(function (settings) {
      createOscillatorCard(settings);
    });

    suppressStateRefresh = false;
    refreshStateCode();

    if (state.oscillators.length) {
      audioStatus.textContent = "State code loaded.";
    } else {
      audioStatus.textContent = "State code loaded. No oscillators were included.";
    }
  }

  function getEditableDisplayValue(control, value) {
    switch (control) {
      case "volume":
        return Number(value).toFixed(1);
      case "frequency":
        return String(Math.round(value));
      case "delayMix":
      case "delayFeedback":
        return String(Math.round(value * 100));
      case "pan":
        return Math.abs(value) < 0.01 ? "0" : value.toFixed(2);
      case "vibratoDepth":
      case "vibratoRate":
      case "filterQ":
      case "delayTime":
        return String(value);
      default:
        return String(Math.round(value * 100) / 100);
    }
  }

  function clampToInputRange(input, value) {
    var min = input.min === "" ? -Infinity : Number(input.min);
    var max = input.max === "" ? Infinity : Number(input.max);
    var step = input.step === "" || input.step === "any" ? null : Number(input.step);
    var clamped = Math.min(max, Math.max(min, value));

    if (step && Number.isFinite(step) && step > 0) {
      var base = Number.isFinite(min) ? min : 0;
      var steps = Math.round((clamped - base) / step);
      var rounded = base + steps * step;
      var precision = step.toString().includes(".")
        ? step.toString().split(".")[1].length
        : 0;

      clamped = Number(rounded.toFixed(precision));
    }

    return clamped;
  }

  function parseManualValue(control, rawValue, input) {
    var text = rawValue.trim().toLowerCase().replace(/,/g, "");
    var numericValue;

    if (!text) {
      return null;
    }

    if (control === "pan" && text === "center") {
      return 0;
    }

    numericValue = Number.parseFloat(text);

    if (Number.isNaN(numericValue)) {
      return null;
    }

    switch (control) {
      case "frequency":
      case "filterCutoff":
        return clampLogarithmicControlValue(control, numericValue);
      case "delayMix":
      case "delayFeedback":
        if (text.includes("%") || numericValue > 1) {
          numericValue = numericValue / 100;
        }
        break;
      case "pan":
        if (Math.abs(numericValue) > 1) {
          numericValue = numericValue / 100;
        }
        break;
      default:
        break;
    }

    return clampToInputRange(input, numericValue);
  }

  function applyNumericControlValue(input, output, controlName, onUpdate, value) {
    input.value = controlValueToInputValue(controlName, value);
    output.textContent = formatValue(controlName, value);
    onUpdate(value);
    refreshStateCode();
  }

  function enableManualValueEditing(output, input, controlName, onUpdate, statusLabel) {
    output.classList.add("editable-value");
    output.tabIndex = 0;
    output.title = "Click to type a value and press Enter";

    function finishEditing(nextText) {
      output.classList.remove("is-editing");
      output.textContent = nextText;
    }

    function restoreFormattedValue() {
      finishEditing(formatValue(controlName, inputValueToControlValue(controlName, input)));
    }

    function startEditing() {
      var editor;
      var committed = false;

      if (output.classList.contains("is-editing")) {
        return;
      }

      output.classList.add("is-editing");
      output.textContent = "";

      editor = document.createElement("input");
      editor.type = "text";
      editor.className = "value-editor";
      editor.value = getEditableDisplayValue(
        controlName,
        inputValueToControlValue(controlName, input)
      );
      editor.setAttribute("aria-label", controlName + " value");
      output.appendChild(editor);

      editor.focus();
      editor.select();

      editor.addEventListener("keydown", function (event) {
        var parsedValue;

        if (event.key === "Enter") {
          event.preventDefault();
          parsedValue = parseManualValue(controlName, editor.value, input);

          if (parsedValue === null) {
            audioStatus.textContent = "Please type a valid number for " + statusLabel + ".";
            restoreFormattedValue();
            return;
          }

          committed = true;
          applyNumericControlValue(input, output, controlName, onUpdate, parsedValue);
          output.classList.remove("is-editing");
          audioStatus.textContent = statusLabel + " updated.";
          output.focus();
          return;
        }

        if (event.key === "Escape") {
          event.preventDefault();
          restoreFormattedValue();
          output.focus();
        }
      });

      editor.addEventListener("blur", function () {
        if (!committed) {
          restoreFormattedValue();
        }
      });
    }

    output.addEventListener("click", function (event) {
      event.preventDefault();
      startEditing();
    });

    output.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        startEditing();
      }
    });
  }

  function coerceControlValue(input) {
    return inputValueToControlValue(input.getAttribute("data-control"), input);
  }

  function bindControl(card, voiceId, controlName, initialValue) {
    var input = card.querySelector("[data-control=\"" + controlName + "\"]");
    var output = card.querySelector("[data-value=\"" + controlName + "\"]");
    var eventName = "input";

    if (!input) {
      return;
    }

    if (input.type === "checkbox") {
      input.checked = Boolean(initialValue);
    } else {
      input.value = controlValueToInputValue(controlName, initialValue);
    }

    if (output) {
      output.textContent = formatValue(controlName, initialValue);
    }

    if (output && input.type === "range") {
      enableManualValueEditing(
        output,
        input,
        controlName,
        function (value) {
          audio.updateVoice(voiceId, controlName, value);
        },
        controlName
      );
    }

    if (input.type === "checkbox" || input.tagName === "SELECT") {
      eventName = "change";
    }

    input.addEventListener(eventName, function () {
      var value = coerceControlValue(input);

      if (output) {
        output.textContent = formatValue(controlName, value);
      }

      audio.updateVoice(voiceId, controlName, value);
      refreshStateCode();
    });
  }

  function createOscillatorCard(overrides) {
    var voice = audio.addVoice(Object.assign({}, DEFAULT_OSCILLATOR_SETTINGS, overrides || {}));

    var fragment = template.content.cloneNode(true);
    var card = fragment.querySelector(".oscillator-card");
    var title = fragment.querySelector(".oscillator-title");
    var removeButton = fragment.querySelector("[data-action=\"remove\"]");

    card.dataset.voiceId = voice.id;
    title.textContent = "Oscillator " + voice.id.replace("osc-", "");

    Object.keys(voice.settings).forEach(function (controlName) {
      bindControl(card, voice.id, controlName, voice.settings[controlName]);
    });

    removeButton.addEventListener("click", function () {
      audio.removeVoice(voice.id);
      card.remove();

      if (!oscillatorList.children.length) {
        audioStatus.textContent = "No oscillators yet. Add one to start building a signal chain.";
      }

      refreshStateCode();
    });

    oscillatorList.appendChild(fragment);
    audioStatus.textContent = "Oscillator added. Toggle it on when you want to hear it.";
    refreshStateCode();
  }

  startAudioButton.addEventListener("click", function () {
    audio.start()
      .then(function () {
        startAudioButton.textContent = "Audio Ready";
        startAudioButton.disabled = true;
        audioStatus.textContent = "Audio context is running. Add oscillators and start shaping sound.";
      })
      .catch(function (error) {
        audioStatus.textContent = error.message;
      });
  });

  addOscillatorButton.addEventListener("click", function () {
    audio.start()
      .then(function () {
        startAudioButton.textContent = "Audio Ready";
        startAudioButton.disabled = true;
        createOscillatorCard();
      })
      .catch(function (error) {
        audioStatus.textContent = error.message;
      });
  });

  masterVolumeInput.addEventListener("input", function () {
    var value = Number(masterVolumeInput.value);
    updateMasterVolumeLabel(value);
    audio.setMasterVolume(value);
    refreshStateCode();
  });

  copyStateButton.addEventListener("click", function () {
    var code = stateCodeInput.value;

    if (!code) {
      refreshStateCode();
      code = stateCodeInput.value;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(code)
        .then(function () {
          audioStatus.textContent = "State code copied.";
        })
        .catch(function () {
          stateCodeInput.focus();
          stateCodeInput.select();
          audioStatus.textContent = "State code selected. Press Ctrl+C to copy.";
        });
      return;
    }

    stateCodeInput.focus();
    stateCodeInput.select();
    audioStatus.textContent = "State code selected. Press Ctrl+C to copy.";
  });

  loadStateButton.addEventListener("click", function () {
    try {
      applyState(decodeState(stateCodeInput.value));
    } catch (error) {
      audioStatus.textContent = "That state code could not be loaded.";
    }
  });

  updateMasterVolumeLabel(Number(masterVolumeInput.value));
  enableManualValueEditing(
    masterVolumeValue,
    masterVolumeInput,
    "volume",
    function (value) {
      updateMasterVolumeLabel(value);
      audio.setMasterVolume(value);
    },
    "master volume"
  );
  refreshStateCode();
}());
