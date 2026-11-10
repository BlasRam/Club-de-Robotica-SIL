import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  Timestamp,
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  getDocs,
  query,
  getDoc,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";

const projectId = "cdr-firestore-rules-tests";
let environment;

before(async () => {
  environment = await initializeTestEnvironment({
    projectId,
    firestore: { rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8") },
  });
});

after(async () => {
  await environment.cleanup();
});

beforeEach(async () => {
  await environment.clearFirestore();
});

async function seed(documents) {
  await environment.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await Promise.all(
      Object.entries(documents).map(([path, value]) => setDoc(doc(db, path), value)),
    );
  });
}

function as(uid, claims = {}) {
  return environment.authenticatedContext(uid, {
    email: `${uid}@__DOMINIO_INSTITUCIONAL__`,
    email_verified: true,
    ...claims,
  }).firestore();
}

test("reserva: estudiante crea la propia y solo administración la aprueba", async () => {
  await seed({
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "usuarios/admin2": { uid: "admin2", rol: "admin", autorizado: true },
    "inventario/scope-1": { nombre: "Osciloscopio", cantidad: 5, estado: "Disponible" },
  });

  const db = as("student");
  const start = Timestamp.fromDate(new Date("2026-11-10T12:00:00Z"));
  const end = Timestamp.fromDate(new Date("2026-11-12T12:00:00Z"));
  const reservation = doc(collection(db, "reservas"));
  await assertSucceeds(setDoc(reservation, {
    recursoNombre: "Osciloscopio",
    recursoId: "scope-1",
    cantidadSolicitada: 2,
    motivo: "Práctica",
    solicitanteUid: "student",
    solicitanteNombre: "Estudiante",
    estado: "Pendiente",
    fechaReserva: start,
    fechaInicioUso: start,
    fechaDevolucion: end,
    fechaCreacion: Timestamp.now(),
  }));
  await assertFails(updateDoc(reservation, { estado: "Aprobada" }));
  await assertSucceeds(updateDoc(doc(as("admin"), reservation.path), {
    estado: "Aprobada",
    aprobadoPorUid: "admin",
    aprobadoPorNombre: "Admin original",
  }));
  const proposalDate = Timestamp.fromDate(new Date("2026-11-14T12:00:00Z"));
  await assertSucceeds(updateDoc(reservation, {
    accionSolicitada: "Prorroga",
    fechaDevolucionPropuesta: proposalDate,
    motivoSolicitud: "Necesito un día más",
    estadoSolicitud: "Pendiente",
  }));
  await assertSucceeds(setDoc(doc(collection(as("student"), "usuarios/admin/notificaciones"), "loan-proposal"), {
    proyectoId: "",
    tipo: "prestamo",
    reservaId: reservation.id,
    titulo: "Solicitud de prórroga",
    mensaje: "El estudiante solicita extender el préstamo",
    prioridad: "Normal",
    emisorUid: "student",
    fechaCreacion: Timestamp.now(),
    leida: false,
  }));
  await assertFails(setDoc(doc(collection(as("student"), "usuarios/admin2/notificaciones"), "loan-proposal"), {
    proyectoId: "",
    tipo: "prestamo",
    reservaId: reservation.id,
    titulo: "Solicitud de prórroga",
    mensaje: "No debe notificarse a otro aprobador",
    prioridad: "Normal",
    emisorUid: "student",
    fechaCreacion: Timestamp.now(),
    leida: false,
  }));
  await assertSucceeds(updateDoc(doc(as("admin2"), reservation.path), {
    fechaDevolucion: proposalDate,
    estadoSolicitud: "Aprobada",
    resueltaPorUid: "admin2",
    resueltaPorNombre: "Admin alternativo",
  }));
  const returnRequest = writeBatch(db);
  returnRequest.update(reservation, {
    accionSolicitada: "Devolucion",
    fechaDevolucionPropuesta: null,
    motivoSolicitud: "",
    estadoSolicitud: "Pendiente",
  });
  returnRequest.set(doc(db, "usuarios/admin/notificaciones/return-request"), {
    proyectoId: "",
    tipo: "prestamo",
    reservaId: reservation.id,
    titulo: "Solicitud de devolución",
    mensaje: "El estudiante solicita devolver el artículo",
    prioridad: "Normal",
    emisorUid: "student",
    fechaCreacion: Timestamp.now(),
    leida: false,
  });
  await assertSucceeds(returnRequest.commit());

  const adminDb = as("admin2");
  const returnBatch = writeBatch(adminDb);
  returnBatch.update(doc(adminDb, "inventario/scope-1"), { cantidad: 7, estado: "Disponible" });
  returnBatch.set(doc(adminDb, "prestamosArchivados/returned-loan"), {
    reservaId: reservation.id,
    recursoId: "scope-1",
    recursoNombre: "Osciloscopio",
    cantidadSolicitada: 2,
    motivo: "Práctica",
    solicitanteUid: "student",
    solicitanteNombre: "Estudiante",
    fechaInicioUso: start,
    fechaDevolucion: proposalDate,
    aprobadoPorUid: "admin",
    aprobadoPorNombre: "Admin original",
    devueltoPorUid: "admin2",
    devueltoPorNombre: "Admin alternativo",
    fechaDevolucionReal: Timestamp.now(),
    estado: "Devuelta",
  });
  returnBatch.delete(doc(adminDb, reservation.path));
  returnBatch.set(doc(adminDb, "usuarios/student/notificaciones/return-approved"), {
    proyectoId: "",
    tipo: "prestamo",
    reservaId: reservation.id,
    titulo: "Solicitud de préstamo autorizada",
    mensaje: "Se registró la devolución del artículo",
    prioridad: "Normal",
    emisorUid: "admin2",
    fechaCreacion: Timestamp.now(),
    leida: false,
  });
  await assertSucceeds(returnBatch.commit());
  const invalidQuantity = doc(collection(db, "reservas"));
  await assertFails(setDoc(invalidQuantity, {
    recursoNombre: "Osciloscopio",
    recursoId: "scope-1",
    cantidadSolicitada: 0,
    motivo: "Prueba",
    solicitanteUid: "student",
    solicitanteNombre: "Estudiante",
    estado: "Pendiente",
    fechaReserva: start,
    fechaInicioUso: start,
    fechaDevolucion: end,
    fechaCreacion: Timestamp.now(),
  }));
  const tooManyUnits = doc(collection(db, "reservas"));
  await assertFails(setDoc(tooManyUnits, {
    recursoNombre: "Osciloscopio",
    recursoId: "scope-1",
    cantidadSolicitada: 8,
    motivo: "Prueba",
    solicitanteUid: "student",
    solicitanteNombre: "Estudiante",
    estado: "Pendiente",
    fechaReserva: start,
    fechaInicioUso: start,
    fechaDevolucion: end,
    fechaCreacion: Timestamp.now(),
  }));
  await assertFails(deleteDoc(doc(as("student"), reservation.path)));
  await assertSucceeds(deleteDoc(doc(as("admin"), reservation.path)));
});

