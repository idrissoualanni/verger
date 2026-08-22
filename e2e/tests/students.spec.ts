import { expect, test } from "@playwright/test";

/**
 * Régression du bug 500 sur POST /api/students (matricule non généré).
 * Le classId doit exister en base cible (CP1 en prod).
 * Nettoyage : DELETE /api/students/:id (soft delete) ; le parent de fixture
 * reste en base (pas de route DELETE parents — accumulation volontairement minime).
 */
const CLASS_ID = process.env.E2E_CLASS_ID ?? "d4258b4a-d965-4df4-96fe-e8644bff22d2";
const STAMP = Date.now();

test("créer un élève génère un matricule ELE-<année>-<numéro>", async ({ request }) => {
  const parent = await request.post("/api/parents", {
    data: { name: `E2E Parent ${STAMP}`, phone: "770000002" },
  });
  expect(parent.status()).toBe(201);
  const parentId = (await parent.json()).id;

  const student = await request.post("/api/students", {
    data: {
      firstName: "E2E",
      lastName: `Eleve${STAMP}`,
      dateOfBirth: "2016-05-10",
      gender: "M",
      classId: CLASS_ID,
      parentId,
    },
  });
  expect(student.status(), await student.text()).toBe(201);
  const created = await student.json();
  expect(created.matricule).toMatch(/^ELE-\d{4}-\d+$/);

  // Soft delete du student de test
  const del = await request.delete(`/api/students/${created.id}`);
  expect(del.status()).toBe(200);
});
