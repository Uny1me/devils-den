# Devil's Den

A Devil's Plan-style game night for friends playing remotely. Someone creates a room, picks one or more games with a difficulty and length for each, and everyone plays on their own phone or laptop.

The design lives in [docs/blueprint.html](docs/blueprint.html). Open it in a browser.

## Run it

```bash
npm install
npm run dev      # http://localhost:3000, restarts when server files change
npm test
```

Open the page in two or more tabs to try it with several players.

## Layout

```
server/
  index.js      web server + WebSocket messages
  room.js       rooms: codes, players, host, playlist, start
  engine.js     the night: intro, rounds, standings, final; points and pieces
  games/        one module per game (cube-count.js)
shared/         used by both server and browser
  settings.js   room limits, game catalog, difficulty tables, looks
  character.js  player character drawing
public/         the browser app (home, lobby, game screens; games/ has per-game drawing)
test/           room logic and end-to-end server tests
docs/           blueprint
phase2-den/     early draft of The Den (phase 2). Not wired up and never run.
```

## Progress

- [x] G1: rooms and setup (create/join with a code, looks, host picks games, difficulty, rounds)
- [x] G2: night engine (intro → rounds → standings → final) + Cube Count
- [ ] G3: Memory Poker
- [ ] G4: scores, pieces, podium
- [ ] G5: online playtest
