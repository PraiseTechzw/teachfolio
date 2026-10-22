import { useMemo, useState } from "react";
import { ArrowRight, Check, MessageSquareText, Search } from "lucide-react";
import {
  REVIEW_RUBRIC,
  REVIEW_RUBRIC_VERSION,
  REVIEW_SCALE,
  type ReviewCriterionId,
} from "@shared/review-rubric";
import { trpc } from "@/lib/trpc";
import { PortfolioStructuredDetails } from "@/components/PortfolioRecordDetails";

type Decision = "approved" | "revision_required" | "rejected";
type Draft = {
  comments: string;
  scores: Record<ReviewCriterionId, number | null>;
  criterionComments: Record<ReviewCriterionId, string>;
};
const blankDraft = (): Draft => ({
  comments: "",
  scores: Object.fromEntries(
    REVIEW_RUBRIC.map(item => [item.id, null])
  ) as Draft["scores"],
  criterionComments: Object.fromEntries(
    REVIEW_RUBRIC.map(item => [item.id, ""])
  ) as Draft["criterionComments"],
});
const decisionLabel: Record<Decision, string> = {
  approved: "approve this submitted version",
  revision_required: "request a revision",
  rejected: "reject this submitted version",
};
const statusLabel = (status: string) => status.replaceAll("_", " ");

