/* ═══════════════════════════════════════════════════════════════
   VISOR SIG — CANALES PLUVIALES CARTAGENA DE INDIAS
   script.js — v4 (Firebase Realtime DB + Links multimedia)
   ═══════════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   FIREBASE — Realtime Database
   ───────────────────────────────────────────────────────────── */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, set, get, remove, onValue, off
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';

const firebaseConfig = {
  apiKey:            'AIzaSyAZWt1Lt0zw7NOPiBGeBtaAKD3XM_F1-1k',
  authDomain:        'canalesfluviales.firebaseapp.com',
  databaseURL:       'https://canalesfluviales-default-rtdb.firebaseio.com',
  projectId:         'canalesfluviales',
  storageBucket:     'canalesfluviales.firebasestorage.app',
  messagingSenderId: '778776793484',
  appId:             '1:778776793484:web:ebdf4a3b42c446f26dc6a9'
};

const fbApp = initializeApp(firebaseConfig);
const db    = getDatabase(fbApp);

/* ─── Helpers Firebase ─── */
function fbRef(path)          { return ref(db, path); }
function fbSet(path, value)   { return set(fbRef(path), value); }
function fbGet(path)          { return get(fbRef(path)).then(s => s.val()); }
function fbRemove(path)       { return remove(fbRef(path)); }

/* ─────────────────────────────────────────────────────────────
   CONSTANTES
   ───────────────────────────────────────────────────────────── */
const LOCALIDAD_NAMES = {
  1: 'Histórica y del Caribe Norte',
  2: 'De la Virgen y Turística',
  3: 'Industrial de la Bahía'
};

const ADMIN_CREDENTIALS = {
  user: 'Admin',
  pass: 'Valo2026'
   
};

const ETAPAS = ['Diagnóstico', 'Factibilidad', 'Diseño de detalle'];

/* ─────────────────────────────────────────────────────────────
   ESTADO GLOBAL
   ───────────────────────────────────────────────────────────── */
let canales         = [];
let filteredCanales = [];
let boxculverts        = [];
let filteredBoxculverts= [];
let map             = null;
let markersLayer    = null;
let linesLayer      = null;
let bcMarkersLayer  = null;
let activeMarker    = null;
let activeCanal     = null;
let activeEntityType= 'canal';   // 'canal' | 'boxculvert' — tipo de la entidad activa en el panel
let editingId       = null;
let editingType     = 'canal';   // 'canal' | 'boxculvert' — tipo de la entidad que se está editando en el modal

let showPuntos  = true;
let showLineas  = true;
let isAdmin     = false;

let pickPointMode = false;
let pickPointType = 'canal'; // 'canal' | 'boxculvert' — qué se está creando al elegir un punto
let drawMode      = false;
let drawCanal     = null;
let drawPoints    = [];
let drawPolyline  = null;
let drawMarkers   = [];

/* ─────────────────────────────────────────────────────────────
   PERSISTENCIA — Firebase Realtime Database
   Estructura: /canales/{id} = objeto canal (sin base64)
   Los links de multimedia van dentro del objeto canal:
     videos: [ url, url, ... ]
     plano: url | null
     ficha: url | null
     informe: url | null
     fotos: [ url, url, ... ]
   ───────────────────────────────────────────────────────────── */

/** Limpia un canal para guardar en Firebase (elimina nulls innecesarios) */
function cleanForDB(c) {
  return {
    id:             c.id,
    nombre:         c.nombre         || '',
    cuenca:         c.cuenca         || '—',
    localidad:      c.localidad      || 1,
    localidadNombre:c.localidadNombre|| '',
    barrio:         c.barrio         || '—',
    longitud:       c.longitud       || '—',
    inicio:         c.inicio         || '—',
    final:          c.final          || '—',
    seccion:        c.seccion        || '—',
    revestimiento:  c.revestimiento  || '—',
    disenios:       c.disenios       || 'No',
    estado:         c.estado         || 'Regular',
    riesgo:         c.riesgo         || '—',
    etapa:          c.etapa          || 'Diagnóstico',
    beneficiarios:  Number.isFinite(c.beneficiarios) ? c.beneficiarios : (parseInt(c.beneficiarios) || 0),
    lat:            c.lat,
    lng:            c.lng,
    color:          c.color          || null,
    trazado:        c.trazado        || null,
    // Multimedia como links
    videos:  Array.isArray(c.videos) ? c.videos.filter(v => v && v.trim()) : [],
    plano:   c.plano   || null,
    ficha:   c.ficha   || null,
    informe: c.informe || null,
    fotos:   Array.isArray(c.fotos)  ? c.fotos.filter(f => f && f.trim())  : [],
    // Comentarios del ingeniero/administrador sobre el canal
    comentarios: Array.isArray(c.comentarios) ? c.comentarios : [],
  };
}

/** Guarda UN canal en Firebase */
async function saveCanal(canal) {
  const data = cleanForDB(canal);
  try {
    await fbSet(`canales/${canal.id}`, data);
    showSyncIndicator('✓ Guardado en Firebase', 'ok');
  } catch (e) {
    console.error('Error guardando en Firebase:', e);
    showSyncIndicator('✗ Error al guardar', 'error');
  }
}

/** Elimina un canal de Firebase */
async function removeCanal(id) {
  try {
    await fbRemove(`canales/${id}`);
    showSyncIndicator('✓ Canal eliminado de Firebase', 'ok');
  } catch (e) {
    console.error('Error eliminando canal:', e);
    showSyncIndicator('✗ Error al eliminar', 'error');
  }
}

/** Carga todos los canales desde Firebase (una sola vez al iniciar) */
async function loadCanalesFromFirebase() {
  try {
    const data = await fbGet('canales');
    if (!data) return [];
    // data es un objeto { id: canal, ... }
    return Object.values(data).map(c => ({
      ...c,
      videos: Array.isArray(c.videos) ? c.videos : [],
      fotos:  Array.isArray(c.fotos)  ? c.fotos  : [],
      comentarios: Array.isArray(c.comentarios) ? c.comentarios : [],
      etapa: c.etapa || 'Diagnóstico',
      beneficiarios: Number.isFinite(c.beneficiarios) ? c.beneficiarios : (parseInt(c.beneficiarios) || 0),
    }));
  } catch (e) {
    console.error('Error cargando desde Firebase:', e);
    showSyncIndicator('✗ Error al cargar datos', 'error');
    return [];
  }
}

/* ─────────────────────────────────────────────────────────────
   BOX CULVERTS — Persistencia separada en Firebase
   Estructura: /boxculverts/{id} = objeto box culvert
   (mismo esquema que un canal, pero en su propia colección para
   no mezclarlos con los canales)
   ───────────────────────────────────────────────────────────── */

/** Guarda UN box culvert en Firebase */
async function saveBoxculvert(entity) {
  const data = cleanForDB(entity);
  try {
    await fbSet(`boxculverts/${entity.id}`, data);
    showSyncIndicator('✓ Guardado en Firebase', 'ok');
  } catch (e) {
    console.error('Error guardando box culvert en Firebase:', e);
    showSyncIndicator('✗ Error al guardar', 'error');
  }
}

/** Elimina un box culvert de Firebase */
async function removeBoxculvertFB(id) {
  try {
    await fbRemove(`boxculverts/${id}`);
    showSyncIndicator('✓ Box culvert eliminado de Firebase', 'ok');
  } catch (e) {
    console.error('Error eliminando box culvert:', e);
    showSyncIndicator('✗ Error al eliminar', 'error');
  }
}

/** Carga todos los box culverts desde Firebase */
async function loadBoxculvertsFromFirebase() {
  try {
    const data = await fbGet('boxculverts');
    if (!data) return [];
    return Object.values(data).map(c => ({
      ...c,
      videos: Array.isArray(c.videos) ? c.videos : [],
      fotos:  Array.isArray(c.fotos)  ? c.fotos  : [],
      comentarios: Array.isArray(c.comentarios) ? c.comentarios : [],
      etapa: c.etapa || 'Diagnóstico',
      beneficiarios: Number.isFinite(c.beneficiarios) ? c.beneficiarios : (parseInt(c.beneficiarios) || 0),
    }));
  } catch (e) {
    console.error('Error cargando box culverts desde Firebase:', e);
    showSyncIndicator('✗ Error al cargar datos', 'error');
    return [];
  }
}

/* ─────────────────────────────────────────────────────────────
   SYNC INDICATOR
   ───────────────────────────────────────────────────────────── */
let _syncIndicatorTimer = null;

