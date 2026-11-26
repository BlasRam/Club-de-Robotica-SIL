import './guide-library.css';
import { learningRoute, wiringMarkup } from './guide-content';
import type { GuideWorkspace } from './guide-workspace';

type Guide = Record<string, any> & { id: string };
type Saved = { favorites: string[]; steps: Record<string, number[]> };
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const normalize = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const stepsOf = (item: Guide) => String(item.pasosImplementacion || '').split(/(?:^|\s+)\d+\.\s+|\n+/).map(s => s.trim()).filter(Boolean);
const storageKey = (uid: string) => 'club-guide-library-v1:' + uid;

function readSaved(uid: string): Saved {
  if (context?.workspace?.uid === uid) return context.workspace.progress.get();
  try {
    const value = JSON.parse(localStorage.getItem(storageKey(uid)) || '{}');
    return {
      favorites: Array.isArray(value.favorites) ? value.favorites.filter((id: unknown) => typeof id === 'string') : [],
      steps: value.steps && typeof value.steps === 'object' && !Array.isArray(value.steps) ? value.steps : {},
    };
  } catch { return { favorites: [], steps: {} }; }
}
function writeSaved(uid: string, value: Saved): boolean {
  if (context?.workspace?.uid === uid) return context.workspace.progress.change(value);
  try { localStorage.setItem(storageKey(uid), JSON.stringify(value)); return true; } catch { return false; }
}
function completed(saved: Saved, item: Guide): number[] {
  const list = saved.steps[item.id];
  return Array.isArray(list) ? [...new Set(list.filter(n => Number.isInteger(n) && n >= 0 && n < stepsOf(item).length))] : [];
}
const circuit = '<svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="13" y="13" width="22" height="22" rx="4"/><path d="M18 6v7m12-7v7M18 35v7m12-7v7M6 18h7m-7 12h7m22-12h7m-7 12h7"/><path d="m21 20-4 4 4 4m6-8 4 4-4 4"/></svg>';
let context: { uid: string; items: Guide[]; photos: Map<string, string>; workspace?: GuideWorkspace } | null = null;
let filters = { search: '', level: '', area: '', duration: '', view: 'all', sort: 'level' };
type CatalogLayout = 'list' | 'grid';
const layoutStorageKey = 'club-guide-catalog-layout-v1';
let catalogLayout: CatalogLayout = (() => {
  try { return localStorage.getItem(layoutStorageKey) === 'grid' ? 'grid' : 'list'; }
  catch { return 'list'; }
})();

function durationBand(item: Guide): string {
  const value = normalize(item.tiempoEstimado);
  const amounts = [...value.matchAll(/\d+(?:[.,]\d+)?/g)].map(match => Number(match[0].replace(',', '.')));
  if (!amounts.length) return '';
  const minutes = amounts.reduce((sum, amount) => sum + amount, 0) / amounts.length * (/\bh\b|hora/.test(value) ? 60 : 1);
  return minutes <= 60 ? 'short' : minutes <= 120 ? 'medium' : 'long';
}

function card(item: Guide, saved: Saved, photos: Map<string, string>): string {
  const coverImage = photos.get(item.id) || item.coverImage;
  return '<article class="gl-card" data-gl-card="' + escape(item.id) + '"><button class="gl-project-open" type="button" data-gl-open="' + escape(item.id) + '" aria-label="Abrir guía: ' + escape(item.titulo) + '"><span class="gl-card-top">' +
    (coverImage ? '<img src="' + escape(coverImage) + '" alt="Montaje del proyecto: ' + escape(item.titulo) + '" loading="lazy"/>' : '<span class="gl-circuit">' + circuit + '</span>') +
    '</span><span class="gl-project-name">' + escape(item.titulo) + '</span></button></article>';
}

