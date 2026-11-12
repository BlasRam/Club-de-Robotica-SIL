import './guide-library.css';

type Guide = Record<string, any> & { id: string };
type Saved = { favorites: string[]; steps: Record<string, number[]> };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const stepsOf = (item: Guide) => String(item.pasosImplementacion || '').split(/(?:^|\s+)\d+\.\s+|\n+/).map(s => s.trim()).filter(Boolean);
const storageKey = (uid: string) => 'club-guide-library-v1:' + uid;

function readSaved(uid: string): Saved {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(uid)) || '{}');
    return {
      favorites: Array.isArray(value.favorites) ? value.favorites.filter((id: unknown) => typeof id === 'string') : [],
      steps: value.steps && typeof value.steps === 'object' && !Array.isArray(value.steps) ? value.steps : {},
    };
  } catch { return { favorites: [], steps: {} }; }
}
function writeSaved(uid: string, value: Saved): boolean {
  try { localStorage.setItem(storageKey(uid), JSON.stringify(value)); return true; } catch { return false; }
}
function completed(saved: Saved, item: Guide): number[] {
  const list = saved.steps[item.id];
  return Array.isArray(list) ? [...new Set(list.filter(n => Number.isInteger(n) && n >= 0 && n < stepsOf(item).length))] : [];
}
const bookmark = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M6 4h12v17l-6-4-6 4z"/></svg>';
const circuit = '<svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="13" y="13" width="22" height="22" rx="4"/><path d="M18 6v7m12-7v7M18 35v7m12-7v7M6 18h7m-7 12h7m22-12h7m-7 12h7"/><path d="m21 20-4 4 4 4m6-8 4 4-4 4"/></svg>';
let context: { uid: string; items: Guide[]; photos: Map<string, string> } | null = null;
let filters = { search: '', level: '', area: '', view: 'all', sort: 'level' };

function card(item: Guide, index: number, saved: Saved, photos: Map<string, string>): string {
  const favorite = saved.favorites.includes(item.id);
  const count = completed(saved, item).length;
  const total = stepsOf(item).length;
  return '<article class="gl-card" data-gl-card="' + escape(item.id) + '"><div class="gl-card-top">' +
    (photos.has(item.id) ? '<img src="' + escape(photos.get(item.id)) + '" alt="Prototipo de ' + escape(item.titulo) + '" loading="lazy"/>' : '<span class="gl-circuit">' + circuit + '</span>') +
    '<span class="gl-number">' + String(index + 1).padStart(2, '0') + '</span><button class="gl-save" data-gl-save="' + escape(item.id) + '" aria-pressed="' + favorite + '" aria-label="' + (favorite ? 'Quitar de guardadas: ' : 'Guardar: ') + escape(item.titulo) + '">' + bookmark + '</button></div>' +
    '<div class="gl-card-body"><span class="gl-origin">' + (item.guiaInicial ? 'PARA PRACTICAR' : 'PROYECTO DEL CLUB') + '</span><h3>' + escape(item.titulo) + '</h3><p>' + escape(item.resumen) + '</p><div class="gl-tags"><span>' + escape(item.nivelDificultad || 'Nivel sin indicar') + '</span><span>' + escape(item.tiempoEstimado || 'Tiempo variable') + '</span></div>' +
    '<p class="gl-progress-label">' + (count ? count + ' de ' + total + ' pasos marcados' : total + ' pasos · conexiones y código') + '</p>' +
    '<button class="primary-button" data-gl-open="' + escape(item.id) + '">' + (count ? 'Continuar guía' : 'Explorar guía') + ' <span aria-hidden="true">→</span></button></div></article>';
}

