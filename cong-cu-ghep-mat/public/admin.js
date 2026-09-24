const $ = (id) => document.getElementById(id);
const RATIOS = ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'];

function showMsg(text, type = 'ok') {
  $('msg').textContent = text;
  $('msg').className = `msg show ${type}`;
  $('msg').scrollIntoView({ block: 'nearest' });
}

// Chọn tỉ lệ AI hỗ trợ gần nhất với kích thước ảnh mẫu.
function nearestRatio(w, h) {
  const r = w / h;
  return RATIOS.reduce((best, s) => {
    const [a, b] = s.split(':').map(Number);
    const [c, d] = best.split(':').map(Number);
    return Math.abs(Math.log(a / b / r)) < Math.abs(Math.log(c / d / r)) ? s : best;
  });
}

function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { resolve([img.naturalWidth, img.naturalHeight]); URL.revokeObjectURL(url); };
    img.onerror = () => { reject(new Error('Không đọc được ảnh')); URL.revokeObjectURL(url); };
    img.src = url;
  });
}

async function api(url, opts) {
  const r = await fetch(url, opts);
  const j = await r.json().catch(() => ({}));
  if (r.status === 401) location.reload();
  if (!r.ok) throw new Error(j.error || `Lỗi ${r.status}`);
  return j;
}

let cfg;
async function load() {
  cfg = await api('/api/admin/config');
  const pill = (ok, yes, no) => `<span class="pill ${ok ? 'ok' : 'no'}">${ok ? '✓ ' + yes : '✗ ' + no}</span>`;
  $('status').innerHTML =
    pill(cfg.templateType, 'Đã có ảnh mẫu', 'Chưa có ảnh mẫu') +
    pill(cfg.hasApiKey, cfg.mock ? 'Chế độ thử (MOCK)' : `AI: ${cfg.model}`, 'Chưa cài GEMINI_API_KEY') +
    pill(cfg.hasOverlay, 'Có lớp chữ', 'Chưa có lớp chữ') +
    `<span class="pill ok">Đã tạo: ${cfg.generated} ảnh</span>` +
    `<span class="pill ok">Giới hạn: ${cfg.limitPerHour} ảnh/giờ/người</span>`;
  $('title').value = cfg.title;
  $('code').value = cfg.accessCode;
  $('prompt').value = cfg.prompt;
  $('ratio').textContent = cfg.aspectRatio;
  $('tplPreview').hidden = !cfg.templateType;
  $('tplEmpty').hidden = !!cfg.templateType;
  if (cfg.templateType) $('tplPreview').src = `/template?v=${cfg.version}`;
  $('ovPreview').hidden = !cfg.hasOverlay;
  $('ovDel').hidden = !cfg.hasOverlay;
  if (cfg.hasOverlay) $('ovPreview').src = `/overlay.png?v=${cfg.version}`;
}

$('link').value = location.origin + '/';
$('copy').addEventListener('click', async () => {
  $('link').select();
  try { await navigator.clipboard.writeText($('link').value); } catch { document.execCommand('copy'); }
  $('copy').textContent = 'Đã chép ✓';
});

$('tplFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const [w, h] = await imageSize(file);
    const fd = new FormData();
    fd.append('aspectRatio', nearestRatio(w, h));
    fd.append('file', file);
    await api('/api/admin/template', { method: 'POST', body: fd });
    showMsg('Đã lưu ảnh mẫu.');
    await load();
  } catch (err) { showMsg(err.message, 'err'); }
  e.target.value = '';
});

$('ovFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (cfg.templateType) {
      const [w, h] = await imageSize(file);
      const tpl = $('tplPreview');
      if (tpl.naturalWidth && Math.abs(w / h - tpl.naturalWidth / tpl.naturalHeight) > 0.01) {
        if (!confirm('Lớp chữ khác tỉ lệ với ảnh mẫu, chữ sẽ bị lệch. Vẫn tải lên?')) return;
      }
    }
    const fd = new FormData();
    fd.append('file', file);
    await api('/api/admin/overlay', { method: 'POST', body: fd });
    showMsg('Đã lưu lớp chữ.');
    await load();
  } catch (err) { showMsg(err.message, 'err'); }
  e.target.value = '';
});

$('ovDel').addEventListener('click', async () => {
  if (!confirm('Xóa lớp chữ?')) return;
  await api('/api/admin/overlay', { method: 'DELETE' });
  await load();
});

$('save').addEventListener('click', async () => {
  try {
    await api('/api/admin/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: $('title').value, accessCode: $('code').value, prompt: $('prompt').value }),
    });
    showMsg('Đã lưu cài đặt.');
    await load();
  } catch (err) { showMsg(err.message, 'err'); }
});

$('resetPrompt').addEventListener('click', async () => {
  if (!confirm('Thay prompt hiện tại bằng prompt mặc định?')) return;
  const j = await api('/api/admin/reset-prompt', { method: 'POST' });
  $('prompt').value = j.prompt;
  showMsg('Đã khôi phục prompt mặc định.');
});

load().catch((err) => showMsg(err.message, 'err'));
