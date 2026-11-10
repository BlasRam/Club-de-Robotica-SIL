import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "firestore-rules");
const output = path.join(root, "firestore.rules");
const sections = [
  ["reservas", "10-reservas.rules"],
  ["prestamosArchivados", "15-archived-loans.rules"],
  ["inventario", "20-inventario.rules"],
  ["avisos", "30-avisos.rules"],
  ["notificationOutbox", "35-notification-outbox.rules"],
  ["actividadesClub", "37-club-activities.rules"],
  ["actividadAdmin", "36-admin-activity.rules"],
  ["cursos", "38-cursos.rules"],
  ["sugerencias", "39-feedback.rules"],
  ["usuarios", "40-usuarios.rules"],
  ["accesos", "50-accesos.rules"],
  ["presencias", "60-presencias.rules"],
  ["puertas", "65-puertas.rules"],
  ["proyectos", "70-proyectos.rules"],
];
const closing = "    }\n  }\n}\n";

async function splitCurrentRules() {
  const source = await readFile(output, "utf8");
  const matches = [...source.matchAll(/^    match \/([a-zA-Z]+)\//gm)];
  const sectionMatches = sections.map(([collection]) => {
    const match = matches.find((candidate) => candidate[1] === collection);
    if (!match) throw new Error(`No se encontro el bloque de nivel superior ${collection}.`);
    return match;
  });

  const starts = sectionMatches.map((match) => {
    const matchIndex = match.index;
    const sectionMarker = source.lastIndexOf("    // =====================================================", matchIndex);
    if (sectionMarker < 0) throw new Error(`No se encontró encabezado para ${match[1]}.`);
    return sectionMarker;
  });
  const wrapperEnd = source.lastIndexOf(closing);
  if (wrapperEnd < starts.at(-1)) throw new Error("No se encontró el cierre de las reglas actuales.");

  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(sourceDir, "00-core.rules"), source.slice(0, starts[0]).trimEnd() + "\n", "utf8");

  for (let index = 0; index < sections.length; index += 1) {
    const [collection, filename] = sections[index];
    if (sectionMatches[index][1] !== collection) {
      throw new Error(`Orden inesperado: se esperaba ${collection}, se encontró ${matches[index][1]}.`);
    }
    const end = starts[index + 1] ?? wrapperEnd;
    await writeFile(path.join(sourceDir, filename), source.slice(starts[index], end).trim() + "\n", "utf8");
  }
  console.log(`Secciones creadas en ${path.relative(root, sourceDir)}.`);
}

async function buildRules() {
  const parts = [await readFile(path.join(sourceDir, "00-core.rules"), "utf8")];
  for (const [, filename] of sections) {
    parts.push(await readFile(path.join(sourceDir, filename), "utf8"));
  }
  const assembled = `${parts.map((part) => part.trim()).join("\n\n")}\n\n${closing}`;
  await writeFile(output, assembled, "utf8");
  console.log(`Generado firestore.rules (${Buffer.byteLength(assembled, "utf8")} bytes).`);
}

if (process.argv.includes("--split-current")) {
  await splitCurrentRules();
} else {
  await buildRules();
}
