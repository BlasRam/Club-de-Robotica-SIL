# Reglas de Firestore

Edita los archivos de esta carpeta, no `../firestore.rules`: ese archivo se genera y es el que Firebase CLI despliega.

| Archivo | Coleccion o contenido |
| --- | --- |
| `00-core.rules` | Envoltura del servicio y funciones compartidas |
| `10-reservas.rules` | Reservas y prestamos |
| `15-archived-loans.rules` | Historial de prestamos devueltos |
| `20-inventario.rules` | Inventario |
| `30-avisos.rules` | Avisos globales |
| `35-notification-outbox.rules` | Eventos de notificaciones push |
| `36-admin-activity.rules` | Registro de acciones administrativas |
| `40-usuarios.rules` | Perfiles y notificaciones privadas |
| `39-feedback.rules` | Sugerencias y reportes de errores |
| `50-accesos.rules` | Historial de accesos |
| `60-presencias.rules` | Estado de presencia |
| `65-puertas.rules` | Bloqueo de acceso a telemetria y comandos de puertas (reservado para hardware futuro) |
| `70-proyectos.rules` | Proyectos, solicitudes y tareas |
| `75-muestra.rules` | Publicaciones privadas de proyectos con aprobación docente |
| `00-core.rules` | También contiene la lectura pública del logo y el permiso de administrador para actualizarlo |

`../firestore.indexes.json` contiene solo los indices compuestos requeridos por los filtros del panel administrativo.

Desde la raiz del proyecto:

```sh
npm run rules:build
npm run test:rules
npm run rules:deploy
```

El despliegue ejecuta `rules:build` antes de publicar. Las pruebas se ejecutan en el emulador con un proyecto ficticio y datos aislados; no escriben en produccion.
