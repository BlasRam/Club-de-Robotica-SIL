import { initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  addDoc,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { getFirestore } from "firebase/firestore";
import { deleteObject, getDownloadURL, getStorage, ref, uploadBytes } from "firebase/storage";
import homeIcon from "lucide-static/icons/house.svg?raw";
import projectIcon from "lucide-static/icons/folder-kanban.svg?raw";
import taskIcon from "lucide-static/icons/list-checks.svg?raw";
import accessIcon from "lucide-static/icons/door-open.svg?raw";
import noticeIcon from "lucide-static/icons/megaphone.svg?raw";
import loanIcon from "lucide-static/icons/package-open.svg?raw";
import peopleIcon from "lucide-static/icons/users-round.svg?raw";
import profileIcon from "lucide-static/icons/user-round.svg?raw";
import menuIcon from "lucide-static/icons/menu.svg?raw";
import bellIcon from "lucide-static/icons/bell.svg?raw";
import settingsIcon from "lucide-static/icons/settings.svg?raw";
import logoutIcon from "lucide-static/icons/log-out.svg?raw";
import trashIcon from "lucide-static/icons/trash-2.svg?raw";
import searchIcon from "lucide-static/icons/search.svg?raw";
import plusIcon from "lucide-static/icons/plus.svg?raw";
import refreshIcon from "lucide-static/icons/refresh-cw.svg?raw";
import checkIcon from "lucide-static/icons/check.svg?raw";
import alertIcon from "lucide-static/icons/circle-alert.svg?raw";
import messageIcon from "lucide-static/icons/message-square-text.svg?raw";
import arrowIcon from "lucide-static/icons/arrow-right.svg?raw";
import calendarIcon from "lucide-static/icons/calendar-days.svg?raw";
import bookOpenIcon from "lucide-static/icons/book-open.svg?raw";
import chevronLeftIcon from "lucide-static/icons/chevron-left.svg?raw";
import chevronRightIcon from "lucide-static/icons/chevron-right.svg?raw";
import eyeIcon from "lucide-static/icons/eye.svg?raw";
import eyeOffIcon from "lucide-static/icons/eye-off.svg?raw";
import monitorIcon from "lucide-static/icons/monitor.svg?raw";
import smartphoneIcon from "lucide-static/icons/smartphone.svg?raw";
import lockIcon from "lucide-static/icons/lock-keyhole.svg?raw";
import unlockIcon from "lucide-static/icons/lock-keyhole-open.svg?raw";
import { firebaseConfig } from "./firebase-config";
import { CLUB_NAME, CLUB_SHORT_NAME, INITIAL_ADMIN_EMAIL, INSTITUTIONAL_EMAIL_DOMAIN, isInitialAdminEmail, isInstitutionalEmail } from "./club-config";
import "./styles.css";
import "./access-lock.css";

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const storage = getStorage(firebaseApp);
const root = document.querySelector<HTMLDivElement>("#app")!;
const NOTIFICATION_WORKER_URL = "https://TU-WORKER.workers.dev";
type EntryDeliveryPhase = "waiting" | "released" | "failed";
let entryDelivery: { uid: string; message: string; phase: EntryDeliveryPhase; releaseUntil?: number } | null = null;
let doorReleaseUiTimer: number | null = null;

function reportEntryDelivery(
  uid: string,
  message: string,
  phase: EntryDeliveryPhase = "waiting",
  releaseUntil?: number,
): void {
  if (auth.currentUser?.uid !== uid) return;
  entryDelivery = { uid, message, phase, releaseUntil };
  updateAccessLockButton();
  notify(message, phase === "failed" ? "error" : "ok");
}

function accessLockPhase(uid: string): EntryDeliveryPhase | "idle" {
  const current = entryDelivery?.uid === uid ? entryDelivery : null;
  if (current?.phase === "released" && (!current.releaseUntil || Date.now() >= current.releaseUntil)) {
    entryDelivery = null;
    return "idle";
  }
  return current?.phase ?? "idle";
}

function accessLockButtonMarkup(inside: boolean, action = "toggle-access", disabled = false): string {
  const phase = state.user ? accessLockPhase(state.user.uid) : "idle";
  const iconName = phase === "released" ? "desbloqueo" : "candado";
  const label = phase === "released"
    ? "Puerta liberada temporalmente"
    : phase === "waiting"
      ? "Solicitando apertura"
      : phase === "failed"
        ? "No se pudo confirmar la acción"
        : "Solicitar acceso y registrar entrada";
  return `<button class="access-lock-button state-${phase}" id="access-lock-button" type="button" data-action="${action}" data-inside="${inside}" aria-label="${label}" title="${label}" aria-live="polite" ${disabled ? "disabled" : ""}>${icon(iconName, 38)}</button>`;
}

function updateAccessLockButton(): void {
  const button = document.querySelector<HTMLButtonElement>("#access-lock-button");
  const uid = state.user?.uid;
  if (!button || !uid) {
    if (doorReleaseUiTimer !== null) window.clearInterval(doorReleaseUiTimer);
    doorReleaseUiTimer = null;
    return;
  }

  const inside = button.dataset.inside === "true";
  const action = button.dataset.action || "toggle-access";
  const phase = accessLockPhase(uid);
  const iconName = phase === "released" ? "desbloqueo" : "candado";
  const label = phase === "released"
    ? "Puerta liberada temporalmente"
    : phase === "waiting"
      ? "Solicitando apertura"
      : phase === "failed"
        ? "No se pudo confirmar la acción"
        : "Solicitar acceso y registrar entrada";
  button.className = `access-lock-button state-${phase}`;
  button.dataset.action = action;
  button.setAttribute("aria-label", label);
  button.title = label;
  button.innerHTML = icon(iconName, 38);

  const current = entryDelivery?.uid === uid ? entryDelivery : null;
  if (current?.phase !== "released") {
    if (doorReleaseUiTimer !== null) window.clearInterval(doorReleaseUiTimer);
    doorReleaseUiTimer = null;
    return;
  }

  const updateCountdown = () => {
    const active = entryDelivery?.uid === uid && entryDelivery.phase === "released" ? entryDelivery : null;
    if (!active?.releaseUntil || Date.now() >= active.releaseUntil) {
      entryDelivery = null;
      if (doorReleaseUiTimer !== null) window.clearInterval(doorReleaseUiTimer);
      doorReleaseUiTimer = null;
      updateAccessLockButton();
      return;
    }
  };
  updateCountdown();
  if (doorReleaseUiTimer === null) doorReleaseUiTimer = window.setInterval(updateCountdown, 200);
}

type Profile = {
  tipoUsuario?: "alumno" | "docente";
  uid: string;
  nombre?: string;
  apellido?: string;
  nombreCompleto?: string;
  correoInstitucional?: string;
  rol?: string;
  autorizado?: boolean;
  carrera?: string;
  semestre?: string;
};

type Page = "inicio" | "proyectos" | "cursos" | "tareas" | "acceso" | "avisos" | "sugerencias" | "prestamos" | "inventario" | "estudiantes" | "perfil" | "configuracion" | "calendario";
type PreviewLoan = { item: string; quantity: number; purpose: string; start: string; due: string; status: string; requestStatus?: string; requestType?: string; proposedDue?: string };
type StudentSandbox = { inside: boolean; entryAt: Date | null; taskDone: boolean; joinRequested: boolean; reactions: Record<string, string>; courseEnrollments: string[]; loans: PreviewLoan[] };
type AppState = {
  user: User | null;
  profile: Profile | null;
  page: Page;
  authMode: "login" | "register";
  authMessage: string;
  loading: boolean;
  desktopPreview: boolean;
  studentPreview: boolean;
  menuOpen: boolean;
  sidebarCollapsed: boolean;
  theme: "system" | "light" | "dark";
  reduceMotion: boolean;
  calendarMonth: Date;
  calendarSelectedDate: string;
  studentSandbox: StudentSandbox;
  installPrompt?: BeforeInstallPromptEvent;
  clubLogoUrl: string;
  clubLogoPath: string;
};

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

const state: AppState = {
  user: null,
  profile: null,
  page: "inicio",
  authMode: "login",
  authMessage: "",
  loading: true,
  desktopPreview: localStorage.getItem("cdr-admin-desktop-preview") === "true",
  studentPreview: false,
  menuOpen: false,
  sidebarCollapsed: false,
  theme: ["system", "light", "dark"].includes(localStorage.getItem("cdr-theme") || "")
    ? localStorage.getItem("cdr-theme") as "system" | "light" | "dark"
    : "system",
  reduceMotion: localStorage.getItem("cdr-reduce-motion") === "true",
  calendarMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  calendarSelectedDate: calendarDateKey(new Date()),
  studentSandbox: createStudentSandbox(),
  clubLogoUrl: "/icons/sil-school-logo.png",
  clubLogoPath: "",
};

async function loadClubBranding(): Promise<void> {
  try {
    const snapshot = await getDoc(doc(db, "clubSettings", "branding"));
    const branding = snapshot.data();
    if (typeof branding?.logoUrl === "string" && branding.logoUrl) {
      state.clubLogoUrl = branding.logoUrl;
      state.clubLogoPath = typeof branding.logoPath === "string" ? branding.logoPath : "";
      syncClubLogoLinks();
      render();
    }
  } catch {
    // La imagen local del colegio sigue disponible si no hay configuración remota.
  }
}

function syncClubLogoLinks(): void {
  document.querySelectorAll<HTMLLinkElement>('link[rel="icon"], link[rel="apple-touch-icon"]').forEach((link) => {
    link.href = state.clubLogoUrl;
  });
}

void loadClubBranding();

async function handleClubLogoUpload(file?: File): Promise<void> {
  if (!file || !state.user || !isAdmin()) return;
  if (!file.type.match(/^image\/(png|jpeg|webp)$/) || file.size > 5 * 1024 * 1024) {
    notify("Elige un PNG, JPG o WebP de hasta 5 MB.", "error");
    return;
  }
  let uploadedPath = "";
  try {
    const image = await createImageBitmap(file);
    const scale = Math.min(1, 512 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("No se pudo preparar la imagen.");
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    image.close();
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("No se pudo convertir la imagen.")), "image/webp", 0.9));
    uploadedPath = `club-assets/branding/logo-${Date.now()}.webp`;
    const logoRef = ref(storage, uploadedPath);
    await uploadBytes(logoRef, blob, { contentType: "image/webp", cacheControl: "public,max-age=31536000" });
    const logoUrl = await getDownloadURL(logoRef);
    await setDoc(doc(db, "clubSettings", "branding"), { logoUrl, logoPath: uploadedPath, updatedAt: serverTimestamp() }, { merge: true });
    const oldPath = state.clubLogoPath;
    state.clubLogoUrl = logoUrl;
    state.clubLogoPath = uploadedPath;
    syncClubLogoLinks();
    uploadedPath = "";
    render();
    notify("Logo del club actualizado.");
    if (oldPath && oldPath !== state.clubLogoPath) void deleteObject(ref(storage, oldPath)).catch(() => {});
  } catch (error) {
    if (uploadedPath) void deleteObject(ref(storage, uploadedPath)).catch(() => {});
    notify(errorMessage(error, "No se pudo cambiar el logo."), "error");
  }
}

async function resetClubLogo(): Promise<void> {
  if (!state.user || !isAdmin()) return;
  const oldPath = state.clubLogoPath;
  try {
    await deleteDoc(doc(db, "clubSettings", "branding"));
    state.clubLogoUrl = "/icons/sil-school-logo.png";
    state.clubLogoPath = "";
    syncClubLogoLinks();
    render();
    notify("Se restableció el escudo del colegio.");
    if (oldPath) void deleteObject(ref(storage, oldPath)).catch(() => {});
  } catch (error) {
    notify(errorMessage(error, "No se pudo restablecer el escudo."), "error");
  }
}

function applyAppearance(): void {
  const dark = state.theme === "dark"
    || (state.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.motion = state.reduceMotion ? "reduced" : "full";
}

applyAppearance();
const colorScheme = window.matchMedia("(prefers-color-scheme: dark)");
colorScheme.addEventListener?.("change", () => {
  if (state.theme === "system") applyAppearance();
});

let pageTrail: Page[] = [state.page];
let exitArmed = false;
let exitInProgress = false;
let exitTimer = 0;

history.replaceState({ cdrBase: true, cdrPage: state.page }, "", location.href);
history.pushState({ cdrBackGuard: true }, "", location.href);

function navigatePage(page: Page): void {
  if (state.page !== page) {
    pageTrail.push(page);
    history.pushState({ cdrPage: page }, "", location.href);
  }
  exitArmed = false;
  window.clearTimeout(exitTimer);
  state.page = page;
  state.menuOpen = false;
  render();
}

function confirmAppExit(): void {
  if (exitArmed) {
    exitArmed = false;
    exitInProgress = true;
    window.clearTimeout(exitTimer);
    history.back();
    return;
  }
  exitArmed = true;
  notify("Pulsa atrás otra vez para salir.");
  exitTimer = window.setTimeout(() => { exitArmed = false; }, 2000);
  history.pushState({ cdrBackGuard: true }, "", location.href);
}

window.addEventListener("popstate", (event) => {
  if (exitInProgress) return;
  if (state.menuOpen) {
    state.menuOpen = false;
    render();
    history.pushState(event.state ?? { cdrBackGuard: true }, "", location.href);
    return;
  }
  if (pageTrail.length === 1) {
    confirmAppExit();
    return;
  }

  const targetPage = event.state?.cdrPage as Page | undefined;
  const targetIndex = targetPage ? pageTrail.lastIndexOf(targetPage) : -1;
  if (targetIndex >= 0) {
    pageTrail = pageTrail.slice(0, targetIndex + 1);
    state.page = targetPage!;
    exitArmed = false;
    window.clearTimeout(exitTimer);
    render();
    return;
  }

  if (pageTrail.length > 1) {
    pageTrail.pop();
    state.page = pageTrail[pageTrail.length - 1];
    exitArmed = false;
    window.clearTimeout(exitTimer);
    render();
    history.pushState({ cdrBackGuard: true }, "", location.href);
    return;
  }

  confirmAppExit();
});

const icons: Record<string, string> = {
  inicio: homeIcon,
  proyectos: projectIcon,
  tareas: taskIcon,
  acceso: accessIcon,
  avisos: noticeIcon,
  sugerencias: messageIcon,
  prestamos: loanIcon,
  cursos: bookOpenIcon,
  estudiantes: peopleIcon,
  perfil: profileIcon,
  menu: menuIcon,
  campana: bellIcon,
  configuracion: settingsIcon,
  people: peopleIcon,
  inventario: loanIcon,
  salir: logoutIcon,
  eliminar: trashIcon,
  buscar: searchIcon,
  sumar: plusIcon,
  actualizar: refreshIcon,
  listo: checkIcon,
  alerta: alertIcon,
  ir: arrowIcon,
  fecha: calendarIcon,
  calendario: calendarIcon,
  anterior: chevronLeftIcon,
  siguiente: chevronRightIcon,
  ver: eyeIcon,
  ocultar: eyeOffIcon,
  vistaEscritorio: monitorIcon,
  vistaMovil: smartphoneIcon,
  candado: lockIcon,
  desbloqueo: unlockIcon,
};

function icon(name: string, size = 18): string {
  return (icons[name] ?? alertIcon)
    .replace(/\s(?:width|height)="[^"]*"/g, "")
    .replace(/<svg\b/, `<svg width="${size}" height="${size}" aria-hidden="true"`);
}

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

function fullName(profile = state.profile): string {
  return profile?.nombreCompleto?.trim() || [profile?.nombre, profile?.apellido].filter(Boolean).join(" ") || profile?.correoInstitucional || "Usuario Robótica SIL";
}

function isAdmin(): boolean {
  return state.profile?.rol === "admin";
}

function isModerator(): boolean {
  return state.profile?.rol === "moderador";
}

function isStudentPreview(): boolean {
  return isAdmin() && state.studentPreview;
}

function isAdminInterface(): boolean {
  return isAdmin() && !isStudentPreview();
}

function canManageClub(): boolean {
  return (isAdmin() || (isModerator() && state.profile?.autorizado === true)) && !isStudentPreview();
}

function roleLabel(): string {
  return isStudentPreview() ? "Vista estudiante" : isAdmin() ? "Administrador" : isModerator() ? "Moderador" : state.profile?.tipoUsuario === "docente" ? "Docente" : "Alumno";
}

function createStudentSandbox(): StudentSandbox {
  return {
    inside: false,
    entryAt: null,
    taskDone: false,
    joinRequested: false,
    reactions: {},
    courseEnrollments: ["curso-arduino"],
    loans: [{
      item: "Kit de Arduino",
      quantity: 1,
      purpose: "Práctica de sensores",
      start: "2026-10-12",
      due: "2026-10-19",
      status: "Aprobada",
    }],
  };
}

function isAuthorized(): boolean {
  return isAdmin() || state.profile?.autorizado === true;
}

function dateText(value: unknown, withTime = false): string {
  const date = value instanceof Timestamp ? value.toDate() : value instanceof Date ? value : null;
  if (!date) return "Sin fecha";
  return new Intl.DateTimeFormat("es-PY", withTime
    ? { dateStyle: "medium", timeStyle: "short" }
    : { dateStyle: "medium" }).format(date);
}

const CLUB_TIME_ZONE = "America/Asuncion";
const CLUB_DAILY_CUTOFF_HOUR = 22;

function clubClockParts(date: Date): { dateKey: string; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CLUB_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    dateKey: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
  };
}

function presenceIsCurrent(presence: DocumentData, now = new Date()): boolean {
  if (presence.dentro !== true) return false;
  const updatedAt = presence.ultimaActualizacion;
  const updatedDate = updatedAt instanceof Timestamp
    ? updatedAt.toDate()
    : updatedAt instanceof Date ? updatedAt : null;
  if (!updatedDate) return false;
  const current = clubClockParts(now);
  const entry = clubClockParts(updatedDate);
  return current.hour < CLUB_DAILY_CUTOFF_HOUR
    && entry.hour < CLUB_DAILY_CUTOFF_HOUR
    && entry.dateKey === current.dateKey;
}

function notify(message: string, kind: "ok" | "error" = "ok"): void {
  const toast = document.querySelector<HTMLDivElement>("#toast");
  if (!toast) return;
  toast.textContent = message;
  toast.dataset.kind = kind;
  toast.classList.add("visible");
  window.setTimeout(() => toast.classList.remove("visible"), 3400);
}

function setBusy(button: HTMLButtonElement, busy: boolean, label?: string): void {
  if (!button.dataset.label) button.dataset.label = button.innerHTML;
  button.disabled = busy;
  button.innerHTML = busy ? `<span class="spinner"></span>${label ?? "Procesando"}` : button.dataset.label;
}

function setProfile(uid: string, data: DocumentData): void {
  state.profile = { uid, ...data } as Profile;
  state.loading = false;
  state.page = "inicio";
  pageTrail = ["inicio"];
  exitArmed = false;
  exitInProgress = false;
  window.clearTimeout(exitTimer);
  state.authMessage = "";
  render();
}

async function loadProfile(user: User): Promise<void> {
  state.loading = true;
  render();
  try {
    const snapshot = await getDoc(doc(db, "usuarios", user.uid));
    if (!snapshot.exists()) {
      state.profile = null;
      state.authMode = "register";
      state.authMessage = "Tu acceso existe, pero el perfil fue eliminado. Completa tus datos para volver a crearlo.";
      state.loading = false;
      render();
      return;
    }
    setProfile(user.uid, snapshot.data());
  } catch (error) {
    state.loading = false;
    state.authMessage = errorMessage(error, "No se pudo cargar tu perfil.");
    render();
  }
}

function errorMessage(error: unknown, fallback: string): string {
  const code = (error as { code?: string })?.code;
  if (code === "failed-precondition") return "Los datos todavía no están disponibles. Intenta nuevamente en unos minutos.";
  if (code === "permission-denied") return "Tu cuenta aún no tiene permiso para consultar esta información.";
  if (code === "unavailable" || code === "network-request-failed") return "No hay conexión. Comprueba tu Internet e inténtalo otra vez.";
  return (error as { message?: string })?.message || fallback;
}

let authSubmissionInProgress = false;

onAuthStateChanged(auth, (user) => {
  state.user = user;
  if (authSubmissionInProgress) return;
  if (user && state.authMode !== "register" &&
      (!isInstitutionalEmail(user.email || "") || !user.emailVerified)) {
    state.user = null;
    state.profile = null;
    state.loading = false;
    state.authMessage = isInstitutionalEmail(user.email || "")
      ? "Verifica tu correo institucional. Te enviamos un enlace para habilitar el acceso."
      : INSTITUTIONAL_EMAIL_DOMAIN
        ? `Solo se permite el acceso con correo institucional @${INSTITUTIONAL_EMAIL_DOMAIN}.`
        : "El registro está pendiente de que el club configure su dominio de correo institucional.";
    if (isInstitutionalEmail(user.email || "")) void sendEmailVerification(user).catch(() => {});
    void signOut(auth);
    render();
  } else if (user) void loadProfile(user);
  else {
    state.profile = null;
    state.loading = false;
    render();
  }
});

window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  state.installPrompt = event as BeforeInstallPromptEvent;
  render();
});

if ("serviceWorker" in navigator && window.isSecureContext) {
  let controllerReady = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!controllerReady) {
      controllerReady = true;
      return;
    }
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    window.location.reload();
  });

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/service-worker.js", { updateViaCache: "none" }).then((registration) => {
      const checkForUpdate = () => registration.update().catch(() => undefined);
      void checkForUpdate();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void checkForUpdate();
      });
      window.setInterval(() => {
        if (document.visibilityState === "visible") void checkForUpdate();
      }, 30 * 60 * 1000);
    }).catch(() => undefined);
  });
}

function navItems(): { id: Page; label: string }[] {
  const items: { id: Page; label: string }[] = [
    { id: "inicio", label: "Inicio" },
    { id: "tareas", label: "Tareas" },
    { id: "acceso", label: "Acceso" },
    { id: "proyectos", label: "Proyectos" },
    { id: "cursos", label: "Cursos" },
    { id: "avisos", label: "Avisos" },
    { id: "sugerencias", label: "Sugerencias y reportes" },
    { id: "prestamos", label: "Préstamos" },
    { id: "calendario", label: "Calendario" },
  ];
  if (isAdminInterface()) items.push({ id: "inventario", label: "Inventario" }, { id: "estudiantes", label: "Estudiantes" });
  items.push({ id: "configuracion", label: "Configuración" });
  return items;
}

