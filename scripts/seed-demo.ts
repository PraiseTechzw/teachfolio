import "dotenv/config";
import { and, eq } from "drizzle-orm";
import { accessAssignments, auditLogs, institutions, notifications, placements, portfolioEntries, portfolioRequirements, reviews, submissionVersions, users } from "../drizzle/schema";
import { getDb } from "../server/db";
import { DEMO_OPEN_ID_PREFIX } from "../server/authz-policy";

if (process.argv[2] !== "--confirm-fictional-demo-seed") {
  console.error("Usage: pnpm seed:demo --confirm-fictional-demo-seed");
  console.error("Creates clearly fictional records in the reserved TEACHFOLIO-DEMO institution. Demo identities cannot authenticate.");
  process.exit(2);
}
const database = (await getDb())!;
if (!database) throw new Error("DATABASE_URL is unavailable.");

const demoIdentity = [
  { key: "admin", openId: `${DEMO_OPEN_ID_PREFIX}admin`, name: "Demo Institution Administrator", email: "admin@fictional.invalid", role: "institution_admin" as const },
  { key: "coordinator", openId: `${DEMO_OPEN_ID_PREFIX}coordinator`, name: "Demo Practice Coordinator", email: "coordinator@fictional.invalid", role: "coordinator" as const },
  { key: "supervisor", openId: `${DEMO_OPEN_ID_PREFIX}supervisor`, name: "Demo School Supervisor", email: "supervisor@fictional.invalid", role: "supervisor" as const },
  { key: "lecturer", openId: `${DEMO_OPEN_ID_PREFIX}lecturer`, name: "Demo Academic Assessor", email: "lecturer@fictional.invalid", role: "lecturer" as const },
  { key: "student1", openId: `${DEMO_OPEN_ID_PREFIX}student1`, name: "Tariro Moyo", email: "student1@fictional.invalid", role: "student_teacher" as const },
  { key: "student2", openId: `${DEMO_OPEN_ID_PREFIX}student2`, name: "Kundai Dube", email: "student2@fictional.invalid", role: "student_teacher" as const },
  { key: "student3", openId: `${DEMO_OPEN_ID_PREFIX}student3`, name: "Rudo Ndlovu", email: "student3@fictional.invalid", role: "student_teacher" as const },
];

