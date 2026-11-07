// Connects the game rules to the page (drawing boards, handling clicks).
import { BOARD_SIZE, RESULT, placeShipsRandomly, fireAt, isSunk } from './game.js';
import { createAI, chooseShot, recordShot } from './ai.js';
import { gameSummary } from './stats.js';

const ROW_LABELS = 'ABCDEFGHIJ'.slice(0, BOARD_SIZE).split('');
const ANIMATIONS = ['anim-miss', 'anim-hit', 'anim-sunk'];

const playerBoardEl = document.getElementById('player-board');
const enemyBoardEl = document.getElementById('enemy-board');
const enemyFleetEl = document.getElementById('enemy-fleet');
const playerFleetEl = document.getElementById('player-fleet');
const messageEl = document.getElementById('message');
const newGameButton = document.getElementById('new-game');
const summaryEl = document.getElementById('summary');
const playAgainButton = document.getElementById('play-again');
const ARROW_STEPS = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };

let playerBoard;
let enemyBoard;
let computer;
let gameOver = false;

function squareName(row, col) {
  return `${ROW_LABELS[row]}${col + 1}`;
}

let messageVersion = 0;

// The message line is a live region, so screen readers read each new message.
// A repeated message is cleared first so that it is read out again.
function setMessage(text) {
  const version = ++messageVersion;
  if (messageEl.textContent !== text) {
    messageEl.textContent = text;
    return;
  }
  messageEl.textContent = '';
  setTimeout(() => {
    if (version === messageVersion) messageEl.textContent = text;
  }, 100);
}

function enemyCell(row, col) {
  return enemyBoardEl.querySelector(`.cell[data-row="${row}"][data-col="${col}"]`);
}

// Only one enemy square is in the Tab order at a time; the arrow keys move it.
function makeCurrent(cell) {
  for (const other of enemyBoardEl.querySelectorAll('button.cell[tabindex="0"]')) other.tabIndex = -1;
  cell.tabIndex = 0;
}

function handleArrowKey(event) {
  const step = ARROW_STEPS[event.key];
  const cell = event.target.closest('button.cell');
  if (!step || !cell) return;
  event.preventDefault();
  const clamp = (n) => Math.min(Math.max(n, 0), BOARD_SIZE - 1);
  const next = enemyCell(clamp(Number(cell.dataset.row) + step[0]), clamp(Number(cell.dataset.col) + step[1]));
  makeCurrent(next);
  next.focus();
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
        cell.tabIndex = row === 0 && col === 0 ? 0 : -1;
        cell.addEventListener('click', () => {
          makeCurrent(cell);
          onFire(row, col);
        });
        cell.addEventListener('focus', () => makeCurrent(cell));
      } else {
        cell.setAttribute('role', 'img');
      }
      boardEl.appendChild(cell);
    }
  }
}

// Updates every square's look and spoken label from the board's current state.
// Elements are reused rather than rebuilt, so keyboard focus stays put.
// Labels read like "Enemy board, B3, miss" or "Your board, F5, Cruiser, hit".
function refreshGrid(boardEl, board, showShips) {
  const boardName = showShips ? 'Your board' : 'Enemy board';
  for (const cell of boardEl.querySelectorAll('.cell')) {
    const row = Number(cell.dataset.row);
    const col = Number(cell.dataset.col);
    const shipIndex = board.grid[row][col];
    const ship = shipIndex === null ? null : board.ships[shipIndex];
    const fired = board.shots[row][col];

    let symbol = '';
    let state = showShips ? 'water' : 'not fired';
    if (fired && ship) {
      symbol = '✕';
      const sunk = isSunk(ship);
      if (showShips) state = `${ship.name}, ${sunk ? 'sunk' : 'hit'}`;
      else state = sunk ? `hit, ${ship.name} sunk` : 'hit';
    } else if (fired) {
      symbol = '•';
      state = 'miss';
    } else if (ship && showShips) {
      state = ship.name;
    }

    cell.textContent = symbol;
    cell.classList.toggle('ship', Boolean(ship && showShips));
    cell.classList.toggle('hit', Boolean(fired && ship));
    cell.classList.toggle('sunk', Boolean(fired && ship && isSunk(ship)));
    cell.classList.toggle('miss', fired && !ship);
    cell.classList.toggle('fired', fired);
    cell.setAttribute('aria-label', `${boardName}, ${squareName(row, col)}, ${state}`);
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

function showSummary() {
  const summary = gameSummary(playerBoard, enemyBoard);
  document.getElementById('summary-title').textContent = summary.won ? 'You win!' : 'You lose';
  document.getElementById('stat-shots').textContent = summary.shots;
  document.getElementById('stat-hits').textContent = summary.hits;
  document.getElementById('stat-accuracy').textContent = `${summary.accuracy}%`;
  document.getElementById('survivors-label').textContent = summary.won
    ? 'Your ships still afloat:'
    : 'Enemy ships still afloat:';
  document.getElementById('survivors').textContent = summary.survivors.join(', ') || 'none';
  summaryEl.classList.toggle('lost', !summary.won);
  summaryEl.hidden = false;
  summaryEl.scrollIntoView({ block: 'nearest' });
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
  if (gameOver) showSummary();
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
  summaryEl.hidden = true;
  refreshAll();
  setMessage('New game. Click a square on the enemy board to fire.');
}

newGameButton.addEventListener('click', newGame);
// The Play Again button disappears once pressed, so keyboard focus moves to the enemy board.
playAgainButton.addEventListener('click', () => {
  newGame();
  enemyCell(0, 0).focus();
});
enemyBoardEl.addEventListener('keydown', handleArrowKey);
newGame();
