const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");

const ui = {
  score: document.querySelector("#score"),
  best: document.querySelector("#best"),
  combo: document.querySelector("#combo"),
  stage: document.querySelector("#stage"),
  speed: document.querySelector("#speed"),
  power: document.querySelector("#power"),
  rush: document.querySelector("#rush"),
  overlay: document.querySelector("#overlay"),
  status: document.querySelector("#status"),
  primaryAction: document.querySelector("#primaryAction"),
  pauseBtn: document.querySelector("#pauseBtn"),
  restartBtn: document.querySelector("#restartBtn"),
  musicBtn: document.querySelector("#musicBtn"),
};

const gridSize = 24;
const cell = canvas.width / gridSize;
const stageNames = ["霓虹方格", "极速赛道", "糖果风暴", "高能盘旋"];
const colors = {
  snakeHead: "#eafff7",
  snakeA: "#56ffc6",
  snakeB: "#62d9ff",
  food: "#ffcd5e",
  coinDark: "#b96d00",
  coinLight: "#fff3a8",
  bonus: "#ff5f8f",
  wall: "#24433d",
};

let state;
let lastTime = 0;
let accumulator = 0;
let particles = [];
let floatingTexts = [];
let coinRain = [];
let shake = 0;
let touchStart = null;
let audioContext = null;
let music = null;

function createState() {
  const best = Number(localStorage.getItem("snakeRushBest") || 0);
  return {
    snake: [
      { x: 11, y: 12 },
      { x: 10, y: 12 },
      { x: 9, y: 12 },
      { x: 8, y: 12 },
    ],
    dir: { x: 1, y: 0 },
    nextDir: { x: 1, y: 0 },
    food: { x: 17, y: 12, type: "food" },
    bonus: null,
    score: 0,
    best,
    combo: 1,
    comboTimer: 0,
    rushEnergy: 0,
    rushTimer: 0,
    announcement: "",
    announcementLife: 0,
    stepMs: 120,
    alive: true,
    running: false,
    paused: false,
    frame: 0,
    stage: 0,
    powerName: "暂无",
  };
}

function resetGame(autostart = false) {
  state = createState();
  particles = [];
  floatingTexts = [];
  coinRain = [];
  shake = 0;
  spawnFood();
  updateUi();
  setOverlay(autostart ? false : true, autostart ? "" : "准备开冲");
  state.running = autostart;
  state.paused = false;
  ui.pauseBtn.textContent = "暂停";
  ui.primaryAction.textContent = "开始挑战";
}

function randomCell() {
  return {
    x: Math.floor(Math.random() * gridSize),
    y: Math.floor(Math.random() * gridSize),
  };
}

function occupied(point) {
  return state.snake.some((part) => part.x === point.x && part.y === point.y);
}

function spawnFood() {
  let point = randomCell();
  while (occupied(point)) point = randomCell();
  const bonusChance = state.rushTimer > 0 ? 0.34 : 0.18;
  state.food = { ...point, type: Math.random() > 1 - bonusChance ? "bonus" : "food" };
  state.powerName = state.food.type === "bonus" ? "金币翻倍" : "暂无";
}

function setOverlay(visible, text) {
  ui.overlay.classList.toggle("is-visible", visible);
  if (text) ui.status.textContent = text;
}

function updateUi() {
  ui.score.textContent = state.score;
  ui.best.textContent = state.best;
  ui.combo.textContent = `x${state.combo}`;
  ui.stage.textContent = stageNames[state.stage % stageNames.length];
  ui.speed.textContent = `${(120 / state.stepMs).toFixed(1)}x`;
  ui.power.textContent = state.rushTimer > 0 ? "暴富时间" : state.powerName;
  ui.rush.textContent = state.rushTimer > 0 ? `${Math.ceil(state.rushTimer / 8)}秒` : `${Math.min(100, state.rushEnergy)}%`;
}

function setDirection(x, y) {
  if (!state || !state.alive) return;
  const reverse = state.dir.x + x === 0 && state.dir.y + y === 0;
  if (!reverse) state.nextDir = { x, y };
}

