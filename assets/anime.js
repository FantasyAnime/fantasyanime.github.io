function getIdFromUrl() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
}

let animeGlobal = null;
let episodioAtual = null;

async function carregarAnime() {
    const id = getIdFromUrl();
    const capaImg = document.getElementById('animeCapa');
    const nomeDiv = document.getElementById('animeNome');
    const anoDiv = document.getElementById('animeAno');
    const tipoDiv = document.getElementById('animeTipo');
    const epsDiv = document.getElementById('animeEpisodios');
    const descDiv = document.getElementById('animeDescricao');
    const sinopseDiv = document.getElementById('animeSinopse');
    const epGrid = document.getElementById('episodiosGrid');
    try {
        // Detecta o caminho base do site (útil para subdiretórios)
        const base = window.location.pathname.replace(/\/[^\/]*$/, '/');
        const fetchPath = base + 'animes.json';
        const res = await fetch(fetchPath);
        if (!res.ok) throw new Error('Erro ao buscar animes.json');
        const animes = await res.json();
        const anime = animes.find(a => String(a.id) === String(id));
        if (!anime) {
            nomeDiv.innerHTML = '<p>Anime não encontrado.</p>';
            return;
        }
        animeGlobal = JSON.parse(JSON.stringify(anime)); // cópia para não alterar o original
        // Corrige caminhos de capa e vídeos para funcionar em subdiretórios
        function fixPath(p) {
            if (!p) return p;
            if (/^(https?:)?\//.test(p)) return p; // já é absoluto
            return p.replace(/^\//, ''); // apenas remove barra inicial, se houver
        }
        capaImg.src = fixPath(anime.capa);
        capaImg.alt = `Capa de ${anime.nome}`;
        nomeDiv.textContent = anime.nome;
        anoDiv.textContent = `Ano: ${anime.ano || ''}`;
        tipoDiv.textContent = `Tipo: ${anime.episodios.length === 1 ? 'Filme' : 'Série'}`;
        epsDiv.textContent = `Episódios: ${anime.episodios.length}`;
        descDiv.textContent = anime.descricao || '';
        sinopseDiv.textContent = anime.sinopse || '';
        epGrid.innerHTML = '';
        epGrid.style.width = '100%';
        // Corrige caminhos dos vídeos
        animeGlobal.episodios.forEach(ep => {
            ep.videos = (ep.videos || []).map(fixPath);
        });
        animeGlobal.capa = fixPath(anime.capa);
        animeGlobal.episodios.forEach(ep => {
            const btn = document.createElement('button');
            btn.className = 'episodio-btn';
            btn.textContent = `EP${ep.numero}`;
            btn.setAttribute('data-ep', ep.numero);
            btn.onclick = function() {
                tocarEpisodio(ep.numero);
            };
            epGrid.appendChild(btn);
        });
        // Seleciona episódio pelo parâmetro da URL, se existir
        let epParam = null;
        try {
            const params = new URLSearchParams(window.location.search);
            epParam = params.get('ep');
        } catch(e){}
        let epNum = epParam || anime.episodios[0].numero;
        tocarEpisodio(epNum);
    } catch (e) {
        nomeDiv.innerHTML = '<p>Erro ao carregar anime.</p>';
        // console.error(e); // Comentado para evitar poluição no terminal
    }
}

// SISTEMA DE PLAYER MODERNO REFORMULADO
let modernPlayerState = {
    durations: [],
    totalDuration: 0,
    current: 0,
    isPlaying: false,
    isLoading: false,
    anime: null,
    episodioAtual: null,
    videos: [],
    epIndex: 0,
    eps: [],
    videoStartTimes: [], // Tempos acumulados onde cada vídeo começa
};

function tocarEpisodio(numEp) {
    if (!animeGlobal) return;
    const ep = animeGlobal.episodios.find(e => String(e.numero) === String(numEp));
    if (!ep) return;
    // Parar vídeo ao trocar de episódio
    try {
        const player = document.getElementById('player');
        if (player) { player.pause(); player.removeAttribute('src'); player.load(); }
    } catch(e){}
    modernPlayerState.episodioAtual = ep;
    modernPlayerState.videos = ep.videos;
    modernPlayerState.epIndex = animeGlobal.episodios.findIndex(e => String(e.numero) === String(numEp));
    document.querySelectorAll('.episodio-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('data-ep') == numEp) btn.classList.add('active');
    });
    // Atualiza a URL para refletir o episódio atual
    const url = new URL(window.location.href);
    url.searchParams.set('id', animeGlobal.id);
    url.searchParams.set('ep', numEp);
    window.history.replaceState({}, '', url);
    iniciarModernPlayer(ep.videos);
}

function iniciarModernPlayer(videos) {
    // --- LOADING OCULTO QUANDO DEMORA PARA CARREGAR ---
    let loadingTimeout = null;
    let loadingHidden = false;
    function showSilentLoading() {
        if (!loadingHidden) {
            loading.style.display = 'flex';
            loading.innerHTML = `<div class='modern-loading-spinner'></div>`;
            loadingHidden = true;
        }
    }
    function hideSilentLoading() {
        if (loadingHidden) {
            loading.style.display = 'none';
            loadingHidden = false;
        }
    }

    const player = document.getElementById('player');
    const progressbar = document.getElementById('modern-progressbar');
    const progress = document.getElementById('modern-progress');
    const time = document.getElementById('modern-time');
    const playBtn = document.getElementById('playBtn');
    const skipBackBtn = document.getElementById('skipBackBtn');
    const skipForwardBtn = document.getElementById('skipForwardBtn');
    const prevEpBtn = document.getElementById('prevEpBtn');
    const nextEpBtn = document.getElementById('nextEpBtn');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const volumeSlider = document.getElementById('modern-volume-slider');
    const volumeValue = document.getElementById('modern-volume-value');
    const loading = document.getElementById('modern-loading');
    const error = document.getElementById('modern-error');
    
    // Estado do player
    let durations = Array(videos.length).fill(0);
    let videoStartTimes = Array(videos.length).fill(0); // Tempos onde cada vídeo começa
    let totalDuration = 0;
    let current = 0;
    let isPlaying = false;
    let isLoading = false;
    let lastVolume = 1;

    // Atualizar state global
    modernPlayerState.durations = durations;
    modernPlayerState.videoStartTimes = videoStartTimes;

    // --- Web Audio API para volume até 200% ---
    let audioCtx = null;
    let sourceNode = null;
    let gainNode = null;
    let usingWebAudio = false;

    function setupWebAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (sourceNode) {
            try { sourceNode.disconnect(); } catch(e){}
        }
        if (gainNode) {
            try { gainNode.disconnect(); } catch(e){}
        }
        sourceNode = audioCtx.createMediaElementSource(player);
        gainNode = audioCtx.createGain();
        sourceNode.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        usingWebAudio = true;
    }

    // Episódios
    const eps = animeGlobal.episodios;
    modernPlayerState.eps = eps;

    // Função para atualizar bloqueio dos botões de episódio
    function updateEpButtons() {
        if (eps.length <= 1) {
            prevEpBtn.disabled = true;
            nextEpBtn.disabled = true;
            prevEpBtn.classList.add('disabled');
            nextEpBtn.classList.add('disabled');
        } else {
            prevEpBtn.disabled = modernPlayerState.epIndex <= 0;
            nextEpBtn.disabled = modernPlayerState.epIndex >= eps.length - 1;
            if (prevEpBtn.disabled) prevEpBtn.classList.add('disabled'); else prevEpBtn.classList.remove('disabled');
            if (nextEpBtn.disabled) nextEpBtn.classList.add('disabled'); else nextEpBtn.classList.remove('disabled');
        }
    }
    updateEpButtons();

    // Reposiciona botões de episódio para o lado esquerdo do fullscreen
    const controlsRow = document.querySelector('.modern-controls-row');
    if (controlsRow && fullscreenBtn && prevEpBtn && nextEpBtn) {
        // Remove se já estão presentes
        if (prevEpBtn.parentNode === controlsRow) controlsRow.removeChild(prevEpBtn);
        if (nextEpBtn.parentNode === controlsRow) controlsRow.removeChild(nextEpBtn);
        // Insere antes do fullscreenBtn
        controlsRow.insertBefore(prevEpBtn, fullscreenBtn);
        controlsRow.insertBefore(nextEpBtn, fullscreenBtn);
    }

    // Sempre mostra os botões, mas bloqueia quando não aplicável
    prevEpBtn.style.display = 'inline-block';
    nextEpBtn.style.display = 'inline-block';

    // Loading & Error functions
    function showLoading(msg) {
        loading.style.display = 'flex';
        loading.innerHTML = `
            <div class='modern-loading-spinner'></div>
            <div id='modern-loading-text'>${msg || 'Versão Anime Player - Carregando vídeo...'}</div>
            <div id='modern-loading-hint' style="margin-top:18px;font-size:1em;color:#b2ffb2;max-width:90%;text-align:center;opacity:0.92;">
                Seu vídeo está sendo preparado, aguarde um instante.<br>
                <span style='color:#fff;opacity:0.7;font-size:0.97em;'>Bom vídeo!</span>
            </div>
        `;
    }
    function hideLoading() { loading.style.display = 'none'; }
    function showError(msg) {
        error.style.display = 'flex';
        error.innerHTML = `<div class='modern-loading-spinner'></div><div id='modern-error-text'>${msg}</div>`;
    }
    function hideError() { error.style.display = 'none'; }

    // Volume até 200% real
    function setPlayerVolume(val) {
        const v = Math.min(2, Math.max(0, val / 100));
        if (v > 1) {
            if (!usingWebAudio) setupWebAudio();
            player.volume = 1;
            if (gainNode) gainNode.gain.value = v;
        } else {
            if (usingWebAudio && gainNode) gainNode.gain.value = v;
            player.volume = v;
        }
        volumeValue.textContent = Math.round(val) + '%';
        lastVolume = v;
    }
    volumeSlider.addEventListener('input', function(e) {
        e.stopPropagation();
        setPlayerVolume(this.value);
    });
    setPlayerVolume(100);
    
    // --- NOVA LÓGICA DE BARRA GLOBAL ---
    // Calcula tempos acumulados de início de cada vídeo
    function calcularTempos() {
        videoStartTimes = [];
        let acc = 0;
        for (let d of durations) {
            videoStartTimes.push(acc);
            acc += d;
        }
        totalDuration = acc;
        modernPlayerState.videoStartTimes = videoStartTimes;
        modernPlayerState.totalDuration = totalDuration;
    }

    // Retorna tempo global atual
    function getCurrentGlobalTime() {
        return videoStartTimes[current] + (player.currentTime || 0);
    }

    // Dado um tempo global, retorna {videoIndex, relativeTime}
    function getVideoFromGlobalTime(globalTime) {
        for (let i = videoStartTimes.length - 1; i >= 0; i--) {
            if (globalTime >= videoStartTimes[i]) {
                return { videoIndex: i, relativeTime: globalTime - videoStartTimes[i] };
            }
        }
        return { videoIndex: 0, relativeTime: 0 };
    }

    // Atualiza barra e tempo
    function updateTime() {
        const globalTime = getCurrentGlobalTime();
        const percent = totalDuration ? (globalTime / totalDuration) * 100 : 0;
        progress.style.width = Math.min(100, Math.max(0, percent)) + '%';
        time.textContent = formatTime(globalTime) + ' / ' + formatTime(totalDuration);
        playBtn.textContent = isPlaying ? '⏸' : '▶';
    }

    function formatTime(seconds) {
        if (!isFinite(seconds) || isNaN(seconds)) return '00:00';
        const s = Math.floor(seconds);
        const m = Math.floor(s / 60);
        const ss = s % 60;
        return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
    }

    // SEEK FORÇADO PERSISTENTE: garante que o player vá para o tempo exato na barra ou skip
    function seekToGlobalTime(globalTime) {
        globalTime = Math.max(0, Math.min(globalTime, totalDuration - 0.1));
        const { videoIndex, relativeTime } = getVideoFromGlobalTime(globalTime);

        // Se já está no vídeo certo e pronto, faz seek direto
        if (videoIndex === current && player.readyState > 0) {
            player.currentTime = relativeTime;
            updateTime();
        } else {
            // Carrega o vídeo e faz seek assim que possível
            loadVideo(videoIndex, relativeTime);
        }
    }

    // Botões de avançar/voltar
    function skipTime(seconds) {
        seekToGlobalTime(getCurrentGlobalTime() + seconds);
    }

    // Event listeners para barra e botões
    progressbar.onclick = function(e) {
        const rect = progressbar.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        seekToGlobalTime(percent * totalDuration);
    // Clique no vídeo: play/pause
    player.onclick = function(e) {
        if (isLoading) return;
        if (isPlaying) {
            player.pause();
        } else {
            player.play().catch(() => {});
        }
    };
    };
    skipBackBtn.onclick = () => skipTime(-5);
    skipForwardBtn.onclick = () => skipTime(5);
    player.addEventListener('timeupdate', updateTime);

    // Atualizar tempos ao carregar durações
    function loadDurations(idx = 0) {
        // Carregamento padrão: não faz cache de vídeos
        if (idx >= videos.length) {
            calcularTempos();
            hideLoading();
            if (totalDuration > 0) {
                setTimeout(() => loadVideo(0, 0), 0);
            } else {
                showError('Nenhum vídeo válido encontrado! (｡•́︿•̀｡)');
            }
            return;
        }
        // Só pega a duração, não guarda vídeo em cache
        const temp = document.createElement('video');
        temp.preload = 'metadata';
        temp.src = videos[idx] + ((videos[idx].includes('?') ? '&' : '?') + 't=' + Date.now());
        let finished = false;
        const timeoutId = setTimeout(() => {
            if (finished) return;
            durations[idx] = 0;
            finished = true;
            loadDurations(idx + 1);
        }, 20000);
        temp.addEventListener('loadedmetadata', function() {
            if (finished) return;
            clearTimeout(timeoutId);
            durations[idx] = this.duration || 0;
            finished = true;
            loadDurations(idx + 1);
        });
        temp.addEventListener('error', function() {
            if (finished) return;
            clearTimeout(timeoutId);
            durations[idx] = 0;
            finished = true;
            loadDurations(idx + 1);
        });
    }
    
    // Carregar vídeo específico
    function loadVideo(videoIndex, seekToTime = 0) {
        if (videoIndex >= videos.length || videoIndex < 0 || isLoading) return;
        isLoading = true;
        // Se o vídeo não aparecer em 2s, mostra loading oculto (sem texto)
        if (loadingTimeout) clearTimeout(loadingTimeout);
        loadingTimeout = setTimeout(() => {
            if (player.readyState < 2) showSilentLoading();
        }, 2000);
        current = videoIndex;
        // Carregamento padrão: sempre carrega o vídeo do zero
        let videoUrl = videos[videoIndex] + ((videos[videoIndex].includes('?') ? '&' : '?') + 't=' + Date.now());
        isLoading = true;
        current = videoIndex;
        player.preload = 'auto';
        player.classList.remove('ready');
        let seeked = false;
        let pendingSeek = seekToTime;
        const container = player.parentElement;
        player.style.opacity = '1';
        function hidePlayer() { player.style.opacity = '0'; }
        function showPlayer() { player.style.opacity = '1'; }
        hidePlayer();
        player.src = videoUrl;
        function doSeekAndMaybePlay() {
            if (!seeked && pendingSeek >= 0 && isFinite(pendingSeek) && player.duration) {
                try {
                    const clampedTime = Math.max(0, Math.min(pendingSeek, player.duration - 0.1));
                    player.currentTime = clampedTime;
                    seeked = true;
                } catch (e) {
                    // Se falhar, tenta novamente no próximo evento
                }
            }
            // Só tenta dar play quando realmente pode
            if (isPlaying && player.readyState >= 3) {
                player.play().catch(() => {});
            }
        }
        player.onloadedmetadata = doSeekAndMaybePlay;
        player.oncanplay = doSeekAndMaybePlay;
        player.onloadeddata = function() {
            doSeekAndMaybePlay();
            // Blur-in ao iniciar novo vídeo
            player.style.transition = 'filter 0.25s';
            player.style.filter = 'blur(10px)';
            showPlayer();
            setTimeout(() => {
                player.style.filter = 'blur(0px)';
            }, 30);
            isLoading = false;
            updateTime();
            hideSilentLoading();
            if (loadingTimeout) clearTimeout(loadingTimeout);
        };
        player.onerror = function() {
            isLoading = false;
            showPlayer();
            hideSilentLoading();
            if (loadingTimeout) clearTimeout(loadingTimeout);
            const errorMsg = `Erro ao reproduzir vídeo ${videoIndex + 1}`;
            showError(errorMsg + '<br>Verifique sua conexão ou recarregue a página.');
        };

        // Avança automaticamente para o próximo vídeo ao terminar
        player.onended = function() {
            if (current < videos.length - 1) {
                isPlaying = true; // garante que continue reproduzindo
                loadVideo(current + 1, 0);
                // Não chama player.play() aqui, deixa o evento oncanplay/onloadeddata garantir o play
            } else {
                isPlaying = false;
                updateTime();
            }
        };

        player.load();
    }
    
    // Play/pause
    function togglePlay() {
        if (isLoading) return;
        
        if (isPlaying) {
            player.pause();
        } else {
            player.play().catch(e => {
                console.warn('Erro ao reproduzir:', e);
            });
        }
    }
    
    // Navegação de episódios
    prevEpBtn.onclick = function() {
        if (prevEpBtn.disabled) return;
        if (modernPlayerState.epIndex > 0) {
            tocarEpisodio(modernPlayerState.eps[modernPlayerState.epIndex - 1].numero);
        }
    };

    nextEpBtn.onclick = function() {
        if (nextEpBtn.disabled) return;
        if (modernPlayerState.epIndex < modernPlayerState.eps.length - 1) {
            tocarEpisodio(modernPlayerState.eps[modernPlayerState.epIndex + 1].numero);
        }
    };
    
    // Event listeners
    playBtn.onclick = togglePlay;
    
    fullscreenBtn.onclick = function() {
        const container = document.getElementById('container');
        if (!document.fullscreenElement) {
            if (container.requestFullscreen) container.requestFullscreen();
            else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
        } else {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }
    };
    
    // Event listeners do player
    player.addEventListener('play', function() { 
        isPlaying = true; 
        updateTime(); 
        hideError(); 
    });
    
    player.addEventListener('pause', function() { 
        isPlaying = false; 
        updateTime(); 
    });
    
    // Keyboard controls
    document.addEventListener('keydown', function(e) {
        if (e.target.tagName === 'INPUT') return;
        if (e.code === 'Space') { 
            e.preventDefault(); 
            togglePlay(); 
        }
        if (e.code === 'ArrowLeft') {
            e.preventDefault();
            skipTime(-5);
        }
        if (e.code === 'ArrowRight') {
            e.preventDefault();
            skipTime(5);
        }
    });
    
    // Sistema de controles com fade
    const controls = document.getElementById('modern-controls');
    let controlsTimer = null;
    
    function showControls() {
        controls.classList.add('show');
        // Se o vídeo está pausado, fixa a barra
        if (player.paused) {
            controls.classList.add('fixed');
        }
        clearTimeout(controlsTimer);
        controlsTimer = setTimeout(() => {
            if (!player.paused) hideControls();
        }, 3000);
    }

    function hideControls() {
        // Só esconde se não estiver pausado
        if (!player.paused) {
            controls.classList.remove('show');
            controls.classList.remove('fixed');
        }
    }

    // Sempre que pausar, fixa a barra
    player.addEventListener('pause', function() {
        controls.classList.add('show');
        controls.classList.add('fixed');
    });
    // Sempre que der play, libera o fixo
    player.addEventListener('play', function() {
        controls.classList.remove('fixed');
    });
    
    const container = document.getElementById('container');
    container.addEventListener('mouseenter', showControls);
    container.addEventListener('mousemove', showControls);
    container.addEventListener('mouseleave', hideControls);
    controls.addEventListener('focusin', showControls);
    controls.addEventListener('focusout', hideControls);
    player.addEventListener('pause', showControls);
    player.addEventListener('play', showControls);
    
    // Inicialização
    hideError();
    showLoading('Carregando vídeos...');
    loadDurations();
    showControls();
    setTimeout(updateEpButtons, 100);

    // Carregamento padrão: não faz cache de vídeos
}

window.addEventListener('DOMContentLoaded', carregarAnime);