function isStandaloneDisplay(): boolean {
  return window.matchMedia("(display-mode: standalone)").matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function mobileInstallButton(className: string): string {
  if (isStandaloneDisplay() || !window.matchMedia("(max-width: 680px)").matches) return "";
  return `<button type="button" class="${className}" data-action="install" aria-label="Instalar ${CLUB_SHORT_NAME}" title="Instalar ${CLUB_SHORT_NAME}">${icon("sumar", 16)}<span>Instalar</span></button>`;
}

function appShell(content: string): string {
  const items = navItems();
  return `
    <div class="app-shell ${isAdmin() && state.desktopPreview ? "desktop-preview" : ""} ${isStudentPreview() ? "student-preview" : ""} ${!canManageClub() ? "student-interface" : "admin-interface"} ${state.sidebarCollapsed ? "sidebar-collapsed" : ""} ${state.menuOpen ? "menu-open" : ""}">
      <button class="drawer-backdrop" data-action="close-menu" aria-label="Cerrar menú"></button>
      <aside class="sidebar">
        <div class="sidebar-brand-row">
          <button class="icon-button sidebar-menu-toggle" data-action="toggle-menu" aria-label="Mostrar u ocultar menú" title="Menú" aria-expanded="${!state.sidebarCollapsed}">${icon("menu")}</button>
          <a class="brand" href="#inicio" data-page="inicio" aria-label="${CLUB_NAME}, inicio">
            <img src="${esc(state.clubLogoUrl)}" alt="Escudo del Colegio San Ignacio de Loyola" /><span><strong>${CLUB_SHORT_NAME}</strong><small>San Ignacio de Loyola</small></span>
          </a>
        </div>
        <div class="nav-caption">ESPACIO DE TRABAJO</div>
        <nav class="side-nav" aria-label="Navegación principal">
          ${items.map((item) => `<button class="nav-item ${state.page === item.id ? "active" : ""}" data-page="${item.id}">${icon(item.id, 18)}<span>${item.label}</span></button>`).join("")}
        </nav>
        <div class="sidebar-bottom">
          ${state.installPrompt ? `<button class="install-button" data-action="install">${icon("sumar")}Instalar aplicación</button>` : ""}
          <div class="account-chip"><button class="account-profile" data-page="perfil" title="Abrir perfil"><span class="avatar">${esc(fullName().slice(0, 1).toUpperCase())}</span><span class="account-copy"><strong>${esc(fullName())}</strong><small>${roleLabel()}</small></span></button><button class="icon-button" data-action="logout" title="Cerrar sesión" aria-label="Cerrar sesión">${icon("salir")}</button></div>
        </div>
      </aside>
      <div class="main-column">
        ${isStudentPreview() ? `<div class="student-preview-banner"><strong>Estudiante de prueba</strong><span>Las acciones usan datos ficticios y no modifican Firebase.</span><button class="preview-reset" data-action="reset-student-preview">Reiniciar prueba</button></div>` : ""}
        <header class="topbar">
          <button class="icon-button student-menu-button" data-action="toggle-menu" aria-label="Abrir menú" title="Menú" aria-expanded="${state.menuOpen}">${icon("menu")}</button>
          <div class="crumb"><span>${CLUB_SHORT_NAME}</span><span class="crumb-sep">/</span><strong>${esc(state.page === "perfil" ? "Perfil" : items.find((item) => item.id === state.page)?.label ?? "Inicio")}</strong></div>
          <div class="topbar-right"><span class="connection"><i></i>Conectado</span><span class="role-tag">${isStudentPreview() ? "VISTA ESTUDIANTE" : isAdmin() ? "ADMIN" : isModerator() ? "MODERADOR" : "ESTUDIANTE"}</span>${isAdmin() ? `<button class="secondary-button student-preview-toggle" data-action="toggle-student-preview" aria-label="${isStudentPreview() ? "Volver a la interfaz de administrador" : "Previsualizar interfaz de estudiante"}" title="${isStudentPreview() ? "Volver a la interfaz de administrador" : "Previsualizar interfaz de estudiante"}">${icon("estudiantes", 16)}<span>${isStudentPreview() ? "Volver a admin" : "Ver como estudiante"}</span></button><button class="secondary-button admin-layout-toggle" data-action="toggle-admin-layout" aria-pressed="${state.desktopPreview}" title="Cambiar vista de administración">${icon(state.desktopPreview ? "vistaMovil" : "vistaEscritorio", 16)}<span>${state.desktopPreview ? "Vista móvil" : "Vista escritorio"}</span></button>` : ""}${mobileInstallButton("secondary-button mobile-install")}<button class="icon-button student-bell-button ${state.page === "avisos" ? "active" : ""}" data-page="avisos" title="Notificaciones" aria-label="Abrir notificaciones">${icon("campana")}</button><button class="icon-button profile-shortcut" data-page="perfil" title="Mi perfil" aria-label="Abrir mi perfil">${icon("perfil")}</button><button class="icon-button mobile-logout" data-action="logout" title="Cerrar sesión" aria-label="Cerrar sesión">${icon("salir")}</button></div>
        </header>
        <main id="page-content" class="page-content">${content}</main>
      </div>
      <nav class="mobile-nav" aria-label="Navegación móvil">
        ${items.filter((item) => ["inicio", "tareas", "acceso", "proyectos", "avisos"].includes(item.id)).map((item) => `<button class="mobile-nav-item ${state.page === item.id ? "active" : ""}" data-page="${item.id}">${icon(item.id, 19)}<span>${item.label}</span></button>`).join("")}
      </nav>
      <div id="toast" class="toast" role="status"></div>
    </div>`;
}

function render(): void {
  if (state.loading) {
    root.innerHTML = `<div class="loading-screen"><img src="${esc(state.clubLogoUrl)}" alt="Escudo del Colegio San Ignacio de Loyola"/><span class="spinner"></span></div>`;
    return;
  }
  if (!state.user || !state.profile) {
    root.innerHTML = renderAuth();
    restorePendingRegistration();
    return;
  }
  root.innerHTML = appShell(`<div class="loading-block"><span class="spinner"></span><span>Cargando ${esc(navItems().find((item) => item.id === state.page)?.label.toLowerCase() ?? "inicio")}…</span></div>`);
  void loadPage();
}

let presenceCutoffRefreshDate = "";
window.setInterval(() => {
  const clock = clubClockParts(new Date());
  if (clock.hour < CLUB_DAILY_CUTOFF_HOUR || clock.dateKey === presenceCutoffRefreshDate) return;
  presenceCutoffRefreshDate = clock.dateKey;
  if (state.user && (state.page === "inicio" || state.page === "acceso")) render();
}, 30_000);

function renderMemberFields(profile?: Profile): string {
  const docente = profile?.tipoUsuario === "docente";
  return `<label>Tipo de usuario<select name="tipoUsuario" data-member-type><option value="alumno" ${!docente ? "selected" : ""}>Alumno</option><option value="docente" ${docente ? "selected" : ""}>Docente</option></select></label>
    <label><span data-member-area-label>${docente ? "Asignatura o área de enseñanza" : "Área de interés"}</span><input name="carrera" value="${esc(profile?.carrera || "")}" maxlength="100" required placeholder="${docente ? "Ej. informática, ciencias, tecnología" : "Ej. electrónica, programación, diseño"}" /></label>
    <label data-member-grade ${docente ? "hidden" : ""}>Curso o grado<input name="semestre" value="${esc(profile?.semestre || "")}" maxlength="40" ${docente ? "disabled" : "required"} placeholder="Ej. 2.º curso" /></label>`;
}

document.addEventListener("change", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLSelectElement) || !target.matches("[data-member-type]")) return;
  const form = target.closest("form")!;
  const docente = target.value === "docente";
  form.querySelector<HTMLElement>("[data-member-area-label]")!.textContent = docente ? "Asignatura o área de enseñanza" : "Área de interés";
  form.querySelector<HTMLInputElement>('[name="carrera"]')!.placeholder = docente ? "Ej. informática, ciencias, tecnología" : "Ej. electrónica, programación, diseño";
  form.querySelector<HTMLElement>("[data-member-grade]")!.hidden = docente;
  const grade = form.querySelector<HTMLInputElement>('[name="semestre"]')!;
  grade.disabled = docente;
  grade.required = !docente;
});

const pendingRegistrationKey = "cdr-pending-registration";

function restorePendingRegistration(): void {
  const form = document.querySelector<HTMLFormElement>('[data-form="auth"]');
  if (!form || state.authMode !== "register") return;
  try {
    const values = JSON.parse(sessionStorage.getItem(pendingRegistrationKey) || "{}") as Record<string, string>;
    for (const name of ["nombre", "apellido", "email", "carrera", "semestre", "tipoUsuario"]) {
      const field = form.elements.namedItem(name);
      if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) {
        if (values[name]) field.value = values[name];
      }
    }
    const type = form.querySelector<HTMLSelectElement>("[data-member-type]");
    if (type && values.tipoUsuario === "docente") type.dispatchEvent(new Event("change", { bubbles: true }));
  } catch { sessionStorage.removeItem(pendingRegistrationKey); }
}

document.addEventListener("input", (event) => {
  const form = (event.target as HTMLElement).closest<HTMLFormElement>('[data-form="auth"]');
  if (!form || state.authMode !== "register") return;
  const data = new FormData(form);
  const values: Record<string, string> = {};
  for (const name of ["nombre", "apellido", "email", "carrera", "semestre", "tipoUsuario"]) {
    values[name] = String(data.get(name) || "");
  }
  sessionStorage.setItem(pendingRegistrationKey, JSON.stringify(values));
});

function renderAuth(): string {
  const register = state.authMode === "register";
  const reactivating = Boolean(state.user && !state.profile);
  return `
    <main class="auth-page">
      <section class="auth-brand-panel">
        <div class="auth-brand"><img src="${esc(state.clubLogoUrl)}" alt="Escudo del Colegio San Ignacio de Loyola"/><span>${CLUB_SHORT_NAME}</span></div>
        <div class="auth-brand-content"><p class="eyebrow">SAN IGNACIO DE LOYOLA</p><h1>Ideas que se convierten en proyectos.</h1><p>Gestiona tareas, proyectos, accesos y préstamos desde un solo lugar.</p></div>
        <div class="auth-panel-foot">Plataforma de trabajo del Club de Robótica</div>
      </section>
      <section class="auth-form-panel">
        <form class="auth-form" data-form="auth">
          <div class="auth-mobile-brand"><img src="${esc(state.clubLogoUrl)}" alt="Escudo del Colegio San Ignacio de Loyola"/><strong>${CLUB_SHORT_NAME}</strong></div>
          <div class="auth-install-area">${mobileInstallButton("secondary-button auth-install-button")}</div>
          <p class="eyebrow">ACCESO A LA PLATAFORMA</p>
          <h2>${reactivating ? "Crear perfil de nuevo" : register ? "Crear cuenta" : "Iniciar sesión"}</h2>
          <p class="auth-subtitle">${reactivating ? "Tu correo ya está verificado. Completa tus datos para restaurar el perfil." : register ? (INSTITUTIONAL_EMAIL_DOMAIN ? `Usa tu correo @${esc(INSTITUTIONAL_EMAIL_DOMAIN)} y verifícalo para solicitar acceso.` : `Por ahora, las cuentas administradoras ${INITIAL_ADMIN_EMAIL} pueden crear su perfil.`) : "Ingresa con tu correo institucional verificado."}</p>
          ${state.authMessage ? `<div class="notice-box ${state.authMessage.includes("error") ? "danger" : "info"}">${icon("alerta", 18)}<span>${esc(state.authMessage)}</span></div>` : ""}
          ${register ? `<div class="field-row"><label>Nombre<input name="nombre" autocomplete="given-name" required maxlength="60" /></label><label>Apellido<input name="apellido" autocomplete="family-name" required maxlength="60" /></label></div>
            <label>Correo institucional<input name="email" type="email" autocomplete="email" required ${state.user ? `value="${esc(state.user.email)}" readonly` : ""} /></label>
            ${state.user ? "" : `<div class="field-row"><label>Contraseña<div class="password-wrap"><input name="password" type="password" autocomplete="new-password" minlength="6" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-label="Mostrar contraseña" title="Mostrar contraseña">${icon("ver", 18)}</button></div></label><label>Repite la contraseña<div class="password-wrap"><input name="confirmPassword" type="password" autocomplete="new-password" minlength="6" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-label="Mostrar contraseña" title="Mostrar contraseña">${icon("ver", 18)}</button></div></label></div>`}
            ${renderMemberFields()}`
            : `<label>Correo electrónico<input name="email" type="email" autocomplete="email" required /></label><label>Contraseña<div class="password-wrap"><input name="password" type="password" autocomplete="current-password" required /><button type="button" class="password-toggle" data-action="toggle-password" aria-label="Mostrar contraseña" title="Mostrar contraseña">${icon("ver", 18)}</button></div></label>`}
          <button class="primary-button auth-submit" type="submit">${register ? "Crear cuenta" : "Entrar"}${icon("ir", 17)}</button>
          ${!register && !state.user ? `<button type="button" class="text-button auth-forgot" data-action="forgot-password">Olvidé mi contraseña</button>` : ""}
          <p class="auth-switch">${register ? "¿Ya tienes cuenta?" : "¿Primera vez aquí?"} <button type="button" class="text-button" data-action="auth-toggle">${register ? "Inicia sesión" : "Crea una cuenta"}</button></p>
          <p class="auth-legal">El acceso a proyectos y recursos se habilita después de la autorización del administrador.</p>
        </form>
      </section>
    </main><div id="toast" class="toast" role="status"></div>`;
}

async function loadPage(): Promise<void> {
  if (!state.user || !state.profile) return;
  try {
    const content = await pageContent(state.page);
    const page = document.querySelector<HTMLDivElement>("#page-content");
    if (page) page.innerHTML = content;
    if (page && state.page === "acceso") updateAccessLockButton();
    if (page && isStudentPreview() && state.page === "prestamos") {
      page.querySelectorAll<HTMLElement>(".loan-card .loan-copy").forEach((copy, index) => {
        const loan = state.studentSandbox.loans[index];
        if (loan?.status === "Aprobada") copy.insertAdjacentHTML("beforeend", `<div class="card-actions"><button class="secondary-button compact" data-action="preview-loan-detail" data-index="${index}">Ver detalles y acciones</button></div>`);
      });
    }
  } catch (error) {
    const page = document.querySelector<HTMLDivElement>("#page-content");
    if (page) page.innerHTML = `<section class="empty-state error-state">${icon("alerta", 22)}<h2>No se pudo cargar esta sección</h2><p>${esc(errorMessage(error, "Intenta nuevamente."))}</p><button class="secondary-button" data-action="refresh">${icon("actualizar")} Reintentar</button></section>`;
  }
}

async function pageContent(page: Page): Promise<string> {
  if (isStudentPreview()) {
    if (page === "perfil") return renderSandboxProfile();
    if (page === "configuracion") return renderSettings();
    if (page === "calendario") return renderCalendar();
    if (page === "sugerencias") return `${pageHeading("Sugerencias y reportes", "Envía una sugerencia o reporta un error de la app.")}<div class="notice-box info">La vista de prueba no envía información real.</div>`;
    if (page === "inicio") {
      const sandboxHome = renderStudentSandbox(page);
      const noticeHeading = '<section class="unframed-section"><div class="section-heading"><h2>Avisos recientes</h2>';
      return sandboxHome.replace(noticeHeading, `${renderSandboxShortcuts()}${renderSandboxCalendar()}${noticeHeading}`);
    }
    return renderStudentSandbox(page);
  }
  switch (page) {
    case "inicio": return renderHome();
    case "proyectos": return renderProjects();
    case "cursos": return renderCourses();
    case "tareas": return renderTasks();
    case "acceso": return renderAccess();
    case "avisos": return renderNotices();
    case "sugerencias": return renderFeedback();
    case "calendario": return renderCalendar();
    case "prestamos": return renderLoans();
    case "inventario": return isAdminInterface() ? renderInventory() : "";
    case "estudiantes": return isAdminInterface() ? renderStudents() : "";
    case "perfil": return renderProfile();
    case "configuracion": return renderSettings();
  }
}

function renderSettings(): string {
  const profile = state.profile!;
  return `${pageHeading("Configuración", "Preferencias de tu cuenta y del club.")}
    <div class="settings-grid">
      <section class="settings-section"><div class="settings-section-heading"><span class="settings-icon">${icon("configuracion", 18)}</span><div><h2>Apariencia</h2><p>Personaliza cómo se muestra Robótica SIL en este dispositivo.</p></div></div>
        <label class="settings-field" for="setting-theme"><span>Tema</span><select id="setting-theme" data-setting="theme"><option value="system" ${state.theme === "system" ? "selected" : ""}>Seguir el dispositivo</option><option value="light" ${state.theme === "light" ? "selected" : ""}>Claro</option><option value="dark" ${state.theme === "dark" ? "selected" : ""}>Oscuro</option></select></label>
        <label class="settings-toggle"><span><strong>Reducir movimiento</strong><small>Limita animaciones y transiciones.</small></span><input type="checkbox" data-setting="reduce-motion" ${state.reduceMotion ? "checked" : ""} /></label>
      </section>
      <section class="settings-section"><div class="settings-section-heading"><span class="settings-icon">${icon("perfil", 18)}</span><div><h2>Cuenta</h2><p>${esc(profile.correoInstitucional || state.user?.email || "")}</p></div></div>
        <div class="settings-account-meta"><span>Tipo de cuenta</span><strong>${roleLabel()}</strong><span>Estado de acceso</span><strong>${isAdmin() ? "Administrador" : profile.autorizado ? "Autorizado" : "Pendiente de autorización"}</strong></div>
        <button class="secondary-button" data-page="perfil">${icon("perfil", 16)} Mi perfil</button>
      </section>
      <section class="settings-section"><div class="settings-section-heading"><span class="settings-icon">${icon("campana", 18)}</span><div><h2>Notificaciones</h2><p>Consulta los avisos y notificaciones recibidos dentro de la app.</p></div></div>
        <button class="secondary-button" data-page="avisos">${icon("campana", 16)} Abrir bandeja</button>
      </section>
      ${isAdmin() && !isStudentPreview() ? `<section class="settings-section"><div class="settings-section-heading"><span class="settings-icon">${icon("perfil", 18)}</span><div><h2>Identidad del club</h2><p>El escudo actual es el del colegio. Puedes reemplazarlo por el logo del club cuando esté listo.</p></div></div><div class="club-logo-preview"><img src="${esc(state.clubLogoUrl)}" alt="Logo actual del colegio"/><span>Logo que verán las personas en la PWA</span></div><label class="logo-upload-label">Cambiar logo<input id="club-logo-input" type="file" accept="image/png,image/jpeg,image/webp" /></label>${state.clubLogoPath ? `<button class="secondary-button" data-action="reset-club-logo">Restablecer escudo del colegio</button>` : ""}</section>` : ""}
      <section class="settings-section settings-session"><div class="settings-section-heading"><span class="settings-icon">${icon("salir", 18)}</span><div><h2>Sesión</h2><p>Cierra tu sesión en este dispositivo.</p></div></div>
        <button class="danger-button" data-action="logout">${icon("salir", 16)} Cerrar sesión</button>
      </section>
      <div class="settings-about">${CLUB_SHORT_NAME} · Preferencias guardadas en este dispositivo.</div>
    </div>`;
}

function renderProfile(): string {
  const profile = state.profile!;
  return `${pageHeading("Mi perfil", "Actualiza tus datos personales y académicos.")}
    <div class="profile-layout"><form class="profile-form" data-form="profile">
      <div class="profile-fields"><label>Nombre<input name="nombre" value="${esc(profile.nombre)}" autocomplete="given-name" maxlength="60" required /></label><label>Apellido<input name="apellido" value="${esc(profile.apellido)}" autocomplete="family-name" maxlength="60" required /></label>
        ${renderMemberFields(profile)}</div>
      <div class="profile-readonly"><div class="profile-line"><span>Correo de la cuenta</span><strong>${esc(profile.correoInstitucional || state.user?.email)}</strong></div><div class="profile-line"><span>Tipo de cuenta</span><strong>${roleLabel()}</strong></div><div class="profile-line"><span>Acceso</span><strong>${isAdmin() ? "Administrador" : profile.autorizado ? "Autorizado" : "Pendiente de autorización"}</strong></div></div>
      <p class="profile-note">El correo, el rol y la autorización no se pueden cambiar desde esta pantalla.</p><button class="primary-button" type="submit">Guardar cambios ${icon("listo", 16)}</button>
    </form></div>`;
}

function renderSandboxProfile(): string {
  const profile = state.profile!;
  return `${pageHeading("Mi perfil", "Vista de prueba. Los cambios aquí no modifican la cuenta real.")}
    <section class="profile-form profile-preview"><div class="profile-line"><span>Nombre</span><strong>${esc(profile.nombreCompleto || fullName())}</strong></div><div class="profile-line"><span>Correo de la cuenta</span><strong>${esc(profile.correoInstitucional || state.user?.email)}</strong></div><div class="profile-line"><span>Área de interés</span><strong>${esc(profile.carrera || "Sin indicar")}</strong></div><div class="profile-line"><span>Curso o grado</span><strong>${esc(profile.semestre || "Sin indicar")}</strong></div><div class="profile-line"><span>Tipo de cuenta</span><strong>Vista estudiante de prueba</strong></div><div class="notice-box info">Para editar tu perfil real, vuelve a la interfaz de administrador.</div></section>`;
}

function renderStudentSandbox(page: Page): string {
  const demo = state.studentSandbox;
  const heading = (title: string, subtitle: string, action = "") => pageHeading(title, subtitle, action);
  if (page === "inicio") {
    return `${heading(`Hola, ${esc(fullName().split(" ")[0])}`, "Aquí tienes lo que requiere tu atención hoy.")}
      <section class="student-overview"><div class="access-status ${demo.inside ? "inside" : "outside"}"><div class="status-top"><span class="status-dot"></span>${demo.inside ? "Dentro del laboratorio" : "Fuera del laboratorio"}</div><div class="status-label">ESTADO DE ACCESO</div><button class="status-action" data-page="acceso">Abrir control de acceso${icon("ir", 16)}</button><span class="status-watermark">${icon("acceso", 120)}</span></div></section>
      <section class="unframed-section"><div class="section-heading"><h2>Avisos recientes</h2><button class="text-button" data-page="avisos">Ver todos ${icon("ir", 14)}</button></div>${sandboxNotice("aviso-lab", "Reunión del club", "Nos reunimos el jueves a las 15:00 en el laboratorio.")}</section>`;
  }
  if (page === "tareas") {
    return `${heading("Tareas", "Seguimiento de tus responsabilidades.")}
      <div class="task-summary"><div><strong>${demo.taskDone ? 1 : 2}</strong><span>Pendientes</span></div><div><strong>${demo.taskDone ? 1 : 0}</strong><span>Completadas</span></div></div>
      <div class="task-list"><article class="task-row"><span class="task-check ${demo.taskDone ? "done" : ""}">${demo.taskDone ? icon("listo", 17) : ""}</span><div class="task-info"><span class="task-project">PROYECTO ROBOT MÓVIL</span><h3>Probar sensores ultrasónicos</h3><p>Verificar la distancia de detección y registrar resultados.</p><div class="task-meta"><span class="state-pill ${demo.taskDone ? "success" : "warning"}">${demo.taskDone ? "Completada" : "Pendiente"}</span></div></div>${demo.taskDone ? "" : `<button class="secondary-button compact" data-action="preview-complete-task">Marcar completada</button>`}</article><article class="task-row"><span class="task-check"></span><div class="task-info"><span class="task-project">PROYECTO ROBOT MÓVIL</span><h3>Documentar el montaje</h3><p>Agregar fotografías y notas del prototipo.</p><div class="task-meta"><span class="state-pill warning">Pendiente</span></div></div></article></div>`;
  }
  if (page === "acceso") {
    return `${heading("Control de acceso", "Registra y consulta tus movimientos del laboratorio.")}
      <section class="access-panel ${demo.inside ? "inside" : "outside"}"><div class="access-panel-icon">${icon("acceso", 30)}</div><div class="access-panel-copy"><span class="status-label">TU ESTADO ACTUAL</span><h2>${demo.inside ? "Dentro del laboratorio" : "Fuera del laboratorio"}</h2><p>${demo.inside && demo.entryAt ? `Entrada registrada: ${dateText(demo.entryAt, true)}` : "Pulsa el candado para solicitar acceso."}</p></div>${accessLockButtonMarkup(demo.inside, "preview-register-entry", demo.inside)}</section>
      <section class="unframed-section"><div class="section-heading"><h2>Mi historial</h2><span class="section-count">${demo.entryAt ? 1 : 0}</span></div>${demo.entryAt ? `<div class="activity-list">${activityRow({ tipo: "entrada", nombreCompleto: fullName(), fechaHora: demo.entryAt })}</div>` : emptyInline("Todavía no tienes movimientos registrados.")}</section>`;
  }
  if (page === "proyectos") {
    return `${heading("Proyectos", "Equipos, responsables y áreas de trabajo.")}
      <div class="project-grid"><article class="project-card"><div class="project-card-top"><span class="project-mark">${icon("proyectos", 21)}</span><span class="state-pill success">Activo</span></div><p class="project-area">Electrónica · Programación</p><h2>Robot móvil</h2><p class="project-description">Prototipo autónomo para navegación en interiores.</p><div class="project-progress"><div><span>Progreso</span><strong>${demo.taskDone ? "67%" : "33%"}</strong></div><progress max="100" value="${demo.taskDone ? 67 : 33}"></progress><small>${demo.taskDone ? "2 de 3 tareas completadas" : "1 de 3 tareas completadas"}</small></div><div class="project-meta"><span>${icon("people", 15)} 4 miembros</span><span>Responsable: Ana Torres</span></div><div class="project-card-bottom"><button class="text-button" data-action="preview-project-detail">Abrir proyecto ${icon("ir", 14)}</button></div></article><article class="project-card"><div class="project-card-top"><span class="project-mark">${icon("proyectos", 21)}</span><span class="state-pill success">Activo</span></div><p class="project-area">Mecánica</p><h2>Brazo robótico</h2><p class="project-description">Diseño y control de un brazo de cinco grados de libertad.</p><div class="project-meta"><span>${icon("people", 15)} 3 miembros</span><span>Responsable: Diego Benítez</span></div><div class="project-card-bottom">${demo.joinRequested ? `<span class="state-pill warning">Solicitud pendiente</span>` : `<button class="secondary-button compact" data-action="preview-join-project">Solicitar ingreso</button>`}</div></article></div>`;
  }
  if (page === "cursos") {
    const courses = [
      { id: "curso-arduino", title: "Introducción a Arduino", detail: "Microcontroladores · Presencial · Laboratorio Robótica SIL", date: "Inicio: 20 de octubre" },
      { id: "curso-impresion-3d", title: "Diseño e impresión 3D", detail: "Modelado · Presencial · Aula de fabricación", date: "Inicio: 27 de octubre" },
    ];
    return `${heading("Cursos", "Oferta de formación publicada por el club.", `<span class="state-pill muted">Vista de prueba</span>`)}<div class="course-grid">${courses.map((course) => {
      const enrolled = state.studentSandbox.courseEnrollments.includes(course.id);
      return `<article class="course-card"><div class="course-card-top"><span class="course-mark">${icon("cursos", 20)}</span><span class="state-pill success">Publicado</span></div><h2>${course.title}</h2><p>${course.detail}</p><small>${course.date}</small><button class="${enrolled ? "secondary-button" : "primary-button"} compact" data-action="preview-course-enroll" data-id="${course.id}">${enrolled ? "Cancelar inscripción" : "Inscribirme"}</button></article>`;
    }).join("")}</div>`;
  }
  if (page === "inicio") {
    return `${heading("Hola", "Tu calendario de ejemplo para la vista estudiante.")}<section class="calendar-panel calendar-home-panel"><div class="calendar-toolbar"><button class="icon-button" data-action="calendar-previous" aria-label="Mes anterior">${icon("anterior", 17)}</button><h2>${new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric" }).format(state.calendarMonth)}</h2><button class="icon-button" data-action="calendar-next" aria-label="Mes siguiente">${icon("siguiente", 17)}</button><button class="secondary-button compact calendar-today" data-action="calendar-today">Hoy</button></div><p class="empty-inline">Calendario de demostración: aquí aparecerán tus clases, exámenes y actividades del club.</p><div class="calendar-weekdays"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div><div class="calendar-grid">${Array.from({ length: 42 }, (_, index) => {
      const first = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), 1 - ((state.calendarMonth.getDay() + 6) % 7));
      const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index);
      return `<button class="calendar-day ${day.getMonth() === state.calendarMonth.getMonth() ? "" : "outside-month"}" data-page="calendario"><span>${day.getDate()}</span><span class="calendar-markers"></span></button>`;
    }).join("")}</div></section>`;
  }
  if (page === "avisos") {
    return `${heading("Avisos", "Comunicaciones y notificaciones del club.")}
      <div class="notice-list">${sandboxNotice("aviso-lab", "Reunión del club", "Nos reunimos el jueves a las 15:00 en el laboratorio.")}${sandboxNotice("aviso-feria", "Feria tecnológica", "Inscríbete para presentar los proyectos del semestre.")}</div>`;
  }
  if (page === "prestamos") {
    const loanForm = `<form class="inline-form loan-form" data-form="loan"><h2>Solicitar préstamo</h2><div class="field-row"><label>Artículo<select name="recursoId" required><option value="">Seleccionar artículo</option><option value="kit-sensores" data-name="Kit de sensores" data-stock="4">Kit de sensores · 4 disponibles</option><option value="multimetro" data-name="Multímetro" data-stock="2">Multímetro · 2 disponibles</option></select></label><label>Cantidad<input name="cantidad" type="number" min="1" value="1" required /></label></div><label>Propósito<input name="motivo" maxlength="300" required placeholder="¿Para qué necesitas el artículo?" /></label><div class="field-row"><label>Inicio<input name="inicio" type="date" required value="2026-10-13" /></label><label>Devolución prevista<input name="devolucion" type="date" required value="2026-10-20" /></label></div><button class="primary-button" type="submit">Enviar solicitud</button></form>`;
    const loans = demo.loans.map((loan, index) => `<article class="loan-card"><div class="loan-icon">${icon("prestamos", 21)}</div><div class="loan-copy"><div class="loan-title-row"><h3>${esc(loan.item)}</h3><span class="state-pill ${loan.status === "Aprobada" ? "success" : "warning"}">${esc(loan.status)}</span></div><p>${loan.quantity} unidad(es)</p><p class="loan-purpose">${esc(loan.purpose)}</p><div class="loan-dates"><span>${icon("fecha", 14)} Inicio: ${dateText(new Date(`${loan.start}T12:00:00`))}</span><span>${icon("fecha", 14)} Devolución: ${dateText(new Date(`${loan.due}T12:00:00`))}</span></div>${loan.status === "Pendiente" ? `<div class="card-actions"><button class="secondary-button compact" data-action="preview-cancel-loan" data-index="${index}">Cancelar solicitud</button></div>` : ""}</div></article>`).join("");
    return `${heading("Mis préstamos", "Controla artículos a tu cargo y fechas de devolución.")}${loanForm}${loans ? `<div class="loan-list">${loans}</div>` : emptyPanel("Sin préstamos", "Cuando solicites un artículo, podrás seguirlo desde esta pantalla.")}`;
  }
  return `${heading("Inicio", "Panel de prueba del estudiante.")}`;
}

