# PWA del Club de Robótica San Ignacio de Loyola

Plataforma web progresiva para proyectos, tareas, cursos, avisos, calendario, inventario, préstamos y gestión de miembros. Se instala desde el navegador en teléfonos y computadoras. Este proyecto no contiene la aplicación APK/Android.

## Estado de configuración

La plantilla quedó adaptada y ahora apunta al proyecto `club-de-robotica-sil`. Aún requiere la configuración Web completa y acceso a ese proyecto desde Firebase CLI antes de habilitar cuentas o publicar:

- Proyecto Firebase nuevo con Authentication, Firestore, Storage y Hosting.
- `apiKey` y `appId` de la app Web en `web/src/firebase-config.ts`.
- Dominio de correo institucional. Debe configurarse en `web/src/club-config.ts`, `firestore-rules/00-core.rules`, `firestore-rules/40-usuarios.rules` y `workers/notifications/wrangler.jsonc`.
- ID del proyecto en `.firebaserc` y `workers/notifications/wrangler.jsonc`; ID del sitio en `firebase.json`.
- Worker y secretos de Firebase para notificaciones push, si se habilitan.
- URL del Worker en `web/src/main.ts` si se habilita el envío de eventos de acceso.

Mientras no se defina el dominio institucional, `plataformapy.oficial@gmail.com` y `bramirez@sil.edu.py` pueden crear su perfil; ambos perfiles se crean como administradores tras verificar el correo. Las cuentas ya existentes conservan su rol y requieren que un administrador lo actualice. Para habilitar otras cuentas, configurar el dominio en `web/src/club-config.ts`, `firestore-rules/00-core.rules`, `firestore-rules/40-usuarios.rules` y `workers/notifications/wrangler.jsonc`. No desplegar las reglas con `__DOMINIO_INSTITUCIONAL__` sin sustituirlo por el dominio autorizado. En los patrones de reglas, escapar los puntos; por ejemplo, `colegio.edu.py` se escribe `colegio\\.edu\\.py`.

La cuenta Firebase CLI debe ser miembro del proyecto. Si `firebase projects:list` no muestra `club-de-robotica-sil`, inicia sesión con la cuenta que lo creó o pide que inviten a la cuenta de despliegue con permisos para Hosting, Firestore y Storage.

## Desarrollo

Requiere Node.js. Desde la raíz del proyecto:

```sh
npm install
npm run web:dev
```

Vite muestra la dirección local para abrir la PWA. Para generar los archivos de publicación:

```sh
npm run rules:build
npm run web:build
```

## Firebase y publicación

1. Crear un proyecto Firebase del club; no reutilizar credenciales de otra institución.
2. Habilitar correo y contraseña en Authentication, crear Firestore e inscribir una aplicación Web.
3. Copiar la configuración Web completa a `web/src/firebase-config.ts` y confirmar el bucket real en Firebase Console. Habilitar Firebase Storage para que el administrador pueda cambiar el logo.
4. Definir el dominio institucional en los cuatro archivos indicados arriba. Usar el mismo dominio en todos.
5. Revisar reglas e índices. `firebase.json` construye las reglas fuente antes del despliegue.
6. Ejecutar `npm run web:build` y publicar Hosting/Firestore con Firebase CLI, seleccionando explícitamente el proyecto del club.

El administrador inicial se registra directamente desde la PWA con el correo autorizado anterior; después de verificarlo, la cuenta recibe el rol de administrador. Luego la gestión de cuentas se realiza desde la PWA. Ninguna clave privada debe guardarse en el cliente web ni en Git.

## Notificaciones y acceso físico

Las notificaciones push requieren configurar el Worker de Cloudflare descrito en [`workers/notifications/README.md`](workers/notifications/README.md). El control de puerta es opcional y queda desactivado por defecto; requiere además hardware y firmware ESP32 compatibles. La PWA funciona sin publicar ese Worker ni conectar una puerta.

## Datos y reglas

- `web/`: interfaz PWA, manifiesto y escudo del colegio usado como imagen inicial. Un administrador puede reemplazar el logo en Configuración; al cargar una nueva imagen, el sistema la guarda en Firebase Storage y la comparte en la PWA.
- `firestore-rules/`: reglas fuente por colección.
- `storage.rules`: solo administradores pueden reemplazar el logo público del club.
- `firestore.indexes.json`: índices de consultas.
- `workers/notifications/`: Worker opcional para notificaciones push y control de acceso.
- `docs/FIRESTORE_DATA_MODEL.md`: esquema y retención de datos.
