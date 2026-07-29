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

  let ws = null;
  let screen = null;          // cấu hình màn hình từ server
  let playlist = [];          // danh sách media đang phát vòng lặp
  let index = -1;             // vị trí đang phát trong playlist
  let imageTimer = null;
  let stopped = false;        // đang ở trạng thái "dừng" do lệnh stop
  let interrupt = null;       // media đang phát chen ngang (lệnh "chiếu ngay")
  let showSeq = 0;            // chống race khi chuyển nội dung nhanh
  let playState = 'idle';

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

  async function initCache() {
    try {
      // Xin trình duyệt giữ dữ liệu lâu dài, không tự xóa khi đầy bộ nhớ
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
      for (const k of await store.keys()) cachedIds.add(k);
    } catch { /* thiết bị không hỗ trợ thì phát trực tiếp qua mạng */ }
  }

  // Tải lần lượt các file chưa có về bộ nhớ; xóa file không còn trong playlist
  async function syncCache() {
    if (syncing) return;
    syncing = true;
    try {
      const wanted = new Set(playlist.map((m) => m.id));
      for (const id of [...cachedIds]) {
        if (!wanted.has(id)) {
          await store.del(id);
          cachedIds.delete(id);
          const u = objectUrls.get(id);
          if (u) { URL.revokeObjectURL(u); objectUrls.delete(id); }
        }
      }
      for (const media of playlist) {
        if (cachedIds.has(media.id)) continue;
        const res = await fetch(media.url);
        if (!res.ok) continue;
        const blob = await res.blob();
        await store.put(media.id, blob);
        cachedIds.add(media.id);
        reportStatus();
      }
    } catch { /* mất mạng giữa chừng — sẽ thử lại bên dưới */ }
    syncing = false;
    if (playlist.some((m) => !cachedIds.has(m.id))) setTimeout(syncCache, 30000);
  }

  // Ưu tiên phát từ bộ nhớ thiết bị, chưa có thì phát trực tiếp từ server
  async function srcFor(media) {
    if (objectUrls.has(media.id)) return objectUrls.get(media.id);
    try {
      const blob = await store.get(media.id);
      if (blob) {
        const u = URL.createObjectURL(blob);
        objectUrls.set(media.id, u);
        return u;
      }
    } catch {}
    return media.url;
  }

  // Lưu cấu hình để mở lại trang vẫn phát đúng dù chưa nối được máy chủ
  function saveLocal() {
    try { localStorage.setItem(`cfg-${screenId}`, JSON.stringify({ screen, playlist })); } catch {}
  }
  function loadLocal() {
    try { return JSON.parse(localStorage.getItem(`cfg-${screenId}`)); } catch { return null; }
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
      if (msg.type === 'config') applyConfig(msg.screen, msg.playlist);
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
    ws.send(JSON.stringify({
      type: 'status',
      nowPlaying: current && playState !== 'idle'
        ? { mediaId: current.id, name: current.name, state: playState }
        : null,
      cache: {
        cached: playlist.filter((m) => cachedIds.has(m.id)).length,
        total: playlist.length,
      },
    }));
  }

  // ------------------------------------------------------------------
  // Áp dụng cấu hình
  // ------------------------------------------------------------------

  function applyConfig(newScreen, newPlaylist) {
    const playlistChanged = JSON.stringify(playlist.map((m) => m.id)) !==
      JSON.stringify(newPlaylist.map((m) => m.id));

    screen = newScreen;
    playlist = newPlaylist;
    screenName.textContent = screen.name;
    saveLocal();
    syncCache();

    stage.className = screen.rotate ? `rot${screen.rotate}` : '';
    video.style.objectFit = screen.fit;
    image.style.objectFit = screen.fit;
    video.muted = screen.muted;

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
      showStandby('Chưa có nội dung nào được gán cho màn hình này.');
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
      video.play().catch(() => {
        // Trình duyệt chặn autoplay có tiếng: phát lại ở chế độ tắt tiếng
        video.muted = true;
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

  // Nhấp/chạm vào màn hình để bật toàn màn hình (cần thao tác người dùng)
  document.addEventListener('click', () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  // ------------------------------------------------------------------
  // Khởi động: phát ngay nội dung đã lưu, rồi mới kết nối máy chủ
  // ------------------------------------------------------------------

  initCache().then(() => {
    const saved = loadLocal();
    if (saved && saved.screen) applyConfig(saved.screen, saved.playlist || []);
    connect();
  });
})();