function renderSandboxShortcuts(): string {
  return renderStudentShortcuts();
}

function renderStudentShortcuts(): string {
  return `<section class="student-overview-links"><div class="section-heading"><h2>Accesos rápidos</h2></div><div class="student-shortcut-rail" role="group" aria-label="Accesos rápidos del estudiante"><button class="student-shortcut tasks" data-page="tareas" aria-label="Mis tareas"><span class="quick-icon coral">${icon("tareas", 22)}</span><strong>Mis tareas</strong></button><button class="student-shortcut loans" data-page="prestamos" aria-label="Mis préstamos"><span class="quick-icon green">${icon("prestamos", 22)}</span><strong>Mis préstamos</strong></button><button class="student-shortcut projects" data-page="proyectos" aria-label="Proyectos"><span class="quick-icon blue">${icon("proyectos", 22)}</span><strong>Proyectos</strong></button><button class="student-shortcut courses" data-page="cursos" aria-label="Cursos"><span class="quick-icon amber">${icon("cursos", 22)}</span><strong>Cursos</strong></button></div></section>`;
}

function renderSandboxCalendar(): string {
  const month = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), 1);
  const first = new Date(month.getFullYear(), month.getMonth(), 1 - ((month.getDay() + 6) % 7));
  const monthLabel = new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric" }).format(month);
  const cells = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + index);
    return `<button class="calendar-day ${day.getMonth() === month.getMonth() ? "" : "outside-month"}" data-page="calendario"><span>${day.getDate()}</span><span class="calendar-markers"></span></button>`;
  }).join("");
  return `<section class="home-calendar"><div class="section-heading"><h2>Calendario</h2><span class="state-pill muted">Demostración</span></div><div class="calendar-panel calendar-home-panel"><div class="calendar-toolbar"><button class="icon-button" data-action="calendar-previous" aria-label="Mes anterior">${icon("anterior", 17)}</button><h2>${esc(monthLabel)}</h2><button class="icon-button" data-action="calendar-next" aria-label="Mes siguiente">${icon("siguiente", 17)}</button><button class="secondary-button compact calendar-today" data-action="calendar-today">Hoy</button></div><p class="empty-inline">Las clases, exámenes y actividades aparecerán aquí.</p><div class="calendar-weekdays"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div><div class="calendar-grid">${cells}</div></div></section>`;
}

function sandboxNotice(id: string, title: string, message: string): string {
  const selected = state.studentSandbox.reactions[id];
  const options = [["me_gusta", "👍"], ["me_encanta", "❤️"], ["celebrar", "🎉"], ["apoyar", "👏"]];
  return `<article class="notice-card"><div class="notice-card-header"><span class="priority-dot normal"></span><span class="priority-label">Normal</span></div><h3>${title}</h3><p>${message}</p><div class="notice-author">Publicado por Administración</div><div class="reaction-row">${options.map(([type, symbol]) => `<button class="reaction-button ${selected === type ? "selected" : ""}" data-action="preview-react" data-notice="${id}" data-reaction="${type}" aria-pressed="${selected === type}">${symbol} ${selected === type ? 1 : 0}</button>`).join("")}</div></article>`;
}

function pageHeading(title: string, subtitle: string, action = ""): string {
  return `<div class="page-heading"><div><p class="eyebrow">${canManageClub() ? "GESTIÓN DEL CLUB" : "MI ESPACIO"}</p><h1>${title}</h1><p>${subtitle}</p></div>${action}</div>`;
}

async function renderHome(): Promise<string> {
  const greeting = fullName().split(" ")[0];
  if (!isAuthorized()) {
    return `${pageHeading(`Hola, ${esc(greeting)}`, "Tu perfil está pendiente de autorización.")}
      <section class="pending-banner">${icon("alerta", 22)}<div><strong>Solicitud en revisión</strong><p>El administrador debe autorizar tu cuenta antes de habilitar proyectos, préstamos y control de acceso.</p></div></section>
      <section class="unframed-section"><h2>Tu perfil</h2><div class="profile-line"><span>Correo institucional</span><strong>${esc(state.profile?.correoInstitucional)}</strong></div><div class="profile-line"><span>Área de interés</span><strong>${esc(state.profile?.carrera || "Sin indicar")}</strong></div></section>`;
  }
  if (isAdminInterface()) {
    const [students, pendingLoans, activeLoans, projects, pendingAccess] = await Promise.all([
      getDocs(query(collection(db, "usuarios"), where("rol", "==", "estudiante"))),
      getDocs(query(collection(db, "reservas"), where("estado", "==", "Pendiente"))),
      getDocs(query(collection(db, "reservas"), where("estado", "==", "Aprobada"))),
      getDocs(query(collection(db, "proyectos"), where("estado", "==", "Activo"))),
      getDocs(query(collection(db, "usuarios"), where("rol", "==", "estudiante"), where("autorizado", "==", false))),
    ]);
    const recent = await getDocs(query(collection(db, "accesos"), orderBy("fechaHora", "desc"), limit(30)));
    const recentEntries = recent.docs.filter((item) => item.get("tipo") === "entrada").slice(0, 5);
    return `${pageHeading(`Buen día, ${esc(greeting)}`, "Resumen del club y pendientes de gestión.", `<button class="icon-button refresh-action" data-action="refresh" title="Actualizar" aria-label="Actualizar">${icon("actualizar")}</button>`)}
      ${!isAuthorized() ? `<section class="notice-box warning">${icon("alerta")}<span>Esta cuenta todavía no está autorizada como administradora.</span></section>` : ""}
      <section class="metrics-grid">
        ${metric("Estudiantes", students.size, "Personas registradas", "estudiantes", "people")}
        ${metric("Acceso pendiente", pendingAccess.size, "Requieren revisión", "estudiantes", "alert")}
        ${metric("Préstamos pendientes", pendingLoans.size, "Solicitudes por resolver", "prestamos", "loan")}
        ${metric("Préstamos activos", activeLoans.size, "Artículos fuera del inventario", "prestamos", "active")}
        ${metric("Proyectos activos", projects.size, "En curso", "proyectos", "project")}
      </section>
      <section class="admin-shortcut-section"><div class="section-heading"><h2>Accesos rápidos</h2></div><div class="admin-shortcut-rail" role="group" aria-label="Accesos rápidos de administración">${adminQuickLink("Préstamos", "prestamos", "prestamos", "loans")}${adminQuickLink("Estudiantes", "estudiantes", "estudiantes", "people")}${adminQuickLink("Avisos", "avisos", "avisos", "notices")}</div></section>
      <section class="unframed-section"><div class="section-heading"><h2>Entradas recientes</h2><button class="text-button" data-page="acceso">Ver accesos ${icon("ir", 14)}</button></div>${recentEntries.length === 0 ? emptyInline("Todavía no hay entradas registradas.") : `<div class="activity-list">${recentEntries.map((item) => activityRow(item.data())).join("")}</div>`}</section>`;
  }
  const [loans, presence, notices, calendar, assignedByOwner, assignedByList] = await Promise.all([
    getDocs(query(collection(db, "reservas"), where("solicitanteUid", "==", state.user!.uid))),
    getDoc(doc(db, "presencias", state.user!.uid)),
    getDocs(query(collection(db, "avisos"), orderBy("fechaCreacion", "desc"), limit(10))),
    renderHomeCalendar(),
    getDocs(query(collectionGroup(db, "tareas"), where("responsableUid", "==", state.user!.uid), limit(20))).catch(() => null),
    getDocs(query(collectionGroup(db, "tareas"), where("responsableUids", "array-contains", state.user!.uid), limit(20))).catch(() => null),
  ]);
  const inside = presence.exists() && presenceIsCurrent(presence.data());
  const tasks = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  for (const task of [...(assignedByOwner?.docs ?? []), ...(assignedByList?.docs ?? [])]) {
    if (task.get("estado") !== "Completada") tasks.set(task.ref.path, task);
  }
  const nextTasks = [...tasks.values()].sort((a, b) => (a.get("fechaLimite")?.toMillis?.() ?? Number.MAX_SAFE_INTEGER) - (b.get("fechaLimite")?.toMillis?.() ?? Number.MAX_SAFE_INTEGER)).slice(0, 3);
  const importantNotices = notices.docs.map((item) => ({ id: item.id, data: item.data() })).sort((a, b) => Number(b.data.prioridad === "Importante") - Number(a.data.prioridad === "Importante") || (b.data.fechaCreacion?.toMillis?.() ?? 0) - (a.data.fechaCreacion?.toMillis?.() ?? 0)).slice(0, 3);
  const teacher = state.profile?.tipoUsuario === "docente";
  return `${pageHeading(`Hola, ${esc(greeting)}`, teacher ? "Tu espacio docente: revisa cursos, actividades y avisos del club." : "Aquí tienes lo que requiere tu atención hoy.")}
    ${teacher ? `<section class="teacher-quick-panel"><div><span class="eyebrow">ESPACIO DOCENTE</span><h2>¡Hola, profe ${esc(greeting)}!</h2><p>Organiza tu participación en el club desde cursos, tareas y calendario.</p></div><div class="teacher-quick-links"><button data-page="cursos">${icon("cursos", 20)} Cursos</button><button data-page="tareas">${icon("tareas", 20)} Actividades</button><button data-page="calendario">${icon("calendario", 20)} Calendario</button></div></section>` : ""}
    <section class="student-overview"><div class="access-status ${inside ? "inside" : "outside"}"><div class="status-top"><span class="status-dot"></span>${inside ? "Dentro del laboratorio" : "Fuera del laboratorio"}</div><div class="status-label">ESTADO DE ACCESO</div><button class="status-action" data-page="acceso">Abrir control de acceso${icon("ir", 16)}</button><span class="status-watermark">${icon("acceso", 120)}</span></div></section>
    ${renderStudentShortcuts()}
    ${nextTasks.length ? `<section class="unframed-section"><div class="section-heading"><h2>${teacher ? "Actividades próximas" : "Mis tareas pendientes"}</h2><button class="text-button" data-page="tareas">Ver tareas ${icon("ir", 14)}</button></div><div class="home-task-list">${nextTasks.map((item) => `<button class="home-task-item" data-page="tareas"><span class="state-pill warning">Pendiente</span><strong>${esc(item.get("titulo") || "Tarea")}</strong>${item.get("fechaLimite") ? `<small>Entrega: ${dateText(item.get("fechaLimite"))}</small>` : ""}</button>`).join("")}</div></section>` : ""}
    ${calendar}
    <section class="unframed-section"><div class="section-heading"><h2>Avisos importantes y recientes</h2><button class="text-button" data-page="avisos">Ver todos ${icon("ir", 14)}</button></div>${importantNotices.length ? `<div class="notice-list">${importantNotices.map((item) => noticeCard(item.id, item.data, false)).join("")}</div>` : emptyInline("No hay avisos publicados.")}</section>`;
}

function metric(title: string, value: number, hint: string, page: Page, tone = "plain"): string {
  const visualIcon = tone === "people" ? icon("estudiantes") : tone === "loan" || tone === "active" ? icon("prestamos") : tone === "project" ? icon("proyectos") : tone === "alert" ? icon("alerta") : icon("inicio");
  return `<button class="metric-card" data-page="${page}"><span class="metric-symbol ${tone}">${visualIcon}</span><span class="metric-value">${value}</span><span class="metric-title">${title}</span><span class="metric-hint">${hint}</span></button>`;
}

function adminQuickLink(title: string, page: Page, iconName: string, tone: string): string {
  return `<button class="admin-shortcut ${tone}" data-page="${page}" aria-label="${title}"><span class="admin-shortcut-icon">${icon(iconName, 22)}</span><strong>${title}</strong></button>`;
}

function emptyInline(message: string): string {
  return `<div class="empty-inline">${esc(message)}</div>`;
}

function activityRow(data: DocumentData): string {
  const enter = data.tipo === "entrada";
  return `<div class="activity-row"><span class="activity-icon ${enter ? "green" : "muted"}">${icon(enter ? "acceso" : "salir", 17)}</span><span class="activity-copy"><strong>${esc(data.nombreCompleto || data.nombre || "Usuario")}</strong><small>${enter ? "Entrada registrada" : "Salida registrada"}</small></span><time>${dateText(data.fechaHora, true)}</time></div>`;
}

async function renderProjects(): Promise<string> {
  if (!isAuthorized()) return pendingNotice();
  const snapshot = await getDocs(query(collection(db, "proyectos"), limit(60)));
  const projects: Array<{ id: string } & DocumentData> = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  projects.sort((a, b) => (b.fechaCreacion?.toMillis?.() ?? 0) - (a.fechaCreacion?.toMillis?.() ?? 0));
  const progress = new Map<string, { total: number; done: number }>();
  const requestStatus = new Map<string, string>();
  await Promise.all(projects.slice(0, 30).map(async (project) => {
    try {
      const tasks = await getDocs(collection(db, "proyectos", project.id, "tareas"));
      progress.set(project.id, { total: tasks.size, done: tasks.docs.filter((task) => task.get("estado") === "Completada").length });
    } catch { /* Membership rules intentionally hide other projects' tasks. */ }
    if (!canManageClub() && !(project.miembrosUids || []).includes(state.user!.uid) && projectLead(project) !== state.user!.uid) {
      try {
        const request = await getDoc(doc(db, "proyectos", project.id, "solicitudes", state.user!.uid));
        if (request.exists()) requestStatus.set(project.id, String(request.get("estado") || ""));
      } catch { /* Users can only read their own request. */ }
    }
  }));
  return `${pageHeading("Proyectos", "Equipos, responsables y áreas de trabajo.", canManageClub() ? `<button class="primary-button compact" data-action="new-project">${icon("sumar")} Nuevo proyecto</button>` : "")}
    ${projects.length ? `<div class="project-grid">${projects.map((project) => {
      const summary = progress.get(project.id);
      const percent = summary?.total ? Math.round((summary.done / summary.total) * 100) : 0;
      const requestState = requestStatus.get(project.id);
      const requestAction = !canManageClub() && !((project.miembrosUids || []).includes(state.user!.uid)) && projectLead(project) !== state.user!.uid
        ? requestState === "pendiente" ? `<span class="state-pill warning">Solicitud pendiente</span>`
          : requestState === "aceptada" ? `<span class="state-pill success">Solicitud aceptada</span>`
            : `<button class="secondary-button compact" data-action="join-project" data-id="${esc(project.id)}">${requestState === "rechazada" ? "Volver a solicitar" : "Solicitar ingreso"}</button>`
        : "";
      const canEditResponsible = canManageClub() || (!isStudentPreview() && project.creadoPorUid === state.user!.uid);
      const canDeleteProject = canManageClub();
      return `<article class="project-card"><div class="project-card-top"><span class="project-mark">${icon("proyectos", 21)}</span><span class="state-pill ${project.estado === "Activo" ? "success" : "muted"}">${esc(project.estado || "Activo")}</span></div><p class="project-area">${esc((project.departamentos || []).join(" · ") || "Club de Robótica")}</p><h2>${esc(project.nombre || project.titulo || "Proyecto")}</h2><p class="project-description">${esc(project.descripcion || "Sin descripción")}</p><div class="project-progress"><div><span>Progreso</span><strong>${summary ? `${percent}%` : "—"}</strong></div><progress max="100" value="${summary ? percent : 0}" aria-label="Progreso del proyecto"></progress><small>${summary ? `${summary.done} de ${summary.total} tareas completadas` : "Visible para miembros del proyecto"}</small></div><div class="project-meta"><span>${icon("people", 15)} ${(project.miembrosUids || []).length} miembros</span><span>Responsable: ${esc(project.responsableNombre || "Sin asignar")}</span></div><div class="project-card-bottom"><button class="text-button" data-action="project-detail" data-id="${esc(project.id)}">Abrir proyecto ${icon("ir", 14)}</button>${canEditResponsible ? `<button class="secondary-button compact" data-action="edit-project-responsible" data-id="${esc(project.id)}" aria-label="Asignar responsable">${icon("people", 15)} Responsable</button>` : ""}${canDeleteProject ? `<button class="icon-button danger-icon" data-action="delete-project" data-id="${esc(project.id)}" aria-label="Eliminar proyecto" title="Eliminar proyecto">${icon("eliminar", 16)}</button>` : ""}${requestAction}</div></article>`;
    }).join("")}</div>` : emptyPanel("Aún no hay proyectos", "Cuando se creen proyectos, aparecerán aquí.")}`;
}

async function renderCourses(): Promise<string> {
  if (!isAuthorized()) return pendingNotice();
  const snapshot = isAdminInterface()
    ? await getDocs(query(collection(db, "cursos"), orderBy("fechaCreacion", "desc"), limit(100)))
    : await getDocs(query(collection(db, "cursos"), where("estado", "==", "Publicado"), limit(100)));
  const courses = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  courses.sort((a, b) => (b.fechaCreacion?.toMillis?.() ?? 0) - (a.fechaCreacion?.toMillis?.() ?? 0));
  const registrations = new Map<string, boolean>();
  if (!isAdminInterface()) {
    await Promise.all(courses.map(async (course) => {
      const registration = await getDoc(doc(db, "cursos", course.id, "inscripciones", state.user!.uid));
      registrations.set(course.id, registration.exists());
    }));
  }
  const action = isAdminInterface() && !isStudentPreview()
    ? `<button class="primary-button compact" data-action="new-course">${icon("sumar", 15)} Publicar curso</button>`
    : "";
  return `${pageHeading("Cursos", isAdminInterface() ? "Publica y administra la oferta de formación del club." : "Explora los cursos del club e inscríbete.", action)}
    ${courses.length ? `<div class="course-grid">${courses.map((course) => {
      const enrolled = registrations.get(course.id) === true;
      const closed = course.estado !== "Publicado";
      const courseAction = isAdminInterface()
        ? !isStudentPreview() ? `<div class="course-admin-actions"><button class="secondary-button compact" data-action="course-registrations" data-id="${esc(course.id)}">Ver inscritos</button><button class="secondary-button compact" data-action="toggle-course-state" data-id="${esc(course.id)}" data-state="${closed ? "Publicado" : "Cerrado"}">${closed ? "Volver a publicar" : "Cerrar inscripciones"}</button></div>` : `<span class="state-pill muted">Solo lectura</span>`
        : enrolled
          ? `<button class="secondary-button compact" data-action="leave-course" data-id="${esc(course.id)}">Cancelar inscripción</button>`
          : `<button class="primary-button compact" data-action="enroll-course" data-id="${esc(course.id)}">Inscribirme</button>`;
      const dates = `${dateText(course.fechaInicio)}${course.fechaFin ? ` - ${dateText(course.fechaFin)}` : ""}`;
      return `<article class="course-card"><div class="course-card-top"><span class="course-mark">${icon("cursos", 20)}</span><span class="state-pill ${closed ? "muted" : "success"}">${closed ? "Inscripciones cerradas" : "Inscripción abierta"}</span></div><h2>${esc(course.titulo || "Curso")}</h2><p class="course-description">${esc(course.descripcion || "Sin descripción")}</p><div class="course-details"><span><strong>Docente</strong>${esc(course.instructor || "Equipo Robótica SIL")}</span><span><strong>Fecha</strong>${dates}</span><span><strong>Horario</strong>${esc(course.horario || "A confirmar")}</span><span><strong>Modalidad</strong>${esc(course.modalidad || "Presencial")}${course.lugar ? ` · ${esc(course.lugar)}` : ""}</span></div><div class="course-card-bottom">${courseAction}</div></article>`;
    }).join("")}</div>` : emptyPanel(isAdminInterface() ? "Aún no hay cursos publicados" : "No hay cursos con inscripción abierta", isAdminInterface() ? "Publica el primer curso del club." : "Los cursos disponibles aparecerán aquí cuando el administrador los publique.")}`;
}

async function submitCourse(form: HTMLFormElement): Promise<void> {
  if (!state.user || !state.profile || !isAdmin() || isStudentPreview()) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const data = new FormData(form);
  const startDate = String(data.get("fechaInicio") || "");
  const endDate = String(data.get("fechaFin") || "");
  if (!startDate || !endDate || startDate > endDate) return notify("Revisa las fechas del curso.", "error");
  setBusy(button, true);
  try {
    await addDoc(collection(db, "cursos"), {
      titulo: String(data.get("titulo") || "").trim(),
      descripcion: String(data.get("descripcion") || "").trim(),
      instructor: String(data.get("instructor") || "").trim(),
      fechaInicio: Timestamp.fromDate(new Date(`${startDate}T12:00:00`)),
      fechaFin: Timestamp.fromDate(new Date(`${endDate}T12:00:00`)),
      horario: String(data.get("horario") || "").trim(),
      modalidad: String(data.get("modalidad") || "Presencial"),
      lugar: String(data.get("lugar") || "").trim(),
      estado: "Publicado",
      creadoPorUid: state.user.uid,
      creadoPorNombre: fullName(),
      fechaCreacion: serverTimestamp(),
    });
    closeDialog();
    notify("Curso publicado. Ya está disponible para inscripción.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo publicar el curso."), "error");
  }
}

function pendingNotice(): string {
  return `${pageHeading("Acceso pendiente", "Esta sección se habilita cuando el administrador autorice tu perfil.")}<section class="pending-banner">${icon("alerta", 22)}<div><strong>Cuenta en revisión</strong><p>Tu perfil está creado. Un administrador debe habilitar el acceso al espacio de trabajo.</p></div></section>`;
}

async function renderTasks(): Promise<string> {
  if (!isAuthorized()) return pendingNotice();
  const snapshots = await Promise.all([
    getDocs(query(collectionGroup(db, "tareas"), where("responsableUid", "==", state.user!.uid), limit(60))).catch(() => null),
    getDocs(query(collectionGroup(db, "tareas"), where("responsableUids", "array-contains", state.user!.uid), limit(60))).catch(() => null),
  ]);
  const assigned = new Map<string, QueryDocumentSnapshot<DocumentData>>();
  snapshots.flatMap((snapshot) => snapshot?.docs ?? []).forEach((item) => assigned.set(item.ref.path, item));
  const projects = await getDocs(query(collection(db, "proyectos"), limit(60)));
  const relevant = projects.docs.filter((project) => {
    const data = project.data();
    return isAdminInterface() || project.id && (data.miembrosUids || []).includes(state.user!.uid) || data.responsableUid === state.user!.uid || data.creadoPorUid === state.user!.uid;
  });
  await Promise.all(relevant.slice(0, 25).map(async (project) => {
    try {
      const tasks = await getDocs(query(collection(db, "proyectos", project.id, "tareas"), limit(60)));
      tasks.docs.forEach((task) => assigned.set(task.ref.path, task));
    } catch { /* The rule limits task reads to project members and assignees. */ }
  }));
  const tasks: Array<Record<string, any>> = [...assigned.values()].map((item) => ({ id: item.id, path: item.ref.path, ...item.data() }));
  tasks.sort((a, b) => (b.fechaCreacion?.toMillis?.() ?? 0) - (a.fechaCreacion?.toMillis?.() ?? 0));
  const pending = tasks.filter((task) => task.estado !== "Completada");
  const done = tasks.filter((task) => task.estado === "Completada");
  return `${pageHeading("Tareas", "Seguimiento de tus responsabilidades.", `<button class="icon-button" data-action="refresh" title="Actualizar" aria-label="Actualizar">${icon("actualizar")}</button>`)}
    ${tasks.length ? `<div class="task-summary"><div><strong>${pending.length}</strong><span>Pendientes</span></div><div><strong>${done.length}</strong><span>Completadas</span></div></div><div class="task-list">${tasks.map((task) => taskCard(task)).join("")}</div>` : emptyPanel("No hay tareas asignadas", "Las tareas asignadas a tu cuenta aparecerán aquí.")}`;
}

