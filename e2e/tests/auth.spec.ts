import { expect, test } from "@playwright/test";

test.describe("Visiteur non connecté", () => {
  test("la page login est accessible", async ({ page }) => {
    await page.goto("/login");
    await expect(page).toHaveURL(/\/login/);
  });

  test("toute route API protégée renvoie 401 sans cookie", async ({ request }) => {
    const res = await request.get("/api/students");
    expect(res.status()).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Non connecté" });
  });

  test("visiter /dashboard sans session finit redirigé vers /login", async ({ page }) => {
    await page.goto("/dashboard");
    // Le shell Next rend (200) puis le client api.ts détecte le 401 et redirige.
    await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  });
});
