import { collection, doc, getDoc, getDocs, limit, query, where, orderBy, startAfter, serverTimestamp, setDoc, updateDoc, deleteDoc, runTransaction, Timestamp, type Firestore, type Query, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { createGuideProgress } from './guide-progress';
export type LibraryGuide = Record<string, any> & { id: string };
export type WorkspaceOptions = { db: Firestore; uid: string; name: string; admin: boolean; teacher: boolean; authorized: boolean; refresh: () => Promise<void>; openProject: (id: string) => Promise<void> };
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const norm = (value: unknown) => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const guideSteps = (guide: LibraryGuide) => String(guide.pasosImplementacion || '').split(/(?:^|\s+)\d+\.\s+|\n+/).map(s => s.trim()).filter(Boolean).slice(0, 100);
const fields: [string, string, number, boolean][] = [
  ['titulo','Título',100,true], ['resumen','Resumen',600,true], ['problema','Objetivo',600,true], ['funcionamiento','Cómo funciona',1000,true],
  ['materiales','Materiales necesarios',800,false], ['conexiones','Conexiones',1200,true], ['diagrama','Diagrama: origen | destino | alimentación, tierra o señal (una unión por línea)',3000,false],
  ['pasosImplementacion','Pasos numerados',3000,true], ['codigoPrueba','Código de prueba',6000,false], ['pruebas','Cómo comprobar el resultado',1000,true],
  ['erroresFrecuentes','Problema | solución (uno por línea)',3000,false], ['aprendizajes','Qué se aprende',1000,true], ['seguridad','Precauciones',1000,false], ['tecnologias','Tecnologías',500,true], ['videoUrl','Video HTTPS de YouTube o Vimeo (opcional)',400,false],
];
function modal(title: string) {
  const element = document.createElement('dialog'); element.className = 'gl-reader gl-workspace';
  const titleId = 'gw-title-' + Math.random().toString(36).slice(2);
  element.setAttribute('aria-labelledby', titleId);
  element.innerHTML = '<header class="gl-reader-head"><h2 id="' + titleId + '">' + esc(title) + '</h2><button type="button" class="secondary-button" data-gw-close>Cerrar ×</button></header><div class="gl-reader-content" data-gw-body></div><p class="gl-status" role="status" aria-live="polite"></p>';
  document.body.append(element); element.showModal();
  element.addEventListener('click', e => { if ((e.target as Element).closest('[data-gw-close]') || e.target === element) element.close(); });
  element.addEventListener('close', () => element.remove(), { once: true });
  return { element, body: element.querySelector<HTMLElement>('[data-gw-body]')!, status: (text: string) => { element.querySelector('.gl-status')!.textContent = text; } };
}
function formSubmit(dialog: ReturnType<typeof modal>, action: (data: FormData, form: HTMLFormElement) => Promise<void>) {
  dialog.element.addEventListener('submit', async event => {
    event.preventDefault(); const form = event.target as HTMLFormElement;
    const button = form.querySelector<HTMLButtonElement>('[type=submit]')!; button.disabled = true; dialog.status('Guardando…');
    try { await action(new FormData(form), form); }
    catch (error) { dialog.status((error as { code?: string }).code === 'permission-denied' ? 'Tu cuenta no tiene permiso para esta acción.' : (error as Error).message || 'No se pudo guardar. Reintenta cuando tengas conexión.'); }
    finally { button.disabled = false; }
  });
}
async function smallPhoto(file: File): Promise<string> {
  if (!file.size) return '';
  if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 8 * 1024 * 1024) throw new Error('Usa una imagen JPG, PNG o WebP de hasta 8 MB.');
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas'); const scale = Math.min(1, 1000 / Math.max(bitmap.width, bitmap.height));
  canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
  for (const quality of [0.8, 0.6, 0.4]) { const result = canvas.toDataURL('image/jpeg', quality); if (result.length <= 280000) return result; }
  throw new Error('La foto tiene demasiado detalle. Recórtala o usa una imagen más pequeña.');
}
export function createGuideWorkspace(options: WorkspaceOptions, changed: () => void) {
  const { db, uid } = options;
  const progress = createGuideProgress(db, uid, changed);
  const directory = async () => (await getDocs(query(collection(db, 'directorioClub'), orderBy('nombreCompleto'), limit(300)))).docs;
  const inventory = async () => (await getDocs(query(collection(db, 'inventario'), orderBy('nombre'), limit(300)))).docs;
  function payload(guide: LibraryGuide, data?: FormData, archived = false) {
    const result: Record<string, any> = { proyectoId: guide.id, estado: 'publicada', archivada: archived, tipoGuia: guide.guiaInicial || guide.tipoGuia === 'practica' ? 'practica' : 'proyecto' };
    for (const [field] of fields) result[field] = data ? String(data.get(field) || '').trim() : String(guide[field] || '');
    result.areas = data ? data.getAll('areas').map(String) : guide.areas || [];
    result.nivelDificultad = data ? String(data.get('nivelDificultad')) : guide.nivelDificultad;
    result.tiempoEstimado = data ? String(data.get('tiempoEstimado')) : guide.tiempoEstimado;
    result.inventarioIds = data ? data.getAll('inventarioIds').map(String) : guide.inventarioIds || [];
    if (result.inventarioIds.length > 20) throw new Error('Vincula hasta 20 artículos.');
    const wires = result.diagrama.split('\n').filter((line: string) => line.trim());
    if (wires.length > 24 || wires.some((line: string) => {
      const parts = line.split('|').map(value => value.trim());
      return parts.length !== 3 || !parts[0] || parts[0].length > 26 || !parts[1] || parts[1].length > 40 || !['alimentación','tierra','señal'].includes(parts[2]);
    })) throw new Error('Diagrama: usa hasta 24 uniones con origen (26 caracteres), destino (40) y tipo (alimentación, tierra o señal), separados por |.');
    if (result.videoUrl) {
      const url = new URL(result.videoUrl);
      if (url.protocol !== 'https:' || !['youtube.com','www.youtube.com','m.youtube.com','youtu.be','vimeo.com','www.vimeo.com','player.vimeo.com'].includes(url.hostname)) throw new Error('Usa un video HTTPS de YouTube o Vimeo.');
    }
    if (guide.fotoPath) result.fotoPath = guide.fotoPath;
    return result;
  }
  async function saveGuide(guide: LibraryGuide, value: Record<string, any>) {
    if (!options.admin) throw new Error('Solo administración puede editar la biblioteca.');
    await runTransaction(db, async tx => {
      const ref = doc(db, 'guiasPublicadas', guide.id); const current = await tx.get(ref);
      if (Number(current.data()?.revision || 0) !== Number(guide.revision || 0)) throw new Error('La guía cambió en otra sesión. Recarga antes de editar.');
      tx.set(ref, { ...value, revision: Number(guide.revision || 0) + 1 });
    });
  }
  async function editGuide(source?: LibraryGuide) {
    const guide: LibraryGuide = source || { id: doc(collection(db, 'guiasPublicadas')).id, areas: ['Electrónica','Programación'], nivelDificultad: 'Inicial', tiempoEstimado: '1-2 horas', tecnologias: 'Arduino Uno', guiaInicial: true };
    const dialog = modal(source ? 'Editar guía' : 'Crear guía'); dialog.body.textContent = 'Cargando inventario…';
    let items: QueryDocumentSnapshot[] = [];
    try { items = await inventory(); } catch { dialog.status('No se pudo leer el inventario. Puedes guardar el contenido conservando los vínculos existentes.'); }
    if (!dialog.element.isConnected) return;
    dialog.body.innerHTML = '<form class="gw-form">' + fields.map(([field, label, max, required]) => '<label>' + label + '<textarea name="' + field + '" rows="' + (field === 'codigoPrueba' ? 10 : field === 'titulo' ? 1 : 3) + '" maxlength="' + max + '"' + (required ? ' required' : '') + '>' + esc(guide[field] || '') + '</textarea></label>').join('') +
      '<label>Nivel<select name="nivelDificultad">' + ['Inicial','Intermedio','Avanzado'].map(v => '<option' + (v === guide.nivelDificultad ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label><label>Tiempo<select name="tiempoEstimado">' + ['1-2 horas','3-5 horas','Más de 5 horas'].map(v => '<option' + (v === guide.tiempoEstimado ? ' selected' : '') + '>' + v + '</option>').join('') + '</select></label><fieldset><legend>Áreas</legend>' + ['Electrónica','Mecánica','Programación'].map(v => '<label><input type="checkbox" name="areas" value="' + v + '"' + (guide.areas?.includes(v) ? ' checked' : '') + '/>' + v + '</label>').join('') + '</fieldset><label>Materiales vinculados (hasta 20)<select name="inventarioIds" multiple size="6">' + items.map(item => '<option value="' + esc(item.id) + '"' + (guide.inventarioIds?.includes(item.id) ? ' selected' : '') + '>' + esc(item.get('nombre')) + '</option>').join('') + '</select></label><button class="primary-button" type="submit">Guardar y publicar guía</button></form>';
    formSubmit(dialog, async data => {
      const value = payload(guide, data, source?.archivada === true);
      if (!items.length) value.inventarioIds = guide.inventarioIds || [];
      await saveGuide(guide, value); dialog.element.close(); await options.refresh();
    });
  }
  async function archiveGuide(guide: LibraryGuide) {
    const dialog = modal(guide.archivada ? 'Restaurar guía' : 'Archivar guía');
    dialog.body.innerHTML = '<form><p>' + esc(guide.titulo) + '</p><p>' + (guide.archivada ? 'Volverá a aparecer en la biblioteca.' : 'Se ocultará del catálogo; administración podrá restaurarla.') + '</p><button type="submit" class="primary-button">Confirmar</button></form>';
    formSubmit(dialog, async () => { await saveGuide(guide, payload(guide, undefined, !guide.archivada)); dialog.element.close(); await options.refresh(); });
  }
  async function requestMaterial(item: QueryDocumentSnapshot, guide: LibraryGuide) {
    const dialog = modal('Solicitar ' + item.get('nombre'));
    dialog.body.innerHTML = '<form class="gw-form"><p>La solicitud requiere aprobación de administración.</p><label>Cantidad<input type="number" name="cantidad" min="1" max="' + Number(item.get('cantidad')) + '" value="1" required/></label><label>Inicio<input type="date" name="inicio" required/></label><label>Devolución prevista<input type="date" name="fin" required/></label><button type="submit" class="primary-button">Enviar solicitud</button></form>';
    formSubmit(dialog, async data => {
      const start = new Date(String(data.get('inicio')) + 'T12:00:00'); const end = new Date(String(data.get('fin')) + 'T12:00:00'); const amount = Number(data.get('cantidad'));
      if (!Number.isInteger(amount) || amount < 1 || !Number.isFinite(+start) || !Number.isFinite(+end) || end < start) throw new Error('Revisa cantidad y fechas.');
      await setDoc(doc(collection(db, 'reservas')), { recursoNombre: item.get('nombre'), recursoId: item.id, cantidadSolicitada: amount, motivo: 'Guía: ' + String(guide.titulo).slice(0, 100), solicitanteUid: uid, solicitanteNombre: options.name, estado: 'Pendiente', fechaReserva: Timestamp.fromDate(start), fechaInicioUso: Timestamp.fromDate(start), fechaDevolucion: Timestamp.fromDate(end), fechaCreacion: serverTimestamp() });
      dialog.body.innerHTML = '<p>Solicitud enviada. Puedes seguir su estado en Préstamos.</p>'; dialog.status('');
    });
  }
  async function mountInventory(host: HTMLElement, guide: LibraryGuide) {
    if (!options.authorized) { host.textContent = 'Tu cuenta debe estar autorizada para consultar materiales y pedir préstamos.'; return; }
    host.textContent = 'Consultando existencias…';
    try {
      const items = await inventory(); if (!host.isConnected) return;
      const ids = Array.isArray(guide.inventarioIds) ? guide.inventarioIds : [];
      const tokens = norm(guide.materiales).split(/[^a-z0-9]+/).filter(s => s.length > 2 && !['arduino','para','con','una','del','los','las','tres','dos','cables'].includes(s));
      const linked = ids.length ? items.filter(item => ids.includes(item.id)) : items.filter(item => tokens.some(token => norm(item.get('nombre')).includes(token)));
      host.innerHTML = '<h3>Materiales del inventario</h3><p>' + (ids.length ? 'Artículos vinculados por administración.' : 'Coincidencias por nombre: comprueba modelo y valores antes de solicitar.') + '</p><label>Buscar en el inventario<input type="search" data-gw-inventory placeholder="Nombre del componente"/></label><div data-gw-items></div><small>Consulta de hasta 300 artículos. La existencia se vuelve a validar al solicitar y aprobar el préstamo.</small>';
      const list = host.querySelector<HTMLElement>('[data-gw-items]')!;
      const show = (records: QueryDocumentSnapshot[]) => {
        list.innerHTML = records.length ? records.map(item => '<div class="gw-item"><div><strong>' + esc(item.get('nombre')) + '</strong><small>' + (item.get('estado') === 'Disponible' ? Number(item.get('cantidad') || 0) + ' disponibles' : esc(item.get('estado'))) + '</small></div><button class="secondary-button" data-gw-loan="' + esc(item.id) + '"' + (item.get('estado') !== 'Disponible' || Number(item.get('cantidad')) < 1 ? ' disabled' : '') + '>Solicitar</button></div>').join('') : '<p>No se encontraron artículos. Puedes buscar otro nombre o consultar a administración.</p>';
      }; show(linked);
      host.querySelector('input')!.addEventListener('input', event => { const term = norm((event.target as HTMLInputElement).value); show(term ? items.filter(item => norm(item.get('nombre')).includes(term)) : linked); });
      host.addEventListener('click', event => { const id = (event.target as Element).closest<HTMLElement>('[data-gw-loan]')?.dataset.gwLoan; const item = items.find(item => item.id === id); if (item) void requestMaterial(item, guide); });
    } catch { host.innerHTML = '<p>No se pudo consultar el inventario.</p><button class="secondary-button" data-gw-retry>Reintentar</button>'; host.querySelector('button')!.onclick = () => void mountInventory(host, guide); }
  }
  async function proposeProject(guide: LibraryGuide) {
    if (options.admin) return projectForm(guide);
    const dialog = modal('Proponer un proyecto');
    dialog.body.innerHTML = '<form><p>Administración revisará tu propuesta basada en <strong>' + esc(guide.titulo) + '</strong> y podrá crear el equipo con sus tareas iniciales.</p><button type="submit" class="primary-button">Enviar propuesta</button></form>';
    formSubmit(dialog, async () => {
      const id = uid + '-' + guide.id;
      await runTransaction(db, async tx => { const ref = doc(db, 'propuestasGuias', id); const current = await tx.get(ref); if (current.exists()) throw new Error('Ya enviaste esta propuesta. Consulta su estado en Mis propuestas.'); tx.set(ref, { guiaId: guide.id, tituloGuia: String(guide.titulo).slice(0,100), propietarioUid: uid, nombre: options.name, estado: 'pendiente', proyectoId: '', fecha: serverTimestamp() }); });
      dialog.body.innerHTML = '<p>Propuesta enviada a administración.</p>'; dialog.status('');
    });
  }
  async function projectForm(guide: LibraryGuide, proposal?: QueryDocumentSnapshot) {
    const dialog = modal('Crear proyecto desde la guía'); dialog.body.textContent = 'Cargando responsables…';
    try {
      const people = await directory(); if (!dialog.element.isConnected) return;
      const steps = guideSteps(guide);
      dialog.body.innerHTML = '<form class="gw-form"><label>Nombre del proyecto<input name="nombre" maxlength="100" value="' + esc(guide.titulo) + '" required/></label><label>Responsable<select name="responsable" required>' + people.map(person => '<option value="' + esc(person.id) + '"' + (person.id === (proposal?.get('propietarioUid') || uid) ? ' selected' : '') + '>' + esc(person.get('nombreCompleto')) + '</option>').join('') + '</select></label><p>Se copiarán objetivo, materiales y estas tareas sin asignar:</p><ol>' + steps.map(step => '<li>' + esc(step) + '</li>').join('') + '</ol><button type="submit" class="primary-button">Crear proyecto y tareas</button></form>';
      const projectRef = proposal ? doc(db, 'proyectos', 'guia-' + proposal.id) : doc(collection(db, 'proyectos'));
      formSubmit(dialog, async data => {
        if (!String(data.get('nombre') || '').trim()) throw new Error('Escribe un nombre para el proyecto.');
        const person = people.find(p => p.id === data.get('responsable')); if (!person) throw new Error('Selecciona un responsable.');
        await runTransaction(db, async tx => {
          const existing = await tx.get(projectRef); const request = proposal ? await tx.get(proposal.ref) : null;
          if (existing.exists() || (request && request.get('estado') !== 'pendiente')) throw new Error('Esta propuesta ya fue procesada.');
          tx.set(projectRef, { nombre: String(data.get('nombre')).trim(), descripcion: String(guide.problema || guide.resumen).slice(0,600), objetivo: String(guide.problema || guide.resumen).slice(0,600), materiales: String(guide.materiales || '').slice(0,800), departamentos: guide.areas || [], estado: 'Activo', creadoPorUid: uid, responsableUid: person.id, responsableNombre: person.get('nombreCompleto'), miembrosUids: [], fechaCreacion: serverTimestamp(), guiaOrigenId: guide.id });
          steps.forEach((step, index) => tx.set(doc(db, 'proyectos', projectRef.id, 'tareas', 'guia-paso-' + index), { proyectoId: projectRef.id, titulo: ('Paso ' + (index + 1) + ': ' + step).slice(0,100), descripcion: step, responsableUid: '', responsableNombre: '', responsableUids: [], responsablesNombres: [], prioridad: 'Normal', fechaLimite: null, estado: 'Pendiente', fechaCreacion: serverTimestamp() }));
          if (proposal) tx.update(proposal.ref, { estado: 'creada', proyectoId: projectRef.id });
        });
        dialog.body.innerHTML = '<p>Proyecto creado con ' + steps.length + ' tareas. El responsable puede organizar su equipo y asignarlas.</p><button class="primary-button" data-gw-project>Abrir proyecto</button>'; dialog.status('');
        dialog.body.querySelector('button')!.onclick = () => { dialog.element.close(); document.querySelectorAll<HTMLDialogElement>('.gl-reader').forEach(el => el.close()); void options.openProject(projectRef.id); };
      });
    } catch { dialog.body.textContent = 'No se pudieron cargar los responsables. Cierra y vuelve a intentar.'; }
  }
  async function proposals(guides: LibraryGuide[]) {
    const dialog = modal(options.admin ? 'Propuestas de proyectos' : 'Mis propuestas');
    const base = options.admin ? query(collection(db, 'propuestasGuias'), where('estado','==','pendiente')) : query(collection(db, 'propuestasGuias'), where('propietarioUid','==',uid));
    await paginated(dialog, base, item => '<article class="gw-item"><div><strong>' + esc(item.get('tituloGuia')) + '</strong><p>' + esc(item.get('nombre')) + ' · ' + esc(item.get('estado')) + '</p></div>' + (options.admin ? '<button class="primary-button" data-gw-approve="' + esc(item.id) + '">Crear proyecto</button><button class="secondary-button" data-gw-reject="' + esc(item.id) + '">Rechazar</button>' : '') + '</article>', async (button, item) => {
      if (button.hasAttribute('data-gw-approve')) { const guide = guides.find(g => g.id === item.get('guiaId') && !g.archivada); if (!guide) throw new Error('La guía fue archivada o ya no está disponible.'); await projectForm(guide, item); }
      if (button.hasAttribute('data-gw-reject')) { await updateDoc(item.ref, { estado: 'rechazada' }); button.closest('article')?.remove(); }
    });
  }
  async function sendEvidence(guide: LibraryGuide) {
    const dialog = modal('Compartir evidencia con tu docente'); dialog.body.textContent = 'Cargando docentes…';
    try {
      const people = (await directory()).filter(p => p.get('tipoUsuario') === 'docente' || p.get('rol') === 'admin'); if (!dialog.element.isConnected) return;
      if (!people.length) { dialog.body.textContent = 'No hay docentes disponibles en el directorio. Consulta a administración.'; return; }
      dialog.body.innerHTML = '<form class="gw-form"><p>Solo tú, el docente seleccionado y administración podrán consultar esta evidencia.</p><label>Docente<select name="docente" required><option value="">Selecciona un docente</option>' + people.map(p => '<option value="' + esc(p.id) + '">' + esc(p.get('nombreCompleto')) + '</option>').join('') + '</select></label><label>Resultado y aprendizaje<textarea name="resultado" rows="5" maxlength="3000" required placeholder="Qué construiste, qué resultado obtuviste y qué te falta resolver"></textarea></label><label>Foto del circuito (opcional)<input name="foto" type="file" accept="image/jpeg,image/png,image/webp"/></label><small>Se guardará una imagen reducida del montaje. Evita incluir rostros o datos personales.</small><button type="submit" class="primary-button">Enviar evidencia</button></form>';
      const evidenceRef = doc(collection(db, 'evidenciasGuias'));
      formSubmit(dialog, async data => {
        const teacher = people.find(p => p.id === data.get('docente')); if (!teacher) throw new Error('Selecciona un docente.');
        const file = data.get('foto'); const photo = file instanceof File ? await smallPhoto(file) : '';
        await setDoc(evidenceRef, { guiaId: guide.id, tituloGuia: String(guide.titulo).slice(0,100), propietarioUid: uid, nombre: options.name, docenteUid: teacher.id, resultado: String(data.get('resultado')).trim(), foto: photo, comentario: '', estado: 'enviada', fecha: serverTimestamp(), fechaRevision: null });
        dialog.body.innerHTML = '<p>Evidencia enviada. Puedes ver las devoluciones en Mis evidencias.</p>'; dialog.status('');
      });
    } catch { dialog.body.textContent = 'No se pudo consultar el directorio. Cierra y vuelve a intentar.'; }
  }
  async function evidenceInbox(review = false) {
    const dialog = modal(review ? 'Evidencias para revisar' : 'Mis evidencias');
    const base = review && options.admin ? query(collection(db,'evidenciasGuias')) : query(collection(db,'evidenciasGuias'), where(review ? 'docenteUid' : 'propietarioUid','==',uid));
    await paginated(dialog, base, item => '<article class="gw-evidence"><h3>' + esc(item.get('tituloGuia')) + '</h3><p>' + esc(item.get('nombre')) + ' · ' + esc(item.get('estado')) + '</p><p>' + esc(item.get('resultado')) + '</p>' + (String(item.get('foto')).startsWith('data:image/jpeg;base64,') ? '<img src="' + esc(item.get('foto')) + '" alt="Evidencia del circuito" loading="lazy"/>' : '') + (item.get('comentario') ? '<p><strong>Devolución:</strong> ' + esc(item.get('comentario')) + '</p>' : '') + (review ? '<label>Devolución<textarea maxlength="2000" rows="3">' + esc(item.get('comentario') || '') + '</textarea></label><button class="primary-button" data-gw-feedback="' + esc(item.id) + '">Guardar devolución</button>' : '<button class="secondary-button" data-gw-withdraw="' + esc(item.id) + '">Retirar evidencia</button>') + '</article>', async (button, item) => {
      if (button.hasAttribute('data-gw-feedback')) { const comment = button.closest('article')!.querySelector('textarea')!.value.trim(); if (!comment) throw new Error('Escribe una devolución.'); await updateDoc(item.ref, { comentario: comment, estado: 'revisada', fechaRevision: serverTimestamp() }); dialog.status('Devolución guardada.'); }
      if (button.hasAttribute('data-gw-withdraw') && window.confirm('¿Retirar esta evidencia y su foto?')) { await deleteDoc(item.ref); button.closest('article')?.remove(); dialog.status('Evidencia retirada.'); }
    });
  }
  async function paginated(dialog: ReturnType<typeof modal>, base: Query<DocumentData>, markup: (item: QueryDocumentSnapshot) => string, action: (button: HTMLButtonElement, item: QueryDocumentSnapshot) => Promise<void>) {
    dialog.body.innerHTML = '<div data-gw-records></div><button class="secondary-button" data-gw-more>Cargar registros</button>';
    let last: QueryDocumentSnapshot | undefined; const records = new Map<string, QueryDocumentSnapshot>();
    const more = dialog.body.querySelector<HTMLButtonElement>('[data-gw-more]')!;
    const load = async () => { more.disabled = true; try { const snapshot = await getDocs(last ? query(base, startAfter(last), limit(15)) : query(base,limit(15))); snapshot.docs.forEach(item => records.set(item.id,item)); if (!dialog.element.isConnected) return; dialog.body.querySelector('[data-gw-records]')!.insertAdjacentHTML('beforeend', snapshot.docs.map(markup).join('')); last = snapshot.docs.at(-1); more.hidden = snapshot.size < 15; more.textContent = 'Cargar más'; if (!records.size) dialog.status('No hay registros para mostrar.'); } catch { dialog.status('No se pudieron cargar los registros. Reintenta.'); } finally { more.disabled = false; } };
    more.onclick = () => void load(); await load();
    dialog.body.addEventListener('click', async e => { const button = (e.target as Element).closest<HTMLButtonElement>('[data-gw-approve],[data-gw-reject],[data-gw-feedback],[data-gw-withdraw]'); if (!button) return; const id = button.dataset.gwApprove || button.dataset.gwReject || button.dataset.gwFeedback || button.dataset.gwWithdraw; const item = records.get(id!); if (!item) return; button.disabled = true; try { await action(button,item); } catch (error) { dialog.status((error as Error).message || 'No se pudo guardar.'); } finally { button.disabled = false; } });
  }
  return { ...options, progress, editGuide, archiveGuide, mountInventory, proposeProject, proposals, sendEvidence, evidenceInbox, dispose: () => progress.dispose() };
}
export type GuideWorkspace = ReturnType<typeof createGuideWorkspace>;