function filteredItems(items: Guide[], saved: Saved): Guide[] {
  const terms = normalize(filters.search).trim().split(/\s+/).filter(Boolean);
  const levels = ['Inicial', 'Intermedio', 'Avanzado'];
  return items.filter(item => {
    const haystack = normalize([item.titulo, item.resumen, item.materiales, item.tecnologias, ...(item.areas || [])].join(' '));
    return (filters.view === 'archived' ? item.archivada === true : item.archivada !== true) && terms.every(term => haystack.includes(term)) && (!filters.level || item.nivelDificultad === filters.level)
      && (!filters.area || (item.areas || []).includes(filters.area))
      && (!filters.duration || durationBand(item) === filters.duration)
      && (filters.view !== 'saved' || saved.favorites.includes(item.id))
      && (filters.view !== 'started' || completed(saved, item).length > 0);
  }).sort((a, b) => filters.sort === 'title' ? String(a.titulo).localeCompare(String(b.titulo), 'es')
    : (levels.indexOf(a.nivelDificultad) < 0 ? 3 : levels.indexOf(a.nivelDificultad)) - (levels.indexOf(b.nivelDificultad) < 0 ? 3 : levels.indexOf(b.nivelDificultad)));
}

function results(items: Guide[], photos: Map<string, string>, saved: Saved): string {
  return items.length ? items.map(item => card(item, saved, photos)).join('')
    : '<div class="gl-empty"><p>No hay proyectos con esta búsqueda.</p><button class="text-button" data-gl-reset>Mostrar todos los proyectos</button></div>';
}

export function renderGuideLibrary(items: Guide[], photos: Map<string, string>, uid: string, workspace?: GuideWorkspace): string {
  if (context?.uid !== uid) filters = { search: '', level: '', area: '', duration: '', view: 'all', sort: 'level' };
  context = { uid, items, photos, workspace };
  const saved = readSaved(uid);
  const visible = filteredItems(items, saved);
  const areas = [...new Set(items.flatMap(item => item.areas || []))].sort();
  const option = (label: string, value: string, selected: string) => '<option value="' + escape(value) + '"' + (value === selected ? ' selected' : '') + '>' + escape(label) + '</option>';
  return '<section class="gl-library" aria-label="Biblioteca de proyectos"><div class="gl-catalog-controls"><label class="gl-search"><span class="gl-visually-hidden">Buscar proyectos, sensores o materiales</span><input type="search" data-gl-filter="search" aria-label="Buscar proyectos, sensores o materiales" placeholder="Ej.: robot móvil, LED, sensor ultrasónico" value="' + escape(filters.search) + '"/></label>' +
    '<div class="gl-catalog-tabs" role="group" aria-label="Ver proyectos">' + [['all', 'Todos'], ['saved', 'Guardados'], ['started', 'En progreso'], ...(workspace?.admin ? [['archived', 'Archivados']] : [])].map(([value, label]) => '<button type="button" data-gl-view="' + value + '" aria-pressed="' + (filters.view === value) + '">' + label + '</button>').join('') + '</div>' +
    '<details class="gl-more-filters"><summary>Más filtros</summary><div class="gl-filter-row"><label>Nivel<select data-gl-filter="level">' + option('Todos', '', filters.level) + option('Principiante', 'Inicial', filters.level) + option('Intermedio', 'Intermedio', filters.level) + option('Avanzado', 'Avanzado', filters.level) + '</select></label><label>Duración<select data-gl-filter="duration">' + option('Cualquiera', '', filters.duration) + option('Hasta 1 hora', 'short', filters.duration) + option('1 a 2 horas', 'medium', filters.duration) + option('Más de 2 horas', 'long', filters.duration) + '</select></label><label>Área<select data-gl-filter="area">' + option('Todas', '', filters.area) + areas.map(a => option(a, a, filters.area)).join('') + '</select></label><label>Orden<select data-gl-filter="sort">' + option('Más fáciles primero', 'level', filters.sort) + option('Nombre A–Z', 'title', filters.sort) + '</select></label><button type="button" class="gl-clear" data-gl-reset>Limpiar búsqueda y filtros</button></div></details></div>' +
    workspaceToolbar(workspace) + routeMarkup(items, saved) + '<div class="gl-results-toolbar"><p class="gl-result-count" role="status" aria-live="polite">' + visible.length + ' de ' + items.length + ' proyectos</p><div class="gl-layout-toggle" role="group" aria-label="Vista de proyectos"><button type="button" data-gl-layout="list" aria-label="Ver como lista" title="Lista" aria-pressed="' + (catalogLayout === 'list') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6h12M8 12h12M8 18h12M3 6h.01M3 12h.01M3 18h.01"/></svg><span class="gl-visually-hidden">Lista</span></button><button type="button" data-gl-layout="grid" aria-label="Ver como cuadrícula" title="Cuadrícula" aria-pressed="' + (catalogLayout === 'grid') + '"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg><span class="gl-visually-hidden">Cuadrícula</span></button></div></div><div class="gl-grid" data-layout="' + catalogLayout + '">' + results(visible, photos, saved) + '</div><p class="gl-status" role="status"></p></section>';
}