export default function ReviewQueueDashboard({
  onOpenEntry,
}: {
  onOpenEntry: (entryId: number) => void;
}) {
  const queue = trpc.review.queue.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
  });
  const utils = trpc.useUtils();
  const [drafts, setDrafts] = useState<Record<number, Draft>>({});
  const [formErrors, setFormErrors] = useState<Record<number, string>>({});
  const [activeEntryId, setActiveEntryId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [studentFilter, setStudentFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [decisionError, setDecisionError] = useState("");
  const [startError, setStartError] = useState("");
  const startReview = trpc.review.start.useMutation({
    onSuccess: async (_result, input) => {
      setNotice("Review started. The submitted snapshot remains read-only.");
      setStartError("");
      setActiveEntryId(input.entryId);
      await Promise.all([
        utils.review.queue.invalidate(),
        utils.portfolio.overview.invalidate(),
        utils.portfolio.get.invalidate({ id: input.entryId }),
      ]);
    },
    onError: error =>
      setStartError(error.message || "Review could not be started."),
  });
  const decide = trpc.review.decide.useMutation({
    onSuccess: async (_result, input) => {
      setActiveEntryId(current => (current === input.entryId ? null : current));
      setDrafts(current => {
        const next = { ...current };
        delete next[input.entryId];
        return next;
      });
      setFormErrors(current => {
        const next = { ...current };
        delete next[input.entryId];
        return next;
      });
      setNotice(
        `Decision recorded: ${decisionLabel[input.decision]}. The student has been notified.`
      );
      setDecisionError("");
      await Promise.all([
        utils.review.queue.invalidate(),
        utils.portfolio.overview.invalidate(),
        utils.portfolio.get.invalidate({ id: input.entryId }),
        utils.notifications.mine.invalidate(),
      ]);
    },
    onError: error => {
      setDecisionError(
        error.message ||
          "The review decision could not be recorded. Refresh and check the submitted version before retrying."
      );
    },
  });

  const items = queue.data ?? [];
  const students = useMemo(
    () =>
      [
        ...new Set(items.map(item => item.studentName || "Student teacher")),
      ].sort((a, b) => a.localeCompare(b)),
    [items]
  );
  const filtered = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase();
    return items.filter(item => {
      if (
        studentFilter !== "all" &&
        (item.studentName || "Student teacher") !== studentFilter
      )
        return false;
      if (statusFilter !== "all" && item.status !== statusFilter) return false;
      if (!normalized) return true;
      return [item.studentName, item.title, item.subject, item.className].some(
        value =>
          String(value ?? "")
            .toLocaleLowerCase()
            .includes(normalized)
      );
    });
  }, [items, search, statusFilter, studentFilter]);

  const updateDraft = (
    entryId: number,
    change: Partial<Draft> | ((current: Draft) => Draft)
  ) => {
    setDrafts(current => {
      const existing = current[entryId] ?? blankDraft();
      return {
        ...current,
        [entryId]:
          typeof change === "function"
            ? change(existing)
            : { ...existing, ...change },
      };
    });
    setFormErrors(current => ({ ...current, [entryId]: "" }));
    setNotice("");
    setDecisionError("");
    setStartError("");
  };

  const submitDecision = (item: (typeof items)[number], decision: Decision) => {
    const draft = drafts[item.id] ?? blankDraft();
    if (REVIEW_RUBRIC.some(criterion => draft.scores[criterion.id] === null)) {
      setFormErrors(current => ({
        ...current,
        [item.id]: "Score every rubric criterion before recording a decision.",
      }));
      return;
    }
    if (draft.comments.trim().length < 3) {
      setFormErrors(current => ({
        ...current,
        [item.id]:
          "Add at least three characters of overall constructive feedback.",
      }));
      return;
    }
    if (
      !window.confirm(
        `Confirm that you want to ${decisionLabel[decision]} for version ${item.version}? The decision, rubric and feedback will be recorded in review history.`
      )
    )
      return;
    setDecisionError("");
    const rubricScores = REVIEW_RUBRIC.map(criterion => ({
      criterionId: criterion.id,
      score: draft.scores[criterion.id] as number,
      comment: draft.criterionComments[criterion.id],
    }));
    decide.mutate({
      entryId: item.id,
      decision,
      comments: draft.comments,
      rubricScores,
    });
  };

  return (
    <section className="space-y-5" aria-labelledby="review-queue-heading">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-indigo-700">
            Supervisor &amp; lecturer workspace
          </p>
          <h1
            id="review-queue-heading"
            className="mt-1 text-2xl font-bold tracking-tight text-slate-950"
          >
            Assigned review queue
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-slate-600">
            Only submissions from students assigned to your active institution
            placement are returned. Every decision is tied to an immutable
            version and saved rubric.
          </p>
        </div>
        {!queue.isLoading && !queue.error && (
          <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-800">
            {items.length} submissions in queue
          </span>
        )}
      </header>

      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"
        >
          {notice}
        </p>
      )}
      {decisionError && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
        >
          Decision not recorded: {decisionError}
        </p>
      )}
      {startError && (
        <p
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900"
        >
          Review not started: {startError}
        </p>
      )}
      {queue.isLoading && (
        <div
          role="status"
          className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600"
        >
          Loading assigned submissions…
        </div>
      )}
      {queue.error && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
        >
          <strong>Review queue unavailable.</strong>
          <p className="mt-1">
            {queue.error.message ||
              "The server could not verify your current reviewer assignment."}{" "}
            No sample submissions are shown in place of restricted or
            unavailable records.
          </p>
        </div>
      )}
      {!queue.isLoading && !queue.error && items.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Check size={22} />
          </div>
          <h2 className="mt-4 font-semibold text-slate-900">
            Your assigned queue is clear
          </h2>
          <p className="mx-auto mt-1 max-w-lg text-sm text-slate-600">
            New submissions from students assigned to you will appear here. This
            does not include work from unassigned students.
          </p>
        </div>
      )}

      {!queue.isLoading && !queue.error && items.length > 0 && (
        <>
          <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[minmax(200px,1fr)_minmax(180px,0.7fr)_minmax(160px,0.55fr)]">
            <label className="block text-xs font-semibold text-slate-600">
              Search assigned submissions
              <span className="relative mt-1 block">
                <Search
                  size={15}
                  className="absolute left-3 top-3 text-slate-400"
                />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2.5 pl-9 pr-3 text-sm font-normal outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                  placeholder="Student, title, subject…"
                />
              </span>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Assigned student
              <select
                value={studentFilter}
                onChange={event => setStudentFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
              >
                <option value="all">All assigned students</option>
                {students.map(student => (
                  <option key={student} value={student}>
                    {student}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-semibold text-slate-600">
              Submission state
              <select
                value={statusFilter}
                onChange={event => setStatusFilter(event.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
              >
                <option value="all">All pending states</option>
                <option value="submitted">Submitted</option>
                <option value="resubmitted">Resubmitted</option>
                <option value="under_review">Under review</option>
              </select>
            </label>
          </div>
          {filtered.length === 0 && (
            <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-sm text-slate-600">
              No assigned submissions match these filters.
            </div>
          )}
          <div className="space-y-4">
            {filtered.map(item => {
              const draft = drafts[item.id] ?? blankDraft();
              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 p-5">
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                        {item.kind.replaceAll("_", " ")} ·{" "}
                        {item.studentName || "Student teacher"}
                      </p>
                      <h2 className="mt-1 truncate text-lg font-semibold text-slate-950">
                        {item.title}
                      </h2>
                      <p className="mt-1 text-sm text-slate-600">
                        {[
                          item.subject,
                          item.className,
                          `Version ${item.version}`,
                          item.lessonDate || "Date not set",
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Submitted {new Date(item.submittedAt).toLocaleString()}
                      </p>
                    </div>
                    <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-semibold capitalize text-amber-800">
                      {statusLabel(item.status)}
                    </span>
                  </div>

                  <div className="space-y-4 p-5">
                    <details className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                      <summary className="cursor-pointer text-sm font-semibold text-slate-800">
                        Review submitted version details
                      </summary>
                      <PortfolioStructuredDetails
                        payload={item.payload as Record<string, unknown>}
                      />
                      <button
                        type="button"
                        onClick={() => onOpenEntry(item.id)}
                        className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-indigo-700 hover:underline"
                      >
                        Open full record and review history{" "}
                        <ArrowRight size={14} />
                      </button>
                    </details>

                    {activeEntryId === item.id ? (
                      <>
                        <section
                          aria-label="Teaching practice rubric"
                          className="space-y-3"
                        >
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-bold text-slate-900">
                                Teaching practice rubric{" "}
                                <span className="font-normal text-slate-500">
                                  · v{REVIEW_RUBRIC_VERSION}
                                </span>
                              </h3>
                              <p className="mt-0.5 text-xs text-slate-600">
                                Score each criterion from 1–4. The result is
                                formative feedback, not an official grade.
                              </p>
                            </div>
                            <p className="rounded-lg bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-800">
                              {
                                REVIEW_RUBRIC.filter(
                                  criterion =>
                                    draft.scores[criterion.id] !== null
                                ).length
                              }
                              /{REVIEW_RUBRIC.length} scored
                            </p>
                          </div>
                          {REVIEW_RUBRIC.map(criterion => (
                            <fieldset
                              key={criterion.id}
                              className="grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-[minmax(190px,0.9fr)_minmax(210px,0.8fr)_minmax(220px,1fr)]"
                            >
                              <legend className="sr-only">
                                {criterion.label}
                              </legend>
                              <div>
                                <p className="text-sm font-semibold text-slate-900">
                                  {criterion.label}
                                </p>
                                <p className="mt-1 text-xs leading-relaxed text-slate-600">
                                  {criterion.description}
                                </p>
                              </div>
                              <label className="block text-xs font-semibold text-slate-600">
                                Rating
                                <select
                                  aria-label={`${criterion.label} rating`}
                                  value={draft.scores[criterion.id] ?? ""}
                                  onChange={event =>
                                    updateDraft(item.id, current => ({
                                      ...current,
                                      scores: {
                                        ...current.scores,
                                        [criterion.id]: event.target.value
                                          ? Number(event.target.value)
                                          : null,
                                      },
                                    }))
                                  }
                                  className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-normal"
                                >
                                  <option value="">Choose score</option>
                                  {REVIEW_SCALE.map(scale => (
                                    <option
                                      key={scale.value}
                                      value={scale.value}
                                    >
                                      {scale.value} · {scale.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                              <label className="block text-xs font-semibold text-slate-600">
                                Criterion feedback{" "}
                                <span className="font-normal">(optional)</span>
                                <textarea
                                  maxLength={1000}
                                  rows={2}
                                  value={draft.criterionComments[criterion.id]}
                                  onChange={event =>
                                    updateDraft(item.id, current => ({
                                      ...current,
                                      criterionComments: {
                                        ...current.criterionComments,
                                        [criterion.id]: event.target.value,
                                      },
                                    }))
                                  }
                                  className="mt-1 w-full resize-y rounded-lg border border-slate-200 p-2.5 text-sm font-normal outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                                  placeholder="A concise observation or next step…"
                                />
                              </label>
                            </fieldset>
                          ))}
                        </section>

                        <label className="block text-xs font-semibold text-slate-700">
                          Overall constructive feedback{" "}
                          <span className="font-normal text-slate-500">
                            (required; 3–5,000 characters)
                          </span>
                          <textarea
                            maxLength={5000}
                            rows={4}
                            value={draft.comments}
                            onChange={event =>
                              updateDraft(item.id, {
                                comments: event.target.value,
                              })
                            }
                            className="mt-1 w-full resize-y rounded-xl border border-slate-200 p-3 text-sm font-normal outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
                            placeholder="Name what is working, what to improve, and a practical next step…"
                          />
                        </label>
                        {formErrors[item.id] && (
                          <p
                            role="alert"
                            className="rounded-lg bg-rose-50 p-3 text-sm text-rose-800"
                          >
                            {formErrors[item.id]}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                          <button
                            type="button"
                            disabled={decide.isPending}
                            onClick={() => submitDecision(item, "approved")}
                            className="inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            <Check size={15} />
                            Approve version
                          </button>
                          <button
                            type="button"
                            disabled={decide.isPending}
                            onClick={() =>
                              submitDecision(item, "revision_required")
                            }
                            className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
                          >
                            <MessageSquareText size={15} />
                            Request revision
                          </button>
                          <button
                            type="button"
                            disabled={decide.isPending}
                            onClick={() => submitDecision(item, "rejected")}
                            className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-sm font-semibold text-rose-800 hover:bg-rose-100 disabled:opacity-50"
                          >
                            Reject version
                          </button>
                          <button
                            type="button"
                            onClick={() => setActiveEntryId(null)}
                            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                          >
                            Close scoring form
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-4">
                        <p className="mr-auto text-sm text-slate-600">
                          {item.status === "under_review"
                            ? "This version is already in review. Continue scoring when ready."
                            : "Open this submitted version to score it and record a decision."}
                        </p>
                        {item.status === "under_review" ? (
                          <button
                            type="button"
                            onClick={() => setActiveEntryId(item.id)}
                            className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
                          >
                            Continue review
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={startReview.isPending || decide.isPending}
                            onClick={() => {
                              setStartError("");
                              setNotice("");
                              startReview.mutate({ entryId: item.id });
                            }}
                            className="rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
                          >
                            {startReview.isPending
                              ? "Starting…"
                              : "Start review"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onOpenEntry(item.id)}
                          className="inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                        >
                          Full history <ArrowRight size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}