function showSyncIndicator(msg, type) {
  let el = document.getElementById('sync-indicator');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sync-indicator';
    el.style.cssText = [
      'position:fixed', 'bottom:16px', 'right:16px',
      'background:#0d1117', 'border:1px solid rgba(77,159,255,0.25)',
      'border-radius:8px', 'padding:7px 13px',
      'font-size:11px', "font-family:'Space Mono',monospace",
      'z-index:9998', 'transition:opacity 0.3s',
      'box-shadow:0 4px 16px rgba(0,0,0,0.4)'
    ].join(';');
    document.body.appendChild(el);
  }
  const color = type === 'ok' ? '#22c55e' : type === 'warn' ? '#f5a623' : '#ef4444';
  el.style.color        = color;
  el.style.borderColor  = color + '44';
  el.style.opacity      = '1';
  el.textContent        = msg;
  clearTimeout(_syncIndicatorTimer);
  _syncIndicatorTimer   = setTimeout(() => { el.style.opacity = '0'; }, 3500);
}

/* ─────────────────────────────────────────────────────────────
   INICIALIZACIÓN
   ───────────────────────────────────────────────────────────── */
async function initApp() {
  showSyncIndicator('⏳ Cargando datos...', 'warn');

  canales = await loadCanalesFromFirebase();
  filteredCanales = [...canales];

  boxculverts = await loadBoxculvertsFromFirebase();
  filteredBoxculverts = [...boxculverts];

  initMap();
  initLegend();
  initFilters();
  initLayerToggles();
  initCRUD();
  initDrawTools();
  initAdminToggle();
  initLoginModal();
  initModalMultimedia();
  initComentarios();

  renderAll(canales, filteredCanales);
  renderBoxculverts();
  applyAdminState();
}

/* ─────────────────────────────────────────────────────────────
   MAPA
   ───────────────────────────────────────────────────────────── */
function initMap() {
  map = L.map('map', {
    center: [10.3910, -75.4794],
    zoom: 12,
    minZoom: 10,
    maxZoom: 19,
    zoomControl: true,
    attributionControl: true
  });

  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 19
  });

  const satelliteLayer = L.tileLayer(
    'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    { attribution: 'Tiles &copy; Esri', maxZoom: 19 }
  );

  const hybridLabels = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, opacity: 0.6
  });

  const hybridGroup = L.layerGroup([satelliteLayer, hybridLabels]);

  const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
    attribution: 'Map data: &copy; OpenStreetMap | Style: &copy; OpenTopoMap',
    maxZoom: 17
  });

  osmLayer.addTo(map);
  L.control.layers(
    { 'Calles (OSM)': osmLayer, 'Satélite': satelliteLayer, 'Híbrido': hybridGroup, 'Topográfico': topoLayer },
    null, { position: 'topright', collapsed: true }
  ).addTo(map);

  linesLayer   = L.layerGroup().addTo(map);
  markersLayer = L.layerGroup().addTo(map);
  bcMarkersLayer = L.layerGroup().addTo(map);

  map.on('click', (e) => {
    if (drawMode)      { addDrawPoint(e.latlng); return; }
    if (pickPointMode) { finishPickPoint(e.latlng); return; }
    if (activeMarker) {
      getMarkerEl(activeMarker)?.classList.remove('active');
      activeMarker = null;
    }
    activeCanal = null;
    activeEntityType = 'canal';
    closePanel();
  });

  map.on('dblclick', (e) => {
    if (drawMode) { e.originalEvent.stopPropagation(); finishDraw(); }
  });
}

/* ─────────────────────────────────────────────────────────────
   RENDER ALL
   ───────────────────────────────────────────────────────────── */
function renderAll(allData, visibleData) {
  markersLayer.clearLayers();
  linesLayer.clearLayers();

  allData.forEach(canal => {
    if (canal.trazado && canal.trazado.length >= 2) drawCanalLine(canal);
  });

  visibleData.forEach(canal => {
    createMarker(canal).addTo(markersLayer);
  });

  applyLayerVisibility();
  updateStats(allData, visibleData);
}

function drawCanalLine(canal) {
  const color = canal.color || getEstadoColor(canal.estado);
  const line = L.polyline(canal.trazado, {
    color, weight: 4, opacity: 0.75, smoothFactor: 1,
    lineCap: 'round', lineJoin: 'round'
  });

  line.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    markersLayer.eachLayer(marker => {
      if (marker._canal?.id === canal.id) selectMarker(marker, canal);
    });
  });

  line.bindTooltip(
    `<strong>${canal.nombre}</strong><br/><span style="color:#6b7c99;font-size:10px">${canal.trazado.length} puntos · ${canal.estado}</span>`,
    { className: 'canal-tooltip', direction: 'top', sticky: true }
  );

  line._canalId = canal.id;
  line.addTo(linesLayer);
}

/* ─────────────────────────────────────────────────────────────
   MARCADORES
   ───────────────────────────────────────────────────────────── */
/** Obtiene el elemento visual interno de un marker, sea canal o box culvert */
function getMarkerEl(marker) {
  return marker?.getElement?.()?.querySelector('.canal-marker, .bc-marker');
}

function createMarker(canal) {
  const estadoClass = getEstadoClass(canal.estado);
  const customColor = canal.color || null;
  const colorStyle  = customColor ? `background:${customColor}!important;` : '';

  const icon = L.divIcon({
    className: '',
    html: `<div class="canal-marker ${estadoClass}" data-id="${canal.id}" style="${colorStyle}"></div>`,
    iconSize: [32, 32], iconAnchor: [16, 32], popupAnchor: [0, -36]
  });

  const marker = L.marker([canal.lat, canal.lng], { icon, draggable: isAdmin });

  marker.bindTooltip(
    `<strong>${canal.nombre}</strong><br/><span style="color:#6b7c99;font-size:10px">Canal #${canal.id} · ${canal.estado}</span>`,
    { className: 'canal-tooltip', direction: 'top', offset: [0, -8] }
  );

  marker.on('click', (e) => {
    if (drawMode) return;
    e.originalEvent.stopPropagation();
    selectMarker(marker, canal);
  });

  marker.on('dragend', async (e) => {
    const newLatLng = e.target.getLatLng();
    const idx = canales.findIndex(c => c.id === canal.id);
    if (idx !== -1) {
      canales[idx].lat = parseFloat(newLatLng.lat.toFixed(6));
      canales[idx].lng = parseFloat(newLatLng.lng.toFixed(6));
      canal.lat = canales[idx].lat;
      canal.lng = canales[idx].lng;
      await saveCanal(canales[idx]);
      if (activeCanal?.id === canal.id) {
        document.getElementById('p-coords').textContent =
          `${canal.lat.toFixed(5)}, ${canal.lng.toFixed(5)}`;
      }
      showToast(`Posición de ${canal.nombre} actualizada`, 'success');
    }
  });

  marker._canal = canal;
  marker._entityType = 'canal';
  return marker;
}

/** Crea el marcador de un Box Culvert — ícono distinto al del canal */
function createBoxculvertMarker(bc) {
  const estadoClass = getEstadoClass(bc.estado);
  const customColor = bc.color || null;
  const colorStyle  = customColor ? `background:${customColor}!important;` : '';

  const icon = L.divIcon({
    className: '',
    html: `<div class="bc-marker ${estadoClass}" data-id="${bc.id}" style="${colorStyle}">
             <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
               <path d="M2 20h20"/>
               <path d="M4 20v-6a3 3 0 013-3h10a3 3 0 013 3v6"/>
               <path d="M9 20v-5M14 20v-5"/>
             </svg>
           </div>`,
    iconSize: [30, 30], iconAnchor: [15, 30], popupAnchor: [0, -34]
  });

  const marker = L.marker([bc.lat, bc.lng], { icon, draggable: isAdmin });

  marker.bindTooltip(
    `<strong>${bc.nombre}</strong><br/><span style="color:#6b7c99;font-size:10px">Box Culvert #${bc.id} · ${bc.estado}</span>`,
    { className: 'canal-tooltip', direction: 'top', offset: [0, -8] }
  );

  marker.on('click', (e) => {
    if (drawMode) return;
    e.originalEvent.stopPropagation();
    selectMarker(marker, bc, 'boxculvert');
  });

  marker.on('dragend', async (e) => {
    const newLatLng = e.target.getLatLng();
    const idx = boxculverts.findIndex(c => c.id === bc.id);
    if (idx !== -1) {
      boxculverts[idx].lat = parseFloat(newLatLng.lat.toFixed(6));
      boxculverts[idx].lng = parseFloat(newLatLng.lng.toFixed(6));
      bc.lat = boxculverts[idx].lat;
      bc.lng = boxculverts[idx].lng;
      await saveBoxculvert(boxculverts[idx]);
      if (activeEntityType === 'boxculvert' && activeCanal?.id === bc.id) {
        document.getElementById('p-coords').textContent = `${bc.lat.toFixed(5)}, ${bc.lng.toFixed(5)}`;
      }
      showToast(`Posición de ${bc.nombre} actualizada`, 'success');
    }
  });

  marker._canal = bc;
  marker._entityType = 'boxculvert';
  return marker;
}

