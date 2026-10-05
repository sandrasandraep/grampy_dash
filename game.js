const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");

const W = canvas.width;
const H = canvas.height;
const FLOOR_Y = 588;
const GRAVITY = 2620;
const JUMP_VELOCITY = -1120;
const CUBE_SIZE = 76;
const START_X = 168;
const START_SPEED = 320;
const MAX_SPEED = 610;
const PATTERN_GAP = 520;
const MIN_BLOCK_SPACING = 1120;
const BEST_KEY = "grampa-dash-best";

let best = Number(localStorage.getItem(BEST_KEY) || 0);
let lastTime = 0;
let status = "ready";
let score = 0;
let distance = 0;
let speed = START_SPEED;
let spawnX = W + 160;
let lastBlockX = -Infinity;
let shake = 0;
let obstacles = [];
let clouds = [];
let sparks = [];
let audioContext;
let musicTimer;
let musicStep = 0;
let masterGain;
let delayNode;
let delayGain;
let filterNode;

const player = {
  x: START_X,
  y: FLOOR_Y - CUBE_SIZE,
  size: CUBE_SIZE,
  vy: 0,
  grounded: true,
  rotation: 0,
};

const palettes = {
  skyTop: "#26313b",
  skyBottom: "#15191d",
  floor: "#272f36",
  floorLine: "#62d37a",
  spike: "#f06455",
  spikeDark: "#7b2d32",
  platform: "#e8c35a",
  platformDark: "#8a6b26",
  cube: "#d9ad6a",
  cubeDark: "#8e6032",
  hair: "#f2efe7",
  glasses: "#20252b",
  lens: "#bfe8ff",
  mustache: "#f4f0e7",
  cane: "#7d4f2d",
};

bestEl.textContent = best;

function resetGame() {
  score = 0;
  distance = 0;
  speed = START_SPEED;
  spawnX = W + 120;
  lastBlockX = -Infinity;
  shake = 0;
  obstacles = [];
  sparks = [];
  player.y = FLOOR_Y - CUBE_SIZE;
  player.vy = 0;
  player.grounded = true;
  player.rotation = 0;
  seedClouds();
  for (let i = 0; i < 6; i += 1) {
    addPattern();
  }
  scoreEl.textContent = "0";
}

function seedClouds() {
  clouds = Array.from({ length: 10 }, (_, i) => ({
    x: i * 150 + Math.random() * 90,
    y: 70 + Math.random() * 180,
    w: 72 + Math.random() * 90,
    speed: 18 + Math.random() * 28,
    tint: Math.random() > 0.5 ? "rgba(244,240,231,0.12)" : "rgba(104,169,255,0.1)",
  }));
}

function addPattern() {
  const difficulty = getDifficulty();
  const roll = Math.random();
  const gap = Math.max(390, PATTERN_GAP + Math.random() * (280 - difficulty * 70) - difficulty * 120);
  const spikeChance = 0.24 + difficulty * 0.14;
  const blockChance = 0.6 - difficulty * 0.08;

  if (roll < spikeChance) {
    const spikeCount = difficulty > 0.62 && Math.random() < difficulty * 0.42 ? 2 : 1;
    obstacles.push(makeSpike(spawnX, spikeCount));
  } else if (roll < blockChance) {
    if (!addBlock(spawnX, 116 + Math.random() * 34, 56)) {
      obstacles.push(makeSpike(spawnX, 1));
    }
  } else if (roll < 0.82) {
    obstacles.push(makeSpike(spawnX, 1));
    addBlock(spawnX + 560, 118, 56);
  } else {
    obstacles.push(makePlatform(spawnX, 258 + Math.random() * (80 - difficulty * 22), 172 + Math.random() * 50));
    obstacles.push(makeSpike(spawnX + 330, difficulty > 0.78 && Math.random() < 0.35 ? 2 : 1));
  }

  spawnX += gap;
}

function getDifficulty() {
  return Math.min(1, distance / 26000);
}

function addBlock(x, w, h) {
  if (x - lastBlockX < MIN_BLOCK_SPACING) {
    return false;
  }

  obstacles.push(makeBlock(x, w, h));
  lastBlockX = x;
  return true;
}

function makeSpike(x, count) {
  return {
    type: "spike",
    x,
    y: FLOOR_Y,
    w: count * 56,
    h: 58,
    count,
    passed: false,
  };
}

function makeBlock(x, w, h) {
  return {
    type: "block",
    x,
    y: FLOOR_Y - h,
    w,
    h,
    passed: false,
  };
}

