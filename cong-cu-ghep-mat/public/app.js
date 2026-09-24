// Trang nhân viên: chọn ảnh chân dung -> gửi lên server -> nhận ảnh AI
// -> đè lớp chữ/logo gốc (nếu có) -> cho tải về.
const $ = (id) => document.getElementById(id);
let info = null;
let portraitBlob = null;
let resultUrl = null;

function showMsg(text, type = 'err') {
  $('msg').textContent = text;
  $('msg').className = `msg show ${type}`;
}
function hideMsg() { $('msg').className = 'msg'; }

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Không đọc được ảnh'));
    img.src = src;
  });
}

// Thu nhỏ ảnh chân dung (ảnh điện thoại thường 5–10MB) cho gửi nhanh hơn.
async function shrink(file, max = 1536) {
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.round(img.naturalWidth * scale);
    c.height = Math.round(img.naturalHeight * scale);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.92));
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Ghép lớp chữ gốc lên ảnh AI, xuất theo đúng kích thước ảnh mẫu.
async function compose(aiBlob) {
  const aiUrl = URL.createObjectURL(aiBlob);
  try {
    const ai = await loadImage(aiUrl);
    const ref = await loadImage(`/template?v=${info.version}`);
    const c = document.createElement('canvas');
    c.width = ref.naturalWidth;
    c.height = ref.naturalHeight;
    const ctx = c.getContext('2d');
    // Phủ kín khung (cắt bớt nếu AI trả tỉ lệ hơi lệch)
    const s = Math.max(c.width / ai.naturalWidth, c.height / ai.naturalHeight);
    const w = ai.naturalWidth * s, h = ai.naturalHeight * s;
    ctx.drawImage(ai, (c.width - w) / 2, (c.height - h) / 2, w, h);
    if (info.hasOverlay) {
      const ov = await loadImage(`/overlay.png?v=${info.version}`);
      ctx.drawImage(ov, 0, 0, c.width, c.height);
    }
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.95));
  } finally {
    URL.revokeObjectURL(aiUrl);
  }
}

function gender() {
  return document.querySelector('input[name=gender]:checked')?.value || '';
}

function updateButton() {
  $('go').disabled = !(info?.ready && portraitBlob && gender());
}

async function pickFile(file) {
  if (!file) return;
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
    return showMsg('Chỉ nhận ảnh JPG, PNG hoặc WEBP. (Ảnh HEIC của iPhone: chụp màn hình ảnh đó rồi dùng ảnh chụp màn hình.)');
  }
  hideMsg();
  try {
    portraitBlob = await shrink(file);
  } catch {
    return showMsg('Không đọc được ảnh này, hãy thử ảnh khác.');
  }
  $('portraitPreview').src = URL.createObjectURL(portraitBlob);
  $('portraitPreview').hidden = false;
  $('dropText').hidden = true;
  updateButton();
}

async function run() {
  hideMsg();
  const fd = new FormData();
  fd.append('portrait', portraitBlob, 'portrait.jpg');
  fd.append('gender', gender());
  if (info.needCode) {
    const code = $('code').value.trim();
    try { localStorage.setItem('code', code); } catch {}
    fd.append('code', code);
  }
  $('go').disabled = true;
  $('again').disabled = true;
  $('go').innerHTML = '<span class="spinner"></span> Đang tạo ảnh…';
  $('waitNote').hidden = false;
  $('result').style.opacity = '.4';
  try {
    const r = await fetch('/api/generate', { method: 'POST', body: fd });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      throw new Error(j.error || `Lỗi máy chủ (${r.status})`);
    }
    const final = await compose(await r.blob());
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultUrl = URL.createObjectURL(final);
    $('result').src = resultUrl;
    $('download').href = resultUrl;
    $('rightTitle').textContent = 'Ảnh của bạn';
    $('actions').hidden = false;
    $('againNote').hidden = false;
    showMsg('Xong! Bấm “Tải ảnh về” để lưu.', 'ok');
  } catch (err) {
    showMsg(err.message || 'Có lỗi, vui lòng thử lại.');
  } finally {
    $('go').innerHTML = '✨ Tạo ảnh của tôi';
    $('waitNote').hidden = true;
    $('result').style.opacity = '';
    $('again').disabled = false;
    updateButton();
  }
}

async function init() {
  info = await fetch('/api/info').then((r) => r.json());
  document.title = info.title;
  $('title').textContent = info.title;
  if (info.hasTemplate) $('result').src = `/template?v=${info.version}`;
  if (!info.ready) {
    $('notReady').hidden = false;
    $('notReadyMsg').textContent = !info.hasTemplate
      ? 'Phòng Marketing chưa tải ảnh mẫu lên.'
      : 'Máy chủ chưa được cài khóa AI (GEMINI_API_KEY).';
  }
  if (info.needCode) {
    $('codeBox').hidden = false;
    try { $('code').value = localStorage.getItem('code') || ''; } catch {}
  }
  updateButton();
}

$('file').addEventListener('change', (e) => pickFile(e.target.files[0]));
const drop = $('drop');
drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
drop.addEventListener('dragleave', () => drop.classList.remove('over'));
drop.addEventListener('drop', (e) => {
  e.preventDefault();
  drop.classList.remove('over');
  pickFile(e.dataTransfer.files[0]);
});
document.querySelectorAll('input[name=gender]').forEach((el) => el.addEventListener('change', updateButton));
$('go').addEventListener('click', run);
$('again').addEventListener('click', run);
init().catch(() => showMsg('Không kết nối được máy chủ.'));
