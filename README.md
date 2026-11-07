# Battleship

A browser game of Battleship you play against the computer. Each side has a 10 by 10 board with five ships: Carrier (5 squares), Battleship (4), Cruiser (3), Submarine (3) and Destroyer (2). Ships are placed at random, and New Game reshuffles them. You fire at the enemy board by clicking or tapping a square, and the computer fires back once after each of your shots. Hits show as ✕ and misses as •, so you don't have to rely on colour. Whoever sinks the other fleet first wins. It works on a laptop or a phone. When the game ends, a summary shows your shots fired, hits, accuracy and the ships still afloat. You can also play with only a keyboard (arrow keys to move, Enter or Space to fire), and each square has a label for screen readers, though these labels have not been tested with a real screen reader.

**Play it:** https://annumofficial-cpu.github.io/battleship/

## Run it on your own computer

The game is plain HTML, CSS and JavaScript, so there is nothing to install or build. Because of browser security rules, double-clicking `index.html` won't work. The page has to be served by a small local web server:

1. Download the code: click the green **Code** button on GitHub, then **Download ZIP**, and unzip it. Or run `git clone https://github.com/annumofficial-cpu/battleship.git`.
2. Open a terminal in the `battleship` folder and run `python3 -m http.server 8000`. Python comes with macOS and most Linux systems.
3. Open http://localhost:8000 in your browser.

## Run the tests

The tests use Node.js's built-in test runner, so there are no extra packages. Install Node.js from https://nodejs.org (version 22 works), then run this in the `battleship` folder:

```
npm test
```

The 62 tests take a couple of seconds and check the game rules and the computer opponent.

## The files

- `index.html`: the web page. It loads the styles and the scripts.
- `css/style.css`: how the page looks, including the phone layout.
- `js/game.js`: the game rules (board, ships, random placement, firing, sinking). It has no screen code, so it can be tested on its own.
- `js/ai.js`: the computer opponent. It fires at random until it gets a hit, then aims at the squares next to the hit until that ship sinks. It never fires at the same square twice.
- `js/stats.js`: counts the end-of-game numbers (shots fired, hits, accuracy and ships still afloat). It has no screen code, so it can be tested on its own.
- `js/main.js`: connects the rules and the computer to the page: draws the boards, handles clicks and writes the message line.
- `tests/game.test.js` and `tests/ai.test.js`: the automated tests.
- `package.json`: a small settings file that makes `npm test` run the tests.
- `BUGS.md`: the bugs found and how they were fixed.

## Bugs

See [BUGS.md](BUGS.md) for the bugs found while building the game and how each one was fixed.

## How this was built with Devin

I used Devin's web app for everything, and I wrote and edited no code myself. I started by asking for a plan, then approved it with changes: plain HTML, CSS and JavaScript, random ship placement first, and no easy/hard setting yet, so the first version stayed small. I had Devin build and test the game rules before any screen, then the screen, then the computer opponent. After every step I read Devin's summary and checked the result. Devin planted bugs on purpose in its own code to check that its tests would catch them, so I told it to stop doing that inside the repo, and it confirmed the history was clean. I played the live game on my laptop and my iPhone, and that is how I found the third bug. Devin also corrected a number I had put in the bug document and one of its own tests, after checking the evidence.

What surprised me most was how much time it saved. In a large company, getting even a simple game built, tested, debugged and working on laptops and phones would normally take several people days or weeks of back and forth. I did it alone in a matter of hours. I still made the decisions, checked the results and tested on a real phone, but Devin took on the routine work. That frees developers to spend their time on the harder problems that matter most.