async function main() {
  const foundInstitution = await database.select().from(institutions).where(eq(institutions.code, "TEACHFOLIO-DEMO")).limit(1);
  let institution = foundInstitution[0];
  if (institution && !institution.isDemo) throw new Error("Reserved demo code is already held by a non-demo institution; refusing to modify it.");
  if (!institution) {
    const inserted = await database.insert(institutions).values({ name: "Mavambo Teacher Training College (Fictional Demo)", code: "TEACHFOLIO-DEMO", isDemo: true, active: true }).returning({ id: institutions.id });
    const id = inserted[0]!.id;
    const rows = await database.select().from(institutions).where(eq(institutions.id, id)).limit(1);
    institution = rows[0];
  }
  if (!institution) throw new Error("Could not initialize reserved fictional institution.");
  const accountByKey = new Map<string, typeof users.$inferSelect>();
  for (const identity of demoIdentity) {
    const existing = await database.select().from(users).where(eq(users.openId, identity.openId)).limit(1);
    let account = existing[0];
    if (!account) {
      const inserted = await database.insert(users).values({ openId: identity.openId, name: identity.name, email: identity.email, loginMethod: "fictional-demo-only", role: "user" }).returning({ id: users.id });
      const rows = await database.select().from(users).where(eq(users.id, inserted[0]!.id)).limit(1);
      account = rows[0];
    }
    if (!account) throw new Error(`Could not create demo identity ${identity.key}.`);
    accountByKey.set(identity.key, account);
  }
  const admin = accountByKey.get("admin")!;
  for (const identity of demoIdentity) {
    const account = accountByKey.get(identity.key)!;
    const existing = await database.select().from(accessAssignments).where(and(eq(accessAssignments.userId, account.id), eq(accessAssignments.institutionId, institution.id), eq(accessAssignments.role, identity.role))).limit(1);
    if (!existing.length) await database.insert(accessAssignments).values({ userId: account.id, institutionId: institution.id, role: identity.role, status: "active", assignedBy: admin.id });
    else if (existing[0]!.status !== "active") await database.update(accessAssignments).set({ status: "active" }).where(eq(accessAssignments.id, existing[0]!.id));
  }
  const existingRequirements = await database.select().from(portfolioRequirements).where(eq(portfolioRequirements.institutionId, institution.id));
  if (!existingRequirements.length) await database.insert(portfolioRequirements).values([
    { institutionId: institution.id, category: "scheme", label: "Scheme of work", requiredCount: 1, required: true, deadline: "2026-11-30" },
    { institutionId: institution.id, category: "lesson", label: "Reviewed lesson plans", requiredCount: 4, required: true, deadline: "2026-11-30" },
    { institutionId: institution.id, category: "reflection", label: "Reflective journal entries", requiredCount: 2, required: true, deadline: "2026-11-30" },
    { institutionId: institution.id, category: "evidence", label: "Teaching evidence", requiredCount: 1, required: true, deadline: "2026-11-30" },
    { institutionId: institution.id, category: "observation", label: "Observation records", requiredCount: 2, required: false, deadline: null },
    { institutionId: institution.id, category: "final_report", label: "Final practice report", requiredCount: 1, required: true, deadline: "2026-12-04" },
  ]);
  const supervisor = accountByKey.get("supervisor")!;
  const lecturer = accountByKey.get("lecturer")!;
  const students = [accountByKey.get("student1")!, accountByKey.get("student2")!, accountByKey.get("student3")!];
  for (const [index, student] of students.entries()) {
    const existing = await database.select().from(placements).where(and(eq(placements.institutionId, institution.id), eq(placements.studentUserId, student.id))).limit(1);
    if (!existing.length) await database.insert(placements).values({ institutionId: institution.id, studentUserId: student.id, schoolName: ["Mosi Valley Practice School (Fictional)", "Greenridge Community School (Fictional)", "Hillview Demonstration School (Fictional)"][index]!, schoolLocation: ["Harare, Zimbabwe (fictional)", "Bulawayo, Zimbabwe (fictional)", "Mutare, Zimbabwe (fictional)"][index]!, programme: "Bachelor of Education · Teaching Practice (Demo)", cohort: "2026 Teaching Practice · fictional", studentNumber: `DEMO-${String(index + 1).padStart(3, "0")}`, subject: ["Mathematics", "English Language", "Science"][index]!, classes: ["Form 2A", "Form 2B"], startDate: "2026-08-03", endDate: "2026-11-27", supervisorUserId: supervisor.id, lecturerUserId: lecturer.id, status: "active" });
  }
  const examples = [
    { student: students[0]!, kind: "scheme" as const, title: "Fractions and equivalent values · term scheme", subject: "Mathematics", className: "Form 2A", lessonDate: "2026-09-04", status: "approved" as const, payload: { school: "Mosi Valley Practice School (Fictional)", term: "2026 · Term 3", weeks: "4 weeks", aims: "Recognize equivalent fractions and compare values using models.", priorKnowledge: "Unit fractions and basic multiplication.", curriculumReference: "Fictional sample reference; verify against the institution curriculum.", weeklyPlan: "Week 1 · Fraction models · identify parts · fraction strips · oral check" } },
    { student: students[0]!, kind: "lesson" as const, title: "Equivalent fractions with paper strips", subject: "Mathematics", className: "Form 2A", lessonDate: "2026-10-19", status: "under_review" as const, payload: { topic: "Equivalent fractions", priorKnowledge: "Learners have named unit fractions.", objectives: "Represent equivalent fractions using visual models.", resources: "Paper strips, board, markers.", duration: 40, stages: [{ stage: "Explore", duration: 15, teacherActivities: "Model folding equal parts.", learnerActivities: "Compare shaded pieces.", methods: "Guided discovery", resources: "Paper strips", assessment: "Observe explanations" }, { stage: "Practice", duration: 25, teacherActivities: "Pose pair tasks.", learnerActivities: "Draw and explain an equivalent pair.", methods: "Pair work", resources: "Exercise books", assessment: "Check representations" }] } },
    { student: students[0]!, kind: "reflection" as const, title: "Reflection · learner explanations", subject: "Mathematics", className: "Form 2A", lessonDate: "2026-10-19", status: "revision_required" as const, payload: { lessonObjectives: "Explain equivalent fractions with a model.", whatHappened: "Most pairs used the paper strips; a few needed support matching the whole.", objectivesAchieved: "Partially; written evidence was not recorded consistently.", understandingEvidence: "Learner explanations during pair work.", strategiesParticipation: "Guided comparison invited participation.", difficulties: "My exit check did not ask every learner to show an answer.", nextTime: "Use an individual exit slip and contrast two incorrect models.", professionalLearning: "Make checks for understanding visible for all learners." } },
    { student: students[1]!, kind: "lesson" as const, title: "Reading for a stated purpose", subject: "English Language", className: "Form 2B", lessonDate: "2026-10-16", status: "approved" as const, payload: { topic: "Reading comprehension", objectives: "Identify the main idea and select two supporting details.", duration: 35, stages: [{ stage: "Before reading", duration: 10, teacherActivities: "Introduce a purpose question.", learnerActivities: "Predict from the title.", assessment: "Oral prediction" }, { stage: "Read and check", duration: 25, teacherActivities: "Model annotation.", learnerActivities: "Highlight details in pairs.", assessment: "Exit response" }] } },
    { student: students[1]!, kind: "evidence" as const, title: "Teacher-prepared reading-resource note", subject: "English Language", className: "Form 2B", lessonDate: "2026-10-16", status: "draft" as const, payload: { category: "teaching_resource", description: "Fictional text-only metadata example. No document or media file is attached." } },
    { student: students[2]!, kind: "scheme" as const, title: "Living systems · unit outline", subject: "Science", className: "Form 2A", lessonDate: "2026-10-12", status: "submitted" as const, payload: { aims: "Describe relationships between organisms and their environment.", priorKnowledge: "Basic needs of plants and animals.", weeklyPlan: "Week 1 · habitats · classify examples · guided observation" } },
  ];
  const entryByTitle = new Map<string, typeof portfolioEntries.$inferSelect>();
  for (const sample of examples) {
    const existing = await database.select().from(portfolioEntries).where(and(eq(portfolioEntries.institutionId, institution.id), eq(portfolioEntries.userId, sample.student.id), eq(portfolioEntries.title, sample.title))).limit(1);
    let entry = existing[0];
    if (!entry) {
      const inserted = await database.insert(portfolioEntries).values({ institutionId: institution.id, userId: sample.student.id, kind: sample.kind, title: sample.title, subject: sample.subject, className: sample.className, lessonDate: sample.lessonDate, status: sample.status, version: 1, payload: sample.payload }).returning({ id: portfolioEntries.id });
      const rows = await database.select().from(portfolioEntries).where(eq(portfolioEntries.id, inserted[0]!.id)).limit(1);
      entry = rows[0];
    }
    if (!entry) throw new Error(`Could not create fictional entry ${sample.title}.`);
    entryByTitle.set(sample.title, entry);
    if (entry.status !== "draft") {
      const priorVersion = await database.select().from(submissionVersions).where(and(eq(submissionVersions.entryId, entry.id), eq(submissionVersions.version, 1))).limit(1);
      if (!priorVersion.length) await database.insert(submissionVersions).values({ institutionId: institution.id, entryId: entry.id, version: 1, snapshot: { kind: entry.kind, title: entry.title, subject: entry.subject, className: entry.className, lessonDate: entry.lessonDate, payload: entry.payload, version: 1 }, status: entry.status });
      const priorReview = await database.select().from(reviews).where(and(eq(reviews.entryId, entry.id), eq(reviews.submissionVersion, 1))).limit(1);
      if (!priorReview.length) await database.insert(reviews).values({ institutionId: institution.id, entryId: entry.id, submissionVersion: 1, reviewerUserId: supervisor.id, decision: entry.status === "approved" ? "approved" : entry.status === "revision_required" ? "revision_required" : "under_review", comments: entry.status === "approved" ? "Fictional demo feedback: clear objective alignment and appropriate evidence of learning." : entry.status === "revision_required" ? "Fictional demo feedback: add a consistent individual check for understanding and document the evidence." : "Fictional demo record: awaiting an assigned reviewer." });
    }
  }
  const unread = await database.select().from(notifications).where(eq(notifications.institutionId, institution.id)).limit(1);
  if (!unread.length) {
    const lesson = entryByTitle.get("Equivalent fractions with paper strips")!;
    await database.insert(notifications).values([
      { institutionId: institution.id, userId: students[0]!.id, type: "submission_received", message: "Fictional demo: your lesson plan was received and is under review.", href: `/item/${lesson.id}` },
      { institutionId: institution.id, userId: students[0]!.id, type: "revision_required", message: "Fictional demo: add an individual check for understanding to your reflection.", href: `/item/${entryByTitle.get("Reflection · learner explanations")!.id}` },
      { institutionId: institution.id, userId: accountByKey.get("coordinator")!.id, type: "portfolio_update", message: "Fictional demo: the 2026 cohort has submissions in several review states.", href: "/reports" },
    ]);
  }
  const audit = await database.select().from(auditLogs).where(and(eq(auditLogs.institutionId, institution.id), eq(auditLogs.action, "fictional_demo_seed_initialized"))).limit(1);
  if (!audit.length) await database.insert(auditLogs).values({ institutionId: institution.id, actorUserId: admin.id, action: "fictional_demo_seed_initialized", targetType: "institution", targetId: String(institution.id), detail: "Reserved demo seed; every profile, school, placement and portfolio record is fictional. Demo OAuth identities cannot sign in." });
  console.log(`Fictional demo data is ready in institution ${institution.id} (${institution.code}). No demo account can authenticate.`);
}

try { await main(); }
finally {
  const client = (database as unknown as { $client?: { end?: () => Promise<void> } }).$client;
  await client?.end?.();
}