function updateLibrary(): void {
  const root = document.querySelector<HTMLElement>('.gl-library');
  if (!context || !root) return;
  const saved = readSaved(context.uid);
  const route = root.querySelector('.gl-route');
  if (route) route.innerHTML = routeContents(context.items, saved);
  const visible = filteredItems(context.items, saved);
  const grid = root.querySelector<HTMLElement>('.gl-grid')!;
  grid.dataset.layout = catalogLayout;
  grid.innerHTML = results(visible, context.photos, saved);
  root.querySelector('.gl-result-count')!.textContent = visible.length + ' de ' + context.items.length + ' guías';
  root.querySelectorAll<HTMLElement>('[data-gl-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.glView === filters.view)));
  root.querySelectorAll<HTMLElement>('[data-gl-layout]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.glLayout === catalogLayout)));
}

function openGuide(item: Guide, uid: string, opener: HTMLElement): void {
  const workspace = context?.workspace;
  const dialog = document.createElement('dialog');
  dialog.className = 'gl-reader';
  dialog.setAttribute('aria-labelledby', 'gl-reader-title');
  const steps = stepsOf(item);
  const saved = readSaved(uid);
  const favorite = saved.favorites.includes(item.id);
  const done = completed(saved, item);
  const section = (title: string, value: unknown) => value ? '<section><h3>' + title + '</h3><p>' + escape(value) + '</p></section>' : '';
  const connections = String(item.conexiones || '').split(/;\s*|\n+/).filter(Boolean);
  const photo = context?.photos.get(item.id) || item.coverImage;
  let video = '';
  try {
    const url = new URL(String(item.videoUrl || ''));
    if (url.protocol === 'https:' && ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'vimeo.com', 'www.vimeo.com', 'player.vimeo.com'].includes(url.hostname)) video = url.href;
  } catch { /* La guía puede no incluir video. */ }
  dialog.innerHTML = '<header class="gl-reader-head"><span>GUÍA DE PROYECTO</span><div class="gl-reader-actions"><button class="secondary-button" data-gl-reader-save aria-pressed="' + favorite + '">' + (favorite ? 'Guardada' : 'Guardar') + '</button><button class="secondary-button" data-gl-close aria-label="Cerrar guía">Cerrar ×</button></div></header><div class="gl-reader-content"><span class="gl-origin">' + (item.guiaInicial ? 'PRÁCTICA · ARDUINO UNO · 5 V' : 'PROYECTO DEL CLUB') + '</span><h2 id="gl-reader-title">' + escape(item.titulo) + '</h2><p class="gl-lead">' + escape(item.resumen) + '</p><div class="gl-tags"><span>' + escape(item.nivelDificultad || 'Nivel sin indicar') + '</span><span>' + escape(item.tiempoEstimado || '') + '</span></div>' +
    (photo ? '<img class="gl-reader-photo" src="' + escape(photo) + '" alt="Prototipo de ' + escape(item.titulo) + '"/>' : '') +
    section('El reto', item.problema) + section('Qué vas a aprender', item.aprendizajes) + section('Cómo funciona', item.funcionamiento) +
    '<section class="gl-preparation"><h3>Antes de conectar</h3><p>' + escape(item.seguridad || 'Revisa las conexiones con tu docente antes de alimentar el circuito.') + '</p></section>' + section('Materiales necesarios', item.materiales) + '<section data-gl-inventory></section>' +
    '<section><h3>Conexiones</h3>' + wiringMarkup(String(item.diagrama || '')) + '<ul class="gl-connections">' + connections.map(line => '<li>' + escape(line) + '</li>').join('') + '</ul></section>' +
    '<section><h3>Paso a paso</h3><p data-gl-progress>' + done.length + ' de ' + steps.length + ' pasos marcados</p><small data-gl-sync>' + escape(workspace?.progress.status() || '') + '</small><progress max="' + Math.max(steps.length, 1) + '" value="' + done.length + '" aria-label="Avance en la guía"></progress><ol class="gl-steps">' + steps.map((step, i) => '<li><label><input type="checkbox" data-gl-step="' + i + '"' + (done.includes(i) ? ' checked' : '') + '/><span><b>Paso ' + (i + 1) + '</b>' + escape(step) + '</span></label></li>').join('') + '</ol></section>' +
    (item.codigoPrueba ? '<section><div class="gl-code-head"><h3>Código de prueba</h3><div><button class="secondary-button" data-gl-copy>Copiar código</button><button class="secondary-button" data-gl-download>Descargar .ino</button></div></div><pre class="gl-code"><code>' + escape(item.codigoPrueba) + '</code></pre><small>Selecciona la placa y el puerto correctos en Arduino IDE antes de cargar el programa.</small></section>' : '') +
    section('Comprueba el resultado', item.pruebas) + troubleshootingMarkup(item) + readerActions(workspace, item) + (video ? '<a href="' + escape(video) + '" target="_blank" rel="noopener noreferrer">Ver demostración en video ↗</a>' : '') + '<p class="gl-status" role="status" aria-live="polite"></p></div>';
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
    if (target.closest('[data-gl-reader-save]')) {
      const current = readSaved(uid);
      current.favorites = current.favorites.includes(item.id) ? current.favorites.filter(id => id !== item.id) : [...current.favorites, item.id];
      if (!writeSaved(uid, current)) { status('No se pudo guardar en este dispositivo.'); return; }
      const saveButton = dialog.querySelector<HTMLButtonElement>('[data-gl-reader-save]')!;
      const isSaved = current.favorites.includes(item.id);
      saveButton.setAttribute('aria-pressed', String(isSaved));
      saveButton.textContent = isSaved ? 'Guardada' : 'Guardar';
      updateLibrary();
      status(isSaved ? 'Guía guardada.' : 'Guía quitada de guardadas.');
      return;
    }
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
  if (workspace) void workspace.mountInventory(dialog.querySelector<HTMLElement>('[data-gl-inventory]')!, item);
  const repaint = () => {
    const checked = completed(readSaved(uid), item);
    dialog.querySelector('[data-gl-sync]')!.textContent = workspace?.progress.status() || '';
    dialog.querySelectorAll<HTMLInputElement>('[data-gl-step]').forEach(input => input.checked = checked.includes(Number(input.dataset.glStep)));
    dialog.querySelector('progress')!.value = checked.length;
    dialog.querySelector('[data-gl-progress]')!.textContent = checked.length + ' de ' + steps.length + ' pasos marcados';
  };
  document.addEventListener('guide-progress-changed', repaint);
  dialog.addEventListener('close', () => document.removeEventListener('guide-progress-changed', repaint), { once: true });
  dialog.addEventListener('click', event => {
    const target = event.target as Element;
    if (!workspace) return;
    if (target.closest('[data-gl-project]')) void workspace.proposeProject(item);
    if (target.closest('[data-gl-evidence]')) void workspace.sendEvidence(item);
    if (target.closest('[data-gl-edit]')) { dialog.close(); void workspace.editGuide(item); }
    if (target.closest('[data-gl-archive]')) { dialog.close(); void workspace.archiveGuide(item); }
  });
}

document.addEventListener('click', event => {
  const target = event.target as HTMLElement;
  const library = target.closest('.gl-library');
  if (!context || !library) return;
  const workspace = context.workspace;
  if (workspace) {
    if (target.closest('[data-gl-new]')) void workspace.editGuide();
    if (target.closest('[data-gl-my-evidence]')) void workspace.evidenceInbox();
    if (target.closest('[data-gl-inbox]')) void workspace.evidenceInbox(true);
    if (target.closest('[data-gl-proposals]')) void workspace.proposals(context.items);
  }
  const opener = target.closest<HTMLElement>('[data-gl-open]');
  if (opener) { const item = context.items.find(item => item.id === opener.dataset.glOpen); if (item) openGuide(item, context.uid, opener); return; }
  const view = target.closest<HTMLElement>('[data-gl-view]');
  if (view) { filters.view = view.dataset.glView!; updateLibrary(); }
  const layout = target.closest<HTMLElement>('[data-gl-layout]');
  if (layout && (layout.dataset.glLayout === 'list' || layout.dataset.glLayout === 'grid')) {
    catalogLayout = layout.dataset.glLayout;
    try { localStorage.setItem(layoutStorageKey, catalogLayout); } catch { /* The current view still works without storage. */ }
    updateLibrary();
    library.querySelector<HTMLElement>('[data-gl-layout="' + catalogLayout + '"]')?.focus();
  }
  if (target.closest('[data-gl-reset]')) {
    filters = { search: '', level: '', area: '', duration: '', view: 'all', sort: 'level' };
    library.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-gl-filter]').forEach(input => input.value = input.dataset.glFilter === 'sort' ? 'level' : '');
    library.querySelector<HTMLInputElement>('[data-gl-filter="search"]')!.value = '';
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

export function refreshGuideLibrary(): void {
  updateLibrary();
  document.dispatchEvent(new Event('guide-progress-changed'));
}
function workspaceToolbar(workspace?: GuideWorkspace): string {
  if (!workspace?.authorized) return '';
  return '<details class="gl-workspace-tools"><summary>Herramientas del club</summary><div class="gw-toolbar">' + (workspace.admin ? '<button class="primary-button" data-gl-new>Crear guía</button>' : '') + '<button class="secondary-button" data-gl-my-evidence>Mis evidencias</button><button class="secondary-button" data-gl-proposals>' + (workspace.admin ? 'Propuestas de proyectos' : 'Mis propuestas') + '</button>' + (workspace.teacher || workspace.admin ? '<button class="secondary-button" data-gl-inbox>Evidencias para revisar</button>' : '') + '</div></details>';
}
function readerActions(workspace: GuideWorkspace | undefined, item: Guide): string {
  if (!workspace?.authorized) return '';
  return '<section class="gw-toolbar"><button class="primary-button" data-gl-project>' + (workspace.admin ? 'Crear proyecto con tareas' : 'Proponer proyecto') + '</button><button class="secondary-button" data-gl-evidence>Compartir evidencia</button>' + (workspace.admin ? '<button class="secondary-button" data-gl-edit>Editar guía</button><button class="secondary-button" data-gl-archive>' + (item.archivada ? 'Restaurar' : 'Archivar') + '</button>' : '') + '</section>';
}
function troubleshootingMarkup(item: Guide): string {
  const lines = String(item.erroresFrecuentes || '').split('\n').filter(Boolean);
  if (!lines.length) return '';
  return '<section><h3>Si algo no funciona</h3>' + lines.map(line => { const [problem, ...answer] = line.split('|'); return '<details class="gw-trouble"><summary>' + escape(problem) + '</summary><p>' + escape(answer.join('|')) + '</p></details>'; }).join('') + '</section>';
}
function routeContents(items: Guide[], saved: Saved): string {
  return '<summary>Ver ruta de aprendizaje</summary><p>Orden sugerido para avanzar por los proyectos.</p><div class="gw-route-grid">' + learningRoute.map(stage => '<section><h3>' + stage.title + '</h3>' + stage.ids.map(id => {
    const item = items.find(item => item.id === id && !item.archivada); if (!item) return '';
    const done = completed(saved,item).length; const total = stepsOf(item).length;
    return '<button data-gl-open="' + escape(id) + '"><span>' + escape(item.titulo) + '</span><small>' + (done && done === total ? 'Pasos marcados ✓' : done ? done + '/' + total + ' pasos' : 'Empezar →') + '</small></button>';
  }).join('') + '</section>').join('') + '</div>';
}
function routeMarkup(items: Guide[], saved: Saved): string { return '<details class="gl-route">' + routeContents(items,saved) + '</details>'; }
