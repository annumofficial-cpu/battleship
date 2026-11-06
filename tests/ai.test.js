// Tests for the computer opponent. Run with: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAI, chooseShot, recordShot } from '../js/ai.js';
import { RESULT, SHIPS, createBoard, placeShip, placeShipsRandomly, fireAt, allShipsSunk } from '../js/game.js';

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

const key = ([r, c]) => `${r},${c}`;
const isNextTo = ([r1, c1], [r2, c2]) => Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;

// The computer takes one turn against `board`: choose, fire, learn.
function takeTurn(ai, board) {
  const [row, col] = chooseShot(ai);
  const shot = fireAt(board, row, col);
  recordShot(ai, row, col, shot);
  return { square: [row, col], shot };
}

describe('computer: choosing squares', () => {
  test('always picks a real square on the board', () => {
    const ai = createAI(seededRandom(1));
    for (let i = 0; i < 100; i++) {
      const [r, c] = chooseShot(ai);
      assert.ok(Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < 10 && c >= 0 && c < 10);
    }
  });

  test('never picks the same square twice, across all 100 squares (500 games)', () => {
    for (let seed = 0; seed < 500; seed++) {
      const ai = createAI(seededRandom(seed));
      const board = placeShipsRandomly(seededRandom(seed + 10000));
      const seen = new Set();
      for (let i = 0; i < 100; i++) {
        const { square, shot } = takeTurn(ai, board);
        assert.notEqual(shot.result, RESULT.ALREADY_FIRED, `repeat at ${key(square)} (seed ${seed})`);
        assert.ok(!seen.has(key(square)));
        seen.add(key(square));
      }
      assert.equal(seen.size, 100);
    }
  });

  test('gives a clear error once every square has been tried', () => {
    const ai = createAI(seededRandom(3));
    for (let i = 0; i < 100; i++) chooseShot(ai);
    assert.throws(() => chooseShot(ai), /no squares left/);
  });

  test('still works when the random number is always the lowest or highest possible', () => {
    for (const fixed of [0, 0.9999999999]) {
      const ai = createAI(() => fixed);
      const seen = new Set();
      for (let i = 0; i < 100; i++) seen.add(key(chooseShot(ai)));
      assert.equal(seen.size, 100);
    }
  });

  test('random shots spread across the whole board', () => {
    const firsts = new Set();
    const random = seededRandom(42);
    for (let i = 0; i < 2000; i++) firsts.add(key(chooseShot(createAI(random))));
    assert.ok(firsts.size > 90, `first shots only covered ${firsts.size} squares`);
  });
});

describe('computer: after a hit', () => {
  test('a miss does not change where it aims', () => {
    const ai = createAI(seededRandom(4));
    recordShot(ai, 4, 4, { result: RESULT.MISS });
    assert.deepEqual(ai.targets, []);
  });

  test('next shot is directly next to the hit', () => {
    for (let seed = 0; seed < 50; seed++) {
      const ai = createAI(seededRandom(seed));
      ai.tried[4][4] = true;
      recordShot(ai, 4, 4, { result: RESULT.HIT, ship: 'Cruiser', sunk: false });
      assert.ok(isNextTo(chooseShot(ai), [4, 4]));
    }
  });

  test('a hit in a corner only aims at squares that are on the board', () => {
    const ai = createAI(seededRandom(5));
    ai.tried[0][0] = true;
    recordShot(ai, 0, 0, { result: RESULT.HIT, ship: 'Destroyer', sunk: false });
    const picks = [chooseShot(ai), chooseShot(ai)].map(key).sort();
    assert.deepEqual(picks, ['0,1', '1,0']);
  });

  test('skips neighbours it has already tried', () => {
    const ai = createAI(seededRandom(6));
    for (const [r, c] of [[5, 5], [4, 5], [6, 5], [5, 4]]) ai.tried[r][c] = true;
    recordShot(ai, 5, 5, { result: RESULT.HIT, ship: 'Cruiser', sunk: false });
    assert.deepEqual(chooseShot(ai), [5, 6]);
  });

  test('keeps aiming around hits until the ship sinks, then goes back to random', () => {
    for (const horizontal of [true, false]) {
      const board = createBoard();
      placeShip(board, SHIPS[1], 3, 3, horizontal); // Battleship, 4 long
      const ai = createAI(seededRandom(7));
      ai.tried[3][3] = true;
      const hits = [[3, 3]];
      recordShot(ai, 3, 3, fireAt(board, 3, 3));

      let sunk = false;
      let shots = 0;
      while (!sunk) {
        const { square, shot } = takeTurn(ai, board);
        shots++;
        assert.ok(hits.some((h) => isNextTo(square, h)), `${key(square)} is not next to an earlier hit`);
        if (shot.result === RESULT.HIT) hits.push(square);
        sunk = Boolean(shot.sunk);
        assert.ok(shots <= 12, 'took too long to sink a ship it had already found');
      }
      assert.equal(hits.length, 4);
      assert.deepEqual(ai.targets, [], 'should forget old targets once the ship sinks');
    }
  });
});

describe('computer: whole games', () => {
  // Two computers play each other until one fleet is gone.
  function playGame(seed) {
    const boards = [placeShipsRandomly(seededRandom(seed)), placeShipsRandomly(seededRandom(seed + 1))];
    const ais = [createAI(seededRandom(seed + 2)), createAI(seededRandom(seed + 3))];
    const seen = [new Set(), new Set()];
    for (let turn = 0; turn < 200; turn++) {
      const me = turn % 2;
      const enemyBoard = boards[1 - me];
      const { square, shot } = takeTurn(ais[me], enemyBoard);
      assert.notEqual(shot.result, RESULT.ALREADY_FIRED);
      assert.ok(!seen[me].has(key(square)), `computer ${me} repeated ${key(square)}`);
      seen[me].add(key(square));
      if (shot.allSunk) {
        assert.ok(allShipsSunk(enemyBoard));
        assert.ok(!allShipsSunk(boards[me]), 'the winner still has ships');
        return { winner: me, shots: seen[me].size };
      }
    }
    return null;
  }

  test('computer vs computer always ends with a winner (1,000 games)', () => {
    const wins = [0, 0];
    for (let seed = 0; seed < 1000; seed++) {
      const result = playGame(seed * 7);
      assert.ok(result, `game ${seed} never ended`);
      assert.ok(result.shots >= 17 && result.shots <= 100);
      wins[result.winner]++;
    }
    assert.ok(wins[0] > 0 && wins[1] > 0, 'both sides should win some games');
  });

  test('with the real Math.random, it always sinks a whole fleet within 100 shots', () => {
    for (let i = 0; i < 200; i++) {
      const board = placeShipsRandomly();
      const ai = createAI();
      let shots = 0;
      while (!allShipsSunk(board)) {
        takeTurn(ai, board);
        shots++;
        assert.ok(shots <= 100);
      }
    }
  });

  test('aiming after hits makes it clearly better than pure random guessing', () => {
    let total = 0;
    const games = 300;
    for (let seed = 0; seed < games; seed++) {
      const board = placeShipsRandomly(seededRandom(seed));
      const ai = createAI(seededRandom(seed + 500));
      let shots = 0;
      while (!allShipsSunk(board)) {
        takeTurn(ai, board);
        shots++;
      }
      total += shots;
    }
    const average = total / games;
    // Pure random guessing needs about 96 shots on average to sink everything.
    assert.ok(average < 80, `average ${average.toFixed(1)} shots is not much better than random`);
  });
});
