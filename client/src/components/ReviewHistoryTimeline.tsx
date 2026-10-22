type Criterion = {
  criterionId: string;
  label: string;
  description: string;
  score: number;
  comment: string;
};
type Rubric = {
  rubricVersion: number;
  scale: Array<{ value: number; label: string }>;
  criteria: Criterion[];
  totalScore: number;
  maximumScore: number;
  averageScore: number;
  interpretation: string;
};
type Review = {
  id: number;
  reviewerUserId: number;
  reviewerName: string | null;
  decision: string;
  comments: string;
  submissionVersion: number;
  createdAt: string | Date;
  rubric: Rubric | null;
};

export default function ReviewHistoryTimeline({
  reviews,
}: {
  reviews: Review[];
}) {
  if (!reviews.length)
    return (
      <p className="mt-2 text-sm text-slate-500">No reviewer feedback yet.</p>
    );
  return (
    <ol className="mt-3 space-y-4">
      {reviews.map(review => (
        <li
          key={review.id}
          className="rounded-xl border border-slate-200 bg-white p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold capitalize text-slate-900">
                {review.decision.replaceAll("_", " ")} · Version{" "}
                {review.submissionVersion}
              </p>
              <p className="mt-0.5 text-xs text-slate-500">
                Reviewer:{" "}
                {review.reviewerName || `Reviewer #${review.reviewerUserId}`}
              </p>
            </div>
            <time
              className="text-xs text-slate-500"
              dateTime={new Date(review.createdAt).toISOString()}
            >
              {new Date(review.createdAt).toLocaleString()}
            </time>
          </div>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
            {review.comments}
          </p>
          {review.rubric && (
            <details className="mt-3 rounded-lg bg-slate-50 p-3">
              <summary className="cursor-pointer text-xs font-semibold text-slate-800">
                Rubric v{review.rubric.rubricVersion} ·{" "}
                {review.rubric.totalScore}/{review.rubric.maximumScore} ·
                average {review.rubric.averageScore.toFixed(2)}/4 · formative,
                not an official grade
              </summary>
              <div className="mt-3 space-y-2">
                {review.rubric.criteria.map(criterion => (
                  <div
                    key={criterion.criterionId}
                    className="rounded-lg border border-slate-200 bg-white p-3"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="text-xs font-semibold text-slate-800">
                        {criterion.label}
                      </p>
                      <p className="text-xs font-semibold text-indigo-800">
                        {criterion.score} ·{" "}
                        {review.rubric?.scale.find(
                          item => item.value === criterion.score
                        )?.label ?? "Scored"}
                      </p>
                    </div>
                    {criterion.comment && (
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                        {criterion.comment}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </details>
          )}
        </li>
      ))}
    </ol>
  );
}
