import { Hono } from "hono";
import { eq, and, desc, sql, avg, gte, lte } from "drizzle-orm";
import { createDb } from "../lib/db";
import {
  subjects,
  grades,
  students,
  classes,
  levels,
} from "@verger/shared/src/schema";
import { requirePerm } from "../lib/permissions";

export const gradesRoutes = new Hono<{
  Bindings: { DATABASE_URL: string };
  Variables: { auth: { api: any } };
}>();


function currentSchoolYear(): string {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 7 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

const DEFAULT_SUBJECTS = [
  { id: "math", name: "Mathématiques", coefficient: 4 },
  { id: "francais", name: "Français", coefficient: 4 },
  { id: "sciences", name: "Sciences", coefficient: 3 },
  { id: "histoire_geo", name: "Histoire-Géographie", coefficient: 2 },
  { id: "anglais", name: "Anglais", coefficient: 2 },
  { id: "eps", name: "Éducation Physique", coefficient: 1 },
  { id: "education_artistique", name: "Éducation Artistique", coefficient: 1 },
  { id: "instruction_civique", name: "Instruction Civique", coefficient: 1 },
];

// ------------------------------------------------------------------
// GET /api/subjects → liste des matières (seed auto si vide)
// ------------------------------------------------------------------
gradesRoutes.get("/subjects", async (c) => {
  const auth = await requirePerm(c, "grades:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  let result = await db.query.subjects.findMany({
    orderBy: (s, { asc }) => [asc(s.name)],
  });

  if (result.length === 0) {
    for (const sub of DEFAULT_SUBJECTS) {
      await db.insert(subjects).values(sub);
    }
    result = await db.query.subjects.findMany({
      orderBy: (s, { asc }) => [asc(s.name)],
    });
  }

  return c.json(result);
});

