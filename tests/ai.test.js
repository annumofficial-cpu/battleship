// Tests for the computer opponent. Run with: npm test
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createAI, chooseShot, recordShot } from '../js/ai.js';
import { RESULT, SHIPS, createBoard, placeShip, placeShipsRandomly, fireAt, allShipsSunk, isSunk } from '../js/game.js';

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

describe('computer: remembering other hits after a sink', () => {
  test('two ships side by side: after sinking one, it goes back to the other', () => {
    const board = createBoard();
    placeShip(board, SHIPS[4], 4, 3, true); // Destroyer: 4,3 4,4
    placeShip(board, SHIPS[2], 5, 3, true); // Cruiser right below: 5,3 5,4 5,5
    const ai = createAI(seededRandom(8));
    // Shots the computer has already made: Destroyer hit, then the Cruiser
    // below it hit, then the Destroyer sunk.
    for (const [r, c] of [[4, 3], [5, 3], [4, 4]]) {
      ai.tried[r][c] = true;
      recordShot(ai, r, c, fireAt(board, r, c));
    }
    assert.ok(isSunk(board.ships[0]) && !isSunk(board.ships[1]));
    assert.deepEqual(ai.hits, [[5, 3]], 'should still remember the Cruiser hit');

    const next = chooseShot(ai);
    assert.ok(['6,3', '5,2', '5,4'].includes(key(next)), `aimed at ${key(next)}, not next to 5,3`);
    recordShot(ai, next[0], next[1], fireAt(board, next[0], next[1]));

    let shots = 1;
    while (!isSunk(board.ships[1])) {
      const { square } = takeTurn(ai, board);
      assert.ok(ai.tried[square[0]][square[1]]);
      assert.ok(board.ships[1].cells.concat([[6, 3], [5, 2], [6, 4], [6, 5], [5, 6], [4, 5], [3, 3], [3, 4], [4, 2]])
        .some((cell) => isNextTo(square, cell) || key(square) === key(cell)), `wandered off to ${key(square)}`);
      assert.ok(++shots <= 6, 'took too long to finish the Cruiser');
    }
    assert.deepEqual(ai.hits, [], 'nothing left to chase');
    assert.deepEqual(ai.targets, []);
  });

  test('two ships end to end in the same row: after sinking one, it finishes the other', () => {
    const board = createBoard();
    placeShip(board, SHIPS[4], 2, 2, true); // Destroyer: 2,2 2,3
    placeShip(board, SHIPS[3], 2, 4, true); // Submarine right after it: 2,4 2,5 2,6
    const ai = createAI(seededRandom(9));
    // Destroyer hit, Submarine hit, then Destroyer sunk.
    for (const [r, c] of [[2, 3], [2, 4], [2, 2]]) {
      ai.tried[r][c] = true;
      recordShot(ai, r, c, fireAt(board, r, c));
    }
    assert.deepEqual(ai.hits, [[2, 4]]);
    let shots = 0;
    while (!isSunk(board.ships[1])) {
      takeTurn(ai, board);
      assert.ok(++shots <= 6, 'should finish the Submarine without going back to random guessing');
    }
  });

  test('a sink with no other hits outstanding goes straight back to random', () => {
    const ai = createAI(seededRandom(10));
    ai.tried[1][1] = ai.tried[1][2] = true;
    recordShot(ai, 1, 1, { result: RESULT.HIT, ship: 'Destroyer', sunk: false });
    recordShot(ai, 1, 2, { result: RESULT.HIT, ship: 'Destroyer', sunk: true, sunkCells: [[1, 1], [1, 2]] });
    assert.deepEqual(ai.hits, []);
    assert.deepEqual(ai.targets, []);
  });

  test('never goes back to random while a hit ship is still afloat (1,000 games)', () => {
    let leftoverCases = 0;
    for (let seed = 0; seed < 1000; seed++) {
      const board = placeShipsRandomly(seededRandom(seed * 3 + 1));
      const ai = createAI(seededRandom(seed * 3 + 2));
      while (!allShipsSunk(board)) {
        const woundedCells = board.ships
          .filter((ship) => ship.hits > 0 && !isSunk(ship))
          .flatMap((ship) => ship.cells.filter(([r, c]) => board.shots[r][c]));
        const { square, shot } = takeTurn(ai, board);
        if (woundedCells.length > 0) {
          assert.ok(
            woundedCells.some((cell) => isNextTo(square, cell)),
            `game ${seed}: fired at ${key(square)} while a hit ship was still afloat`
          );
        }
        if (shot.sunk && !shot.allSunk && board.ships.some((s) => s.hits > 0 && !isSunk(s))) leftoverCases++;
      }
    }
    assert.ok(leftoverCases > 50, `only ${leftoverCases} games had hits left over after a sink`);
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
