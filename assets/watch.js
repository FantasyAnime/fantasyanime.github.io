function getParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        idAnime: params.get('idAnime'),
        idEp: params.get('idEp')
    };
}
async function carregarEpisodio() {
    const { idAnime, idEp } = getParams();
    const epInfo = document.getElementById('epInfo');
    try {
        const res = await fetch('animes.json');
        const animes = await res.json();
        const anime = animes.find(a => String(a.id) === String(idAnime));
        if (!anime) {
            epInfo.innerHTML = '<p>Anime não encontrado.</p>';
            return;
        }
        const ep = anime.episodios.find(e => String(e.numero) === String(idEp));
        if (!ep) {
            epInfo.innerHTML = '<p>Episódio não encontrado.</p>';
            return;
        }
        epInfo.innerHTML = `<h2>${anime.nome} - Episódio ${ep.numero}</h2><p>${ep.titulo || ''}</p>`;
        iniciarPlayer(ep.videos);
    } catch (e) {
        epInfo.innerHTML = '<p>Erro ao carregar episódio.</p>';
    }
}
window.addEventListener('DOMContentLoaded', carregarEpisodio);

// --- Player Unificado (adaptado do fornecido, seguro para CSP) ---
function iniciarPlayer(videos) {
    if (!videos || !videos.length) {
        document.getElementById('error').style.display = 'block';
        document.getElementById('error').textContent = 'Nenhum vídeo para este episódio!';
        return;
    }
    // Elementos DOM
    const player = document.getElementById('player');
    const container = document.getElementById('container');
    const floatingControls = document.getElementById('floating-controls');
    const normalControls = document.getElementById('normal-controls');
    const progressbar = document.getElementById('progressbar');
    const progressbarNormal = document.getElementById('progressbar-normal');
    const progress = document.getElementById('progress');
    const progressNormal = document.getElementById('progress-normal');
    const time = document.getElementById('time');
    const timeNormal = document.getElementById('timeNormal');
    const playBtn = document.getElementById('playBtn');
    const playBtnNormal = document.getElementById('playBtnNormal');
    const volumeSlider = document.getElementById('volumeSlider');
    const volumeSliderNormal = document.getElementById('volumeSliderNormal');
    const volumeValue = document.getElementById('volumeValue');
    const volumeValueNormal = document.getElementById('volumeValueNormal');
    const loading = document.getElementById('loading');
    const error = document.getElementById('error');
    const skipBackBtn = document.getElementById('skipBackBtn');
    const skipForwardBtn = document.getElementById('skipForwardBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const skipBackBtnNormal = document.getElementById('skipBackBtnNormal');
    const skipForwardBtnNormal = document.getElementById('skipForwardBtnNormal');
    const fullscreenBtnNormal = document.getElementById('fullscreenBtnNormal');

    let durations = Array(videos.length).fill(0);
    let totalDuration = 0;
    let current = 0;
    let isPlaying = false;
    let mouseTimer = null;
    let isFullscreen = false;
    let isLoading = false;
    let playbackRate = 1;
    player.volume = 1;
    let lastVolume = 1;

    function safeSetCurrentTime(time) {
        if (isFinite(time) && time >= 0 && time <= player.duration) {
            player.currentTime = time;
        }
    }
    function setPlayerVolume(val) {
        const v = Math.min(2, Math.max(0, val / 100));
        player.volume = Math.min(1, v);
        volumeValue.textContent = Math.round(val) + '%';
        volumeValueNormal.textContent = Math.round(val) + '%';
        lastVolume = v;
    }
    volumeSlider.addEventListener('input', function(e) {
        e.stopPropagation();
        setPlayerVolume(this.value);
        volumeSliderNormal.value = this.value;
    });
    volumeSliderNormal.addEventListener('input', function(e) {
        e.stopPropagation();
        setPlayerVolume(this.value);
        volumeSlider.value = this.value;
    });
    function showControls() {
        if (isFullscreen) {
            floatingControls.classList.add('show');
            container.style.cursor = 'default';
        }
    }
    function hideControls() {
        if (isFullscreen) {
            floatingControls.classList.remove('show');
            container.style.cursor = 'none';
        }
    }
    function resetMouseTimer() {
        clearTimeout(mouseTimer);
        showControls();
        mouseTimer = setTimeout(hideControls, 3000);
    }
    container.addEventListener('mouseenter', showControls);
    container.addEventListener('mousemove', resetMouseTimer);
    container.addEventListener('mouseleave', () => {
        clearTimeout(mouseTimer);
        hideControls();
    });
    function skipTime(seconds) {
        if (isLoading) return;
        let played = 0;
        for (let i = 0; i < current; i++) played += durations[i];
        let currentTime = played + (player.currentTime || 0);
        let newTime = Math.max(0, Math.min(totalDuration, currentTime + seconds));
        let acc = 0;
        for (let i = 0; i < videos.length; i++) {
            if (newTime < acc + durations[i]) {
                if (i === current) {
                    safeSetCurrentTime(newTime - acc);
                } else {
                    loadVideo(i, newTime - acc);
                }
                break;
            }
            acc += durations[i];
        }
    }
    function onFullscreenChange() {
        isFullscreen = !!document.fullscreenElement;
        if (isFullscreen) {
            normalControls.style.display = 'none';
            progressbarNormal.style.display = 'none';
            resetMouseTimer();
        } else {
            normalControls.style.display = 'flex';
            progressbarNormal.style.display = 'block';
            floatingControls.classList.remove('show');
            container.style.cursor = 'default';
            clearTimeout(mouseTimer);
        }
    }
    document.addEventListener('fullscreenchange', onFullscreenChange);
    document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    function toggleFullscreen() {
        if (!document.fullscreenElement) {
            if (container.requestFullscreen) {
                container.requestFullscreen();
            } else if (container.webkitRequestFullscreen) {
                container.webkitRequestFullscreen();
            }
        } else {
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if (document.webkitExitFullscreen) {
                document.webkitExitFullscreen();
            }
        }
    }
    function showLoadingOverlay(idx, total) {
        let overlay = document.getElementById('video-loading-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'video-loading-overlay';
            overlay.innerHTML = `
                <div class="loading-blur"></div>
                <div class="loading-spinner">
                    <div class="spinner"></div>
                    <div class="loading-text" id="loading-text"></div>
                </div>
            `;
            container.appendChild(overlay);
        }
        overlay.style.display = 'flex';
        document.getElementById('loading-text').textContent = `Carregando vídeo ${idx}/${total}...`;
    }
    function hideLoadingOverlay() {
        const overlay = document.getElementById('video-loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }
    function loadDurations(idx = 0) {
        if (idx >= videos.length) {
            totalDuration = durations.reduce((a, b) => a + b, 0);
            hideLoadingOverlay();
            if (totalDuration > 0) {
                loadVideo(0, 0);
            } else {
                error.style.display = 'block';
                error.textContent = 'Nenhum vídeo válido encontrado! (｡•́︿•̀｡)';
            }
            return;
        }
        showLoadingOverlay(idx + 1, videos.length);
        const temp = document.createElement('video');
        temp.preload = 'metadata';
        temp.src = videos[idx];
        const timeoutId = setTimeout(() => {
            durations[idx] = 0;
            loadDurations(idx + 1);
        }, 10000);
        temp.addEventListener('loadedmetadata', function() {
            clearTimeout(timeoutId);
            durations[idx] = this.duration || 0;
            loadDurations(idx + 1);
        });
        temp.addEventListener('error', function() {
            clearTimeout(timeoutId);
            durations[idx] = 0;
            loadDurations(idx + 1);
        });
    }
    function loadVideo(idx, relTime = 0) {
        if (idx >= videos.length || idx < 0 || isLoading) return;
        isLoading = true;
        current = idx;
        player.src = videos[idx];
        const loadedHandler = function() {
            player.removeEventListener('loadeddata', loadedHandler);
            player.removeEventListener('canplay', loadedHandler);
            if (relTime > 0) {
                safeSetCurrentTime(Math.max(0, Math.min(relTime, player.duration)));
            }
            if (isPlaying) {
                player.play().catch(e => {
                    isPlaying = false;
                    updateTime();
                });
            }
            isLoading = false;
            updateTime();
        };
        player.addEventListener('loadeddata', loadedHandler);
        player.addEventListener('canplay', loadedHandler);
        player.addEventListener('error', function() {
            isLoading = false;
            error.style.display = 'block';
            error.textContent = `Erro ao reproduzir vídeo ${idx + 1}! (｡•́︿•̀｡)`;
        });
        player.load();
    }
    function updateTime() {
        let played = 0;
        for (let i = 0; i < current; i++) played += durations[i];
        let currentTime = played + (player.currentTime || 0);
        let percent = totalDuration ? (currentTime / totalDuration) * 100 : 0;
        progress.style.width = percent + '%';
        progressNormal.style.width = percent + '%';
        const timeText = format(currentTime) + ' / ' + format(totalDuration);
        time.textContent = timeText;
        timeNormal.textContent = timeText;
        const playText = isPlaying ? '⏸' : '▶';
        playBtn.textContent = playText;
        playBtnNormal.textContent = playText;
    }
    function format(s) {
        s = Math.floor(s);
        const m = Math.floor(s / 60);
        const ss = s % 60;
        return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
    }
    function togglePlay() {
        if (isLoading) return;
        if (isPlaying) {
            player.pause();
        } else {
            player.play().catch(e => {
                isPlaying = false;
                updateTime();
            });
        }
    }
    function seek(e) {
        if (totalDuration === 0 || isLoading) return;
        e.stopPropagation();
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const percent = Math.max(0, Math.min(1, x / rect.width));
        const seekTime = percent * totalDuration;
        let acc = 0;
        for (let i = 0; i < videos.length; i++) {
            if (seekTime < acc + durations[i]) {
                loadVideo(i, seekTime - acc);
                break;
            }
            acc += durations[i];
        }
    }
    player.addEventListener('play', function() {
        isPlaying = true;
        updateTime();
        error.style.display = 'none';
    });
    player.addEventListener('pause', function() {
        isPlaying = false;
        updateTime();
    });
    player.addEventListener('timeupdate', updateTime);
    player.addEventListener('ended', function() {
        if (current < videos.length - 1) {
            isPlaying = true;
            loadVideo(current + 1, 0);
        } else {
            isPlaying = false;
            updateTime();
        }
    });
    player.addEventListener('click', function(e) {
        e.stopPropagation();
        togglePlay();
    });
    playBtn.addEventListener('click', togglePlay);
    playBtnNormal.addEventListener('click', togglePlay);
    skipBackBtn.addEventListener('click', () => skipTime(-5));
    skipBackBtnNormal.addEventListener('click', () => skipTime(-5));
    skipForwardBtn.addEventListener('click', () => skipTime(5));
    skipForwardBtnNormal.addEventListener('click', () => skipTime(5));
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    fullscreenBtnNormal.addEventListener('click', toggleFullscreen);
    progressbar.addEventListener('click', seek);
    progressbarNormal.addEventListener('click', seek);
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT') return;
        switch(e.code) {
            case 'Space':
                e.preventDefault();
                togglePlay();
                break;
            case 'KeyF':
                e.preventDefault();
                toggleFullscreen();
                break;
            case 'ArrowLeft':
                e.preventDefault();
                skipTime(-5);
                break;
            case 'ArrowRight':
                e.preventDefault();
                skipTime(5);
                break;
            case 'ArrowUp':
                e.preventDefault();
                const upVol = Math.min(200, parseInt(volumeSlider.value) + 10);
                volumeSlider.value = upVol;
                volumeSliderNormal.value = upVol;
                setPlayerVolume(upVol);
                break;
            case 'ArrowDown':
                e.preventDefault();
                const downVol = Math.max(0, parseInt(volumeSlider.value) - 10);
                volumeSlider.value = downVol;
                volumeSliderNormal.value = downVol;
                setPlayerVolume(downVol);
                break;
        }
    });
    setPlayerVolume(100);
    loadDurations();
} 