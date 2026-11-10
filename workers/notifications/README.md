# Worker de notificaciones — Robótica SIL

Servicio opcional de Cloudflare para enviar notificaciones push usando Firebase Cloud Messaging. El Worker también incluye rutas para registrar entradas en un ESP32; el control físico de puerta queda desactivado por defecto y requiere hardware configurado aparte.

## Configuración

1. Completar `FIREBASE_PROJECT_ID` e `INSTITUTIONAL_EMAIL_DOMAIN` en `wrangler.jsonc`. Usar el mismo dominio que en `web/src/club-config.ts` y las reglas Firestore.
2. En Firebase Console, habilitar Firebase Cloud Messaging HTTP v1.
3. Cargar como secretos de Cloudflare `FIREBASE_SERVICE_ACCOUNT_EMAIL`, `FIREBASE_SERVICE_ACCOUNT_PRIVATE_KEY` y `FIREBASE_WEB_API_KEY` usando `npx wrangler secret put NOMBRE`.
4. Publicar desde esta carpeta con `npx wrangler deploy`.
5. Para las rutas de registro de entrada de la PWA, copiar la URL publicada en `NOTIFICATION_WORKER_URL` en `web/src/main.ts` y volver a compilar la PWA.

No guardar claves privadas de Firebase ni secretos de dispositivo en archivos versionados, en la PWA o en Git. La PWA y Firestore mantienen sus permisos aunque las notificaciones estén deshabilitadas.

## Puerta y ESP32

El Worker declara `DOOR_CONTROL_ENABLED` como `false`. Mantenerlo así hasta instalar y validar el hardware, provisionar el documento de puerta y configurar credenciales individuales. Las rutas del dispositivo autentican peticiones firmadas con HMAC; la documentación de firmware y cableado debe prepararse para el hardware concreto del club antes de activar la apertura remota.