test("avisos: usuarios autorizados reaccionan solo con su propia identidad", async () => {
  await seed({
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/other": { uid: "other", rol: "estudiante", autorizado: true },
    "usuarios/pending": { uid: "pending", rol: "estudiante", autorizado: false },
    "avisos/notice-1": {
      titulo: "Aviso de prueba",
      mensaje: "Contenido",
      prioridad: "Normal",
      autorUid: "admin",
      autorNombre: "Administración",
      fechaCreacion: Timestamp.now(),
    },
  });

  const ownReaction = doc(as("student"), "avisos/notice-1/reacciones/student");
  const otherReaction = doc(as("other"), "avisos/notice-1/reacciones/student");
  const reaction = { tipo: "me_gusta", fechaActualizacion: Timestamp.now() };

  await assertSucceeds(setDoc(ownReaction, reaction));
  await assertSucceeds(updateDoc(ownReaction, { tipo: "celebrar" }));
  await assertSucceeds(getDocs(collection(as("other"), "avisos/notice-1/reacciones")));
  await assertFails(setDoc(otherReaction, { ...reaction, tipo: "me_encanta" }));
  await assertFails(setDoc(
    doc(as("pending"), "avisos/notice-1/reacciones/pending"),
    reaction,
  ));
  await assertSucceeds(deleteDoc(ownReaction));
});

test("actividad administrativa: solo administración puede registrar y consultar eventos inmutables", async () => {
  await seed({
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
  });

  const eventoAdmin = doc(as("admin"), "actividadAdmin/aprobacion-1");
  const evento = {
    tipo: "prestamo_aprobado",
    titulo: "Préstamo aprobado",
    detalle: "Multímetro · Estudiante · 1 unidad(es)",
    emisorUid: "admin",
    emisorNombre: "Admin CDR",
    entidadId: "reserva-1",
    fechaCreacion: Timestamp.now(),
  };

  await assertSucceeds(setDoc(eventoAdmin, evento));
  await assertSucceeds(getDocs(collection(as("admin"), "actividadAdmin")));
  await assertFails(getDocs(collection(as("student"), "actividadAdmin")));
  await assertFails(setDoc(doc(as("student"), "actividadAdmin/falso"), {
    ...evento,
    emisorUid: "student",
  }));
  await assertFails(updateDoc(eventoAdmin, { titulo: "Modificado" }));
  await assertFails(deleteDoc(eventoAdmin));
});

