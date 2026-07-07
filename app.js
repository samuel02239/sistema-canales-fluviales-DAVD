// =========================================================================
// Canales Fluviales · Panel de completitud — datos en tiempo real (Firebase)
// =========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  getDatabase,
  off,
  onValue,
  ref
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-database.js";

// ---- Configuración de tu proyecto de Firebase ----
const firebaseConfig = {
  apiKey: "AIzaSyAZWt1Lt0zw7NOPiBGeBtaAKD3XM_F1-1k",
  authDomain: "canalesfluviales.firebaseapp.com",
  databaseURL: "https://canalesfluviales-default-rtdb.firebaseio.com",
  projectId: "canalesfluviales",
  storageBucket: "canalesfluviales.firebasestorage.app",
  messagingSenderId: "778776793484",
  appId: "1:778776793484:web:ebdf4a3b42c446f26dc6a9"
};

// Ruta dentro de la base de datos donde viven los canales.
// Coincide con la estructura del export: { "canales": { "1": {...}, "2": {...} } }
const DB_PATH = "canales";

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

(function () {
  const FIELDS = [
    { key: 'barrio', label: 'Barrio' },
    { key: 'cuenca', label: 'Cuenca' },
    { key: 'inicio', label: 'Punto de inicio' },
    { key: 'final', label: 'Punto final' },
    { key: 'longitud', label: 'Longitud' },
    { key: 'seccion', label: 'Sección' },
    { key: 'revestimiento', label: 'Revestimiento' },
    { key: 'riesgo', label: 'Riesgo' },
    { key: 'ficha', label: 'Ficha técnica' },
    { key: 'informe', label: 'Informe' },
    { key: 'plano', label: 'Plano' },
    { key: 'videos', label: 'Videos' },
  ];
  const ESTADO_COLOR = { 'Bueno': 'var(--green)', 'Regular': 'var(--amber)', 'Deficiente': 'var(--amber-strong)', 'Crítico': 'var(--red)' };
  const PAGE_SIZE = 100;

  let RECORDS = [];
  let sortKey = 'id', sortDir = 1;
  let currentPage = 1;
  let connectedToFirebase = false;

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));
  const nf = (n) => Number(n).toLocaleString('es-CO');

  function isMissing(v) {
    if (v === undefined || v === null) return true;
    if (Array.isArray(v)) return v.length === 0;
    if (typeof v === 'string') {
      const t = v.trim();
      return t === '' || t === '—' || t === '-' || t.toLowerCase() === 'n/a';
    }
    return false;
  }

  function extractRecords(json) {
    let root = json;
    if (root && typeof root === 'object' && !Array.isArray(root) && root.canales) {
      root = root.canales;
    }
    let arr = [];
    if (Array.isArray(root)) {
      arr = root.filter(Boolean).map((r, i) => ({ _key: String(i), ...r }));
    } else if (root && typeof root === 'object') {
      arr = Object.keys(root).map(k => ({ _key: k, ...root[k] }));
    }
    return arr;
  }

  function computeRecordCompleteness(r) {
    let present = 0;
    FIELDS.forEach(f => { if (!isMissing(r[f.key])) present++; });
    return present / FIELDS.length * 100;
  }

  // ---------- estado del panel de carga / conexión ----------
  function setStatus(kind, title, sub, showActions) {
    const panel = $('#statusPanel');
    panel.classList.remove('state-loading', 'state-error', 'state-ok');
    panel.classList.add('state-' + kind);
    $('#spTitle').textContent = title;
    $('#spSub').innerHTML = sub;
    $('#spActions').classList.toggle('hidden', !showActions);
    const iconSvg = {
      loading: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9" stroke-dasharray="42 14"/></svg>',
      error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 8v5M12 16h.01"/><circle cx="12" cy="12" r="9"/></svg>',
      ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 13l4 4L19 7"/></svg>'
    };
    $('#spIcon').innerHTML = iconSvg[kind] || iconSvg.loading;
    updateLiveDot(kind);
  }

  function updateLiveDot(kind) {
    const dot = $('#liveDot');
    dot.classList.remove('err', 'loading');
    if (kind === 'error') dot.classList.add('err');
    if (kind === 'loading') dot.classList.add('loading');
    $('#metaStatus').textContent =
      kind === 'ok' ? 'En vivo · Firebase' :
      kind === 'error' ? 'Sin conexión' : 'Conectando…';
  }

  function stampUpdatedNow() {
    $('#metaDate').textContent = new Date().toLocaleString('es-CO', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  function ingest(json, sourceLabel) {
    const recs = extractRecords(json);
    if (!recs.length) {
      setStatus('error', 'No hay registros en la base de datos', 'La conexión con Firebase funciona, pero no se encontraron canales bajo la clave <code>' + DB_PATH + '</code>.', true);
      $('#app').classList.add('hidden');
      return;
    }
    RECORDS = recs.map(r => ({ ...r, completeness: computeRecordCompleteness(r) }));
    setStatus('ok', 'Datos en tiempo real conectados', sourceLabel, false);
    $('#statusPanel').classList.add('hidden');
    $('#metaCount').textContent = nf(RECORDS.length);
    stampUpdatedNow();
    $('#app').classList.remove('hidden');
    $('#emptyNote').classList.add('hidden');
    if (currentPage < 1) currentPage = 1;
    render();
  }

  // ---------- conexión a Firebase Realtime Database ----------
  let dataRefHandle = null;

  function connectRealtime() {
    setStatus('loading', 'Conectando con Firebase…', `Suscribiéndose en tiempo real a <code>${DB_PATH}</code> en <code>${firebaseConfig.databaseURL}</code>.`, false);

    // Indicador de conexión del socket con Firebase (no de los datos en sí)
    const connectedRef = ref(db, '.info/connected');
    onValue(connectedRef, (snap) => {
      connectedToFirebase = snap.val() === true;
      if (!connectedToFirebase && !RECORDS.length) {
        setStatus('loading', 'Conectando con Firebase…', `Esperando conexión con <code>${firebaseConfig.databaseURL}</code>.`, false);
      }
    });

    const dataRef = ref(db, DB_PATH);
    dataRefHandle = dataRef;
    onValue(
      dataRef,
      (snapshot) => {
        const val = snapshot.val();
        if (val === null) {
          setStatus('error', 'La ruta está vacía', `No hay datos en <code>${DB_PATH}</code> dentro de la base de datos de Firebase.`, true);
          $('#app').classList.add('hidden');
          return;
        }
        ingest(val, `Actualizado automáticamente en tiempo real desde Firebase Realtime Database (<code>${DB_PATH}</code>). Cualquier cambio en la base de datos se refleja aquí al instante.`);
      },
      (error) => {
        setStatus(
          'error',
          'No se pudo conectar con Firebase',
          `Revisa las reglas de seguridad de tu Realtime Database (deben permitir lectura en <code>${DB_PATH}</code>) y tu conexión a internet. Detalle: ${error.message}.`,
          true
        );
        $('#app').classList.add('hidden');
      }
    );
  }

  $('#retryBtn').addEventListener('click', () => {
    if (dataRefHandle) off(dataRefHandle);
    connectRealtime();
  });

  // ---- controls wiring ----
  $('#searchBox').addEventListener('input', () => { currentPage = 1; render(); });
  $('#filterLocalidad').addEventListener('change', () => { currentPage = 1; render(); });
  $('#filterEstado').addEventListener('change', () => { currentPage = 1; render(); });
  $('#onlyIncomplete').addEventListener('change', () => { currentPage = 1; render(); });
  $$('.tabbtns button').forEach(b => {
    b.addEventListener('click', () => {
      $$('.tabbtns button').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      currentPage = 1;
      render();
    });
  });
  $$('thead th').forEach(th => {
    th.addEventListener('click', () => {
      const key = th.dataset.key;
      if (sortKey === key) sortDir *= -1; else { sortKey = key; sortDir = 1; }
      render();
    });
  });
  $('#pagerFirst').addEventListener('click', () => { currentPage = 1; renderList(); });
  $('#pagerPrev').addEventListener('click', () => { currentPage = Math.max(1, currentPage - 1); renderList(); });
  $('#pagerNext').addEventListener('click', () => { currentPage = currentPage + 1; renderList(); });
  $('#pagerLast').addEventListener('click', () => { currentPage = Infinity; renderList(); });

  function currentView() {
    const active = $('.tabbtns button.active');
    return active ? active.dataset.view : 'list';
  }

  function applyFilters(list) {
    const q = $('#searchBox').value.trim().toLowerCase();
    const loc = $('#filterLocalidad').value;
    const est = $('#filterEstado').value;
    const onlyInc = $('#onlyIncomplete').checked;
    return list.filter(r => {
      if (q) {
        const hay = ((r.nombre || '') + ' ' + (r.barrio || '')).toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (loc && r.localidadNombre !== loc) return false;
      if (est && r.estado !== est) return false;
      if (onlyInc && r.completeness >= 100) return false;
      return true;
    });
  }

  function fmtPct(n) { return Math.round(n) + '%'; }

  function fieldValueDisplay(f, v) {
    if (isMissing(v)) return '— falta —';
    if (Array.isArray(v)) return v.map(u => `<a href="${u}" target="_blank" rel="noopener">enlace</a>`).join(', ');
    if (typeof v === 'string' && /^https?:\/\//.test(v)) return `<a href="${v}" target="_blank" rel="noopener">ver documento</a>`;
    return v;
  }

  function renderDetailRow(r) {
    const items = FIELDS.map(f => {
      const missing = isMissing(r[f.key]);
      return `<div class="detail-item ${missing ? 'miss' : ''}">
        <span class="k">${f.label}</span>
        <span class="v">${missing ? '<span class="missing-x">✕ falta</span>' : fieldValueDisplay(f, r[f.key])}</span>
      </div>`;
    }).join('');
    return `<div class="detail-grid">${items}</div>`;
  }

  function sortedFiltered() {
    let rows = applyFilters(RECORDS.slice());
    rows.sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey];
      if (sortKey === 'completeness') { av = a.completeness; bv = b.completeness; }
      if (av === undefined || av === null) av = '';
      if (bv === undefined || bv === null) bv = '';
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
    return rows;
  }

  function renderList() {
    const tbody = $('#tableBody');
    const rows = sortedFiltered();
    $$('thead th').forEach(th => {
      th.classList.toggle('sorted', th.dataset.key === sortKey);
      const arrow = th.querySelector('.arrow');
      if (arrow) arrow.remove();
      if (th.dataset.key === sortKey) {
        th.insertAdjacentHTML('beforeend', `<span class="arrow">${sortDir > 0 ? '▲' : '▼'}</span>`);
      }
    });

    $('#resultsCount').textContent = rows.length ? `${nf(rows.length)} de ${nf(RECORDS.length)} canales` : '';

    const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    const pageRows = rows.slice(startIdx, startIdx + PAGE_SIZE);

    $('#pagerInfo').textContent = rows.length
      ? `Mostrando ${nf(startIdx + 1)}–${nf(Math.min(startIdx + PAGE_SIZE, rows.length))} de ${nf(rows.length)} · página ${currentPage} de ${totalPages}`
      : 'Sin resultados';
    $('#pagerFirst').disabled = currentPage <= 1;
    $('#pagerPrev').disabled = currentPage <= 1;
    $('#pagerNext').disabled = currentPage >= totalPages;
    $('#pagerLast').disabled = currentPage >= totalPages;
    $('#pager').classList.toggle('hidden', rows.length <= PAGE_SIZE);

    if (!rows.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:26px; color:var(--paper-dim);">No hay canales que coincidan con estos filtros.</td></tr>`;
      return;
    }

    tbody.innerHTML = pageRows.map((r, i) => {
      const color = r.completeness >= 80 ? 'var(--green)' : r.completeness >= 50 ? 'var(--amber)' : 'var(--amber-strong)';
      const estColor = ESTADO_COLOR[r.estado] || 'var(--paper-dim)';
      return `<tr data-key="${r._key}" class="${i % 2 ? 'even' : ''}">
        <td>${r.id ?? r._key}</td>
        <td>${r.nombre || '—'}</td>
        <td>${r.localidadNombre || '—'}</td>
        <td><span class="badge" style="color:${estColor};">${r.estado || '—'}</span></td>
        <td>${r.disenios || '—'}</td>
        <td>
          <div class="prog-cell">
            <div class="prog-track"><div class="prog-fill" style="width:${r.completeness}%; background:${color};"></div></div>
            <span style="font-family:'IBM Plex Mono', monospace; font-size:12px; color:${color}; font-weight:600;">${fmtPct(r.completeness)}</span>
          </div>
        </td>
      </tr>
      <tr class="detail-row hidden" data-detail="${r._key}"><td colspan="6">${renderDetailRow(r)}</td></tr>`;
    }).join('');

    $$('tbody tr[data-key]').forEach(tr => {
      tr.addEventListener('click', () => {
        const detail = $(`tr[data-detail="${tr.dataset.key}"]`);
        detail.classList.toggle('hidden');
      });
    });
  }

  function groupRecords(byKey) {
    const groups = {};
    applyFilters(RECORDS).forEach(r => {
      const g = r[byKey] || '—';
      if (!groups[g]) groups[g] = [];
      groups[g].push(r);
    });
    return groups;
  }

  function renderGroupView(byKey) {
    const groups = groupRecords(byKey);
    const wrap = $('#groupView');
    const keys = Object.keys(groups).sort();
    if (!keys.length) {
      wrap.innerHTML = `<p class="empty-note">No hay canales que coincidan con estos filtros.</p>`;
      return;
    }
    $('#resultsCount').textContent = `${nf(keys.length)} grupos`;
    wrap.innerHTML = keys.map(g => {
      const list = groups[g];
      const avg = list.reduce((s, r) => s + r.completeness, 0) / list.length;
      const color = avg >= 80 ? 'var(--green)' : avg >= 50 ? 'var(--amber)' : 'var(--amber-strong)';
      const rows = list.slice().sort((a, b) => b.completeness - a.completeness).map(r => {
        const c = r.completeness >= 80 ? 'var(--green)' : r.completeness >= 50 ? 'var(--amber)' : 'var(--amber-strong)';
        return `<div class="mini-row"><span class="mini-name">${r.nombre || '—'}</span>
          <span class="mini-val"><span class="dot" style="background:${c};"></span>${fmtPct(r.completeness)}</span></div>`;
      }).join('');
      return `<div class="group-card">
        <div class="group-head" data-group="${g}">
          <span class="group-name">${g}</span>
          <span class="group-meta">
            <span>${nf(list.length)} canal(es)</span>
            <span style="color:${color};">Prom. ${fmtPct(avg)}</span>
          </span>
        </div>
        <div class="group-body scroll-cap" data-body="${g}">${rows}</div>
      </div>`;
    }).join('');
    $$('.group-head', wrap).forEach(h => {
      h.addEventListener('click', () => {
        $(`.group-body[data-body="${h.dataset.group}"]`).classList.toggle('open');
      });
    });
  }

  function populateFilterOptions() {
    const locSel = $('#filterLocalidad'), estSel = $('#filterEstado');
    const prevLoc = locSel.value, prevEst = estSel.value;
    const locs = Array.from(new Set(RECORDS.map(r => r.localidadNombre).filter(Boolean))).sort();
    const ests = Array.from(new Set(RECORDS.map(r => r.estado).filter(Boolean))).sort();
    locSel.innerHTML = '<option value="">Todas las localidades</option>' + locs.map(l => `<option value="${l}">${l}</option>`).join('');
    estSel.innerHTML = '<option value="">Todos los estados</option>' + ests.map(e => `<option value="${e}">${e}</option>`).join('');
    if (locs.includes(prevLoc)) locSel.value = prevLoc;
    if (ests.includes(prevEst)) estSel.value = prevEst;
  }

  function renderDashboard() {
    const total = RECORDS.length;
    const fieldStats = FIELDS.map(f => {
      const missing = RECORDS.filter(r => isMissing(r[f.key])).length;
      return { ...f, missing, pctMissing: total ? missing / total * 100 : 0 };
    }).sort((a, b) => b.pctMissing - a.pctMissing);

    const overallPresentSlots = RECORDS.reduce((s, r) => s + FIELDS.filter(f => !isMissing(r[f.key])).length, 0);
    const overallTotalSlots = total * FIELDS.length;
    const overallPct = overallTotalSlots ? overallPresentSlots / overallTotalSlots * 100 : 0;

    $('#fieldsChip').textContent = `${FIELDS.length} campos`;
    $('#cardTotal').textContent = nf(total);
    const locCount = new Set(RECORDS.map(r => r.localidadNombre).filter(Boolean)).size;
    $('#cardTotalSub').textContent = locCount ? `en ${nf(locCount)} localidades` : '';

    const worst = fieldStats[0], best = fieldStats[fieldStats.length - 1];
    $('#cardWorstPct').textContent = fmtPct(worst.pctMissing);
    $('#cardWorstField').textContent = `${worst.label} (${nf(worst.missing)} de ${nf(total)} canales)`;
    $('#cardBestPct').textContent = fmtPct(best.pctMissing);
    $('#cardBestField').textContent = `${best.label} (${nf(best.missing)} de ${nf(total)} canales)`;

    $('#stampPct').textContent = fmtPct(overallPct);
    const stampColor = overallPct >= 80 ? 'var(--green)' : overallPct >= 50 ? 'var(--amber)' : 'var(--amber-strong)';
    $('#stampCircle').style.setProperty('--stamp-color', stampColor);
    $('#stampWord').textContent = overallPct >= 95 ? 'completo' : overallPct >= 50 ? 'en curso' : 'incompleto';

    $('#barList').innerHTML = fieldStats.map(f => `
      <div class="bar-row">
        <span class="bar-label">${f.label}</span>
        <div class="bar-track"><div class="bar-fill" style="width:${f.pctMissing}%;"></div></div>
        <span class="bar-pct">${fmtPct(f.pctMissing)} <span class="n">(${nf(f.missing)})</span></span>
      </div>`).join('');

    // by localidad
    const locGroups = {};
    RECORDS.forEach(r => { const g = r.localidadNombre || '—'; (locGroups[g] = locGroups[g] || []).push(r); });
    const locKeys = Object.keys(locGroups).sort((a, b) => locGroups[b].length - locGroups[a].length);
    $('#byLocalidad').innerHTML = locKeys.map(g => {
      const list = locGroups[g];
      const avg = list.reduce((s, r) => s + r.completeness, 0) / list.length;
      const c = avg >= 80 ? 'var(--green)' : avg >= 50 ? 'var(--amber)' : 'var(--amber-strong)';
      return `<div class="mini-row"><span class="mini-name">${g} <span style="color:var(--paper-dim);">(${nf(list.length)})</span></span>
        <span class="mini-val"><span class="dot" style="background:${c};"></span>${fmtPct(avg)}</span></div>`;
    }).join('') || '<p class="card-sub">Sin datos.</p>';

    // by estado
    const estGroups = {};
    RECORDS.forEach(r => { const g = r.estado || '—'; (estGroups[g] = estGroups[g] || []).push(r); });
    const estKeys = Object.keys(estGroups).sort((a, b) => estGroups[b].length - estGroups[a].length);
    $('#byEstado').innerHTML = estKeys.map(g => {
      const list = estGroups[g];
      const c = ESTADO_COLOR[g] || 'var(--paper-dim)';
      return `<div class="mini-row"><span class="mini-name">${g}</span>
        <span class="mini-val"><span class="dot" style="background:${c};"></span>${nf(list.length)} canal(es)</span></div>`;
    }).join('') || '<p class="card-sub">Sin datos.</p>';
  }

  function render() {
    if (!RECORDS.length) return;
    populateFilterOptions();
    renderDashboard();
    const view = currentView();
    if (view === 'list') {
      $('#listView').classList.remove('hidden');
      $('#groupView').classList.add('hidden');
      renderList();
    } else {
      $('#listView').classList.add('hidden');
      $('#groupView').classList.remove('hidden');
      renderGroupView(view === 'localidad' ? 'localidadNombre' : 'estado');
    }
  }

  // arrancar: se suscribe en tiempo real a Firebase Realtime Database
  connectRealtime();
})();