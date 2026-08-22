import { describe, expect, it, vi } from "vitest";
import { requirePerm } from "../../src/lib/api/lib/permissions";

/** Construit un faux contexte Hono avec une session contrôlable. */
function makeCtx(session: unknown) {
  return {
    var: { auth: { api: { getSession: vi.fn().mockResolvedValue(session) } } },
    req: { raw: new Request("https://x.test/api/students") },
    json: (data: unknown, status?: number) =>
      Response.json(data as object, { status: status ?? 200 }),
  } as never;
}

const OWNER = { user: { id: "u1", role: "PROPRIETAIRE" } };
const SECRETARY = { user: { id: "u2", role: "SECRETAIRE" } };

describe("requirePerm", () => {
  it("401 sans session", async () => {
    const r = await requirePerm(makeCtx(null), "students:read");
    expect("res" in r).toBe(true);
    const res = (r as { res: Response }).res;
    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Non connecté" });
  });

  it("403 si rôle insuffisant (SECRETAIRE sur students:read)", async () => {
    const r = await requirePerm(makeCtx(SECRETARY), "students:read");
    expect("res" in r).toBe(true);
    const res = (r as { res: Response }).res;
    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({ error: "Accès refusé pour votre rôle" });
  });

  it("laisse passer le user quand la permission est détenue", async () => {
    const r = await requirePerm(makeCtx(OWNER), "students:read");
    expect(r).toHaveProperty("user");
    expect((r as { user: { role: string } }).user.role).toBe("PROPRIETAIRE");
  });

  it("403 même pour un owner demandant une permission hors matrice", async () => {
    const r = await requirePerm(
      makeCtx({ user: { id: "u1", role: "ENSEIGNANT" } }),
      "students:create"
    );
    expect("res" in r).toBe(true);
    expect((r as { res: Response }).res.status).toBe(403);
  });
});