function taskCard(task: Record<string, any>): string {
  const projectId = String(task.path).split("/")[1];
  const completed = task.estado === "Completada";
  const isAssignee = task.responsableUid === state.user?.uid || (task.responsableUids || []).includes(state.user?.uid);
  return `<article class="task-row"><span class="task-check ${completed ? "done" : ""}">${completed ? icon("listo", 17) : ""}</span><div class="task-info"><span class="task-project">${esc(projectId)}</span><h3>${esc(task.titulo || "Tarea")}</h3><p>${esc(task.descripcion || "Sin descripción")}</p><div class="task-meta"><span class="state-pill ${completed ? "success" : "warning"}">${esc(task.estado || "Pendiente")}</span>${task.fechaLimite ? `<span>${icon("fecha", 14)} ${dateText(task.fechaLimite)}</span>` : ""}</div></div>${!completed && isAssignee ? `<button class="secondary-button compact" data-action="complete-task" data-path="${esc(task.path)}">Marcar completada</button>` : ""}</article>`;
}

async function renderAccess(): Promise<string> {
  if (!isAuthorized()) return pendingNotice();
  if (isAdminInterface()) {
    const [snapshot, students, ownEntries, recent] = await Promise.all([
      getDocs(query(collection(db, "presencias"), where("dentro", "==", true))),
      getDocs(query(collection(db, "usuarios"), where("rol", "==", "estudiante"))),
      getDocs(query(collection(db, "accesos"), where("uid", "==", state.user!.uid), limit(20))),
      getDocs(query(collection(db, "accesos"), orderBy("fechaHora", "desc"), limit(30))),
    ]);
    const studentMap = new Map(students.docs.map((student) => [student.id, student.data()]));
    const present = snapshot.docs.filter((item) => studentMap.has(item.id) && presenceIsCurrent(item.data()));
    const lastEntry = ownEntries.docs
      .filter((item) => item.get("tipo") === "entrada")
      .sort((a, b) => (b.get("fechaHora")?.toMillis?.() ?? 0) - (a.get("fechaHora")?.toMillis?.() ?? 0))[0];
    const recentEntries = recent.docs.filter((item) => item.get("tipo") === "entrada");
    return `${pageHeading("Accesos", "Presencia actual e historial de entradas.")}
      <section class="access-panel access-lock-panel outside"><div class="access-lock-panel-copy"><span class="status-label">CONTROL DE ACCESO</span><h2>Acceso al club</h2><p>${lastEntry ? `Última entrada registrada: ${dateText(lastEntry.get("fechaHora"), true)}` : ""}</p></div>${accessLockButtonMarkup(false, "register-admin-entry")}</section>
      <section class="metrics-grid two-metrics">${metric("Dentro del laboratorio", present.length, "Estudiantes presentes", "acceso", "green")}${metric("Estudiantes registrados", students.size, "Perfiles de estudiante", "estudiantes", "people")}</section>
      <section class="unframed-section"><div class="section-heading"><h2>Presentes ahora</h2><span class="section-count">${present.length}</span></div>${present.length ? `<div class="people-list">${present.map((item) => { const person = studentMap.get(item.id)!; return `<div class="person-row"><span class="avatar">${esc((person.nombre || person.nombreCompleto || "E").slice(0, 1).toUpperCase())}</span><span><strong>${esc(person.nombreCompleto || `${person.nombre || ""} ${person.apellido || ""}`)}</strong><small>${esc(person.correoInstitucional || "")}</small></span><span class="state-pill success">Dentro</span></div>`; }).join("")}</div>` : emptyInline("No hay estudiantes registrados dentro.")}</section>
      <section class="unframed-section"><div class="section-heading"><h2>Entradas recientes</h2><span class="section-count">${recentEntries.length}</span></div>${recentEntries.length === 0 ? emptyInline("No hay entradas registradas.") : `<div class="activity-list">${recentEntries.map((item) => activityRow(item.data())).join("")}</div>`}</section>`;
  }
  const [presence, history] = await Promise.all([
    getDoc(doc(db, "presencias", state.user!.uid)),
    getDocs(query(collection(db, "accesos"), where("uid", "==", state.user!.uid), orderBy("fechaHora", "desc"), limit(10)))
      .then((snapshot) => ({ snapshot, warning: "" }))
      .catch((error: unknown) => ({
        snapshot: null,
        warning: (error as { code?: string })?.code === "failed-precondition"
          ? "El historial se está preparando. Puedes registrar tu entrada; vuelve a consultar el historial en unos minutos."
          : errorMessage(error, "No se pudo cargar el historial. Puedes registrar tu entrada e intentar consultar el historial nuevamente."),
      })),
  ]);
  const recent = history.snapshot;
  const inside = presence.exists() && presenceIsCurrent(presence.data());
  const entries = recent?.docs.filter((item) => item.get("tipo") === "entrada") ?? [];
  return `${pageHeading("Control de acceso", "Registra tu entrada al laboratorio.")}
    <section class="access-panel access-lock-panel ${inside ? "inside" : "outside"}"><div class="access-lock-panel-copy"><span class="status-label">TU ESTADO ACTUAL</span><h2>${inside ? "Dentro del laboratorio" : "Fuera del laboratorio"}</h2><p>${inside ? `Última actualización: ${dateText(presence.get("ultimaActualizacion"), true)}` : ""}</p></div>${accessLockButtonMarkup(inside)}</section>
    <section class="unframed-section"><div class="section-heading"><h2>Mi historial</h2>${recent ? `<span class="section-count">${entries.length}</span>` : ""}</div>${!recent ? `<div class="notice-box warning" role="status">${esc(history.warning)}</div><button class="secondary-button" data-action="refresh">${icon("actualizar")} Actualizar historial</button>` : entries.length === 0 ? emptyInline("Todavía no tienes entradas registradas.") : `<div class="activity-list">${entries.map((item) => activityRow(item.data())).join("")}</div>`}</section>`;
}

async function renderNotices(): Promise<string> {
  const snapshot = await getDocs(query(collection(db, "avisos"), orderBy("fechaCreacion", "desc"), limit(40)));
  const userNotices = state.user ? await getDocs(query(collection(db, "usuarios", state.user.uid, "notificaciones"), orderBy("fechaCreacion", "desc"), limit(15))).catch(() => null) : null;
  const personal = userNotices?.docs.map((item) => ({ id: item.id, ...item.data(), personal: true })) ?? [];
  const global = snapshot.docs.map((item) => ({ id: item.id, ...item.data(), personal: false }));
  const all: Array<Record<string, any>> = [...personal, ...global];
  all.sort((a, b) => Number(b.prioridad === "Importante") - Number(a.prioridad === "Importante") || (b.fechaCreacion?.toMillis?.() ?? 0) - (a.fechaCreacion?.toMillis?.() ?? 0));
  return `${pageHeading("Avisos", "Comunicaciones y notificaciones del club.", canManageClub() ? `<button class="primary-button compact" data-action="new-notice">${icon("sumar")} Publicar aviso</button>` : "")}
    ${all.length ? `<div class="notice-list">${all.map((item) => item.personal ? personalNoticeCard(item) : noticeCardWithAdminAction(item.id, item)).join("")}</div>` : emptyPanel("No hay avisos", "Los avisos publicados aparecerán en esta sección.")}`;
}

async function renderFeedback(): Promise<string> {
  const snapshot = canManageClub()
    ? await getDocs(query(collection(db, "sugerencias"), limit(100)))
    : await getDocs(query(collection(db, "sugerencias"), where("uid", "==", state.user!.uid), limit(100)));
  const reports: Array<Record<string, any>> = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  reports.sort((a, b) => (b.fechaCreacion?.toMillis?.() ?? 0) - (a.fechaCreacion?.toMillis?.() ?? 0));
  const list = reports.length ? `<div class="feedback-list">${reports.map((item) => {
    const statusClass = item.estado === "resuelto" ? "success" : item.estado === "en_revision" ? "warning" : "muted";
    const statusLabel = item.estado === "resuelto" ? "Resuelto" : item.estado === "en_revision" ? "En revisión" : "Recibido";
    return `<article class="feedback-card"><div class="feedback-card-top"><span class="state-pill ${item.tipo === "error" ? "warning" : "muted"}">${item.tipo === "error" ? "Reporte de error" : "Sugerencia"}</span><time>${dateText(item.fechaCreacion, true)}</time></div><div class="feedback-title-row"><h3>${esc(item.titulo)}</h3><span class="state-pill ${statusClass}">${statusLabel}</span></div><p>${esc(item.detalle)}</p><small class="feedback-author">${canManageClub() ? `Enviado por ${esc(item.nombre || "Estudiante")}` : "Enviado por ti"}</small>${item.respuesta ? `<div class="feedback-reply"><strong>Respuesta del club</strong><p>${esc(item.respuesta)}</p></div>` : ""}${canManageClub() ? `<form class="feedback-manage-form" data-form="feedback-response" data-id="${esc(item.id)}"><label>Estado<select name="estado"><option value="recibido" ${item.estado === "recibido" ? "selected" : ""}>Recibido</option><option value="en_revision" ${item.estado === "en_revision" ? "selected" : ""}>En revisión</option><option value="resuelto" ${item.estado === "resuelto" ? "selected" : ""}>Resuelto</option></select></label><label>Respuesta<textarea name="respuesta" rows="2" maxlength="1000" placeholder="Escribe una respuesta para la persona">${esc(item.respuesta || "")}</textarea></label><button class="secondary-button compact" type="submit">Guardar seguimiento</button></form>` : ""}</article>`;
  }).join("")}</div>` : emptyInline(canManageClub() ? "Todavía no hay sugerencias ni errores reportados." : "Todavía no enviaste sugerencias ni reportes.");
  return `${pageHeading("Sugerencias y reportes", canManageClub() ? "Revisa los comentarios y errores reportados por el club." : "Cuéntanos qué podemos mejorar o qué error encontraste.")}
    <form class="inline-form feedback-form" data-form="feedback"><h2>Enviar un comentario</h2><label>Tipo<select name="tipo"><option value="sugerencia">Sugerencia</option><option value="error">Reporte de error</option></select></label><label>Asunto<input name="titulo" required maxlength="100" placeholder="Resume tu idea o el problema" /></label><label>Detalle<textarea name="detalle" rows="4" required maxlength="2000" placeholder="Describe la sugerencia o los pasos para reproducir el error"></textarea></label><button class="primary-button" type="submit">Enviar</button></form>
    <section class="unframed-section"><div class="section-heading"><h2>${canManageClub() ? "Enviados al club" : "Mis envíos"}</h2><span class="section-count">${reports.length}</span></div>${list}</section>`;
}

type CalendarItem = {
  id: string;
  kind: "clase" | "examen" | "actividad";
  title: string;
  detail: string;
  startsAt: Date;
  endsAt?: Date;
  source: "personal" | "club";
};

async function renderHomeCalendar(): Promise<string> {
  if (!isAuthorized()) return "";
  const month = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), 1);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthStart = new Date(year, monthIndex, 1);
  const nextMonth = new Date(year, monthIndex + 1, 1);
  const [personal, activities] = await Promise.all([
    getDocs(query(collection(db, "usuarios", state.user!.uid, "calendario"), limit(100))),
    getDocs(query(collection(db, "actividadesClub"), where("fechaInicio", ">=", Timestamp.fromDate(monthStart)), where("fechaInicio", "<", Timestamp.fromDate(nextMonth)), orderBy("fechaInicio", "asc"), limit(100))),
  ]);
  const datesWithEvents = new Map<string, Set<string>>();
  const addMarker = (date: Date, kind: string) => {
    const key = calendarDateKey(date);
    const kinds = datesWithEvents.get(key) || new Set<string>();
    kinds.add(kind);
    datesWithEvents.set(key, kinds);
  };
  personal.docs.forEach((snapshot) => {
    const entry = snapshot.data();
    if (entry.tipo === "examen" && entry.fechaHora instanceof Timestamp) addMarker(entry.fechaHora.toDate(), "examen");
    if (entry.tipo === "clase" && entry.desde instanceof Timestamp && entry.hasta instanceof Timestamp) {
      const from = entry.desde.toDate();
      const through = entry.hasta.toDate();
      const weekdays = Array.isArray(entry.diasSemana) ? entry.diasSemana : [];
      const first = new Date(year, monthIndex, 1 - ((monthStart.getDay() + 6) % 7));
      for (let offset = 0; offset < 42; offset += 1) {
        const day = new Date(first.getFullYear(), first.getMonth(), first.getDate() + offset);
        const weekday = day.getDay() || 7;
        if (day >= new Date(from.getFullYear(), from.getMonth(), from.getDate())
          && day <= new Date(through.getFullYear(), through.getMonth(), through.getDate())
          && weekdays.includes(weekday)) addMarker(day, "clase");
      }
    }
  });
  activities.docs.forEach((snapshot) => {
    const start = snapshot.get("fechaInicio");
    if (start instanceof Timestamp) addMarker(start.toDate(), "actividad");
  });
  const gridStart = new Date(year, monthIndex, 1 - ((monthStart.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  const cells = days.map((day) => {
    const key = calendarDateKey(day);
    const markers = [...(datesWithEvents.get(key) || [])].map((kind) => `<i class="${kind}" aria-hidden="true"></i>`).join("");
    return `<button class="calendar-day ${day.getMonth() === monthIndex ? "" : "outside-month"} ${key === state.calendarSelectedDate ? "selected" : ""}" data-action="calendar-select-date" data-date="${key}" aria-label="${esc(new Intl.DateTimeFormat("es-PY", { dateStyle: "full" }).format(day))}, ${markers ? "con eventos" : "sin eventos"}"><span>${day.getDate()}</span><span class="calendar-markers">${markers}</span></button>`;
  }).join("");
  const monthLabel = new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric" }).format(month);
  const title = monthLabel.charAt(0).toLocaleUpperCase("es-PY") + monthLabel.slice(1);
  return `<section class="home-calendar"><div class="section-heading"><h2>Calendario</h2><button class="text-button" data-page="calendario">Ver agenda completa ${icon("ir", 14)}</button></div><div class="calendar-panel calendar-home-panel"><div class="calendar-toolbar"><button class="icon-button" data-action="calendar-previous" aria-label="Mes anterior">${icon("anterior", 17)}</button><h2>${esc(title)}</h2><button class="icon-button" data-action="calendar-next" aria-label="Mes siguiente">${icon("siguiente", 17)}</button><button class="secondary-button compact calendar-today" data-action="calendar-today">Hoy</button></div><div class="calendar-weekdays"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div><div class="calendar-grid">${cells}</div><div class="calendar-legend"><span><i class="clase"></i>Clases</span><span><i class="examen"></i>Exámenes</span><span><i class="actividad"></i>Actividades Robótica SIL</span></div></div></section>`;
}

function calendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function focusCalendarDate(dateKey: string): void {
  const date = new Date(`${dateKey}T12:00:00`);
  state.calendarMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  state.calendarSelectedDate = calendarDateKey(date);
}

function dateAtTime(dateKey: string, time: string): Date {
  return new Date(`${dateKey}T${time || "00:00"}:00`);
}

function timeText(date: Date): string {
  return new Intl.DateTimeFormat("es-PY", { hour: "2-digit", minute: "2-digit" }).format(date);
}

function calendarItemHtml(item: CalendarItem): string {
  const time = item.endsAt ? `${timeText(item.startsAt)}–${timeText(item.endsAt)}` : timeText(item.startsAt);
  const typeLabel = item.kind === "clase" ? "Clase" : item.kind === "examen" ? "Examen" : "Actividad Robótica SIL";
  const canDelete = !isStudentPreview() && (item.source === "club" ? canManageClub() : !isAdminInterface());
  const action = canDelete
    ? `<button class="icon-button calendar-delete" data-action="delete-calendar-entry" data-id="${esc(item.id)}" data-source="${item.source}" aria-label="Eliminar ${item.kind === "clase" ? "horario semanal" : typeLabel.toLowerCase()}" title="Eliminar">${icon("eliminar", 15)}</button>`
    : "";
  return `<article class="calendar-event ${item.kind}"><span class="calendar-event-mark"></span><div class="calendar-event-copy"><div class="calendar-event-top"><span>${typeLabel}</span><time>${time}</time></div><h3>${esc(item.title)}</h3><p>${esc(item.detail)}</p></div>${action}</article>`;
}

async function renderCalendar(): Promise<string> {
  if (!isAuthorized()) return pendingNotice();
  const month = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth(), 1);
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const monthStart = new Date(year, monthIndex, 1);
  const nextMonth = new Date(year, monthIndex + 1, 1);
  const monthStartKey = calendarDateKey(monthStart);
  const monthEndKey = calendarDateKey(new Date(year, monthIndex + 1, 0));
  const startTimestamp = Timestamp.fromDate(monthStart);
  const endTimestamp = Timestamp.fromDate(nextMonth);
  const [personalSnapshot, activitySnapshot] = await Promise.all([
    getDocs(query(collection(db, "usuarios", state.user!.uid, "calendario"), limit(100))),
    getDocs(query(collection(db, "actividadesClub"), where("fechaInicio", ">=", startTimestamp), where("fechaInicio", "<", endTimestamp), orderBy("fechaInicio", "asc"), limit(100))),
  ]);
  const entries = personalSnapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  const itemsByDate = new Map<string, CalendarItem[]>();
  const addItem = (key: string, item: CalendarItem) => {
    const items = itemsByDate.get(key) || [];
    items.push(item);
    itemsByDate.set(key, items);
  };

  entries.filter((entry) => entry.tipo === "examen" && entry.fechaHora instanceof Timestamp).forEach((entry) => {
    const startsAt = (entry.fechaHora as Timestamp).toDate();
    addItem(calendarDateKey(startsAt), {
      id: String(entry.id), kind: "examen", title: String(entry.titulo || entry.materia || "Examen"),
      detail: [entry.materia, entry.lugar, entry.notas].filter(Boolean).join(" · "), startsAt, source: "personal",
    });
  });

  activitySnapshot.docs.forEach((snapshot) => {
    const activity = snapshot.data();
    if (!(activity.fechaInicio instanceof Timestamp)) return;
    const startsAt = activity.fechaInicio.toDate();
    const endsAt = activity.fechaFin instanceof Timestamp ? activity.fechaFin.toDate() : undefined;
    addItem(calendarDateKey(startsAt), {
      id: snapshot.id, kind: "actividad", title: String(activity.titulo || "Actividad del club"),
      detail: [activity.categoria, activity.lugar, activity.descripcion].filter(Boolean).join(" · "), startsAt, endsAt, source: "club",
    });
  });

  const gridStart = new Date(year, monthIndex, 1 - ((monthStart.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + index));
  entries.filter((entry) => entry.tipo === "clase").forEach((entry) => {
    if (!(entry.desde instanceof Timestamp) || !(entry.hasta instanceof Timestamp)) return;
    const from = calendarDateKey(entry.desde.toDate());
    const through = calendarDateKey(entry.hasta.toDate());
    const weekdays = Array.isArray(entry.diasSemana) ? entry.diasSemana : [];
    days.forEach((day) => {
      const key = calendarDateKey(day);
      const weekday = day.getDay() || 7;
      if (key < from || key > through || !weekdays.includes(weekday)) return;
      addItem(key, {
        id: String(entry.id), kind: "clase", title: String(entry.materia || "Clase"),
        detail: ["Horario semanal", entry.aula].filter(Boolean).join(" · "),
        startsAt: dateAtTime(key, String(entry.horaInicio || "00:00")),
        endsAt: dateAtTime(key, String(entry.horaFin || entry.horaInicio || "00:00")), source: "personal",
      });
    });
  });

  itemsByDate.forEach((items) => items.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()));
  if (state.calendarSelectedDate < monthStartKey || state.calendarSelectedDate > monthEndKey) {
    state.calendarSelectedDate = monthStartKey;
  }
  const selectedDate = new Date(`${state.calendarSelectedDate}T12:00:00`);
  const dayLabel = new Intl.DateTimeFormat("es-PY", { weekday: "long", day: "numeric", month: "long" }).format(selectedDate);
  const monthLabel = new Intl.DateTimeFormat("es-PY", { month: "long", year: "numeric" }).format(month);
  const title = monthLabel.charAt(0).toLocaleUpperCase("es-PY") + monthLabel.slice(1);
  const isStudent = !canManageClub();
  const actions = isStudent
    ? `<button class="secondary-button compact" data-action="new-calendar-class">${icon("sumar", 15)} Agregar clase</button><button class="primary-button compact" data-action="new-calendar-exam">${icon("sumar", 15)} Agregar examen</button>`
    : canManageClub()
      ? `<button class="primary-button compact" data-action="new-club-activity">${icon("sumar", 15)} Nueva actividad</button>`
      : "";
  const cells = days.map((day) => {
    const key = calendarDateKey(day);
    const dateItems = itemsByDate.get(key) || [];
    const activeMonth = day.getMonth() === monthIndex;
    const markers = dateItems.slice(0, 3).map((item) => `<i class="${item.kind}" aria-hidden="true"></i>`).join("");
    return `<button class="calendar-day ${activeMonth ? "" : "outside-month"} ${key === state.calendarSelectedDate ? "selected" : ""}" data-action="calendar-select-date" data-date="${key}" aria-label="${esc(new Intl.DateTimeFormat("es-PY", { dateStyle: "full" }).format(day))}, ${dateItems.length} eventos"><span>${day.getDate()}</span><span class="calendar-markers">${markers}</span></button>`;
  }).join("");
  const dayItems = itemsByDate.get(state.calendarSelectedDate) || [];
  return `${pageHeading("Calendario", "Tus clases, exámenes y actividades del Club de Robótica.", actions)}
    <section class="calendar-panel"><div class="calendar-toolbar"><button class="icon-button" data-action="calendar-previous" aria-label="Mes anterior" title="Mes anterior">${icon("anterior", 17)}</button><h2>${esc(title)}</h2><button class="icon-button" data-action="calendar-next" aria-label="Mes siguiente" title="Mes siguiente">${icon("siguiente", 17)}</button><button class="secondary-button compact calendar-today" data-action="calendar-today">Hoy</button></div>
      <div class="calendar-weekdays"><span>Lun</span><span>Mar</span><span>Mié</span><span>Jue</span><span>Vie</span><span>Sáb</span><span>Dom</span></div><div class="calendar-grid">${cells}</div>
      <div class="calendar-legend"><span><i class="clase"></i>Clases</span><span><i class="examen"></i>Exámenes</span><span><i class="actividad"></i>Actividades Robótica SIL</span></div>
    </section>
    <section class="calendar-agenda"><div class="section-heading"><h2>${esc(dayLabel)}</h2><span class="section-count">${dayItems.length}</span></div>${dayItems.length ? `<div class="calendar-event-list">${dayItems.map(calendarItemHtml).join("")}</div>` : emptyInline("No hay eventos para este día.")}</section>`;
}

function noticeCardWithAdminAction(id: string, data: DocumentData): string {
  const card = noticeCard(id, data, true);
  if (!canManageClub()) return card;
  return card.replace("</article>", `<div class="card-actions"><button class="danger-button compact" data-action="delete-notice" data-id="${esc(id)}">${icon("eliminar", 14)} Eliminar aviso</button></div></article>`);
}

function noticeCard(id: string, data: DocumentData, reactions: boolean): string {
  const important = data.prioridad === "Importante";
  return `<article class="notice-card ${important ? "notice-important" : ""}" ${important ? 'aria-label="Aviso importante"' : ""}><div class="notice-card-header"><span class="priority-dot ${String(data.prioridad).toLowerCase()}"></span><span class="priority-label">${important ? "IMPORTANTE · " : ""}${esc(data.prioridad || "Normal")}</span><time>${dateText(data.fechaCreacion, true)}</time></div><h3>${esc(data.titulo || "Aviso")}</h3><p>${esc(data.mensaje || "")}</p><div class="notice-author">Publicado por ${esc(data.autorNombre || "Administración")}</div>${reactions && isAuthorized() ? `<div class="reaction-row">${reactionButton(id, "me_gusta", "👍")}${reactionButton(id, "me_encanta", "❤️")}${reactionButton(id, "celebrar", "🎉")}${reactionButton(id, "apoyar", "👏")}</div>` : ""}</article>`;
}

function reactionButton(noticeId: string, reaction: string, symbol: string): string {
  return `<button class="reaction-button" data-action="react" data-id="${esc(noticeId)}" data-reaction="${reaction}" aria-label="Reaccionar ${reaction}">${symbol}</button>`;
}

function personalNoticeCard(data: Record<string, any>): string {
  return `<article class="notice-card personal-notice"><div class="notice-card-header"><span class="priority-label">PERSONAL</span><time>${dateText(data.fechaCreacion, true)}</time></div><h3>${esc(data.titulo || "Notificación")}</h3><p>${esc(data.mensaje || "")}</p></article>`;
}

async function renderLoans(): Promise<string> {
  const snapshot = isAdminInterface()
    ? await getDocs(query(collection(db, "reservas"), orderBy("fechaCreacion", "desc"), limit(100)))
    : await getDocs(query(collection(db, "reservas"), where("solicitanteUid", "==", state.user!.uid), limit(60)));
  const loans: Array<Record<string, any>> = snapshot.docs.map((item) => ({ id: item.id, ref: item.ref, ...item.data() }));
  loans.sort((a, b) => (b.fechaCreacion?.toMillis?.() ?? 0) - (a.fechaCreacion?.toMillis?.() ?? 0));
  const form = !isAdminInterface() && isAuthorized() ? `<form class="inline-form loan-form" data-form="loan"><h2>Solicitar préstamo</h2><div class="field-row"><label>Artículo<select name="recursoId" required><option value="">Cargando inventario…</option></select></label><label>Cantidad<input name="cantidad" type="number" min="1" value="1" required /></label></div><label>Propósito<input name="motivo" maxlength="300" required placeholder="¿Para qué necesitas el artículo?" /></label><div class="field-row"><label>Inicio<input name="inicio" type="date" required /></label><label>Devolución prevista<input name="devolucion" type="date" required /></label></div><button class="primary-button" type="submit">Enviar solicitud</button></form>` : "";
  if (form) void loadInventoryOptions();
  return `${pageHeading(isAdminInterface() ? "Préstamos" : "Mis préstamos", isAdminInterface() ? "Solicitudes, artículos prestados y devoluciones." : "Controla artículos a tu cargo y fechas de devolución.")}
    ${form}${loans.length ? `<div class="loan-list">${loans.map((loan) => loanCard(loan)).join("")}</div>` : emptyPanel("Sin préstamos", isAdminInterface() ? "Las solicitudes y préstamos aparecerán aquí." : "Cuando solicites un artículo, podrás seguirlo desde esta pantalla.")}`;
}

function loanCard(loan: Record<string, any>): string {
  const status = String(loan.estado || "Pendiente");
  const statusClass = status === "Aprobada" ? "success" : status === "Pendiente" ? "warning" : "muted";
  let actions = "";
  if (isAdminInterface() && status === "Pendiente") actions = `<div class="card-actions"><button class="secondary-button compact" data-action="loan-reject" data-id="${esc(loan.id)}">Rechazar</button><button class="primary-button compact" data-action="loan-approve" data-id="${esc(loan.id)}">Aprobar</button></div>`;
  const requestPending = loan.estadoSolicitud === "Pendiente";
  const requestKind = loan.accionSolicitada === "Devolucion" ? "devolución" : "prórroga";
  if (isAdminInterface() && status === "Aprobada" && requestPending) actions = `<div class="notice-box info loan-request-note">Solicitud de ${requestKind}${loan.accionSolicitada === "Prorroga" ? ` hasta ${dateText(loan.fechaDevolucionPropuesta)}` : ""} · ${esc(loan.solicitanteNombre || "Estudiante")}</div><div class="card-actions"><button class="secondary-button compact" data-action="loan-request-reject" data-id="${esc(loan.id)}">Rechazar solicitud</button><button class="primary-button compact" data-action="loan-request-approve" data-id="${esc(loan.id)}">${loan.accionSolicitada === "Devolucion" ? "Registrar devolución" : "Aprobar prórroga"}</button></div>`;
  else if (isAdminInterface() && status === "Aprobada") actions = `<div class="card-actions"><button class="secondary-button compact" data-action="loan-return" data-id="${esc(loan.id)}">Registrar devolución</button></div>`;
  if (!isAdminInterface() && status === "Aprobada") actions = `<div class="card-actions"><button class="secondary-button compact" data-action="loan-detail" data-id="${esc(loan.id)}">Ver detalles y acciones</button>${requestPending ? `<span class="state-pill warning">Solicitud de ${requestKind} pendiente</span>` : loan.estadoSolicitud ? `<span class="state-pill ${loan.estadoSolicitud === "Aprobada" ? "success" : "muted"}">Última solicitud ${esc(loan.estadoSolicitud.toLowerCase())}</span>` : ""}</div>`;
  return `<article class="loan-card"><div class="loan-icon">${icon("prestamos", 21)}</div><div class="loan-copy"><div class="loan-title-row"><h3>${esc(loan.recursoNombre || "Artículo")}</h3><span class="state-pill ${statusClass}">${esc(status)}</span></div><p>${esc(loan.solicitanteNombre || "Solicitante")} · ${Number(loan.cantidadSolicitada || 1)} unidad(es)</p><p class="loan-purpose">${esc(loan.motivo || "Sin propósito indicado")}</p><div class="loan-dates"><span>${icon("fecha", 14)} Inicio: ${dateText(loan.fechaInicioUso)}</span><span>${icon("fecha", 14)} Devolución: ${dateText(loan.fechaDevolucion)}</span></div>${actions}</div></article>`;
}

async function openLoanDetail(id: string): Promise<void> {
  try {
    const snapshot = await getDoc(doc(db, "reservas", id));
    if (!snapshot.exists() || snapshot.get("solicitanteUid") !== state.user?.uid) {
      notify("No se pudo abrir este préstamo.", "error");
      return;
    }
    const loan = snapshot.data();
    const currentDue = loan.fechaDevolucion instanceof Timestamp ? loan.fechaDevolucion.toDate() : new Date();
    const minDate = new Date(currentDue);
    minDate.setDate(minDate.getDate() + 1);
    const minDateValue = `${minDate.getFullYear()}-${String(minDate.getMonth() + 1).padStart(2, "0")}-${String(minDate.getDate()).padStart(2, "0")}`;
    const pending = loan.estadoSolicitud === "Pendiente";
    const requestStatus = loan.estadoSolicitud
      ? `<div class="notice-box ${pending ? "warning" : loan.estadoSolicitud === "Aprobada" ? "info" : ""}">Solicitud de ${loan.accionSolicitada === "Devolucion" ? "devolución" : "prórroga"}: ${esc(loan.estadoSolicitud)}${loan.fechaDevolucionPropuesta ? ` · Fecha propuesta: ${dateText(loan.fechaDevolucionPropuesta)}` : ""}${loan.resueltaPorNombre ? ` · Revisó: ${esc(loan.resueltaPorNombre)}` : ""}</div>`
      : "";
    const dialog = document.createElement("dialog");
    dialog.className = "detail-dialog form-dialog";
    dialog.innerHTML = `<div class="dialog-form"><div class="dialog-head"><div><p class="eyebrow">MIS PRÉSTAMOS</p><h2>${esc(loan.recursoNombre || "Artículo")}</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><div class="loan-detail-facts"><p><strong>Estado:</strong> ${esc(loan.estado || "Pendiente")}</p><p><strong>Cantidad:</strong> ${Number(loan.cantidadSolicitada || 1)}</p><p><strong>Propósito:</strong> ${esc(loan.motivo || "Sin indicar")}</p><p><strong>Inicio:</strong> ${dateText(loan.fechaInicioUso)}</p><p><strong>Devolución prevista:</strong> ${dateText(loan.fechaDevolucion)}</p>${loan.aprobadoPorNombre ? `<p><strong>Administración responsable:</strong> ${esc(loan.aprobadoPorNombre)}</p>` : ""}</div>${requestStatus}${loan.estado === "Aprobada" && !pending ? `<div class="loan-request-actions"><button type="button" class="secondary-button" data-action="loan-request-return" data-id="${esc(id)}">Solicitar devolución</button><form class="inline-form" data-form="loan-extension" data-id="${esc(id)}"><label>Nueva fecha propuesta<input type="date" name="fechaPropuesta" min="${minDateValue}" required /></label><button type="submit" class="primary-button">Proponer prórroga</button></form></div>` : pending ? `<p class="empty-inline">Espera a que un administrador resuelva tu solicitud antes de enviar otra.</p>` : ""}</div>`;
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
      if (button?.dataset.action === "close-dialog") dialog.close();
      else if (button?.dataset.action === "loan-request-return") {
        void requestLoanChange(button.dataset.id || "", "Devolucion", null, button);
      }
    });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
  } catch (error) {
    notify(errorMessage(error, "No se pudo cargar el préstamo."), "error");
  }
}

