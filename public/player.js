/**
 * Trang trình chiếu chạy trên từng màn hình (Smart TV / Android box / mini PC).
 * Nhận playlist và lệnh điều khiển từ server qua WebSocket, tự kết nối lại
 * khi mất mạng và tiếp tục phát playlist đang có.
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

  // ------------------------------------------------------------------
  // Kết nối WebSocket
  // ------------------------------------------------------------------

  function connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    ws = new WebSocket(`${proto}://${location.host}/ws`);

    ws.onopen = () => {
      connDot.classList.add('on');
      ws.send(JSON.stringify({ type: 'hello', role: 'player', screenId }));
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'config') applyConfig(msg.screen, msg.playlist);
      if (msg.type === 'command') handleCommand(msg);
    };

    ws.onclose = () => {
      connDot.classList.remove('on');
      standbyMsg.textContent = 'Mất kết nối máy chủ - đang thử kết nối lại...';
      setTimeout(connect, 3000);
    };

    ws.onerror = () => ws.close();
  }

  function reportStatus(state) {
    if (!ws || ws.readyState !== ws.OPEN) return;
    const current = interrupt || playlist[index] || null;
    ws.send(JSON.stringify({
      type: 'status',
      nowPlaying: current ? { mediaId: current.id, name: current.name, state } : null,
    }));
  }

  // ------------------------------------------------------------------
  // Áp dụng cấu hình từ server
  // ------------------------------------------------------------------

  function applyConfig(newScreen, newPlaylist) {
    const playlistChanged = JSON.stringify(playlist.map((m) => m.id)) !==
      JSON.stringify(newPlaylist.map((m) => m.id));

    screen = newScreen;
    playlist = newPlaylist;
    screenName.textContent = screen.name;

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

  function showMedia(media) {
    clearStage();
    standby.classList.add('hidden');

    if (media.type === 'video') {
      video.style.display = 'block';
      video.src = media.url;
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
      image.src = media.url;
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
        showMedia(msg.media);
        // Sau khi phát xong nội dung chen ngang thì quay lại playlist
        if (msg.media.type === 'video') video.onended = playNext;
        break;
    }
  }

  // Nhấp/chạm vào màn hình để bật toàn màn hình (cần thao tác người dùng)
  document.addEventListener('click', () => {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  connect();
})();
