/**
 * Server trung tâm điều khiển trình chiếu đa màn hình.
 *
 * - Trang quản trị:  http://<ip-máy-tính>:3000/
 * - Trang trình chiếu (mở trên từng màn hình): http://<ip-máy-tính>:3000/screen/<id>
 *
 * Server giữ kết nối WebSocket với từng màn hình để đẩy playlist / lệnh
 * điều khiển ngay lập tức, không cần chép file bằng USB.
 */
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const multer = require('multer');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Đặt biến môi trường ADMIN_PASSWORD để bật đăng nhập cho trang quản trị.
// BẮT BUỘC đặt khi chạy server trên Internet; trong mạng LAN nhà/cửa hàng
// có thể bỏ trống để dùng không cần mật khẩu.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';

fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ---------------------------------------------------------------------------
// Đăng nhập trang quản trị (cookie ký bằng khóa bí mật lưu trong data/)
// ---------------------------------------------------------------------------

const SECRET_FILE = path.join(DATA_DIR, '.secret');
let secret;
try {
  secret = fs.readFileSync(SECRET_FILE, 'utf8').trim();
  if (!secret) throw new Error('trống');
} catch {
  secret = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret);
}

function adminToken() {
  return crypto.createHmac('sha256', secret).update(`admin:${ADMIN_PASSWORD}`).digest('hex');
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function isAdmin(req) {
  if (!ADMIN_PASSWORD) return true;
  const token = parseCookies(req).auth || '';
  const expected = adminToken();
  return token.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Chưa đăng nhập' });
}

// ---------------------------------------------------------------------------
// Cơ sở dữ liệu (file JSON đơn giản)
// ---------------------------------------------------------------------------

const DEFAULT_DB = {
  screens: [
    { id: 's1', name: 'LCD 1 - Dọc (1080x1920)', fit: 'contain', rotate: 0, imageDuration: 10, muted: true, playlist: [] },
    { id: 's2', name: 'LCD 2 - Ngang (1920x1080)', fit: 'contain', rotate: 0, imageDuration: 10, muted: true, playlist: [] },
    { id: 's3', name: 'TV 1 (1920x1080)', fit: 'contain', rotate: 0, imageDuration: 10, muted: true, playlist: [] },
    { id: 's4', name: 'TV 2 (1920x1080)', fit: 'contain', rotate: 0, imageDuration: 10, muted: true, playlist: [] },
  ],
  media: [],
};

function loadDb() {
  try {
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!Array.isArray(db.screens) || !Array.isArray(db.media)) throw new Error('db hỏng');
    return db;
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_DB));
  }
}

const db = loadDb();

let saveTimer = null;
function saveDb() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.writeFile(DB_FILE, JSON.stringify(db, null, 2), (err) => {
      if (err) console.error('Không ghi được db.json:', err.message);
    });
  }, 200);
}

function findScreen(id) {
  return db.screens.find((s) => s.id === id);
}

// ---------------------------------------------------------------------------
// Upload file media
// ---------------------------------------------------------------------------

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 4 * 1024 * 1024 * 1024 }, // 4 GB / file
  fileFilter(req, file, cb) {
    const ok = /^(video|image)\//.test(file.mimetype);
    cb(ok ? null : new Error('Chỉ nhận file video hoặc ảnh'), ok);
  },
});

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------

const app = express();
app.use(express.json());

// Trang quản trị yêu cầu đăng nhập (khi có đặt ADMIN_PASSWORD)
app.get(['/', '/index.html'], (req, res, next) => {
  if (!isAdmin(req)) return res.sendFile(path.join(__dirname, 'public', 'login.html'));
  next();
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  if (!ADMIN_PASSWORD || password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Sai mật khẩu' });
  }
  res.setHeader('Set-Cookie',
    `auth=${adminToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${90 * 24 * 3600}`);
  res.json({ ok: true });
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/media', express.static(UPLOAD_DIR));

app.get('/screen/:id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'player.html'));
});

// Link rút gọn để gõ trên TV cho nhanh: /s1 -> /screen/s1
app.get(/^\/(s\d+)$/, (req, res) => {
  res.redirect(`/screen/${req.params[0]}`);
});

function lanAddresses() {
  const out = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) out.push(iface.address);
    }
  }
  return out;
}

function publicState() {
  return {
    screens: db.screens.map((s) => ({
      ...s,
      online: playersOf(s.id).size > 0,
      nowPlaying: (playerStatus.get(s.id) || {}).nowPlaying || null,
      cache: (playerStatus.get(s.id) || {}).cache || null,
    })),
    media: db.media,
    addresses: lanAddresses(),
    port: PORT,
  };
}

app.get('/api/state', requireAdmin, (req, res) => res.json(publicState()));

// Cập nhật cấu hình / playlist của một màn hình
app.post('/api/screens/:id', requireAdmin, (req, res) => {
  const screen = findScreen(req.params.id);
  if (!screen) return res.status(404).json({ error: 'Không tìm thấy màn hình' });

  const { name, fit, rotate, imageDuration, muted, playlist } = req.body;
  if (typeof name === 'string' && name.trim()) screen.name = name.trim();
  if (['contain', 'cover', 'fill'].includes(fit)) screen.fit = fit;
  if ([0, 90, 180, 270].includes(rotate)) screen.rotate = rotate;
  if (Number.isFinite(imageDuration) && imageDuration >= 1) screen.imageDuration = Math.round(imageDuration);
  if (typeof muted === 'boolean') screen.muted = muted;
  if (Array.isArray(playlist)) {
    screen.playlist = playlist.filter((id) => db.media.some((m) => m.id === id));
  }

  saveDb();
  pushConfig(screen.id);
  broadcastState();
  res.json({ ok: true });
});