function makePlatform(x, y, w) {
  return {
    type: "platform",
    x,
    y,
    w,
    h: 24,
    passed: false,
  };
}

function begin() {
  resetGame();
  status = "running";
  startMusic();
  overlay.classList.add("hidden");
  lastTime = performance.now();
  requestAnimationFrame(loop);
}

function jump() {
  if (status === "ready" || status === "ended") {
    begin();
    return;
  }

  if (player.grounded) {
    player.vy = JUMP_VELOCITY;
    player.grounded = false;
    for (let i = 0; i < 9; i += 1) {
      sparks.push({
        x: player.x + 10 + Math.random() * 38,
        y: player.y + player.size,
        vx: -80 - Math.random() * 180,
        vy: -60 - Math.random() * 140,
        life: 0.36 + Math.random() * 0.18,
      });
    }
  }
}

function endGame() {
  status = "ended";
  stopMusic();
  shake = 16;
  best = Math.max(best, score);
  localStorage.setItem(BEST_KEY, String(best));
  bestEl.textContent = best;
  overlayTitle.textContent = "Run Over";
  overlayText.textContent = `Score ${score}. Grampa is ready to try again.`;
  startButton.textContent = "Restart";
  overlay.classList.remove("hidden");
}

function loop(now) {
  if (status !== "running") return;
  const dt = Math.min((now - lastTime) / 1000, 0.032);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

function update(dt) {
  distance += speed * dt;
  speed = Math.min(MAX_SPEED, START_SPEED + distance * (0.007 + getDifficulty() * 0.005));
  score = Math.floor(distance / 16);
  scoreEl.textContent = score;

  const wasGrounded = player.grounded;
  const previousBottom = player.y + player.size;
  player.vy += GRAVITY * dt;
  player.y += player.vy * dt;
  player.grounded = false;
  player.rotation += (wasGrounded ? 0 : 5.7) * dt;

  clouds.forEach((cloud) => {
    cloud.x -= cloud.speed * dt;
    if (cloud.x + cloud.w < -20) {
      cloud.x = W + Math.random() * 160;
      cloud.y = 60 + Math.random() * 190;
    }
  });

  obstacles.forEach((obstacle) => {
    obstacle.x -= speed * dt;
    if (!obstacle.passed && obstacle.x + obstacle.w < player.x) {
      obstacle.passed = true;
      score += 5;
    }
  });

  landOnBlock(previousBottom);

  if (player.y >= FLOOR_Y - player.size) {
    player.y = FLOOR_Y - player.size;
    player.vy = 0;
    player.grounded = true;
    snapRotation();
  }

  while (obstacles.length && obstacles[0].x + obstacles[0].w < -120) {
    obstacles.shift();
  }

  while (spawnX < W + 920) {
    addPattern();
  }
  spawnX -= speed * dt;
  lastBlockX -= speed * dt;

  sparks = sparks
    .map((spark) => ({
      ...spark,
      x: spark.x + spark.vx * dt,
      y: spark.y + spark.vy * dt,
      vy: spark.vy + 520 * dt,
      life: spark.life - dt,
    }))
    .filter((spark) => spark.life > 0);

  if (shake > 0) {
    shake = Math.max(0, shake - 60 * dt);
  }

  if (hitsObstacle()) {
    draw();
    endGame();
  }
}

function startMusic() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;

  if (!audioContext) {
    audioContext = new AudioContextClass();
    masterGain = audioContext.createGain();
    delayNode = audioContext.createDelay();
    delayGain = audioContext.createGain();
    filterNode = audioContext.createBiquadFilter();

    masterGain.gain.value = 0.12;
    delayNode.delayTime.value = 0.18;
    delayGain.gain.value = 0.22;
    filterNode.type = "lowpass";
    filterNode.frequency.value = 7200;

    delayNode.connect(delayGain);
    delayGain.connect(delayNode);
    delayGain.connect(filterNode);
    masterGain.connect(filterNode);
    filterNode.connect(audioContext.destination);
  }

  audioContext.resume();
  stopMusic();
  musicStep = 0;
  playMusicStep();
  scheduleMusicStep();
}

function stopMusic() {
  if (musicTimer) {
    window.clearTimeout(musicTimer);
    musicTimer = undefined;
  }
}

function scheduleMusicStep() {
  const nextStepDelay = 138 - getDifficulty() * 38;
  musicTimer = window.setTimeout(() => {
    if (status !== "running") return;
    playMusicStep();
    scheduleMusicStep();
  }, nextStepDelay);
}