test("reservation: admin records return when borrower profile is deleted", async () => {
  await seed({
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "inventario/scope-1": { cantidad: 3, estado: "Disponible" },
    "reservas/loan-1": {
      recursoId: "scope-1",
      recursoNombre: "Osciloscopio",
      cantidadSolicitada: 2,
      motivo: "Practica",
      solicitanteUid: "deleted-student",
      solicitanteNombre: "Usuario eliminado",
      estado: "Aprobada",
      fechaInicioUso: Timestamp.now(),
      fechaDevolucion: Timestamp.now(),
      aprobadoPorUid: "admin",
      aprobadoPorNombre: "Admin",
    },
  });

  const db = as("admin");
  const batch = writeBatch(db);
  batch.update(doc(db, "inventario/scope-1"), { cantidad: 5, estado: "Disponible" });
  batch.set(doc(db, "prestamosArchivados/loan-1"), {
    reservaId: "loan-1",
    recursoId: "scope-1",
    recursoNombre: "Osciloscopio",
    cantidadSolicitada: 2,
    motivo: "Practica",
    solicitanteUid: "deleted-student",
    solicitanteNombre: "Usuario eliminado",
    fechaInicioUso: Timestamp.now(),
    fechaDevolucion: Timestamp.now(),
    aprobadoPorUid: "admin",
    aprobadoPorNombre: "Admin",
    devueltoPorUid: "admin",
    devueltoPorNombre: "Admin",
    fechaDevolucionReal: Timestamp.now(),
    estado: "Devuelta",
  });
  batch.delete(doc(db, "reservas/loan-1"));

  await assertSucceeds(batch.commit());
  await assertSucceeds(getDoc(doc(db, "prestamosArchivados/loan-1")));
  await assertSucceeds(getDoc(doc(db, "inventario/scope-1")));
  await assertSucceeds(getDoc(doc(db, "reservas/loan-1")));
});

test("inventario: solo administración puede cambiar cantidad", async () => {
  await seed({
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "inventario/scope-1": {
      nombre: "Osciloscopio",
      descripcion: "",
      categoria: "Medición",
      cantidad: 5,
      ubicacion: "Lab",
      estado: "Disponible",
      creadoPorUid: "admin",
      creadoPorNombre: "Admin",
      fechaCreacion: Timestamp.now(),
    },
  });
  await assertFails(updateDoc(doc(as("student"), "inventario/scope-1"), { cantidad: 3 }));
  await assertSucceeds(updateDoc(doc(as("admin"), "inventario/scope-1"), { cantidad: 3 }));
  await assertFails(deleteDoc(doc(as("student"), "inventario/scope-1")));
  await assertSucceeds(deleteDoc(doc(as("admin"), "inventario/scope-1")));
});

test("tareas: administradores pueden consultar progreso por grupo de colecciones", async () => {
  await seed({
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "proyectos/project": { responsableUid: "someone-else", creadoPorUid: "admin", miembrosUids: [] },
    "proyectos/project/tareas/task-1": { estado: "Pendiente", responsableUid: "someone-else" },
  });

  const adminQuery = query(collectionGroup(as("admin"), "tareas"), where("estado", "==", "Pendiente"));
  const studentQuery = query(collectionGroup(as("student"), "tareas"), where("estado", "==", "Pendiente"));
  await assertSucceeds(getDocs(adminQuery));
  await assertFails(getDocs(studentQuery));
});

