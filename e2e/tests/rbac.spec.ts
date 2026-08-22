import { expect, test } from "@playwright/test";

test.describe("RBAC en tant que PROPRIETAIRE", () => {
  test("la sidebar affiche les modules autorisés au owner", async ({ page }) => {
    await page.goto("/dashboard");
    await expect(page.getByRole("heading", { name: "Tableau de bord" })).toBeVisible();
    for (const item of ["Niveaux & Classes", "Élèves", "Paiements"]) {
      await expect(
        page.locator('[data-sidebar="sidebar"]').getByText(item)
      ).toBeVisible();
    }
  });

  test("l'API accepte le cookie de session (students:read)", async ({ request }) => {
    const res = await request.get("/api/students");
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("data");
  });

  test("get-session renvoie bien le rôle PROPRIETAIRE", async ({ request }) => {
    const res = await request.get("/api/auth/get-session");
    expect(res.status()).toBe(200);
    const session = await res.json();
    expect(session?.user?.role).toBe("PROPRIETAIRE");
  });
});