async function submitLoanExtension(form: HTMLFormElement): Promise<void> {
  if (!state.user || isAdmin()) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  if (!button) return;
  const dateValue = String(new FormData(form).get("fechaPropuesta") || "");
  const proposedDate = new Date(`${dateValue}T12:00:00`);
  if (!dateValue || Number.isNaN(+proposedDate)) {
    notify("Selecciona una fecha válida.", "error");
    return;
  }
  await requestLoanChange(form.dataset.id || "", "Prorroga", Timestamp.fromDate(proposedDate), button);
}

async function requestLoanChange(id: string, action: "Devolucion" | "Prorroga", proposedDate: Timestamp | null, button: HTMLButtonElement): Promise<void> {
  if (!state.user || !state.profile || isAdmin() || !id) return;
  setBusy(button, true);
  try {
    const loanRef = doc(db, "reservas", id);
    const loanSnapshot = await getDoc(loanRef);
    if (!loanSnapshot.exists() || loanSnapshot.get("solicitanteUid") !== state.user.uid || loanSnapshot.get("estado") !== "Aprobada") {
      throw new Error("Este préstamo ya no está activo.");
    }
    if (loanSnapshot.get("estadoSolicitud") === "Pendiente") throw new Error("Ya tienes una solicitud pendiente para este préstamo.");
    const currentDue = loanSnapshot.get("fechaDevolucion");
    if (action === "Prorroga" && (!(currentDue instanceof Timestamp) || !proposedDate || proposedDate.toMillis() <= currentDue.toMillis())) {
      throw new Error("La nueva fecha debe ser posterior a la devolución prevista.");
    }

    let adminIds: string[] = [];
    const approvingAdminUid = String(loanSnapshot.get("aprobadoPorUid") || "");
    if (approvingAdminUid) {
      const admin = await getDoc(doc(db, "usuarios", approvingAdminUid));
      if (admin.exists() && admin.get("rol") === "admin") adminIds = [approvingAdminUid];
    }
    if (!adminIds.length) {
      const admins = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "admin"), limit(100)));
      adminIds = admins.docs.map((admin) => admin.id);
    }
    if (!adminIds.length) throw new Error("No se encontró una cuenta administradora para recibir la solicitud.");

    const batch = writeBatch(db);
    batch.update(loanRef, {
      accionSolicitada: action,
      fechaDevolucionPropuesta: proposedDate,
      motivoSolicitud: "",
      estadoSolicitud: "Pendiente",
    });
    adminIds.forEach((adminUid) => {
      batch.set(doc(collection(db, "usuarios", adminUid, "notificaciones")), {
        proyectoId: "",
        tipo: "prestamo",
        reservaId: id,
        titulo: action === "Devolucion" ? "Solicitud de devolución" : "Solicitud de prórroga",
        mensaje: action === "Devolucion"
          ? `${fullName()} solicita devolver ${loanSnapshot.get("recursoNombre") || "el artículo"}.`
          : `${fullName()} solicita extender el préstamo de ${loanSnapshot.get("recursoNombre") || "el artículo"} hasta ${dateText(proposedDate)}.`,
        prioridad: "Normal",
        emisorUid: state.user.uid,
        fechaCreacion: serverTimestamp(),
        leida: false,
      });
    });
    await batch.commit();
    button.closest("dialog")?.close();
    notify(action === "Devolucion" ? "Solicitud de devolución enviada al administrador." : "Propuesta de prórroga enviada al administrador.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo enviar la solicitud."), "error");
  }
}

async function loadInventoryOptions(): Promise<void> {
  const select = document.querySelector<HTMLSelectElement>('select[name="recursoId"]');
  if (!select) return;
  try {
    const snapshot = await getDocs(query(collection(db, "inventario"), where("estado", "==", "Disponible"), limit(60)));
    const available = snapshot.docs.filter((item) => (item.get("cantidad") || 0) > 0);
    select.innerHTML = `<option value="">Seleccionar artículo</option>${available.map((item) => `<option value="${esc(item.id)}" data-name="${esc(item.get("nombre"))}" data-stock="${Number(item.get("cantidad") || 0)}">${esc(item.get("nombre"))} · ${Number(item.get("cantidad") || 0)} disponibles</option>`).join("")}`;
    if (!available.length) select.innerHTML = `<option value="">No hay artículos disponibles</option>`;
  } catch (error) { select.innerHTML = `<option value="">${esc(errorMessage(error, "No se pudo cargar el inventario"))}</option>`; }
}

async function renderInventory(): Promise<string> {
  const snapshot = await getDocs(query(collection(db, "inventario"), orderBy("nombre"), limit(100)));
  const items: Array<Record<string, any>> = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
  return `${pageHeading("Inventario", "Artículos, disponibilidad y cantidades.", `<button class="primary-button compact" data-action="new-item">${icon("sumar")} Nuevo artículo</button>`)}
    ${items.length ? `<div class="table-wrap"><table><thead><tr><th>Artículo</th><th>Categoría</th><th>Disponibles</th><th>Ubicación</th><th>Estado</th></tr></thead><tbody>${items.map((item) => `<tr><td><strong>${esc(item.nombre)}</strong><small>${esc(item.descripcion || "")}</small></td><td>${esc(item.categoria || "Sin categoría")}</td><td>${Number(item.cantidad || 0)}</td><td>${esc(item.ubicacion || "—")}</td><td><span class="state-pill ${item.estado === "Disponible" ? "success" : "muted"}">${esc(item.estado || "—")}</span></td></tr>`).join("")}</tbody></table></div>` : emptyPanel("Inventario vacío", "Agrega el primer artículo del club.")}`;
}

async function renderStudents(): Promise<string> {
  const snapshot = await getDocs(query(collection(db, "usuarios"), where("rol", "in", ["estudiante", "moderador", "admin"]), limit(100)));
  const students: Array<Record<string, any>> = snapshot.docs.map((item) => ({ uid: item.id, ...item.data() }));
  students.sort((a, b) => String(a.nombreCompleto || a.nombre || "").localeCompare(String(b.nombreCompleto || b.nombre || ""), "es"));
  return `${pageHeading("Personas y roles", "Autoriza cuentas y asigna roles de gestión del club.", `<label class="search-field">${icon("buscar")}<input id="student-search" placeholder="Buscar persona" /></label>`)}
    <div class="table-wrap"><table><thead><tr><th>Persona</th><th>Área de interés</th><th>Curso o grado</th><th>Acceso</th><th>Rol</th><th></th></tr></thead><tbody id="student-rows">${students.map((student) => studentRow(student)).join("")}</tbody></table></div>`;
}

function studentRow(student: Record<string, any>): string {
  const role = ["estudiante", "moderador", "admin"].includes(student.rol) ? student.rol : "estudiante";
  const self = student.uid === state.user?.uid;
  const roleOptions = [["estudiante", "Estudiante"], ["moderador", "Moderador"], ["admin", "Administrador"]];
  const roleSelect = `<select class="role-select" data-action="change-user-role" data-id="${esc(student.uid)}" data-role="${role}" data-authorized="${Boolean(student.autorizado)}" data-name="${esc(student.nombreCompleto || student.nombre || "esta persona")}" ${self ? "disabled title=\"No puedes cambiar tu propio rol desde aquí\"" : ""}>${roleOptions.map(([value, label]) => `<option value="${value}" ${role === value ? "selected" : ""}>${label}</option>`).join("")}</select>`;
  const accessAction = role !== "admin"
    ? `<button class="secondary-button compact" data-action="toggle-student" data-id="${esc(student.uid)}" data-authorized="${Boolean(student.autorizado)}" ${self ? "disabled" : ""}>${student.autorizado ? "Bloquear" : "Autorizar"}</button>`
    : `<span class="state-pill success">Administrador</span>`;
  return `<tr data-student-row><td><strong>${esc(student.nombreCompleto || `${student.nombre || ""} ${student.apellido || ""}`)}</strong><small>${esc(student.correoInstitucional || "")}</small></td><td>${esc(student.carrera || "—")}</td><td>${esc(student.semestre || "—")}</td><td><span class="state-pill ${student.autorizado ? "success" : "warning"}">${student.autorizado ? "Autorizado" : "Pendiente"}</span></td><td>${roleSelect}</td><td>${accessAction}</td></tr>`;
}

function emptyPanel(title: string, message: string): string {
  return `<section class="empty-state"><span class="empty-mark">${icon("inicio", 24)}</span><h2>${title}</h2><p>${message}</p></section>`;
}

root.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLElement>("[data-page], [data-action]");
  if (!button) return;
  const page = button.dataset.page as Page | undefined;
  if (page) {
    event.preventDefault();
    navigatePage(page);
    return;
  }
  const action = button.dataset.action;
  if (action === "toggle-menu" || action === "close-menu") {
    if (action === "toggle-menu" && window.matchMedia("(min-width: 681px)").matches) {
      state.sidebarCollapsed = !state.sidebarCollapsed;
    } else {
      state.menuOpen = action === "toggle-menu" ? !state.menuOpen : false;
    }
    render();
  } else if (action === "toggle-password") {
    const input = button.parentElement?.querySelector<HTMLInputElement>("input");
    if (input) {
      input.type = input.type === "password" ? "text" : "password";
      button.innerHTML = input.type === "password" ? icon("ver", 18) : icon("ocultar", 18);
      button.setAttribute("aria-label", input.type === "password" ? "Mostrar contraseña" : "Ocultar contraseña");
      button.setAttribute("title", input.type === "password" ? "Mostrar contraseña" : "Ocultar contraseña");
    }
  } else if (action === "auth-toggle") {
    state.authMode = state.authMode === "login" ? "register" : "login";
    state.authMessage = "";
    render();
  } else if (action === "forgot-password") {
    const email = document.querySelector<HTMLInputElement>('[data-form="auth"] [name="email"]')?.value.trim();
    if (!email) {
      state.authMessage = "Escribe tu correo y vuelve a pulsar «Olvidé mi contraseña».";
      render();
      return;
    }
    void sendPasswordResetEmail(auth, email).then(() => {
      state.authMessage = "Si el correo corresponde a una cuenta, recibirás instrucciones para cambiar la contraseña. Revisa también Spam.";
      render();
    }).catch((error) => {
      state.authMessage = errorMessage(error, "No se pudo enviar el correo de recuperación.");
      render();
    });
  } else if (action === "logout") {
    void signOut(auth);
  } else if (action === "refresh") {
    render();
  } else if (action === "install") {
    void installApp();
  } else if (action === "toggle-student-preview" && isAdmin()) {
    state.studentPreview = !state.studentPreview;
    navigatePage("inicio");
  } else if (action === "toggle-admin-layout" && isAdmin()) {
    state.desktopPreview = !state.desktopPreview;
    localStorage.setItem("cdr-admin-desktop-preview", String(state.desktopPreview));
    render();
  } else if (action === "reset-club-logo" && isAdmin()) {
    void resetClubLogo();
  } else if (action === "toggle-access") {
    void toggleAccess(button as HTMLButtonElement);
  } else if (action === "register-admin-entry" && isAdminInterface()) {
    void registerAdminEntry(button as HTMLButtonElement);
  } else if (action === "complete-task") {
    void completeTask(button.dataset.path!, button as HTMLButtonElement);
  } else if (action === "join-project") {
    void joinProject(button.dataset.id!, button as HTMLButtonElement);
  } else if (action === "enroll-course") {
    void enrollCourse(button.dataset.id!, button as HTMLButtonElement);
  } else if (action === "leave-course") {
    void leaveCourse(button.dataset.id!, button as HTMLButtonElement);
  } else if (action === "toggle-course-state" && isAdminInterface()) {
    void toggleCourseState(button.dataset.id!, button.dataset.state!, button as HTMLButtonElement);
  } else if (action === "course-registrations" && isAdminInterface()) {
    void openCourseRegistrations(button.dataset.id!, button as HTMLButtonElement);
  } else if (action === "react") {
    void reactToNotice(button.dataset.id!, button.dataset.reaction!, button as HTMLButtonElement);
  } else if (action === "loan-approve" || action === "loan-reject" || action === "loan-return") {
    void resolveLoan(button.dataset.id!, action, button as HTMLButtonElement);
  } else if (action === "loan-detail") {
    void openLoanDetail(button.dataset.id!);
  } else if (action === "loan-request-return") {
    void requestLoanChange(button.dataset.id!, "Devolucion", null, button as HTMLButtonElement);
  } else if (action === "loan-request-approve" || action === "loan-request-reject") {
    void resolveLoanRequest(button.dataset.id!, action === "loan-request-approve", button as HTMLButtonElement);
  } else if (action === "new-notice" && canManageClub()) {
    openDialog("notice-dialog");
  } else if (action === "delete-notice" && canManageClub()) {
    void deleteNotice(button.dataset.id!, button as HTMLButtonElement);
  } else if (action === "calendar-previous" || action === "calendar-next") {
    const delta = action === "calendar-previous" ? -1 : 1;
    state.calendarMonth = new Date(state.calendarMonth.getFullYear(), state.calendarMonth.getMonth() + delta, 1);
    state.calendarSelectedDate = calendarDateKey(state.calendarMonth);
    void loadPage();
  } else if (action === "calendar-today") {
    const today = new Date();
    state.calendarMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    state.calendarSelectedDate = calendarDateKey(today);
    void loadPage();
  } else if (action === "calendar-select-date") {
    focusCalendarDate(button.dataset.date!);
    void loadPage();
  } else if (action === "new-calendar-class") {
    if (!isAdmin() && !isStudentPreview()) openDialog("calendar-class-dialog");
  } else if (action === "new-calendar-exam") {
    if (!isAdmin() && !isStudentPreview()) openDialog("calendar-exam-dialog");
  } else if (action === "new-club-activity") {
    if (canManageClub()) openDialog("club-activity-dialog");
  } else if (action === "delete-calendar-entry") {
    void deleteCalendarEntry(button.dataset.id!, button.dataset.source!, button as HTMLButtonElement);
  } else if (action === "new-item") {
    openDialog("item-dialog");
  } else if (action === "toggle-student") {
    void toggleStudentAccess(button.dataset.id!, button.dataset.authorized !== "true", button as HTMLButtonElement);
  } else if (action === "new-project") {
    void openProjectDialog();
  } else if (action === "new-course" && isAdminInterface()) {
    openDialog("course-dialog");
  } else if (action === "project-detail") {
    void showProject(button.dataset.id!);
  } else if (action === "edit-project-responsible" && !isStudentPreview()) {
    void openProjectResponsibleDialog(button.dataset.id!);
  } else if (action === "delete-project" && !isStudentPreview()) {
    void deleteProject(button.dataset.id!, button as HTMLButtonElement);
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target as HTMLFormElement;
  const type = form.dataset.form;
  if (!type) return;
  event.preventDefault();
  if (isStudentPreview()) {
    if (type === "loan") simulateStudentLoan(form);
    else if (type === "loan-extension") simulateLoanExtension(form);
    else notify("Esta acción no está disponible en la prueba de estudiante.", "error");
    return;
  }
  if (type === "auth") void submitAuth(form);
  else if (type === "profile") void submitProfile(form);
  else if (type === "loan") void submitLoan(form);
  else if (type === "loan-extension") void submitLoanExtension(form);
  else if (type === "notice") void submitNotice(form);
  else if (type === "feedback") void submitFeedback(form);
  else if (type === "feedback-response") void submitFeedbackResponse(form);
  else if (type === "calendar-class") void submitCalendarClass(form);
  else if (type === "calendar-exam") void submitCalendarExam(form);
  else if (type === "club-activity") void submitClubActivity(form);
  else if (type === "item") void submitItem(form);
  else if (type === "project") void submitProject(form);
  else if (type === "course") void submitCourse(form);
  else if (type === "project-task") void submitProjectTask(form);
  else if (type === "task-assignment") void submitTaskAssignment(form);
  else if (type === "project-responsible") void submitProjectResponsible(form);
});

document.addEventListener("click", (event) => {
  if (!isStudentPreview()) return;
  const target = event.target as HTMLElement;
  const button = target.closest<HTMLElement>("[data-action]");
  const action = button?.dataset.action;
  if (!action || ["close-dialog", "close-menu", "toggle-menu", "toggle-student-preview", "toggle-admin-layout", "refresh", "install", "logout", "calendar-previous", "calendar-next", "calendar-today", "calendar-select-date"].includes(action)) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  handleStudentSandboxAction(action, button!);
}, true);

function handleStudentSandboxAction(action: string, button: HTMLElement): void {
  const demo = state.studentSandbox;
  if (action === "reset-student-preview") {
    state.studentSandbox = createStudentSandbox();
    void loadPage();
    notify("Prueba reiniciada.");
  } else if (action === "preview-register-entry") {
    demo.inside = true;
    demo.entryAt = new Date();
    void loadPage();
    notify("Entrada simulada registrada. No se guardó en Firebase.");
  } else if (action === "preview-complete-task") {
    demo.taskDone = true;
    void loadPage();
    notify("Tarea marcada como completada en la prueba.");
  } else if (action === "preview-join-project") {
    demo.joinRequested = true;
    void loadPage();
    notify("Solicitud de ingreso simulada.");
  } else if (action === "preview-course-enroll") {
    const courseId = button.dataset.id || "";
    demo.courseEnrollments = demo.courseEnrollments.includes(courseId)
      ? demo.courseEnrollments.filter((id) => id !== courseId)
      : [...demo.courseEnrollments, courseId];
    void loadPage();
    notify(demo.courseEnrollments.includes(courseId) ? "Inscripción simulada." : "Inscripción cancelada en la prueba.");
  } else if (action === "preview-react") {
    const noticeId = button.dataset.notice || "";
    const reaction = button.dataset.reaction || "";
    demo.reactions[noticeId] = demo.reactions[noticeId] === reaction ? "" : reaction;
    void loadPage();
    notify("Reacción actualizada en la prueba.");
  } else if (action === "preview-cancel-loan") {
    const index = Number(button.dataset.index);
    if (Number.isInteger(index) && index >= 0 && index < demo.loans.length) {
      demo.loans[index].status = "Cancelada";
      void loadPage();
      notify("Solicitud cancelada en la prueba.");
    }
  } else if (action === "preview-loan-detail") {
    openPreviewLoanDetail(Number(button.dataset.index));
  } else if (action === "preview-request-return") {
    const loan = demo.loans[Number(button.dataset.index)];
    if (loan?.status === "Aprobada" && loan.requestStatus !== "Pendiente") {
      loan.requestType = "Devolucion";
      loan.requestStatus = "Pendiente";
      void loadPage();
      notify("Solicitud de devolución simulada.");
    }
  } else if (action === "preview-project-detail") {
    const dialog = document.createElement("dialog");
    dialog.className = "detail-dialog";
    dialog.innerHTML = `<div class="dialog-head"><div><p class="eyebrow">PROYECTO DE PRUEBA</p><h2>Robot móvil</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><p>Prototipo autónomo para navegación en interiores.</p><section class="project-progress project-detail-progress"><div><span>Avance del proyecto</span><strong>${demo.taskDone ? "67%" : "33%"}</strong></div><progress max="100" value="${demo.taskDone ? 67 : 33}"></progress><small>${demo.taskDone ? "2 de 3" : "1 de 3"} tareas completadas</small></section><h3>Tareas</h3><div class="dialog-task-list"><div><span>Probar sensores ultrasónicos</span><span>${demo.taskDone ? "Completada" : "Pendiente"}</span></div><div><span>Documentar el montaje</span><span>Pendiente</span></div></div>`;
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
  }
}

