// Game rules: boards, ship placement, firing, win detection.
// This file has no knowledge of the web page, so it can be tested on its own.

export const BOARD_SIZE = 10;

export const SHIPS = Object.freeze([
  Object.freeze({ name: 'Carrier', length: 5 }),
  Object.freeze({ name: 'Battleship', length: 4 }),
  Object.freeze({ name: 'Cruiser', length: 3 }),
  Object.freeze({ name: 'Submarine', length: 3 }),
  Object.freeze({ name: 'Destroyer', length: 2 }),
]);

export const RESULT = Object.freeze({
  HIT: 'hit',
  MISS: 'miss',
  ALREADY_FIRED: 'already-fired',
});

function makeGrid(size, value) {
  return Array.from({ length: size }, () => Array(size).fill(value));
}

export function createBoard(size = BOARD_SIZE) {
  return {
    size,
    grid: makeGrid(size, null), // index into `ships`, or null for water
    shots: makeGrid(size, false), // true once a square has been fired at
    ships: [],
  };
}

export function isOnBoard(board, row, col) {
  return (
    Number.isInteger(row) &&
    Number.isInteger(col) &&
    row >= 0 &&
    col >= 0 &&
    row < board.size &&
    col < board.size
  );
}

function shipCells(length, row, col, horizontal) {
  return Array.from({ length }, (_, i) =>
    horizontal ? [row, col + i] : [row + i, col]
  );
}

export function canPlaceShip(board, length, row, col, horizontal) {
  return shipCells(length, row, col, horizontal).every(
    ([r, c]) => isOnBoard(board, r, c) && board.grid[r][c] === null
  );
}

export function placeShip(board, ship, row, col, horizontal) {
  if (!canPlaceShip(board, ship.length, row, col, horizontal)) {
    throw new Error(`Cannot place ${ship.name} at row ${row}, column ${col}`);
  }
  const index = board.ships.length;
  const cells = shipCells(ship.length, row, col, horizontal);
  for (const [r, c] of cells) board.grid[r][c] = index;
  board.ships.push({ name: ship.name, length: ship.length, cells, hits: 0 });
  return board.ships[index];
}

function validPlacements(board, length) {
  const options = [];
  for (const horizontal of [true, false]) {
    for (let row = 0; row < board.size; row++) {
      for (let col = 0; col < board.size; col++) {
        if (canPlaceShip(board, length, row, col, horizontal)) {
          options.push({ row, col, horizontal });
        }
      }
    }
  }
  return options;
}

// `random` returns a number in [0, 1), like Math.random; tests pass their own.
// Picking from the list of legal spots (instead of guessing until one fits)
// guarantees placement always finishes and never overlaps or leaves the board.
export function placeShipsRandomly(random = Math.random, ships = SHIPS, size = BOARD_SIZE) {
  const board = createBoard(size);
  for (const ship of ships) {
    const options = validPlacements(board, ship.length);
    if (options.length === 0) {
      throw new Error(`No room left to place ${ship.name}`);
    }
    const pick = options[Math.min(Math.floor(random() * options.length), options.length - 1)];
    placeShip(board, ship, pick.row, pick.col, pick.horizontal);
  }
  return board;
}

export function isSunk(ship) {
  return ship.hits >= ship.length;
}

export function allShipsSunk(board) {
  return board.ships.length > 0 && board.ships.every(isSunk);
}

export function fireAt(board, row, col) {
  if (!isOnBoard(board, row, col)) {
    throw new RangeError(`Square row ${row}, column ${col} is not on the board`);
  }
  if (board.shots[row][col]) {
    return { result: RESULT.ALREADY_FIRED };
  }
  board.shots[row][col] = true;

  const index = board.grid[row][col];
  if (index === null) {
    return { result: RESULT.MISS };
  }

  const ship = board.ships[index];
  ship.hits += 1;
  const sunk = isSunk(ship);
  const shot = {
    result: RESULT.HIT,
    ship: ship.name,
    sunk,
    allSunk: allShipsSunk(board),
  };
  // Once a ship sinks, its squares are no longer secret (the screen shows them).
  if (sunk) shot.sunkCells = ship.cells.map(([r, c]) => [r, c]);
  return shot;
}
