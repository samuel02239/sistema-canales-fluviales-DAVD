/* ═══════════════════════════════════════════════════════════════
   SEARCH-DASHBOARD.JS
   Módulo independiente y aislado de script.js.
   Añade:
     1) Buscador por barrio o nombre del canal (con resultados
        desplegables y filtrado en vivo del mapa).
     2) Botón "Dashboard" que redirige a DATACE.html.

   No modifica la lógica original de script.js. Solo consume la
   pequeña API de lectura que script.js expone en
   `window.__canalesAPI` (ver bloque final de script.js).
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   UTILIDADES
   ───────────────────────────────────────────────────────────── */
function normalizar(texto) {
  return (texto || '')
    .toString()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes
    .toLowerCase()
    .trim();
}

function esperarAPI() {
  return new Promise((resolve) => {
    const check = setInterval(() => {
      if (window.__canalesAPI) {
        clearInterval(check);
        resolve(window.__canalesAPI);
      }
    }, 100);
  });
}

/* ─────────────────────────────────────────────────────────────
   ESTADO LOCAL DEL BUSCADOR
   ───────────────────────────────────────────────────────────── */
let api = null;
let currentQuery = '';

/* ─────────────────────────────────────────────────────────────
   FILTRO COMBINADO
   Combina el texto de búsqueda con los filtros originales
   (localidad / estado) que ya existen en el topbar, sin tocar
   la función applyFilters original de script.js.
   ───────────────────────────────────────────────────────────── */
function coincideBusqueda(canal, query) {
  if (!query) return true;
  const q = normalizar(query);
  const nombre = normalizar(canal.nombre);
  const barrio = normalizar(canal.barrio);
  return nombre.includes(q) || barrio.includes(q);
}

function obtenerCanalesFiltradosBase() {
  const localidadVal = document.getElementById('filter-localidad')?.value || '';
  const estadoVal    = document.getElementById('filter-estado')?.value || '';
  const canales = api.getCanales();

  return canales.filter(c => {
    const matchL = !localidadVal || c.localidad === parseInt(localidadVal);
    const matchE = !estadoVal    || c.estado === estadoVal;
    return matchL && matchE;
  });
}

function aplicarBusqueda() {
  const base = obtenerCanalesFiltradosBase();
  const resultado = base.filter(c => coincideBusqueda(c, currentQuery));

  api.setFilteredCanales(resultado);
  api.renderAll(api.getCanales(), resultado);
  renderizarDropdown(resultado);
}

/* ─────────────────────────────────────────────────────────────
   DROPDOWN DE RESULTADOS
   ───────────────────────────────────────────────────────────── */
function renderizarDropdown(resultados) {
  const box = document.getElementById('search-results');
  if (!box) return;

  if (!currentQuery) {
    box.classList.remove('open');
    box.innerHTML = '';
    return;
  }

  if (resultados.length === 0) {
    box.innerHTML = `<div class="search-box__empty">Sin resultados para "${escapeHtml(currentQuery)}"</div>`;
    box.classList.add('open');
    return;
  }

  const items = resultados.slice(0, 8).map(c => `
    <button type="button" class="search-box__item" data-id="${c.id}">
      <span class="search-box__item-name">${escapeHtml(c.nombre)}</span>
      <span class="search-box__item-barrio">${escapeHtml(c.barrio || '—')}</span>
    </button>
  `).join('');

  const extra = resultados.length > 8
    ? `<div class="search-box__more">+${resultados.length - 8} resultado(s) más en el mapa</div>`
    : '';

  box.innerHTML = items + extra;
  box.classList.add('open');

  box.querySelectorAll('.search-box__item').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = parseInt(btn.dataset.id);
      api.focusCanalById(id);
      box.classList.remove('open');
    });
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

/* ─────────────────────────────────────────────────────────────
   INIT — BUSCADOR
   ───────────────────────────────────────────────────────────── */
function initBuscador() {
  const input      = document.getElementById('canal-search');
  const clearBtn   = document.getElementById('search-clear');
  const searchBox  = document.getElementById('search-box');
  const filterLoc  = document.getElementById('filter-localidad');
  const filterEst  = document.getElementById('filter-estado');
  const btnReset   = document.getElementById('btn-reset');

  if (!input) return;

  input.addEventListener('input', () => {
    currentQuery = input.value;
    clearBtn.style.display = currentQuery ? 'flex' : 'none';
    aplicarBusqueda();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      input.value = '';
      currentQuery = '';
      clearBtn.style.display = 'none';
      aplicarBusqueda();
      input.blur();
    }
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    currentQuery = '';
    clearBtn.style.display = 'none';
    aplicarBusqueda();
    input.focus();
  });

  // Cierra el dropdown al hacer clic fuera
  document.addEventListener('click', (e) => {
    if (searchBox && !searchBox.contains(e.target)) {
      document.getElementById('search-results')?.classList.remove('open');
    }
  });

  // Si el usuario cambia los filtros originales (localidad/estado),
  // reaplicamos también la búsqueda por encima de ese resultado.
  filterLoc?.addEventListener('change', () => setTimeout(aplicarBusqueda, 0));
  filterEst?.addEventListener('change', () => setTimeout(aplicarBusqueda, 0));

  // Si el usuario limpia los filtros originales, limpiamos también el buscador.
  btnReset?.addEventListener('click', () => {
    input.value = '';
    currentQuery = '';
    clearBtn.style.display = 'none';
    setTimeout(aplicarBusqueda, 0);
  });
}

/* ─────────────────────────────────────────────────────────────
   INIT — BOTÓN DASHBOARD
   ───────────────────────────────────────────────────────────── */
function initDashboardBtn() {
  const btn = document.getElementById('btn-dashboard');
  if (!btn) return;

  btn.addEventListener('click', () => {
    window.location.href = 'DATACE.html';
  });
}

/* ─────────────────────────────────────────────────────────────
   ARRANQUE
   ───────────────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  initDashboardBtn(); // no depende de los datos de canales, puede iniciar ya

  esperarAPI().then((canalesAPI) => {
    api = canalesAPI;
    initBuscador();
  });
});