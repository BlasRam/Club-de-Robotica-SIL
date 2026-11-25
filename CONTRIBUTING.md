# Trabajar en local y en la nube

GitHub es el punto de sincronización entre la notebook y las sesiones de Codex Cloud. Cada espacio de trabajo mantiene una copia; para compartir un cambio, súbelo en una rama y abre un pull request.

## Empezar una tarea

No cambies de rama si tienes ediciones locales sin guardar. Una vez que estén guardadas o respaldadas:

```bash
git status
git fetch origin
git switch main
git pull --ff-only origin main
git switch -c update/descripcion-corta
```

Usa un nombre distinto para cada tarea. Evita que dos sesiones editen y publiquen simultáneamente la misma rama.

## Compartir el cambio

```bash
npm run web:build
git diff --check
git add ruta/de/los/archivos
git commit -m "Describe el cambio"
git push -u origin update/descripcion-corta
```

Después, abre un pull request hacia `main`. GitHub ejecuta la compilación de la PWA y las reglas de Firestore. Al integrar el pull request, el flujo existente publica Firebase Hosting automáticamente.

## Sincronizar el otro espacio de trabajo

Cuando el pull request ya esté integrado, en la otra copia ejecuta:

```bash
git fetch origin
git switch main
git pull --ff-only origin main
```

No copies un archivo de una descarga antigua sobre el repositorio actual. Si dos cambios tocaron el mismo archivo, combina ambos desde la rama actual y vuelve a compilar antes de abrir el pull request.

## Hacer obligatoria la revisión

La validación de pull requests ya está en el repositorio. Para que GitHub impida los pushes directos a `main`, configura una regla en **Settings → Branches** para `main` que requiera pull requests y el estado **Validate project changes / validate**. Activa también **Require branches to be up to date before merging** y bloquea force pushes y eliminación de la rama. Sin esa regla, las instrucciones y la validación existen, pero GitHub todavía permite saltárselas con un push directo.
