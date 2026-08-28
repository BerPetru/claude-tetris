'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#78909c', // Nut - steel gray
  '#616161', // power-up block - neutral gray (overdrawn with its own color)
  '#f5f5f5', // wildcard - pearl white
  '#f06292', // Plus pentomino - pink
  '#a1887f', // U pentomino - brown
  '#7986cb', // Y pentomino - indigo
  '#fff176', // Single (post-Tetris reward) - bright gold
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[8,8,8],[8,0,8],[8,8,8]],                  // Nut (tuerca)
  null,                                        // 9  POWERUP - shape generated in randomPiece()
  null,                                        // 10 WILD - board-only cell, never spawned
  [[0,11,0],[11,11,11],[0,11,0]],             // 11 Plus pentomino
  [[12,0,12],[12,12,12]],                     // 12 U pentomino
  [[0,13],[13,13],[0,13],[0,13]],             // 13 Y pentomino
  [[14]],                                     // 14 Single (post-Tetris reward)
];

const NUT = 8;
const POWERUP = 9;   // cell value while the power-up block is in flight; never merged onto the board
const WILD = 10;     // wildcard cell created by the Tinte power-up; lives on the board
const PLUS = 11;
const U_PIECE = 12;
const Y_PIECE = 13;
const SINGLE_PIECE = 14; // 1x1 reward piece, granted after a Tetris; never part of the random draw

// Weighted spawn table for randomPiece(). SINGLE_PIECE is deliberately absent —
// it's only ever granted as a post-Tetris reward, never drawn at random.
const SPAWN_WEIGHTS = [
  [1, 10], [2, 10], [3, 10], [4, 10], [5, 10], [6, 10], [7, 10], // tetrominoes
  [NUT, 3],                                                       // Nut (rare challenge piece)
  [PLUS, 2], [U_PIECE, 2], [Y_PIECE, 2],                          // pentominoes
];
const SPAWN_TOTAL = SPAWN_WEIGHTS.reduce((sum, [, w]) => sum + w, 0);

const POWERUP_LINES = 3;   // a power-up charges after this many cleared lines...
const POWERUP_PIECES = 12; // ...or this many placed pieces, whichever comes first
const FREEZE_MS = 5000;

const POWERUPS = {
  bomb:    { icon: '💣', color: '#ef5350', label: 'BOMBA' },
  bolt:    { icon: '⚡', color: '#ffee58', label: 'RAYO' },
  dye:     { icon: '🎨', color: '#ab47bc', label: 'TINTE' },
  gravity: { icon: '⬇',  color: '#26a69a', label: 'GRAVEDAD' },
  freeze:  { icon: '❄',  color: '#4fc3f7', label: 'CONGELAR' },
};
const POWER_KEYS = Object.keys(POWERUPS);

const LINE_SCORES = [0, 100, 300, 500, 800];

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const themeSwitch = document.getElementById('theme-switch');
const powerNextEl = document.getElementById('power-next');
const powerActiveEl = document.getElementById('power-active');
const powerLegendEl = document.getElementById('power-legend');
const pauseMenu = document.getElementById('pause-menu');
const resumeBtn = document.getElementById('resume-btn');
const restartPauseBtn = document.getElementById('restart-pause-btn');
const controlsToggleBtn = document.getElementById('controls-toggle-btn');
const pauseControlsEl = document.getElementById('pause-controls');
const startLevelSelect = document.getElementById('start-level-select');

const THEME_KEY = 'tetris-theme';
const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 15;

function getGridColor() {
  return getComputedStyle(document.body).getPropertyValue('--grid-line').trim();
}

function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  themeSwitch.checked = theme === 'light';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  localStorage.setItem(THEME_KEY, theme);
  applyTheme(theme);
});

initTheme();

function getStartLevel() {
  const saved = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
  return saved >= 1 && saved <= MAX_START_LEVEL ? saved : 1;
}

function initStartLevelSelect() {
  for (let lvl = 1; lvl <= MAX_START_LEVEL; lvl++) {
    const opt = document.createElement('option');
    opt.value = lvl;
    opt.textContent = lvl;
    startLevelSelect.appendChild(opt);
  }
  startLevelSelect.value = getStartLevel();
}

startLevelSelect.addEventListener('change', () => {
  localStorage.setItem(START_LEVEL_KEY, startLevelSelect.value);
});

initStartLevelSelect();

let board, current, next, score, lines, level, startLevel, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let powerUpPending, singlePending, linesToPower, piecesToPower, freezeLeft, activePower;

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function makePiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function weightedType() {
  let roll = Math.random() * SPAWN_TOTAL;
  for (const [type, weight] of SPAWN_WEIGHTS) {
    if (roll < weight) return type;
    roll -= weight;
  }
  return SPAWN_WEIGHTS[SPAWN_WEIGHTS.length - 1][0]; // fallback for float rounding
}

