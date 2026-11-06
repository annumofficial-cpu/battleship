// Connects the game rules to the page (drawing boards, handling clicks).
import { BOARD_SIZE, RESULT, placeShipsRandomly, fireAt, isSunk } from './game.js';

const ROW_LABELS = 'ABCDEFGHIJ'.slice(0, BOARD_SIZE).split('');

const playerBoardEl = document.getElementById('player-board');
const enemyBoardEl = document.getElementById('enemy-board');
const enemyFleetEl = document.getElementById('enemy-fleet');
const messageEl = document.getElementById('message');
const newGameButton = document.getElementById('new-game');

let playerBoard;
let enemyBoard;
let gameOver = false;

function squareName(row, col) {
  return `${ROW_LABELS[row]}${col + 1}`;
}

function setMessage(text) {
  messageEl.textContent = text;
}

// Builds the 10x10 grid once per game, with row letters and column numbers.
// `onFire` is given only for the enemy board, which makes its squares buttons.
function buildGrid(boardEl, onFire) {
  boardEl.replaceChildren();
  boardEl.appendChild(document.createElement('span')).className = 'label corner';
  for (let col = 0; col < BOARD_SIZE; col++) {
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = col + 1;
    label.setAttribute('aria-hidden', 'true');
    boardEl.appendChild(label);
  }
  for (let row = 0; row < BOARD_SIZE; row++) {
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = ROW_LABELS[row];
    label.setAttribute('aria-hidden', 'true');
    boardEl.appendChild(label);
    for (let col = 0; col < BOARD_SIZE; col++) {
      const cell = document.createElement(onFire ? 'button' : 'span');
      cell.className = 'cell';
      cell.dataset.row = row;
      cell.dataset.col = col;
      if (onFire) {
        cell.type = 'button';
        cell.addEventListener('click', () => onFire(row, col));
      } else {
        cell.setAttribute('role', 'gridcell');
      }
      boardEl.appendChild(cell);
    }
  }
}

// Updates every square's look and spoken label from the board's current state.
// Elements are reused rather than rebuilt, so keyboard focus stays put.
function refreshGrid(boardEl, board, showShips) {
  for (const cell of boardEl.querySelectorAll('.cell')) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const shipIndex = board.grid[row][col];
    const ship = shipIndex === null ? null : board.ships[shipIndex];
    const fired = board.shots[row][col];

    let symbol = '';
    let state = 'water';
    if (fired && ship) {
      symbol = '✕';
      state = isSunk(ship) ? `hit, ${ship.name} sunk` : 'hit';
    } else if (fired) {
      symbol = '•';
      state = 'miss';
    } else if (ship && showShips) {
      state = ship.name;
    } else if (!showShips) {
      state = 'not fired at';
    }

    cell.textContent = symbol;
    cell.classList.toggle('ship', Boolean(ship && showShips));
    cell.classList.toggle('hit', Boolean(fired && ship));
    cell.classList.toggle('sunk', Boolean(fired && ship && isSunk(ship)));
    cell.classList.toggle('miss', fired && !ship);
    cell.classList.toggle('fired', fired);
    cell.setAttribute('aria-label', `${squareName(row, col)}: ${state}`);
  }
}

function refreshEnemyFleet() {
  enemyFleetEl.replaceChildren(
    ...enemyBoard.ships.map((ship) => {
      const item = document.createElement('li');
      const sunk = isSunk(ship);
      item.className = sunk ? 'sunk' : '';
      item.textContent = `${ship.name} (${ship.length})${sunk ? ' – sunk' : ''}`;
      return item;
    })
  );
}

function handleFire(row, col) {
  const square = squareName(row, col);
  if (gameOver) {
    setMessage('The game is over. Press New Game to play again.');
    return;
  }

  const shot = fireAt(enemyBoard, row, col);
  if (shot.result === RESULT.ALREADY_FIRED) {
    setMessage(`You already fired at ${square}. Pick another square.`);
    return;
  }

  if (shot.result === RESULT.MISS) {
    setMessage(`${square}: miss.`);
  } else if (shot.allSunk) {
    gameOver = true;
    setMessage(`${square}: hit! You sank the ${shot.ship}. All enemy ships are sunk. You win! Press New Game to play again.`);
  } else if (shot.sunk) {
    setMessage(`${square}: hit! You sank the ${shot.ship}.`);
  } else {
    setMessage(`${square}: hit!`);
  }

  refreshGrid(enemyBoardEl, enemyBoard, false);
  refreshEnemyFleet();
  enemyBoardEl.classList.toggle('game-over', gameOver);
}

function newGame() {
  playerBoard = placeShipsRandomly();
  enemyBoard = placeShipsRandomly();
  gameOver = false;
  buildGrid(playerBoardEl);
  buildGrid(enemyBoardEl, handleFire);
  refreshGrid(playerBoardEl, playerBoard, true);
  refreshGrid(enemyBoardEl, enemyBoard, false);
  refreshEnemyFleet();
  enemyBoardEl.classList.remove('game-over');
  setMessage('New game. Click a square on the enemy board to fire.');
}

newGameButton.addEventListener('click', newGame);
newGame();
