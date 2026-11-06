// Tests for the game rules. Run with: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  BOARD_SIZE,
  SHIPS,
  RESULT,
  createBoard,
  isOnBoard,
  canPlaceShip,
  placeShip,
  placeShipsRandomly,
  isSunk,
  allShipsSunk,
  fireAt,
} from '../js/game.js';

// Repeatable "random" numbers so a failing run can be reproduced exactly.
function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TOTAL_SHIP_SQUARES = SHIPS.reduce((sum, s) => sum + s.length, 0);

function assertValidFleet(board) {
  assert.equal(board.ships.length, SHIPS.length);
  const seen = new Set();
  board.ships.forEach((ship, index) => {
    assert.equal(ship.cells.length, ship.length, `${ship.name} has wrong size`);
    for (const [r, c] of ship.cells) {
      assert.ok(isOnBoard(board, r, c), `${ship.name} is off the board at ${r},${c}`);
      const key = `${r},${c}`;
      assert.ok(!seen.has(key), `ships overlap at ${key}`);
      seen.add(key);
      assert.equal(board.grid[r][c], index);
    }
    const rows = new Set(ship.cells.map(([r]) => r));
    const cols = new Set(ship.cells.map(([, c]) => c));
    assert.ok(rows.size === 1 || cols.size === 1, `${ship.name} is not in a straight line`);
    const line = rows.size === 1 ? ship.cells.map(([, c]) => c) : ship.cells.map(([r]) => r);
    line.sort((x, y) => x - y);
    for (let i = 1; i < line.length; i++) {
      assert.equal(line[i], line[i - 1] + 1, `${ship.name} has a gap`);
    }
  });
  const occupied = board.grid.flat().filter((v) => v !== null).length;
  assert.equal(occupied, TOTAL_SHIP_SQUARES, 'grid has stray ship squares');
}

describe('board', () => {
  test('is 10 by 10, all water, nothing fired at', () => {
    const board = createBoard();
    assert.equal(BOARD_SIZE, 10);
    assert.equal(board.grid.length, 10);
    assert.equal(board.shots.length, 10);
    for (let r = 0; r < 10; r++) {
      assert.equal(board.grid[r].length, 10);
      assert.ok(board.grid[r].every((v) => v === null));
      assert.ok(board.shots[r].every((v) => v === false));
    }
    assert.deepEqual(board.ships, []);
  });

  test('rows are independent (changing one square does not change others)', () => {
    const board = createBoard();
    board.grid[0][0] = 0;
    assert.equal(board.grid[1][0], null);
  });

  test('knows which squares are on the board', () => {
    const board = createBoard();
    assert.ok(isOnBoard(board, 0, 0));
    assert.ok(isOnBoard(board, 9, 9));
    assert.ok(isOnBoard(board, 0, 9));
    assert.ok(isOnBoard(board, 9, 0));
    for (const [r, c] of [[-1, 0], [0, -1], [10, 0], [0, 10], [1.5, 0], [0, '3'], [NaN, 0], [undefined, 0]]) {
      assert.ok(!isOnBoard(board, r, c), `${r},${c} should be off the board`);
    }
  });
});

describe('ships', () => {
  test('are the five standard ships with the right sizes', () => {
    assert.deepEqual(
      SHIPS.map((s) => [s.name, s.length]),
      [['Carrier', 5], ['Battleship', 4], ['Cruiser', 3], ['Submarine', 3], ['Destroyer', 2]]
    );
    assert.equal(TOTAL_SHIP_SQUARES, 17);
  });

  test('ship list cannot be changed by accident', () => {
    assert.ok(Object.isFrozen(SHIPS));
    assert.ok(Object.isFrozen(SHIPS[0]));
  });
});