function playMusicStep() {
  if (!audioContext || !masterGain) return;

  const now = audioContext.currentTime;
  const phraseStep = musicStep % 64;
  const bar = Math.floor(phraseStep / 16);
  const beatStep = phraseStep % 16;
  const energy = getDifficulty();
  const musicLevel = Math.floor(energy * 4);
  const roots = [110, 130.81, 146.83, 98];
  const root = roots[bar];
  const bassPattern = [1, 0, 1.5, 0, 2, 0, 1.5, 0, 1, 0, 1.5, 0, 2.25, 0, 1.5, 0];
  const melodyPattern = [2, 0, 3, 4, 0, 3, 2, 0, 1.5, 0, 2, 3, 4, 0, 5, 6];
  const chordShapes = [
    [1, 1.25, 1.5],
    [1, 1.2, 1.5],
    [1, 1.25, 1.68],
    [1, 1.2, 1.5],
  ];

  masterGain.gain.setTargetAtTime(0.12 + energy * 0.04, now, 0.04);
  filterNode.frequency.setTargetAtTime(5200 + energy * 3600, now, 0.06);
  delayGain.gain.setTargetAtTime(0.18 + energy * 0.12, now, 0.06);

  if (beatStep === 0 || beatStep === 8 || (musicLevel >= 2 && beatStep === 14)) {
    playKick(now);
  }

  if (beatStep === 4 || beatStep === 12) {
    playSnare(now);
  }

  if (beatStep % 2 === 0 || musicLevel >= 2) {
    playHat(now, beatStep % 4 === 0 ? 0.055 + energy * 0.025 : 0.035 + energy * 0.018);
  }

  if (beatStep % 4 === 0) {
    const chord = chordShapes[bar];
    chord.forEach((ratio, index) => {
      playTone(root * ratio * 2, 0.42, "triangle", now + index * 0.012, 0.045, 0.025, delayNode);
    });
  }

  const bassRatio = bassPattern[beatStep];
  if (bassRatio) {
    playTone(root * bassRatio, 0.16, "sawtooth", now, 0.105 + energy * 0.025, 0.018);
  }

  const melodyRatio = melodyPattern[(beatStep + bar * 3) % melodyPattern.length];
  if (melodyRatio && (beatStep % 2 === 1 || energy > 0.35)) {
    playTone(root * melodyRatio * 2, 0.105, "square", now, 0.07 + energy * 0.035, 0.01, delayNode);
  }

  if (musicLevel >= 1 && beatStep % 4 === 2) {
    playTone(root * 3, 0.075, "triangle", now, 0.035 + energy * 0.02, 0.006, delayNode);
  }

  if (musicLevel >= 3 && beatStep % 4 === 3) {
    playTone(root * 6, 0.06, "square", now, 0.045, 0.004, delayNode);
  }

  musicStep += 1;
}

function playTone(frequency, duration, type, when, volume, attack = 0.012, send = masterGain) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, when);
  gain.gain.setValueAtTime(0, when);
  gain.gain.linearRampToValueAtTime(volume, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  oscillator.connect(gain);
  gain.connect(masterGain);
  if (send && send !== masterGain) {
    gain.connect(send);
  }
  oscillator.start(when);
  oscillator.stop(when + duration + 0.02);
}

function playKick(when) {
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();

  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(128, when);
  oscillator.frequency.exponentialRampToValueAtTime(42, when + 0.16);
  gain.gain.setValueAtTime(0.42, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + 0.18);

  oscillator.connect(gain);
  gain.connect(masterGain);
  oscillator.start(when);
  oscillator.stop(when + 0.2);
}

function playSnare(when) {
  playNoise(0.09, when, 0.16, 1600);
  playTone(190, 0.055, "triangle", when, 0.08, 0.005);
}

function playHat(when, volume) {
  playNoise(volume, when, 0.045, 8200);
}

function playNoise(volume, when, duration, frequency) {
  const bufferSize = Math.max(1, Math.floor(audioContext.sampleRate * duration));
  const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  const noiseFilter = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  const source = audioContext.createBufferSource();

  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = Math.random() * 2 - 1;
  }

  noiseFilter.type = "highpass";
  noiseFilter.frequency.value = frequency;
  gain.gain.setValueAtTime(volume, when);
  gain.gain.exponentialRampToValueAtTime(0.001, when + duration);

  source.buffer = buffer;
  source.connect(noiseFilter);
  noiseFilter.connect(gain);
  gain.connect(masterGain);
  source.start(when);
  source.stop(when + duration);
}