function filteredItems(items: Guide[], saved: Saved): Guide[] {
  const terms = normalize(filters.search).trim().split(/\s+/).filter(Boolean);
  const levels = ['Inicial', 'Intermedio', 'Avanzado'];
  return items.filter(item => {
    const haystack = normalize([item.titulo, item.resumen, item.materiales, item.tecnologias, ...(item.areas || [])].join(' '));
    return terms.every(term => haystack.includes(term)) && (!filters.level || item.nivelDificultad === filters.level)
      && (!filters.area || (item.areas || []).includes(filters.area))
      && (filters.view !== 'saved' || saved.favorites.includes(item.id))
      && (filters.view !== 'started' || completed(saved, item).length > 0);
  }).sort((a, b) => filters.sort === 'title' ? String(a.titulo).localeCompare(String(b.titulo), 'es')
    : (levels.indexOf(a.nivelDificultad) < 0 ? 3 : levels.indexOf(a.nivelDificultad)) - (levels.indexOf(b.nivelDificultad) < 0 ? 3 : levels.indexOf(b.nivelDificultad)));
}

function results(items: Guide[], photos: Map<string, string>, saved: Saved): string {
  return items.length ? items.map((item, i) => card(item, i, saved, photos)).join('')
    : '<div class="gl-empty"><h3>No hay guías en esta selección</h3><p>Prueba otro componente, cambia los filtros o guarda una guía para encontrarla aquí.</p><button class="secondary-button" data-gl-reset>Mostrar todas</button></div>';
}

export function renderGuideLibrary(items: Guide[], photos: Map<string, string>, uid: string): string {
  if (context?.uid !== uid) filters = { search: '', level: '', area: '', view: 'all', sort: 'level' };
  context = { uid, items, photos };
  const saved = readSaved(uid);
  const visible = filteredItems(items, saved);
  const areas = [...new Set(items.flatMap(item => item.areas || []))].sort();
  const option = (label: string, value: string, selected: string) => '<option value="' + escape(value) + '"' + (value === selected ? ' selected' : '') + '>' + escape(label) + '</option>';
  return '<section class="gl-library" aria-label="Biblioteca de proyectos"><div class="gl-hero"><div><span class="gl-eyebrow">APRENDE CONSTRUYENDO</span><h2>Tu próximo proyecto empieza aquí</h2><p>Elige una idea, prepara los materiales y avanza a tu ritmo.</p></div><div class="gl-total"><strong>' + items.length + '</strong><span>guías para explorar</span></div></div>' +
    '<div class="gl-toolbar"><label class="gl-search">Buscar por proyecto o componente<input type="search" data-gl-filter="search" placeholder="Prueba: sensor, LED, servo…" value="' + escape(filters.search) + '"/></label><div class="gl-filter-row"><label>Nivel<select data-gl-filter="level">' + option('Todos los niveles', '', filters.level) + ['Inicial', 'Intermedio', 'Avanzado'].map(l => option(l, l, filters.level)).join('') + '</select></label><label>Área<select data-gl-filter="area">' + option('Todas las áreas', '', filters.area) + areas.map(a => option(a, a, filters.area)).join('') + '</select></label><label>Ordenar<select data-gl-filter="sort">' + option('Más sencillas primero', 'level', filters.sort) + option('Título A–Z', 'title', filters.sort) + '</select></label></div>' +
    '<div class="gl-views" role="group" aria-label="Filtrar biblioteca">' + [['all', 'Todas'], ['saved', 'Guardadas'], ['started', 'Mi avance']].map(([value, label]) => '<button data-gl-view="' + value + '" aria-pressed="' + (filters.view === value) + '">' + label + '</button>').join('') + '<button class="gl-clear" data-gl-reset>Limpiar filtros</button></div></div>' +
    '<p class="gl-device-note">Tus guías guardadas y pasos marcados se conservan para esta cuenta en este dispositivo.</p><div class="gl-result-count" role="status" aria-live="polite">' + visible.length + ' de ' + items.length + ' guías</div><div class="gl-grid">' + results(visible, photos, saved) + '</div><p class="gl-status" role="status"></p></section>';
}