/** Dibuja todos los marcadores de box culverts en su propia capa */
function renderBoxculverts() {
  if (!bcMarkersLayer) return;
  bcMarkersLayer.clearLayers();
  boxculverts.forEach(bc => {
    createBoxculvertMarker(bc).addTo(bcMarkersLayer);
  });
}

function selectMarker(marker, canal, type = 'canal') {
  if (activeMarker && activeMarker !== marker) {
    getMarkerEl(activeMarker)?.classList.remove('active');
  }
  getMarkerEl(marker)?.classList.add('active');
  activeMarker = marker;
  activeCanal  = canal;
  activeEntityType = type;
  map.panTo([canal.lat, canal.lng], { animate: true, duration: 0.5 });
  populatePanel(canal, type);
  openPanel();
}

/* ─────────────────────────────────────────────────────────────
   PANEL LATERAL
   ───────────────────────────────────────────────────────────── */
function populatePanel(canal, type = 'canal') {
  const estadoClass = getEstadoClass(canal.estado);
  const esBoxculvert = type === 'boxculvert';

  document.getElementById('p-badge').textContent     = esBoxculvert ? `BOX CULVERT #${canal.id}` : `CANAL #${canal.id}`;
  document.getElementById('p-name').textContent      = canal.nombre;
  document.getElementById('p-cuenca').textContent    = `Cuenca ${canal.cuenca}`;
  document.getElementById('p-localidad').textContent = `${canal.localidad} – ${canal.localidadNombre}`;
  document.getElementById('p-barrio').textContent    = canal.barrio || '—';
  document.getElementById('p-longitud').textContent  = canal.longitud || '—';
  document.getElementById('p-revestimiento').textContent = canal.revestimiento || '—';
  document.getElementById('p-seccion').textContent   = canal.seccion || '—';
  document.getElementById('p-tramo').textContent     = `${canal.inicio || '—'} → ${canal.final || '—'}`;
  document.getElementById('p-disenios').textContent  = canal.disenios || '—';
  document.getElementById('p-riesgo').textContent    = canal.riesgo || '—';
  document.getElementById('p-coords').textContent    = `${canal.lat?.toFixed(5)}, ${canal.lng?.toFixed(5)}`;

  // Etapa
  const etapaBadge = document.getElementById('p-etapa-badge');
  if (etapaBadge) {
    const etapa = canal.etapa || 'Diagnóstico';
    etapaBadge.textContent = etapa;
    etapaBadge.dataset.etapa = etapa;
  }

  // Beneficiarios
  const beneficiariosEl = document.getElementById('p-beneficiarios');
  if (beneficiariosEl) {
    const n = Number.isFinite(canal.beneficiarios) ? canal.beneficiarios : (parseInt(canal.beneficiarios) || 0);
    beneficiariosEl.textContent = n > 0 ? `👤 ${n.toLocaleString('es-CO')}` : '—';
  }

  // Contador de comentarios en el botón "Saber más"
  const comentariosCount = document.getElementById('p-comentarios-count');
  if (comentariosCount) {
    const total = Array.isArray(canal.comentarios) ? canal.comentarios.length : 0;
    if (total > 0) { comentariosCount.style.display = 'inline-block'; comentariosCount.textContent = total; }
    else           { comentariosCount.style.display = 'none'; }
  }

  const dot   = document.getElementById('p-estado-dot');
  const label = document.getElementById('p-estado-label');
  dot.className     = `estado-dot ${estadoClass}`;
  label.textContent = canal.estado;
  label.style.color = getEstadoColor(canal.estado);

  // Trazado — no aplica a Box Culverts (son estructuras puntuales)
  const trazadoSection  = document.getElementById('p-trazado-section');
  const trazadoInfo     = document.getElementById('p-trazado-info');
  const deleteTrazadoBtn= document.getElementById('p-btn-delete-trazado');
  const drawBtnEl        = document.getElementById('p-btn-draw');

  if (esBoxculvert) {
    if (trazadoSection) trazadoSection.style.display = 'none';
    if (drawBtnEl)       drawBtnEl.style.display      = 'none';
  } else {
    if (trazadoSection) trazadoSection.style.display = '';
    if (drawBtnEl)       drawBtnEl.style.display      = '';
    if (canal.trazado && canal.trazado.length >= 2) {
      trazadoInfo.textContent = `${canal.trazado.length} puntos registrados`;
      trazadoInfo.className   = 'trazado-info has-trazado';
      if (deleteTrazadoBtn) { deleteTrazadoBtn.style.display = 'inline-flex'; deleteTrazadoBtn.disabled = !isAdmin; }
    } else {
      trazadoInfo.textContent = 'Sin trazado registrado';
      trazadoInfo.className   = 'trazado-info';
      if (deleteTrazadoBtn) deleteTrazadoBtn.style.display = 'none';
    }
  }

  // Color
  const colorInput = document.getElementById('p-color-input');
  if (colorInput) {
    colorInput.value    = canal.color || getEstadoColor(canal.estado);
    colorInput.disabled = !isAdmin;
  }

  // ─── Multimedia desde links ───
  const videos  = Array.isArray(canal.videos) ? canal.videos.filter(v => v) : [];
  const plano   = canal.plano   || null;
  const ficha   = canal.ficha   || null;
  const informe = canal.informe || null;
  const fotos   = Array.isArray(canal.fotos)  ? canal.fotos.filter(f => f)  : [];

  const videoBtn      = document.getElementById('p-btn-video');
  const extraVideosSec= document.getElementById('p-extra-videos-section');
  const planoBtn      = document.getElementById('p-btn-plano');
  const fichaBtn      = document.getElementById('p-btn-ficha');
  const informeBtn    = document.getElementById('p-btn-informe');
  const fotosSection  = document.getElementById('p-fotos-section');
  const fotosContainer= document.getElementById('p-fotos-container');

  // Videos
  if (videos.length > 0) {
    videoBtn.style.display = 'inline-flex';
    videoBtn.onclick = () => openLightbox('video', videos[0], `Video 1 — ${canal.nombre}`);
    // Videos extra
    if (extraVideosSec) {
      extraVideosSec.innerHTML = videos.slice(1).map((url, i) =>
        `<button class="media-btn media-btn--video" style="margin-top:4px;" onclick="openLightbox('video','${url.replace(/'/g,"\\'")}','Video ${i+2} — ${canal.nombre.replace(/'/g,"\\'")}')">
           <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
           Video ${i+2}
         </button>`
      ).join('');
    }
  } else {
    videoBtn.style.display = 'none';
    if (extraVideosSec) extraVideosSec.innerHTML = '';
  }

  // Plano
  if (planoBtn) {
    if (plano) {
      planoBtn.style.display = 'inline-flex';
      planoBtn.onclick = () => openLightbox('pdf', plano, `Plano — ${canal.nombre}`);
    } else { planoBtn.style.display = 'none'; }
  }

  // Ficha
  if (fichaBtn) {
    if (ficha) {
      fichaBtn.style.display = 'inline-flex';
      fichaBtn.onclick = () => openLightbox('pdf', ficha, `Ficha Técnica — ${canal.nombre}`);
    } else { fichaBtn.style.display = 'none'; }
  }

  // Informe
  if (informeBtn) {
    if (informe) {
      informeBtn.style.display = 'inline-flex';
      informeBtn.onclick = () => openLightbox('pdf', informe, `Informe — ${canal.nombre}`);
    } else { informeBtn.style.display = 'none'; }
  }

  // Fotos
  if (fotosSection && fotosContainer) {
    if (fotos.length > 0) {
      fotosSection.style.display = 'block';
      fotosContainer.innerHTML = fotos.map((url, i) =>
        `<img src="${url}" class="panel__foto foto-thumb-link" alt="foto ${i+1}" data-index="${i}"
              style="cursor:pointer;" onerror="this.style.opacity='0.3';this.title='Link no válido'" />`
      ).join('');
      fotosContainer.querySelectorAll('.panel__foto').forEach((img, i) => {
        img.addEventListener('click', () => openLightboxGallery(fotos, i, canal.nombre));
      });
    } else {
      fotosSection.style.display = 'none';
      fotosContainer.innerHTML   = '';
    }
  }

  updatePanelButtons();
}