// ------------------------------------------------------------------
// POST /api/subjects → créer une matière
// ------------------------------------------------------------------
gradesRoutes.post("/subjects", async (c) => {
  const auth = await requirePerm(c, "grades:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.name) return c.json({ error: "Le nom est requis" }, 400);

  const db = createDb(c.env);
  const created = await db
    .insert(subjects)
    .values({
      id: body.id ?? crypto.randomUUID(),
      name: String(body.name),
      coefficient: Number(body.coefficient ?? 1),
    })
    .returning();

  return c.json(created[0], 201);
});

// ------------------------------------------------------------------
// PATCH /api/subjects/:id → modifier une matière
// ------------------------------------------------------------------
gradesRoutes.patch("/subjects/:id", async (c) => {
  const auth = await requirePerm(c, "grades:update");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  const updated = await db
    .update(subjects)
    .set({
      ...(body.name ? { name: String(body.name) } : {}),
      ...(body.coefficient !== undefined ? { coefficient: Number(body.coefficient) } : {}),
    })
    .where(eq(subjects.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Matière introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// DELETE /api/subjects/:id → supprimer une matière
// ------------------------------------------------------------------
gradesRoutes.delete("/subjects/:id", async (c) => {
  const auth = await requirePerm(c, "grades:delete");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const deleted = await db
    .delete(subjects)
    .where(eq(subjects.id, c.req.param("id")))
    .returning();

  if (!deleted.length) return c.json({ error: "Matière introuvable" }, 404);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------
// GET /api/grades?studentId=&classId=&subjectId=&trimester=&schoolYear=
// ------------------------------------------------------------------
gradesRoutes.get("/grades", async (c) => {
  const auth = await requirePerm(c, "grades:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const studentId = url.searchParams.get("studentId");
  const classId = url.searchParams.get("classId");
  const subjectId = url.searchParams.get("subjectId");
  const trimester = url.searchParams.get("trimester");
  const schoolYear = url.searchParams.get("schoolYear") ?? currentSchoolYear();

  const whereConditions = [eq(grades.schoolYear, schoolYear)];
  if (studentId) whereConditions.push(eq(grades.studentId, studentId));
  if (subjectId) whereConditions.push(eq(grades.subjectId, subjectId));
  if (trimester) whereConditions.push(eq(grades.trimester, parseInt(trimester)));

  let result = await db.query.grades.findMany({
    where: and(...whereConditions),
    orderBy: [desc(grades.createdAt)],
    with: {
      student: true,
    },
  });

  if (classId) {
    const studentIds = new Set(
      (
        await db.query.students.findMany({
          where: and(eq(students.classId, classId), eq(students.isActive, true)),
          columns: { id: true },
        })
      ).map((s) => s.id)
    );
    result = result.filter((g) => studentIds.has(g.studentId));
  }

  return c.json(result);
});

// ------------------------------------------------------------------
// POST /api/grades → créer/modifier des notes (batch)
// ------------------------------------------------------------------
gradesRoutes.post("/grades", async (c) => {
  const auth = await requirePerm(c, "grades:create");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body?.grades || !Array.isArray(body.grades)) {
    return c.json({ error: "Un tableau de notes est requis" }, 400);
  }

  const db = createDb(c.env);
  const schoolYear = body.schoolYear ?? currentSchoolYear();
  const created: any[] = [];

  for (const grade of body.grades) {
    if (!grade.studentId || !grade.subjectId || grade.value === undefined || grade.trimester === undefined) {
      continue;
    }

    const value = parseFloat(String(grade.value));
    if (isNaN(value) || value < 0 || value > 20) continue;

    const entry = {
      id: crypto.randomUUID(),
      studentId: String(grade.studentId),
      subjectId: String(grade.subjectId),
      trimester: Number(grade.trimester),
      value: String(value.toFixed(2)),
      appreciation: grade.appreciation ? String(grade.appreciation) : null,
      teacherId: String(grade.teacherId ?? ""),
      schoolYear,
    };

    const [row] = await db.insert(grades).values(entry).returning();
    created.push(row);
  }

  return c.json({ created, count: created.length }, 201);
});

// ------------------------------------------------------------------
// PATCH /api/grades/:id → modifier une note
// ------------------------------------------------------------------
gradesRoutes.patch("/grades/:id", async (c) => {
  const auth = await requirePerm(c, "grades:update");
  if ("res" in auth) return auth.res;

  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: "Corps invalide" }, 400);

  const db = createDb(c.env);
  // Garde-fou : une note non numérique ("abc", vide…) ne doit jamais
  // s'écrire "NaN" en base — on refuse avec 400 (aligné sur POST /grades).
  const valueParsed =
    body.value !== undefined ? parseFloat(String(body.value)) : null;
  if (valueParsed !== null && (!Number.isFinite(valueParsed) || valueParsed < 0 || valueParsed > 20)) {
    return c.json({ error: "La note doit être un nombre entre 0 et 20" }, 400);
  }
  const valueFormatted =
    body.value !== undefined && valueParsed !== null ? valueParsed.toFixed(2) : undefined;

  const updated = await db
    .update(grades)
    .set({
      ...(valueFormatted !== undefined ? { value: valueFormatted } : {}),
      ...(body.appreciation !== undefined ? { appreciation: body.appreciation ? String(body.appreciation) : null } : {}),
      ...(body.subjectId ? { subjectId: String(body.subjectId) } : {}),
      ...(body.trimester !== undefined ? { trimester: Number(body.trimester) } : {}),
    })
    .where(eq(grades.id, c.req.param("id")))
    .returning();

  if (!updated.length) return c.json({ error: "Note introuvable" }, 404);
  return c.json(updated[0]);
});

// ------------------------------------------------------------------
// DELETE /api/grades/:id → supprimer une note
// ------------------------------------------------------------------
gradesRoutes.delete("/grades/:id", async (c) => {
  const auth = await requirePerm(c, "grades:delete");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const deleted = await db
    .delete(grades)
    .where(eq(grades.id, c.req.param("id")))
    .returning();

  if (!deleted.length) return c.json({ error: "Note introuvable" }, 404);
  return c.json({ ok: true });
});

// ------------------------------------------------------------------
// GET /api/grades/averages?classId=&trimester=&schoolYear=
//   → moyennes par élève et par matière
// ------------------------------------------------------------------
gradesRoutes.get("/grades/averages", async (c) => {
  const auth = await requirePerm(c, "grades:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const classId = url.searchParams.get("classId");
  const trimester = parseInt(url.searchParams.get("trimester") ?? "1");
  const schoolYear = url.searchParams.get("schoolYear") ?? currentSchoolYear();

  const whereConditions = [
    eq(grades.schoolYear, schoolYear),
    eq(grades.trimester, trimester),
    eq(students.isActive, true),
  ];
  if (classId) whereConditions.push(eq(students.classId, classId));

  const allGrades = await db
    .select({
      studentId: grades.studentId,
      subjectId: grades.subjectId,
      value: grades.value,
      studentFirstName: students.firstName,
      studentLastName: students.lastName,
      className: classes.name,
      levelName: levels.name,
    })
    .from(grades)
    .innerJoin(students, eq(grades.studentId, students.id))
    .innerJoin(classes, eq(students.classId, classes.id))
    .leftJoin(levels, eq(classes.levelId, levels.id))
    .where(and(...whereConditions));

  const subjectMap = new Map<string, { name: string; coefficient: number }>();
  const allSubjects = await db.query.subjects.findMany();
  for (const s of allSubjects) {
    subjectMap.set(s.id, { name: s.name, coefficient: s.coefficient });
  }

  const studentSubjects = new Map<
    string,
    Map<string, { sum: number; count: number }>
  >();

  for (const g of allGrades) {
    if (!studentSubjects.has(g.studentId)) {
      studentSubjects.set(g.studentId, new Map());
    }
    const subjMap = studentSubjects.get(g.studentId)!;
    if (!subjMap.has(g.subjectId)) {
      subjMap.set(g.subjectId, { sum: 0, count: 0 });
    }
    const entry = subjMap.get(g.subjectId)!;
    entry.sum += parseFloat(String(g.value));
    entry.count++;
  }

  const results: any[] = [];
  for (const [studentId, subjMap] of studentSubjects) {
    const studentGrades = allGrades.find((g) => g.studentId === studentId);
    if (!studentGrades) continue;

    let weightedSum = 0;
    let totalCoef = 0;
    const subjectAverages: any[] = [];

    for (const [subjectId, data] of subjMap) {
      const avg = data.sum / data.count;
      const subject = subjectMap.get(subjectId);
      if (subject) {
        weightedSum += avg * subject.coefficient;
        totalCoef += subject.coefficient;
        subjectAverages.push({
          subjectId,
          subjectName: subject.name,
          coefficient: subject.coefficient,
          average: parseFloat(avg.toFixed(2)),
        });
      }
    }

    const generalAverage = totalCoef > 0 ? weightedSum / totalCoef : 0;

    results.push({
      studentId,
      firstName: studentGrades.studentFirstName,
      lastName: studentGrades.studentLastName,
      className: studentGrades.className,
      levelName: studentGrades.levelName,
      subjectAverages,
      generalAverage: parseFloat(generalAverage.toFixed(2)),
    });
  }

  results.sort((a, b) => b.generalAverage - a.generalAverage);
  results.forEach((r, i) => {
    r.rank = i + 1;
  });

  return c.json(results);
});

// ------------------------------------------------------------------
// GET /api/grades/bulletin?studentId=&trimester=&schoolYear=
//   → bulletin complet d'un élève
// ------------------------------------------------------------------
gradesRoutes.get("/grades/bulletin", async (c) => {
  const auth = await requirePerm(c, "grades:read");
  if ("res" in auth) return auth.res;

  const db = createDb(c.env);
  const url = new URL(c.req.url);
  const studentId = url.searchParams.get("studentId");
  const trimester = parseInt(url.searchParams.get("trimester") ?? "1");
  const schoolYear = url.searchParams.get("schoolYear") ?? currentSchoolYear();

  if (!studentId) return c.json({ error: "studentId requis" }, 400);

  const student = await db.query.students.findFirst({
    where: eq(students.id, studentId),
    with: {
      class: {
        with: {
          level: true,
        },
      },
      parent: true,
    },
  });

  if (!student) return c.json({ error: "Élève introuvable" }, 404);

  const studentGrades = await db.query.grades.findMany({
    where: and(
      eq(grades.studentId, studentId),
      eq(grades.trimester, trimester),
      eq(grades.schoolYear, schoolYear)
    ),
  });

  const allSubjects = await db.query.subjects.findMany({
    orderBy: (s, { asc }) => [asc(s.name)],
  });

  const subjectMap = new Map<string, typeof allSubjects[0]>();
  for (const s of allSubjects) {
    subjectMap.set(s.id, s);
  }

  const classGrades = await db
    .select({
      studentId: grades.studentId,
      subjectId: grades.subjectId,
      value: grades.value,
    })
    .from(grades)
    .innerJoin(students, eq(grades.studentId, students.id))
    .where(
      and(
        eq(students.classId, student.classId),
        eq(students.isActive, true),
        eq(grades.trimester, trimester),
        eq(grades.schoolYear, schoolYear)
      )
    );

  const classAverages = new Map<string, number>();
  const classSubjectCounts = new Map<string, Map<string, { sum: number; count: number }>>();

  for (const g of classGrades) {
    if (!classSubjectCounts.has(g.studentId)) {
      classSubjectCounts.set(g.studentId, new Map());
    }
    const subjMap = classSubjectCounts.get(g.studentId)!;
    if (!subjMap.has(g.subjectId)) {
      subjMap.set(g.subjectId, { sum: 0, count: 0 });
    }
    const entry = subjMap.get(g.subjectId)!;
    entry.sum += parseFloat(String(g.value));
    entry.count++;
  }

  const subjectClassAverages = new Map<string, { sum: number; count: number }>();
  for (const [, subjMap] of classSubjectCounts) {
    for (const [subjectId, data] of subjMap) {
      if (!subjectClassAverages.has(subjectId)) {
        subjectClassAverages.set(subjectId, { sum: 0, count: 0 });
      }
      const entry = subjectClassAverages.get(subjectId)!;
      entry.sum += data.sum / data.count;
      entry.count++;
    }
  }

  for (const [subjectId, data] of subjectClassAverages) {
    classAverages.set(subjectId, parseFloat((data.sum / data.count).toFixed(2)));
  }

  const studentSubjectGrades = new Map<string, { sum: number; count: number }>();
  for (const g of studentGrades) {
    if (!studentSubjectGrades.has(g.subjectId)) {
      studentSubjectGrades.set(g.subjectId, { sum: 0, count: 0 });
    }
    const entry = studentSubjectGrades.get(g.subjectId)!;
    entry.sum += parseFloat(String(g.value));
    entry.count++;
  }

  const bulletin: any[] = [];
  let weightedSum = 0;
  let totalCoef = 0;

  for (const subject of allSubjects) {
    const data = studentSubjectGrades.get(subject.id);
    if (!data) continue;

    const avg = data.sum / data.count;
    const classAvg = classAverages.get(subject.id) ?? 0;

    bulletin.push({
      subjectId: subject.id,
      subjectName: subject.name,
      coefficient: subject.coefficient,
      average: parseFloat(avg.toFixed(2)),
      classAverage: classAvg,
      appreciation: getAppreciation(avg),
    });

    weightedSum += avg * subject.coefficient;
    totalCoef += subject.coefficient;
  }

  const generalAverage = totalCoef > 0 ? weightedSum / totalCoef : 0;

  const allStudentAverages: { studentId: string; average: number }[] = [];
  for (const [sid, subjMap] of classSubjectCounts) {
    let ws = 0;
    let tc = 0;
    for (const [subjectId, data] of subjMap) {
      const subject = subjectMap.get(subjectId);
      if (subject) {
        ws += (data.sum / data.count) * subject.coefficient;
        tc += subject.coefficient;
      }
    }
    if (tc > 0) {
      allStudentAverages.push({
        studentId: sid,
        average: ws / tc,
      });
    }
  }

  allStudentAverages.sort((a, b) => b.average - a.average);
  // findIndex peut renvoyer -1 (élève retiré de la liste de classe entre les
  // deux requêtes, isActive=false…) → rank 0 absurde. On renvoie null.
  const foundIndex = allStudentAverages.findIndex((a) => a.studentId === studentId);
  const rank = foundIndex >= 0 ? foundIndex + 1 : null;
  const totalStudents = allStudentAverages.length;

  return c.json({
    student: {
      id: student.id,
      matricule: student.matricule,
      firstName: student.firstName,
      lastName: student.lastName,
      className: student.class?.name ?? "",
      levelName: student.class?.level?.name ?? "",
      parentName: student.parent?.name ?? "",
    },
    trimester,
    schoolYear,
    subjects: bulletin,
    generalAverage: parseFloat(generalAverage.toFixed(2)),
    classAverage: parseFloat(
      (
        allStudentAverages.reduce((s, a) => s + a.average, 0) /
        (allStudentAverages.length || 1)
      ).toFixed(2)
    ),
    rank,
    totalStudents,
  });
});

function getAppreciation(average: number): string {
  if (average >= 18) return "Excellent";
  if (average >= 16) return "Très bien";
  if (average >= 14) return "Bien";
  if (average >= 12) return "Assez bien";
  if (average >= 10) return "Passable";
  if (average >= 8) return "Insuffisant";
  return "Très insuffisant";
}