function step() {
  if (!state.running || state.paused || !state.alive) return;
  if (state.rushTimer > 0) {
    state.rushTimer -= 1;
    if (state.rushTimer === 0) {
      announce("暴富结束");
    }
  }
  if (state.announcementLife > 0) state.announcementLife -= 1;

  state.dir = state.nextDir;
  const head = state.snake[0];
  const next = { x: head.x + state.dir.x, y: head.y + state.dir.y };
  const hitWall = next.x < 0 || next.y < 0 || next.x >= gridSize || next.y >= gridSize;
  const hitSelf = state.snake.some((part, index) => index > 0 && part.x === next.x && part.y === next.y);

  if (hitWall || hitSelf) {
    gameOver();
    return;
  }

  state.snake.unshift(next);
  const ate = next.x === state.food.x && next.y === state.food.y;

  if (ate) {
    eatFood(next);
  } else {
    state.snake.pop();
    state.comboTimer = Math.max(0, state.comboTimer - 1);
    if (state.comboTimer === 0) state.combo = 1;
  }

  updateUi();
}

function eatFood(point) {
  const bonus = state.food.type === "bonus";
  const rushMultiplier = state.rushTimer > 0 ? 2 : 1;
  const gained = (bonus ? 35 : 10) * state.combo * rushMultiplier;
  state.score += gained;
  state.best = Math.max(state.best, state.score);
  localStorage.setItem("snakeRushBest", state.best);
  state.combo = Math.min(9, state.combo + 1);
  state.comboTimer = 18;
  state.stepMs = Math.max(62, state.stepMs - (bonus ? 5 : 2));
  state.stage = Math.floor(state.score / 120);
  state.powerName = bonus ? "金币翻倍" : "暂无";
  state.rushEnergy = Math.min(100, state.rushEnergy + (bonus ? 34 : 18));
  const rushActivated = state.rushEnergy >= 100 && state.rushTimer === 0;
  if (rushActivated) {
    activateGoldRush();
  } else if ([3, 5, 8].includes(state.combo)) {
    announce(`${state.combo}连击入账`);
  }
  burst(point, bonus ? colors.coinLight : colors.food, bonus ? 42 : 26);
  spawnFloatingText(point, `+${gained}`, bonus || rushMultiplier > 1);
  playCoinSound(bonus);
  shake = bonus || rushMultiplier > 1 ? 10 : 5;
  spawnFood();
}

function activateGoldRush() {
  state.rushEnergy = 0;
  state.rushTimer = 48;
  state.powerName = "暴富时间";
  announce("金币暴富时间");
  createCoinRain(34);
  pulseSound(880, 0.08);
  shake = 14;
}

function gameOver() {
  state.alive = false;
  state.running = false;
  music.sync();
  burst(state.snake[0], colors.rose, 42);
  pulseSound(130, 0.16);
  setOverlay(true, "挑战结束");
  ui.primaryAction.textContent = "再来一局";
}

function burst(point, color, amount) {
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 1.3 + Math.random() * 3.8;
    particles.push({
      x: point.x * cell + cell / 2,
      y: point.y * cell + cell / 2,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 24 + Math.random() * 18,
      color,
    });
  }
}

function spawnFloatingText(point, label, important = false) {
  floatingTexts.push({
    x: point.x * cell + cell / 2,
    y: point.y * cell + cell / 2,
    vy: important ? -2.1 : -1.5,
    life: important ? 58 : 42,
    label,
    color: important ? colors.coinLight : colors.food,
    size: important ? 28 : 22,
  });
}

function announce(text) {
  state.announcement = text;
  state.announcementLife = 30;
}

function createCoinRain(amount) {
  for (let i = 0; i < amount; i += 1) {
    coinRain.push({
      x: Math.random() * canvas.width,
      y: -Math.random() * canvas.height * 0.8,
      vy: 4 + Math.random() * 7,
      spin: Math.random() * Math.PI,
      life: 90 + Math.random() * 50,
      size: 12 + Math.random() * 10,
    });
  }
}

function pulseSound(frequency, duration) {
  try {
    ensureAudio();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.frequency.value = frequency;
    oscillator.type = "triangle";
    gain.gain.value = 0.035;
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Audio is optional; some browsers block it until the first user gesture.
  }
}