function randomPiece() {
  if (powerUpPending) {
    powerUpPending = false;
    const power = POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
    return { type: POWERUP, power, shape: [[POWERUP]], x: Math.floor(COLS / 2), y: 0 };
  }
  if (singlePending) {
    singlePending = false;
    return makePiece(SINGLE_PIECE);
  }
  return makePiece(weightedType());
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearFullRows() {
  let cleared = 0;
  let wildHit = false;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      if (board[r].some(v => v === WILD)) wildHit = true;
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  return { cleared, wildHit };
}

function purgeWild() {
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === WILD) board[r][c] = 0;
}

function applyGravity() {
  for (let c = 0; c < COLS; c++) {
    const stack = [];
    for (let r = 0; r < ROWS; r++) {
      if (board[r][c]) stack.push(board[r][c]);
    }
    for (let r = ROWS - 1; r >= 0; r--) {
      board[r][c] = stack.length ? stack.pop() : 0;
    }
  }
}

function dropIntervalForLevel(lvl) {
  return Math.max(100, 1000 - (lvl - 1) * 90);
}

function resolveBoard() {
  let total = 0;
  let tetris = false;
  while (true) {
    const { cleared, wildHit } = clearFullRows();
    if (!cleared) break;
    total += cleared;
    if (cleared >= 4) tetris = true;
    score += (LINE_SCORES[Math.min(cleared, 4)] || 0) * level;
    if (!wildHit) break; // a plain splice can't create new full rows on its own
    purgeWild();
    applyGravity();
  }
  if (total) {
    lines += total;
    level = startLevel + Math.floor(lines / 10);
    dropInterval = dropIntervalForLevel(level);
  }
  return { total, tetris };
}

// Charges the power-up meter along both axes at once and resets them together
// as soon as either threshold is met — whichever comes first.
function chargePowerUp(clearedLines, placedPieces) {
  linesToPower -= clearedLines;
  piecesToPower -= placedPieces;
  if (linesToPower <= 0 || piecesToPower <= 0) {
    powerUpPending = true;
    linesToPower = POWERUP_LINES;
    piecesToPower = POWERUP_PIECES;
  }
}

function inBounds(r, c) {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

function blastArea(cx, cy) {
  let destroyed = 0;
  for (let r = cy - 1; r <= cy + 1; r++)
    for (let c = cx - 1; c <= cx + 1; c++)
      if (inBounds(r, c) && board[r][c]) { board[r][c] = 0; destroyed++; }
  score += destroyed * 10 * level;
}

function blastCross(cx, cy) {
  let destroyed = 0;
  for (let c = 0; c < COLS; c++)
    if (inBounds(cy, c) && board[cy][c]) { board[cy][c] = 0; destroyed++; }
  for (let r = 0; r < ROWS; r++)
    if (inBounds(r, cx) && board[r][cx]) { board[r][cx] = 0; destroyed++; }
  score += destroyed * 10 * level;
}

function isPieceCell(v) {
  return v >= 1 && v <= COLORS.length - 1 && v !== POWERUP && v !== WILD;
}

function dyeWildcards() {
  const counts = new Array(COLORS.length).fill(0);
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      const v = board[r][c];
      if (isPieceCell(v)) counts[v]++;
    }
  let bestColor = 0, bestCount = 0;
  for (let v = 1; v < COLORS.length; v++) {
    if (isPieceCell(v) && counts[v] > bestCount) { bestCount = counts[v]; bestColor = v; }
  }
  if (!bestColor) return;
  let turned = 0;
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      if (board[r][c] === bestColor) { board[r][c] = WILD; turned++; }
  score += turned * 5 * level;
}

function applyPowerUp(power, cx, cy) {
  switch (power) {
    case 'bomb': blastArea(cx, cy); break;
    case 'bolt': blastCross(cx, cy); break;
    case 'dye': dyeWildcards(); break;
    case 'gravity': applyGravity(); break;
    case 'freeze': freezeLeft = FREEZE_MS; break;
  }
  activePower = power;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  const wasPower = Boolean(current.power);
  if (wasPower) {
    applyPowerUp(current.power, current.x, current.y);
  } else {
    merge();
  }
  const { total: cleared, tetris } = resolveBoard();
  if (tetris) singlePending = true;
  chargePowerUp(cleared, wasPower ? 0 : 1);
  updateHUD();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
  powerNextEl.textContent = `${linesToPower}L · ${piecesToPower}P`;
  if (activePower) {
    const info = POWERUPS[activePower];
    const suffix = activePower === 'freeze' && freezeLeft > 0
      ? ` (${Math.ceil(freezeLeft / 1000)}s)`
      : '';
    powerActiveEl.textContent = `${info.icon} ${info.label}${suffix}`;
    powerActiveEl.classList.remove('hidden');
  } else {
    powerActiveEl.classList.add('hidden');
  }
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawNutHole(context, x, y, size, alpha) {
  context.globalAlpha = alpha ?? 1;
  context.strokeStyle = COLORS[NUT];
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x * size + size / 2, y * size + size / 2, size * 0.32, 0, Math.PI * 2);
  context.stroke();
  context.globalAlpha = 1;
}

