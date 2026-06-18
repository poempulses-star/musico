
(() => {
  'use strict';


  const DEFAULT_YT_KEY = 'AIzaSyBmXkQAA_toRX5JG_Cbbjc1GubifqgERa8';
  let YT_KEY = localStorage.getItem('yt_api_key') || DEFAULT_YT_KEY;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];


  const state = {
    queue: [],
    index: -1,
    isPlaying: false,
    shuffle: JSON.parse(localStorage.getItem('shuffle') || 'false'),
    repeat: localStorage.getItem('repeat') || 'off', // off | one | all
    volume: parseInt(localStorage.getItem('volume') || '100', 10),
    muted: false,
    favorites: JSON.parse(localStorage.getItem('favorites') || '[]'),
    playlists: JSON.parse(localStorage.getItem('playlists') || '{}'),
    recent: JSON.parse(localStorage.getItem('recent') || '[]'),
    history: JSON.parse(localStorage.getItem('history') || '[]'),
    cache: JSON.parse(sessionStorage.getItem('cache') || '{}'),
  };

  const save = () => {
    localStorage.setItem('favorites', JSON.stringify(state.favorites));
    localStorage.setItem('playlists', JSON.stringify(state.playlists));
    localStorage.setItem('recent', JSON.stringify(state.recent.slice(0, 30)));
    localStorage.setItem('history', JSON.stringify(state.history.slice(0, 15)));
    localStorage.setItem('shuffle', JSON.stringify(state.shuffle));
    localStorage.setItem('repeat', state.repeat);
    localStorage.setItem('volume', String(state.volume));
  };

  
  const apiModal = $('#apiModal');
  const ensureKey = () => {
    if (!YT_KEY) {
      apiModal.hidden = false;
      return false;
    }
    return true;
  };
  $('#saveKeyBtn').onclick = () => {
    const v = $('#apiKeyInput').value.trim();
    if (!v) return;
    YT_KEY = v;
    localStorage.setItem('yt_api_key', v);
    apiModal.hidden = true;
    initHome();
  };

 
  const loader = $('#loader');
  let loadCount = 0;
  const showLoader = (b) => {
    loadCount += b ? 1 : -1;
    if (loadCount < 0) loadCount = 0;
    loader.classList.toggle('show', loadCount > 0);
  };


  async function ytSearch(q, max = 20) {
    if (!ensureKey()) return [];
    const key = `s:${q}:${max}`;
    if (state.cache[key]) return state.cache[key];
    showLoader(true);
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=${max}&q=${encodeURIComponent(q)}&key=${YT_KEY}`;
      const r = await fetch(url);
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        alert('YouTube API error: ' + (e.error?.message || r.status));
        return [];
      }
      const data = await r.json();
      const items = (data.items || []).map((it) => ({
        id: it.id.videoId,
        title: decodeHTML(it.snippet.title),
        artist: decodeHTML(it.snippet.channelTitle),
        thumb: it.snippet.thumbnails?.medium?.url || it.snippet.thumbnails?.default?.url,
      }));
      state.cache[key] = items;
      sessionStorage.setItem('cache', JSON.stringify(state.cache));
      return items;
    } catch (e) {
      console.error(e);
      return [];
    } finally {
      showLoader(false);
    }
  }

  const decodeHTML = (s) => {
    const t = document.createElement('textarea');
    t.innerHTML = s;
    return t.value;
  };

  // ---------- Views ----------
  const views = {
    home: $('#view-home'),
    search: $('#view-search'),
    library: $('#view-library'),
    liked: $('#view-liked'),
    playlist: $('#view-playlist'),
  };
  const showView = (name) => {
    Object.values(views).forEach((v) => v.classList.remove('active'));
    views[name].classList.add('active');
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === name));
    if (name === 'library') renderLibrary();
    if (name === 'liked') renderLiked();
  };
  $$('.nav-item').forEach((b) => (b.onclick = () => showView(b.dataset.view)));

  // ---------- Rendering helpers ----------
  const songCard = (s, list, i) => {
    const el = document.createElement('div');
    el.className = 'song-card';
    el.innerHTML = `
      <div class="thumb">
        <img loading="lazy" src="${s.thumb}" alt=""/>
        <button class="play-fab"><i class="bi bi-play-fill"></i></button>
      </div>
      <div class="title">${s.title}</div>
      <div class="sub">${s.artist}</div>`;
    el.onclick = () => (list ? playFromList(list, i) : playFromList([s], 0));
    return el;
  };

  const songRow = (s, list, i) => {
    const isLiked = state.favorites.some((x) => x.id === s.id);
    const el = document.createElement('div');
    el.className = 'result-row';
    el.dataset.id = s.id;
    el.innerHTML = `
      <img loading="lazy" src="${s.thumb}" alt=""/>
      <div class="r-meta">
        <div class="r-title">${s.title}</div>
        <div class="r-sub">${s.artist}</div>
      </div>
      <div class="r-actions">
        <button class="like-btn ${isLiked ? 'liked' : ''}" title="Like"><i class="bi bi-heart${isLiked ? '-fill' : ''}"></i></button>
        <button class="add-btn" title="Add to playlist"><i class="bi bi-plus"></i></button>
      </div>`;
    el.onclick = (e) => {
      if (e.target.closest('.like-btn')) {
        toggleLike(s);
        el.querySelector('.like-btn').classList.toggle('liked');
        el.querySelector('.like-btn i').className = 'bi bi-heart' + (state.favorites.some((x) => x.id === s.id) ? '-fill' : '');
        return;
      }
      if (e.target.closest('.add-btn')) {
        openAddToPlaylist(s);
        return;
      }
      playFromList(list, i);
    };
    return el;
  };

  const renderRow = (el, items) => {
    el.innerHTML = '';
    items.forEach((s, i) => el.appendChild(songCard(s, items, i)));
  };

  // ---------- Home ----------
  const HOME_QUERIES = {
    trending: 'trending songs 2025',
    artists: 'top artists hits',
    new: 'new song releases this week',
    recommended: 'best songs playlist',
  };

  async function initHome() {
    if (!ensureKey()) return;
    const [t, a, n, r] = await Promise.all([
      ytSearch(HOME_QUERIES.trending, 12),
      ytSearch(HOME_QUERIES.artists, 12),
      ytSearch(HOME_QUERIES.new, 12),
      ytSearch(HOME_QUERIES.recommended, 12),
    ]);
    renderRow($('#row-trending'), t);
    renderRow($('#row-artists'), a);
    renderRow($('#row-new'), n);
    renderRow($('#row-recommended'), r);
    renderRecent();
  }

  const renderRecent = () => renderRow($('#row-recent'), state.recent.slice(0, 12));

  // ---------- Search ----------
  let searchTimer;
  $('#searchInput').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    if (!q) {
      $('#searchResults').innerHTML = '';
      $('#searchResultsTitle').style.display = 'none';
      return;
    }
    showView('search');
    searchTimer = setTimeout(() => doSearch(q), 350);
  });

  async function doSearch(q) {
    const results = await ytSearch(q, 25);
    const wrap = $('#searchResults');
    wrap.innerHTML = '';
    $('#searchResultsTitle').style.display = 'block';
    results.forEach((s, i) => wrap.appendChild(songRow(s, results, i)));
    // history
    if (!state.history.includes(q)) {
      state.history.unshift(q);
      save();
      renderHistory();
    }
  }

  $$('.chip, .genre').forEach((b) => {
    b.onclick = () => {
      const q = b.dataset.q;
      $('#searchInput').value = q;
      showView('search');
      doSearch(q);
    };
  });

  const renderHistory = () => {
    const wrap = $('#searchHistory');
    wrap.innerHTML = '';
    state.history.slice(0, 8).forEach((q) => {
      const b = document.createElement('button');
      b.innerHTML = `<i class="bi bi-clock-history"></i> ${q}`;
      b.onclick = () => {
        $('#searchInput').value = q;
        showView('search');
        doSearch(q);
      };
      wrap.appendChild(b);
    });
  };

  // ---------- Likes / Playlists ----------
  const toggleLike = (s) => {
    const i = state.favorites.findIndex((x) => x.id === s.id);
    if (i >= 0) state.favorites.splice(i, 1);
    else state.favorites.unshift(s);
    save();
    updateLikeBtn();
    if (views.liked.classList.contains('active')) renderLiked();
  };

  const renderLiked = () => {
    const wrap = $('#likedList');
    wrap.innerHTML = '';
    if (!state.favorites.length) {
      wrap.innerHTML = '<p style="color:#b3b3b3">No liked songs yet. Tap the heart on any song.</p>';
      return;
    }
    state.favorites.forEach((s, i) => wrap.appendChild(songRow(s, state.favorites, i)));
  };

  const renderPlaylists = () => {
    const wrap = $('#playlistList');
    wrap.innerHTML = '';
    Object.keys(state.playlists).forEach((name) => {
      const b = document.createElement('button');
      b.innerHTML = `<i class="bi bi-music-note-list"></i> ${name}`;
      b.onclick = () => openPlaylist(name);
      wrap.appendChild(b);
    });
  };

  const renderLibrary = () => {
    const wrap = $('#libraryGrid');
    wrap.innerHTML = '';
    const items = [
      { name: 'Liked Songs', count: state.favorites.length, action: () => showView('liked'), gradient: 'linear-gradient(135deg,#450af5,#c4efd9)' },
      ...Object.entries(state.playlists).map(([name, songs]) => ({
        name, count: songs.length, action: () => openPlaylist(name), gradient: 'linear-gradient(135deg,#1db954,#191414)',
      })),
    ];
    items.forEach((it) => {
      const el = document.createElement('div');
      el.className = 'song-card';
      el.innerHTML = `
        <div class="thumb" style="background:${it.gradient};display:flex;align-items:center;justify-content:center;font-size:2.5rem">
          <i class="bi bi-music-note-beamed"></i>
          <button class="play-fab"><i class="bi bi-play-fill"></i></button>
        </div>
        <div class="title">${it.name}</div>
        <div class="sub">${it.count} songs</div>`;
      el.onclick = it.action;
      wrap.appendChild(el);
    });
  };

  let currentPlaylist = null;
  const openPlaylist = (name) => {
    currentPlaylist = name;
    showView('playlist');
    const songs = state.playlists[name] || [];
    $('#plName').textContent = name;
    $('#plCount').textContent = `${songs.length} songs`;
    const wrap = $('#playlistSongs');
    wrap.innerHTML = '';
    songs.forEach((s, i) => wrap.appendChild(songRow(s, songs, i)));
    $('#playAllBtn').onclick = () => songs.length && playFromList(songs, 0);
  };

  $('#newPlaylistBtn').onclick = () => {
    const name = prompt('Playlist name?');
    if (!name) return;
    if (!state.playlists[name]) state.playlists[name] = [];
    save();
    renderPlaylists();
  };

  // Add to playlist modal
  let pendingSong = null;
  const addModal = $('#addModal');
  const openAddToPlaylist = (s) => {
    pendingSong = s;
    const wrap = $('#modalPlaylists');
    wrap.innerHTML = '';
    const names = Object.keys(state.playlists);
    if (!names.length) wrap.innerHTML = '<p style="color:#b3b3b3;margin:0">No playlists yet — create one below.</p>';
    names.forEach((n) => {
      const b = document.createElement('button');
      b.textContent = n;
      b.onclick = () => { addSongToPlaylist(n, s); addModal.hidden = true; };
      wrap.appendChild(b);
    });
    addModal.hidden = false;
  };
  $('#createPlBtn').onclick = () => {
    const n = $('#newPlInput').value.trim();
    if (!n) return;
    state.playlists[n] = state.playlists[n] || [];
    if (pendingSong) addSongToPlaylist(n, pendingSong);
    $('#newPlInput').value = '';
    addModal.hidden = true;
  };
  const addSongToPlaylist = (name, s) => {
    state.playlists[name] = state.playlists[name] || [];
    if (!state.playlists[name].some((x) => x.id === s.id)) state.playlists[name].push(s);
    save();
    renderPlaylists();
  };
  addModal.addEventListener('click', (e) => { if (e.target === addModal) addModal.hidden = true; });

  $('#addToPlaylistBtn').onclick = () => {
    if (state.index < 0) return;
    openAddToPlaylist(state.queue[state.index]);
  };

  // ---------- Player ----------
  let yt, ytReady = false, durationTimer;
  window.onYouTubeIframeAPIReady = () => {
    yt = new YT.Player('ytPlayer', {
      height: '1', width: '1',
      playerVars: { autoplay: 0, controls: 0, disablekb: 1, playsinline: 1 },
      events: {
        onReady: () => {
          ytReady = true;
          yt.setVolume(state.volume);
          $('#volume').value = state.volume;
          updateRangeFill($('#volume'));
        },
        onStateChange: (e) => {
          if (e.data === YT.PlayerState.PLAYING) {
            state.isPlaying = true;
            skipTries = 0;
            updatePlayBtn();
            startProgress();
          } else if (e.data === YT.PlayerState.PAUSED) {
            state.isPlaying = false;
            updatePlayBtn();
          } else if (e.data === YT.PlayerState.ENDED) {
            handleSongEnd();
          }
        },
        onError: () => skipUnplayable(),
      },
    });
  };

  // Some YouTube videos block embedding/playback — skip to the next playable one.
  let skipTries = 0;
  const skipUnplayable = () => {
    if (!state.queue.length) return;
    if (skipTries >= state.queue.length) { skipTries = 0; return; }
    skipTries++;
    next(true);
  };

  const updatePlayBtn = () => {
    $('#playBtn').innerHTML = state.isPlaying
      ? '<i class="bi bi-pause-fill"></i>'
      : '<i class="bi bi-play-fill"></i>';
  };

  const updateLikeBtn = () => {
    if (state.index < 0) return;
    const s = state.queue[state.index];
    const liked = state.favorites.some((x) => x.id === s.id);
    $('#likeBtn').innerHTML = `<i class="bi bi-heart${liked ? '-fill' : ''}"></i>`;
    $('#likeBtn').classList.toggle('active', liked);
  };

  const playFromList = (list, i) => {
    state.queue = list.slice();
    state.index = i;
    playCurrent();
  };

  const playCurrent = () => {
    if (state.index < 0 || !state.queue[state.index]) return;
    const s = state.queue[state.index];
    if (!ytReady) { setTimeout(playCurrent, 300); return; }
    yt.loadVideoById({ videoId: s.id });
    yt.unMute();
    yt.setVolume(state.muted ? 0 : state.volume);
    yt.playVideo();
    $('#pImg').src = s.thumb;
    $('#pImg').style.visibility = 'visible';
    $('#pTitle').textContent = s.title;
    $('#pArtist').textContent = s.artist;
    updateLikeBtn();
    // recent
    state.recent = [s, ...state.recent.filter((x) => x.id !== s.id)].slice(0, 30);
    save();
    renderRecent();
    // highlight
    $$('.result-row').forEach((r) => r.classList.toggle('playing', r.dataset.id === s.id));
  };

  const handleSongEnd = () => {
    if (state.repeat === 'one') { yt.seekTo(0); yt.playVideo(); return; }
    next(true);
  };

  const next = (auto = false) => {
    if (!state.queue.length) return;
    if (state.shuffle) {
      state.index = Math.floor(Math.random() * state.queue.length);
    } else if (state.index < state.queue.length - 1) {
      state.index++;
    } else if (state.repeat === 'all' || auto) {
      state.index = 0;
      if (!auto && state.repeat !== 'all') return;
    } else return;
    playCurrent();
  };

  const prev = () => {
    if (!state.queue.length) return;
    if (yt.getCurrentTime() > 3) { yt.seekTo(0); return; }
    state.index = state.index > 0 ? state.index - 1 : state.queue.length - 1;
    playCurrent();
  };

  $('#playBtn').onclick = () => {
    if (state.index < 0) return;
    state.isPlaying ? yt.pauseVideo() : yt.playVideo();
  };
  $('#nextBtn').onclick = () => next();
  $('#prevBtn').onclick = () => prev();
  $('#shuffleBtn').onclick = (e) => {
    state.shuffle = !state.shuffle;
    e.currentTarget.classList.toggle('active', state.shuffle);
    save();
  };
  $('#repeatBtn').onclick = (e) => {
    state.repeat = state.repeat === 'off' ? 'all' : state.repeat === 'all' ? 'one' : 'off';
    e.currentTarget.classList.toggle('active', state.repeat !== 'off');
    e.currentTarget.innerHTML = state.repeat === 'one'
      ? '<i class="bi bi-repeat-1"></i>' : '<i class="bi bi-repeat"></i>';
    save();
  };
  $('#likeBtn').onclick = () => {
    if (state.index < 0) return;
    toggleLike(state.queue[state.index]);
  };

  // Volume / mute
  $('#volume').addEventListener('input', (e) => {
    state.volume = +e.target.value;
    if (ytReady) yt.setVolume(state.volume);
    if (state.volume === 0) { state.muted = true; setMuteIcon(true); }
    else { state.muted = false; setMuteIcon(false); ytReady && yt.unMute(); }
    updateRangeFill(e.target);
    save();
  });
  $('#muteBtn').onclick = () => {
    state.muted = !state.muted;
    if (state.muted) { yt.mute(); $('#volume').value = 0; }
    else { yt.unMute(); $('#volume').value = state.volume || 50; yt.setVolume(+$('#volume').value); }
    setMuteIcon(state.muted);
    updateRangeFill($('#volume'));
  };
  const setMuteIcon = (m) => {
    $('#muteBtn').innerHTML = m ? '<i class="bi bi-volume-mute-fill"></i>' : '<i class="bi bi-volume-up-fill"></i>';
  };

  // Seek / progress
  const seek = $('#seek');
  let isSeeking = false;
  seek.addEventListener('input', () => { isSeeking = true; updateRangeFill(seek); });
  seek.addEventListener('change', () => {
    if (!ytReady) return;
    const d = yt.getDuration();
    yt.seekTo((seek.value / 100) * d, true);
    isSeeking = false;
  });

  const fmt = (s) => {
    s = Math.max(0, Math.floor(s || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  };
  const updateRangeFill = (el) => {
    const v = ((el.value - el.min) / (el.max - el.min)) * 100;
    el.style.setProperty('--p', v + '%');
  };

  const startProgress = () => {
    clearInterval(durationTimer);
    durationTimer = setInterval(() => {
      if (!ytReady || isSeeking) return;
      const c = yt.getCurrentTime?.() || 0;
      const d = yt.getDuration?.() || 0;
      if (d) {
        seek.value = (c / d) * 100;
        updateRangeFill(seek);
      }
      $('#curTime').textContent = fmt(c);
      $('#durTime').textContent = fmt(d);
    }, 500);
  };

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if (e.code === 'Space') { e.preventDefault(); $('#playBtn').click(); }
    if (e.code === 'ArrowRight' && e.shiftKey) next();
    if (e.code === 'ArrowLeft' && e.shiftKey) prev();
  });

  // ---------- Init ----------
  if (state.shuffle) $('#shuffleBtn').classList.add('active');
  if (state.repeat !== 'off') {
    $('#repeatBtn').classList.add('active');
    if (state.repeat === 'one') $('#repeatBtn').innerHTML = '<i class="bi bi-repeat-1"></i>';
  }
  renderPlaylists();
  renderHistory();

  initHome();
})();