function openPanel()  { document.getElementById('panel').classList.add('open'); }
function closePanel() { document.getElementById('panel').classList.remove('open'); }

function updatePanelButtons() {
  const editBtn         = document.getElementById('p-btn-edit');
  const deleteBtn       = document.getElementById('p-btn-delete');
  const drawBtn         = document.getElementById('p-btn-draw');
  const deleteTrazadoBtn= document.getElementById('p-btn-delete-trazado');
  const colorInput      = document.getElementById('p-color-input');

  if (editBtn)          editBtn.disabled          = !isAdmin;
  if (deleteBtn)        deleteBtn.disabled        = !isAdmin;
  if (drawBtn)          drawBtn.disabled          = !isAdmin;
  if (colorInput)       colorInput.disabled       = !isAdmin;
}

document.getElementById('panel-close').addEventListener('click', () => {
  if (activeMarker) {
    getMarkerEl(activeMarker)?.classList.remove('active');
    activeMarker = null;
  }
  activeCanal = null;
  activeEntityType = 'canal';
  closePanel();
});

/* ─────────────────────────────────────────────────────────────
   FILTROS
   ───────────────────────────────────────────────────────────── */
function initFilters() {
  document.getElementById('filter-localidad').addEventListener('change', applyFilters);
  document.getElementById('filter-estado').addEventListener('change', applyFilters);
  document.getElementById('btn-reset').addEventListener('click', () => {
    document.getElementById('filter-localidad').value = '';
    document.getElementById('filter-estado').value    = '';
    applyFilters();
  });
}

function applyFilters() {
  const localidadVal = document.getElementById('filter-localidad').value;
  const estadoVal    = document.getElementById('filter-estado').value;

  filteredCanales = canales.filter(c => {
    const matchL = !localidadVal || c.localidad === parseInt(localidadVal);
    const matchE = !estadoVal    || c.estado === estadoVal;
    return matchL && matchE;
  });

  if (activeMarker && activeMarker._entityType !== 'boxculvert') {
    const id = activeMarker._canal?.id;
    if (!filteredCanales.find(c => c.id === id)) {
      closePanel(); activeMarker = null; activeCanal = null;
    }
  }

  renderAll(canales, filteredCanales);
}

/* ─────────────────────────────────────────────────────────────
   LAYER TOGGLES
   ───────────────────────────────────────────────────────────── */
function initLayerToggles() {
  document.getElementById('toggle-puntos').addEventListener('click', () => {
    showPuntos = !showPuntos;
    document.getElementById('toggle-puntos').classList.toggle('active', showPuntos);
    applyLayerVisibility();
  });
  document.getElementById('toggle-lineas').addEventListener('click', () => {
    showLineas = !showLineas;
    document.getElementById('toggle-lineas').classList.toggle('active', showLineas);
    applyLayerVisibility();
  });
}

function applyLayerVisibility() {
  if (showPuntos) { if (!map.hasLayer(markersLayer)) map.addLayer(markersLayer); }
  else            { if (map.hasLayer(markersLayer))  map.removeLayer(markersLayer); }
  if (showLineas) { if (!map.hasLayer(linesLayer))   map.addLayer(linesLayer); }
  else            { if (map.hasLayer(linesLayer))    map.removeLayer(linesLayer); }
}

/* ─────────────────────────────────────────────────────────────
   CRUD — MODAL
   ───────────────────────────────────────────────────────────── */
function initCRUD() {
  document.getElementById('btn-add-canal').addEventListener('click', () => {
    if (!isAdmin) { showToast('🔒 Modo solo lectura. Active el modo admin para continuar.', 'warn'); return; }
    startPickPointMode('canal');
  });

  const btnAddBc = document.getElementById('btn-add-boxculvert');
  if (btnAddBc) {
    btnAddBc.addEventListener('click', () => {
      if (!isAdmin) { showToast('🔒 Modo solo lectura. Active el modo admin para continuar.', 'warn'); return; }
      startPickPointMode('boxculvert');
    });
  }

  document.getElementById('p-btn-edit').addEventListener('click', () => {
    if (!isAdmin) { showToast('🔒 Modo solo lectura. Active el modo admin para continuar.', 'warn'); return; }
    if (activeCanal) openModal(activeCanal, undefined, undefined, activeEntityType);
  });

  document.getElementById('p-btn-draw').addEventListener('click', () => {
    if (!isAdmin) { showToast('🔒 Modo solo lectura. Active el modo admin para continuar.', 'warn'); return; }
    if (activeCanal && activeEntityType === 'canal') startDrawMode(activeCanal);
  });

  document.getElementById('p-btn-delete').addEventListener('click', () => {
    if (!isAdmin) { showToast('🔒 Modo solo lectura. Active el modo admin para continuar.', 'warn'); return; }
    if (activeCanal) openConfirmDelete(activeCanal, activeEntityType);
  });

  document.getElementById('p-btn-delete-trazado').addEventListener('click', async () => {
    if (!isAdmin || !activeCanal || activeEntityType !== 'canal') return;
    const idx = canales.findIndex(c => c.id === activeCanal.id);
    if (idx !== -1) {
      canales[idx].trazado = null;
      activeCanal.trazado  = null;
      await saveCanal(canales[idx]);
      applyFilters();
      populatePanel(activeCanal, 'canal');
      showToast(`Trazado de ${activeCanal.nombre} eliminado`, 'info');
    }
  });

  document.getElementById('p-color-input').addEventListener('input', async (e) => {
    if (!isAdmin || !activeCanal) return;
    if (activeEntityType === 'boxculvert') {
      const idx = boxculverts.findIndex(c => c.id === activeCanal.id);
      if (idx !== -1) {
        boxculverts[idx].color = e.target.value;
        activeCanal.color      = e.target.value;
        await saveBoxculvert(boxculverts[idx]);
        renderBoxculverts();
        setTimeout(() => {
          bcMarkersLayer.eachLayer(marker => {
            if (marker._canal?.id === activeCanal.id) activeMarker = marker;
          });
        }, 50);
      }
    } else {
      const idx = canales.findIndex(c => c.id === activeCanal.id);
      if (idx !== -1) {
        canales[idx].color  = e.target.value;
        activeCanal.color   = e.target.value;
        await saveCanal(canales[idx]);
        applyFilters();
        setTimeout(() => {
          markersLayer.eachLayer(marker => {
            if (marker._canal?.id === activeCanal.id) activeMarker = marker;
          });
        }, 50);
      }
    }
  });

  document.getElementById('modal-cancel').addEventListener('click', closeModal);
  document.getElementById('modal-close').addEventListener('click', closeModal);
  document.getElementById('modal-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modal-overlay')) closeModal();
  });

  document.getElementById('modal-save').addEventListener('click', saveModal);

  document.getElementById('confirm-cancel').addEventListener('click', () => {
    document.getElementById('confirm-overlay').classList.remove('open');
  });
  document.getElementById('confirm-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirm-overlay'))
      document.getElementById('confirm-overlay').classList.remove('open');
  });
}

/* ─── Modal multimedia — links dinámicos ─── */
function initModalMultimedia() {
  document.getElementById('btn-add-video').addEventListener('click', () => addLinkRow('videos-group', 'URL del video'));
  document.getElementById('btn-add-foto').addEventListener('click',  () => addLinkRow('fotos-group',  'URL de la foto'));
}

function addLinkRow(groupId, placeholder, value = '') {
  const group = document.getElementById(groupId);
  const row   = document.createElement('div');
  row.className = 'link-row';
  row.innerHTML = `
    <input class="modal__input" type="url" placeholder="${placeholder}" value="${value}" />
    <button class="link-remove-btn" title="Quitar">✕</button>
  `;
  row.querySelector('.link-remove-btn').addEventListener('click', () => row.remove());
  group.appendChild(row);
}

function getLinksFromGroup(groupId) {
  return [...document.querySelectorAll(`#${groupId} .link-row input`)]
    .map(i => i.value.trim())
    .filter(v => v.length > 0);
}

function clearLinkGroup(groupId) {
  document.getElementById(groupId).innerHTML = '';
}