test("tareas: responsable crea, varios asignados acceden y terceros quedan bloqueados", async () => {
  await seed({
    "usuarios/lead": { uid: "lead", rol: "estudiante", autorizado: true },
    "usuarios/one": { uid: "one", rol: "estudiante", autorizado: true },
    "usuarios/two": { uid: "two", rol: "estudiante", autorizado: true },
    "usuarios/outsider": { uid: "outsider", rol: "estudiante", autorizado: true },
    "proyectos/project": {
      creadoPorUid: "admin",
      responsableUid: "lead",
      miembrosUids: ["one", "two"],
    },
  });

  const leadDb = as("lead");
  const task = doc(collection(leadDb, "proyectos/project/tareas"));
  const createEvent = doc(leadDb, `notificationOutbox/${task.id}-created`);
  const createBatch = writeBatch(leadDb);
  createBatch.set(task, {
    proyectoId: "project",
    titulo: "Probar sensores",
    descripcion: "Verificar lecturas",
    responsableUid: "one",
    responsableNombre: "Uno",
    responsableUids: ["one", "two"],
    responsablesNombres: ["Uno", "Dos"],
    prioridad: "Media",
    fechaLimite: null,
    estado: "Pendiente",
    fechaCreacion: Timestamp.now(),
    notificationEventId: createEvent.id,
    assignmentVersion: createEvent.id,
  });
  createBatch.set(createEvent, {
    tipo: "task-created",
    proyectoId: "project",
    tareaId: task.id,
    assignmentVersion: createEvent.id,
    actorUid: "lead",
    createdAt: Timestamp.now(),
    status: "pending",
  });
  await assertSucceeds(createBatch.commit());

  const reassignmentEvent = doc(leadDb, "notificationOutbox/task-reassignment-1");
  const reassignmentBatch = writeBatch(leadDb);
  reassignmentBatch.update(task, {
    responsableUid: "two",
    responsableNombre: "Dos",
    responsableUids: ["two"],
    responsablesNombres: ["Dos"],
    notificationEventId: reassignmentEvent.id,
    assignmentVersion: reassignmentEvent.id,
  });
  reassignmentBatch.set(reassignmentEvent, {
    tipo: "task-reassigned",
    proyectoId: "project",
    tareaId: task.id,
    assignmentVersion: reassignmentEvent.id,
    actorUid: "lead",
    createdAt: Timestamp.now(),
    status: "pending",
  });
  await assertSucceeds(reassignmentBatch.commit());

  await assertSucceeds(setDoc(doc(collection(leadDb, "usuarios/two/notificaciones")), {
    proyectoId: "project",
    tareaId: task.id,
    titulo: "Nueva tarea asignada",
    mensaje: "Te asignaron una tarea",
    prioridad: "Normal",
    emisorUid: "lead",
    fechaCreacion: Timestamp.now(),
    leida: false,
  }));
  await assertSucceeds(setDoc(doc(collection(leadDb, "usuarios/one/notificaciones")), {
    proyectoId: "project",
    tipo: "proyecto",
    titulo: "Aviso del proyecto",
    mensaje: "Reunión el viernes",
    prioridad: "Normal",
    emisorUid: "lead",
    fechaCreacion: Timestamp.now(),
    leida: false,
  }));
  await assertFails(setDoc(doc(collection(as("one"), "usuarios/two/notificaciones")), {
    proyectoId: "project",
    tipo: "proyecto",
    titulo: "Aviso sin permiso",
    mensaje: "No autorizado",
    prioridad: "Normal",
    emisorUid: "one",
    fechaCreacion: Timestamp.now(),
    leida: false,
  }));
  await assertFails(setDoc(doc(collection(leadDb, "usuarios/outsider/notificaciones")), {
    proyectoId: "project",
    tareaId: task.id,
    titulo: "Nueva tarea asignada",
    mensaje: "Te asignaron una tarea",
    prioridad: "Normal",
    emisorUid: "lead",
    fechaCreacion: Timestamp.now(),
    leida: false,
  }));
  await assertFails(setDoc(doc(collection(leadDb, "usuarios/outsider/notificaciones")), {
    proyectoId: "project",
    tipo: "proyecto",
    titulo: "Aviso del proyecto",
    mensaje: "No eres miembro",
    prioridad: "Normal",
    emisorUid: "lead",
    fechaCreacion: Timestamp.now(),
    leida: false,
  }));

  await assertSucceeds(getDoc(doc(as("two"), task.path)));
  await assertFails(getDoc(doc(as("outsider"), task.path)));
  await assertSucceeds(updateDoc(doc(as("two"), task.path), { estado: "Completada" }));
  await assertFails(deleteDoc(doc(as("two"), task.path)));
  await seed({
    "proyectos/project/eventos/completado-v1": {
      tipo: "proyecto-completado",
      fechaCreacion: Timestamp.now(),
    },
  });
  await assertSucceeds(getDoc(doc(as("two"), "proyectos/project/eventos/completado-v1")));
  await assertFails(updateDoc(doc(as("two"), "proyectos/project/eventos/completado-v1"), { tipo: "changed" }));
  await assertSucceeds(deleteDoc(doc(as("two"), task.path)));
  await assertFails(deleteDoc(doc(as("outsider"), task.path)));
  await assertFails(setDoc(doc(collection(as("one"), "proyectos/project/tareas")), {
    proyectoId: "project",
    titulo: "No autorizada",
    descripcion: "",
    responsableUid: "",
    responsableNombre: "",
    responsableUids: [],
    responsablesNombres: [],
    prioridad: "Media",
    fechaLimite: null,
    estado: "Pendiente",
    fechaCreacion: Timestamp.now(),
  }));
});

test("reglas nuevas mantienen compatibles las APK antiguas sin outbox", async () => {
  await seed({
    "usuarios/lead": { uid: "lead", rol: "estudiante", autorizado: true },
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "proyectos/project": { creadoPorUid: "admin", responsableUid: "lead", miembrosUids: [] },
  });

  const leadDb = as("lead");
  await assertSucceeds(setDoc(doc(collection(leadDb, "proyectos/project/tareas")), {
    proyectoId: "project",
    titulo: "Tarea desde APK anterior",
    descripcion: "",
    responsableUid: "student",
    responsableNombre: "Estudiante",
    responsableUids: ["student"],
    responsablesNombres: ["Estudiante"],
    prioridad: "Media",
    fechaLimite: null,
    estado: "Pendiente",
    fechaCreacion: Timestamp.now(),
  }));

  const request = doc(leadDb, "proyectos/project/solicitudes/student");
  await assertSucceeds(setDoc(doc(as("student"), request.path), {
    uid: "student",
    estado: "pendiente",
  }));
  await assertSucceeds(updateDoc(request, { estado: "aceptada" }));
});

test("tokens FCM: cada usuario registra y elimina solo los propios, sin leerlos", async () => {
  await seed({
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/other": { uid: "other", rol: "estudiante", autorizado: true },
  });
  const tokenRef = doc(as("student"), "usuarios/student/fcmTokens/device-1");
  const token = "fcm-registration-token-".padEnd(140, "x");
  await assertSucceeds(setDoc(tokenRef, {
    token,
    platform: "android",
    appVersion: "1.3",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }));
  await assertFails(getDoc(tokenRef));
  await assertFails(setDoc(doc(as("other"), tokenRef.path), {
    token,
    platform: "android",
    appVersion: "1.3",
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  }));
  await assertSucceeds(deleteDoc(tokenRef));
});