function updateLibrary(): void {
  const root = document.querySelector<HTMLElement>('.gl-library');
  if (!context || !root) return;
  const saved = readSaved(context.uid);
  const visible = filteredItems(context.items, saved);
  root.querySelector('.gl-grid')!.innerHTML = results(visible, context.photos, saved);
  root.querySelector('.gl-result-count')!.textContent = visible.length + ' de ' + context.items.length + ' guías';
  root.querySelectorAll<HTMLElement>('[data-gl-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.glView === filters.view)));
}

function openGuide(item: Guide, uid: string, opener: HTMLElement): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'gl-reader';
  dialog.setAttribute('aria-labelledby', 'gl-reader-title');
  const steps = stepsOf(item);
  const saved = readSaved(uid);
  const done = completed(saved, item);
  const section = (title: string, value: unknown) => value ? '<section><h3>' + title + '</h3><p>' + escape(value) + '</p></section>' : '';
  const connections = String(item.conexiones || '').split(/;\s*|\n+/).filter(Boolean);
  const photo = context?.photos.get(item.id);
  let video = '';
  try {
    const url = new URL(String(item.videoUrl || ''));
    if (url.protocol === 'https:' && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) video = url.href;
  } catch { /* La guía puede no incluir video. */ }
  dialog.innerHTML = '<header class="gl-reader-head"><span>GUÍA DE PROYECTO</span><button class="secondary-button" data-gl-close aria-label="Cerrar guía">Cerrar ×</button></header><div class="gl-reader-content"><span class="gl-origin">' + (item.guiaInicial ? 'PRÁCTICA · ARDUINO UNO · 5 V' : 'PROYECTO DEL CLUB') + '</span><h2 id="gl-reader-title">' + escape(item.titulo) + '</h2><p class="gl-lead">' + escape(item.resumen) + '</p><div class="gl-tags"><span>' + escape(item.nivelDificultad || 'Nivel sin indicar') + '</span><span>' + escape(item.tiempoEstimado || '') + '</span></div>' +
    (photo ? '<img class="gl-reader-photo" src="' + escape(photo) + '" alt="Prototipo de ' + escape(item.titulo) + '"/>' : '') +
    section('Qué vas a aprender', item.aprendizajes || item.problema) + section('Cómo funciona', item.funcionamiento) +
    '<section class="gl-preparation"><h3>Antes de conectar</h3><p>' + escape(item.seguridad || 'Revisa las conexiones con tu docente antes de alimentar el circuito.') + '</p></section>' + section('Materiales necesarios', item.materiales) +
    '<section><h3>Conexiones</h3><ul class="gl-connections">' + connections.map(line => '<li>' + escape(line) + '</li>').join('') + '</ul></section>' +
    '<section><h3>Paso a paso</h3><p data-gl-progress>' + done.length + ' de ' + steps.length + ' pasos marcados</p><progress max="' + Math.max(steps.length, 1) + '" value="' + done.length + '" aria-label="Avance en la guía"></progress><ol class="gl-steps">' + steps.map((step, i) => '<li><label><input type="checkbox" data-gl-step="' + i + '"' + (done.includes(i) ? ' checked' : '') + '/><span><b>Paso ' + (i + 1) + '</b>' + escape(step) + '</span></label></li>').join('') + '</ol></section>' +
    (item.codigoPrueba ? '<section><div class="gl-code-head"><h3>Código de prueba</h3><div><button class="secondary-button" data-gl-copy>Copiar código</button><button class="secondary-button" data-gl-download>Descargar .ino</button></div></div><pre class="gl-code"><code>' + escape(item.codigoPrueba) + '</code></pre><small>Selecciona la placa y el puerto correctos en Arduino IDE antes de cargar el programa.</small></section>' : '') +
    section('Comprueba el resultado', item.pruebas) + (video ? '<a href="' + escape(video) + '" target="_blank" rel="noopener noreferrer">Ver demostración en video ↗</a>' : '') + '<p class="gl-status" role="status" aria-live="polite"></p></div>';
  document.body.append(dialog);
  const status = (message: string) => { dialog.querySelector('.gl-status')!.textContent = message; };
  dialog.addEventListener('change', event => {
    const input = event.target as HTMLInputElement;
    if (!input.matches('[data-gl-step]')) return;
    const saved = readSaved(uid);
    const checked = [...dialog.querySelectorAll<HTMLInputElement>('[data-gl-step]:checked')].map(el => Number(el.dataset.glStep));
    saved.steps[item.id] = checked;
    if (!writeSaved(uid, saved)) { input.checked = !input.checked; status('No se pudo guardar el avance en este dispositivo.'); return; }
    dialog.querySelector('progress')!.value = checked.length;
    dialog.querySelector('[data-gl-progress]')!.textContent = checked.length + ' de ' + steps.length + ' pasos marcados';
    status(checked.length === steps.length ? 'Pasos marcados. Comprueba el resultado del circuito con tu docente.' : 'Avance guardado.');
    updateLibrary();
  });
  dialog.addEventListener('click', async event => {
    const target = event.target as HTMLElement;
    if (target === dialog || target.closest('[data-gl-close]')) { dialog.close(); return; }
    if (target.closest('[data-gl-copy]')) {
      try { await navigator.clipboard.writeText(String(item.codigoPrueba)); status('Código copiado.'); }
      catch { status('No se pudo copiar. Selecciona el código y cópialo manualmente.'); }
    }
    if (target.closest('[data-gl-download]')) {
      const url = URL.createObjectURL(new Blob([String(item.codigoPrueba)], { type: 'text/plain;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = url; link.download = (String(item.id).replace(/[^a-zA-Z0-9_-]/g, '-') || 'proyecto') + '.ino';
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      status('Archivo preparado para descargar.');
    }
  });
  dialog.addEventListener('close', () => {
    dialog.remove();
    const id = item.id;
    const replacement = [...document.querySelectorAll<HTMLElement>('[data-gl-open]')].find(el => el.dataset.glOpen === id);
    (opener.isConnected ? opener : replacement)?.focus();
  }, { once: true });
  dialog.showModal();
}

document.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  const library = target.closest('.gl-library');
  if (!context || !library) return;
  const opener = target.closest<HTMLElement>('[data-gl-open]');
  if (opener) { const item = context.items.find(item => item.id === opener.dataset.glOpen); if (item) openGuide(item, context.uid, opener); return; }
  const save = target.closest<HTMLElement>('[data-gl-save]');
  if (save) {
    const id = save.dataset.glSave!;
    const saved = readSaved(context.uid);
    saved.favorites = saved.favorites.includes(id) ? saved.favorites.filter(value => value !== id) : [...saved.favorites, id];
    if (!writeSaved(context.uid, saved)) { library.querySelector('.gl-status')!.textContent = 'No se pudo guardar en este dispositivo.'; return; }
    updateLibrary();
    ([...library.querySelectorAll<HTMLElement>('[data-gl-save]')].find(el => el.dataset.glSave === id) || library.querySelector<HTMLElement>('[data-gl-view][aria-pressed="true"]'))?.focus();
  }
  const view = target.closest<HTMLElement>('[data-gl-view]');
  if (view) { filters.view = view.dataset.glView!; updateLibrary(); }
  if (target.closest('[data-gl-reset]')) {
    filters = { search: '', level: '', area: '', view: 'all', sort: 'level' };
    library.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-gl-filter]').forEach(input => input.value = input.dataset.glFilter === 'sort' ? 'level' : '');
    updateLibrary();
  }
});
function filterEvent(event: Event): void {
  const input = event.target as HTMLInputElement;
  if (!input.closest('.gl-library') || !input.matches('[data-gl-filter]')) return;
  const field = input.dataset.glFilter as keyof typeof filters;
  filters[field] = input.value;
  updateLibrary();
}
document.addEventListener('input', filterEvent);
document.addEventListener('change', filterEvent);