function openModal(canal, presetLat, presetLng, type = 'canal') {
  if (!isAdmin) return;
  editingId   = canal ? canal.id : null;
  editingType = type;
  const isEdit= canal !== null;
  const esBc  = type === 'boxculvert';

  const idLabel = document.getElementById('f-id')?.closest('.modal__field')?.querySelector('.modal__label');
  if (idLabel) idLabel.textContent = esBc ? 'ID Box Culvert *' : 'ID Canal *';

  document.getElementById('modal-title').textContent = isEdit
    ? `Editar — ${canal.nombre}`
    : (esBc ? 'Nuevo Box Culvert' : 'Nuevo Canal');
  document.getElementById('modal-error').textContent  = '';

  const fields = ['id','nombre','cuenca','localidad','barrio','longitud','inicio','final',
                  'seccion','revestimiento','disenios','riesgo','estado','lat','lng',
                  'etapa','beneficiarios'];

  fields.forEach(k => {
    const el = document.getElementById(`f-${k}`);
    if (!el) return;
    el.value = '';
    el.classList.remove('error');
  });

  // Limpiar grupos de links
  clearLinkGroup('videos-group');
  clearLinkGroup('fotos-group');
  document.getElementById('f-plano').value   = '';
  document.getElementById('f-ficha').value   = '';
  document.getElementById('f-informe').value = '';

  if (isEdit) {
    document.getElementById('f-id').value           = canal.id;
    document.getElementById('f-id').disabled        = true;
    document.getElementById('f-nombre').value       = canal.nombre       || '';
    document.getElementById('f-cuenca').value       = canal.cuenca       || '';
    document.getElementById('f-localidad').value    = canal.localidad    || '';
    document.getElementById('f-barrio').value       = canal.barrio       || '';
    document.getElementById('f-longitud').value     = canal.longitud     || '';
    document.getElementById('f-inicio').value       = canal.inicio       || '';
    document.getElementById('f-final').value        = canal.final        || '';
    document.getElementById('f-seccion').value      = canal.seccion      || '';
    document.getElementById('f-revestimiento').value= canal.revestimiento|| '';
    document.getElementById('f-disenios').value     = canal.disenios     || 'No';
    document.getElementById('f-riesgo').value       = canal.riesgo       || '';
    document.getElementById('f-estado').value       = canal.estado       || '';
    document.getElementById('f-lat').value          = canal.lat          || '';
    document.getElementById('f-lng').value          = canal.lng          || '';
    document.getElementById('f-etapa').value        = canal.etapa        || 'Diagnóstico';
    document.getElementById('f-beneficiarios').value= Number.isFinite(canal.beneficiarios) ? canal.beneficiarios : (canal.beneficiarios || 0);

    // Rellenar multimedia
    (canal.videos || []).forEach(url => addLinkRow('videos-group', 'URL del video', url));
    document.getElementById('f-plano').value   = canal.plano   || '';
    document.getElementById('f-ficha').value   = canal.ficha   || '';
    document.getElementById('f-informe').value = canal.informe || '';
    (canal.fotos || []).forEach(url  => addLinkRow('fotos-group',  'URL de la foto', url));
  } else {
    document.getElementById('f-id').disabled   = false;
    document.getElementById('f-disenios').value = 'No';
    document.getElementById('f-etapa').value    = 'Diagnóstico';
    document.getElementById('f-beneficiarios').value = '';
    if (presetLat !== undefined && presetLng !== undefined) {
      document.getElementById('f-lat').value = presetLat.toFixed(6);
      document.getElementById('f-lng').value = presetLng.toFixed(6);
      showToast(esBc ? '📍 Coordenadas capturadas del mapa (Box Culvert)' : '📍 Coordenadas capturadas del mapa', 'success');
    }
    // Un input vacío por defecto en videos y fotos
    addLinkRow('videos-group', 'URL del video');
    addLinkRow('fotos-group',  'URL de la foto');
  }

  document.getElementById('modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  editingId   = null;
  editingType = 'canal';
}

async function saveModal() {
  const err = document.getElementById('modal-error');
  err.textContent = '';

  const type      = editingType || 'canal';
  const esBc      = type === 'boxculvert';
  const targetArr = esBc ? boxculverts : canales;
  const entLabel  = esBc ? 'Box Culvert' : 'canal';

  const id        = parseInt(document.getElementById('f-id').value);
  const nombre    = document.getElementById('f-nombre').value.trim();
  const localidad = parseInt(document.getElementById('f-localidad').value);
  const estado    = document.getElementById('f-estado').value;
  const lat       = parseFloat(document.getElementById('f-lat').value);
  const lng       = parseFloat(document.getElementById('f-lng').value);

  let hasError = false;
  if (!id || isNaN(id))    { markError('f-id');        hasError = true; }
  if (!nombre)             { markError('f-nombre');     hasError = true; }
  if (!localidad)          { markError('f-localidad');  hasError = true; }
  if (!estado)             { markError('f-estado');     hasError = true; }
  if (isNaN(lat))          { markError('f-lat');        hasError = true; }
  if (isNaN(lng))          { markError('f-lng');        hasError = true; }
  if (hasError) { err.textContent = 'Completa los campos obligatorios (*)'; return; }

  if (editingId === null && targetArr.find(c => c.id === id)) {
    markError('f-id');
    err.textContent = `Ya existe un ${entLabel} con ID ${id}`;
    return;
  }

  const localidadNombre = LOCALIDAD_NAMES[localidad] || '';

  // Recoger links multimedia
  const videos  = getLinksFromGroup('videos-group');
  const fotos   = getLinksFromGroup('fotos-group');
  const plano   = document.getElementById('f-plano').value.trim()   || null;
  const ficha   = document.getElementById('f-ficha').value.trim()   || null;
  const informe = document.getElementById('f-informe').value.trim() || null;

  const canalData = {
    id,
    nombre,
    cuenca:          document.getElementById('f-cuenca').value.trim()        || '—',
    localidad,
    localidadNombre,
    barrio:          document.getElementById('f-barrio').value.trim()        || '—',
    longitud:        document.getElementById('f-longitud').value.trim()      || '—',
    inicio:          document.getElementById('f-inicio').value.trim()        || '—',
    final:           document.getElementById('f-final').value.trim()         || '—',
    seccion:         document.getElementById('f-seccion').value              || '—',
    revestimiento:   document.getElementById('f-revestimiento').value        || '—',
    disenios:        document.getElementById('f-disenios').value             || 'No',
    riesgo:          document.getElementById('f-riesgo').value               || '—',
    estado,
    etapa:           document.getElementById('f-etapa').value                || 'Diagnóstico',
    beneficiarios:   parseInt(document.getElementById('f-beneficiarios').value) || 0,
    lat, lng,
    trazado: null,
    color:   null,
    videos,
    plano,
    ficha,
    informe,
    fotos,
  };

  if (editingId !== null) {
    const existing   = targetArr.find(c => c.id === editingId);
    canalData.trazado    = existing?.trazado    || null;
    canalData.color      = existing?.color      || null;
    canalData.comentarios= existing?.comentarios|| [];
    const idx        = targetArr.findIndex(c => c.id === editingId);
    targetArr[idx]   = canalData;
    showToast(`${entLabel === 'canal' ? 'Canal' : entLabel} ${nombre} actualizado`, 'success');
  } else {
    canalData.comentarios = [];
    targetArr.push(canalData);
    showToast(`${entLabel === 'canal' ? 'Canal' : entLabel} ${nombre} añadido`, 'success');
  }

  const wasEditingId = editingId;

  if (esBc) {
    await saveBoxculvert(canalData);
    closeModal();
    renderBoxculverts();
  } else {
    await saveCanal(canalData);
    closeModal();
    applyFilters();
  }

  if (wasEditingId !== null && activeCanal?.id === wasEditingId && activeEntityType === type) {
    activeCanal = canalData;
    populatePanel(canalData, type);
  }
}

function markError(id) {
  document.getElementById(id)?.classList.add('error');
}

/* ─────────────────────────────────────────────────────────────
   COMENTARIOS DEL CANAL ("Saber más sobre el canal")
   ───────────────────────────────────────────────────────────── */
let comentariosCanalId = null;

function initComentarios() {
  document.getElementById('p-btn-comentarios').addEventListener('click', () => {
    if (activeCanal) openComentariosModal(activeCanal, activeEntityType);
  });
  document.getElementById('comentarios-close').addEventListener('click', closeComentariosModal);
  document.getElementById('comentarios-cerrar').addEventListener('click', closeComentariosModal);
  document.getElementById('comentarios-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('comentarios-overlay')) closeComentariosModal();
  });
  document.getElementById('btn-add-comentario').addEventListener('click', addComentario);
}

let comentariosEntityType = 'canal';

function openComentariosModal(canal, type = 'canal') {
  comentariosCanalId   = canal.id;
  comentariosEntityType= type;
  document.getElementById('comentarios-title').textContent = `Comentarios — ${canal.nombre}`;
  document.getElementById('comentario-texto').value  = '';
  document.getElementById('comentario-error').textContent = '';
  renderComentarios(canal);
  document.getElementById('comentarios-overlay').classList.add('open');
}

function closeComentariosModal() {
  document.getElementById('comentarios-overlay').classList.remove('open');
  comentariosCanalId = null;
}

