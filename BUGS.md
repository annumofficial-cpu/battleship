# Battleship: bugs found and how they were fixed

Play it: https://annumofficial-cpu.github.io/battleship/
Code: https://github.com/annumofficial-cpu/battleship

I built this with Devin. I asked for a plan first, then the game rules with tests, then the screen, then the computer opponent. I played the live game on my laptop and my iPhone. 47 automated tests pass. Three real bugs came up.

## 1. Boards stacked on a laptop
- What happened: on a laptop the two boards sat one above the other instead of side by side.
- Cause: the list of enemy ships under the board was wider than the board, so the board was pushed onto a new line.
- Fix: each board's section was made exactly as wide as its board.
- Found by: Devin, testing in a real browser at laptop and phone size.

## 2. The computer forgot hits on a neighbouring ship
- What happened: after the computer sank a ship, it went back to random guessing, even if it had also hit a ship next to it.
- Cause: it cleared its whole list of hits whenever any ship sank.
- Fix: it now keeps hits on ships still afloat and removes only the sunk ship's squares. The game now also tells it which squares a sunk ship covered, which the player already sees on screen.
- How I checked it: 5 new tests, including two ships side by side. I also ran the new tests against the old version in a throwaway copy, and three of them failed, which shows they catch the problem. In 5,000 simulated games the computer now sinks a fleet in about 62 shots, down from nearly 80.
- Found by: Devin reported it as a limitation. I asked for the fix.

## 3. A tapped square stayed dark on a phone
- What happened: on my iPhone, a square I tapped after the game had ended stayed darker blue than the others.
- Cause: the page darkened any square under the pointer. Phones have no hovering pointer, so the last tapped square stayed "hovered".
- Fix: the dark colour now applies only on devices with a real mouse, and is off once the game is over.
- Found by: me, on my phone.

## What I would do next
- Let the player place their own ships by clicking, with a rotate button.
- Add an easy and a hard setting for the computer.