describe('placing a ship', () => {
  test('fits exactly against the right and bottom edges', () => {
    const board = createBoard();
    assert.ok(canPlaceShip(board, 5, 0, 5, true)); // columns 5-9
    assert.ok(canPlaceShip(board, 5, 5, 0, false)); // rows 5-9
  });

  test('is refused if it would hang off any edge', () => {
    const board = createBoard();
    assert.ok(!canPlaceShip(board, 5, 0, 6, true)); // would need column 10
    assert.ok(!canPlaceShip(board, 5, 6, 0, false)); // would need row 10
    assert.ok(!canPlaceShip(board, 2, -1, 0, false));
    assert.ok(!canPlaceShip(board, 2, 0, -1, true));
  });

  test('is refused if it would overlap another ship', () => {
    const board = createBoard();
    placeShip(board, SHIPS[0], 4, 2, true); // row 4, columns 2-6
    assert.ok(!canPlaceShip(board, 3, 2, 4, false)); // crosses at 4,4
    assert.ok(!canPlaceShip(board, 2, 4, 6, true)); // shares end square 4,6
  });

  test('is allowed right next to another ship (touching is not overlapping)', () => {
    const board = createBoard();
    placeShip(board, SHIPS[0], 4, 2, true);
    assert.ok(canPlaceShip(board, 4, 5, 2, true)); // row directly below
    assert.ok(canPlaceShip(board, 2, 4, 7, true)); // directly after its end
  });

  test('records the squares it covers', () => {
    const board = createBoard();
    const ship = placeShip(board, SHIPS[4], 2, 3, false);
    assert.deepEqual(ship.cells, [[2, 3], [3, 3]]);
    assert.equal(board.grid[2][3], 0);
    assert.equal(board.grid[3][3], 0);
    assert.equal(ship.hits, 0);
  });

  test('throws and leaves the board unchanged when the spot is illegal', () => {
    const board = createBoard();
    placeShip(board, SHIPS[0], 0, 0, true);
    const before = JSON.stringify(board);
    assert.throws(() => placeShip(board, SHIPS[1], 0, 3, true));
    assert.throws(() => placeShip(board, SHIPS[1], 0, 8, true));
    assert.equal(JSON.stringify(board), before);
  });
});

describe('random placement', () => {
  test('places all five ships, in range, with no overlaps (2,000 random boards)', () => {
    const random = seededRandom(12345);
    for (let i = 0; i < 2000; i++) {
      assertValidFleet(placeShipsRandomly(random));
    }
  });

  test('works with the real Math.random too', () => {
    for (let i = 0; i < 200; i++) assertValidFleet(placeShipsRandomly());
  });

  test('still works when the random number is always the lowest or highest possible', () => {
    assertValidFleet(placeShipsRandomly(() => 0));
    assertValidFleet(placeShipsRandomly(() => 0.9999999999));
  });

  test('uses both directions and reaches every edge of the board', () => {
    const random = seededRandom(7);
    let horizontal = 0;
    let vertical = 0;
    const touched = new Set();
    for (let i = 0; i < 500; i++) {
      for (const ship of placeShipsRandomly(random).ships) {
        const [[r0], [r1]] = ship.cells;
        if (r0 === r1) horizontal++;
        else vertical++;
        for (const [r, c] of ship.cells) touched.add(`${r},${c}`);
      }
    }
    assert.ok(horizontal > 0 && vertical > 0);
    for (const corner of ['0,0', '0,9', '9,0', '9,9']) assert.ok(touched.has(corner));
  });

  test('gives different layouts on different games', () => {
    const random = seededRandom(99);
    const layouts = new Set();
    for (let i = 0; i < 20; i++) layouts.add(JSON.stringify(placeShipsRandomly(random).grid));
    assert.ok(layouts.size > 1);
  });

  test('reports a clear error instead of looping forever if ships cannot fit', () => {
    assert.throws(() => placeShipsRandomly(Math.random, [{ name: 'Huge', length: 11 }]), /No room/);
  });
});