function renderComentarios(canal) {
  const list  = document.getElementById('comentarios-list');
  const empty = document.getElementById('comentarios-empty');
  const addBox= document.getElementById('comentarios-add');

  const comentarios = Array.isArray(canal.comentarios) ? canal.comentarios : [];

  if (comentarios.length === 0) {
    list.innerHTML = '';
    list.appendChild(empty);
    empty.style.display = 'block';
  } else {
    empty.style.display = 'none';
    // Mostrar los más recientes primero
    const ordenados = [...comentarios].sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''));
    list.innerHTML = ordenados.map(c => `
      <div class="comentario-item">
        <div class="comentario-item__meta">
          <span class="comentario-item__autor">👷 ${escapeHtml(c.autor || 'Ingeniero')}</span>
          <span class="comentario-item__fecha">${formatFechaComentario(c.fecha)}</span>
        </div>
        <div class="comentario-item__texto">${escapeHtml(c.texto || '')}</div>
      </div>
    `).join('');
  }

  // Solo el administrador (ingeniero) puede agregar comentarios nuevos
  if (addBox) addBox.style.display = isAdmin ? 'block' : 'none';
}

async function addComentario() {
  if (!isAdmin || comentariosCanalId === null) return;

  const textarea = document.getElementById('comentario-texto');
  const errorEl   = document.getElementById('comentario-error');
  const texto     = textarea.value.trim();
  errorEl.textContent = '';

  if (!texto) {
    errorEl.textContent = 'Escribe un comentario antes de agregarlo.';
    return;
  }

  const esBc      = comentariosEntityType === 'boxculvert';
  const targetArr = esBc ? boxculverts : canales;
  const idx       = targetArr.findIndex(c => c.id === comentariosCanalId);
  if (idx === -1) return;

  const nuevoComentario = {
    texto,
    autor: ADMIN_CREDENTIALS.user,
    fecha: new Date().toISOString(),
  };

  targetArr[idx].comentarios = Array.isArray(targetArr[idx].comentarios) ? targetArr[idx].comentarios : [];
  targetArr[idx].comentarios.push(nuevoComentario);

  if (activeCanal?.id === comentariosCanalId && activeEntityType === comentariosEntityType) {
    activeCanal.comentarios = targetArr[idx].comentarios;
  }

  if (esBc) await saveBoxculvert(targetArr[idx]);
  else      await saveCanal(targetArr[idx]);

  textarea.value = '';
  renderComentarios(targetArr[idx]);
  if (activeCanal?.id === comentariosCanalId && activeEntityType === comentariosEntityType) {
    populatePanel(activeCanal, comentariosEntityType);
  }
  showToast('Comentario agregado', 'success');
}

