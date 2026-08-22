import { expect, test as setup } from "@playwright/test";

const authFile = ".auth/owner.json";

setup(
  "authentifie le compte PROPRIETAIRE de test",
  async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: {
        email: process.env.E2E_EMAIL,
        password: process.env.E2E_PASSWORD,
      },
    });
    expect(res.status(), "login E2E doit réussir (vérifier E2E_EMAIL/E2E_PASSWORD)").toBe(200);
    const body = await res.json();
    expect(body.user.role).toBe("PROPRIETAIRE");
    await request.storageState({ path: authFile });
  }
);
