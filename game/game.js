(() => {
  const SCREEN_WIDTH = 1280;
  const SCREEN_HEIGHT = 720;
  const HALF_WIDTH = SCREEN_WIDTH / 2;
  const HORIZON_Y = SCREEN_HEIGHT / 2;

  const WORLD_WIDTH = SCREEN_WIDTH;
  const WORLD_DEPTH = SCREEN_HEIGHT;

  const HORIZONTAL_FOV = 65 * Math.PI / 180;
  const HALF_FOV = HORIZONTAL_FOV / 2;
  const FOCAL_LENGTH = SCREEN_WIDTH / (2 * Math.tan(HALF_FOV));

  const FIXED_STEP = 1 / 120;
  const MOVE_SPEED = WORLD_DEPTH * 0.08;
  const TURN_SPEED = Math.PI;

  const TREE_HEIGHT = 120;
  const ENTITY_HEIGHT = TREE_HEIGHT / 2;
  const TREE_EDGE_INSET = 18;
  const TREE_SPACING = 38;
  const PLAYER_RADIUS = 10;

  const MAP_MOSQUITO_WIDTH = 10;
  const MAP_TREE_HEIGHT = 34;
  const MAP_TREE_Y_OFFSET = 3;
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

  const mapCanvas = document.getElementById("map-view");
  const firstPersonCanvas = document.getElementById("first-person-view");
  const mapCtx = mapCanvas.getContext("2d");
  const firstPersonCtx = firstPersonCanvas.getContext("2d");

  const batMapSprite = createPixelSprite(
    [
      "0002200000",
      "0022220000",
      "2222222220",
      "2221122222",
      "0222222220",
      "0022222000",
      "0010010000",
      "0110011000",
      "1100001100",
      "0000000000"
    ],
    {
      1: "#f4de59",
      2: "#151923"
    }
  );

  drawStatus(mapCtx, "Loading assets", "Preparing mosquito and tree sprites...");
  drawStatus(firstPersonCtx, "Loading assets", "Preparing mosquito and tree sprites...");

  Promise.all([
    loadImage("game/mosquito.png"),
    loadImage("game/tree.png")
  ])
    .then(([mosquitoImage, treeImage]) => {
      startGame(mosquitoImage, treeImage);
    })
    .catch((error) => {
      console.error(error);
      drawStatus(mapCtx, "Asset load failed", "Check game/mosquito.png and game/tree.png.");
      drawStatus(firstPersonCtx, "Asset load failed", "Check the browser console for details.");
    });

  function startGame(mosquitoImage, treeImage) {
    const mosquitoAspect = mosquitoImage.naturalHeight / mosquitoImage.naturalWidth;
    const treeAspect = treeImage.naturalHeight / treeImage.naturalWidth;

    const mosquitoWorldWidth = START_DISTANCE * MAP_MOSQUITO_WIDTH / FOCAL_LENGTH;
    const mosquitoWorldHeight = mosquitoWorldWidth * mosquitoAspect;

    const treeWorldHeight = TREE_HEIGHT;
    const treeWorldWidth = treeWorldHeight / treeAspect;

    const mapMosquitoHeight = MAP_MOSQUITO_WIDTH * mosquitoAspect;
    const mapTreeWidth = MAP_TREE_HEIGHT / treeAspect;

    const boundaryTrees = buildBoundaryTrees(treeWorldWidth, treeWorldHeight);
    const input = {
      forward: false,
      backward: false,
      left: false,
      right: false
    };

    const state = {
      bat: {
        x: WORLD_WIDTH * 0.5,
        y: WORLD_DEPTH * 0.2,
        angle: 0,
        z: ENTITY_HEIGHT
      },
      mosquito: {
        x: WORLD_WIDTH * 0.5,
        y: WORLD_DEPTH * 0.8,
        z: ENTITY_HEIGHT,
        width: mosquitoWorldWidth,
        height: mosquitoWorldHeight
      }
    };

    mapCtx.imageSmoothingEnabled = true;
    firstPersonCtx.imageSmoothingEnabled = true;

    window.addEventListener(
      "keydown",
      (event) => {
        const action = KEY_TO_ACTION[event.key];
        if (!action) {
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

    let previousTime = performance.now();
    let accumulator = 0;

    requestAnimationFrame(frame);

    function frame(now) {
      const elapsed = Math.min((now - previousTime) / 1000, 0.25);
      previousTime = now;
      accumulator += elapsed;

      while (accumulator >= FIXED_STEP) {
        update(FIXED_STEP);
        accumulator -= FIXED_STEP;
      }

      render();
      requestAnimationFrame(frame);
    }

    function update(dt) {
      const turnDirection = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const moveDirection = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);

      state.bat.angle = wrapAngle(state.bat.angle + turnDirection * TURN_SPEED * dt);

      if (!moveDirection) {
        return;
      }

      const stepDistance = MOVE_SPEED * moveDirection * dt;
      const nextX = state.bat.x + Math.sin(state.bat.angle) * stepDistance;
      const nextY = state.bat.y + Math.cos(state.bat.angle) * stepDistance;

      state.bat.x = clamp(nextX, BOUNDARY.west + PLAYER_RADIUS, BOUNDARY.east - PLAYER_RADIUS);
      state.bat.y = clamp(nextY, BOUNDARY.south + PLAYER_RADIUS, BOUNDARY.north - PLAYER_RADIUS);
    }

    function render() {
      drawMapView();
      drawFirstPersonView();
    }

    function drawMapView() {
      const bg = mapCtx.createLinearGradient(0, 0, 0, SCREEN_HEIGHT);
      bg.addColorStop(0, "#0a1824");
      bg.addColorStop(1, "#08100d");
      mapCtx.fillStyle = bg;
      mapCtx.fillRect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);

      mapCtx.fillStyle = "rgba(109, 145, 102, 0.08)";
      mapCtx.fillRect(0, SCREEN_HEIGHT * 0.26, SCREEN_WIDTH, SCREEN_HEIGHT * 0.44);

      drawFovCone(mapCtx, state.bat);
      drawBoundaryTreesOnMap(mapCtx, treeImage, boundaryTrees, mapTreeWidth, MAP_TREE_HEIGHT);
      drawCompass(mapCtx);
      drawMapHud(mapCtx);

      drawImageSpriteOnMap(
        mapCtx,
        mosquitoImage,
        state.mosquito.x,
        state.mosquito.y,
        0,
        MAP_MOSQUITO_WIDTH,
        mapMosquitoHeight
      );

      drawPixelSpriteOnMap(mapCtx, batMapSprite, state.bat.x, state.bat.y, state.bat.angle);
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

      drawFirstPersonHud(firstPersonCtx);
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

  function drawBoundaryTreesOnMap(ctx, treeImage, boundaryTrees, drawWidth, drawHeight) {
    for (const tree of boundaryTrees) {
      const screenX = worldToScreenX(tree.x);
      const screenY = worldToScreenY(tree.y) + MAP_TREE_Y_OFFSET;

      ctx.drawImage(
        treeImage,
        screenX - drawWidth / 2,
        screenY - drawHeight,
        drawWidth,
        drawHeight
      );
    }
  }

  function drawImageSpriteOnMap(ctx, image, worldX, worldY, angle, drawWidth, drawHeight) {
    const screenX = worldToScreenX(worldX);
    const screenY = worldToScreenY(worldY);

    ctx.save();
    ctx.translate(screenX, screenY);
    ctx.rotate(angle);
    ctx.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.restore();
  }

  function drawPixelSpriteOnMap(ctx, sprite, worldX, worldY, angle) {
    const screenX = worldToScreenX(worldX);
    const screenY = worldToScreenY(worldY);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(screenX, screenY);
    ctx.rotate(angle);
    ctx.drawImage(sprite, -5, -5);
    ctx.restore();
    ctx.imageSmoothingEnabled = true;
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

  function drawFovCone(ctx, bat) {
    const leftHit = castBoundaryRay(
      bat.x,
      bat.y,
      Math.sin(bat.angle - HALF_FOV),
      Math.cos(bat.angle - HALF_FOV)
    );
    const rightHit = castBoundaryRay(
      bat.x,
      bat.y,
      Math.sin(bat.angle + HALF_FOV),
      Math.cos(bat.angle + HALF_FOV)
    );

    const batX = worldToScreenX(bat.x);
    const batY = worldToScreenY(bat.y);
    const leftX = worldToScreenX(bat.x + Math.sin(bat.angle - HALF_FOV) * leftHit.distance);
    const leftY = worldToScreenY(bat.y + Math.cos(bat.angle - HALF_FOV) * leftHit.distance);
    const rightX = worldToScreenX(bat.x + Math.sin(bat.angle + HALF_FOV) * rightHit.distance);
    const rightY = worldToScreenY(bat.y + Math.cos(bat.angle + HALF_FOV) * rightHit.distance);

    ctx.fillStyle = "rgba(122, 193, 255, 0.1)";
    ctx.strokeStyle = "rgba(122, 193, 255, 0.38)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(batX, batY);
    ctx.lineTo(leftX, leftY);
    ctx.lineTo(rightX, rightY);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  function castBoundaryRay(originX, originY, dirX, dirY) {
    let bestDistance = Infinity;

    if (dirX > 0.000001) {
      const distance = (BOUNDARY.east - originX) / dirX;
      const hitY = originY + dirY * distance;
      if (distance > 0 && hitY >= BOUNDARY.south && hitY <= BOUNDARY.north && distance < bestDistance) {
        bestDistance = distance;
      }
    } else if (dirX < -0.000001) {
      const distance = (BOUNDARY.west - originX) / dirX;
      const hitY = originY + dirY * distance;
      if (distance > 0 && hitY >= BOUNDARY.south && hitY <= BOUNDARY.north && distance < bestDistance) {
        bestDistance = distance;
      }
    }

    if (dirY > 0.000001) {
      const distance = (BOUNDARY.north - originY) / dirY;
      const hitX = originX + dirX * distance;
      if (distance > 0 && hitX >= BOUNDARY.west && hitX <= BOUNDARY.east && distance < bestDistance) {
        bestDistance = distance;
      }
    } else if (dirY < -0.000001) {
      const distance = (BOUNDARY.south - originY) / dirY;
      const hitX = originX + dirX * distance;
      if (distance > 0 && hitX >= BOUNDARY.west && hitX <= BOUNDARY.east && distance < bestDistance) {
        bestDistance = distance;
      }
    }

    return { distance: bestDistance };
  }

  function drawCompass(ctx) {
    ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
    ctx.font = '700 28px "Trebuchet MS", "Lucida Sans Unicode", sans-serif';
    ctx.fillText("N", SCREEN_WIDTH - 42, 42);

    ctx.strokeStyle = "rgba(255, 255, 255, 0.72)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(SCREEN_WIDTH - 28, 54);
    ctx.lineTo(SCREEN_WIDTH - 28, 82);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(SCREEN_WIDTH - 28, 54);
    ctx.lineTo(SCREEN_WIDTH - 35, 64);
    ctx.lineTo(SCREEN_WIDTH - 21, 64);
    ctx.closePath();
    ctx.fill();
  }

  function drawMapHud(ctx) {
    ctx.fillStyle = "rgba(6, 11, 20, 0.62)";
    ctx.fillRect(18, 18, 476, 82);

    ctx.fillStyle = "#eef6ff";
    ctx.font = '700 16px "Trebuchet MS", "Lucida Sans Unicode", sans-serif';
    ctx.fillText("Shared world state", 32, 46);

    ctx.fillStyle = "#a9bad0";
    ctx.font = '14px "Trebuchet MS", "Lucida Sans Unicode", sans-serif';
    ctx.fillText("Bat: move with W/S or arrows, turn with A/D or arrows", 32, 68);
    ctx.fillText("Mosquito sprite: game/mosquito.png. Boundary: repeated tree sprites.", 32, 88);
  }

  function drawFirstPersonHud(ctx) {
    ctx.fillStyle = "rgba(6, 11, 20, 0.62)";
    ctx.fillRect(18, 18, 448, 72);

    ctx.fillStyle = "#eef6ff";
    ctx.font = '700 16px "Trebuchet MS", "Lucida Sans Unicode", sans-serif';
    ctx.fillText("65 degree horizontal FOV", 32, 46);

    ctx.fillStyle = "#a9bad0";
    ctx.font = '14px "Trebuchet MS", "Lucida Sans Unicode", sans-serif';
    ctx.fillText("Tree height = 2x flight height. 120 Hz fixed simulation step.", 32, 68);
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

  function createPixelSprite(rows, palette) {
    const sprite = document.createElement("canvas");
    sprite.width = rows[0].length;
    sprite.height = rows.length;

    const ctx = sprite.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    for (let y = 0; y < rows.length; y += 1) {
      for (let x = 0; x < rows[y].length; x += 1) {
        const key = rows[y][x];
        const color = palette[key];
        if (!color) {
          continue;
        }

        ctx.fillStyle = color;
        ctx.fillRect(x, y, 1, 1);
      }
    }

    return sprite;
  }

  function worldToScreenX(worldX) {
    return (worldX / WORLD_WIDTH) * SCREEN_WIDTH;
  }

  function worldToScreenY(worldY) {
    return SCREEN_HEIGHT - (worldY / WORLD_DEPTH) * SCREEN_HEIGHT;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function wrapAngle(angle) {
    const circle = Math.PI * 2;
    let wrapped = angle % circle;
    if (wrapped < 0) {
      wrapped += circle;
    }
    return wrapped;
  }
})();