function playCoinSound(isBonus) {
  try {
    ensureAudio();
    const notes = isBonus ? [880, 1174.66, 1567.98, 2093] : [880, 1318.51, 1760];
    notes.forEach((frequency, index) => {
      const start = audioContext.currentTime + index * 0.045;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.frequency.value = frequency;
      oscillator.type = index % 2 === 0 ? "triangle" : "sine";
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(isBonus ? 0.075 : 0.055, start + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.16);
      oscillator.connect(gain);
      gain.connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.18);
    });
  } catch {
    // Coin sound is optional when the browser blocks audio.
  }
}

function ensureAudio() {
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  if (audioContext.state === "suspended") {
    audioContext.resume();
  }
  return audioContext;
}

function createMusicEngine() {
  const bassNotes = [98, 98, 147, 98, 174.61, 147, 130.81, 147];
  const leadNotes = [392, 493.88, 587.33, 493.88, 659.25, 587.33, 493.88, 440];
  const beatMs = 150;
  let timer = null;
  let stepIndex = 0;
  let enabled = localStorage.getItem("snakeRushMusic") !== "off";

  function playTone(frequency, duration, type, volume, delay = 0) {
    const context = ensureAudio();
    const start = context.currentTime + delay;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    oscillator.frequency.value = frequency;
    oscillator.type = type;
    filter.type = "lowpass";
    filter.frequency.value = type === "sawtooth" ? 1100 : 1800;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.014);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(filter);
    filter.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  function playKick() {
    const context = ensureAudio();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const start = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(92, start);
    oscillator.frequency.exponentialRampToValueAtTime(42, start + 0.12);
    gain.gain.setValueAtTime(0.065, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.14);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + 0.16);
  }

  function tick() {
    if (!enabled || !state.running || state.paused || !state.alive) return;
    const bass = bassNotes[stepIndex % bassNotes.length];
    const lead = leadNotes[stepIndex % leadNotes.length];
    playTone(bass, 0.13, "sawtooth", 0.025);
    if (stepIndex % 2 === 0) playKick();
    if (stepIndex % 4 === 2) playTone(lead, 0.08, "square", 0.014, 0.035);
    if (state.combo >= 4 && stepIndex % 4 === 0) playTone(lead * 1.5, 0.06, "triangle", 0.012, 0.07);
    stepIndex += 1;
  }

  function start() {
    if (!enabled || timer) return;
    ensureAudio();
    tick();
    timer = window.setInterval(tick, beatMs);
  }

  function stop() {
    if (!timer) return;
    window.clearInterval(timer);
    timer = null;
  }

  function setEnabled(value) {
    enabled = value;
    localStorage.setItem("snakeRushMusic", enabled ? "on" : "off");
    ui.musicBtn.textContent = enabled ? "音乐开" : "音乐关";
    if (enabled && state.running && !state.paused && state.alive) {
      start();
    } else {
      stop();
    }
  }

  function sync() {
    ui.musicBtn.textContent = enabled ? "音乐开" : "音乐关";
    if (enabled && state.running && !state.paused && state.alive) {
      start();
    } else {
      stop();
    }
  }

  return {
    get enabled() {
      return enabled;
    },
    setEnabled,
    sync,
    start,
    stop,
  };
}

function draw(time) {
  state.frame += 1;
  ctx.save();
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (shake > 0) {
    ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
    shake *= 0.86;
  }

  drawBackground(time);
  drawCoinRain(time);
  drawFood(time);
  drawSnake(time);
  drawParticles();
  drawFloatingTexts();
  drawAnnouncement();
  ctx.restore();
}

