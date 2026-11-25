# Colaboración entre sesiones locales y en la nube

`origin/main` es la fuente compartida del proyecto. Los cambios de una sesión se ven en otra cuando se publican en GitHub; el contenido local sin commit y push no se sincroniza.

## Antes de editar

1. Revisa `git status` y conserva cualquier cambio local sin guardar.
2. Ejecuta `git fetch origin` para conocer el estado más reciente.
3. Inicia cada tarea en una rama nueva creada desde `origin/main`.
4. Lee el código actual de las pantallas y funciones que vas a tocar. No reemplaces un archivo completo usando una copia vieja.

## Al terminar

1. Revisa `git diff` y `git diff --check`.
2. Compila con `npm run web:build`; para cambios en reglas, ejecuta también `npm run rules:build`.
3. Publica la rama y abre un pull request hacia `main`. Describe qué cambió y qué partes existentes revisaste.
4. Espera que pase la validación automática y que el pull request se revise antes de integrar.

No hagas commits directos a `main`, no uses `git push --force` ni descartes cambios de otro trabajo. Si el push falla porque `main` avanzó, actualiza la rama desde `origin/main`, resuelve el conflicto conservando ambos cambios y vuelve a validar.

El despliegue de Firebase se activa al integrar en `main`. Después de una integración, las demás sesiones deben ejecutar `git fetch origin` y actualizar su rama local antes de comenzar otra tarea.