function landOnBlock(previousBottom) {
  if (player.vy < 0) return;

  const footLeft = player.x + 12;
  const footRight = player.x + player.size - 12;
  const currentBottom = player.y + player.size;

  for (const obstacle of obstacles) {
    if (obstacle.type !== "block") continue;

    const topWasReached = previousBottom <= obstacle.y + 10 && currentBottom >= obstacle.y;
    const feetAreOverBlock = footRight > obstacle.x + 6 && footLeft < obstacle.x + obstacle.w - 6;

    if (topWasReached && feetAreOverBlock) {
      player.y = obstacle.y - player.size;
      player.vy = 0;
      player.grounded = true;
      snapRotation();
      return;
    }
  }
}

function snapRotation() {
  player.rotation = Math.round(player.rotation / (Math.PI / 2)) * (Math.PI / 2);
}

function hitsObstacle() {
  const pad = 9;
  const playerBox = {
    x: player.x + pad,
    y: player.y + pad,
    w: player.size - pad * 2,
    h: player.size - pad * 2,
  };

  return obstacles.some((obstacle) => {
    if (obstacle.type === "platform") {
      return false;
    }

    if (obstacle.type === "spike") {
      for (let i = 0; i < obstacle.count; i += 1) {
        const sx = obstacle.x + i * 56;
        const spikeBox = { x: sx + 19, y: FLOOR_Y - obstacle.h + 28, w: 18, h: obstacle.h - 28 };
        if (overlaps(playerBox, spikeBox)) return true;
      }
      return false;
    }

    return overlaps(playerBox, obstacle);
  });
}

function overlaps(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function draw() {
  ctx.save();
  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  }
  drawBackground();
  drawObstacles();
  drawSparks();
  drawRunningGrampa();
  drawForeground();
  ctx.restore();
}

function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, palettes.skyTop);
  sky.addColorStop(0.72, palettes.skyBottom);
  sky.addColorStop(1, "#111417");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = "rgba(98, 211, 122, 0.08)";
  for (let i = 0; i < 7; i += 1) {
    const x = ((i * 230 - distance * 0.16) % (W + 260)) - 130;
    drawDiamond(x, 165 + (i % 3) * 64, 42);
  }

  clouds.forEach((cloud) => {
    ctx.fillStyle = cloud.tint;
    roundedRect(cloud.x, cloud.y, cloud.w, 20, 10);
    roundedRect(cloud.x + 22, cloud.y - 12, cloud.w * 0.5, 30, 15);
  });

  ctx.fillStyle = "rgba(232, 195, 90, 0.16)";
  for (let i = 0; i < 5; i += 1) {
    const x = ((i * 320 - distance * 0.28) % (W + 360)) - 180;
    ctx.fillRect(x, 430 + (i % 2) * 42, 160, 8);
  }

  ctx.fillStyle = palettes.floor;
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = palettes.floorLine;
  ctx.fillRect(0, FLOOR_Y, W, 6);

  ctx.strokeStyle = "rgba(244, 240, 231, 0.08)";
  ctx.lineWidth = 2;
  for (let x = -((distance * 0.85) % 64); x < W; x += 64) {
    ctx.beginPath();
    ctx.moveTo(x, FLOOR_Y + 24);
    ctx.lineTo(x + 34, H);
    ctx.stroke();
  }
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    if (obstacle.type === "spike") {
      for (let i = 0; i < obstacle.count; i += 1) {
        const x = obstacle.x + i * 56;
        ctx.fillStyle = palettes.spikeDark;
        triangle(x + 4, FLOOR_Y, x + 28, FLOOR_Y - obstacle.h - 7, x + 52, FLOOR_Y);
        ctx.fillStyle = palettes.spike;
        triangle(x + 10, FLOOR_Y, x + 28, FLOOR_Y - obstacle.h, x + 46, FLOOR_Y);
        ctx.fillStyle = "rgba(244, 240, 231, 0.35)";
        triangle(x + 24, FLOOR_Y - obstacle.h + 15, x + 29, FLOOR_Y - obstacle.h + 2, x + 34, FLOOR_Y - obstacle.h + 15);
      }
    }

    if (obstacle.type === "block") {
      ctx.fillStyle = palettes.platformDark;
      roundedRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h, 6);
      ctx.fillStyle = palettes.platform;
      roundedRect(obstacle.x + 5, obstacle.y + 5, obstacle.w - 10, obstacle.h - 12, 5);
      ctx.fillStyle = "rgba(17, 20, 23, 0.25)";
      ctx.fillRect(obstacle.x + 8, obstacle.y + obstacle.h - 16, obstacle.w - 16, 6);
    }

    if (obstacle.type === "platform") {
      ctx.fillStyle = "rgba(104, 169, 255, 0.34)";
      roundedRect(obstacle.x, obstacle.y, obstacle.w, obstacle.h, 6);
      ctx.fillStyle = "rgba(244, 240, 231, 0.22)";
      ctx.fillRect(obstacle.x + 10, obstacle.y + 6, obstacle.w - 20, 4);
    }
  });
}