function drawBackground(time) {
  const pulse = Math.sin(time / 520) * 0.08 + 0.14;
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
  gradient.addColorStop(0, "#06100e");
  gradient.addColorStop(0.52, "#0a1f1b");
  gradient.addColorStop(1, "#100c13");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = `rgba(86, 255, 198, ${pulse})`;
  ctx.lineWidth = 1;
  for (let i = 0; i <= gridSize; i += 1) {
    const pos = i * cell;
    ctx.beginPath();
    ctx.moveTo(pos, 0);
    ctx.lineTo(pos, canvas.height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, pos);
    ctx.lineTo(canvas.width, pos);
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(255, 255, 255, 0.08)";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, canvas.width - 10, canvas.height - 10);
}

function roundedCell(x, y, size, radius) {
  const px = x * cell + (cell - size) / 2;
  const py = y * cell + (cell - size) / 2;
  ctx.beginPath();
  ctx.roundRect(px, py, size, size, radius);
}

function drawSnake(time) {
  state.snake.forEach((part, index) => {
    const size = index === 0 ? cell * 0.82 : cell * Math.max(0.55, 0.78 - index * 0.004);
    const alpha = Math.max(0.48, 1 - index / (state.snake.length + 8));
    const shade = index % 2 === 0 ? colors.snakeA : colors.snakeB;
    ctx.shadowBlur = index === 0 ? 24 : 14;
    ctx.shadowColor = shade;
    ctx.fillStyle = index === 0 ? colors.snakeHead : hexToRgba(shade, alpha);
    roundedCell(part.x, part.y, size, 9);
    ctx.fill();
  });

  const head = state.snake[0];
  const eyeOffset = cell * 0.16;
  const centerX = head.x * cell + cell / 2;
  const centerY = head.y * cell + cell / 2;
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#07110f";
  ctx.beginPath();
  ctx.arc(centerX + state.dir.x * eyeOffset - state.dir.y * 5, centerY + state.dir.y * eyeOffset - state.dir.x * 5, 3.8, 0, Math.PI * 2);
  ctx.arc(centerX + state.dir.x * eyeOffset + state.dir.y * 5, centerY + state.dir.y * eyeOffset + state.dir.x * 5, 3.8, 0, Math.PI * 2);
  ctx.fill();
}

function drawFood(time) {
  const food = state.food;
  const isBonus = food.type === "bonus";
  const bob = Math.sin(time / 130) * 2;
  const spin = Math.abs(Math.sin(time / 260));
  const radius = isBonus ? cell * 0.4 : cell * 0.34;
  const squash = 0.62 + spin * 0.38;
  const x = food.x * cell + cell / 2;
  const y = food.y * cell + cell / 2 + bob;
  const gradient = ctx.createRadialGradient(x - radius * 0.25, y - radius * 0.3, radius * 0.1, x, y, radius);
  gradient.addColorStop(0, colors.coinLight);
  gradient.addColorStop(0.48, colors.food);
  gradient.addColorStop(1, colors.coinDark);

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(squash, 1);
  ctx.shadowBlur = isBonus ? 34 : 24;
  ctx.shadowColor = isBonus ? colors.bonus : colors.food;
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = isBonus ? 4 : 3;
  ctx.strokeStyle = isBonus ? colors.bonus : "rgba(255, 255, 255, 0.72)";
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = "rgba(92, 49, 0, 0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, radius * 0.66, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = "#7b4300";
  ctx.font = `900 ${Math.floor(radius * 1.05)}px "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("¥", 0, 1);

  if (isBonus) {
    ctx.strokeStyle = "rgba(255, 95, 143, 0.72)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, radius * 1.22, -Math.PI * 0.25, Math.PI * 1.25);
    ctx.stroke();
  }

  ctx.restore();
}

function drawCoinRain(time) {
  if (state.rushTimer > 0 && state.frame % 3 === 0) {
    createCoinRain(2);
  }
  coinRain = coinRain.filter((coin) => coin.life > 0 && coin.y < canvas.height + 40);
  coinRain.forEach((coin) => {
    coin.y += coin.vy;
    coin.spin += 0.16;
    coin.life -= 1;
    const width = Math.max(4, coin.size * (0.38 + Math.abs(Math.sin(coin.spin)) * 0.62));
    const gradient = ctx.createRadialGradient(coin.x - width * 0.2, coin.y - coin.size * 0.2, 1, coin.x, coin.y, coin.size);
    gradient.addColorStop(0, colors.coinLight);
    gradient.addColorStop(0.52, colors.food);
    gradient.addColorStop(1, colors.coinDark);
    ctx.save();
    ctx.globalAlpha = Math.min(0.9, coin.life / 30);
    ctx.translate(coin.x, coin.y);
    ctx.scale(width / coin.size, 1);
    ctx.shadowBlur = 18;
    ctx.shadowColor = colors.food;
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(0, 0, coin.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawFloatingTexts() {
  floatingTexts = floatingTexts.filter((text) => text.life > 0);
  floatingTexts.forEach((text) => {
    text.y += text.vy;
    text.vy *= 0.98;
    text.life -= 1;
    ctx.save();
    ctx.globalAlpha = Math.min(1, text.life / 18);
    ctx.fillStyle = text.color;
    ctx.shadowBlur = 18;
    ctx.shadowColor = text.color;
    ctx.font = `900 ${text.size}px "Microsoft YaHei", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text.label, text.x, text.y);
    ctx.restore();
  });
}