test("administracion puede limpiar datos privados al eliminar un perfil", async () => {
  await seed({
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/student/notificaciones/notice-1": { titulo: "Aviso" },
    "usuarios/student/avisosOcultos/notice-2": { fechaOcultado: Timestamp.now() },
    "usuarios/student/fcmTokens/device-1": {
      token: "fcm-registration-token-".padEnd(140, "x"),
      platform: "android",
      appVersion: "1.3",
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    },
    "presencias/student": { dentro: false },
    "accesos/access-1": { uid: "student", tipo: "entrada" },
    "reservas/loan-1": { solicitanteUid: "student", estado: "Devuelta" },
  });

  const studentToken = doc(as("student"), "usuarios/student/fcmTokens/device-1");
  await assertFails(getDoc(studentToken));
  const adminDb = as("admin");
  await assertSucceeds(getDoc(doc(adminDb, "usuarios/student/fcmTokens/device-1")));
  const batch = writeBatch(adminDb);
  for (const path of [
    "usuarios/student/notificaciones/notice-1",
    "usuarios/student/avisosOcultos/notice-2",
    "usuarios/student/fcmTokens/device-1",
    "presencias/student",
    "accesos/access-1",
    "reservas/loan-1",
    "usuarios/student",
  ]) {
    batch.delete(doc(adminDb, path));
  }
  await assertSucceeds(batch.commit());
});

test("proyecto: cierre confirmado notifica miembros y administradores una sola vez", async () => {
  await seed({
    "usuarios/lead": { uid: "lead", rol: "estudiante", autorizado: true },
    "usuarios/member": { uid: "member", rol: "estudiante", autorizado: true },
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "usuarios/outsider": { uid: "outsider", rol: "estudiante", autorizado: true },
    "proyectos/project": {
      creadoPorUid: "admin",
      responsableUid: "lead",
      miembrosUids: ["member"],
    },
  });

  const leadDb = as("lead");
  const batch = writeBatch(leadDb);
  batch.set(doc(leadDb, "proyectos/project/eventos/completado-v1"), {
    tipo: "proyecto_completado",
    fechaCreacion: Timestamp.now(),
    cerradoPorUid: "lead",
    cerradoPorNombre: "Responsable",
    cantidadTareas: 2,
  });
  for (const uid of ["member", "admin"]) {
    batch.set(doc(collection(leadDb, `usuarios/${uid}/notificaciones`), "project-complete"), {
      proyectoId: "project",
      tipo: "proyecto_completado",
      titulo: "Proyecto completado",
      mensaje: "El proyecto llegó al 100%.",
      prioridad: "Normal",
      emisorUid: "lead",
      fechaCreacion: Timestamp.now(),
      leida: false,
    });
  }
  await assertSucceeds(batch.commit());

  await assertSucceeds(getDoc(doc(as("member"), "proyectos/project/eventos/completado-v1")));
  await assertFails(deleteDoc(doc(as("admin"), "proyectos/project/eventos/completado-v1")));
  const adminDb = as("admin");
  const deleteProjectBatch = writeBatch(adminDb);
  deleteProjectBatch.delete(doc(adminDb, "proyectos/project/eventos/completado-v1"));
  deleteProjectBatch.delete(doc(adminDb, "proyectos/project"));
  await assertSucceeds(deleteProjectBatch.commit());
  await assertFails(setDoc(doc(collection(leadDb, "usuarios/outsider/notificaciones")), {
    proyectoId: "project",
    tipo: "proyecto_completado",
    titulo: "Proyecto completado",
    mensaje: "No eres destinatario.",
    prioridad: "Normal",
    emisorUid: "lead",
    fechaCreacion: Timestamp.now(),
    leida: false,
  }));
});

test("perfil: el usuario cambia carrera/semestre, pero no su rol", async () => {
  await seed({
    "usuarios/student": {
      uid: "student",
      rol: "estudiante",
      autorizado: true,
      carrera: "Ingeniería Electrónica",
      semestre: "1° semestre",
    },
  });

  const profile = doc(as("student"), "usuarios/student");
  await assertSucceeds(updateDoc(profile, {
    carrera: "Ingeniería Mecánica",
    semestre: "2° semestre",
  }));
  await assertFails(updateDoc(profile, { rol: "admin" }));
});

test("perfil: el titular puede actualizar su nombre y apellido", async () => {
  await seed({
    "usuarios/student": {
      uid: "student",
      rol: "estudiante",
      autorizado: true,
      nombre: "Estudiante",
      apellido: "Prueba",
      nombreCompleto: "Estudiante Prueba",
      carrera: "Ingeniería Electrónica",
      semestre: "1° semestre",
    },
  });

  await assertSucceeds(updateDoc(doc(as("student"), "usuarios/student"), {
    nombre: "Nuevo",
    apellido: "Nombre",
    nombreCompleto: "Nuevo Nombre",
  }));
  await assertFails(updateDoc(doc(as("student"), "usuarios/student"), {
    nombre: "Nuevo",
    apellido: "Nombre",
    nombreCompleto: "Manipulado",
  }));
});

