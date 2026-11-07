// Computer opponent: chooses where to fire.
// Like game.js, this file has no screen code, so it can be tested on its own.
//
// Strategy ("hunt and target"):
//   - Hunt: fire at a random square it has not tried yet.
//   - Target: after a hit, try the squares directly above, below, left and
//     right of it, until the game reports that ship as sunk.
//   - When a ship sinks, any other hits it has made on ships that are still
//     afloat are kept, and it carries on aiming around those. Only when no
//     such hits are left does it go back to hunting.
// It remembers every square it has picked, so it never fires at one twice.
import { BOARD_SIZE, RESULT } from './game.js';

const NEIGHBOURS = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// `random` returns a number in [0, 1), like Math.random; tests pass their own.
export function createAI(random = Math.random, size = BOARD_SIZE) {
  return {
    size,
    random,
    tried: Array.from({ length: size }, () => Array(size).fill(false)),
    hits: [], // hit squares that belong to ships not yet sunk
    targets: [], // squares next to those hits, waiting to be tried
  };
}

function isUntried(ai, row, col) {
  return row >= 0 && col >= 0 && row < ai.size && col < ai.size && !ai.tried[row][col];
}

function untriedSquares(ai) {
  const squares = [];
  for (let row = 0; row < ai.size; row++) {
    for (let col = 0; col < ai.size; col++) {
      if (!ai.tried[row][col]) squares.push([row, col]);
    }
  }
  return squares;
}

// Picks the next square to fire at and remembers it as tried.
export function chooseShot(ai) {
  let square;
  while (ai.targets.length > 0 && !square) {
    const [row, col] = ai.targets.shift();
    if (isUntried(ai, row, col)) square = [row, col];
  }
  if (!square) {
    const options = untriedSquares(ai);
    if (options.length === 0) throw new Error('The computer has no squares left to fire at');
    square = options[Math.min(Math.floor(ai.random() * options.length), options.length - 1)];
  }
  ai.tried[square[0]][square[1]] = true;
  return square;
}

function addNeighbours(ai, row, col) {
  for (const [dr, dc] of NEIGHBOURS) {
    if (isUntried(ai, row + dr, col + dc)) ai.targets.push([row + dr, col + dc]);
  }
}

// Tells the computer what happened to the shot it just fired (the object
// returned by fireAt in game.js), so it can decide where to aim next.
export function recordShot(ai, row, col, shot) {
  if (shot.result !== RESULT.HIT) return;
  ai.hits.push([row, col]);
  if (!shot.sunk) {
    addNeighbours(ai, row, col);
    return;
  }
  const sunk = new Set(shot.sunkCells.map(([r, c]) => `${r},${c}`));
  ai.hits = ai.hits.filter(([r, c]) => !sunk.has(`${r},${c}`));
  ai.targets = [];
  for (const [r, c] of ai.hits) addNeighbours(ai, r, c);
}
