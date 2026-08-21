/**
 * Migration mécanique requireOwner → requirePerm sur les 9 routeurs owner-only.
 * Usage: npx tsx scripts/migrate-requireperm.ts  (depuis apps/web)
 */
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
] as const;

const ACTION_BY_METHOD: Record<string, string> = {
  get: "read",
  post: "create",
  patch: "update",
  put: "update",
  delete: "delete",
};

const GUARD = `  if (!(await requireOwner(c))) return c.json({ error: "Non autorisé" }, 401);`;
const OWNER_FN_RE =
  /\n(\/\*\*[^\n]*\*\/\n)?async function requireOwner\([\s\S]*?\n\}\n/;

let totalReplaced = 0;

for (const router of ROUTERS) {
  const path = `src/lib/api/routes/${router}.ts`;
  let src = readFileSync(path, "utf8");

  if (!src.includes("requireOwner")) {
    console.log(`SKIP ${path} (déjà migré)`);
    continue;
  }

  // 1. Supprimer la fonction requireOwner locale (+ son JSDoc)
  if (!OWNER_FN_RE.test(src)) throw new Error(`requireOwner block not found in ${path}`);
  src = src.replace(OWNER_FN_RE, "\n");

  // 2. Import requirePerm après le dernier import du header
  const importBlockRe = /^import[^\n]*\n+/;
  let importsEnd = 0;
  for (const line of src.split("\n")) {
    if (line.startsWith("import ")) importsEnd += line.length + 1;
    else if (importsEnd > 0) break;
  }
  src =
    src.slice(0, importsEnd) +
    `import { requirePerm } from "../lib/permissions";\n` +
    src.slice(importsEnd);

  // 3. Remplacer chaque guard selon la méthode HTTP du handler englobant
  const lines = src.split("\n");
  let method = "";
  let count = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/\.(get|post|patch|put|delete)\("/);
    if (m) method = m[1];
    if (lines[i] === GUARD) {
      if (!method) throw new Error(`No handler method found before guard at ${path}:${i + 1}`);
      const action = ACTION_BY_METHOD[method];
      lines[i] =
        `  const auth = await requirePerm(c, "${router}:${action}");\n` +
        `  if ("res" in auth) return auth.res;`;
      count++;
    }
  }
  writeFileSync(path, lines.join("\n"));
  totalReplaced += count;
  console.log(`OK   ${path} — ${count} guards migrés`);
}

console.log(`\nTotal: ${totalReplaced} guards migrés`);
