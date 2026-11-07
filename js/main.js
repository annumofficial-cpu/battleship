// Connects the game rules to the page (drawing boards, handling clicks).
import { BOARD_SIZE, RESULT, placeShipsRandomly, fireAt, isSunk } from './game.js';
import { createAI, chooseShot, recordShot } from './ai.js';

const ROW_LABELS = 'ABCDEFGHIJ'.slice(0, BOARD_SIZE).split('');
const ANIMATIONS = ['anim-miss', 'anim-hit', 'anim-sunk'];

const playerBoardEl = document.getElementById('player-board');
const enemyBoardEl = document.getElementById('enemy-board');
const enemyFleetEl = document.getElementById('enemy-fleet');
const playerFleetEl = document.getElementById('player-fleet');
const messageEl = document.getElementById('message');
const newGameButton = document.getElementById('new-game');

let playerBoard;
let enemyBoard;
let computer;
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
      cell.addEventListener('animationend', () => cell.classList.remove(...ANIMATIONS));
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

function refreshFleet(listEl, board) {
  listEl.replaceChildren(
    ...board.ships.map((ship) => {
      const item = document.createElement('li');
      const sunk = isSunk(ship);
      item.className = sunk ? 'sunk' : '';
      item.textContent = `${ship.name} (${ship.length})${sunk ? ' – sunk' : ''}`;
      return item;
    })
  );
}

function refreshAll() {
  refreshGrid(playerBoardEl, playerBoard, true);
  refreshGrid(enemyBoardEl, enemyBoard, false);
  refreshFleet(playerFleetEl, playerBoard);
  refreshFleet(enemyFleetEl, enemyBoard);
  enemyBoardEl.classList.toggle('game-over', gameOver);
}

// Plays a short effect on the square just fired at, or on every square of a ship
// that just sank. The CSS switches the effects off for people who reduce motion.
function animateShot(boardEl, row, col, shot) {
  const name = shot.sunk ? 'anim-sunk' : shot.result === RESULT.HIT ? 'anim-hit' : 'anim-miss';
  const squares = shot.sunk ? shot.sunkCells : [[row, col]];
  for (const [r, c] of squares) {
    const cell = boardEl.querySelector(`.cell[data-row="${r}"][data-col="${c}"]`);
    cell.classList.remove(...ANIMATIONS);
    cell.classList.add(name);
  }
}

function describeShot(shooter, square, shot, owner) {
  if (shot.result === RESULT.MISS) return `${shooter} at ${square}: miss.`;
  const sunk = shot.sunk ? ` ${owner === 'your' ? 'It sank your' : 'You sank the'} ${shot.ship}.` : '';
  return `${shooter} at ${square}: hit!${sunk}`;
}

function computerTurn() {
  const [row, col] = chooseShot(computer);
  const shot = fireAt(playerBoard, row, col);
  recordShot(computer, row, col, shot);
  let text = describeShot('Computer fires', squareName(row, col), shot, 'your');
  if (shot.allSunk) {
    gameOver = true;
    text += ' All your ships are sunk. You lose. Press New Game to play again.';
  }
  return { text, row, col, shot };
}

function handleFire(row, col) {
  if (gameOver) {
    setMessage('The game is over. Press New Game to play again.');
    return;
  }

  const square = squareName(row, col);
  const shot = fireAt(enemyBoard, row, col);
  if (shot.result === RESULT.ALREADY_FIRED) {
    setMessage(`You already fired at ${square}. Pick another square.`);
    return;
  }

  let text = describeShot('You fire', square, shot, 'enemy');
  let reply = null;
  if (shot.allSunk) {
    gameOver = true;
    text += ' All enemy ships are sunk. You win! Press New Game to play again.';
  } else {
    reply = computerTurn();
    text += ' ' + reply.text;
  }

  setMessage(text);
  refreshAll();
  animateShot(enemyBoardEl, row, col, shot);
  if (reply) animateShot(playerBoardEl, reply.row, reply.col, reply.shot);
}

function newGame() {
  playerBoard = placeShipsRandomly();
  enemyBoard = placeShipsRandomly();
  computer = createAI();
  gameOver = false;
  buildGrid(playerBoardEl);
  buildGrid(enemyBoardEl, handleFire);
  refreshAll();
  setMessage('New game. Click a square on the enemy board to fire.');
}

newGameButton.addEventListener('click', newGame);
newGame();