function drawAnnouncement() {
  if (state.announcementLife <= 0) return;
  const alpha = Math.min(1, state.announcementLife / 10);
  const scale = 1 + Math.sin(state.announcementLife * 0.35) * 0.04;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(canvas.width / 2, canvas.height * 0.28);
  ctx.scale(scale, scale);
  ctx.fillStyle = state.rushTimer > 0 ? colors.coinLight : colors.snakeA;
  ctx.shadowBlur = 28;
  ctx.shadowColor = state.rushTimer > 0 ? colors.food : colors.snakeA;
  ctx.font = '900 52px "Microsoft YaHei", sans-serif';
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(state.announcement, 0, 0);
  ctx.restore();
}

function drawParticles() {
  particles = particles.filter((particle) => particle.life > 0);
  particles.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vx *= 0.96;
    particle.vy *= 0.96;
    particle.life -= 1;
    ctx.globalAlpha = Math.max(0, particle.life / 36);
    ctx.fillStyle = particle.color;
    ctx.shadowBlur = 16;
    ctx.shadowColor = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });
}

function hexToRgba(hex, alpha) {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function loop(time = 0) {
  const delta = Math.min(80, time - lastTime);
  lastTime = time;
  accumulator += delta;

  while (accumulator >= state.stepMs) {
    step();
    accumulator -= state.stepMs;
  }

  draw(time);
  requestAnimationFrame(loop);
}

function startGame() {
  if (!state.alive) {
    resetGame(true);
  } else {
    state.running = true;
    state.paused = false;
    ui.pauseBtn.textContent = "暂停";
    setOverlay(false);
  }
  pulseSound(520, 0.05);
  music.start();
}

ui.primaryAction.addEventListener("click", startGame);
ui.restartBtn.addEventListener("click", () => {
  resetGame(true);
  music.start();
});
ui.musicBtn.addEventListener("click", () => {
  music.setEnabled(!music.enabled);
});
ui.pauseBtn.addEventListener("click", () => {
  if (!state.running || !state.alive) return;
  state.paused = !state.paused;
  ui.pauseBtn.textContent = state.paused ? "继续" : "暂停";
  setOverlay(state.paused, state.paused ? "已暂停" : "");
  music.sync();
});

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const handled = ["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d", " ", "enter"].includes(key);
  if (handled) event.preventDefault();

  if (key === "arrowup" || key === "w") setDirection(0, -1);
  if (key === "arrowdown" || key === "s") setDirection(0, 1);
  if (key === "arrowleft" || key === "a") setDirection(-1, 0);
  if (key === "arrowright" || key === "d") setDirection(1, 0);
  if (key === " " || key === "enter") startGame();
});

canvas.addEventListener("pointerdown", (event) => {
  touchStart = { x: event.clientX, y: event.clientY };
});

canvas.addEventListener("pointerup", (event) => {
  if (!touchStart) return;
  const dx = event.clientX - touchStart.x;
  const dy = event.clientY - touchStart.y;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) {
    startGame();
  } else if (Math.abs(dx) > Math.abs(dy)) {
    setDirection(dx > 0 ? 1 : -1, 0);
  } else {
    setDirection(0, dy > 0 ? 1 : -1);
  }
  touchStart = null;
});

music = createMusicEngine();
resetGame(false);
music.sync();
requestAnimationFrame(loop);
