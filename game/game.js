(() => {
  const SCREEN_WIDTH = 1280;
  const SCREEN_HEIGHT = 720;
  const HALF_WIDTH = SCREEN_WIDTH / 2;
  const HORIZON_Y = SCREEN_HEIGHT / 2;

  const WORLD_WIDTH = SCREEN_WIDTH;
  const WORLD_DEPTH = SCREEN_HEIGHT;
  const WORLD_DEPTH_FEET = 48;
  const WORLD_UNITS_PER_FOOT = WORLD_DEPTH / WORLD_DEPTH_FEET;

  const HORIZONTAL_FOV = 65 * Math.PI / 180;
  const HALF_FOV = HORIZONTAL_FOV / 2;
  const FOCAL_LENGTH = SCREEN_WIDTH / (2 * Math.tan(HALF_FOV));

  const FIXED_STEP = 1 / 120;
  const MOVE_SPEED = WORLD_DEPTH * 0.08;
  const TURN_SPEED = Math.PI;
  const MOSQUITO_SPEED = MOVE_SPEED * 0.5;
  const MOSQUITO_INITIAL_ANGLE = Math.PI / 2;
  const MOSQUITO_TURN_RATE_CHANGE_SECONDS = 1;
  const MOSQUITO_MAX_TURN_RATE = Math.PI / 2;
  const MOSQUITO_TURN_RADIUS = MOSQUITO_SPEED / MOSQUITO_MAX_TURN_RATE;
  const MOSQUITO_PERIMETER_TURN_BUFFER = MOSQUITO_TURN_RADIUS * 4 + MOSQUITO_SPEED * FIXED_STEP;
  const MOSQUITO_PERIMETER_TEST_SECONDS = 2.25;
  const MOSQUITO_PERIMETER_TEST_STEP = 1 / 30;
  const CATCH_DISTANCE_FEET = 0.25;
  const CATCH_DISTANCE_UNITS = CATCH_DISTANCE_FEET * WORLD_UNITS_PER_FOOT;

  const TREE_HEIGHT = 30;
  const ENTITY_HEIGHT = TREE_HEIGHT / 2;
  const TREE_EDGE_INSET = 18;
  const TREE_SPACING = 9.5;
  const PLAYER_RADIUS = 10;

  const MAP_MOSQUITO_WIDTH = 10;
  const START_DISTANCE = WORLD_DEPTH * 0.6;

  const BOUNDARY = {
    west: TREE_EDGE_INSET,
    east: WORLD_WIDTH - TREE_EDGE_INSET,
    south: TREE_EDGE_INSET,
    north: WORLD_DEPTH - TREE_EDGE_INSET
  };

  const KEY_TO_ACTION = {
    w: "forward",
    W: "forward",
    ArrowUp: "forward",
    s: "backward",
    S: "backward",
    ArrowDown: "backward",
    a: "left",
    A: "left",
    ArrowLeft: "left",
    d: "right",
    D: "right",
    ArrowRight: "right"
  };

  const firstPersonCanvas = document.getElementById("first-person-view");
  const audioStatus = document.getElementById("audio-status");
  const startOverlay = document.getElementById("start-overlay");
  const startButton = document.getElementById("start-button");
  const caughtOverlay = document.getElementById("caught-overlay");
  const tryAgainButton = document.getElementById("try-again");
  const firstPersonCtx = firstPersonCanvas.getContext("2d");

  drawStatus(firstPersonCtx, "Loading assets", "Preparing mosquito, tree, and sound assets...");

  Promise.all([
    loadImage("game/mosquito.png"),
    loadImage("game/tree.png")
  ])
    .then(([mosquitoImage, treeImage]) => {
      startGame(mosquitoImage, treeImage);
    })
    .catch((error) => {
      console.error(error);
      drawStatus(firstPersonCtx, "Asset load failed", "Check the browser console for details.");
      setAudioStatus("Audio unavailable because the game assets did not finish loading.");
    });

  function startGame(mosquitoImage, treeImage) {
    const mosquitoAspect = mosquitoImage.naturalHeight / mosquitoImage.naturalWidth;
    const treeAspect = treeImage.naturalHeight / treeImage.naturalWidth;

    const mosquitoWorldWidth = START_DISTANCE * MAP_MOSQUITO_WIDTH / FOCAL_LENGTH;
    const mosquitoWorldHeight = mosquitoWorldWidth * mosquitoAspect;

    const treeWorldHeight = TREE_HEIGHT;
    const treeWorldWidth = treeWorldHeight / treeAspect;

    const boundaryTrees = buildBoundaryTrees(treeWorldWidth, treeWorldHeight);
    const input = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };

    const state = {
      isCaught: false,
      bat: createInitialBatState(),
      mosquito: createInitialMosquitoState()
    };
    const mosquitoSoundCode = getMosquitoSoundCode();
    const mosquitoAudio = new window.GoodListenerGameAudio.MosquitoAudio(mosquitoSoundCode);
    let audioRunning = false;
    let isStarted = false;

    firstPersonCtx.imageSmoothingEnabled = true;

    updateMosquitoAudio();
    //setAudioStatus("press start to begin the mosquito sound.");

    if (startButton) {
      startButton.disabled = false;
      startButton.addEventListener("click", startRound);
      startButton.focus();
    }

    window.addEventListener(
      "keydown",
      (event) => {
        const action = KEY_TO_ACTION[event.key];
        if (!action) {
          return;
        }

        if (!isStarted) {
          return;
        }

        input[action] = true;
        event.preventDefault();
      },
      { passive: false }
    );

    window.addEventListener("keyup", (event) => {
      const action = KEY_TO_ACTION[event.key];
      if (!action) {
        return;
      }

      input[action] = false;
    });

    window.addEventListener("blur", () => {
      input.forward = false;
      input.backward = false;
      input.left = false;
      input.right = false;
    });

    if (tryAgainButton) {
      tryAgainButton.addEventListener("click", resetGame);
    }

    let previousTime = performance.now();
    let accumulator = 0;

    requestAnimationFrame(frame);

    function frame(now) {
      const elapsed = Math.min((now - previousTime) / 1000, 0.25);
      previousTime = now;

      if (!isStarted) {
        render();
        requestAnimationFrame(frame);
        return;
      }

      accumulator += elapsed;

      while (accumulator >= FIXED_STEP) {
        update(FIXED_STEP);
        accumulator -= FIXED_STEP;
      }

      render();
      requestAnimationFrame(frame);
    }

    function update(dt) {
      if (state.isCaught) {
        updateMosquitoAudio();
        return;
      }

      const turnDirection = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const moveDirection = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
      const previousBatX = state.bat.x;
      const previousBatY = state.bat.y;

      state.bat.angle = wrapAngle(state.bat.angle + turnDirection * TURN_SPEED * dt);

      if (moveDirection) {
        const stepDistance = MOVE_SPEED * moveDirection * dt;
        const nextX = state.bat.x + Math.sin(state.bat.angle) * stepDistance;
        const nextY = state.bat.y + Math.cos(state.bat.angle) * stepDistance;

        state.bat.x = clamp(nextX, BOUNDARY.west + PLAYER_RADIUS, BOUNDARY.east - PLAYER_RADIUS);
        state.bat.y = clamp(nextY, BOUNDARY.south + PLAYER_RADIUS, BOUNDARY.north - PLAYER_RADIUS);
      }

      state.bat.velocityX = (state.bat.x - previousBatX) / dt;
      state.bat.velocityY = (state.bat.y - previousBatY) / dt;

      updateMosquito(dt);

      if (getBatMosquitoDistanceUnits() <= CATCH_DISTANCE_UNITS) {
        endGame();
      }

      updateMosquitoAudio();
    }

    function render() {
      drawFirstPersonView();
    }

    function drawFirstPersonView() {
      const sky = firstPersonCtx.createLinearGradient(0, 0, 0, HORIZON_Y);
      sky.addColorStop(0, "#061321");
      sky.addColorStop(1, "#24415f");
      firstPersonCtx.fillStyle = sky;
      firstPersonCtx.fillRect(0, 0, SCREEN_WIDTH, HORIZON_Y);

      const ground = firstPersonCtx.createLinearGradient(0, HORIZON_Y, 0, SCREEN_HEIGHT);
      ground.addColorStop(0, "#202d1b");
      ground.addColorStop(1, "#060a08");
      firstPersonCtx.fillStyle = ground;
      firstPersonCtx.fillRect(0, HORIZON_Y, SCREEN_WIDTH, HORIZON_Y);

      firstPersonCtx.fillStyle = "rgba(239, 247, 255, 0.08)";
      firstPersonCtx.fillRect(0, HORIZON_Y - 1, SCREEN_WIDTH, 2);

      const forwardX = Math.sin(state.bat.angle);
      const forwardY = Math.cos(state.bat.angle);
      const rightX = Math.cos(state.bat.angle);
      const rightY = -Math.sin(state.bat.angle);
      const cameraHeight = state.bat.z;

      const sceneBillboards = [];

      for (const tree of boundaryTrees) {
        const projection = projectBillboard(
          tree.x,
          tree.y,
          0,
          tree.height,
          tree.width,
          state.bat,
          forwardX,
          forwardY,
          rightX,
          rightY,
          cameraHeight
        );

        if (!projection) {
          continue;
        }

        sceneBillboards.push({
          type: "tree",
          depth: projection.depth,
          projection
        });
      }

      const mosquitoProjection = projectBillboard(
        state.mosquito.x,
        state.mosquito.y,
        state.mosquito.z - state.mosquito.height / 2,
        state.mosquito.height,
        state.mosquito.width,
        state.bat,
        forwardX,
        forwardY,
        rightX,
        rightY,
        cameraHeight
      );

      if (mosquitoProjection) {
        sceneBillboards.push({
          type: "mosquito",
          depth: mosquitoProjection.depth,
          projection: mosquitoProjection
        });
      }

      sceneBillboards.sort((a, b) => b.depth - a.depth);

      for (const item of sceneBillboards) {
        if (item.type === "tree") {
          const alpha = clamp(1.1 - item.depth / 1800, 0.42, 1);
          firstPersonCtx.save();
          firstPersonCtx.globalAlpha = alpha;
          drawBillboard(firstPersonCtx, treeImage, item.projection);
          firstPersonCtx.restore();
          continue;
        }

        drawBillboard(firstPersonCtx, mosquitoImage, item.projection);
      }

    }

    function enableMosquitoAudio() {
      mosquitoAudio.start()
        .then(() => {
          if (audioRunning) {
            return;
          }

          audioRunning = true;
          //setAudioStatus("mosquito pitch includes the doppler shift from relative motion.");
        })
        .catch((error) => {
          console.error(error);
          //setAudioStatus("Audio could not be started in this browser.");
        });
    }

    function startRound() {
      isStarted = true;
      previousTime = performance.now();
      accumulator = 0;

      if (startOverlay) {
        startOverlay.hidden = true;
      }

      enableMosquitoAudio();
      //setAudioStatus("mosquito pitch includes the doppler shift from relative motion.");
    }

    function createInitialBatState() {
      return {
        x: WORLD_WIDTH * 0.5,
        y: WORLD_DEPTH * 0.2,
        angle: 0,
        z: ENTITY_HEIGHT,
        velocityX: 0,
        velocityY: 0
      };
    }

    function createInitialMosquitoState() {
      return {
        x: WORLD_WIDTH * 0.5,
        y: WORLD_DEPTH * 0.8,
        z: ENTITY_HEIGHT,
        width: mosquitoWorldWidth,
        height: mosquitoWorldHeight,
        angle: MOSQUITO_INITIAL_ANGLE,
        randomTurnRate: 0,
        turnRate: 0,
        turnRateChangeTimer: MOSQUITO_TURN_RATE_CHANGE_SECONDS,
        velocityX: MOSQUITO_SPEED,
        velocityY: 0
      };
    }

    function updateMosquito(dt) {
      updateMosquitoRandomTurnRate(dt);
      state.mosquito.turnRate = getMosquitoTurnRate(state.mosquito);
      state.mosquito.angle = wrapAngle(state.mosquito.angle + state.mosquito.turnRate * dt);
      state.mosquito.velocityX = Math.sin(state.mosquito.angle) * MOSQUITO_SPEED;
      state.mosquito.velocityY = Math.cos(state.mosquito.angle) * MOSQUITO_SPEED;
      state.mosquito.x += state.mosquito.velocityX * dt;
      state.mosquito.y += state.mosquito.velocityY * dt;
    }

    function updateMosquitoRandomTurnRate(dt) {
      state.mosquito.turnRateChangeTimer -= dt;

      while (state.mosquito.turnRateChangeTimer <= 0) {
        state.mosquito.randomTurnRate = randomInRange(-MOSQUITO_MAX_TURN_RATE, MOSQUITO_MAX_TURN_RATE);
        state.mosquito.turnRateChangeTimer += MOSQUITO_TURN_RATE_CHANGE_SECONDS;
      }
    }

    function getMosquitoTurnRate(mosquito) {
      const avoidanceVector = getMosquitoPerimeterAvoidanceVector(mosquito);

      if (!avoidanceVector) {
        return mosquito.randomTurnRate;
      }

      return getSaferMosquitoTurnSign(mosquito) * MOSQUITO_MAX_TURN_RATE;
    }

    function getMosquitoPerimeterAvoidanceVector(mosquito) {
      const directionX = Math.sin(mosquito.angle);
      const directionY = Math.cos(mosquito.angle);
      const projectedX = mosquito.x + directionX * MOSQUITO_PERIMETER_TURN_BUFFER;
      const projectedY = mosquito.y + directionY * MOSQUITO_PERIMETER_TURN_BUFFER;
      let avoidX = 0;
      let avoidY = 0;

      if (projectedX > BOUNDARY.east) {
        avoidX -= projectedX - BOUNDARY.east;
      } else if (projectedX < BOUNDARY.west) {
        avoidX += BOUNDARY.west - projectedX;
      }

      if (projectedY > BOUNDARY.north) {
        avoidY -= projectedY - BOUNDARY.north;
      } else if (projectedY < BOUNDARY.south) {
        avoidY += BOUNDARY.south - projectedY;
      }

      if (avoidX === 0 && avoidY === 0) {
        return null;
      }

      return {
        x: avoidX,
        y: avoidY
      };
    }

    function getSaferMosquitoTurnSign(mosquito) {
      const clockwiseScore = scoreMosquitoTurnSign(mosquito, 1);
      const counterClockwiseScore = scoreMosquitoTurnSign(mosquito, -1);

      if (Math.abs(clockwiseScore - counterClockwiseScore) > 0.0001) {
        return clockwiseScore > counterClockwiseScore ? 1 : -1;
      }

      const centerAngle = Math.atan2(
        (BOUNDARY.west + BOUNDARY.east) / 2 - mosquito.x,
        (BOUNDARY.south + BOUNDARY.north) / 2 - mosquito.y
      );
      const centerDelta = signedAngleDifference(centerAngle, mosquito.angle);

      return Math.sign(centerDelta) || 1;
    }

    function scoreMosquitoTurnSign(mosquito, turnSign) {
      let x = mosquito.x;
      let y = mosquito.y;
      let angle = mosquito.angle;
      let bestClearance = getBoundaryClearance(x, y);

      for (
        let elapsed = 0;
        elapsed < MOSQUITO_PERIMETER_TEST_SECONDS;
        elapsed += MOSQUITO_PERIMETER_TEST_STEP
      ) {
        angle = wrapAngle(angle + turnSign * MOSQUITO_MAX_TURN_RATE * MOSQUITO_PERIMETER_TEST_STEP);
        x += Math.sin(angle) * MOSQUITO_SPEED * MOSQUITO_PERIMETER_TEST_STEP;
        y += Math.cos(angle) * MOSQUITO_SPEED * MOSQUITO_PERIMETER_TEST_STEP;
        bestClearance = Math.min(bestClearance, getBoundaryClearance(x, y));
      }

      return bestClearance;
    }

    function getBoundaryClearance(x, y) {
      return Math.min(
        x - BOUNDARY.west,
        BOUNDARY.east - x,
        y - BOUNDARY.south,
        BOUNDARY.north - y
      );
    }

    function getBatMosquitoDistanceUnits() {
      return Math.hypot(
        state.mosquito.x - state.bat.x,
        state.mosquito.y - state.bat.y
      );
    }

    function endGame() {
      if (state.isCaught) {
        return;
      }

      state.isCaught = true;
      input.forward = false;
      input.backward = false;
      input.left = false;
      input.right = false;
      state.bat.velocityX = 0;
      state.bat.velocityY = 0;
      state.mosquito.velocityX = 0;
      state.mosquito.velocityY = 0;
      mosquitoAudio.setMuted(true);

      if (caughtOverlay) {
        caughtOverlay.hidden = false;
      }

      if (tryAgainButton) {
        tryAgainButton.focus();
      }

      setAudioStatus("Caught the mosquito. Press try again to reset the flight.");
    }

    function resetGame() {
      Object.assign(state.bat, createInitialBatState());
      Object.assign(state.mosquito, createInitialMosquitoState());
      state.isCaught = false;
      input.forward = false;
      input.backward = false;
      input.left = false;
      input.right = false;
      mosquitoAudio.setMuted(false);

      if (caughtOverlay) {
        caughtOverlay.hidden = true;
      }

      updateMosquitoAudio();
      /*setAudioStatus(audioRunning
        ? "mosquito pitch includes the doppler shift from relative motion."
        : "press start to begin the mosquito sound."
      );*/
    }

    function updateMosquitoAudio() {
      const dx = state.mosquito.x - state.bat.x;
      const dy = state.mosquito.y - state.bat.y;
      const distanceUnits = Math.hypot(dx, dy);
      const distanceFeet = Math.hypot(dx, dy) / WORLD_UNITS_PER_FOOT;
      const forwardX = Math.sin(state.bat.angle);
      const forwardY = Math.cos(state.bat.angle);
      const rightX = Math.cos(state.bat.angle);
      const rightY = -Math.sin(state.bat.angle);
      const lateralOffset = dx * rightX + dy * rightY;
      const forwardOffset = dx * forwardX + dy * forwardY;
      const planarDistance = Math.hypot(lateralOffset, forwardOffset);
      const pan = planarDistance < 0.0001 ? 0 : 0.9 * (lateralOffset / planarDistance);
      const relativeVelocityX = state.mosquito.velocityX - state.bat.velocityX;
      const relativeVelocityY = state.mosquito.velocityY - state.bat.velocityY;
      const distanceRateUnitsPerSecond = distanceUnits < 0.0001
        ? 0
        : ((dx * relativeVelocityX) + (dy * relativeVelocityY)) / distanceUnits;
      const distanceRateFeetPerSecond = distanceRateUnitsPerSecond / WORLD_UNITS_PER_FOOT;

      mosquitoAudio.updateSpatial(distanceFeet, pan, distanceRateFeetPerSecond);
    }
  }

  function buildBoundaryTrees(treeWorldWidth, treeWorldHeight) {
    const trees = [];

    for (let x = BOUNDARY.west; x <= BOUNDARY.east; x += TREE_SPACING) {
      trees.push({ x, y: BOUNDARY.south, width: treeWorldWidth, height: treeWorldHeight });
      trees.push({ x, y: BOUNDARY.north, width: treeWorldWidth, height: treeWorldHeight });
    }

    for (let y = BOUNDARY.south + TREE_SPACING; y < BOUNDARY.north; y += TREE_SPACING) {
      trees.push({ x: BOUNDARY.west, y, width: treeWorldWidth, height: treeWorldHeight });
      trees.push({ x: BOUNDARY.east, y, width: treeWorldWidth, height: treeWorldHeight });
    }

    return trees;
  }

  function drawBillboard(ctx, image, projection) {
    ctx.drawImage(
      image,
      projection.left,
      projection.top,
      projection.width,
      projection.height
    );
  }

  function projectBillboard(
    worldX,
    worldY,
    bottomZ,
    worldHeight,
    worldWidth,
    camera,
    forwardX,
    forwardY,
    rightX,
    rightY,
    cameraHeight
  ) {
    const dx = worldX - camera.x;
    const dy = worldY - camera.y;

    const cameraX = dx * rightX + dy * rightY;
    const cameraZ = dx * forwardX + dy * forwardY;

    if (cameraZ <= 1) {
      return null;
    }

    const screenCenterX = HALF_WIDTH + (cameraX * FOCAL_LENGTH) / cameraZ;
    const projectedWidth = (worldWidth * FOCAL_LENGTH) / cameraZ;
    const top = HORIZON_Y - ((bottomZ + worldHeight - cameraHeight) * FOCAL_LENGTH) / cameraZ;
    const bottom = HORIZON_Y - ((bottomZ - cameraHeight) * FOCAL_LENGTH) / cameraZ;
    const projectedHeight = bottom - top;

    if (projectedWidth <= 0.3 || projectedHeight <= 0.3) {
      return null;
    }

    const left = screenCenterX - projectedWidth / 2;
    const right = screenCenterX + projectedWidth / 2;

    if (right < -projectedWidth || left > SCREEN_WIDTH + projectedWidth) {
      return null;
    }

    return {
      depth: cameraZ,
      left,
      right,
      top,
      width: projectedWidth,
      height: projectedHeight
    };
  }

  function drawStatus(ctx, title, detail) {
    const gradient = ctx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
    gradient.addColorStop(0, "#08111e");
    gradient.addColorStop(1, "#050912");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

    ctx.fillStyle = "rgba(6, 11, 20, 0.72)";
    ctx.fillRect(24, 24, 420, 92);

    ctx.fillStyle = "#eef6ff";
    ctx.font = '700 22px "Trebuchet MS", "Lucida Sans Unicode", sans-serif';
    ctx.fillText(title, 42, 62);

    ctx.fillStyle = "#a9bad0";
    ctx.font = '15px "Trebuchet MS", "Lucida Sans Unicode", sans-serif';
    ctx.fillText(detail, 42, 90);
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Failed to load image: ${src}`));
      image.src = src;
    });
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function randomInRange(min, max) {
    return min + Math.random() * (max - min);
  }

  function signedAngleDifference(targetAngle, currentAngle) {
    const circle = Math.PI * 2;
    return ((((targetAngle - currentAngle) + Math.PI) % circle) + circle) % circle - Math.PI;
  }

  function wrapAngle(angle) {
    const circle = Math.PI * 2;
    let wrapped = angle % circle;
    if (wrapped < 0) {
      wrapped += circle;
    }
    return wrapped;
  }

  function setAudioStatus(message) {
    if (!audioStatus) {
      return;
    }

    audioStatus.textContent = message;
  }

  function getMosquitoSoundCode() {
    const assets = window.GoodListenerGameAssets;

    if (!assets || typeof assets.mosquitoSoundCode !== "string") {
      throw new Error("Mosquito sound code is not available.");
    }

    return assets.mosquitoSoundCode;
  }
})();