function openPreviewLoanDetail(index: number): void {
  const loan = state.studentSandbox.loans[index];
  if (!loan) return;
  const pending = loan.requestStatus === "Pendiente";
  const due = new Date(`${loan.due}T12:00:00`);
  due.setDate(due.getDate() + 1);
  const minDate = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, "0")}-${String(due.getDate()).padStart(2, "0")}`;
  const dialog = document.createElement("dialog");
  dialog.className = "detail-dialog form-dialog";
  dialog.innerHTML = `<div class="dialog-form"><div class="dialog-head"><div><p class="eyebrow">PRÉSTAMO DE PRUEBA</p><h2>${esc(loan.item)}</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><div class="loan-detail-facts"><p><strong>Estado:</strong> ${esc(loan.status)}</p><p><strong>Cantidad:</strong> ${loan.quantity}</p><p><strong>Propósito:</strong> ${esc(loan.purpose)}</p><p><strong>Inicio:</strong> ${dateText(new Date(`${loan.start}T12:00:00`))}</p><p><strong>Devolución prevista:</strong> ${dateText(new Date(`${loan.due}T12:00:00`))}</p></div>${loan.requestStatus ? `<div class="notice-box ${pending ? "warning" : "info"}">Solicitud de ${loan.requestType === "Devolucion" ? "devolución" : "prórroga"}: ${esc(loan.requestStatus)}${loan.proposedDue ? ` · Fecha propuesta: ${dateText(new Date(`${loan.proposedDue}T12:00:00`))}` : ""}</div>` : ""}${pending ? `<p class="empty-inline">Hay una solicitud pendiente en esta prueba.</p>` : `<div class="loan-request-actions"><button type="button" class="secondary-button" data-action="preview-request-return" data-index="${index}">Solicitar devolución</button><form class="inline-form" data-form="loan-extension" data-index="${index}"><label>Nueva fecha propuesta<input type="date" name="fechaPropuesta" min="${minDate}" required /></label><button type="submit" class="primary-button">Proponer prórroga</button></form></div>`}</div>`;
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
}

function simulateLoanExtension(form: HTMLFormElement): void {
  const index = Number(form.dataset.index);
  const loan = state.studentSandbox.loans[index];
  const proposedDue = String(new FormData(form).get("fechaPropuesta") || "");
  if (!loan || loan.status !== "Aprobada" || loan.requestStatus === "Pendiente" || !proposedDue || proposedDue <= loan.due) {
    notify("Elige una fecha posterior a la devolución prevista.", "error");
    return;
  }
  loan.requestType = "Prorroga";
  loan.requestStatus = "Pendiente";
  loan.proposedDue = proposedDue;
  form.closest("dialog")?.close();
  void loadPage();
  notify("Propuesta de prórroga simulada.");
}

function simulateStudentLoan(form: HTMLFormElement): void {
  const data = new FormData(form);
  const item = String(data.get("recursoId") || "");
  const quantity = Number(data.get("cantidad"));
  const purpose = String(data.get("motivo") || "").trim();
  const start = String(data.get("inicio") || "");
  const due = String(data.get("devolucion") || "");
  const selected = form.querySelector<HTMLOptionElement>(`option[value="${CSS.escape(item)}"]`);
  const stock = Number(selected?.dataset.stock || 0);
  if (!selected?.dataset.name || quantity < 1 || quantity > stock || !purpose || !start || !due || due < start) {
    notify("Revisa el artículo, la cantidad, el propósito y las fechas.", "error");
    return;
  }
  state.studentSandbox.loans.unshift({ item: selected.dataset.name, quantity, purpose, start, due, status: "Pendiente" });
  form.reset();
  void loadPage();
  notify("Solicitud de préstamo simulada.");
}

root.addEventListener("input", (event) => {
  const target = event.target as HTMLInputElement;
  if (target.id === "student-search") {
    const search = target.value.trim().toLocaleLowerCase("es");
    document.querySelectorAll<HTMLTableRowElement>("[data-student-row]").forEach((row) => {
      row.hidden = !row.textContent?.toLocaleLowerCase("es").includes(search);
    });
  }
});

document.addEventListener("change", (event) => {
  const target = event.target as HTMLInputElement | HTMLSelectElement;
  if (target.id === "club-logo-input" && target instanceof HTMLInputElement) {
    void handleClubLogoUpload(target.files?.[0]);
  } else if (target.dataset.action === "change-user-role" && target instanceof HTMLSelectElement) {
    void changeUserRole(target);
  } else if (target.dataset.setting === "theme" && ["system", "light", "dark"].includes(target.value)) {
    state.theme = target.value as AppState["theme"];
    localStorage.setItem("cdr-theme", state.theme);
    applyAppearance();
  } else if (target.dataset.setting === "reduce-motion" && target instanceof HTMLInputElement) {
    state.reduceMotion = target.checked;
    localStorage.setItem("cdr-reduce-motion", String(state.reduceMotion));
    applyAppearance();
  }
});

async function submitProfile(form: HTMLFormElement): Promise<void> {
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  if (!state.user || !state.profile) return;
  const data = new FormData(form);
  const nombre = String(data.get("nombre") || "").trim();
  const apellido = String(data.get("apellido") || "").trim();
  const tipoUsuario = data.get("tipoUsuario") === "docente" ? "docente" : "alumno";
  const carrera = String(data.get("carrera") || "");
  const semestre = tipoUsuario === "docente" ? "" : String(data.get("semestre") || "");
  if (!nombre || !apellido) {
    notify("Escribe tu nombre y apellido.", "error");
    return;
  }
  setBusy(button, true, "Guardando");
  try {
    const nombreCompleto = `${nombre} ${apellido}`;
    await updateDoc(doc(db, "usuarios", state.user.uid), { nombre, apellido, nombreCompleto, carrera, semestre, tipoUsuario });
    state.profile = { ...state.profile, nombre, apellido, nombreCompleto, carrera, semestre, tipoUsuario };
    notify("Perfil actualizado.");
    render();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo guardar el perfil."), "error");
  }
}

async function submitAuth(form: HTMLFormElement): Promise<void> {
  if (authSubmissionInProgress) return;
  authSubmissionInProgress = true;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  setBusy(button, true, state.authMode === "register" ? "Creando cuenta" : "Ingresando");
  const data = new FormData(form);
  const email = String(data.get("email") || "").trim().toLowerCase();
  const password = String(data.get("password") || "");
  const confirmPassword = String(data.get("confirmPassword") || "");
  try {
    if (state.authMode === "register" && !state.user && password !== confirmPassword) {
      throw new Error("Las contraseñas no coinciden. Revísalas e inténtalo de nuevo.");
    }
    if (state.authMode === "register") {
      sessionStorage.setItem(pendingRegistrationKey, JSON.stringify({
        nombre: String(data.get("nombre") || ""), apellido: String(data.get("apellido") || ""), email,
        carrera: String(data.get("carrera") || ""), semestre: String(data.get("semestre") || ""),
        tipoUsuario: String(data.get("tipoUsuario") || "alumno"),
      }));
    }
    if (!isInstitutionalEmail(email)) {
      throw new Error(INSTITUTIONAL_EMAIL_DOMAIN
        ? `Solo se permite el acceso con correo institucional @${INSTITUTIONAL_EMAIL_DOMAIN} o con la cuenta administradora autorizada.`
        : `Por ahora solo están autorizadas las cuentas administradoras ${INITIAL_ADMIN_EMAIL}.`);
    }
    let user = state.user;
    if (!user) {
      if (state.authMode === "login") {
        const result = await signInWithEmailAndPassword(auth, email, password);
        user = result.user;
        await user.reload();
        if (!user.emailVerified) {
          await signOut(auth);
          throw new Error("Verifica tu correo institucional. Te enviamos un enlace antes de habilitar el acceso.");
        }
      } else {
        try {
          user = (await createUserWithEmailAndPassword(auth, email, password)).user;
          try {
            await sendEmailVerification(user);
          } finally {
            await signOut(auth);
          }
          throw new Error("Te enviamos el enlace de verificación. Ábrelo y vuelve aquí: tus datos quedarán guardados. Luego pulsa Crear cuenta otra vez.");
        } catch (error) {
          if (error instanceof Error && error.message.startsWith("Te enviamos el enlace")) throw error;
          if ((error as { code?: string }).code !== "auth/email-already-in-use") throw error;
          user = (await signInWithEmailAndPassword(auth, email, password)).user;
          await user.reload();
          if (!user.emailVerified) {
            try {
              await sendEmailVerification(user);
            } finally {
              await signOut(auth);
            }
            throw new Error("Primero verifica tu correo. Te reenviamos el enlace; luego vuelve a crear el perfil.");
          }
        }
      }
    }
    if (state.authMode === "register") {
      if (!user) throw new Error("No se pudo validar la cuenta.");
      await user.reload();
      if (user.email?.toLowerCase() !== email) throw new Error("El correo no coincide con la cuenta autenticada.");
      if (!isInstitutionalEmail(user.email || "") || !user.emailVerified) {
        try {
          if (!user.emailVerified) await sendEmailVerification(user);
        } finally {
          await signOut(auth);
        }
        throw new Error("Verifica tu correo institucional antes de completar el registro.");
      }
      await user.getIdToken(true);
      const userDoc = doc(db, "usuarios", user.uid);
      const existingProfile = await getDoc(userDoc);
      if (existingProfile.exists()) throw new Error("Esta cuenta ya tiene perfil. Inicia sesión desde el acceso.");
      const nombre = String(data.get("nombre") || "").trim();
      const apellido = String(data.get("apellido") || "").trim();
      await setDoc(userDoc, {
        uid: user.uid,
        nombre,
        apellido,
        nombreCompleto: `${nombre} ${apellido}`,
        correoInstitucional: email || user.email || "",
        tipoUsuario: data.get("tipoUsuario") === "docente" ? "docente" : "alumno",
        carrera: String(data.get("carrera") || ""),
        semestre: data.get("tipoUsuario") === "docente" ? "" : String(data.get("semestre") || ""),
        rol: isInitialAdminEmail(email) ? "admin" : "estudiante",
        autorizado: isInitialAdminEmail(email),
        rostroRegistrado: false,
        fechaCreacion: serverTimestamp(),
      });
      sessionStorage.removeItem(pendingRegistrationKey);
      notify(isInitialAdminEmail(email) ? "Perfil de administrador creado." : "Perfil creado. Espera la autorización del administrador.");
    }
    await loadProfile(user!);
  } catch (error) {
    state.authMessage = errorMessage(error, "No se pudo completar el acceso.");
    if ((error as { code?: string }).code === "auth/invalid-credential") state.authMessage = "Correo o contraseña incorrectos.";
    if ((error as { code?: string }).code === "permission-denied") {
      state.authMessage = "Firestore rechazó el acceso al perfil. Comprueba que estén publicadas las reglas del proyecto club-de-robotica-sil y que hayas verificado tu correo.";
    }
    state.loading = false;
    render();
    document.querySelector(".auth-form")?.scrollIntoView({ block: "start" });
  } finally {
    authSubmissionInProgress = false;
  }
}

async function toggleAccess(button: HTMLButtonElement): Promise<void> {
  if (!state.user || !state.profile || !isAuthorized()) return;
  const startedAt = performance.now();
  setBusy(button, true);
  const profile = state.profile;
  try {
    const batch = writeBatch(db);
    const accessRef = doc(collection(db, "accesos"));
    batch.set(accessRef, {
      uid: state.user.uid,
      nombreCompleto: fullName(profile),
      correoInstitucional: profile.correoInstitucional || state.user.email || "",
      tipo: "entrada",
      fechaHora: serverTimestamp(),
    });
    batch.set(doc(db, "presencias", state.user.uid), {
      dentro: true,
      ultimaActualizacion: serverTimestamp(),
      nombreCompleto: fullName(profile),
    }, { merge: true });
    await batch.commit();
    notify("Entrada registrada.");
    if (!isStudentPreview()) void sendEntryEventToEsp32(accessRef.id, startedAt);
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    const code = (error as { code?: string })?.code;
    notify(code === "permission-denied"
      ? "Firestore rechazó el registro. Verifica que tu correo institucional esté verificado y que el administrador haya autorizado tu cuenta."
      : errorMessage(error, "No se pudo registrar la entrada."), "error");
  }
}

async function registerAdminEntry(button: HTMLButtonElement): Promise<void> {
  if (!state.user || !state.profile || !isAdminInterface()) return;
  const startedAt = performance.now();
  setBusy(button, true);
  try {
    const accessRef = doc(collection(db, "accesos"));
    await setDoc(accessRef, {
      uid: state.user.uid,
      nombreCompleto: fullName(),
      correoInstitucional: state.profile.correoInstitucional || state.user.email || "",
      tipo: "entrada",
      fechaHora: serverTimestamp(),
    });
    notify("Entrada registrada.");
    if (!isStudentPreview()) void sendEntryEventToEsp32(accessRef.id, startedAt);
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo registrar la entrada."), "error");
  }
}

async function sendEntryEventToEsp32(accessId: string, startedAt: number): Promise<void> {
  const user = auth.currentUser;
  if (!user || isStudentPreview()) return;
  reportEntryDelivery(user.uid, "Entrada registrada. Enviando al ESP32 y esperando confirmación…", "waiting");
  try {
    const token = await user.getIdToken();
    const created = await fetch(`${NOTIFICATION_WORKER_URL}/v1/door/entry-events`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ accessId }),
    });
    const result = await created.json().catch(() => ({}));
    if (!created.ok) {
      const message = result.error === "door_entry_receiver_not_provisioned" || result.error === "door_entry_test_disabled"
        ? "La entrada quedó registrada; falta configurar el receptor ESP32."
        : "La entrada quedó registrada, pero no se pudo enviar al ESP32.";
      reportEntryDelivery(user.uid, `${message} (${String(result.error || "worker_request_failed")})`, "failed");
      return;
    }

    const commandId = String(result.commandId || "");
    if (!commandId) throw new Error("El Worker no devolvió el identificador del evento.");
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 1500));
      const currentToken = await user.getIdToken();
      const statusResponse = await fetch(`${NOTIFICATION_WORKER_URL}/v1/door/entry-events/${encodeURIComponent(commandId)}`, {
        headers: { Authorization: `Bearer ${currentToken}` },
      });
      if (!statusResponse.ok) break;
      const status = await statusResponse.json();
      if (status.status === "received") {
        const elapsedMs = performance.now() - startedAt;
        const elapsedSeconds = (elapsedMs / 1000).toLocaleString("es-PY", {
          minimumFractionDigits: 2, maximumFractionDigits: 2,
        });
        reportEntryDelivery(user.uid, `El ESP32 recibió el registro. Tiempo hasta confirmar en la app: ${elapsedSeconds} s.`, "released", Date.now() + 10000);
        console.info("Medicion ESP32: pulsacion hasta confirmacion observada en la app", {
          accessId, commandId, elapsedMs: Math.round(elapsedMs), statusPollIntervalMs: 1500,
        });
        return;
      }
      if (["expired", "failed"].includes(status.status)) break;
    }
    reportEntryDelivery(user.uid, "Entrada registrada; el ESP32 aún no confirmó la recepción. Revisa el monitor serie.", "failed");
  } catch {
    reportEntryDelivery(user.uid, "Entrada registrada; no se pudo confirmar la conexión con el ESP32.", "failed");
  }
}

async function completeTask(path: string, button: HTMLButtonElement, afterComplete?: () => Promise<void>): Promise<void> {
  setBusy(button, true);
  try {
    await updateDoc(doc(db, path), { estado: "Completada" });
    notify("Tarea marcada como completada.");
    if (afterComplete) await afterComplete();
    else await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo completar la tarea."), "error");
  }
}

async function joinProject(projectId: string, button: HTMLButtonElement): Promise<void> {
  if (!state.user || !state.profile || !isAuthorized() || isAdmin()) return;
  setBusy(button, true);
  try {
    const requestRef = doc(db, "proyectos", projectId, "solicitudes", state.user.uid);
    const eventRef = doc(collection(db, "notificationOutbox"));
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(requestRef);
      if (existing.exists() && existing.get("estado") !== "rechazada") {
        throw new Error(existing.get("estado") === "aceptada" ? "Ya formas parte de este proyecto." : "Ya tienes una solicitud pendiente.");
      }
      if (existing.exists()) {
        transaction.update(requestRef, { estado: "pendiente", notificationEventId: eventRef.id });
      } else {
        transaction.set(requestRef, {
          uid: state.user!.uid,
          nombreCompleto: fullName(),
          correoInstitucional: state.profile!.correoInstitucional || state.user!.email || "",
          carrera: state.profile!.carrera || "",
          semestre: state.profile!.semestre || "",
          estado: "pendiente",
          fechaSolicitud: serverTimestamp(),
          notificationEventId: eventRef.id,
        });
      }
      transaction.set(eventRef, {
        tipo: "join-requested",
        proyectoId: projectId,
        solicitudUid: state.user!.uid,
        actorUid: state.user!.uid,
        createdAt: serverTimestamp(),
        status: "pending",
      });
    });
    notify("Solicitud enviada.");
    if (button.closest("dialog")) {
      button.closest("dialog")?.close();
      await showProject(projectId);
    } else await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo enviar la solicitud."), "error");
  }
}

async function enrollCourse(courseId: string, button: HTMLButtonElement): Promise<void> {
  if (!state.user || !state.profile || !isAuthorized() || isAdmin()) return;
  setBusy(button, true);
  try {
    const courseRef = doc(db, "cursos", courseId);
    const registrationRef = doc(db, "cursos", courseId, "inscripciones", state.user.uid);
    await runTransaction(db, async (transaction) => {
      const [course, registration] = await Promise.all([
        transaction.get(courseRef),
        transaction.get(registrationRef),
      ]);
      if (!course.exists() || course.get("estado") !== "Publicado") throw new Error("Este curso ya no tiene inscripciones abiertas.");
      if (registration.exists()) throw new Error("Ya estás inscrito en este curso.");
      transaction.set(registrationRef, {
        uid: state.user!.uid,
        nombreCompleto: fullName(),
        carrera: state.profile!.carrera || "",
        semestre: state.profile!.semestre || "",
        fechaInscripcion: serverTimestamp(),
      });
    });
    notify("Inscripción confirmada.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo completar la inscripción."), "error");
  }
}

async function leaveCourse(courseId: string, button: HTMLButtonElement): Promise<void> {
  if (!state.user || !isAuthorized() || isAdmin()) return;
  if (!window.confirm("¿Cancelar tu inscripción a este curso?")) return;
  setBusy(button, true);
  try {
    await deleteDoc(doc(db, "cursos", courseId, "inscripciones", state.user.uid));
    notify("Inscripción cancelada.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo cancelar la inscripción."), "error");
  }
}

async function toggleCourseState(courseId: string, nextState: string, button: HTMLButtonElement): Promise<void> {
  if (!state.user || !isAdmin() || isStudentPreview() || !["Publicado", "Cerrado"].includes(nextState)) return;
  setBusy(button, true);
  try {
    await updateDoc(doc(db, "cursos", courseId), { estado: nextState });
    notify(nextState === "Publicado" ? "Inscripciones abiertas." : "Inscripciones cerradas.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo actualizar el curso."), "error");
  }
}

async function openCourseRegistrations(courseId: string, button: HTMLButtonElement): Promise<void> {
  if (!isAdmin() || isStudentPreview() || !courseId) return;
  setBusy(button, true);
  try {
    const [course, registrations] = await Promise.all([
      getDoc(doc(db, "cursos", courseId)),
      getDocs(query(collection(db, "cursos", courseId, "inscripciones"), orderBy("fechaInscripcion", "desc"), limit(200))),
    ]);
    if (!course.exists()) throw new Error("El curso ya no está disponible.");
    const list = registrations.docs.map((registration) => `<div class="course-registration-row"><span class="avatar">${esc(String(registration.get("nombreCompleto") || "E").slice(0, 1).toUpperCase())}</span><div><strong>${esc(registration.get("nombreCompleto") || "Estudiante")}</strong><small>${esc(registration.get("carrera") || "Área de interés no indicada")} · ${esc(registration.get("semestre") || "Curso o grado no indicado")}</small></div><time>${dateText(registration.get("fechaInscripcion"))}</time></div>`).join("");
    const dialog = document.createElement("dialog");
    dialog.className = "detail-dialog";
    dialog.innerHTML = `<div class="dialog-head"><div><p class="eyebrow">INSCRIPCIONES</p><h2>${esc(course.get("titulo") || "Curso")}</h2></div><button class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><p class="course-registration-count">${registrations.size} estudiante${registrations.size === 1 ? "" : "s"} inscrito${registrations.size === 1 ? "" : "s"}</p><div class="course-registration-list">${list || emptyInline("Todavía no hay estudiantes inscritos.")}</div>`;
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener("click", (event) => { if (event.target === dialog || (event.target as HTMLElement).closest('[data-action="close-dialog"]')) dialog.close(); });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
  } catch (error) {
    notify(errorMessage(error, "No se pudo consultar la lista de inscritos."), "error");
  } finally {
    setBusy(button, false);
  }
}

async function reactToNotice(noticeId: string, reaction: string, button: HTMLButtonElement): Promise<void> {
  if (!state.user || !isAuthorized()) {
    notify("Tu perfil aún no tiene acceso para reaccionar.", "error");
    return;
  }
  setBusy(button, true);
  try {
    const ref = doc(db, "avisos", noticeId, "reacciones", state.user.uid);
    const current = await getDoc(ref);
    if (current.exists() && current.get("tipo") === reaction) await deleteDoc(ref);
    else await setDoc(ref, { tipo: reaction, fechaActualizacion: serverTimestamp() });
    notify("Reacción guardada.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo guardar la reacción."), "error");
  }
}

async function submitLoan(form: HTMLFormElement): Promise<void> {
  if (!state.user || !state.profile || !isAuthorized() || isAdmin()) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  setBusy(button, true);
  const data = new FormData(form);
  const select = form.elements.namedItem("recursoId") as HTMLSelectElement;
  const option = select.selectedOptions[0];
  const quantity = Number(data.get("cantidad"));
  const stock = Number(option?.dataset.stock || 0);
  const start = new Date(`${data.get("inicio")}T12:00:00`);
  const end = new Date(`${data.get("devolucion")}T12:00:00`);
  if (!option?.value || quantity < 1 || quantity > stock || Number.isNaN(+end) || +end < +start) {
    setBusy(button, false);
    notify("Revisa el artículo, la cantidad y las fechas.", "error");
    return;
  }
  try {
    await addDoc(collection(db, "reservas"), {
      recursoNombre: option.dataset.name || "",
      recursoId: option.value,
      cantidadSolicitada: quantity,
      motivo: String(data.get("motivo") || "").trim(),
      solicitanteUid: state.user.uid,
      solicitanteNombre: fullName(),
      estado: "Pendiente",
      fechaReserva: Timestamp.fromDate(start),
      fechaInicioUso: Timestamp.fromDate(start),
      fechaDevolucion: Timestamp.fromDate(end),
      fechaCreacion: serverTimestamp(),
    });
    notify("Solicitud enviada al administrador.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo enviar la solicitud."), "error");
  }
}

async function resolveLoan(id: string, action: string, button: HTMLButtonElement): Promise<void> {
  if (!isAdmin() || !state.user) return;
  setBusy(button, true);
  const ref = doc(db, "reservas", id);
  try {
    let auditType = "";
    let auditTitle = "";
    let auditDetail = "";
    await runTransaction(db, async (transaction) => {
      const loanSnapshot = await transaction.get(ref);
      if (!loanSnapshot.exists()) throw new Error("La solicitud ya no existe.");
      const loan = loanSnapshot.data();
      const itemRef = doc(db, "inventario", String(loan.recursoId || ""));
      const itemSnapshot = await transaction.get(itemRef);
      if (!itemSnapshot.exists()) throw new Error("El artículo de inventario ya no existe.");
      const item = itemSnapshot.data();
      const quantity = Number(loan.cantidadSolicitada || 1);
      const stock = Number(item.cantidad || 0);
      auditDetail = `${loan.recursoNombre || "Artículo"} · ${loan.solicitanteNombre || "Solicitante"} · ${quantity} unidad(es)`;
      if (action === "loan-approve") {
        if (loan.estado !== "Pendiente") throw new Error("La solicitud ya fue procesada.");
        if (stock < quantity) throw new Error("No hay stock suficiente para aprobar este préstamo.");
        const remaining = stock - quantity;
        transaction.update(itemRef, { cantidad: remaining, estado: remaining === 0 ? "Prestado" : "Disponible" });
        transaction.update(ref, { estado: "Aprobada", aprobadoPorUid: state.user!.uid, aprobadoPorNombre: fullName() });
        auditType = "prestamo_aprobado";
        auditTitle = "Préstamo aprobado";
      } else if (action === "loan-reject") {
        if (loan.estado !== "Pendiente") throw new Error("La solicitud ya fue procesada.");
        transaction.update(ref, { estado: "Rechazada" });
        auditType = "prestamo_rechazado";
        auditTitle = "Solicitud de préstamo rechazada";
      } else {
        if (loan.estado !== "Aprobada") throw new Error("Este artículo no figura como préstamo activo.");
        const restored = stock + quantity;
        transaction.update(itemRef, { cantidad: restored, estado: "Disponible" });
        const archiveRef = doc(collection(db, "prestamosArchivados"));
        transaction.set(archiveRef, {
          reservaId: id,
          recursoId: String(loan.recursoId || ""),
          recursoNombre: String(loan.recursoNombre || "Artículo"),
          cantidadSolicitada: quantity,
          motivo: String(loan.motivo || ""),
          solicitanteUid: String(loan.solicitanteUid || ""),
          solicitanteNombre: String(loan.solicitanteNombre || "Solicitante"),
          fechaInicioUso: loan.fechaInicioUso,
          fechaDevolucion: loan.fechaDevolucion,
          aprobadoPorUid: String(loan.aprobadoPorUid || ""),
          aprobadoPorNombre: String(loan.aprobadoPorNombre || "Sin registro"),
          devueltoPorUid: state.user!.uid,
          devueltoPorNombre: fullName(),
          fechaDevolucionReal: serverTimestamp(),
          estado: "Devuelta",
        });
        transaction.delete(ref);
        auditType = "prestamo_devuelto";
        auditTitle = "Devolución registrada";
      }
    });
    await addDoc(collection(db, "actividadAdmin"), {
      tipo: auditType,
      titulo: auditTitle,
      detalle: auditDetail,
      emisorUid: state.user.uid,
      emisorNombre: fullName(),
      entidadId: id,
      fechaCreacion: serverTimestamp(),
    });
    notify(action === "loan-approve" ? "Préstamo aprobado." : action === "loan-reject" ? "Solicitud rechazada." : "Devolución registrada.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo resolver el préstamo."), "error");
  }
}

async function resolveLoanRequest(id: string, approve: boolean, button: HTMLButtonElement): Promise<void> {
  if (!isAdminInterface() || !state.user) return;
  setBusy(button, true);
  const loanRef = doc(db, "reservas", id);
  let auditType = "";
  let auditTitle = "";
  let auditDetail = "";
  try {
    await runTransaction(db, async (transaction) => {
      const loanSnapshot = await transaction.get(loanRef);
      if (!loanSnapshot.exists()) throw new Error("El préstamo ya no existe.");
      const loan = loanSnapshot.data();
      if (loan.estado !== "Aprobada" || loan.estadoSolicitud !== "Pendiente") {
        throw new Error("La solicitud ya fue resuelta o el préstamo no está activo.");
      }
      const requestType = String(loan.accionSolicitada || "");
      if (requestType !== "Devolucion" && requestType !== "Prorroga") throw new Error("Tipo de solicitud desconocido.");
      auditDetail = `${loan.recursoNombre || "Artículo"} · ${loan.solicitanteNombre || "Estudiante"} · ${Number(loan.cantidadSolicitada || 1)} unidad(es)`;
      const notificationRef = doc(collection(db, "usuarios", String(loan.solicitanteUid), "notificaciones"));

      if (requestType === "Devolucion" && approve) {
        const itemRef = doc(db, "inventario", String(loan.recursoId || ""));
        const itemSnapshot = await transaction.get(itemRef);
        if (!itemSnapshot.exists()) throw new Error("El artículo ya no existe en el inventario.");
        const quantity = Number(loan.cantidadSolicitada || 1);
        const restoredQuantity = Number(itemSnapshot.get("cantidad") || 0) + quantity;
        const archiveRef = doc(collection(db, "prestamosArchivados"));
        transaction.update(itemRef, {
          cantidad: restoredQuantity,
          estado: restoredQuantity > 0 ? "Disponible" : "Prestado",
        });
        transaction.set(archiveRef, {
          reservaId: id,
          recursoId: String(loan.recursoId || ""),
          recursoNombre: String(loan.recursoNombre || "Artículo"),
          cantidadSolicitada: quantity,
          motivo: String(loan.motivo || ""),
          solicitanteUid: String(loan.solicitanteUid || ""),
          solicitanteNombre: String(loan.solicitanteNombre || "Estudiante"),
          fechaInicioUso: loan.fechaInicioUso,
          fechaDevolucion: loan.fechaDevolucion,
          aprobadoPorUid: String(loan.aprobadoPorUid || ""),
          aprobadoPorNombre: String(loan.aprobadoPorNombre || "Sin registro"),
          devueltoPorUid: state.user!.uid,
          devueltoPorNombre: fullName(),
          fechaDevolucionReal: serverTimestamp(),
          estado: "Devuelta",
        });
        transaction.delete(loanRef);
        auditType = "prestamo_devuelto";
        auditTitle = "Devolución autorizada";
      } else {
        const update: Record<string, unknown> = {
          estadoSolicitud: approve ? "Aprobada" : "Rechazada",
          resueltaPorUid: state.user!.uid,
          resueltaPorNombre: fullName(),
        };
        if (requestType === "Prorroga" && approve) {
          const proposedDate = loan.fechaDevolucionPropuesta;
          if (!(proposedDate instanceof Timestamp) || proposedDate.toMillis() <= loan.fechaDevolucion.toMillis()) {
            throw new Error("La fecha propuesta ya no es válida.");
          }
          update.fechaDevolucion = proposedDate;
        }
        transaction.update(loanRef, update);
        auditType = requestType === "Prorroga"
          ? approve ? "prestamo_prorroga_aprobada" : "prestamo_prorroga_rechazada"
          : "prestamo_devolucion_rechazada";
        auditTitle = requestType === "Prorroga"
          ? approve ? "Prórroga aprobada" : "Prórroga rechazada"
          : "Devolución rechazada";
      }

      transaction.set(notificationRef, {
        proyectoId: "",
        tipo: "prestamo",
        reservaId: id,
        titulo: approve ? "Solicitud de préstamo autorizada" : "Solicitud de préstamo rechazada",
        mensaje: approve
          ? requestType === "Devolucion" ? `Se registró la devolución de ${loan.recursoNombre || "tu artículo"}.` : `Se extendió la fecha de devolución de ${loan.recursoNombre || "tu artículo"}.`
          : `El administrador rechazó la solicitud para ${loan.recursoNombre || "tu artículo"}.`,
        prioridad: "Normal",
        emisorUid: state.user!.uid,
        fechaCreacion: serverTimestamp(),
        leida: false,
      });
    });
    await addDoc(collection(db, "actividadAdmin"), {
      tipo: auditType,
      titulo: auditTitle,
      detalle: auditDetail,
      emisorUid: state.user.uid,
      emisorNombre: fullName(),
      entidadId: id,
      fechaCreacion: serverTimestamp(),
    }).catch(() => undefined);
    notify(approve ? "Solicitud aprobada." : "Solicitud rechazada.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo resolver la solicitud."), "error");
  }
}

async function submitNotice(form: HTMLFormElement): Promise<void> {
  if (!canManageClub() || !state.user) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  setBusy(button, true);
  const data = new FormData(form);
  try {
    await addDoc(collection(db, "avisos"), {
      titulo: String(data.get("titulo") || "").trim(),
      mensaje: String(data.get("mensaje") || "").trim(),
      prioridad: String(data.get("prioridad") || "Normal"),
      autorUid: state.user.uid,
      autorNombre: fullName(),
      fechaCreacion: serverTimestamp(),
    });
    closeDialog();
    notify("Aviso publicado.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo publicar el aviso."), "error");
  }
}

async function submitFeedback(form: HTMLFormElement): Promise<void> {
  if (!state.user || !state.user.emailVerified) return notify("Verifica tu correo institucional para enviar comentarios.", "error");
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const data = new FormData(form);
  const titulo = String(data.get("titulo") || "").trim();
  const detalle = String(data.get("detalle") || "").trim();
  const tipo = String(data.get("tipo") || "");
  if (!titulo || !detalle || !["sugerencia", "error"].includes(tipo)) return notify("Completa el asunto, el detalle y el tipo de envío.", "error");
  setBusy(button, true);
  try {
    await addDoc(collection(db, "sugerencias"), {
      uid: state.user.uid,
      nombre: fullName(),
      tipo,
      titulo,
      detalle,
      estado: "recibido",
      respuesta: "",
      fechaCreacion: serverTimestamp(),
      fechaActualizacion: serverTimestamp(),
    });
    notify("Gracias. Tu comentario fue enviado al equipo del club.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo enviar el comentario."), "error");
  }
}

async function submitFeedbackResponse(form: HTMLFormElement): Promise<void> {
  if (!canManageClub()) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const data = new FormData(form);
  const estado = String(data.get("estado") || "");
  const respuesta = String(data.get("respuesta") || "").trim();
  if (!["recibido", "en_revision", "resuelto"].includes(estado)) return notify("Selecciona un estado válido.", "error");
  setBusy(button, true);
  try {
    await updateDoc(doc(db, "sugerencias", form.dataset.id!), {
      estado,
      respuesta,
      fechaActualizacion: serverTimestamp(),
    });
    notify("Seguimiento guardado.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo guardar el seguimiento."), "error");
  }
}

async function submitCalendarClass(form: HTMLFormElement): Promise<void> {
  if (!state.user || isAdmin() || !isAuthorized()) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const data = new FormData(form);
  const weekdays = data.getAll("diasSemana").map(Number);
  const start = String(data.get("desde") || "");
  const end = String(data.get("hasta") || "");
  const startTime = String(data.get("horaInicio") || "");
  const endTime = String(data.get("horaFin") || "");
  if (!weekdays.length) return notify("Selecciona al menos un día de clase.", "error");
  if (start > end || startTime >= endTime) return notify("Revisa el período y el horario de la clase.", "error");
  setBusy(button, true);
  try {
    await addDoc(collection(db, "usuarios", state.user.uid, "calendario"), {
      tipo: "clase",
      materia: String(data.get("materia") || "").trim(),
      diasSemana: weekdays,
      horaInicio: startTime,
      horaFin: endTime,
      aula: String(data.get("aula") || "").trim(),
      desde: Timestamp.fromDate(new Date(`${start}T00:00:00`)),
      hasta: Timestamp.fromDate(new Date(`${end}T00:00:00`)),
      fechaCreacion: serverTimestamp(),
    });
    focusCalendarDate(start);
    closeDialog();
    notify("Horario semanal guardado.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo guardar el horario."), "error");
  }
}

async function submitCalendarExam(form: HTMLFormElement): Promise<void> {
  if (!state.user || isAdmin() || !isAuthorized()) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const data = new FormData(form);
  const date = String(data.get("fecha") || "");
  const time = String(data.get("hora") || "");
  const fechaHora = dateAtTime(date, time);
  if (Number.isNaN(fechaHora.getTime())) return notify("Ingresa una fecha y hora válidas.", "error");
  setBusy(button, true);
  try {
    await addDoc(collection(db, "usuarios", state.user.uid, "calendario"), {
      tipo: "examen",
      titulo: String(data.get("titulo") || "").trim(),
      materia: String(data.get("materia") || "").trim(),
      fechaHora: Timestamp.fromDate(fechaHora),
      lugar: String(data.get("lugar") || "").trim(),
      notas: String(data.get("notas") || "").trim(),
      fechaCreacion: serverTimestamp(),
    });
    focusCalendarDate(date);
    closeDialog();
    notify("Examen agregado al calendario.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo guardar el examen."), "error");
  }
}

async function submitClubActivity(form: HTMLFormElement): Promise<void> {
  if (!state.user || !canManageClub()) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const data = new FormData(form);
  const start = dateAtTime(String(data.get("fechaInicio") || ""), String(data.get("horaInicio") || ""));
  const end = dateAtTime(String(data.get("fechaFin") || ""), String(data.get("horaFin") || ""));
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
    return notify("La fecha y hora de fin no pueden ser anteriores al inicio.", "error");
  }
  setBusy(button, true);
  try {
    await addDoc(collection(db, "actividadesClub"), {
      titulo: String(data.get("titulo") || "").trim(),
      categoria: String(data.get("categoria") || "Otro"),
      descripcion: String(data.get("descripcion") || "").trim(),
      fechaInicio: Timestamp.fromDate(start),
      fechaFin: Timestamp.fromDate(end),
      lugar: String(data.get("lugar") || "").trim(),
      creadoPorUid: state.user.uid,
      creadoPorNombre: fullName(),
      fechaCreacion: serverTimestamp(),
    });
    focusCalendarDate(String(data.get("fechaInicio") || ""));
    closeDialog();
    notify("Actividad publicada para el club.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo publicar la actividad."), "error");
  }
}

async function deleteCalendarEntry(id: string, source: string, button: HTMLButtonElement): Promise<void> {
  const isClubActivity = source === "club";
  if (!id || (isClubActivity ? !canManageClub() : canManageClub() || !state.user)) return;
  const message = isClubActivity
    ? "¿Eliminar esta actividad del calendario de todos los estudiantes?"
    : "¿Eliminar este elemento de tu calendario?";
  if (!window.confirm(message)) return;
  setBusy(button, true);
  try {
    const entryRef = isClubActivity
      ? doc(db, "actividadesClub", id)
      : doc(db, "usuarios", state.user!.uid, "calendario", id);
    await deleteDoc(entryRef);
    notify(isClubActivity ? "Actividad eliminada." : "Elemento eliminado del calendario.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo eliminar el elemento."), "error");
  }
}

async function deleteNotice(noticeId: string, button: HTMLButtonElement): Promise<void> {
  if (!canManageClub() || !noticeId) return;
  if (!window.confirm("¿Eliminar este aviso para todos los usuarios? Esta acción no se puede deshacer.")) return;
  setBusy(button, true);
  try {
    await deleteDoc(doc(db, "avisos", noticeId));
    notify("Aviso eliminado.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo eliminar el aviso."), "error");
  }
}

async function submitItem(form: HTMLFormElement): Promise<void> {
  if (!isAdmin() || !state.user) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  setBusy(button, true);
  const data = new FormData(form);
  try {
    await addDoc(collection(db, "inventario"), {
      nombre: String(data.get("nombre") || "").trim(),
      descripcion: String(data.get("descripcion") || "").trim(),
      categoria: String(data.get("categoria") || "").trim(),
      cantidad: Number(data.get("cantidad")),
      ubicacion: String(data.get("ubicacion") || "").trim(),
      estado: "Disponible",
      creadoPorUid: state.user.uid,
      creadoPorNombre: fullName(),
      fechaCreacion: serverTimestamp(),
    });
    closeDialog();
    notify("Artículo agregado al inventario.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo guardar el artículo."), "error");
  }
}

async function submitProject(form: HTMLFormElement): Promise<void> {
  if (!canManageClub() || !state.user) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  setBusy(button, true);
  const data = new FormData(form);
  const responsible = form.querySelector<HTMLSelectElement>('select[name="responsableUid"]');
  const responsableUid = String(data.get("responsableUid") || "");
  const responsableNombre = responsible?.selectedOptions[0]?.dataset.name || "";
  if (!responsableUid || !responsableNombre) {
    setBusy(button, false);
    return notify("Selecciona un responsable para el proyecto.", "error");
  }
  try {
    await addDoc(collection(db, "proyectos"), {
      nombre: String(data.get("nombre") || "").trim(),
      descripcion: String(data.get("descripcion") || "").trim(),
      departamentos: data.getAll("departamentos").map(String),
      estado: "Activo",
      creadoPorUid: state.user.uid,
      responsableUid,
      responsableNombre,
      miembrosUids: [],
      fechaCreacion: serverTimestamp(),
    });
    closeDialog();
    notify("Proyecto creado.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo crear el proyecto."), "error");
  }
}

async function projectResponsibleOptions(): Promise<Array<{ uid: string; name: string }>> {
  const users = await getDocs(query(collection(db, "usuarios"), where("autorizado", "==", true), limit(100)));
  const options = users.docs.map((user) => ({
    uid: user.id,
    name: String(user.get("nombreCompleto") || `${user.get("nombre") || ""} ${user.get("apellido") || ""}`).trim(),
  })).filter((user) => user.uid && user.name);
  if (state.user && !options.some((user) => user.uid === state.user!.uid)) {
    options.push({ uid: state.user.uid, name: fullName() });
  }
  options.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return options;
}

async function openProjectDialog(): Promise<void> {
  if (!canManageClub()) return;
  try {
    const options = await projectResponsibleOptions();
    const select = `<label>Responsable del proyecto<select name="responsableUid" required>${options.map((user) => `<option value="${esc(user.uid)}" data-name="${esc(user.name)}" ${user.uid === state.user?.uid ? "selected" : ""}>${esc(user.name)}</option>`).join("")}</select></label>`;
    const dialog = document.createElement("dialog");
    dialog.className = "detail-dialog form-dialog";
    dialog.innerHTML = `<form class="dialog-form" data-form="project"><div class="dialog-head"><div><p class="eyebrow">TRABAJO DEL CLUB</p><h2>Nuevo proyecto</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Nombre<input name="nombre" required maxlength="100" /></label><label>Descripción<textarea name="descripcion" rows="3"></textarea></label>${select}<fieldset><legend>Áreas</legend>${["Electrónica", "Mecánica", "Programación"].map((name) => `<label class="check-label"><input type="checkbox" name="departamentos" value="${name}" />${name}</label>`).join("")}</fieldset><button class="primary-button" type="submit">Crear proyecto</button></form>`;
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener("click", (event) => { if (event.target === dialog || (event.target as HTMLElement).closest('[data-action="close-dialog"]')) dialog.close(); });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
  } catch (error) {
    notify(errorMessage(error, "No se pudieron cargar los responsables."), "error");
  }
}

async function openProjectResponsibleDialog(projectId: string): Promise<void> {
  if (!state.user || isStudentPreview()) return;
  try {
    const [project, options] = await Promise.all([
      getDoc(doc(db, "proyectos", projectId)),
      projectResponsibleOptions(),
    ]);
    if (!project.exists()) throw new Error("El proyecto ya no existe.");
    const data = project.data();
    const canEdit = canManageClub() || data.creadoPorUid === state.user.uid;
    if (!canEdit) throw new Error("No tienes permiso para cambiar el responsable.");
    const currentUid = String(data.responsableUid || "");
    if (currentUid && !options.some((user) => user.uid === currentUid)) {
      options.push({ uid: currentUid, name: String(data.responsableNombre || "Responsable actual") });
    }
    const dialog = document.createElement("dialog");
    dialog.className = "detail-dialog form-dialog";
    dialog.innerHTML = `<form class="dialog-form" data-form="project-responsible" data-project="${esc(projectId)}"><div class="dialog-head"><div><p class="eyebrow">${esc(data.nombre || data.titulo || "PROYECTO")}</p><h2>Asignar responsable</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Responsable<select name="responsableUid" required>${options.map((user) => `<option value="${esc(user.uid)}" data-name="${esc(user.name)}" ${user.uid === currentUid ? "selected" : ""}>${esc(user.name)}</option>`).join("")}</select></label><button class="primary-button" type="submit">Guardar responsable</button></form>`;
    document.body.append(dialog);
    dialog.showModal();
    dialog.addEventListener("click", (event) => { if (event.target === dialog || (event.target as HTMLElement).closest('[data-action="close-dialog"]')) dialog.close(); });
    dialog.addEventListener("close", () => dialog.remove(), { once: true });
  } catch (error) {
    notify(errorMessage(error, "No se pudo abrir la asignación de responsable."), "error");
  }
}

async function submitProjectResponsible(form: HTMLFormElement): Promise<void> {
  const projectId = form.dataset.project;
  if (!projectId || !state.user || isStudentPreview()) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const option = form.querySelector<HTMLSelectElement>('select[name="responsableUid"]')?.selectedOptions[0];
  const responsableUid = option?.value || "";
  const responsableNombre = option?.dataset.name || "";
  if (!responsableUid || !responsableNombre) return notify("Selecciona un responsable.", "error");
  setBusy(button, true);
  try {
    await updateDoc(doc(db, "proyectos", projectId), { responsableUid, responsableNombre });
    closeDialog();
    notify("Responsable del proyecto actualizado.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo asignar el responsable."), "error");
  }
}

async function deleteProject(projectId: string, button: HTMLButtonElement): Promise<void> {
  if (!state.user || !canManageClub()) return;
  const projectRef = doc(db, "proyectos", projectId);
  const project = await getDoc(projectRef);
  if (!project.exists()) return notify("El proyecto ya no existe.", "error");
  const projectName = String(project.get("nombre") || project.get("titulo") || "este proyecto");
  if (!window.confirm(`¿Eliminar «${projectName}»? También se eliminarán sus tareas, solicitudes y eventos. Esta acción no se puede deshacer.`)) return;
  setBusy(button, true);
  try {
    const [tasks, requests, events] = await Promise.all([
      getDocs(collection(db, "proyectos", projectId, "tareas")),
      getDocs(collection(db, "proyectos", projectId, "solicitudes")),
      getDocs(collection(db, "proyectos", projectId, "eventos")),
    ]);
    const children = [...tasks.docs, ...requests.docs];
    for (let index = 0; index < children.length; index += 450) {
      const batch = writeBatch(db);
      children.slice(index, index + 450).forEach((item) => batch.delete(item.ref));
      await batch.commit();
    }
    const finalBatch = writeBatch(db);
    events.docs.forEach((item) => finalBatch.delete(item.ref));
    finalBatch.delete(projectRef);
    await finalBatch.commit();
    notify("Proyecto eliminado.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo eliminar completamente el proyecto."), "error");
  }
}

function selectedAssignees(form: HTMLFormElement): { uids: string[]; names: string[] } {
  const selected = [...form.querySelectorAll<HTMLInputElement>('input[name="responsables"]:checked')];
  if (selected.length > 5) throw new Error("Puedes asignar hasta cinco responsables.");
  return {
    uids: selected.map((input) => input.value),
    names: selected.map((input) => input.dataset.name || ""),
  };
}

async function submitProjectTask(form: HTMLFormElement): Promise<void> {
  const projectId = form.dataset.project;
  if (!projectId || !state.user) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  setBusy(button, true, "Guardando tarea");
  try {
    const data = new FormData(form);
    const { uids, names } = selectedAssignees(form);
    const eventRef = doc(collection(db, "notificationOutbox"));
    const taskRef = doc(collection(db, "proyectos", projectId, "tareas"));
    const dateValue = String(data.get("fechaLimite") || "");
    await runTransaction(db, async (transaction) => {
      const project = await transaction.get(doc(db, "proyectos", projectId));
      if (!project.exists() || (!canManageClub() && projectLead(project.data()) !== state.user?.uid)) throw new Error("Solo el responsable o un moderador pueden crear tareas.");
      const title = String(data.get("titulo") || "").trim();
      if (!title) throw new Error("Escribe el título de la tarea.");
      transaction.set(taskRef, {
        proyectoId: projectId,
        titulo: title,
        descripcion: String(data.get("descripcion") || "").trim(),
        responsableUid: uids[0] || "",
        responsableNombre: names[0] || "",
        responsableUids: uids,
        responsablesNombres: names,
        prioridad: String(data.get("prioridad") || "Normal"),
        fechaLimite: dateValue ? Timestamp.fromDate(new Date(`${dateValue}T23:59:59`)) : null,
        estado: "Pendiente",
        fechaCreacion: serverTimestamp(),
        notificationEventId: eventRef.id,
        assignmentVersion: eventRef.id,
      });
      transaction.set(eventRef, {
        tipo: "task-created", proyectoId: projectId, tareaId: taskRef.id,
        assignmentVersion: eventRef.id, actorUid: state.user!.uid,
        createdAt: serverTimestamp(), status: "pending",
      });
    });
    const noticesSaved = await writeTaskNotifications(projectId, taskRef.id, String(data.get("titulo") || "").trim(), uids, state.user.uid);
    notify(noticesSaved ? "Tarea creada. Se avisará a las personas asignadas." : "Tarea creada, pero el aviso dentro de la app no pudo guardarse.", noticesSaved ? "ok" : "error");
    closeDialog();
    await showProject(projectId);
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo crear la tarea."), "error");
  }
}

async function submitTaskAssignment(form: HTMLFormElement): Promise<void> {
  const projectId = form.dataset.project;
  const taskId = form.dataset.task;
  if (!projectId || !taskId || !state.user) return;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  setBusy(button, true, "Actualizando responsables");
  try {
    const { uids, names } = selectedAssignees(form);
    const projectRef = doc(db, "proyectos", projectId);
    const taskRef = doc(db, "proyectos", projectId, "tareas", taskId);
    const eventRef = doc(collection(db, "notificationOutbox"));
    await runTransaction(db, async (transaction) => {
      const [project, task] = await Promise.all([transaction.get(projectRef), transaction.get(taskRef)]);
      if (!project.exists() || (!canManageClub() && projectLead(project.data()) !== state.user?.uid)) throw new Error("Solo el responsable o un moderador pueden reasignar tareas.");
      if (!task.exists() || task.get("estado") !== "Pendiente") throw new Error("Solo se pueden reasignar tareas pendientes.");
      const members = Array.isArray(project.get("miembrosUids")) ? [...project.get("miembrosUids")] : [];
      uids.forEach((uid) => { if (!members.includes(uid)) members.push(uid); });
      if (members.length !== (project.get("miembrosUids") || []).length) transaction.update(projectRef, { miembrosUids: members });
      transaction.update(taskRef, {
        responsableUid: uids[0] || "",
        responsableNombre: names[0] || "",
        responsableUids: uids,
        responsablesNombres: names,
        notificationEventId: eventRef.id,
        assignmentVersion: eventRef.id,
      });
      transaction.set(eventRef, {
        tipo: "task-reassigned", proyectoId: projectId, tareaId: taskId,
        assignmentVersion: eventRef.id, actorUid: state.user!.uid,
        createdAt: serverTimestamp(), status: "pending",
      });
    });
    const noticesSaved = await writeTaskNotifications(projectId, taskId, "Tarea reasignada", uids, state.user.uid, false, true);
    notify(noticesSaved ? "Responsables actualizados. Se avisará a las personas asignadas." : "Responsables actualizados, pero el aviso dentro de la app no pudo guardarse.", noticesSaved ? "ok" : "error");
    closeDialog();
    await showProject(projectId);
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo cambiar el responsable."), "error");
  }
}

async function writeTaskNotifications(projectId: string, taskId: string, title: string, assigneeUids: string[], actorUid: string, notifyMembers = true, reassigned = false): Promise<boolean> {
  try {
    const project = await getDoc(doc(db, "proyectos", projectId));
    const projectName = String(project.get("nombre") || project.get("titulo") || "el proyecto");
    const assigned = [...new Set(assigneeUids)].filter((uid) => uid && uid !== actorUid);
    const members = notifyMembers ? [...new Set((project.get("miembrosUids") || []) as string[])].filter((uid) => uid && uid !== actorUid && !assigned.includes(uid)) : [];
    if (assigned.length + members.length > 500) return false;
    const batch = writeBatch(db);
    assigned.forEach((uid) => batch.set(doc(collection(db, "usuarios", uid, "notificaciones")), {
      proyectoId: projectId, tipo: "tarea", tareaId: taskId,
      titulo: reassigned ? "Tarea reasignada" : "Nueva tarea asignada",
      mensaje: `${reassigned ? "Ahora tienes asignada" : "Te asignaron"} «${title}» en el proyecto «${projectName}».`,
      prioridad: "Normal", emisorUid: actorUid, fechaCreacion: serverTimestamp(), leida: false,
    }));
    members.forEach((uid) => batch.set(doc(collection(db, "usuarios", uid, "notificaciones")), {
      proyectoId: projectId, tipo: "proyecto", tareaId: "",
      titulo: `Nueva tarea en ${projectName}`,
      mensaje: `Se creó la tarea «${title}» en el proyecto «${projectName}».`,
      prioridad: "Normal", emisorUid: actorUid, fechaCreacion: serverTimestamp(), leida: false,
    }));
    if (assigned.length + members.length) await batch.commit();
    return true;
  } catch { return false; }
}

async function toggleStudentAccess(uid: string, authorized: boolean, button: HTMLButtonElement): Promise<void> {
  if (!isAdmin()) return;
  setBusy(button, true);
  try {
    await updateDoc(doc(db, "usuarios", uid), { autorizado: authorized });
    notify(authorized ? "Estudiante autorizado." : "Acceso bloqueado.");
    await loadPage();
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo actualizar el acceso."), "error");
  }
}

async function changeUserRole(select: HTMLSelectElement): Promise<void> {
  if (!isAdmin() || isStudentPreview() || !state.user) return;
  const uid = select.dataset.id || "";
  const currentRole = select.dataset.role || "estudiante";
  const nextRole = select.value;
  if (!uid || uid === state.user.uid || !["estudiante", "moderador", "admin"].includes(nextRole)) {
    select.value = currentRole;
    return;
  }
  const labels: Record<string, string> = { estudiante: "Estudiante", moderador: "Moderador", admin: "Administrador" };
  const name = select.dataset.name || "esta persona";
  const prompt = nextRole === "admin"
    ? `¿Dar a ${name} permisos de Administrador? Tendrá control completo de la aplicación.`
    : nextRole === "moderador"
      ? `¿Hacer moderador a ${name}? Podrá gestionar proyectos, tareas, avisos y actividades del club.`
      : `¿Cambiar el rol de ${name} a Estudiante?`;
  if (!window.confirm(prompt)) {
    select.value = currentRole;
    return;
  }
  select.disabled = true;
  try {
    await updateDoc(doc(db, "usuarios", uid), {
      rol: nextRole,
      autorizado: nextRole === "estudiante" ? select.dataset.authorized === "true" : true,
    });
    notify(`${name} ahora tiene el rol ${labels[nextRole]}.`);
    await loadPage();
  } catch (error) {
    select.value = currentRole;
    select.disabled = false;
    notify(errorMessage(error, "No se pudo cambiar el rol."), "error");
  }
}

async function showProject(id: string): Promise<void> {
  const project = await getDoc(doc(db, "proyectos", id));
  if (!project.exists()) return;
  const data = project.data();
  const joined = (data.miembrosUids || []).includes(state.user?.uid);
  const lead = projectLead(data) === state.user?.uid;
  let tasks: QueryDocumentSnapshot<DocumentData>[] = [];
  let requests: QueryDocumentSnapshot<DocumentData>[] = [];
  if (joined || lead || canManageClub()) {
    try { tasks = (await getDocs(collection(db, "proyectos", id, "tareas"))).docs; } catch { /* Rules may limit task access for admins outside the project. */ }
  }
  if ((lead || canManageClub()) && !isStudentPreview()) {
    try { requests = (await getDocs(query(collection(db, "proyectos", id, "solicitudes"), where("estado", "==", "pendiente"), limit(50)))).docs; } catch { /* Only the project lead can review requests. */ }
  }
  const canManage = (lead || canManageClub()) && !isStudentPreview();
  let ownRequestState = "";
  if (state.user && !joined && !lead && !canManageClub()) {
    try {
      const request = await getDoc(doc(db, "proyectos", id, "solicitudes", state.user.uid));
      if (request.exists()) ownRequestState = String(request.get("estado") || "");
    } catch { /* The request document is private to its owner and project lead. */ }
  }
  const done = tasks.filter((task) => task.get("estado") === "Completada").length;
  const percent = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const completionEvent = await getDoc(doc(db, "proyectos", id, "eventos", "completado-v1")).catch(() => null);
  const canEditResponsible = canManageClub() || (!isStudentPreview() && data.creadoPorUid === state.user?.uid);
  const dialog = document.createElement("dialog");
  dialog.className = "detail-dialog";
  const taskObjects = tasks.map((task) => ({ id: task.id, path: task.ref.path, ...task.data() }));
  const joinStatus = !joined && !lead && !canManageClub() ? ownRequestState === "pendiente" ? `<div class="notice-box info">Tu solicitud está pendiente de revisión.</div>` : ownRequestState === "rechazada" ? `<div class="notice-box danger">La solicitud fue rechazada. Puedes volver a enviarla.</div><button class="primary-button" data-action="join-project" data-id="${esc(id)}">Volver a solicitar</button>` : ownRequestState === "aceptada" ? `<div class="notice-box info">Tu solicitud fue aceptada.</div>` : `<button class="primary-button" data-action="join-project" data-id="${esc(id)}">Solicitar ingreso</button>` : "";
  dialog.innerHTML = `<div class="dialog-head"><span class="project-mark">${icon("proyectos", 22)}</span><button class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><p class="eyebrow">PROYECTO</p><h2>${esc(data.nombre || data.titulo || "Proyecto")}</h2><p>${esc(data.descripcion || "Sin descripción")}</p><div class="project-meta"><span>Responsable: ${esc(data.responsableNombre || "Sin asignar")}</span><span>${(data.miembrosUids || []).length} miembros</span></div><section class="project-progress project-detail-progress"><div><span>Avance del proyecto</span><strong>${tasks.length ? `${percent}%` : "Sin tareas"}</strong></div><progress max="100" value="${percent}" aria-label="Progreso del proyecto"></progress><small>${done} de ${tasks.length} tareas completadas</small></section>${canManage && !completionEvent?.exists() ? `<div class="project-toolbar"><button class="primary-button compact" data-action="new-project-task" data-id="${esc(id)}">${icon("sumar")} Nueva tarea</button>${tasks.length > 0 && done === tasks.length ? `<button class="secondary-button compact" data-action="finish-project" data-id="${esc(id)}">Confirmar cierre y avisar</button>` : ""}</div>` : completionEvent?.exists() ? `<div class="notice-box info">Proyecto completado al 100%. Se notificó a los miembros y administradores.</div>` : ""}${requests.length ? `<section class="project-requests"><div class="section-heading"><h3>Solicitudes pendientes</h3><span class="section-count">${requests.length}</span></div>${requests.map((request) => `<article class="request-row"><div><strong>${esc(request.get("nombreCompleto") || "Estudiante")}</strong><small>${esc(request.get("carrera") || "")} · ${esc(request.get("semestre") || "")}</small></div><div class="request-actions"><button class="secondary-button compact" data-action="resolve-project-request" data-id="${esc(id)}" data-uid="${esc(request.id)}" data-decision="rechazada">Rechazar</button><button class="primary-button compact" data-action="resolve-project-request" data-id="${esc(id)}" data-uid="${esc(request.id)}" data-decision="aceptada">Aceptar</button></div></article>`).join("")}</section>` : ""}${tasks.length ? `<h3>Tareas del proyecto</h3><div class="dialog-task-list">${taskObjects.map((task) => projectTaskRow(task, id, canManage, Boolean(completionEvent?.exists()))).join("")}</div>` : `<p class="empty-inline">Todavía no hay tareas en este proyecto.</p>`}${joinStatus}`;
  if (canEditResponsible) dialog.insertAdjacentHTML("beforeend", `<button class="secondary-button compact" data-action="edit-project-responsible" data-id="${esc(id)}">${icon("people", 16)} Cambiar responsable del proyecto</button>`);
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    if (event.target === dialog || action === "close-dialog") dialog.close();
    else if (action === "join-project") void joinProject(id, button);
    else if (action === "new-project-task") void openProjectTaskDialog(id, data);
    else if (action === "resolve-project-request") void resolveProjectRequest(button, dialog);
    else if (action === "finish-project") void finishProject(id, button, dialog);
    else if (action === "complete-task") void completeTask(button.dataset.path!, button, async () => { dialog.close(); await showProject(id); });
    else if (action === "delete-project-task") void deleteProjectTask(button.dataset.path!, button, dialog);
    else if (action === "reassign-task") void openTaskAssignmentDialog(id, button.dataset.task!, button.dataset.title || "Tarea", data);
    else if (action === "edit-project-responsible") { dialog.close(); void openProjectResponsibleDialog(id); }
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
}

function projectLead(project: DocumentData): string {
  return String(project.responsableUid || project.creadoPorUid || "");
}

function projectTaskRow(task: Record<string, any>, projectId: string, canManage: boolean, completedProject: boolean): string {
  const completed = task.estado === "Completada";
  const assigned = task.responsableUid === state.user?.uid || (task.responsableUids || []).includes(state.user?.uid);
  const canDelete = canManage || (completedProject && completed && assigned);
  return `<article class="project-task-row"><div class="project-task-copy"><strong>${esc(task.titulo || "Tarea")}</strong><small>${esc(task.descripcion || "Sin descripción")}</small><span class="state-pill ${completed ? "success" : "warning"}">${esc(task.estado || "Pendiente")}</span></div><div class="project-task-actions">${canManage && !completedProject && !completed ? `<button class="secondary-button compact" data-action="reassign-task" data-task="${esc(task.id)}" data-title="${esc(task.titulo || "Tarea")}">Responsable</button>` : ""}${!completed && assigned ? `<button class="secondary-button compact" data-action="complete-task" data-path="${esc(task.path)}">Completar</button>` : ""}${canDelete ? `<button class="icon-button danger-icon" data-action="delete-project-task" data-path="${esc(task.path)}" aria-label="Eliminar tarea" title="Eliminar tarea">×</button>` : ""}</div></article>`;
}

async function openProjectTaskDialog(projectId: string, project: DocumentData): Promise<void> {
  const users = await getDocs(query(collection(db, "usuarios"), where("autorizado", "==", true), limit(100))).catch(() => null);
  const options = (users?.docs ?? []).map((user) => ({ uid: user.id, name: String(user.get("nombreCompleto") || `${user.get("nombre") || ""} ${user.get("apellido") || ""}`).trim() })).filter((user) => user.uid);
  const form = `<form class="dialog-form" data-form="project-task" data-project="${esc(projectId)}"><div class="dialog-head"><div><p class="eyebrow">${esc(project.nombre || "PROYECTO")}</p><h2>Nueva tarea</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Título<input name="titulo" required maxlength="120" /></label><label>Descripción<textarea name="descripcion" rows="3" maxlength="1000"></textarea></label><div class="field-row"><label>Prioridad<select name="prioridad"><option>Normal</option><option>Alta</option><option>Baja</option></select></label><label>Fecha límite<input name="fechaLimite" type="date" /></label></div><fieldset><legend>Responsables (hasta 5)</legend>${options.map((user) => `<label class="check-label"><input type="checkbox" name="responsables" value="${esc(user.uid)}" data-name="${esc(user.name)}" />${esc(user.name)}</label>`).join("") || `<p class="empty-inline">No hay estudiantes autorizados para asignar.</p>`}</fieldset><button class="primary-button" type="submit">Crear tarea</button></form>`;
  const dialog = document.createElement("dialog");
  dialog.className = "detail-dialog form-dialog";
  dialog.innerHTML = form;
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener("click", (event) => { if (event.target === dialog || (event.target as HTMLElement).closest('[data-action="close-dialog"]')) dialog.close(); });
  dialog.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name !== "responsables" || !input.checked) return;
    const selected = dialog.querySelectorAll<HTMLInputElement>('input[name="responsables"]:checked');
    if (selected.length > 5) { input.checked = false; notify("Puedes asignar hasta cinco responsables.", "error"); }
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
}

async function openTaskAssignmentDialog(projectId: string, taskId: string, taskTitle: string, project: DocumentData): Promise<void> {
  const users = await getDocs(query(collection(db, "usuarios"), where("autorizado", "==", true), limit(100))).catch(() => null);
  const options = (users?.docs ?? []).map((user) => ({ uid: user.id, name: String(user.get("nombreCompleto") || `${user.get("nombre") || ""} ${user.get("apellido") || ""}`).trim() }));
  const task = await getDoc(doc(db, "proyectos", projectId, "tareas", taskId));
  const existing = task.exists() ? task.get("responsableUids") || [] : [];
  const html = `<form class="dialog-form" data-form="task-assignment" data-project="${esc(projectId)}" data-task="${esc(taskId)}"><div class="dialog-head"><div><p class="eyebrow">${esc(project.nombre || "PROYECTO")}</p><h2>Cambiar responsables</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><p>${esc(taskTitle)}</p><fieldset><legend>Selecciona hasta cinco personas</legend>${options.map((user) => `<label class="check-label"><input type="checkbox" name="responsables" value="${esc(user.uid)}" data-name="${esc(user.name)}" ${existing.includes(user.uid) ? "checked" : ""} />${esc(user.name)}</label>`).join("")}</fieldset><button class="primary-button" type="submit">Guardar responsables</button></form>`;
  const dialog = document.createElement("dialog");
  dialog.className = "detail-dialog form-dialog";
  dialog.innerHTML = html;
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener("click", (event) => { if (event.target === dialog || (event.target as HTMLElement).closest('[data-action="close-dialog"]')) dialog.close(); });
  dialog.addEventListener("change", (event) => {
    const input = event.target as HTMLInputElement;
    if (input.name !== "responsables" || !input.checked) return;
    const selected = dialog.querySelectorAll<HTMLInputElement>('input[name="responsables"]:checked');
    if (selected.length > 5) { input.checked = false; notify("Puedes asignar hasta cinco responsables.", "error"); }
  });
  dialog.addEventListener("close", () => dialog.remove(), { once: true });
}

async function resolveProjectRequest(button: HTMLButtonElement, dialog: HTMLDialogElement): Promise<void> {
  const projectId = button.dataset.id!;
  const uid = button.dataset.uid!;
  const decision = button.dataset.decision!;
  const requestRef = doc(db, "proyectos", projectId, "solicitudes", uid);
  const projectRef = doc(db, "proyectos", projectId);
  const eventRef = doc(collection(db, "notificationOutbox"));
  setBusy(button, true);
  try {
    await runTransaction(db, async (transaction) => {
      const [request, project] = await Promise.all([transaction.get(requestRef), transaction.get(projectRef)]);
      if (!request.exists() || request.get("estado") !== "pendiente") throw new Error("La solicitud ya fue respondida.");
      if (!project.exists() || (!canManageClub() && projectLead(project.data()) !== state.user?.uid)) throw new Error("Solo el responsable o un moderador pueden resolver solicitudes.");
      if (decision === "aceptada") {
        const members = Array.isArray(project.get("miembrosUids")) ? [...project.get("miembrosUids")] : [];
        if (!members.includes(uid)) members.push(uid);
        transaction.update(projectRef, { miembrosUids: members });
      }
      transaction.update(requestRef, { estado: decision, notificationEventId: eventRef.id });
      transaction.set(eventRef, {
        tipo: "join-decision", proyectoId: projectId, solicitudUid: uid, decision,
        actorUid: state.user!.uid, createdAt: serverTimestamp(), status: "pending",
      });
    });
    notify(decision === "aceptada" ? "Solicitud aceptada." : "Solicitud rechazada.");
    dialog.close();
    await showProject(projectId);
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo resolver la solicitud."), "error");
  }
}

async function finishProject(projectId: string, button: HTMLButtonElement, dialog: HTMLDialogElement): Promise<void> {
  if (!state.user || !isAuthorized()) return;
  setBusy(button, true);
  try {
    const projectRef = doc(db, "proyectos", projectId);
    const project = await getDoc(projectRef);
    if (!project.exists() || (!canManageClub() && projectLead(project.data()) !== state.user.uid)) throw new Error("Solo el responsable o un moderador pueden confirmar el cierre.");
    const tasks = await getDocs(collection(db, "proyectos", projectId, "tareas"));
    if (tasks.empty || tasks.docs.some((task) => task.get("estado") !== "Completada")) throw new Error("El proyecto ya no está al 100%. Actualiza y vuelve a intentar.");
    const prior = await getDoc(doc(db, "proyectos", projectId, "eventos", "completado-v1"));
    if (prior.exists()) throw new Error("Este proyecto ya fue cerrado.");
    const admins = await getDocs(query(collection(db, "usuarios"), where("rol", "==", "admin"), limit(100)));
    const recipients = [...new Set([...(project.get("miembrosUids") || []), String(project.get("responsableUid") || ""), ...admins.docs.map((admin) => admin.id)].filter(Boolean))];
    if (recipients.length > 499) throw new Error("Hay demasiados destinatarios para registrar el aviso en una sola operación.");
    const batch = writeBatch(db);
    batch.set(doc(db, "proyectos", projectId, "eventos", "completado-v1"), {
      tipo: "proyecto_completado", fechaCreacion: serverTimestamp(),
      cerradoPorUid: state.user.uid, cerradoPorNombre: fullName(), cantidadTareas: tasks.size,
    });
    const name = String(project.get("nombre") || project.get("titulo") || "el proyecto");
    recipients.forEach((uid) => batch.set(doc(collection(db, "usuarios", uid, "notificaciones")), {
      proyectoId: projectId, tipo: "proyecto_completado", titulo: "Proyecto completado",
      mensaje: `El proyecto «${name}» llegó al 100% de sus tareas.`, prioridad: "Normal",
      emisorUid: state.user!.uid, fechaCreacion: serverTimestamp(), leida: false,
    }));
    await batch.commit();
    notify("Proyecto cerrado. Se notificó a sus miembros y administradores.");
    dialog.close();
    await showProject(projectId);
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo confirmar el cierre."), "error");
  }
}

async function deleteProjectTask(path: string, button: HTMLButtonElement, dialog: HTMLDialogElement): Promise<void> {
  if (!window.confirm("¿Eliminar esta tarea? Esta acción no se puede deshacer.")) return;
  setBusy(button, true);
  try {
    await deleteDoc(doc(db, path));
    notify("Tarea eliminada.");
    dialog.close();
    await showProject(path.split("/")[1]);
  } catch (error) {
    setBusy(button, false);
    notify(errorMessage(error, "No se pudo eliminar la tarea."), "error");
  }
}

function openDialog(id: string): void {
  const templates: Record<string, string> = {
    "notice-dialog": `<form class="dialog-form" data-form="notice"><div class="dialog-head"><div><p class="eyebrow">COMUNICACIÓN</p><h2>Publicar aviso</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Título<input name="titulo" required maxlength="100" /></label><label>Mensaje<textarea name="mensaje" required rows="4" maxlength="1500"></textarea></label><label>Prioridad<select name="prioridad"><option>Normal</option><option>Importante</option><option>Baja</option></select></label><button class="primary-button" type="submit">Publicar aviso</button></form>`,
    "item-dialog": `<form class="dialog-form" data-form="item"><div class="dialog-head"><div><p class="eyebrow">RECURSOS</p><h2>Nuevo artículo</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Nombre<input name="nombre" required maxlength="100" /></label><label>Descripción<textarea name="descripcion" rows="3"></textarea></label><div class="field-row"><label>Categoría<input name="categoria" required /></label><label>Cantidad<input name="cantidad" type="number" min="0" required /></label></div><label>Ubicación<input name="ubicacion" /></label><button class="primary-button" type="submit">Guardar artículo</button></form>`,
    "project-dialog": `<form class="dialog-form" data-form="project"><div class="dialog-head"><div><p class="eyebrow">TRABAJO DEL CLUB</p><h2>Nuevo proyecto</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Nombre<input name="nombre" required maxlength="100" /></label><label>Descripción<textarea name="descripcion" rows="3"></textarea></label><fieldset><legend>Áreas</legend>${["Electrónica", "Mecánica", "Programación"].map((name) => `<label class="check-label"><input type="checkbox" name="departamentos" value="${name}" />${name}</label>`).join("")}</fieldset><button class="primary-button" type="submit">Crear proyecto</button></form>`,
  };
  templates["course-dialog"] = `<form class="dialog-form" data-form="course"><div class="dialog-head"><div><p class="eyebrow">FORMACIÓN Robótica SIL</p><h2>Publicar curso</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Nombre del curso<input name="titulo" required maxlength="100" /></label><label>Descripción<textarea name="descripcion" rows="3" maxlength="1000"></textarea></label><label>Instructor o responsable<input name="instructor" required maxlength="100" /></label><div class="field-row"><label>Fecha de inicio<input type="date" name="fechaInicio" required /></label><label>Fecha de fin<input type="date" name="fechaFin" required /></label></div><label>Horario<input name="horario" required maxlength="120" placeholder="Ej. martes y jueves, 15:00 a 17:00" /></label><div class="field-row"><label>Modalidad<select name="modalidad"><option>Presencial</option><option>Virtual</option><option>Híbrido</option></select></label><label>Lugar o enlace de referencia<input name="lugar" maxlength="120" /></label></div><button class="primary-button" type="submit">Publicar para inscripción</button></form>`;
  const today = state.calendarSelectedDate || calendarDateKey(new Date());
  const termEnd = calendarDateKey(new Date(new Date(`${today}T12:00:00`).getTime() + 150 * 24 * 60 * 60 * 1000));
  Object.assign(templates, {
    "calendar-class-dialog": `<form class="dialog-form" data-form="calendar-class"><div class="dialog-head"><div><p class="eyebrow">MI HORARIO</p><h2>Agregar clase semanal</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Materia<input name="materia" required maxlength="80" /></label><fieldset class="calendar-weekday-options"><legend>Días de clase</legend>${[[1, "Lun"], [2, "Mar"], [3, "Mié"], [4, "Jue"], [5, "Vie"], [6, "Sáb"], [7, "Dom"]].map(([value, label]) => `<label class="check-label"><input type="checkbox" name="diasSemana" value="${value}" />${label}</label>`).join("")}</fieldset><div class="field-row"><label>Desde<input type="date" name="desde" value="${today}" required /></label><label>Hasta<input type="date" name="hasta" value="${termEnd}" required /></label></div><div class="field-row"><label>Hora de inicio<input type="time" name="horaInicio" required /></label><label>Hora de fin<input type="time" name="horaFin" required /></label></div><label>Aula (opcional)<input name="aula" maxlength="60" /></label><button class="primary-button" type="submit">Guardar horario</button></form>`,
    "calendar-exam-dialog": `<form class="dialog-form" data-form="calendar-exam"><div class="dialog-head"><div><p class="eyebrow">MI CALENDARIO</p><h2>Agregar examen</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Nombre del examen<input name="titulo" required maxlength="100" placeholder="Ej. Parcial 1" /></label><label>Materia<input name="materia" required maxlength="80" /></label><div class="field-row"><label>Fecha<input type="date" name="fecha" value="${today}" required /></label><label>Hora<input type="time" name="hora" required /></label></div><label>Lugar (opcional)<input name="lugar" maxlength="100" /></label><label>Notas (opcional)<textarea name="notas" rows="2" maxlength="300"></textarea></label><button class="primary-button" type="submit">Guardar examen</button></form>`,
    "club-activity-dialog": `<form class="dialog-form" data-form="club-activity"><div class="dialog-head"><div><p class="eyebrow">CALENDARIO DEL CLUB</p><h2>Nueva actividad</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><label>Actividad<input name="titulo" required maxlength="100" /></label><label>Tipo<select name="categoria"><option>Reunión</option><option>Taller</option><option>Evento</option><option>Entrega</option><option>Otro</option></select></label><label>Descripción (opcional)<textarea name="descripcion" rows="2" maxlength="500"></textarea></label><div class="field-row"><label>Fecha de inicio<input type="date" name="fechaInicio" value="${today}" required /></label><label>Hora<input type="time" name="horaInicio" value="15:00" required /></label></div><div class="field-row"><label>Fecha de fin<input type="date" name="fechaFin" value="${today}" required /></label><label>Hora<input type="time" name="horaFin" value="16:00" required /></label></div><label>Lugar<input name="lugar" required maxlength="100" /></label><button class="primary-button" type="submit">Publicar actividad</button></form>`,
  });
  let dialog = document.getElementById(id) as HTMLDialogElement | null;
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = id;
    dialog.className = "detail-dialog form-dialog";
    document.body.append(dialog);
  }
  dialog.innerHTML = templates[id] || "";
  dialog.showModal();
  dialog.addEventListener("click", (event) => { if (event.target === dialog || (event.target as HTMLElement).closest('[data-action="close-dialog"]')) dialog?.close(); });
}

async function installApp(): Promise<void> {
  const installPrompt = state.installPrompt;
  if (!installPrompt) {
    showInstallInstructions();
    return;
  }

  try {
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    state.installPrompt = undefined;
    render();
    if (choice.outcome === "accepted") notify(`${CLUB_SHORT_NAME} se está instalando.`);
  } catch {
    showInstallInstructions();
  }
}

function showInstallInstructions(): void {
  const isAppleMobile = /iPhone|iPad|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const steps = isAppleMobile
    ? ["Pulsa el botón Compartir del navegador.", "Selecciona Añadir a pantalla de inicio.", "Confirma con Añadir."]
    : ["Abre el menú del navegador (⋮).", "Elige Instalar aplicación o Añadir a pantalla principal.", "Confirma la instalación."];
  let dialog = document.getElementById("install-guide") as HTMLDialogElement | null;
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "install-guide";
    dialog.className = "detail-dialog install-guide-dialog";
    document.body.append(dialog);
  }
  dialog.innerHTML = `<div class="install-guide-content"><div class="dialog-head"><div><p class="eyebrow">${CLUB_SHORT_NAME}</p><h2>Instalar en el teléfono</h2></div><button type="button" class="icon-button" data-action="close-dialog" aria-label="Cerrar">×</button></div><ol>${steps.map((step) => `<li>${step}</li>`).join("")}</ol><button type="button" class="primary-button" data-action="close-dialog">Entendido</button></div>`;
  dialog.showModal();
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog?.close();
  });
}

function closeDialog(): void {
  document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((dialog) => dialog.close());
}

window.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  if (target.closest('[data-action="close-dialog"]')) closeDialog();
});

render();

