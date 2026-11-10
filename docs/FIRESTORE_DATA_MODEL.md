# Modelo de datos Firestore — Club de Robótica SIL

La app usa una sola base de datos Firestore y separa los dominios mediante colecciones. No hace falta crear una base o proyecto Firebase por cada modulo. En Spark, el nivel gratuito de Firestore aplica a una base de datos por proyecto.

## Colecciones principales

| Ruta | Contenido | Retencion / borrado |
| --- | --- | --- |
| `usuarios/{uid}` | Perfil de estudiante o administrador; `rol` distingue ambos. | El perfil y sus datos privados pueden eliminarse desde administracion si no tiene una solicitud ni un prestamo activo. La identidad de Authentication se conserva; el registro permite verificar el mismo correo/contrasena y recrear el perfil con el mismo UID si ya no existe. |
| `usuarios/{uid}/notificaciones/{id}` | Notificaciones privadas del usuario. | Se eliminan por lotes cuando administracion elimina el perfil. |
| `usuarios/{uid}/avisosOcultos/{id}` | Avisos que el usuario oculto. | Se eliminan por lotes cuando administracion elimina el perfil. |
| `usuarios/{uid}/fcmTokens/{installationId}` | Token FCM por instalacion/dispositivo. | Cada dispositivo registra y elimina su propio token; administracion puede leerlos solo para limpiar el perfil que elimina. |
| `inventario/{itemId}` | Articulo, existencia total, estado y ubicacion. | Administracion puede eliminar el articulo solo si no tiene solicitudes ni prestamos activos. No borra el archivo historico de prestamos. |
| `reservas/{reservaId}` | Solicitudes pendientes, prestamos aprobados y cambios/cancelaciones. | El prestamo se elimina al registrar la devolucion, despues de archivarse. Administracion puede borrar manualmente un registro activo huerfano; ese borrado no aumenta el stock ni crea historial. Las solicitudes rechazadas/canceladas se conservan. |
| `prestamosArchivados/{reservaId}` | Copia final de un prestamo devuelto: articulo, cantidad, persona y fechas. | Historial intencional; no se elimina al quitar el prestamo de la lista activa. |
| `accesos/{accesoId}` | Registro de entrada, con UID y hora. | Historial de entradas; se conserva aunque se elimine un perfil. Solo administracion puede borrar registros. |
| `presencias/{uid}` | Ultima entrada del dia. | La PWA muestra a la persona como presente solo el dia de la entrada y antes de las 22:00, hora de Paraguay. Despues del corte y al comenzar otro dia, no cuenta como presente sin borrar el historial. |
| `proyectos/{proyectoId}` | Datos del proyecto, responsable y miembros. | Al eliminar se borran primero sus documentos dependientes por lotes y despues el proyecto. |
| `proyectos/{proyectoId}/tareas/{tareaId}` | Tareas y estado de avance. | Dependiente del proyecto; se elimina junto al proyecto. |
| `proyectos/{proyectoId}/solicitudes/{uid}` | Solicitudes para integrarse al proyecto. | Dependiente del proyecto; se elimina junto al proyecto. |
| `proyectos/{proyectoId}/eventos/{eventoId}` | Evento de cierre del proyecto al 100%. | Dependiente del proyecto; se elimina junto al proyecto. |
| `avisos/{avisoId}` | Avisos globales creados por administracion. | Se eliminan desde la gestion de avisos. |
| `notificationOutbox/{eventId}` | Eventos para despachar notificaciones push mediante Worker. | Cola tecnica; se retiene segun su estado para diagnosticar entregas. No se debe borrar al cerrar sesion. |

## Borrado y auditoria

Firestore no borra subcolecciones al borrar su documento padre. Por eso los flujos de eliminacion recorren `tareas`, `solicitudes`, `eventos`, notificaciones, tokens y datos auxiliares en lotes antes de borrar sus perfiles/proyectos. El evento de cierre del proyecto se borra en el mismo lote que el proyecto, para evitar reabrir el cierre y duplicar notificaciones. El borrado de un articulo elimina su documento real y bloquea la operacion si hay solicitudes o prestamos activos. La devolucion elimina el registro activo solamente despues de copiar los datos necesarios a `prestamosArchivados` y actualizar existencias. El borrado manual de un prestamo activo huerfano elimina solo la reserva y no debe confundirse con una devolucion fisica.

Los historiales de accesos y prestamos devueltos se conservan deliberadamente para auditoria. Borrar un perfil de `usuarios` no elimina la identidad de Firebase Authentication ni esos historiales; la identidad requiere un flujo aparte de administracion de Authentication. Tampoco conviene eliminar o anonimizarlos automaticamente mientras existan prestamos activos asociados.

## Consultas del panel administrador

El panel obtiene conteos y suma de inventario con consultas de agregacion en servidor y limita los avisos recientes a tres. Para calcular vencimientos lee solo los prestamos aprobados, evitando depender de un indice compuesto. Las agregaciones evitan descargar todos los documentos para pintar indicadores, pero Firestore cobra lecturas segun las entradas de indice que deban examinarse. La pantalla de listado de personas sigue necesitando cargar los perfiles que permite buscar y administrar; si el volumen crece, el siguiente paso sera paginarla.

Los indices compuestos requeridos por los filtros estan definidos en `firestore.indexes.json`. Para aplicar las reglas e indices al proyecto Firebase se debe desplegar Firestore desde la raiz; esta tarea no los publica automaticamente.
