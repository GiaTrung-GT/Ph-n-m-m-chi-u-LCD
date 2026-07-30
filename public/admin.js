/**
 * Trang quản trị: quản lý màn hình, thư viện nội dung và 2 bộ playlist
 * theo lịch tuần (Tiếng Việt: T2-T5 & cuối tuần, Tiếng Anh: Thứ 6).
 * Nhận cập nhật thời gian thực (online/offline, đang phát gì) qua WebSocket.
 */
(() => {
  let state = { screens: [], media: [], addresses: [], port: 3000 };
  let mediaFilter = 'all'; // bộ lọc thư viện: all | vi | en

  const GROUPS = {
    vi: { flag: '🇻🇳', label: 'Tiếng Việt', schedule: 'Thứ 2 – Thứ 5 & cuối tuần' },
    en: { flag: '🇬🇧', label: 'Tiếng Anh', schedule: 'Thứ 6' },
  };

  const $ = (sel) => document.querySelector(sel);
  const screensEl = $('#screens');
  const mediaGrid = $('#mediaGrid');
  const serverInfo = $('#serverInfo');
  const fileInput = $('#fileInput');
  const dropZone = $('#dropZone');

  // ------------------------------------------------------------------
  // Kết nối server
  // ------------------------------------------------------------------

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    ws.onopen = () => ws.send(JSON.stringify({ type: 'hello', role: 'admin' }));
    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'state') {
        state = msg.state;
        render();
      }
      if (msg.type === 'error' && msg.error === 'auth') {
        location.reload(); // phiên đăng nhập hết hạn -> quay về trang đăng nhập
      }
    };
    ws.onclose = () => setTimeout(connect, 3000);
    ws.onerror = () => ws.close();
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json' },
      ...opts,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      toast(err.error || 'Có lỗi xảy ra');
      throw new Error(err.error || res.statusText);
    }
    return res.json();
  }

  const updateScreen = (id, body) => api(`/api/screens/${id}`, { method: 'POST', body });
  const sendCommand = (id, action) =>
    api(`/api/screens/${id}/command`, { method: 'POST', body: { action } });

  // ------------------------------------------------------------------
  // Hiển thị
  // ------------------------------------------------------------------

  function addrLabel(a) {
    if (a.startsWith('100.')) return `${a} (Tailscale — cho màn hình ở xa)`;
    return `${a} (Wi-Fi / mạng nội bộ)`;
  }

  function chosenAddress() {
    const saved = localStorage.getItem('baseAddr');
    if (saved && state.addresses.includes(saved)) return saved;
    return state.addresses[0] || location.hostname;
  }

  function baseUrl() {
    return `http://${chosenAddress()}:${state.port}`;
  }

  function todayMode(screen) {
    return screen.mode || (new Date().getDay() === 5 ? 'en' : 'vi');
  }

  function render() {
    // Không vẽ lại khi người dùng đang thao tác trên một ô nhập liệu
    if (document.activeElement && ['INPUT', 'SELECT'].includes(document.activeElement.tagName)) {
      return;
    }
    if (state.addresses.length > 1) {
      serverInfo.innerHTML = `Tạo link màn hình theo địa chỉ:
        <select id="addrSelect">${state.addresses.map((a) =>
          `<option value="${esc(a)}" ${a === chosenAddress() ? 'selected' : ''}>${esc(addrLabel(a))}</option>`).join('')}
        </select>`;
      serverInfo.querySelector('#addrSelect').onchange = (e) => {
        localStorage.setItem('baseAddr', e.target.value);
        e.target.blur();
        render();
      };
    } else {
      serverInfo.innerHTML = state.addresses.length
        ? `Địa chỉ trong mạng LAN: <code>${baseUrl()}</code>`
        : '';
    }
    renderScreens();
    renderMedia();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function fmtSize(bytes) {
    if (bytes > 1e9) return (bytes / 1e9).toFixed(1) + ' GB';
    if (bytes > 1e6) return (bytes / 1e6).toFixed(1) + ' MB';
    return Math.round(bytes / 1e3) + ' KB';
  }

  function renderScreens() {
    // Giữ trạng thái đang mở của các mục "Cài đặt" khi vẽ lại
    const openSettings = new Set(
      [...screensEl.querySelectorAll('details[open]')].map((d) => d.dataset.sid),
    );
    screensEl.innerHTML = '';

    for (const screen of state.screens) {
      const card = document.createElement('div');
      card.className = 'screen-card';

      const url = `${baseUrl()}/screen/${screen.id}`;
      const np = screen.nowPlaying;
      const mode = todayMode(screen);
      const npText = !screen.online
        ? 'Màn hình chưa kết nối'
        : np
          ? `Đang phát: <strong>${esc(np.name)}</strong>${np.state === 'paused' ? ' (tạm dừng)' : ''}`
          : 'Chưa phát nội dung';

      // Trạng thái tải nội dung về bộ nhớ của thiết bị (phát được khi mất mạng)
      const cache = screen.cache;
      let cacheText = '';
      if (screen.online && cache && cache.total) {
        if (cache.cached >= cache.total) {
          cacheText = `<br>💾 Đã lưu ${cache.cached}/${cache.total} vào máy — mất mạng vẫn phát bình thường`;
        } else if (cache.downloading) {
          cacheText = `<br>⏬ Đang tải "${esc(cache.downloading.name)}": ${cache.downloading.percent}% (xong ${cache.cached}/${cache.total} file)`;
        } else {
          cacheText = `<br>⏬ Đang tải về máy: ${cache.cached}/${cache.total}...`;
        }
        if (cache.error) {
          cacheText += `<br><span class="cache-error">⚠️ ${esc(cache.error)}</span>`;
        }
      }
      // Chẩn đoán kho lưu trữ của thiết bị: đầy / không giữ được lâu dài
      const st = screen.storage;
      if (screen.online && st && st.quota && st.persisted === false) {
        cacheText += `<br><span class="cache-error">⚠️ Thiết bị chưa cam kết giữ dữ liệu lâu dài (kho: ${fmtSize(st.usage)}/${fmtSize(st.quota)}) — nếu tắt/bật phải tải lại, hãy dọn bớt bộ nhớ thiết bị</span>`;
      }

      card.innerHTML = `
        <div class="screen-head">
          <span class="status-dot ${screen.online ? 'on' : ''}" title="${screen.online ? 'Đang kết nối' : 'Chưa kết nối'}"></span>
          <input class="screen-name" value="${esc(screen.name)}" title="Nhấp để đổi tên">
          <button class="btn btn-sm" data-cmd="reload" title="Tải lại trang trên màn hình">🔄</button>
        </div>
        <div class="screen-url">
          <code>${esc(url)}</code>
          <button class="btn btn-sm copy-btn" title="Sao chép liên kết">📋</button>
        </div>
        <div class="now-playing">
          Hôm nay chiếu: <strong>${GROUPS[mode].flag} ${GROUPS[mode].label}</strong><br>
          ${npText}${cacheText}
        </div>
        <div class="playlists"></div>
        <details data-sid="${screen.id}" ${openSettings.has(screen.id) ? 'open' : ''}>
          <summary>⚙️ Cài đặt hiển thị</summary>
          <div class="settings-row">
            <label>Hiển thị
              <select class="fit-select">
                <option value="contain" ${screen.fit === 'contain' ? 'selected' : ''}>Vừa khung</option>
                <option value="cover" ${screen.fit === 'cover' ? 'selected' : ''}>Phủ kín</option>
                <option value="fill" ${screen.fit === 'fill' ? 'selected' : ''}>Kéo giãn</option>
              </select>
            </label>
            <label>Xoay
              <select class="rotate-select">
                ${[0, 90, 180, 270].map((r) =>
                  `<option value="${r}" ${screen.rotate === r ? 'selected' : ''}>${r}°</option>`).join('')}
              </select>
            </label>
            <label>Ảnh (giây)
              <input type="number" class="dur-input" min="1" value="${screen.imageDuration}">
            </label>
            <label><input type="checkbox" class="mute-check" ${screen.muted ? 'checked' : ''}> Tắt tiếng</label>
          </div>
        </details>
      `;

      // 2 bộ playlist theo lịch
      const listsEl = card.querySelector('.playlists');
      for (const key of ['vi', 'en']) {
        listsEl.appendChild(buildPlaylistBlock(screen, key, mode));
      }

      // Sự kiện
      const nameInput = card.querySelector('.screen-name');
      nameInput.onchange = () => updateScreen(screen.id, { name: nameInput.value });
      nameInput.onblur = () => render();

      card.querySelector('.copy-btn').onclick = () => {
        navigator.clipboard.writeText(url)
          .then(() => toast('Đã sao chép liên kết'))
          .catch(() => toast(url));
      };

      card.querySelector('[data-cmd="reload"]').onclick = async () => {
        const r = await sendCommand(screen.id, 'reload');
        if (!r.delivered) toast('Màn hình chưa kết nối — hãy mở liên kết trên màn hình trước');
      };

      card.querySelector('.fit-select').onchange = (e) =>
        updateScreen(screen.id, { fit: e.target.value }).then(() => e.target.blur());
      card.querySelector('.rotate-select').onchange = (e) =>
        updateScreen(screen.id, { rotate: Number(e.target.value) }).then(() => e.target.blur());
      card.querySelector('.dur-input').onchange = (e) =>
        updateScreen(screen.id, { imageDuration: Number(e.target.value) }).then(() => e.target.blur());
      card.querySelector('.mute-check').onchange = (e) =>
        updateScreen(screen.id, { muted: e.target.checked });

      screensEl.appendChild(card);
    }
  }

  // Một khối playlist (Tiếng Việt hoặc Tiếng Anh) của một màn hình
  function buildPlaylistBlock(screen, key, activeToday) {
    const g = GROUPS[key];
    const ids = (screen.playlists && screen.playlists[key]) || [];
    const block = document.createElement('div');
    block.className = `playlist ${key === activeToday ? 'active-list' : ''}`;
    block.innerHTML = `
      <div class="playlist-title">
        ${g.flag} ${g.label} <span class="schedule">(${g.schedule})</span>
        ${key === activeToday ? '<span class="today-badge">đang chiếu hôm nay</span>' : ''}
      </div>
      <div class="playlist-items"></div>
      <div class="add-row">
        <select class="media-select">
          <option value="">— Thêm nội dung ${g.label} —</option>
          ${state.media.filter((m) => (m.group || 'vi') === key).map((m) =>
            `<option value="${m.id}">${m.type === 'video' ? '🎬' : '🖼️'} ${esc(m.name)}</option>`).join('')}
        </select>
        <button class="btn btn-sm add-btn">➕</button>
      </div>
    `;

    const setLists = (newIds) =>
      updateScreen(screen.id, { playlists: { [key]: newIds } });

    const itemsEl = block.querySelector('.playlist-items');
    if (!ids.length) {
      itemsEl.innerHTML = '<div class="playlist-empty">Chưa có nội dung</div>';
    }
    ids.forEach((mediaId, i) => {
      const media = state.media.find((m) => m.id === mediaId);
      if (!media) return;
      const row = document.createElement('div');
      row.className = 'playlist-item';
      row.innerHTML = `
        <span class="pl-type">${media.type === 'video' ? '🎬' : '🖼️'}</span>
        <span class="pl-name">${esc(media.name)}</span>
        <button title="Chuyển lên">⬆️</button>
        <button title="Chuyển xuống">⬇️</button>
        <button title="Bỏ khỏi playlist">✖️</button>
      `;
      const [upBtn, downBtn, delBtn] = row.querySelectorAll('button');
      upBtn.onclick = () => { if (i > 0) { const p = ids.slice(); [p[i - 1], p[i]] = [p[i], p[i - 1]]; setLists(p); } };
      downBtn.onclick = () => { if (i < ids.length - 1) { const p = ids.slice(); [p[i], p[i + 1]] = [p[i + 1], p[i]]; setLists(p); } };
      delBtn.onclick = () => { const p = ids.slice(); p.splice(i, 1); setLists(p); };
      itemsEl.appendChild(row);
    });

    block.querySelector('.add-btn').onclick = () => {
      const select = block.querySelector('.media-select');
      if (!select.value) return;
      setLists([...ids, select.value]);
    };

    return block;
  }

  // ------------------------------------------------------------------
  // Thư viện nội dung
  // ------------------------------------------------------------------

  function renderMedia() {
    // Bộ lọc nhóm
    document.querySelectorAll('#filterTabs button').forEach((b) => {
      b.classList.toggle('active', b.dataset.f === mediaFilter);
    });

    mediaGrid.innerHTML = '';
    const list = state.media.filter((m) => mediaFilter === 'all' || (m.group || 'vi') === mediaFilter);
    if (!list.length) {
      mediaGrid.innerHTML = '<div class="media-empty">Chưa có nội dung nào. Hãy chọn nhóm rồi tải video hoặc ảnh lên.</div>';
      return;
    }
    for (const media of list) {
      const g = GROUPS[media.group || 'vi'];
      const other = (media.group || 'vi') === 'vi' ? 'en' : 'vi';
      const card = document.createElement('div');
      card.className = 'media-card';
      const thumb = media.type === 'video'
        ? `<video class="media-thumb" src="${esc(media.url)}" preload="metadata" muted></video>`
        : `<img class="media-thumb" src="${esc(media.url)}" alt="" loading="lazy">`;
      card.innerHTML = `
        ${thumb}
        <div class="media-info">
          <div class="media-name" title="${esc(media.name)}">${esc(media.name)}</div>
          <div class="media-meta">${g.flag} ${g.label} · ${fmtSize(media.size)}</div>
          <div class="media-actions">
            <button class="btn btn-sm group-btn" title="Chuyển sang nhóm ${GROUPS[other].label}">${GROUPS[other].flag} Đổi nhóm</button>
            <button class="btn btn-sm btn-danger del-btn" title="Xóa file">🗑️</button>
          </div>
        </div>
      `;
      card.querySelector('.group-btn').onclick = () =>
        api(`/api/media/${media.id}`, { method: 'POST', body: { group: other } })
          .then(() => toast(`Đã chuyển sang nhóm ${GROUPS[other].flag} ${GROUPS[other].label}`));
      card.querySelector('.del-btn').onclick = () => {
        if (confirm(`Xóa "${media.name}"? File sẽ bị gỡ khỏi mọi playlist.`)) {
          api(`/api/media/${media.id}`, { method: 'DELETE' });
        }
      };
      mediaGrid.appendChild(card);
    }
  }

  document.querySelectorAll('#filterTabs button').forEach((b) => {
    b.onclick = () => { mediaFilter = b.dataset.f; renderMedia(); };
  });

  // ------------------------------------------------------------------
  // Tải file lên
  // ------------------------------------------------------------------

  function uploadFiles(files) {
    if (!files.length) return;
    const form = new FormData();
    form.append('group', $('#uploadGroup').value);
    for (const f of files) form.append('files', f);

    const progress = $('#uploadProgress');
    const bar = $('#uploadBar');
    const label = $('#uploadLabel');
    progress.classList.remove('hidden');

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/media');
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        bar.style.width = pct + '%';
        label.textContent = `Đang tải lên... ${pct}%`;
      }
    };
    xhr.onload = () => {
      progress.classList.add('hidden');
      bar.style.width = '0';
      if (xhr.status === 200) toast('Tải lên thành công');
      else toast('Tải lên thất bại');
    };
    xhr.onerror = () => {
      progress.classList.add('hidden');
      toast('Tải lên thất bại');
    };
    xhr.send(form);
  }

  fileInput.onchange = () => {
    uploadFiles([...fileInput.files]);
    fileInput.value = '';
  };

  $('#deleteAllBtn').onclick = () => {
    if (!state.media.length) { toast('Thư viện đang trống'); return; }
    if (confirm(`Xóa TOÀN BỘ ${state.media.length} video/ảnh và làm trống playlist của mọi màn hình?\nCác màn hình sẽ tự dọn nội dung đã lưu. Không thể hoàn tác.`)) {
      api('/api/media', { method: 'DELETE' }).then(() => toast('Đã xóa toàn bộ thư viện'));
    }
  };

  dropZone.ondragover = (e) => { e.preventDefault(); dropZone.classList.add('dragover'); };
  dropZone.ondragleave = () => dropZone.classList.remove('dragover');
  dropZone.ondrop = (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    uploadFiles([...e.dataTransfer.files].filter((f) => /^(video|image)\//.test(f.type)));
  };

  // ------------------------------------------------------------------

  let toastTimer = null;
  function toast(msg) {
    let el = $('.toast');
    if (!el) {
      el = document.createElement('div');
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = msg;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.remove(), 3000);
  }

  connect();
})();