function drawPowerBlock(context, x, y, size, power, alpha) {
  const info = POWERUPS[power];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = info.color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  context.fillStyle = 'rgba(255,255,255,0.12)';
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.font = `${size * 0.6}px serif`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(info.icon, x * size + size / 2, y * size + size / 2 + 1);
  context.globalAlpha = 1;
}

function drawWildMark(context, x, y, size) {
  context.strokeStyle = 'rgba(0,0,0,0.5)';
  context.lineWidth = 2;
  const cx = x * size + size / 2;
  const cy = y * size + size / 2;
  const s = size * 0.22;
  context.beginPath();
  context.moveTo(cx - s, cy - s);
  context.lineTo(cx + s, cy + s);
  context.moveTo(cx + s, cy - s);
  context.lineTo(cx - s, cy + s);
  context.stroke();
}

// Draws a piece (or the next-preview shape) uniformly, including its Nut hole
// or power-up icon overlay, at grid offset (px, py) using cell size `size`.
function drawPiece(context, piece, px, py, size, alpha) {
  const { shape } = piece;
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      const v = shape[r][c];
      if (!v) continue;
      if (v === POWERUP) drawPowerBlock(context, px + c, py + r, size, piece.power, alpha);
      else drawBlock(context, px + c, py + r, v, size, alpha);
    }
  }
  if (piece.type === NUT) drawNutHole(context, px + 1, py + 1, size, alpha);
}

function drawGrid() {
  ctx.strokeStyle = getGridColor();
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++) {
      drawBlock(ctx, c, r, board[r][c], BLOCK);
      if (board[r][c] === WILD) drawWildMark(ctx, c, r, BLOCK);
    }

  // ghost
  const gy = ghostY();
  drawPiece(ctx, current, current.x, gy, BLOCK, 0.2);

  // current piece
  drawPiece(ctx, current, current.x, current.y, BLOCK);

  // freeze overlay
  if (freezeLeft > 0) {
    ctx.fillStyle = 'rgba(79, 195, 247, 0.18)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = 'rgba(79, 195, 247, 0.9)';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`CONGELADO ${Math.ceil(freezeLeft / 1000)}s`, canvas.width / 2, 16);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  drawPiece(nextCtx, next, offX, offY, NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  animId = null;
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    pauseMenu.classList.add('hidden');
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    pauseMenu.classList.remove('hidden');
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  if (freezeLeft > 0) {
    freezeLeft = Math.max(0, freezeLeft - dt);
    dropAccum = 0;
    if (freezeLeft === 0) activePower = null;
    updateHUD();
  } else {
    dropAccum += dt;
    if (dropAccum >= dropInterval) {
      dropAccum = 0;
      if (!collide(current.shape, current.x, current.y + 1)) {
        current.y++;
      } else {
        lockPiece();
      }
    }
  }
  draw();
  if (gameOver || paused) return;
  animId = requestAnimationFrame(loop);
}

function buildPowerLegend() {
  const items = POWER_KEYS.map(key => `<li>${POWERUPS[key].icon} ${POWERUPS[key].label}</li>`);
  items.push('<li class="power-legend-hint">L = líneas · P = piezas</li>');
  powerLegendEl.innerHTML = items.join('');
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  startLevel = getStartLevel();
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = dropIntervalForLevel(level);
  dropAccum = 0;
  lastTime = performance.now();
  powerUpPending = false;
  singlePending = false;
  linesToPower = POWERUP_LINES;
  piecesToPower = POWERUP_PIECES;
  freezeLeft = 0;
  activePower = null;
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  pauseMenu.classList.add('hidden');
  pauseControlsEl.classList.add('hidden');
  controlsToggleBtn.setAttribute('aria-expanded', 'false');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP' || e.code === 'Escape') {
    if (gameOver) return;
    if (e.code === 'Escape' && e.target === startLevelSelect) return;
    e.preventDefault();
    togglePause();
    return;
  }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);

resumeBtn.addEventListener('click', () => {
  if (paused) togglePause();
});

restartPauseBtn.addEventListener('click', init);

controlsToggleBtn.addEventListener('click', () => {
  const isHidden = pauseControlsEl.classList.toggle('hidden');
  controlsToggleBtn.setAttribute('aria-expanded', String(!isHidden));
});

buildPowerLegend();
init();