test("perfil eliminado: el mismo UID puede crear un perfil nuevo de estudiante", async () => {
  await seed({
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
  });

  await assertSucceeds(deleteDoc(doc(as("admin"), "usuarios/student")));
  await assertSucceeds(setDoc(doc(as("student"), "usuarios/student"), {
    uid: "student",
    nombre: "Estudiante",
    apellido: "Nuevo",
    nombreCompleto: "Estudiante Nuevo",
    correoInstitucional: "student@__DOMINIO_INSTITUCIONAL__",
    carrera: "Ingeniería Electrónica",
    semestre: "1° semestre",
    rol: "estudiante",
    autorizado: false,
    rostroRegistrado: false,
  }));
  await assertFails(setDoc(doc(as("student"), "usuarios/student"), {
    uid: "student",
    rol: "admin",
    autorizado: true,
    rostroRegistrado: false,
  }));
});

test("perfil: bloquea correos externos, no verificados y datos con correo suplantado", async () => {
  const profileData = {
    uid: "external",
    nombre: "Persona",
    apellido: "Externa",
    nombreCompleto: "Persona Externa",
    correoInstitucional: "external@__DOMINIO_INSTITUCIONAL__",
    carrera: "Ingeniería Electrónica",
    semestre: "1° semestre",
    rol: "estudiante",
    autorizado: false,
    rostroRegistrado: false,
  };

  await assertFails(setDoc(
    doc(environment.authenticatedContext("external", {
      email: "external@gmail.com",
      email_verified: true,
    }).firestore(), "usuarios/external"),
    { ...profileData, correoInstitucional: "external@gmail.com" },
  ));
  await assertFails(setDoc(
    doc(environment.authenticatedContext("unverified", {
      email: "unverified@__DOMINIO_INSTITUCIONAL__",
      email_verified: false,
    }).firestore(), "usuarios/unverified"),
    { ...profileData, uid: "unverified", correoInstitucional: "unverified@__DOMINIO_INSTITUCIONAL__" },
  ));
  await assertFails(setDoc(
    doc(as("spoof"), "usuarios/spoof"),
    { ...profileData, uid: "spoof", correoInstitucional: "someoneelse@__DOMINIO_INSTITUCIONAL__" },
  ));
  await assertSucceeds(setDoc(
    doc(as("institutional"), "usuarios/institutional"),
    { ...profileData, uid: "institutional", correoInstitucional: "institutional@__DOMINIO_INSTITUCIONAL__" },
  ));
});

test("admin: solo modifica campos permitidos y no promueve perfiles externos", async () => {
  await seed({
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true, correoInstitucional: "admin@__DOMINIO_INSTITUCIONAL__" },
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: false, correoInstitucional: "student@__DOMINIO_INSTITUCIONAL__" },
    "usuarios/external": { uid: "external", rol: "estudiante", autorizado: false, correoInstitucional: "external@gmail.com" },
  });

  await assertSucceeds(updateDoc(doc(as("admin"), "usuarios/student"), {
    rol: "admin",
    autorizado: true,
  }));
  await assertFails(updateDoc(doc(as("admin"), "usuarios/external"), {
    rol: "admin",
    autorizado: true,
  }));
  await assertFails(updateDoc(doc(as("admin"), "usuarios/student"), {
    nombreCompleto: "Cambiar campos fuera del flujo",
  }));
});

test("inventario y avisos: lectura solo para usuarios institucionales autorizados", async () => {
  await seed({
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "usuarios/unverified": { uid: "unverified", rol: "estudiante", autorizado: true },
  });

  const studentDb = as("student");
  const adminDb = as("admin");
  const item = doc(collection(adminDb, "inventario"));
  await assertFails(setDoc(doc(collection(studentDb, "inventario")), { nombre: "Taladro" }));
  await assertSucceeds(setDoc(item, {
    nombre: "Multímetro",
    descripcion: "Digital",
    categoria: "Medición",
    cantidad: 1,
    ubicacion: "Laboratorio",
    estado: "Disponible",
    creadoPorUid: "admin",
    creadoPorNombre: "Admin",
    fechaCreacion: Timestamp.now(),
  }));
  await assertSucceeds(getDoc(doc(studentDb, item.path)));
  await assertFails(getDoc(doc(as("external", { email: "outside@gmail.com" }), item.path)));
  await assertFails(getDoc(doc(as("unverified", { email_verified: false }), item.path)));
  await assertFails(deleteDoc(doc(studentDb, item.path)));

  const notice = doc(collection(adminDb, "avisos"));
  await assertSucceeds(setDoc(notice, {
    titulo: "Mantenimiento",
    mensaje: "Laboratorio cerrado el viernes",
    prioridad: "Normal",
    autorUid: "admin",
    autorNombre: "Admin",
    fechaCreacion: Timestamp.now(),
  }));
  await assertFails(setDoc(doc(collection(studentDb, "avisos")), {
    titulo: "Aviso falso",
    mensaje: "No autorizado",
    prioridad: "Normal",
    autorUid: "student",
    autorNombre: "Estudiante",
    fechaCreacion: Timestamp.now(),
  }));
  await assertSucceeds(getDoc(doc(studentDb, notice.path)));
  await assertFails(getDoc(doc(as("external", { email: "outside@gmail.com" }), notice.path)));
  await assertFails(getDoc(doc(as("unverified", { email_verified: false }), notice.path)));
});

