# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Vanilla JavaScript Tetris. No build step, no dependencies, no package.json. Three files: `index.html` (DOM/canvas structure), `style.css` (dark retro theme), `game.js` (all game logic, ~300 lines).

## Running the game

Open `index.html` directly in a browser, or serve it locally:

```bash
python3 -m http.server 8000
# or
npx serve .
```

There are no build, lint, or test commands — this project has none configured.

## Architecture (`game.js`)

Everything lives in one file with module-level mutable state (`board`, `current`, `next`, `score`, `lines`, `level`, `paused`, `gameOver`, `dropInterval`, etc.) — no classes, no modules.

- **Board model**: `ROWS × COLS` matrix; each cell is `0` (empty) or a color index `1–7` identifying which piece locked there.
- **Pieces**: defined as square matrices in `PIECES`. Rotation is done via `rotateCW` (transpose + reverse), not by storing pre-rotated states.
- **Collision** (`collide`): checks board bounds and overlap with locked cells.
- **Wall kicks** (`tryRotate`): after rotating, tries x-offsets `[0, -1, 1, -2, 2]` until one doesn't collide, else the rotation is discarded.
- **Game loop** (`loop`): driven by `requestAnimationFrame`, accumulates elapsed time in `dropAccum` and drops the piece one row once `dropInterval` is exceeded, otherwise locks it (`lockPiece` → `merge` + `clearLines` + `spawn`).
- **Line clearing** (`clearLines`): scans bottom-up, splices full rows out and unshifts empty rows at the top; re-checks the same row index after a splice (`r++` compensates the loop's `r--`).
- **Scoring**: `LINE_SCORES = [0, 100, 300, 500, 800]` multiplied by `level`; hard drop adds 2 points per row dropped, soft drop 1 point per row.
- **Leveling/speed**: level increments every 10 lines; `dropInterval = max(100, 1000 - (level - 1) * 90)` ms.
- **Ghost piece** (`ghostY`): projects the current piece straight down to its landing row, drawn via `drawBlock` with `alpha = 0.2`.
- **Game over**: detected in `spawn()` when the newly spawned piece immediately collides — triggers `endGame()` and shows the overlay.

Tunable constants at the top of `game.js`: `COLS`, `ROWS`, `BLOCK`, `COLORS`, `PIECES`, `LINE_SCORES`. If `COLS`/`ROWS`/`BLOCK` change, the `<canvas id="board">` width/height in `index.html` must be updated to match (`COLS × BLOCK`, `ROWS × BLOCK`).