describe('firing', () => {
  function boardWithDestroyer() {
    const board = createBoard();
    placeShip(board, SHIPS[4], 0, 0, true); // squares 0,0 and 0,1
    return board;
  }

  test('at empty water is a miss', () => {
    const board = boardWithDestroyer();
    assert.deepEqual(fireAt(board, 5, 5), { result: RESULT.MISS });
    assert.equal(board.shots[5][5], true);
  });

  test('at a ship is a hit and names the ship', () => {
    const board = boardWithDestroyer();
    const shot = fireAt(board, 0, 0);
    assert.equal(shot.result, RESULT.HIT);
    assert.equal(shot.ship, 'Destroyer');
    assert.equal(shot.sunk, false);
    assert.equal(board.ships[0].hits, 1);
  });

  test('at a square already missed reports already-fired', () => {
    const board = boardWithDestroyer();
    fireAt(board, 5, 5);
    assert.deepEqual(fireAt(board, 5, 5), { result: RESULT.ALREADY_FIRED });
  });

  test('at a square already hit reports already-fired and does not count a second hit', () => {
    const board = boardWithDestroyer();
    fireAt(board, 0, 0);
    assert.deepEqual(fireAt(board, 0, 0), { result: RESULT.ALREADY_FIRED });
    assert.equal(board.ships[0].hits, 1);
    assert.equal(isSunk(board.ships[0]), false);
  });

  test('works on all four corners', () => {
    const board = createBoard();
    for (const [r, c] of [[0, 0], [0, 9], [9, 0], [9, 9]]) {
      assert.equal(fireAt(board, r, c).result, RESULT.MISS);
    }
  });

  test('off the board or at a nonsense square is rejected', () => {
    const board = boardWithDestroyer();
    for (const [r, c] of [[-1, 0], [0, -1], [10, 0], [0, 10], [2.5, 1], ['1', 1], [null, 0]]) {
      assert.throws(() => fireAt(board, r, c), RangeError, `${r},${c} should be rejected`);
    }
    assert.ok(board.shots.flat().every((v) => v === false), 'bad shots must not mark the board');
  });
});

describe('sinking', () => {
  test('a ship is sunk only once every one of its squares is hit', () => {
    const board = createBoard();
    placeShip(board, SHIPS[2], 3, 3, false); // Cruiser: 3,3 4,3 5,3
    assert.equal(fireAt(board, 3, 3).sunk, false);
    assert.equal(fireAt(board, 5, 3).sunk, false);
    const last = fireAt(board, 4, 3);
    assert.equal(last.sunk, true);
    assert.equal(last.ship, 'Cruiser');
    assert.equal(isSunk(board.ships[0]), true);
  });

  test('hitting one ship does not sink a different ship next to it', () => {
    const board = createBoard();
    placeShip(board, SHIPS[4], 0, 0, true); // Destroyer 0,0-0,1
    placeShip(board, SHIPS[3], 1, 0, true); // Submarine 1,0-1,2
    fireAt(board, 0, 0);
    fireAt(board, 0, 1);
    assert.equal(isSunk(board.ships[0]), true);
    assert.equal(isSunk(board.ships[1]), false);
  });

  test('the game is over only when the last ship sinks', () => {
    const board = placeShipsRandomly(seededRandom(2024));
    const allCells = board.ships.flatMap((s) => s.cells);
    allCells.forEach(([r, c], i) => {
      const shot = fireAt(board, r, c);
      assert.equal(shot.result, RESULT.HIT);
      assert.equal(shot.allSunk, i === allCells.length - 1);
    });
    assert.equal(allShipsSunk(board), true);
  });

  test('misses never end the game', () => {
    const board = placeShipsRandomly(seededRandom(5));
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        if (board.grid[r][c] === null) fireAt(board, r, c);
      }
    }
    assert.equal(allShipsSunk(board), false);
    assert.ok(board.ships.every((s) => s.hits === 0));
  });

  test('firing at every square sinks everything with exactly 17 hits and 83 misses', () => {
    const board = placeShipsRandomly(seededRandom(31));
    let hits = 0;
    let misses = 0;
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        const { result } = fireAt(board, r, c);
        if (result === RESULT.HIT) hits++;
        if (result === RESULT.MISS) misses++;
      }
    }
    assert.equal(hits, 17);
    assert.equal(misses, 83);
    assert.equal(allShipsSunk(board), true);
  });

  test('an empty board (no ships yet) is not counted as "all sunk"', () => {
    assert.equal(allShipsSunk(createBoard()), false);
  });
});