function formatFechaComentario(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    return d.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch { return iso; }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function openConfirmDelete(canal, type = 'canal') {
  if (!isAdmin) return;
  const esBc = type === 'boxculvert';
  document.getElementById('confirm-text').textContent =
    `¿Eliminar "${canal.nombre}" (${esBc ? 'Box Culvert' : 'Canal'} #${canal.id})? Esta acción no se puede deshacer.`;

  const btn    = document.getElementById('confirm-ok');
  const newBtn = btn.cloneNode(true);
  btn.parentNode.replaceChild(newBtn, btn);

  newBtn.addEventListener('click', () => {
    if (esBc) deleteBoxculvert(canal.id);
    else      deleteCanal(canal.id);
    document.getElementById('confirm-overlay').classList.remove('open');
  });

  document.getElementById('confirm-overlay').classList.add('open');
}

async function deleteCanal(id) {
  if (!isAdmin) return;
  const canal = canales.find(c => c.id === id);
  canales     = canales.filter(c => c.id !== id);
  await removeCanal(id);
  closePanel();
  activeMarker = null;
  activeCanal  = null;
  activeEntityType = 'canal';
  applyFilters();
  showToast(`Canal ${canal?.nombre} eliminado`, 'info');
}

async function deleteBoxculvert(id) {
  if (!isAdmin) return;
  const bc    = boxculverts.find(c => c.id === id);
  boxculverts = boxculverts.filter(c => c.id !== id);
  await removeBoxculvertFB(id);
  closePanel();
  activeMarker = null;
  activeCanal  = null;
  activeEntityType = 'canal';
  renderBoxculverts();
  showToast(`Box Culvert ${bc?.nombre} eliminado`, 'info');
}

/* ─────────────────────────────────────────────────────────────
   PICK POINT MODE
   ───────────────────────────────────────────────────────────── */
function startPickPointMode(type = 'canal') {
  if (!isAdmin) return;
  pickPointMode = true;
  pickPointType = type;
  const esBc = type === 'boxculvert';
  document.body.classList.add('pick-point-mode');
  showToast(esBc ? '📍 Haz clic en el mapa para ubicar el nuevo Box Culvert' : '📍 Haz clic en el mapa para ubicar el nuevo canal', 'info');

  let banner = document.getElementById('pick-point-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'pick-point-banner';
    banner.style.cssText = `
      position:fixed; bottom:24px; left:50%; transform:translateX(-50%);
      background:#1a2035; color:#e2e8f0; border:1px solid #4d9fff;
      border-radius:10px; padding:12px 20px; font-size:13px;
      z-index:9999; display:flex; align-items:center; gap:10px;
      box-shadow:0 4px 20px rgba(0,0,0,0.5);
    `;
    document.body.appendChild(banner);
  }
  banner.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4d9fff" stroke-width="2">
      <circle cx="12" cy="10" r="3"/><path d="M12 2a8 8 0 0 0-8 8c0 5.4 7 12 8 12s8-6.6 8-12a8 8 0 0 0-8-8z"/>
    </svg>
    <span>${esBc ? 'Haz clic en el mapa para ubicar el nuevo Box Culvert' : 'Haz clic en el mapa para ubicar el nuevo canal'}</span>
    <button onclick="cancelPickPointMode()" style="
      background:transparent; border:1px solid #4d6380; color:#94a3b8;
      border-radius:6px; padding:3px 10px; cursor:pointer; font-size:12px; margin-left:8px;
    ">Cancelar</button>
  `;
  banner.style.display = 'flex';
}

function finishPickPoint(latlng) {
  if (!pickPointMode) return;
  pickPointMode = false;
  document.body.classList.remove('pick-point-mode');
  const banner = document.getElementById('pick-point-banner');
  if (banner) banner.style.display = 'none';
  openModal(null, latlng.lat, latlng.lng, pickPointType);
}

window.cancelPickPointMode = function () {
  pickPointMode = false;
  document.body.classList.remove('pick-point-mode');
  const banner = document.getElementById('pick-point-banner');
  if (banner) banner.style.display = 'none';
  showToast('Selección de punto cancelada', 'info');
};

/* ─────────────────────────────────────────────────────────────
   DRAW MODE
   ───────────────────────────────────────────────────────────── */
function initDrawTools() {
  document.getElementById('draw-undo').addEventListener('click', undoDrawPoint);
  document.getElementById('draw-cancel').addEventListener('click', cancelDrawMode);
  document.getElementById('draw-save').addEventListener('click', saveDrawTrazado);
}

function startDrawMode(canal) {
  if (!isAdmin) { showToast('🔒 Modo solo lectura. Active el modo admin para continuar.', 'warn'); return; }
  drawCanal  = canal;
  drawPoints = canal.trazado ? [...canal.trazado] : [];
  drawMode   = true;

  document.body.classList.add('draw-mode');
  document.getElementById('draw-canal-name').textContent = canal.nombre;
  document.getElementById('draw-toolbar').classList.add('visible');

  if (drawPoints.length > 0) {
    refreshDrawLayer();
    document.getElementById('draw-instructions').textContent =
      'Canal tiene trazado existente. Puedes seguir añadiendo puntos o guardar.';
  }

  updateDrawUI();
  closePanel();
  showToast('Modo dibujo activo — clic en el mapa para marcar puntos', 'info');
}

function addDrawPoint(latlng) {
  drawPoints.push([latlng.lat, latlng.lng]);
  refreshDrawLayer();
  updateDrawUI();
}

function undoDrawPoint() {
  if (drawPoints.length === 0) return;
  drawPoints.pop();
  refreshDrawLayer();
  updateDrawUI();
}

function refreshDrawLayer() {
  if (drawPolyline) { map.removeLayer(drawPolyline); drawPolyline = null; }
  drawMarkers.forEach(m => map.removeLayer(m));
  drawMarkers = [];

  if (drawPoints.length === 0) return;

  const color = drawCanal.color || getEstadoColor(drawCanal.estado);

  if (drawPoints.length >= 2) {
    drawPolyline = L.polyline(drawPoints, {
      color, weight: 4, opacity: 0.8, dashArray: '8 6', lineCap: 'round'
    }).addTo(map);
  }

  drawPoints.forEach((pt, i) => {
    const isFirst = i === 0;
    const isLast  = i === drawPoints.length - 1;
    const marker  = L.circleMarker(pt, {
      radius: (isFirst || isLast) ? 9 : 6,
      color,
      fillColor: isFirst ? '#00c9a7' : (isLast ? color : '#ffffff'),
      fillOpacity: (isFirst || isLast) ? 1 : 0.7,
      weight: 2
    }).addTo(map);
    drawMarkers.push(marker);
  });
}

function updateDrawUI() {
  const n = drawPoints.length;
  document.getElementById('draw-pts').textContent   = `${n} punto${n !== 1 ? 's' : ''}`;
  document.getElementById('draw-save').disabled     = n < 2;

  if (n === 0) {
    document.getElementById('draw-instructions').textContent =
      'Haz clic en el mapa para marcar puntos del canal. Doble clic para finalizar.';
  } else if (n === 1) {
    document.getElementById('draw-instructions').textContent = 'Añade al menos un punto más para crear el trazado.';
  } else {
    document.getElementById('draw-instructions').textContent = `Trazado de ${n} puntos. Continúa añadiendo o guarda.`;
  }
}

function finishDraw() {
  if (drawPoints.length >= 2) saveDrawTrazado();
}

async function saveDrawTrazado() {
  if (!drawCanal || drawPoints.length < 2) return;

  const idx = canales.findIndex(c => c.id === drawCanal.id);
  if (idx !== -1) {
    canales[idx].trazado = [...drawPoints];
    await saveCanal(canales[idx]);
    showToast(`Trazado de ${drawCanal.nombre} guardado (${drawPoints.length} pts)`, 'success');
  }

  cleanupDrawMode();
  applyFilters();
}

function cancelDrawMode() { cleanupDrawMode(); showToast('Dibujo cancelado', 'info'); }

function cleanupDrawMode() {
  drawMode  = false;
  drawCanal = null;
  document.body.classList.remove('draw-mode');
  document.getElementById('draw-toolbar').classList.remove('visible');
  if (drawPolyline) { map.removeLayer(drawPolyline); drawPolyline = null; }
  drawMarkers.forEach(m => map.removeLayer(m));
  drawMarkers = [];
  drawPoints  = [];
  updateDrawUI();
}

/* ─────────────────────────────────────────────────────────────
   LEYENDA
   ───────────────────────────────────────────────────────────── */
function initLegend() {
  const legend = L.control({ position: 'bottomleft' });
  legend.onAdd = () => {
    const div = L.DomUtil.create('div', 'map-legend');
    div.innerHTML = `
      <div class="legend-title">Estado del canal</div>
      <div class="legend-item"><span class="legend-dot" style="background:#22c55e;box-shadow:0 0 4px #22c55e"></span><span class="legend-label">Bueno</span></div>
      <div class="legend-item"><span class="legend-dot" style="background:#f5a623;box-shadow:0 0 4px #f5a623"></span><span class="legend-label">Regular</span></div>
      <div class="legend-item"><span class="legend-dot" style="background:#ef4444;box-shadow:0 0 4px #ef4444"></span><span class="legend-label">Deficiente</span></div>
      <div class="legend-item"><span class="legend-dot" style="background:#dc2626;box-shadow:0 0 4px #dc2626"></span><span class="legend-label">Crítico</span></div>
      <div style="border-top:1px solid rgba(255,255,255,0.07);margin-top:8px;padding-top:8px;">
        <div class="legend-item"><span style="width:24px;height:3px;background:#4d9fff;display:inline-block;border-radius:2px;margin-right:7px"></span><span class="legend-label" style="font-size:10px">Trazado</span></div>
      </div>
    `;
    return div;
  };
  legend.addTo(map);
}

/* ─────────────────────────────────────────────────────────────
   ESTADÍSTICAS
   ───────────────────────────────────────────────────────────── */
function updateStats(allData, visibleData) {
  document.getElementById('stat-total').textContent   = allData.length;
  document.getElementById('stat-visible').textContent = visibleData.length;
  document.getElementById('stat-lineas').textContent  = allData.filter(c => c.trazado && c.trazado.length >= 2).length;

  let totalM = 0;
  allData.forEach(c => {
    const m = parseFloat((c.longitud || '').replace(/[^\d.]/g, ''));
    if (!isNaN(m)) totalM += m;
  });
  document.getElementById('stat-km').textContent = `${(totalM / 1000).toFixed(1)} km`;
}

/* ─────────────────────────────────────────────────────────────
   TOAST
   ───────────────────────────────────────────────────────────── */
let toastTimer = null;

function showToast(msg, type = 'info') {
  const el   = document.getElementById('toast');
  el.textContent = msg;
  el.className   = `toast ${type} show`;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer     = setTimeout(() => { el.classList.remove('show'); }, 3000);
}

/* ─────────────────────────────────────────────────────────────
   HELPERS
   ───────────────────────────────────────────────────────────── */
function getEstadoClass(estado) {
  const m = { 'Bueno': 'estado-bueno', 'Regular': 'estado-regular', 'Deficiente': 'estado-deficiente', 'Crítico': 'estado-critico' };
  return m[estado] || 'estado-regular';
}

function getEstadoColor(estado) {
  const m = { 'Bueno': '#22c55e', 'Regular': '#f5a623', 'Deficiente': '#ef4444', 'Crítico': '#dc2626' };
  return m[estado] || '#4d9fff';
}

/* ─────────────────────────────────────────────────────────────
   ADMIN MODE + LOGIN
   ───────────────────────────────────────────────────────────── */
function initAdminToggle() {
  document.getElementById('btn-readonly').addEventListener('click', () => {
    if (isAdmin) {
      isAdmin = false;
      applyAdminState();
      showToast('🔒 Modo solo lectura activado', 'info');
    } else {
      openLoginModal();
    }
  });
}

function initLoginModal() {
  document.getElementById('login-submit').addEventListener('click', handleLogin);
  document.getElementById('login-close').addEventListener('click', closeLoginModal);
  document.getElementById('login-cancel').addEventListener('click', closeLoginModal);
  document.getElementById('login-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('login-overlay')) closeLoginModal();
  });
  document.getElementById('login-pass').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin();
  });
}

function openLoginModal() {
  document.getElementById('login-user').value   = '';
  document.getElementById('login-pass').value   = '';
  document.getElementById('login-error').textContent = '';
  document.getElementById('login-overlay').classList.add('open');
  document.getElementById('login-user').focus();
}

function closeLoginModal() {
  document.getElementById('login-overlay').classList.remove('open');
}

function handleLogin() {
  const user    = document.getElementById('login-user').value.trim();
  const pass    = document.getElementById('login-pass').value.trim();
  const errorEl = document.getElementById('login-error');

  if (user === ADMIN_CREDENTIALS.user && pass === ADMIN_CREDENTIALS.pass) {
    isAdmin = true;
    applyAdminState();
    closeLoginModal();
    showToast('✓ Modo administrador activado — edición habilitada', 'success');
  } else {
    errorEl.textContent = 'Credenciales incorrectas';
  }
}

function applyAdminState() {
  const btn    = document.getElementById('btn-readonly');
  const addBtn = document.getElementById('btn-add-canal');
  const addBcBtn = document.getElementById('btn-add-boxculvert');

  if (isAdmin) {
    document.body.classList.add('admin-mode');
    document.body.classList.remove('readonly');
    btn.classList.add('active-admin');
    btn.title   = 'Modo admin activo — clic para desactivar';
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
      </svg>
      Modo admin activo`;
    addBtn.disabled = false;
    if (addBcBtn) addBcBtn.disabled = false;
  } else {
    document.body.classList.remove('admin-mode');
    document.body.classList.add('readonly');
    btn.classList.remove('active-admin');
    btn.title   = 'Modo solo lectura — clic para activar edición';
    btn.innerHTML = `
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      Solo lectura`;
    addBtn.disabled = true;
    if (addBcBtn) addBcBtn.disabled = true;
  }

  markersLayer.eachLayer(m => {
    if (m.dragging) { isAdmin ? m.dragging.enable() : m.dragging.disable(); }
  });
  if (bcMarkersLayer) {
    bcMarkersLayer.eachLayer(m => {
      if (m.dragging) { isAdmin ? m.dragging.enable() : m.dragging.disable(); }
    });
  }

  if (activeCanal) updatePanelButtons();
}

