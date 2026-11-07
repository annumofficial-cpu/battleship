// Tests for the end-of-game summary. Run with: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { countShots, shipsAfloat, gameSummary } from '../js/stats.js';
import { SHIPS, BOARD_SIZE, createBoard, placeShip, placeShipsRandomly, fireAt, allShipsSunk } from '../js/game.js';
import { createAI, chooseShot, recordShot } from '../js/ai.js';

// A fixed fleet: each ship lies across its own row, starting in column 0.
// Carrier row 0, Battleship row 1, Cruiser row 2, Submarine row 3, Destroyer row 4.
function fixedBoard() {
  const board = createBoard();
  SHIPS.forEach((ship, row) => placeShip(board, ship, row, 0, true));
  return board;
}

const shipSquares = (board) => board.ships.flatMap((ship) => ship.cells);

function waterSquares(board, count) {
  const squares = [];
  for (let row = 0; row < BOARD_SIZE && squares.length < count; row++) {
    for (let col = 0; col < BOARD_SIZE && squares.length < count; col++) {
      if (board.grid[row][col] === null) squares.push([row, col]);
    }
  }
  return squares;
}

function sinkShip(board, name) {
  for (const [r, c] of board.ships.find((s) => s.name === name).cells) fireAt(board, r, c);
}

function sinkAll(board) {
  for (const [r, c] of shipSquares(board)) fireAt(board, r, c);
}

describe('counting shots', () => {
  test('a board nobody has fired at: 0 shots, 0 hits, 0% (no dividing by zero)', () => {
    assert.deepEqual(countShots(fixedBoard()), { shots: 0, hits: 0, misses: 0, accuracy: 0 });
  });

  test('counts hits and misses separately', () => {
    const board = fixedBoard();
    fireAt(board, 0, 0); // Carrier
    fireAt(board, 1, 0); // Battleship
    fireAt(board, 9, 9); // water
    assert.deepEqual(countShots(board), { shots: 3, hits: 2, misses: 1, accuracy: 67 });
  });

  test('accuracy is rounded to a whole percentage', () => {
    const board = fixedBoard();
    fireAt(board, 0, 0);
    for (const [r, c] of waterSquares(board, 2)) fireAt(board, r, c);
    assert.equal(countShots(board).accuracy, 33); // 1 in 3 is 33.3%
    for (const [r, c] of waterSquares(board, 6).slice(2)) fireAt(board, r, c);
    assert.equal(countShots(board).accuracy, 14); // 1 in 7 is 14.3%
    fireAt(board, 0, 1);
    assert.equal(countShots(board).accuracy, 25); // 2 in 8
  });

  test('firing at the same square again does not add a shot', () => {
    const board = fixedBoard();
    fireAt(board, 0, 0);
    fireAt(board, 0, 0);
    fireAt(board, 9, 9);
    fireAt(board, 9, 9);
    assert.deepEqual(countShots(board), { shots: 2, hits: 1, misses: 1, accuracy: 50 });
  });

  test('firing at every square: 100 shots, 17 hits, 17%', () => {
    const board = fixedBoard();
    for (let r = 0; r < BOARD_SIZE; r++) for (let c = 0; c < BOARD_SIZE; c++) fireAt(board, r, c);
    assert.deepEqual(countShots(board), { shots: 100, hits: 17, misses: 83, accuracy: 17 });
  });

  test('does not change the board', () => {
    const board = fixedBoard();
    fireAt(board, 0, 0);
    const before = JSON.stringify(board);
    countShots(board);
    shipsAfloat(board);
    assert.equal(JSON.stringify(board), before);
  });
});

describe('ships still afloat', () => {
  test('all five at the start, in fleet order', () => {
    assert.deepEqual(shipsAfloat(fixedBoard()), ['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer']);
  });

  test('a damaged ship still counts as afloat; a sunk one does not', () => {
    const board = fixedBoard();
    fireAt(board, 0, 0); // Carrier damaged
    sinkShip(board, 'Cruiser');
    assert.deepEqual(shipsAfloat(board), ['Carrier', 'Battleship', 'Submarine', 'Destroyer']);
  });

  test('none once every ship is sunk', () => {
    const board = fixedBoard();
    sinkAll(board);
    assert.deepEqual(shipsAfloat(board), []);
  });
});

