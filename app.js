(function () {
  var audio = new window.GoodListenerAudio.AudioEngine();

  var oscillatorList = document.getElementById("oscillator-list");
  var template = document.getElementById("oscillator-template");
  var startAudioButton = document.getElementById("start-audio");
  var addOscillatorButton = document.getElementById("add-oscillator");
  var masterVolumeInput = document.getElementById("master-volume");
  var masterVolumeValue = document.getElementById("master-volume-value");
  var audioStatus = document.getElementById("audio-status");

  function formatValue(control, value) {
    switch (control) {
      case "volume":
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
    masterVolumeValue.textContent = Math.round(value * 100) + "%";
  }

  function coerceControlValue(input) {
    if (input.type === "checkbox") {
      return input.checked;
    }

    if (input.tagName === "SELECT") {
      return input.value;
    }

    return Number(input.value);
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
      input.value = initialValue;
    }

    if (output) {
      output.textContent = formatValue(controlName, initialValue);
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
    });
  }

  function createOscillatorCard() {
    var voice = audio.addVoice({
      active: false,
      waveform: "sine",
      volume: 0.25,
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
    });

    var fragment = template.content.cloneNode(true);
    var card = fragment.querySelector(".oscillator-card");
    var title = fragment.querySelector(".oscillator-title");
    var removeButton = fragment.querySelector("[data-action=\"remove\"]");

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
    });

    oscillatorList.appendChild(fragment);
    audioStatus.textContent = "Oscillator added. Toggle it on when you want to hear it.";
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
  });

  updateMasterVolumeLabel(Number(masterVolumeInput.value));
}());