/* ─────────────────────────────────────────────────────────────
   LIGHTBOX VIEWER
   ───────────────────────────────────────────────────────────── */
let galleryData  = null;
let galleryIndex = 0;

window.openLightbox = function openLightbox(type, src, title) {
  const overlay = document.getElementById('lightbox-overlay');
  const body    = document.getElementById('lightbox-body');
  const titleEl = document.getElementById('lightbox-title');

  titleEl.textContent = title || 'Vista previa';
  body.innerHTML      = '';
  galleryData         = null;

  /* ── DETECCIÓN AUTOMÁTICA DE TIPO DE ENLACE ─────────────────────
     Se ejecuta ANTES de los bloques if/else existentes.
     Redirige o transforma el src según el origen del enlace.
  ──────────────────────────────────────────────────────────────── */

  // 1. SharePoint / OneDrive — no soportan iframe: abrir en nueva pestaña
  //    Razón: estos servicios envían X-Frame-Options: DENY, lo que provoca
  //    el error "La página ha rechazado la conexión" dentro del iframe.
  if (/sharepoint\.com|my\.sharepoint\.com|onedrive\.live\.com/i.test(src)) {
    window.open(src, '_blank', 'noopener,noreferrer');
    return; // No abrir el lightbox; la pestaña nueva es suficiente
  }

  // 2. Google Drive — convertir /view a /preview para permitir iframe embedding
  //    Razón: Google Drive bloquea /view dentro de iframes pero permite /preview.
  //    Solo se transforma si el enlace no tiene ya /preview.
  if (/drive\.google\.com\/file\/d\//i.test(src)) {
    if (!/\/preview/.test(src)) {
      // Extraer el ID del archivo y construir la URL de preview limpia
      const driveId = src.match(/\/file\/d\/([^/?]+)/)?.[1];
      if (driveId) {
        src = `https://drive.google.com/file/d/${driveId}/preview`;
      }
    }
    // Mostrar en iframe dentro del lightbox existente
    body.innerHTML = `
      <iframe
        src="${src}"
        frameborder="0"
        allowfullscreen
        style="width:100%;height:calc(88vh - 90px);border-radius:6px;border:none;"
      ></iframe>
      <div style="padding:8px;text-align:right">
        <a href="${src.replace('/preview', '/view')}" target="_blank" rel="noopener"
           style="font-size:11px;color:#4d9fff;text-decoration:none;">↗ Abrir en Google Drive</a>
      </div>`;
    overlay.classList.add('open');
    return;
  }

  /* ── FIN DETECCIÓN — continúa lógica original intacta ────────── */

  if (type === 'pdf') {
    // Intentar embed; si falla (CORS), abrir en nueva pestaña con botón
    body.innerHTML = `
      <embed src="${src}" type="application/pdf" class="lightbox-pdf" onerror="this.outerHTML='<div style=padding:20px;text-align:center;color:#8899aa><p style=margin-bottom:12px>No se puede previsualizar este PDF aquí.</p><a href=\\'${src}\\' target=\\'_blank\\' rel=\\'noopener\\' style=color:#4d9fff>Abrir en nueva pestaña →</a></div>'" />
      <div style="padding:8px;text-align:right">
        <a href="${src}" target="_blank" rel="noopener" style="font-size:11px;color:#4d9fff;text-decoration:none;">↗ Abrir en nueva pestaña</a>
      </div>`;
  } else if (type === 'video') {
    // Detectar YouTube/Vimeo → iframe; de lo contrario <video>
    if (/youtube\.com|youtu\.be/i.test(src)) {
      const yid = src.match(/(?:v=|youtu\.be\/)([^&?/]+)/)?.[1] || '';
      body.innerHTML = `<iframe width="100%" height="480" src="https://www.youtube.com/embed/${yid}" frameborder="0" allowfullscreen class="lightbox-video" style="height:calc(88vh - 90px);border-radius:6px;"></iframe>`;
    } else if (/vimeo\.com/i.test(src)) {
      const vid = src.match(/vimeo\.com\/(\d+)/)?.[1] || '';
      body.innerHTML = `<iframe width="100%" height="480" src="https://player.vimeo.com/video/${vid}" frameborder="0" allowfullscreen class="lightbox-video" style="height:calc(88vh - 90px);border-radius:6px;"></iframe>`;
    } else {
      body.innerHTML = `<video controls autoplay class="lightbox-video"><source src="${src}"></video>`;
    }
  } else if (type === 'image') {
    body.innerHTML = `<img src="${src}" class="lightbox-image" alt="${title}" onerror="this.outerHTML='<div style=color:#8899aa;padding:20px>No se pudo cargar la imagen. Verifica que el link sea público.</div>'" />`;
  }

  overlay.classList.add('open');
};

function openLightboxGallery(fotos, startIndex, canalNombre) {
  galleryData  = fotos;
  galleryIndex = startIndex;
  showGallerySlide(canalNombre);
  document.getElementById('lightbox-overlay').classList.add('open');
}

function showGallerySlide(canalNombre) {
  const body    = document.getElementById('lightbox-body');
  const titleEl = document.getElementById('lightbox-title');
  const total   = galleryData.length;
  titleEl.textContent = `Fotos — ${canalNombre || ''} (${galleryIndex + 1} / ${total})`;

  body.innerHTML = `
    <div class="lightbox-gallery">
      ${total > 1 ? `<button class="lightbox-nav lightbox-nav--prev" id="lb-prev" title="Anterior">&#8592;</button>` : ''}
      <img src="${galleryData[galleryIndex]}" class="lightbox-image" alt="foto ${galleryIndex + 1}"
           onerror="this.style.opacity='0.3';this.alt='Link de imagen no válido'" />
      ${total > 1 ? `<button class="lightbox-nav lightbox-nav--next" id="lb-next" title="Siguiente">&#8594;</button>` : ''}
    </div>
    ${total > 1 ? `<div class="lightbox-dots">${galleryData.map((_, i) =>
      `<span class="lb-dot${i === galleryIndex ? ' active' : ''}" data-i="${i}"></span>`
    ).join('')}</div>` : ''}
  `;

  body.querySelector('#lb-prev')?.addEventListener('click', () => {
    galleryIndex = (galleryIndex - 1 + total) % total;
    showGallerySlide(canalNombre);
  });
  body.querySelector('#lb-next')?.addEventListener('click', () => {
    galleryIndex = (galleryIndex + 1) % total;
    showGallerySlide(canalNombre);
  });
  body.querySelectorAll('.lb-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      galleryIndex = parseInt(dot.dataset.i);
      showGallerySlide(canalNombre);
    });
  });
}

function closeLightbox() {
  document.getElementById('lightbox-overlay').classList.remove('open');
  document.getElementById('lightbox-body').innerHTML = '';
  galleryData = null;
}

function initLightbox() {
  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-overlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('lightbox-overlay')) closeLightbox();
  });
  document.addEventListener('keydown', (e) => {
    const overlay = document.getElementById('lightbox-overlay');
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape') closeLightbox();
    if (galleryData && e.key === 'ArrowLeft') {
      galleryIndex = (galleryIndex - 1 + galleryData.length) % galleryData.length;
      showGallerySlide('');
    }
    if (galleryData && e.key === 'ArrowRight') {
      galleryIndex = (galleryIndex + 1) % galleryData.length;
      showGallerySlide('');
    }
  });
}

/* ─── ARRANCAR ─── */
document.addEventListener('DOMContentLoaded', () => {
  initApp();
  initLightbox();
});

/* ─────────────────────────────────────────────────────────────
   API EXPUESTA PARA search-dashboard.js
   (Bloque agregado al final — NO modifica ninguna línea existente
   ni altera la lógica original. Solo expone lectura/ayudas para
   que el buscador externo pueda filtrar y enfocar canales.)
   ───────────────────────────────────────────────────────────── */
function focusCanalById(id) {
  const canal = canales.find(c => c.id === id);
  if (!canal) return;

  let foundMarker = null;
  markersLayer.eachLayer(m => { if (m._canal?.id === id) foundMarker = m; });

  if (foundMarker) {
    selectMarker(foundMarker, canal);
  } else {
    // El canal existe pero no está entre los marcadores visibles actualmente
    map.panTo([canal.lat, canal.lng], { animate: true, duration: 0.5 });
    populatePanel(canal);
    openPanel();
  }
}

window.__canalesAPI = {
  getCanales:         () => canales,
  getFilteredCanales: () => filteredCanales,
  setFilteredCanales: (arr) => { filteredCanales = arr; },
  renderAll,
  focusCanalById,
  onReady(cb) {
    const check = setInterval(() => {
      if (canales && canales.length) { clearInterval(check); cb(); }
    }, 150);
  }
};