describe('end-of-game summary', () => {
  test('a perfect game: 17 shots, 17 hits, 100%, and all my ships survive', () => {
    const mine = fixedBoard();
    const enemy = fixedBoard();
    sinkAll(enemy);
    assert.deepEqual(gameSummary(mine, enemy), {
      won: true,
      shots: 17,
      hits: 17,
      misses: 0,
      accuracy: 100,
      survivors: ['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer'],
    });
  });

  test('a game with zero hits: a loss at 0%, and every enemy ship survives', () => {
    const mine = fixedBoard();
    const enemy = fixedBoard();
    for (const [r, c] of waterSquares(enemy, 40)) fireAt(enemy, r, c);
    sinkAll(mine);
    assert.deepEqual(gameSummary(mine, enemy), {
      won: false,
      shots: 40,
      hits: 0,
      misses: 40,
      accuracy: 0,
      survivors: ['Carrier', 'Battleship', 'Cruiser', 'Submarine', 'Destroyer'],
    });
  });

  test('a win lists only my ships still afloat', () => {
    const mine = fixedBoard();
    const enemy = fixedBoard();
    sinkShip(mine, 'Carrier');
    sinkShip(mine, 'Destroyer');
    fireAt(mine, 1, 0); // Battleship damaged but afloat
    for (const [r, c] of waterSquares(enemy, 3)) fireAt(enemy, r, c);
    sinkAll(enemy);
    const summary = gameSummary(mine, enemy);
    assert.equal(summary.won, true);
    assert.deepEqual(summary.survivors, ['Battleship', 'Cruiser', 'Submarine']);
    assert.deepEqual([summary.shots, summary.hits, summary.accuracy], [20, 17, 85]);
  });

  test('a loss lists only the enemy ships still afloat', () => {
    const mine = fixedBoard();
    const enemy = fixedBoard();
    sinkShip(enemy, 'Battleship');
    sinkShip(enemy, 'Submarine');
    fireAt(enemy, 9, 9);
    sinkAll(mine);
    const summary = gameSummary(mine, enemy);
    assert.equal(summary.won, false);
    assert.deepEqual(summary.survivors, ['Carrier', 'Cruiser', 'Destroyer']);
    assert.deepEqual([summary.shots, summary.hits, summary.accuracy], [8, 7, 88]);
  });

  test('refuses to summarise a game that is still going', () => {
    const mine = fixedBoard();
    const enemy = fixedBoard();
    assert.throws(() => gameSummary(mine, enemy), /not over/);
    sinkShip(enemy, 'Carrier');
    assert.throws(() => gameSummary(mine, enemy), /not over/);
  });

  test('matches a real game played out, shot by shot, on random fleets', () => {
    for (let game = 0; game < 200; game++) {
      const mine = placeShipsRandomly();
      const enemy = placeShipsRandomly();
      const me = createAI();
      const computer = createAI();
      let shots = 0;
      let hits = 0;
      for (;;) {
        const [r, c] = chooseShot(me);
        const shot = fireAt(enemy, r, c);
        recordShot(me, r, c, shot);
        shots += 1;
        if (shot.result === 'hit') hits += 1;
        if (shot.allSunk) break;
        const [cr, cc] = chooseShot(computer);
        const reply = fireAt(mine, cr, cc);
        recordShot(computer, cr, cc, reply);
        if (reply.allSunk) break;
      }
      const summary = gameSummary(mine, enemy);
      assert.equal(summary.won, allShipsSunk(enemy));
      assert.equal(summary.shots, shots);
      assert.equal(summary.hits, hits);
      assert.equal(summary.accuracy, Math.round((hits / shots) * 100));
      const loser = summary.won ? mine : enemy;
      assert.ok(summary.survivors.length >= 1);
      assert.deepEqual(summary.survivors, loser.ships.filter((s) => s.hits < s.length).map((s) => s.name));
    }
  });
});