function drawSparks() {
  sparks.forEach((spark) => {
    ctx.globalAlpha = Math.max(0, spark.life * 2.4);
    ctx.fillStyle = palettes.green;
    ctx.fillRect(spark.x, spark.y, 6, 6);
    ctx.globalAlpha = 1;
  });
}

function drawRunningGrampa() {
  const stride = status === "running" && player.grounded ? Math.sin(distance / 24) : 0.7;
  const bob = status === "running" && player.grounded ? -Math.abs(stride) * 2 : 0;
  ctx.save();
  ctx.translate(player.x, player.y + bob);
  ctx.scale(player.size / 76, player.size / 76);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  function limb(points, color, width) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    for (let i = 2; i < points.length; i += 2) ctx.lineTo(points[i], points[i + 1]);
    ctx.stroke();
  }

  // Keep the feet inside the original player bounds so landings still line up.
  const backFoot = 33 - stride * 19;
  const frontFoot = 38 + stride * 19;
  limb([33, 52, 28 - stride * 10, 62, backFoot, 70], "#68a9ff", 9);
  limb([39, 53, 44 + stride * 10, 62, frontFoot, 70], "#4386ce", 9);
  limb([backFoot - 3, 72, backFoot + 7, 72], "#f06455", 7);
  limb([frontFoot - 3, 72, frontFoot + 8, 72], "#f06455", 7);
  limb([30, 31, 16 - stride * 4, 42, 23, 47], "#edbf90", 7);

  ctx.fillStyle = "#62d37a";
  roundedRect(23, 28, 30, 28, 11);
  limb([33, 31, 31, 51], "#f4f0e7", 3);
  limb([45, 32, 43, 52], "#f4f0e7", 3);
  limb([48, 35, 58 + stride * 4, 44, 65, 34], "#edbf90", 7);

  ctx.fillStyle = "#edbf90";
  ctx.beginPath();
  ctx.ellipse(47, 17, 20, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palettes.hair;
  for (const [x, y, r] of [[29, 13, 8], [31, 4, 8], [40, 0, 8], [51, 1, 7]]) {
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = palettes.glasses;
  roundedRect(34, 11, 13, 11, 3);
  roundedRect(50, 12, 13, 11, 3);
  ctx.fillRect(46, 15, 5, 3);
  ctx.fillStyle = palettes.lens;
  roundedRect(36, 13, 9, 7, 2);
  roundedRect(52, 14, 9, 7, 2);
  ctx.fillStyle = palettes.glasses;
  ctx.fillRect(41, 15, 3, 3);
  ctx.fillRect(57, 16, 3, 3);
  ctx.fillStyle = "#edbf90";
  ctx.beginPath();
  ctx.ellipse(65, 23, 8, 5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palettes.mustache;
  roundedRect(47, 25, 19, 6, 3);
  limb([54, 33, 62, 33], "#4b2e21", 2);

  ctx.restore();
}

function drawForeground() {
  ctx.fillStyle = "rgba(244, 240, 231, 0.16)";
  for (let x = -((distance * 1.7) % 90); x < W + 90; x += 90) {
    ctx.fillRect(x, FLOOR_Y + 9, 42, 7);
  }
}

function triangle(x1, y1, x2, y2, x3, y3) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.lineTo(x3, y3);
  ctx.closePath();
  ctx.fill();
}

function roundedRect(x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
  ctx.fill();
}

function drawDiamond(x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.restore();
}

startButton.addEventListener("click", begin);

window.addEventListener("keydown", (event) => {
  if (event.code === "Space" || event.code === "ArrowUp") {
    event.preventDefault();
    jump();
  }
});

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  jump();
});

resetGame();
draw();
