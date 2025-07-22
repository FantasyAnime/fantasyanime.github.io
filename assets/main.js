let animesOriginais = [];

async function carregarAnimes(retry = 0) {
    const grid = document.getElementById('animesGrid');
    const errorDiv = document.getElementById('animeError');
    if (errorDiv) errorDiv.style.display = 'none';
    try {
        // Caminho relativo e cache busting para GitHub Pages
        const res = await fetch('./animes.json?v=' + Date.now());
        if (!res.ok) throw new Error('Erro ao buscar animes.json: ' + res.status);
        const animes = await res.json();
        console.log('Animes carregados:', animes);
        animesOriginais = animes;
        preencherFiltroAno(animes);
        renderizarAnimes(animes);
    } catch (e) {
        console.error('Erro ao carregar animes:', e);
        if (retry < 2) {
            setTimeout(() => carregarAnimes(retry + 1), 1000); // tenta de novo
        } else {
            if (grid) grid.innerHTML = '';
            if (errorDiv) {
                errorDiv.style.display = 'block';
                errorDiv.textContent = 'Erro ao carregar animes. Verifique se animes.json está publicado e acessível.';
            }
        }
    }
}

function preencherFiltroAno(animes) {
    const select = document.getElementById('filterAno');
    if (!select) return;
    const anos = Array.from(new Set(animes.map(a => a.ano))).filter(Boolean).sort((a, b) => b - a);
    select.innerHTML = '<option value="">Ano</option>' + anos.map(ano => `<option value="${ano}">${ano}</option>`).join('');
}

function renderizarAnimes(animes) {
    const grid = document.getElementById('animesGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!animes || !animes.length) {
        grid.innerHTML = '<p>Nenhum anime encontrado.</p>';
        return;
    }
    animes.forEach(anime => {
        if (!anime.nome || !anime.capa || !anime.episodios) return;
        const tipo = anime.episodios.length === 1 ? 'Filme' : 'Série';
        const card = document.createElement('div');
        card.className = 'anime-card';
        // Link já com ep=1
        card.innerHTML = `
            <a href="anime.html?id=${anime.id}&ep=1">
                <img src="${anime.capa}" alt="Capa de ${anime.nome}">
                <h3>${anime.nome}</h3>
                <div class="anime-meta">
                    <span>${anime.ano || ''}</span> · <span>${tipo}</span>
                </div>
            </a>
        `;
        grid.appendChild(card);
    });
}

function filtrarAnimes() {
    const texto = document.getElementById('searchInput')?.value.toLowerCase() || '';
    const tipo = document.getElementById('filterTipo')?.value || '';
    const ano = document.getElementById('filterAno')?.value || '';
    // Sempre parte de todos os animes carregados
    let filtrados = (animesOriginais || []).filter(anime => {
        const nomeMatch = anime.nome && anime.nome.toLowerCase().includes(texto);
        const tipoMatch = !tipo || (tipo === 'filme' && anime.episodios.length === 1) || (tipo === 'serie' && anime.episodios.length > 1);
        const anoMatch = !ano || String(anime.ano) === String(ano);
        return nomeMatch && tipoMatch && anoMatch;
    });
    // Ordena por ano decrescente, depois por nome
    filtrados.sort((a, b) => {
        if (b.ano !== a.ano) return b.ano - a.ano;
        return a.nome.localeCompare(b.nome);
    });
    // Debug
    // console.log('Filtro:', {texto, tipo, ano, total: animesOriginais.length, filtrados: filtrados.length});
    renderizarAnimes(filtrados);
}

document.addEventListener('DOMContentLoaded', () => {
    carregarAnimes();
    document.getElementById('searchInput')?.addEventListener('input', filtrarAnimes);
    document.getElementById('filterTipo')?.addEventListener('change', filtrarAnimes);
    document.getElementById('filterAno')?.addEventListener('change', filtrarAnimes);
}); 