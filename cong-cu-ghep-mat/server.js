/**
 * Công cụ ghép khuôn mặt nhân viên vào ấn phẩm mẫu.
 *
 * - Trang nhân viên:  http://<địa-chỉ>/        (tải ảnh chân dung -> nhận ấn phẩm)
 * - Trang quản trị:   http://<địa-chỉ>/admin   (tải ảnh mẫu cố định, lớp chữ, sửa prompt)
 *
 * Ảnh do AI (Google Gemini) tạo. API key chỉ nằm trên server, nhân viên
 * không nhìn thấy. Ảnh chân dung của nhân viên KHÔNG được lưu lại.
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const TEMPLATE_FILE = path.join(DATA_DIR, 'template');
const OVERLAY_FILE = path.join(DATA_DIR, 'overlay.png');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-3.1-flash-image';
// Mật khẩu trang quản trị (người thiết kế mẫu).
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
// Số lượt tạo ảnh tối đa mỗi giờ cho 1 máy/1 mạng — tránh bị dùng tốn tiền API.
const LIMIT_PER_HOUR = Number(process.env.LIMIT_PER_HOUR || 10);
// Chế độ thử: không gọi AI, trả luôn ảnh mẫu (để kiểm tra giao diện).
const MOCK = process.env.MOCK === '1';

fs.mkdirSync(DATA_DIR, { recursive: true });

const DEFAULT_PROMPT = `Image 1 is the template. Image 2 is the user's portrait.
The user's gender is: {{gioi_tinh}} (Nam = male, Nữ = female).

Replace the person in Image 1 with the person from Image 2.

IDENTITY: keep the face, face shape, skin tone, hairstyle and age of Image 2 exactly.

OUTFIT (based on gender):
- If male (Nam): light pink smart-casual men's suit, white t-shirt, straight-leg trousers, white sneakers, masculine tailoring.
- If female (Nữ): elegant pastel pink blazer and matching trousers, soft feminine tailoring, light makeup, white heels or sneakers.
Keep the pastel pink/beige color palette of Image 1.

POSE: same as Image 1 — sitting on the sofa, one hand pointing up, notebook on lap, smiling at camera.

KEEP UNCHANGED: background, sofa, pillows, flowers, table, lighting, all text, checklist, logo, layout, aspect ratio.

Photorealistic, seamless lighting match, no distorted text.`;

const DEFAULT_CONFIG = {
  title: 'Tạo ấn phẩm cá nhân',
  prompt: DEFAULT_PROMPT,
  aspectRatio: '1:1',
  templateType: '',
  hasOverlay: false,
  accessCode: '', // mã nhân viên nhập để dùng công cụ; trống = ai có link cũng dùng được
  version: 0,
  generated: 0,
};

function loadConfig() {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}
let config = loadConfig();
function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// ---------------------------------------------------------------------------
// Đăng nhập quản trị (cookie ký bằng khóa bí mật lưu trong data/)
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

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function isAdmin(req) {
  if (!ADMIN_PASSWORD) return true;
  return safeEqual(parseCookies(req).auth || '', adminToken());
}

function requireAdmin(req, res, next) {
  if (isAdmin(req)) return next();
  res.status(401).json({ error: 'Chưa đăng nhập' });
}

// ---------------------------------------------------------------------------
// Giới hạn lượt tạo ảnh theo IP (trong bộ nhớ)
// ---------------------------------------------------------------------------

const hits = new Map();
function takeQuota(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 3600e3);
  if (list.length >= LIMIT_PER_HOUR) {
    hits.set(ip, list);
    return Math.ceil((3600e3 - (now - list[0])) / 60e3);
  }
  list.push(now);
  hits.set(ip, list);
  return 0;
}

// ---------------------------------------------------------------------------
// Gọi Google Gemini để ghép mặt
// ---------------------------------------------------------------------------

async function generate(templateBuf, templateType, portraitBuf, portraitType, gender) {
  const prompt = config.prompt.replace(/\{\{\s*gioi_tinh\s*\}\}/g, gender);
  const body = {
    contents: [{
      role: 'user',
      parts: [
        { text: 'Image 1 (template):' },
        { inline_data: { mime_type: templateType, data: templateBuf.toString('base64') } },
        { text: "Image 2 (user's portrait):" },
        { inline_data: { mime_type: portraitType, data: portraitBuf.toString('base64') } },
        { text: prompt },
      ],
    }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      imageConfig: { aspectRatio: config.aspectRatio },
    },
  };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180e3),
  });
  const json = await r.json().catch(() => ({}));
  if (!r.ok) {
    const msg = json.error?.message || `HTTP ${r.status}`;
    throw new Error(`Google AI báo lỗi: ${msg}`);
  }
  const cand = json.candidates?.[0];
  const img = cand?.content?.parts?.find((p) => p.inlineData || p.inline_data);
  if (!img) {
    const reason = cand?.finishReason || json.promptFeedback?.blockReason || 'không rõ';
    throw new Error(`AI không trả về ảnh (lý do: ${reason}). Hãy thử ảnh chân dung khác.`);
  }
  const d = img.inlineData || img.inline_data;
  return { data: Buffer.from(d.data, 'base64'), type: d.mimeType || d.mime_type || 'image/png' };
}

// ---------------------------------------------------------------------------
// Web server
// ---------------------------------------------------------------------------

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, IMAGE_TYPES.includes(file.mimetype)),
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', isAdmin(req) ? 'admin.html' : 'login.html'));
});

app.post('/api/login', (req, res) => {
  if (!ADMIN_PASSWORD || safeEqual(req.body?.password || '', ADMIN_PASSWORD)) {
    const secure = req.secure ? '; Secure' : '';
    res.setHeader('Set-Cookie', `auth=${adminToken()}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`);
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'Sai mật khẩu' });
});

app.get('/admin.html', (req, res) => res.redirect('/admin'));
app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

// Thông tin công khai cho trang nhân viên
app.get('/api/info', (req, res) => {
  res.json({
    title: config.title,
    ready: !!config.templateType && (!!GEMINI_API_KEY || MOCK),
    hasTemplate: !!config.templateType,
    hasApiKey: !!GEMINI_API_KEY || MOCK,
    hasOverlay: config.hasOverlay,
    needCode: !!config.accessCode,
    version: config.version,
  });
});

app.get('/template', (req, res) => {
  if (!config.templateType) return res.sendStatus(404);
  res.type(config.templateType).sendFile(TEMPLATE_FILE);
});

app.get('/overlay.png', (req, res) => {
  if (!config.hasOverlay) return res.sendStatus(404);
  res.type('image/png').sendFile(OVERLAY_FILE);
});

app.post('/api/generate', upload.single('portrait'), async (req, res) => {
  if (config.accessCode && !safeEqual((req.body.code || '').trim(), config.accessCode)) {
    return res.status(403).json({ error: 'Mã truy cập không đúng. Hỏi phòng Marketing để lấy mã.' });
  }
  if (!config.templateType) return res.status(503).json({ error: 'Chưa có ảnh mẫu. Liên hệ phòng Marketing.' });
  if (!GEMINI_API_KEY && !MOCK) return res.status(503).json({ error: 'Server chưa cài GEMINI_API_KEY.' });
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn ảnh chân dung (JPG/PNG/WEBP).' });
  const gender = req.body.gender === 'Nam' ? 'Nam' : req.body.gender === 'Nữ' ? 'Nữ' : '';
  if (!gender) return res.status(400).json({ error: 'Chưa chọn giới tính.' });

  const waitMin = takeQuota(req.ip);
  if (waitMin) {
    return res.status(429).json({ error: `Bạn đã tạo quá ${LIMIT_PER_HOUR} ảnh trong 1 giờ. Thử lại sau ${waitMin} phút.` });
  }

  try {
    const template = fs.readFileSync(TEMPLATE_FILE);
    const out = MOCK
      ? { data: template, type: config.templateType }
      : await generate(template, config.templateType, req.file.buffer, req.file.mimetype, gender);
    config.generated++;
    saveConfig();
    res.type(out.type).send(out.data);
  } catch (err) {
    console.error('Lỗi tạo ảnh:', err.message);
    const timeout = err.name === 'TimeoutError' || err.name === 'AbortError';
    res.status(502).json({ error: timeout ? 'AI xử lý quá lâu, vui lòng thử lại.' : err.message });
  }
});

// --- Quản trị ---

app.get('/api/admin/config', requireAdmin, (req, res) => {
  res.json({ ...config, model: GEMINI_MODEL, hasApiKey: !!GEMINI_API_KEY || MOCK, mock: MOCK, limitPerHour: LIMIT_PER_HOUR });
});

app.post('/api/admin/config', requireAdmin, (req, res) => {
  const { title, prompt, accessCode, aspectRatio } = req.body || {};
  if (typeof title === 'string') config.title = title.trim().slice(0, 100) || DEFAULT_CONFIG.title;
  if (typeof prompt === 'string') config.prompt = prompt.trim() || DEFAULT_PROMPT;
  if (typeof accessCode === 'string') config.accessCode = accessCode.trim().slice(0, 50);
  if (typeof aspectRatio === 'string' && RATIOS.includes(aspectRatio)) config.aspectRatio = aspectRatio;
  saveConfig();
  res.json({ ok: true });
});

app.post('/api/admin/reset-prompt', requireAdmin, (req, res) => {
  config.prompt = DEFAULT_PROMPT;
  saveConfig();
  res.json({ ok: true, prompt: DEFAULT_PROMPT });
});

const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

app.post('/api/admin/template', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File phải là JPG/PNG/WEBP, tối đa 15MB.' });
  fs.writeFileSync(TEMPLATE_FILE, req.file.buffer);
  config.templateType = req.file.mimetype;
  if (RATIOS.includes(req.body.aspectRatio)) config.aspectRatio = req.body.aspectRatio;
  config.version++;
  saveConfig();
  res.json({ ok: true });
});

app.post('/api/admin/overlay', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file || req.file.mimetype !== 'image/png') {
    return res.status(400).json({ error: 'Lớp chữ phải là file PNG nền trong suốt.' });
  }
  fs.writeFileSync(OVERLAY_FILE, req.file.buffer);
  config.hasOverlay = true;
  config.version++;
  saveConfig();
  res.json({ ok: true });
});

app.delete('/api/admin/overlay', requireAdmin, (req, res) => {
  fs.rmSync(OVERLAY_FILE, { force: true });
  config.hasOverlay = false;
  config.version++;
  saveConfig();
  res.json({ ok: true });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Ảnh quá lớn (tối đa 15MB).' : err.message });
  }
  next(err);
});

app.listen(PORT, () => {
  console.log(`Trang nhân viên:  http://localhost:${PORT}/`);
  console.log(`Trang quản trị:   http://localhost:${PORT}/admin`);
  if (!GEMINI_API_KEY && !MOCK) console.log('⚠️  Chưa đặt GEMINI_API_KEY — công cụ chưa tạo được ảnh.');
  if (!ADMIN_PASSWORD) console.log('⚠️  Chưa đặt ADMIN_PASSWORD — ai cũng vào được trang quản trị.');
});
