// End-of-game numbers: shots, hits, accuracy and ships still afloat.
// Like game.js, this has no knowledge of the web page, so it can be tested on its own.
import { allShipsSunk, isSunk } from './game.js';

// Counts the shots fired at `board` and how many of them hit a ship.
export function countShots(board) {
  let shots = 0;
  let hits = 0;
  for (let row = 0; row < board.size; row++) {
    for (let col = 0; col < board.size; col++) {
      if (!board.shots[row][col]) continue;
      shots += 1;
      if (board.grid[row][col] !== null) hits += 1;
    }
  }
  const accuracy = shots === 0 ? 0 : Math.round((hits / shots) * 100);
  return { shots, hits, misses: shots - hits, accuracy };
}

// Names of the ships on `board` that have not been sunk, in fleet order.
export function shipsAfloat(board) {
  return board.ships.filter((ship) => !isSunk(ship)).map((ship) => ship.name);
}

// The player's summary once the game is over. The player fires at `enemyBoard`.
// On a win it lists the player's surviving ships; on a loss, the enemy's.
export function gameSummary(playerBoard, enemyBoard) {
  const won = allShipsSunk(enemyBoard);
  if (!won && !allShipsSunk(playerBoard)) {
    throw new Error('The game is not over yet');
  }
  return {
    won,
    ...countShots(enemyBoard),
    survivors: shipsAfloat(won ? playerBoard : enemyBoard),
  };
}