test("accesos y presencias: cada estudiante solo escribe en su propio UID", async () => {
  await seed({
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: false },
    "accesos/admin-entry": { uid: "admin", tipo: "entrada" },
  });

  const studentDb = as("student");
  const adminDb = as("admin");
  await assertSucceeds(setDoc(doc(studentDb, "accesos/student-entry"), {
    uid: "student",
    tipo: "entrada",
  }));
  await assertSucceeds(getDoc(doc(studentDb, "accesos/student-entry")));
  await assertFails(getDoc(doc(studentDb, "accesos/admin-entry")));
  await assertSucceeds(getDoc(doc(adminDb, "accesos/admin-entry")));
  await assertFails(setDoc(doc(studentDb, "accesos/forged-entry"), {
    uid: "admin",
    tipo: "entrada",
  }));

  await assertSucceeds(setDoc(doc(studentDb, "presencias/student"), { dentro: true }));
  await assertSucceeds(updateDoc(doc(studentDb, "presencias/student"), { dentro: false }));
  await assertFails(setDoc(doc(studentDb, "presencias/admin"), { dentro: true }));

  await assertSucceeds(setDoc(doc(adminDb, "accesos/admin-own-entry"), {
    uid: "admin",
    tipo: "entrada",
  }));
  await assertFails(setDoc(doc(adminDb, "accesos/admin-forged-entry"), {
    uid: "student",
    tipo: "entrada",
  }));
  await assertFails(setDoc(doc(adminDb, "presencias/admin"), { dentro: true }));

  const entryBatch = writeBatch(studentDb);
  entryBatch.set(doc(collection(studentDb, "accesos")), {
    uid: "student",
    tipo: "entrada",
    fechaHora: Timestamp.now(),
  });
  entryBatch.set(doc(studentDb, "presencias/student"), {
    dentro: true,
    ultimaActualizacion: Timestamp.now(),
    nombreCompleto: "Estudiante de prueba",
  }, { merge: true });
  await assertSucceeds(entryBatch.commit());
});

test("puertas: los clientes no pueden leer telemetria ni escribir comandos", async () => {
  await seed({
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "puertas/lab": { estadoReportado: "cerrada" },
    "puertas/lab/comandos/cmd-1": { estado: "pendiente" },
  });

  for (const db of [as("student"), as("admin")]) {
    await assertFails(getDoc(doc(db, "puertas/lab")));
    await assertFails(getDoc(doc(db, "puertas/lab/comandos/cmd-1")));
    await assertFails(setDoc(doc(db, "puertas/lab/comandos/cmd-2"), {
      accion: "desbloquear",
    }));
  }
});

test("calendario: estudiantes gestionan solo sus clases y exámenes; actividades son administrativas", async () => {
  await seed({
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/other": { uid: "other", rol: "estudiante", autorizado: true },
    "usuarios/pending": { uid: "pending", rol: "estudiante", autorizado: false },
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
  });

  const createdAt = Timestamp.now();
  const classEntry = {
    tipo: "clase",
    materia: "Matemática",
    diasSemana: [1, 3, 5],
    horaInicio: "08:00",
    horaFin: "09:30",
    aula: "Aula 2",
    desde: Timestamp.fromDate(new Date("2026-10-01T03:00:00Z")),
    hasta: Timestamp.fromDate(new Date("2026-12-31T03:00:00Z")),
    fechaCreacion: createdAt,
  };
  const studentCalendar = doc(as("student"), "usuarios/student/calendario/clase-1");
  await assertSucceeds(setDoc(studentCalendar, classEntry));
  await assertSucceeds(getDoc(studentCalendar));
  await assertFails(getDoc(doc(as("other"), studentCalendar.path)));
  await assertFails(setDoc(doc(as("other"), "usuarios/student/calendario/falso"), classEntry));
  await assertFails(setDoc(doc(as("pending"), "usuarios/pending/calendario/clase"), classEntry));
  await assertFails(setDoc(doc(as("student"), "usuarios/student/calendario/horario-invalido"), {
    ...classEntry,
    diasSemana: [8],
  }));

  const exam = doc(as("student"), "usuarios/student/calendario/examen-1");
  await assertSucceeds(setDoc(exam, {
    tipo: "examen",
    titulo: "Parcial 1",
    materia: "Matemática",
    fechaHora: Timestamp.fromDate(new Date("2026-11-12T12:00:00Z")),
    lugar: "Aula 2",
    notas: "Capítulos 1 a 3",
    fechaCreacion: createdAt,
  }));
  await assertSucceeds(deleteDoc(studentCalendar));
  await assertSucceeds(deleteDoc(exam));

  const activity = doc(as("admin"), "actividadesClub/taller-1");
  const activityData = {
    titulo: "Taller de robótica",
    categoria: "Taller",
    descripcion: "Introducción a microcontroladores",
    fechaInicio: Timestamp.fromDate(new Date("2026-11-15T15:00:00Z")),
    fechaFin: Timestamp.fromDate(new Date("2026-11-15T17:00:00Z")),
    lugar: "Laboratorio CDR",
    creadoPorUid: "admin",
    creadoPorNombre: "Administración",
    fechaCreacion: createdAt,
  };
  await assertSucceeds(setDoc(activity, activityData));
  await assertSucceeds(getDoc(doc(as("student"), activity.path)));
  await assertFails(getDoc(doc(as("pending"), activity.path)));
  await assertFails(setDoc(doc(as("student"), "actividadesClub/falsa"), activityData));
  await assertFails(setDoc(doc(as("admin"), "actividadesClub/autor-falso"), {
    ...activityData,
    creadoPorUid: "student",
  }));
  await assertFails(deleteDoc(doc(as("student"), activity.path)));
  await assertSucceeds(deleteDoc(activity));
});

