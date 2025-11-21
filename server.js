const express = require('express');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());

// --- Serve static files (FIX Cannot GET /) ---
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// --- DB functions ---
const DB_PATH = "./db.json";

function readDB() {
  try {
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
  } catch (e) {
    return { game_scores: [] };
  }
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// --- API: Submit Score ---
app.post('/api/game/submit', (req, res) => {
  const { name, score, game } = req.body;

  if (typeof score === 'undefined') {
    return res.status(400).json({ error: 'score required' });
  }

  const db = readDB();

  db.game_scores.push({
    id: uuidv4(),
    name: name || 'Player',
    score: Number(score),
    game: game || 'number',
    t: Date.now()
  });

  // Sort & keep top 200
  db.game_scores.sort((a, b) => b.score - a.score || a.t - b.t);
  db.game_scores = db.game_scores.slice(0, 200);

  writeDB(db);
  io.emit('leaderboard:update');

  res.json({ ok: true });
});

// --- API: Get Leaderboard ---
app.get('/api/game/leaderboard', (req, res) => {
  const db = readDB();
  const game = req.query.game || null;

  let list = db.game_scores || [];

  if (game) {
    list = list.filter(x => (x.game || 'number') === game);
  }

  res.json(list.slice(0, 20));
});

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log("Client connected:", socket.id);
});

// --- Start Server ---
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
