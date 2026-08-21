import { readFileSync, writeFileSync } from "node:fs";

const ROUTERS = [
  "levels",
  "students",
  "grades",
  "absences",
  "whatsapp",
  "events",
  "invoices",
  "expenses",
  "staff",
];

const IMPORT_LINE = `import { requirePerm } from "../lib/permissions";`;

for (const f of ROUTERS) {
  const path = `src/lib/api/routes/${f}.ts`;
  const lines = readFileSync(path, "utf8").split("\n");
  const idx = lines.indexOf(IMPORT_LINE);
  if (idx === -1 || lines[idx - 1]?.trim() !== "import {") continue;
  lines.splice(idx, 1);
  const end = lines.findIndex((l) => l.startsWith("} from"));
  if (end === -1) throw new Error(`Unterminated multiline import in ${path}`);
  lines.splice(end + 1, 0, IMPORT_LINE);
  writeFileSync(path, lines.join("\n"));
  console.log(`fixed ${path}`);
}
console.log("done");