test("cursos: publicaciÃ³n administrativa e inscripciones privadas por UID", async () => {
  await seed({
    "usuarios/student": { uid: "student", rol: "estudiante", autorizado: true },
    "usuarios/other": { uid: "other", rol: "estudiante", autorizado: true },
    "usuarios/pending": { uid: "pending", rol: "estudiante", autorizado: false },
    "usuarios/admin": { uid: "admin", rol: "admin", autorizado: true },
    "cursos/arduino": {
      titulo: "IntroducciÃ³n a Arduino",
      descripcion: "Microcontroladores para principiantes",
      instructor: "Equipo CDR",
      fechaInicio: Timestamp.fromDate(new Date("2026-11-01T12:00:00Z")),
      fechaFin: Timestamp.fromDate(new Date("2026-11-30T12:00:00Z")),
      horario: "Martes y jueves, 15:00 a 17:00",
      modalidad: "Presencial",
      lugar: "Laboratorio CDR",
      estado: "Publicado",
      creadoPorUid: "admin",
      creadoPorNombre: "AdministraciÃ³n",
      fechaCreacion: Timestamp.now(),
    },
    "cursos/cerrado": {
      titulo: "Curso cerrado",
      descripcion: "",
      instructor: "Equipo CDR",
      fechaInicio: Timestamp.fromDate(new Date("2026-11-01T12:00:00Z")),
      fechaFin: Timestamp.fromDate(new Date("2026-11-30T12:00:00Z")),
      horario: "A confirmar",
      modalidad: "Virtual",
      lugar: "",
      estado: "Cerrado",
      creadoPorUid: "admin",
      creadoPorNombre: "AdministraciÃ³n",
      fechaCreacion: Timestamp.now(),
    },
  });

  const course = doc(as("student"), "cursos/arduino");
  await assertSucceeds(getDoc(course));
  await assertFails(getDoc(doc(as("student"), "cursos/cerrado")));
  await assertFails(getDoc(doc(as("pending"), "cursos/arduino")));
  await assertSucceeds(getDocs(query(collection(as("student"), "cursos"), where("estado", "==", "Publicado"))));
  await assertFails(setDoc(doc(as("student"), "cursos/falso"), { titulo: "Curso falso", estado: "Publicado" }));

  const enrollment = doc(as("student"), "cursos/arduino/inscripciones/student");
  await assertSucceeds(setDoc(enrollment, {
    uid: "student",
    nombreCompleto: "Estudiante CDR",
    carrera: "IngenierÃ­a ElectrÃ³nica",
    semestre: "5Â° semestre",
    fechaInscripcion: Timestamp.now(),
  }));
  await assertSucceeds(getDoc(enrollment));
  await assertFails(getDoc(doc(as("other"), enrollment.path)));
  await assertFails(setDoc(doc(as("other"), "cursos/arduino/inscripciones/student-2"), {
    uid: "student",
    nombreCompleto: "Estudiante CDR",
    carrera: "IngenierÃ­a ElectrÃ³nica",
    semestre: "5Â° semestre",
    fechaInscripcion: Timestamp.now(),
  }));
  await assertFails(setDoc(doc(as("student"), "cursos/cerrado/inscripciones/student"), {
    uid: "student",
    nombreCompleto: "Estudiante CDR",
    carrera: "IngenierÃ­a ElectrÃ³nica",
    semestre: "5Â° semestre",
    fechaInscripcion: Timestamp.now(),
  }));
  await assertSucceeds(deleteDoc(enrollment));

  const newCourse = doc(as("admin"), "cursos/curso-nuevo");
  await assertSucceeds(setDoc(newCourse, {
    titulo: "DiseÃ±o 3D",
    descripcion: "IntroducciÃ³n al modelado",
    instructor: "Ana Torres",
    fechaInicio: Timestamp.fromDate(new Date("2026-11-01T12:00:00Z")),
    fechaFin: Timestamp.fromDate(new Date("2026-11-30T12:00:00Z")),
    horario: "SÃ¡bados, 09:00 a 12:00",
    modalidad: "Virtual",
    lugar: "Laboratorio CDR",
    estado: "Publicado",
    creadoPorUid: "admin",
    creadoPorNombre: "AdministraciÃ³n",
    fechaCreacion: Timestamp.now(),
  }));
  await assertSucceeds(updateDoc(doc(as("admin"), "cursos/arduino"), { estado: "Cerrado" }));
  await assertFails(updateDoc(doc(as("student"), "cursos/arduino"), { estado: "Cerrado" }));
  await assertFails(deleteDoc(doc(as("admin"), "cursos/arduino")));
});
