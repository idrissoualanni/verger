import { expect, test as setup } from "@playwright/test";

/**
 * Authentifie chaque rôle de test une seule fois → un storageState par rôle.
 * - PROPRIETAIRE : compte sonde historique (E2E_EMAIL / E2E_PASSWORD).
 * - Autres rôles : comptes probe.* créés en prod, mot de passe E2E_PROBE_PASSWORD.
 *   (Le signup force SECRETAIRE côté serveur ; le rôle réel est posé en base.)
 */
const accounts = [
  {
    role: "PROPRIETAIRE",
    email: process.env.E2E_EMAIL,
    password: process.env.E2E_PASSWORD,
    authFile: ".auth/owner.json",
  },
  {
    role: "SECRETAIRE",
    email: "probe.sec@verger.sn",
    password: process.env.E2E_PROBE_PASSWORD,
    authFile: ".auth/secretariat.json",
  },
  {
    role: "COMPTABLE",
    email: "probe.compta@verger.sn",
    password: process.env.E2E_PROBE_PASSWORD,
    authFile: ".auth/comptable.json",
  },
  {
    role: "AGENT",
    email: "probe.agent@verger.sn",
    password: process.env.E2E_PROBE_PASSWORD,
    authFile: ".auth/agent.json",
  },
  {
    role: "ENSEIGNANT",
    email: "probe.ens@verger.sn",
    password: process.env.E2E_PROBE_PASSWORD,
    authFile: ".auth/enseignant.json",
  },
];

for (const { role, email, password, authFile } of accounts) {
  setup(`authentifie le compte ${role} de test`, async ({ request }) => {
    const res = await request.post("/api/auth/sign-in/email", {
      data: { email, password },
    });
    expect(res.status(), `login ${role} doit réussir (${email})`).toBe(200);
    const body = await res.json();
    expect(body.user.role, `${email} doit avoir le rôle ${role}`).toBe(role);
    await request.storageState({ path: authFile });
  });
}
