/**
 * Trang trình chiếu chạy trên từng màn hình (Smart TV / Android box / mini PC).
 *
 * - Nhận playlist và lệnh điều khiển từ server qua WebSocket.
 * - TỰ TẢI TOÀN BỘ nội dung về bộ nhớ thiết bị (IndexedDB): khi mất mạng
 *   (ví dụ màn hình trong thang máy, sóng Wi-Fi yếu) vẫn phát bình thường
 *   từ bộ nhớ, có sóng lại thì tự đồng bộ nội dung mới.
 * - Playlist được lưu trong localStorage nên trang vẫn phát đúng nội dung
 *   ngay cả khi mở lại lúc chưa bắt được sóng tới máy chủ.
 */
(() => {
  const screenId = location.pathname.split('/').filter(Boolean).pop();

  const stage = document.getElementById('stage');
  const video = document.getElementById('video');
  const image = document.getElementById('image');
  const standby = document.getElementById('standby');
  const connDot = document.getElementById('connDot');
  const screenName = document.getElementById('screenName');
  const standbyMsg = document.getElementById('standbyMsg');
  const soundHint = document.getElementById('soundHint');

  let ws = null;
  let screen = null;          // cấu hình màn hình từ server
  let playlists = { vi: [], en: [] }; // 2 bộ nội dung theo lịch tuần
  let activeMode = null;      // 'vi' (T2-T5 & cuối tuần) | 'en' (Thứ 6)
  let playlist = [];          // bộ đang phát (theo ngày hôm nay)
  let index = -1;             // vị trí đang phát trong playlist
  let imageTimer = null;
  let stopped = false;        // đang ở trạng thái "dừng" do lệnh stop
  let interrupt = null;       // media đang phát chen ngang (lệnh "chiếu ngay")
  let showSeq = 0;            // chống race khi chuyển nội dung nhanh
  let playState = 'idle';

  // Thứ 6 chiếu Tiếng Anh, các ngày còn lại chiếu Tiếng Việt
  function currentMode() {
    return new Date().getDay() === 5 ? 'en' : 'vi';
  }

  // Cả 2 bộ đều được tải về thiết bị để đổi lịch được ngay cả khi mất mạng
  function unionMedia() {
    const seen = new Map();
    for (const m of [...playlists.vi, ...playlists.en]) seen.set(m.id, m);
    return [...seen.values()];
  }

  // ------------------------------------------------------------------
  // Kho lưu trữ ngoại tuyến (IndexedDB) — hoạt động cả trên HTTP LAN
  // ------------------------------------------------------------------

  const store = (() => {
    let dbp = null;
    function open() {
      if (!dbp) {
        dbp = new Promise((resolve, reject) => {
          const req = indexedDB.open('player-cache', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('media');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      }
      return dbp;
    }
    async function tx(mode, fn) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction('media', mode);
        const r = fn(t.objectStore('media'));
        t.oncomplete = () => resolve(r ? r.result : undefined);
        t.onerror = () => reject(t.error);
      });
    }
    return {
      get: (k) => tx('readonly', (s) => s.get(k)),
      put: (k, v) => tx('readwrite', (s) => s.put(v, k)),
      del: (k) => tx('readwrite', (s) => s.delete(k)),
      keys: () => tx('readonly', (s) => s.getAllKeys()),
    };
  })();

  const cachedIds = new Set();
  const objectUrls = new Map();
  let syncing = false;
  let downloadInfo = null; // { name, percent } — file đang tải dở
  let downloadError = null; // thông báo lỗi tải gần nhất, hiện trên trang quản trị

  // File được tải về theo từng mảnh nhỏ và lưu ngay: đứt mạng giữa chừng
  // thì lần sau tải TIẾP từ mảnh dở, không phải tải lại từ đầu (quan trọng
  // với video lớn ở nơi sóng yếu). Các mảnh chính là nơi lưu trữ lâu dài —
  // khi phát sẽ xâu chuỗi mảnh lại (Blob ghép chỉ tham chiếu, không tốn
  // thêm dung lượng hay thời gian). Khóa trong kho:
  //   '<id>'          = file nguyên khối (dữ liệu bản cũ / server không hỗ trợ Range)
  //   '<id>:c<n>'     = mảnh thứ n
  //   '<id>:progress' = số byte đã tải (đang tải dở)
  //   '<id>:done'     = số mảnh, đánh dấu đã tải đủ
  const CHUNK = 4 * 1024 * 1024;

  // Thông tin kho lưu trữ của trình duyệt — gửi lên trang quản trị để chẩn
  // đoán vì sao TV phải tải lại nội dung sau khi tắt/bật (trình duyệt tự
  // xóa dữ liệu khi thiết bị gần đầy bộ nhớ)
  let storageInfo = null;

  async function updateStorageInfo() {
    try {
      if (!navigator.storage) return;
      const persisted = navigator.storage.persisted ? await navigator.storage.persisted() : null;
      const est = navigator.storage.estimate ? await navigator.storage.estimate() : {};
      storageInfo = { persisted, usage: est.usage || 0, quota: est.quota || 0 };
    } catch {}
  }

  async function initCache() {
    try {
      // Xin trình duyệt giữ dữ liệu lâu dài, không tự xóa khi đầy bộ nhớ
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist().catch(() => {});
      await updateStorageInfo();
      for (const k of await store.keys()) {
        const key = String(k);
        if (!key.includes(':')) cachedIds.add(key);
        else if (key.endsWith(':done')) cachedIds.add(key.slice(0, -':done'.length));
      }
    } catch { /* thiết bị không hỗ trợ thì phát trực tiếp qua mạng */ }
  }

  async function deleteChunks(id, totalSize) {
    const n = Math.ceil((totalSize || 0) / CHUNK) + 1;
    for (let i = 0; i < n; i++) await store.del(`${id}:c${i}`).catch(() => {});
    await store.del(`${id}:progress`).catch(() => {});
    await store.del(`${id}:done`).catch(() => {});
  }

  async function downloadMedia(media) {
    // Không biết kích thước (dữ liệu cũ) thì tải cả file một lần
    if (!media.size) {
      const res = await fetch(media.url);
      if (!res.ok) throw new Error(`Máy chủ trả về lỗi ${res.status}`);
      await store.put(media.id, await res.blob());
      return;
    }

    // Kiểm tra bộ nhớ thiết bị còn đủ chỗ không trước khi tải
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const est = await navigator.storage.estimate();
        const free = (est.quota || 0) - (est.usage || 0);
        if (est.quota && media.size > free) {
          throw new Error(`Bộ nhớ thiết bị không đủ (file ${fmtMB(media.size)}, chỉ còn trống ${fmtMB(free)}) — hãy nén video nhỏ lại hoặc bớt nội dung`);
        }
      } catch (e) {
        if (String(e.message).startsWith('Bộ nhớ')) throw e;
      }
    }

    let offset = (await store.get(`${media.id}:progress`)) || 0;
    // Báo ngay phần trăm đang có (mở lại trang giữa chừng vẫn hiện đúng %)
    downloadInfo = { name: media.name, percent: Math.round((offset / media.size) * 100) };
    reportStatus();

    while (offset < media.size) {
      const end = Math.min(offset + CHUNK, media.size) - 1;
      const res = await fetch(media.url, { headers: { Range: `bytes=${offset}-${end}` } });
      if (res.status === 200) {
        // Máy chủ không hỗ trợ tải từng phần: nhận cả file một lần
        await store.put(media.id, await res.blob());
        await deleteChunks(media.id, media.size);
        return;
      }
      if (res.status !== 206) throw new Error(`Máy chủ trả về lỗi ${res.status}`);
      const part = await res.blob();
      await store.put(`${media.id}:c${Math.floor(offset / CHUNK)}`, part);
      offset += part.size;
      await store.put(`${media.id}:progress`, offset);
      downloadInfo = { name: media.name, percent: Math.round((offset / media.size) * 100) };
      reportStatus();
    }

    // Đủ mảnh — chỉ cần đánh dấu hoàn tất, các mảnh là nơi lưu lâu dài
    await store.put(`${media.id}:done`, Math.ceil(media.size / CHUNK));
    await store.del(`${media.id}:progress`).catch(() => {});
  }

  // Tải lần lượt các file chưa có về bộ nhớ; xóa file không còn trong playlist
  async function syncCache() {
    if (syncing) return;
    syncing = true;
    try {
      // Tải cả 2 bộ (Tiếng Việt + Tiếng Anh) để đổi lịch được khi mất mạng;
      // dọn file (và mảnh tải dở) không còn thuộc bộ nào
      const all = unionMedia();
      const wanted = new Set(all.map((m) => m.id));
      for (const k of await store.keys().catch(() => [])) {
        const baseId = String(k).split(':')[0];
        if (!wanted.has(baseId)) {
          await store.del(k);
          cachedIds.delete(baseId);
          const u = objectUrls.get(baseId);
          if (u) { URL.revokeObjectURL(u); objectUrls.delete(baseId); }
        }
      }
      for (const media of all) {
        if (cachedIds.has(media.id)) continue;
        try {
          downloadInfo = { name: media.name, percent: 0 };
          reportStatus();
          await downloadMedia(media);
          cachedIds.add(media.id);
          downloadError = null;
          updateStorageInfo();
        } catch (e) {
          // Ghi rõ lý do để hiện trên trang quản trị, rồi tải file kế tiếp
          downloadError = `${media.name}: ${e.message === 'Failed to fetch' ? 'mất kết nối khi đang tải, sẽ tự thử lại' : e.message}`;
        }
        downloadInfo = null;
        reportStatus();
      }
    } catch { /* lỗi kho lưu trữ — thiết bị vẫn phát trực tiếp qua mạng */ }
    downloadInfo = null;
    syncing = false;
    reportStatus();
    if (unionMedia().some((m) => !cachedIds.has(m.id))) setTimeout(syncCache, 30000);
  }

  function fmtMB(bytes) {
    return bytes > 1e9 ? (bytes / 1e9).toFixed(1) + ' GB' : Math.round(bytes / 1e6) + ' MB';
  }

  // Ưu tiên phát từ bộ nhớ thiết bị, chưa có thì phát trực tiếp từ server
  async function srcFor(media) {
    if (objectUrls.has(media.id)) return objectUrls.get(media.id);
    try {
      // File nguyên khối (dữ liệu bản cũ hoặc file không rõ kích thước)
      const blob = await store.get(media.id);
      if (blob) {
        const u = URL.createObjectURL(blob);
        objectUrls.set(media.id, u);
        return u;
      }
      // File dạng mảnh: xâu chuỗi các mảnh lại (chỉ tham chiếu, rất nhanh)
      const chunkCount = await store.get(`${media.id}:done`);
      if (chunkCount) {
        const parts = [];
        for (let i = 0; i < chunkCount; i++) {
          const part = await store.get(`${media.id}:c${i}`);
          if (!part) throw new Error('thiếu mảnh');
          parts.push(part);
        }
        const u = URL.createObjectURL(new Blob(parts, { type: media.mime }));
        objectUrls.set(media.id, u);
        return u;
      }
    } catch {
      // Dữ liệu lưu bị hỏng: xóa để tải lại, tạm thời phát trực tiếp qua mạng
      cachedIds.delete(media.id);
      deleteChunks(media.id, media.size).then(() => setTimeout(syncCache, 1000));
    }
    return media.url;
  }

  // Lưu cấu hình để mở lại trang vẫn phát đúng dù chưa nối được máy chủ
  function saveLocal() {
    try { localStorage.setItem(`cfg-${screenId}`, JSON.stringify({ screen, playlists })); } catch {}
  }
  function loadLocal() {
    try {
      const saved = JSON.parse(localStorage.getItem(`cfg-${screenId}`));
      if (saved && !saved.playlists) {
        // dữ liệu bản cũ chỉ có 1 playlist -> coi là bộ Tiếng Việt
        saved.playlists = { vi: saved.playlist || [], en: [] };
      }
      return saved;
    } catch { return null; }
  }

  // ------------------------------------------------------------------
  // Kết nối WebSocket
  // ------------------------------------------------------------------

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
      connDot.classList.add('on');
      ws.send(JSON.stringify({ type: 'hello', role: 'player', screenId }));
      reportStatus();
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'config') applyConfig(msg.screen, msg.playlists);
      if (msg.type === 'command') handleCommand(msg);
    };

    ws.onclose = () => {
      connDot.classList.remove('on');
      standbyMsg.textContent = 'Mất kết nối máy chủ - vẫn phát nội dung đã lưu, đang thử kết nối lại...';
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }

  function reportStatus(state) {
    if (state) playState = state;
    if (!ws || ws.readyState !== 1) return;
    const current = interrupt || playlist[index] || null;
    const all = unionMedia();
    ws.send(JSON.stringify({
      type: 'status',
      nowPlaying: current && playState !== 'idle'
        ? { mediaId: current.id, name: current.name, state: playState }
        : null,
      cache: {
        cached: all.filter((m) => cachedIds.has(m.id)).length,
        total: all.length,
        downloading: downloadInfo,
        error: downloadError,
      },
      storage: storageInfo,
      mode: activeMode,
    }));
  }

  // ------------------------------------------------------------------
  // Áp dụng cấu hình
  // ------------------------------------------------------------------

  function applyConfig(newScreen, newPlaylists) {
    const mode = currentMode();
    const newActive = (newPlaylists && newPlaylists[mode]) || [];
    const playlistChanged = activeMode !== mode ||
      JSON.stringify(playlist.map((m) => m.id)) !== JSON.stringify(newActive.map((m) => m.id));

    screen = newScreen;
    playlists = newPlaylists || { vi: [], en: [] };
    activeMode = mode;
    playlist = newActive;
    screenName.textContent = screen.name;
    saveLocal();
    syncCache();

    stage.className = screen.rotate ? `rot${screen.rotate}` : '';
    video.style.objectFit = screen.fit;
    image.style.objectFit = screen.fit;
    applyMuteSetting();

    if (playlistChanged || (!currentVisible() && !stopped)) {
      index = -1;
      interrupt = null;
      stopped = false;
      playNext();
    }
  }

  function currentVisible() {
    return video.style.display === 'block' || image.style.display === 'block';
  }

  // ------------------------------------------------------------------
  // Phát nội dung
  // ------------------------------------------------------------------

  function clearStage() {
    clearTimeout(imageTimer);
    video.pause();
    video.removeAttribute('src');
    video.load();
    video.style.display = 'none';
    image.removeAttribute('src');
    image.style.display = 'none';
  }

  function showStandby(msg) {
    clearStage();
    standby.classList.remove('hidden');
    if (msg) standbyMsg.textContent = msg;
    reportStatus('idle');
  }

  function playNext() {
    interrupt = null;
    if (stopped) return;
    if (!playlist.length) {
      showStandby(activeMode === 'en'
        ? 'Hôm nay Thứ 6 chiếu Tiếng Anh — chưa có nội dung trong bộ Tiếng Anh.'
        : 'Chưa có nội dung nào được gán cho màn hình này.');
      return;
    }
    index = (index + 1) % playlist.length;
    showMedia(playlist[index]);
  }

  function playPrev() {
    interrupt = null;
    if (!playlist.length) return;
    index = (index - 2 + 2 * playlist.length) % playlist.length;
    playNext();
  }

  async function showMedia(media) {
    const seq = ++showSeq;
    const src = await srcFor(media);
    if (seq !== showSeq) return; // đã có nội dung khác được yêu cầu phát

    clearStage();
    standby.classList.add('hidden');

    if (media.type === 'video') {
      video.style.display = 'block';
      video.src = src;
      video.muted = screen ? screen.muted : true;
      video.onended = playNext;
      video.onerror = () => { imageTimer = setTimeout(playNext, 3000); };
      video.play().then(() => {
        if (!video.muted) hideSoundHint();
      }).catch(() => {
        // Trình duyệt chặn tự phát có tiếng khi chưa có thao tác người dùng:
        // phát tạm ở chế độ tắt tiếng và nhắc người dùng chạm một lần
        video.muted = true;
        if (screen && !screen.muted) showSoundHint();
        video.play().catch(() => { imageTimer = setTimeout(playNext, 3000); });
      });
    } else {
      image.style.display = 'block';
      image.src = src;
      image.onerror = () => { imageTimer = setTimeout(playNext, 3000); };
      const seconds = (screen && screen.imageDuration) || 10;
      imageTimer = setTimeout(playNext, seconds * 1000);
    }
    reportStatus('playing');
  }

  // ------------------------------------------------------------------
  // Lệnh điều khiển từ trang quản trị
  // ------------------------------------------------------------------

  function handleCommand(msg) {
    switch (msg.action) {
      case 'play':
        stopped = false;
        if (video.style.display === 'block' && video.paused) {
          video.play().catch(() => {});
          reportStatus('playing');
        } else if (!currentVisible()) {
          index = -1;
          playNext();
        }
        break;
      case 'pause':
        if (video.style.display === 'block') video.pause();
        clearTimeout(imageTimer);
        reportStatus('paused');
        break;
      case 'stop':
        stopped = true;
        showStandby('Đã dừng trình chiếu.');
        break;
      case 'next':
        stopped = false;
        playNext();
        break;
      case 'prev':
        stopped = false;
        playPrev();
        break;
      case 'reload':
        location.reload();
        break;
      case 'playNow':
        stopped = false;
        interrupt = msg.media;
        showMedia(msg.media).then(() => {
          // Sau khi phát xong nội dung chen ngang thì quay lại playlist
          if (msg.media.type === 'video') video.onended = playNext;
        });
        break;
    }
  }

  // ------------------------------------------------------------------
  // Âm thanh: trình duyệt chỉ cho phát có tiếng sau khi người dùng đã
  // chạm/bấm phím một lần trên trang. Bắt mọi loại thao tác (chạm, chuột,
  // nút OK/mũi tên trên điều khiển TV) để mở khóa âm thanh.
  // ------------------------------------------------------------------

  function showSoundHint() { soundHint.classList.add('show'); }
  function hideSoundHint() { soundHint.classList.remove('show'); }

  // Áp dụng cài đặt tiếng cho video đang phát. Bỏ tắt tiếng bằng lệnh từ xa
  // có thể bị trình duyệt chặn (chưa có thao tác người dùng) — khi đó phát
  // tiếp không tiếng và hiện nhắc chạm màn hình.
  function applyMuteSetting() {
    if (!screen) return;
    video.muted = screen.muted;
    if (screen.muted) { hideSoundHint(); return; }
    if (video.style.display === 'block') {
      video.play().then(hideSoundHint).catch(() => {
        video.muted = true;
        showSoundHint();
        video.play().catch(() => {});
      });
    }
  }

  function onUserGesture() {
    hideSoundHint();
    // Bật lại tiếng nếu cấu hình yêu cầu có tiếng mà video đang bị ép câm
    if (video.style.display === 'block' && screen && !screen.muted && video.muted) {
      video.muted = false;
      video.play().catch(() => {});
    }
    // Nhân tiện bật toàn màn hình (cũng cần thao tác người dùng)
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }
  document.addEventListener('click', onUserGesture);
  document.addEventListener('touchstart', onUserGesture);
  document.addEventListener('keydown', onUserGesture);

  // ------------------------------------------------------------------
  // Khởi động: phát ngay nội dung đã lưu, rồi mới kết nối máy chủ
  // ------------------------------------------------------------------

  initCache().then(() => {
    const saved = loadLocal();
    if (saved && saved.screen) applyConfig(saved.screen, saved.playlists);
    connect();
  });

  // Kiểm tra mỗi phút: sang ngày mới (ví dụ qua Thứ 6) thì tự đổi bộ nội dung,
  // hoạt động cả khi đang mất mạng vì cả 2 bộ đã lưu sẵn trong thiết bị
  setInterval(() => {
    if (screen && activeMode && currentMode() !== activeMode) {
      applyConfig(screen, playlists);
      reportStatus();
    }
  }, 60000);
})();