// Gửi lệnh điều khiển tới màn hình: play | pause | stop | next | prev | reload | playNow
app.post('/api/screens/:id/command', requireAdmin, (req, res) => {
  const screen = findScreen(req.params.id);
  if (!screen) return res.status(404).json({ error: 'Không tìm thấy màn hình' });

  const { action, mediaId } = req.body || {};
  const allowed = ['play', 'pause', 'stop', 'next', 'prev', 'reload', 'playNow'];
  if (!allowed.includes(action)) return res.status(400).json({ error: 'Lệnh không hợp lệ' });

  const msg = { type: 'command', action };
  if (action === 'playNow') {
    const media = db.media.find((m) => m.id === mediaId);
    if (!media) return res.status(404).json({ error: 'Không tìm thấy nội dung' });
    msg.media = media;
  }
  sendToPlayers(screen.id, msg);
  res.json({ ok: true, delivered: playersOf(screen.id).size });
});

app.post('/api/media', requireAdmin, upload.array('files', 20), (req, res) => {
  const added = (req.files || []).map((f) => ({
    id: path.parse(f.filename).name,
    name: Buffer.from(f.originalname, 'latin1').toString('utf8'),
    type: f.mimetype.startsWith('video/') ? 'video' : 'image',
    mime: f.mimetype,
    url: `/media/${f.filename}`,
    size: f.size,
    uploadedAt: new Date().toISOString(),
  }));
  db.media.push(...added);
  saveDb();
  broadcastState();
  res.json({ ok: true, added });
});

app.delete('/api/media/:id', requireAdmin, (req, res) => {
  const idx = db.media.findIndex((m) => m.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Không tìm thấy nội dung' });

  const [media] = db.media.splice(idx, 1);
  fs.unlink(path.join(UPLOAD_DIR, path.basename(media.url)), () => {});

  for (const screen of db.screens) {
    const before = screen.playlist.length;
    screen.playlist = screen.playlist.filter((id) => id !== media.id);
    if (screen.playlist.length !== before) pushConfig(screen.id);
  }

  saveDb();
  broadcastState();
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(400).json({ error: err.message });
});

// ---------------------------------------------------------------------------
// WebSocket: kết nối thời gian thực với màn hình và trang quản trị
// ---------------------------------------------------------------------------

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const admins = new Set();
const players = new Map(); // screenId -> Set<ws>
const playerStatus = new Map(); // screenId -> { nowPlaying, cache }

function playersOf(screenId) {
  if (!players.has(screenId)) players.set(screenId, new Set());
  return players.get(screenId);
}

function send(ws, msg) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function sendToPlayers(screenId, msg) {
  for (const ws of playersOf(screenId)) send(ws, msg);
}

function broadcastState() {
  const msg = { type: 'state', state: publicState() };
  for (const ws of admins) send(ws, msg);
}

function pushConfig(screenId) {
  const screen = findScreen(screenId);
  if (!screen) return;
  const playlist = screen.playlist
    .map((id) => db.media.find((m) => m.id === id))
    .filter(Boolean);
  sendToPlayers(screenId, { type: 'config', screen, playlist });
}

wss.on('connection', (ws, req) => {
  ws.isAlive = true;
  ws.isAdminAuthed = isAdmin(req);
  ws.on('pong', () => { ws.isAlive = true; });

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'hello') {
      if (msg.role === 'player' && findScreen(msg.screenId)) {
        ws.role = 'player';
        ws.screenId = msg.screenId;
        playersOf(msg.screenId).add(ws);
        pushConfig(msg.screenId);
        broadcastState();
      } else if (msg.role === 'admin') {
        if (!ws.isAdminAuthed) {
          send(ws, { type: 'error', error: 'auth' });
          ws.close();
          return;
        }
        ws.role = 'admin';
        admins.add(ws);
        send(ws, { type: 'state', state: publicState() });
      }
      return;
    }

    if (msg.type === 'status' && ws.role === 'player') {
      playerStatus.set(ws.screenId, {
        nowPlaying: msg.nowPlaying || null,
        cache: msg.cache || null,
      });
      broadcastState();
    }
  });

  ws.on('close', () => {
    if (ws.role === 'admin') admins.delete(ws);
    if (ws.role === 'player') {
      playersOf(ws.screenId).delete(ws);
      if (playersOf(ws.screenId).size === 0) playerStatus.delete(ws.screenId);
      broadcastState();
    }
  });
});

// Phát hiện kết nối chết để cập nhật trạng thái online/offline
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 10000);

server.listen(PORT, () => {
  console.log('================================================');
  console.log('  Phần mềm chiếu LCD - Server đã khởi động');
  console.log('================================================');
  console.log(`  Trang quản trị:   http://localhost:${PORT}/`);
  for (const addr of lanAddresses()) {
    console.log(`  Trong mạng LAN:   http://${addr}:${PORT}/`);
  }
  console.log('');
  console.log('  Mở trên từng màn hình:');
  for (const s of db.screens) {
    console.log(`    ${s.name}: http://<ip-máy-này>:${PORT}/screen/${s.id}`);
  }
  console.log('================================================');
});
