import { useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  FileUp,
  Plus,
  Save,
  Send,
  Trash2,
  X,
} from "lucide-react";

type Kind =
  | "scheme"
  | "lesson"
  | "reflection"
  | "evidence"
  | "observation"
  | "supporting_document"
  | "final_report";
type Stage = {
  id: string;
  stage: string;
  duration: number;
  teacherActivities: string;
  learnerActivities: string;
  methods: string;
  resources: string;
  assessment: string;
};
type WeekRow = {
  id: string;
  week: number;
  startDate: string;
  endDate: string;
  topic: string;
  objectives: string;
  teacherActivities: string;
  learnerActivities: string;
  methods: string;
  resources: string;
  assessment: string;
  remarks: string;
};
type Entry = {
  id: number;
  kind: Kind;
  title: string;
  subject: string;
  className: string;
  lessonDate: string;
  status: string;
  payload: Record<string, unknown>;
};

const makeId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `row-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const emptyStage = (stage = "Introduction"): Stage => ({
  id: makeId(),
  stage,
  duration: 5,
  teacherActivities: "",
  learnerActivities: "",
  methods: "Discussion",
  resources: "",
  assessment: "",
});
const emptyWeek = (week = 1): WeekRow => ({
  id: makeId(),
  week,
  startDate: "",
  endDate: "",
  topic: "",
  objectives: "",
  teacherActivities: "",
  learnerActivities: "",
  methods: "",
  resources: "",
  assessment: "",
  remarks: "",
});
const getString = (value: unknown) => (typeof value === "string" ? value : "");
const isValidCalendarDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
};
const fieldClass =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100";
const allowedExtensions = [
  ".pdf",
  ".docx",
  ".xlsx",
  ".pptx",
  ".jpg",
  ".jpeg",
  ".png",
  ".mp4",
];
const mimeByExtension: Record<string, string> = {
  ".pdf": "application/pdf",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
};

function normalizeStages(value: unknown): Stage[] {
  if (!Array.isArray(value) || value.length === 0) return [emptyStage()];
  return value.map((item, index) => {
    const stage =
      item && typeof item === "object" ? (item as Partial<Stage>) : {};
    return {
      id: typeof stage.id === "string" && stage.id ? stage.id : makeId(),
      stage:
        typeof stage.stage === "string" && stage.stage
          ? stage.stage
          : `Stage ${index + 1}`,
      duration: Number.isFinite(Number(stage.duration))
        ? Number(stage.duration)
        : 5,
      teacherActivities: getString(stage.teacherActivities),
      learnerActivities: getString(stage.learnerActivities),
      methods: getString(stage.methods),
      resources: getString(stage.resources),
      assessment: getString(stage.assessment),
    };
  });
}

function normalizeWeeks(payload: Record<string, unknown>): WeekRow[] {
  if (Array.isArray(payload.weeks) && payload.weeks.length > 0) {
    return payload.weeks.map((item, index) => {
      const week =
        item && typeof item === "object" ? (item as Partial<WeekRow>) : {};
      return {
        id: typeof week.id === "string" && week.id ? week.id : makeId(),
        week:
          Number.isInteger(Number(week.week)) && Number(week.week) > 0
            ? Number(week.week)
            : index + 1,
        startDate: getString(week.startDate),
        endDate: getString(week.endDate),
        topic: getString(week.topic),
        objectives: getString(week.objectives),
        teacherActivities: getString(week.teacherActivities),
        learnerActivities: getString(week.learnerActivities),
        methods: getString(week.methods),
        resources: getString(week.resources),
        assessment: getString(week.assessment),
        remarks: getString(week.remarks),
      };
    });
  }
  const legacy = getString(payload.weeklyPlan).trim();
  if (legacy) {
    const parts = legacy
      .split(/[·|;]/)
      .map(part => part.trim())
      .filter(Boolean);
    const match = parts[0]?.match(/week\s+(\d+)/i);
    const row = emptyWeek(match ? Number(match[1]) : 1);
    row.topic = parts.length > 1 ? parts[1]! : legacy;
    row.objectives = parts[2] ?? "";
    row.resources = parts[3] ?? "";
    row.assessment = parts[4] ?? "";
    row.remarks = parts.slice(5).join(" · ");
    return [row];
  }
  return [emptyWeek()];
}

function authHeaders() {
  const headers: Record<string, string> = {};
  try {
    const csrf = sessionStorage.getItem("teachfolio-csrf");
    if (csrf) headers["X-CSRF-Token"] = csrf;
  } catch {}
  return headers;
}

function FormField({
  label,
  value,
  onChange,
  placeholder,
  rows = 0,
  type = "text",
  required = false,
  maxLength = 5000,
}: {
  label: string;
  value: unknown;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  type?: string;
  required?: boolean;
  maxLength?: number;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-rose-600">*</span>}
      </span>
      {rows > 0 ? (
        <textarea
          rows={rows}
          maxLength={maxLength}
          className={fieldClass}
          value={value == null ? "" : String(value)}
          required={required}
          placeholder={placeholder}
          onChange={event => onChange(event.target.value)}
        />
      ) : (
        <input
          type={type}
          required={required}
          maxLength={type === "date" ? undefined : maxLength}
          className={fieldClass}
          value={value == null ? "" : String(value)}
          placeholder={placeholder}
          onChange={event => onChange(event.target.value)}
        />
      )}
    </label>
  );
}

export default function PortfolioFormDialog({
  open,
  onClose,
  kind: initialKind = "lesson",
  entry,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  kind?: Kind;
  entry?: Entry | null;
  onSaved: (id: number) => void;
}) {
  const [kind, setKind] = useState<Kind>(initialKind);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [className, setClassName] = useState("");
  const [date, setDate] = useState("");
  const [duration, setDuration] = useState(40);
  const [stages, setStages] = useState<Stage[]>([emptyStage()]);
  const [weeks, setWeeks] = useState<WeekRow[]>([emptyWeek()]);
  const [payload, setPayload] = useState<Record<string, unknown>>({});
  const [file, setFile] = useState<File | null>(null);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [savedId, setSavedId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const uploadRequest = useRef<XMLHttpRequest | null>(null);
  const save = trpc.portfolio.saveDraft.useMutation();
  const submit = trpc.portfolio.submit.useMutation();
  const utils = trpc.useUtils();
  const editingLocked = Boolean(
    entry && !["draft", "revision_required"].includes(entry.status)
  );
  const relatedQuery = trpc.portfolio.list.useQuery(undefined, {
    enabled: open && ["lesson", "reflection", "evidence"].includes(kind),
    retry: false,
  });
  const existingEvidence = trpc.portfolio.get.useQuery(
    { id: entry?.id ?? 1 },
    {
      enabled: open && kind === "evidence" && Boolean(entry?.id),
      retry: false,
    }
  );

  useEffect(() => {
    if (!open) return;
    const nextPayload = entry?.payload ?? {};
    setKind(entry?.kind ?? initialKind);
    setTitle(entry?.title ?? "");
    setSubject(entry?.subject ?? "");
    setClassName(entry?.className ?? "");
    setDate(entry?.lessonDate ?? "");
    setPayload(nextPayload);
    setStages(normalizeStages(nextPayload.stages));
    setWeeks(normalizeWeeks(nextPayload));
    setDuration(Number(nextPayload.duration ?? 40));
    setFile(null);
    setConsent(false);
    setError("");
    setProgress(null);
    setSavedId(entry?.id ?? null);
    setDirty(false);
  }, [open, entry, initialKind]);

  const totalDuration = useMemo(
    () => stages.reduce((sum, stage) => sum + (Number(stage.duration) || 0), 0),
    [stages]
  );
  const setValue = (key: string, value: unknown) => {
    setDirty(true);
    setPayload(current => ({ ...current, [key]: value }));
  };
  const textField = (
    label: string,
    key: string,
    placeholder: string,
    rows = 0,
    required = false
  ) => (
    <FormField
      key={key}
      label={label}
      value={payload[key]}
      onChange={value => setValue(key, value)}
      placeholder={placeholder}
      rows={rows}
      required={required}
    />
  );
  const updateStage = (index: number, patch: Partial<Stage>) => {
    setDirty(true);
    setStages(items =>
      items.map((stage, current) =>
        current === index ? { ...stage, ...patch } : stage
      )
    );
  };
  const moveStage = (index: number, delta: number) => {
    setDirty(true);
    setStages(items => {
      const next = [...items];
      const target = index + delta;
      if (target < 0 || target >= items.length) return items;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };
  const updateWeek = (index: number, patch: Partial<WeekRow>) => {
    setDirty(true);
    setWeeks(items =>
      items.map((week, current) =>
        current === index ? { ...week, ...patch } : week
      )
    );
  };
  const moveWeek = (index: number, delta: number) => {
    setDirty(true);
    setWeeks(items => {
      const next = [...items];
      const target = index + delta;
      if (target < 0 || target >= items.length) return items;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  };
  const addWeek = () => {
    setDirty(true);
    const nextNumber =
      Math.max(0, ...weeks.map(week => Number(week.week) || 0)) + 1;
    setWeeks(current => [...current, emptyWeek(nextNumber)]);
  };
  const allowedLinks =
    kind === "lesson"
      ? ["scheme"]
      : kind === "reflection"
        ? ["lesson", "scheme"]
        : kind === "evidence"
          ? ["lesson", "scheme", "reflection"]
          : [];
  const relatedEntries = ((relatedQuery.data ?? []) as Entry[]).filter(item =>
    allowedLinks.includes(item.kind)
  );
  const linkedValue =
    payload.linkedEntryId === null || payload.linkedEntryId === undefined
      ? ""
      : String(payload.linkedEntryId);
  const fileType = (selected: File) =>
    selected.type ||
    mimeByExtension[
      `.${selected.name.split(".").pop()?.toLowerCase() ?? ""}`
    ] ||
    "";
  const validateLocal = (submitAfter: boolean) => {
    if (title.trim().length < 3)
      return "Add a clear title with at least three characters.";
    if (file && file.size > 25 * 1024 * 1024)
      return "Files must be 25 MiB or smaller.";
    if (
      file &&
      !allowedExtensions.includes(
        `.${file.name.split(".").pop()?.toLowerCase() ?? ""}`
      )
    )
      return "Choose a PDF, DOCX, XLSX, PPTX, JPG, PNG, or MP4 file.";
    if (file && !fileType(file))
      return "The selected file type could not be determined.";
    if (kind === "evidence" && file && !consent)
      return "Confirm the school/privacy authorization before uploading evidence.";
    if (kind === "lesson" && submitAfter) {
      if (!subject.trim() || !className.trim() || !isValidCalendarDate(date))
        return "A lesson needs a subject, class and valid lesson date.";
      if (
        !getString(payload.topic).trim() ||
        !getString(payload.objectives).trim() ||
        !getString(payload.priorKnowledge).trim()
      )
        return "Complete the lesson topic, objectives and prior knowledge.";
      if (
        !Number.isInteger(duration) ||
        duration <= 0 ||
        stages.length === 0 ||
        stages.some(
          stage =>
            !stage.stage.trim() ||
            !Number.isInteger(Number(stage.duration)) ||
            Number(stage.duration) <= 0
        )
      )
        return "Every lesson stage needs a name and a positive whole-minute duration.";
      if (totalDuration !== duration)
        return `Lesson stages total ${totalDuration} minutes; match the lesson duration of ${duration} minutes before submitting.`;
    }
    if (kind === "scheme") {
      const numbers = weeks.map(week => Number(week.week));
      if (numbers.some(number => !Number.isInteger(number) || number < 1))
        return "Every weekly row needs a positive whole-number week.";
      if (new Set(numbers).size !== numbers.length)
        return "Week numbers must be unique.";
      if (
        (payload.startDate || payload.endDate) &&
        (!isValidCalendarDate(getString(payload.startDate)) ||
          !isValidCalendarDate(getString(payload.endDate)) ||
          getString(payload.startDate) > getString(payload.endDate))
      )
        return "Check the overall scheme date range.";
      for (const week of weeks) {
        if (
          (week.startDate || week.endDate) &&
          (!isValidCalendarDate(week.startDate) ||
            !isValidCalendarDate(week.endDate) ||
            week.startDate > week.endDate)
        )
          return `Check the date range for week ${week.week}.`;
        if (
          week.startDate &&
          week.endDate &&
          (week.startDate < getString(payload.startDate) ||
            week.endDate > getString(payload.endDate))
        )
          return `Week ${week.week} must fall within the overall scheme dates.`;
      }
      if (
        submitAfter &&
        (!getString(payload.school).trim() ||
          !getString(payload.teacherName).trim() ||
          !getString(payload.academicYear).trim() ||
          !getString(payload.term).trim() ||
          !getString(payload.aims).trim() ||
          !getString(payload.startDate) ||
          !getString(payload.endDate) ||
          !subject.trim() ||
          !className.trim() ||
          !weeks.length ||
          weeks.some(week => !week.topic.trim() || !week.objectives.trim()))
      )
        return "Complete the scheme's institution, teacher, dates, subject, class, aims and weekly objectives before submitting.";
    }
    if (
      kind === "reflection" &&
      submitAfter &&
      (!isValidCalendarDate(date) ||
        !subject.trim() ||
        !className.trim() ||
        !getString(payload.lessonObjectives).trim() ||
        !getString(payload.whatHappened).trim() ||
        !getString(payload.objectivesAchieved).trim() ||
        !getString(payload.nextTime).trim())
    )
      return "Complete the date, class, subject, objectives, lesson events, objective achievement and next-time reflection before submitting.";
    if (
      kind === "evidence" &&
      submitAfter &&
      (!getString(payload.description).trim() ||
        !getString(payload.category).trim())
    )
      return "Add an evidence category and description before submitting.";
    return "";
  };

  const uploadFile = (entryId: number, selected: File) =>
    new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest();
      uploadRequest.current = request;
      request.open("POST", `/api/evidence/upload?entryId=${entryId}`);
      request.withCredentials = true;
      for (const [key, value] of Object.entries(authHeaders()))
        request.setRequestHeader(key, value);
      request.setRequestHeader("Content-Type", "application/octet-stream");
      request.setRequestHeader(
        "X-File-Name",
        encodeURIComponent(selected.name)
      );
      request.setRequestHeader("X-File-Type", fileType(selected));
      request.setRequestHeader("X-Consent-Confirmed", "true");
      request.upload.onprogress = event => {
        if (event.lengthComputable)
          setProgress(Math.round((event.loaded / event.total) * 100));
      };
      request.onerror = () => {
        uploadRequest.current = null;
        reject(
          new Error(
            "The file transfer failed. Evidence metadata is saved, but the file upload was not confirmed."
          )
        );
      };
      request.onabort = () => {
        uploadRequest.current = null;
        reject(
          new Error(
            "The file transfer was cancelled. Check the evidence list before retrying in case the server completed the upload."
          )
        );
      };
      request.onload = () => {
        uploadRequest.current = null;
        if (request.status >= 200 && request.status < 300) resolve();
        else {
          try {
            reject(
              new Error(
                JSON.parse(request.responseText).error || "Upload failed."
              )
            );
          } catch {
            reject(
              new Error(
                "Upload failed. Evidence metadata remains saved; the file was not confirmed."
              )
            );
          }
        }
      };
      request.send(selected);
    });

  const requestClose = () => {
    if (progress !== null || save.isPending || submit.isPending) return;
    if (dirty && !window.confirm("Discard the unsaved changes in this form?"))
      return;
    onClose();
  };
  const saveEntry = async (submitAfter: boolean, uploadAfterSave = false) => {
    setError("");
    const invalid = validateLocal(submitAfter);
    if (invalid) {
      setError(invalid);
      return;
    }
    const currentFileCount =
      (existingEvidence.data as { files?: unknown[] } | undefined)?.files
        ?.length ?? 0;
    if (submitAfter && kind === "evidence" && !file && currentFileCount === 0) {
      setError(
        "Upload at least one validated file before submitting this evidence record."
      );
      return;
    }
    if (
      submitAfter &&
      !window.confirm(
        "Submit this version for review? The submitted snapshot will be locked while it is under review."
      )
    )
      return;
    const mergedPayload = { ...payload };
    if (kind === "lesson") Object.assign(mergedPayload, { duration, stages });
    if (kind === "scheme") Object.assign(mergedPayload, { weeks });
    if (kind === "evidence")
      Object.assign(mergedPayload, {
        consentConfirmed: consent || currentFileCount > 0,
      });
    try {
      const saved = await save.mutateAsync({
        id: entry?.id ?? savedId ?? undefined,
        kind,
        title: title.trim(),
        subject: subject.trim(),
        className: className.trim(),
        lessonDate: date,
        payload: mergedPayload,
      });
      setSavedId(saved.id);
      setDirty(Boolean(uploadAfterSave && file && kind === "evidence"));
      await utils.portfolio.overview.invalidate();
      await utils.portfolio.list.invalidate();
      if (uploadAfterSave && file && kind === "evidence") {
        setProgress(0);
        await uploadFile(saved.id, file);
        setProgress(null);
        setFile(null);
        setDirty(false);
      }
      if (submitAfter) await submit.mutateAsync({ id: saved.id });
      await utils.portfolio.overview.invalidate();
      await utils.portfolio.list.invalidate();
      await utils.portfolio.get.invalidate();
      await utils.review.queue.invalidate();
      setDirty(false);
      onSaved(saved.id);
      onClose();
    } catch (reason) {
      setProgress(null);
      const message =
        reason instanceof Error ? reason.message : "Could not save this item.";
      const unavailable =
        /database is unavailable|service unavailable|failed to fetch|network error|private storage|storage did not accept|file transfer failed/i.test(
          message
        );
      setError(
        unavailable
          ? `Operation not confirmed — the portfolio backend or private storage is unavailable. Any earlier metadata save may have succeeded, but the file/submission was not confirmed. Check the saved record before retrying. ${message}`
          : message
      );
      await utils.portfolio.overview.invalidate();
      await utils.portfolio.list.invalidate();
    }
  };

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) requestClose();
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-form-heading"
        className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-t-2xl border border-slate-200 bg-white shadow-2xl sm:rounded-2xl"
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.16em] text-indigo-600">
              Portfolio workspace
            </p>
            <h2
              id="portfolio-form-heading"
              className="mt-1 text-xl font-semibold text-slate-900"
            >
              {entry ? "Edit draft" : "Create new entry"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Drafts persist to your institution's backend. Submitted snapshots
              are locked while under review.
            </p>
          </div>
          <button
            type="button"
            onClick={requestClose}
            aria-label="Close form"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>
        <div className="space-y-6 px-5 py-5 sm:px-7">
          {editingLocked && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              This submitted version is read-only. Wait for an authorized
              reviewer to request a revision.
            </div>
          )}
          <fieldset
            disabled={
              editingLocked ||
              save.isPending ||
              submit.isPending ||
              progress !== null
            }
            className="space-y-5 disabled:opacity-80"
          >
            {!entry && (
              <label className="block space-y-1.5">
                <span className="text-sm font-medium text-slate-700">
                  Portfolio category
                </span>
                <select
                  className={fieldClass}
                  value={kind}
                  onChange={event => {
                    setKind(event.target.value as Kind);
                    setDirty(true);
                  }}
                >
                  <option value="lesson">Lesson plan</option>
                  <option value="scheme">Scheme of work</option>
                  <option value="reflection">Reflective journal</option>
                  <option value="evidence">Teaching evidence</option>
                </select>
              </label>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1.5 sm:col-span-2">
                <span className="text-sm font-medium text-slate-700">
                  Title <span className="text-rose-600">*</span>
                </span>
                <input
                  required
                  minLength={3}
                  maxLength={220}
                  className={fieldClass}
                  value={title}
                  onChange={event => {
                    setTitle(event.target.value);
                    setDirty(true);
                  }}
                  placeholder={
                    kind === "lesson"
                      ? "e.g. Fractions — equivalent values"
                      : "Give this portfolio item a clear title"
                  }
                />
              </label>
              {!["observation", "supporting_document", "final_report"].includes(
                kind
              ) && (
                <>
                  <FormField
                    label="Subject"
                    value={subject}
                    onChange={value => {
                      setSubject(value);
                      setDirty(true);
                    }}
                    placeholder="e.g. Mathematics"
                    required={
                      kind === "lesson" ||
                      kind === "scheme" ||
                      kind === "reflection"
                    }
                  />
                  <FormField
                    label="Class / grade"
                    value={className}
                    onChange={value => {
                      setClassName(value);
                      setDirty(true);
                    }}
                    placeholder="e.g. Form 2A"
                    required={
                      kind === "lesson" ||
                      kind === "scheme" ||
                      kind === "reflection"
                    }
                  />
                  <FormField
                    label={
                      kind === "scheme"
                        ? "Planning record date (optional)"
                        : kind === "evidence"
                          ? "Capture / creation date"
                          : "Lesson date"
                    }
                    value={date}
                    onChange={value => {
                      setDate(value);
                      setDirty(true);
                    }}
                    type="date"
                    required={kind === "lesson" || kind === "reflection"}
                  />
                </>
              )}
            </div>

            {kind === "lesson" && (
              <div className="space-y-5">
                <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  {textField(
                    "Topic or content",
                    "topic",
                    "What will learners study?",
                    0,
                    true
                  )}
                  {textField(
                    "Prior knowledge",
                    "priorKnowledge",
                    "What should learners already know?",
                    2,
                    true
                  )}
                  {textField(
                    "Learning objectives",
                    "objectives",
                    "By the end, learners will be able to…",
                    3,
                    true
                  )}
                  {textField(
                    "Teaching resources",
                    "resources",
                    "Textbooks, board, manipulatives…",
                    2
                  )}
                  {textField(
                    "Lesson content",
                    "content",
                    "Main content and sequence",
                    3
                  )}
                  {textField(
                    "Introduction / set induction",
                    "introduction",
                    "How will you focus learners?",
                    2
                  )}
                  {textField(
                    "Safety and accessibility",
                    "safety",
                    "Considerations for this class",
                    2
                  )}
                  <label className="block space-y-1.5">
                    <span className="text-sm font-medium text-slate-700">
                      Linked scheme
                    </span>
                    <select
                      className={fieldClass}
                      value={allowedLinks.includes("scheme") ? linkedValue : ""}
                      onChange={event =>
                        setValue(
                          "linkedEntryId",
                          event.target.value ? Number(event.target.value) : null
                        )
                      }
                    >
                      <option value="">No scheme linked</option>
                      {relatedEntries
                        .filter(item => item.kind === "scheme")
                        .map(item => (
                          <option key={item.id} value={item.id}>
                            {item.title}
                          </option>
                        ))}
                    </select>
                  </label>
                </div>
                <div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Lesson procedure
                      </h3>
                      <p className="text-xs text-slate-500">
                        Reorder stages. Submission is blocked until the stage
                        total matches the lesson duration.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setStages(items => [
                          ...items,
                          emptyStage(`Stage ${items.length + 1}`),
                        ]);
                        setDirty(true);
                      }}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Plus size={15} />
                      Add stage
                    </button>
                  </div>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-indigo-50 px-3 py-2 text-sm">
                    <label className="flex items-center gap-2 font-medium text-slate-700">
                      Lesson duration{" "}
                      <input
                        type="number"
                        min={1}
                        step={1}
                        className="w-20 rounded-md border border-indigo-200 bg-white px-2 py-1"
                        value={duration}
                        onChange={event => {
                          setDuration(Number(event.target.value));
                          setDirty(true);
                        }}
                      />{" "}
                      min
                    </label>
                    <span
                      className={
                        totalDuration === duration
                          ? "font-semibold text-emerald-700"
                          : "font-semibold text-amber-800"
                      }
                    >
                      Stages total {totalDuration} min{" "}
                      {totalDuration === duration
                        ? "✓"
                        : `· ${Math.abs(totalDuration - duration)} min ${totalDuration > duration ? "over" : "short"}`}
                    </span>
                  </div>
                  <div className="space-y-3">
                    {stages.map((stage, index) => (
                      <article
                        key={stage.id}
                        className="rounded-xl border border-slate-200 p-4"
                      >
                        <div className="mb-3 flex flex-wrap items-center gap-2">
                          <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                            {index + 1}
                          </span>
                          <input
                            aria-label={`Stage ${index + 1} name`}
                            className="min-w-0 flex-1 rounded-md border border-transparent px-2 py-1 font-semibold text-slate-800 focus:border-slate-200"
                            value={stage.stage}
                            onChange={event =>
                              updateStage(index, { stage: event.target.value })
                            }
                          />
                          <label className="flex items-center gap-1 text-xs text-slate-500">
                            <input
                              aria-label={`Stage ${index + 1} duration in minutes`}
                              type="number"
                              min={1}
                              step={1}
                              className="w-16 rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-800"
                              value={stage.duration}
                              onChange={event =>
                                updateStage(index, {
                                  duration: Number(event.target.value),
                                })
                              }
                            />{" "}
                            min
                          </label>
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => moveStage(index, -1)}
                            aria-label={`Move stage ${index + 1} up`}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                          >
                            <ArrowUp size={15} />
                          </button>
                          <button
                            type="button"
                            disabled={index === stages.length - 1}
                            onClick={() => moveStage(index, 1)}
                            aria-label={`Move stage ${index + 1} down`}
                            className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                          >
                            <ArrowDown size={15} />
                          </button>
                          <button
                            type="button"
                            disabled={stages.length === 1}
                            onClick={() => {
                              setStages(items =>
                                items.filter(
                                  (_, itemIndex) => itemIndex !== index
                                )
                              );
                              setDirty(true);
                            }}
                            aria-label={`Remove stage ${index + 1}`}
                            className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                          {(
                            [
                              "teacherActivities",
                              "learnerActivities",
                              "methods",
                              "resources",
                              "assessment",
                            ] as const
                          ).map(key => (
                            <label key={key} className="block space-y-1">
                              <span className="text-xs font-medium capitalize text-slate-600">
                                {key.replace(
                                  /[A-Z]/g,
                                  letter => ` ${letter.toLowerCase()}`
                                )}
                              </span>
                              <textarea
                                rows={2}
                                maxLength={3000}
                                className={fieldClass}
                                value={stage[key]}
                                onChange={event =>
                                  updateStage(index, {
                                    [key]: event.target.value,
                                  })
                                }
                              />
                            </label>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  {textField(
                    "Homework / follow-up",
                    "homework",
                    "Practice or extension activity",
                    2
                  )}
                  {textField(
                    "Evaluation and reflection",
                    "evaluation",
                    "What evidence showed learning? What would you change?",
                    3
                  )}
                </div>
              </div>
            )}

            {kind === "scheme" && (
              <div className="space-y-5">
                <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                  {textField(
                    "Placement school",
                    "school",
                    "Assigned placement school",
                    0,
                    true
                  )}
                  {textField(
                    "Student teacher",
                    "teacherName",
                    "Your name as recorded by the institution",
                    0,
                    true
                  )}
                  {textField(
                    "Academic year",
                    "academicYear",
                    "e.g. 2026",
                    0,
                    true
                  )}
                  {textField(
                    "Term / teaching-practice period",
                    "term",
                    "e.g. Term 3",
                    0,
                    true
                  )}
                  <FormField
                    label="Scheme start date"
                    value={payload.startDate}
                    onChange={value => setValue("startDate", value)}
                    type="date"
                    required
                  />
                  <FormField
                    label="Scheme end date"
                    value={payload.endDate}
                    onChange={value => setValue("endDate", value)}
                    type="date"
                    required
                  />
                  <FormField
                    label="Teaching weeks"
                    value={payload.teachingWeeks}
                    onChange={value => setValue("teachingWeeks", value)}
                    type="number"
                    placeholder="e.g. 12"
                  />
                  <FormField
                    label="Periods per week"
                    value={payload.periodsPerWeek}
                    onChange={value => setValue("periodsPerWeek", value)}
                    type="number"
                    placeholder="e.g. 4"
                  />
                  <FormField
                    label="Period duration (minutes)"
                    value={payload.periodDuration}
                    onChange={value => setValue("periodDuration", value)}
                    type="number"
                    placeholder="e.g. 35"
                  />
                  {textField(
                    "General aims and objectives",
                    "aims",
                    "What should learners achieve?",
                    3,
                    true
                  )}
                  {textField(
                    "Prior knowledge",
                    "priorKnowledge",
                    "Prerequisite learning",
                    2
                  )}
                  {textField(
                    "Curriculum reference",
                    "curriculumReference",
                    "Source syllabus",
                    2
                  )}
                  {textField(
                    "Teaching methods",
                    "methods",
                    "Methods used across this unit",
                    2
                  )}
                  {textField(
                    "Teaching and learning resources",
                    "resources",
                    "Books, materials, equipment",
                    2
                  )}
                  {textField(
                    "Assessment approaches",
                    "assessment",
                    "How learning will be checked",
                    2
                  )}
                </div>
                <section className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">
                        Weekly plan
                      </h3>
                      <p className="text-xs text-slate-500">
                        Edit and reorder each teaching week; week numbers must
                        be unique.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={addWeek}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      <Plus size={15} />
                      Add week
                    </button>
                  </div>
                  {weeks.map((week, index) => (
                    <article
                      key={week.id}
                      className="rounded-xl border border-slate-200 bg-white p-4"
                    >
                      <div className="mb-3 flex flex-wrap items-center gap-2">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-700">
                          {index + 1}
                        </span>
                        <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                          Week{" "}
                          <input
                            aria-label={`Week number for row ${index + 1}`}
                            type="number"
                            min={1}
                            step={1}
                            value={week.week}
                            onChange={event =>
                              updateWeek(index, {
                                week: Number(event.target.value),
                              })
                            }
                            className="w-20 rounded-md border border-slate-200 px-2 py-1"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={index === 0}
                          onClick={() => moveWeek(index, -1)}
                          aria-label={`Move week row ${index + 1} up`}
                          className="ml-auto rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowUp size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={index === weeks.length - 1}
                          onClick={() => moveWeek(index, 1)}
                          aria-label={`Move week row ${index + 1} down`}
                          className="rounded p-1 text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                        >
                          <ArrowDown size={15} />
                        </button>
                        <button
                          type="button"
                          disabled={weeks.length === 1}
                          onClick={() => {
                            setWeeks(items =>
                              items.filter(
                                (_, itemIndex) => itemIndex !== index
                              )
                            );
                            setDirty(true);
                          }}
                          aria-label={`Remove week row ${index + 1}`}
                          className="rounded p-1 text-rose-600 hover:bg-rose-50 disabled:opacity-30"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <FormField
                          label="Week start"
                          value={week.startDate}
                          onChange={value =>
                            updateWeek(index, { startDate: value })
                          }
                          type="date"
                        />
                        <FormField
                          label="Week end"
                          value={week.endDate}
                          onChange={value =>
                            updateWeek(index, { endDate: value })
                          }
                          type="date"
                        />
                        <label className="block space-y-1.5 sm:col-span-2">
                          <span className="text-sm font-medium text-slate-700">
                            Topic / content{" "}
                            <span className="text-rose-600">*</span>
                          </span>
                          <input
                            className={fieldClass}
                            maxLength={500}
                            value={week.topic}
                            onChange={event =>
                              updateWeek(index, { topic: event.target.value })
                            }
                            placeholder="What will be taught this week?"
                          />
                        </label>
                        <label className="block space-y-1.5 sm:col-span-2">
                          <span className="text-sm font-medium text-slate-700">
                            Specific learning objectives{" "}
                            <span className="text-rose-600">*</span>
                          </span>
                          <textarea
                            rows={2}
                            maxLength={3000}
                            className={fieldClass}
                            value={week.objectives}
                            onChange={event =>
                              updateWeek(index, {
                                objectives: event.target.value,
                              })
                            }
                            placeholder="What should learners be able to do?"
                          />
                        </label>
                        {(
                          [
                            "teacherActivities",
                            "learnerActivities",
                            "methods",
                            "resources",
                            "assessment",
                            "remarks",
                          ] as const
                        ).map(key => (
                          <label key={key} className="block space-y-1">
                            <span className="text-xs font-medium capitalize text-slate-600">
                              {key.replace(
                                /[A-Z]/g,
                                letter => ` ${letter.toLowerCase()}`
                              )}
                            </span>
                            <textarea
                              rows={2}
                              maxLength={3000}
                              className={fieldClass}
                              value={week[key]}
                              onChange={event =>
                                updateWeek(index, { [key]: event.target.value })
                              }
                            />
                          </label>
                        ))}
                      </div>
                    </article>
                  ))}
                </section>
              </div>
            )}

            {kind === "reflection" && (
              <div className="grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
                {textField(
                  "Placement school",
                  "school",
                  "School where the lesson took place"
                )}
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Link a lesson plan or scheme
                  </span>
                  <select
                    className={fieldClass}
                    value={linkedValue}
                    onChange={event =>
                      setValue(
                        "linkedEntryId",
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                  >
                    <option value="">No linked record</option>
                    {relatedEntries.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.kind === "lesson" ? "Lesson" : "Scheme"} ·{" "}
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                {textField(
                  "Lesson objectives",
                  "lessonObjectives",
                  "What did learners aim to achieve?",
                  2,
                  true
                )}
                {textField(
                  "What happened?",
                  "whatHappened",
                  "Describe the lesson and context",
                  3,
                  true
                )}
                {textField(
                  "Objectives achieved",
                  "objectivesAchieved",
                  "Which objectives were achieved, and how?",
                  2,
                  true
                )}
                {textField(
                  "Evidence of learner understanding",
                  "understandingEvidence",
                  "What showed that learners understood?",
                  2
                )}
                {textField(
                  "Effective strategies",
                  "strategies",
                  "What teaching strategies worked?",
                  2
                )}
                {textField(
                  "Difficulties",
                  "difficulties",
                  "What challenges arose?",
                  2
                )}
                {textField(
                  "Learner participation",
                  "participation",
                  "How did learners participate?",
                  2
                )}
                {textField(
                  "What would you change next time?",
                  "nextTime",
                  "What will you do differently?",
                  2,
                  true
                )}
                {textField(
                  "Professional learning",
                  "professionalLearning",
                  "What did you learn about your practice?",
                  2
                )}
                {textField(
                  "Improvement actions",
                  "improvementActions",
                  "Specific next steps",
                  2
                )}
                {textField(
                  "Supervisor feedback",
                  "supervisorFeedback",
                  "Record authorized feedback, if applicable",
                  2
                )}
              </div>
            )}

            {kind === "evidence" && (
              <div className="space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
                {textField(
                  "Placement school",
                  "school",
                  "School or placement context"
                )}
                {textField(
                  "Description and context",
                  "description",
                  "Explain how this supports your teaching-practice portfolio",
                  3,
                  true
                )}
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Evidence category
                  </span>
                  <select
                    className={fieldClass}
                    value={getString(payload.category) || "teaching_resource"}
                    onChange={event => setValue("category", event.target.value)}
                  >
                    <option value="lesson_document">Lesson document</option>
                    <option value="scheme">Scheme of work</option>
                    <option value="teaching_resource">Teaching resource</option>
                    <option value="classroom_activity">
                      Classroom activity evidence
                    </option>
                    <option value="photograph">
                      Teaching-practice photograph
                    </option>
                    <option value="video">Teaching video</option>
                    <option value="observation">Observation form</option>
                    <option value="assessment">Assessment record</option>
                    <option value="certificate">
                      Supporting certificate/document
                    </option>
                    <option value="other">Other approved evidence</option>
                  </select>
                </label>
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-slate-700">
                    Link a lesson, scheme or reflection
                  </span>
                  <select
                    className={fieldClass}
                    value={linkedValue}
                    onChange={event =>
                      setValue(
                        "linkedEntryId",
                        event.target.value ? Number(event.target.value) : null
                      )
                    }
                  >
                    <option value="">No linked record</option>
                    {relatedEntries.map(item => (
                      <option key={item.id} value={item.id}>
                        {item.kind} · {item.title}
                      </option>
                    ))}
                  </select>
                </label>
                {textField("Tags", "tags", "Comma-separated search tags")}
                <label
                  className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-4 hover:border-indigo-300"
                  onDragOver={event => event.preventDefault()}
                  onDrop={event => {
                    event.preventDefault();
                    const selected = event.dataTransfer.files?.[0];
                    if (selected) {
                      setFile(selected);
                      setDirty(true);
                      setError("");
                    }
                  }}
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-indigo-50 text-indigo-600 shadow-sm">
                    <FileUp size={19} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-800">
                      {file?.name || "Choose or drop one file"}
                    </span>
                    <span className="block text-xs text-slate-500">
                      PDF, DOCX, XLSX, PPTX, JPG, PNG, MP4 · max 25 MiB ·
                      checked by the server
                    </span>
                    {file && (
                      <span className="mt-1 block text-xs text-slate-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MiB ·{" "}
                        {fileType(file) || "unrecognized type"}
                      </span>
                    )}
                  </span>
                  <input
                    type="file"
                    className="sr-only"
                    accept={allowedExtensions.join(",")}
                    onChange={event => {
                      setFile(event.target.files?.[0] ?? null);
                      setDirty(true);
                      setError("");
                    }}
                  />
                </label>
                <label className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
                  <input
                    className="mt-1 h-4 w-4 accent-indigo-600"
                    type="checkbox"
                    checked={consent}
                    onChange={event => {
                      setConsent(event.target.checked);
                      setDirty(true);
                    }}
                  />
                  <span>
                    I confirm school authorization and, where applicable,
                    guardian consent before uploading identifiable learner
                    images/video. Learner media remains restricted and must not
                    be publicly displayed.
                  </span>
                </label>
                {existingEvidence.data &&
                  (
                    existingEvidence.data.files as Array<{
                      id: number;
                      fileName: string;
                      byteSize: number;
                    }>
                  ).length > 0 && (
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                      {
                        (
                          existingEvidence.data.files as Array<{
                            id: number;
                            fileName: string;
                            byteSize: number;
                          }>
                        ).length
                      }{" "}
                      private file(s) are already attached. Use the evidence
                      record page to preview or download them.
                    </div>
                  )}
                {progress !== null && (
                  <p role="status" className="text-xs text-slate-600">
                    Uploading evidence: {progress}%
                  </p>
                )}
                <p className="text-xs leading-relaxed text-slate-500">
                  Upload success is confirmed only after the private storage
                  transfer and database metadata record both succeed. A backend
                  or storage error is not saved offline.
                </p>
              </div>
            )}
            {(kind === "observation" ||
              kind === "supporting_document" ||
              kind === "final_report") && (
              <div className="grid gap-4">
                {textField(
                  "Description",
                  "description",
                  "Add the relevant details",
                  4
                )}
              </div>
            )}
          </fieldset>
          {progress !== null && (
            <div className="flex items-center gap-3 rounded-lg bg-indigo-50 px-3 py-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full bg-indigo-600 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <button
                type="button"
                onClick={() => uploadRequest.current?.abort()}
                className="text-xs font-semibold text-rose-700 underline"
              >
                Cancel transfer
              </button>
            </div>
          )}
          {error && (
            <div
              role="alert"
              className={`flex items-start gap-2 rounded-xl border p-3 text-sm ${error.startsWith("Operation not confirmed") ? "border-amber-300 bg-amber-50 text-amber-950" : "border-rose-200 bg-rose-50 text-rose-800"}`}
            >
              <AlertTriangle className="mt-0.5 shrink-0" size={16} />
              {error}
            </div>
          )}
          {kind === "evidence" && (
            <p className="text-xs leading-relaxed text-slate-500">
              A metadata-only save does not upload a file. Choose “Save metadata
              and upload” to transfer a selected file, or “Save and submit”
              after a private file is attached.
            </p>
          )}
        </div>
        <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={requestClose}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={
              editingLocked ||
              save.isPending ||
              submit.isPending ||
              progress !== null
            }
            onClick={() => void saveEntry(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Save size={16} />
            {kind === "evidence" ? "Save metadata only" : "Save draft"}
          </button>
          {kind !== "evidence" && (
            <button
              type="button"
              disabled={
                editingLocked ||
                save.isPending ||
                submit.isPending ||
                progress !== null
              }
              onClick={() => void saveEntry(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-800 disabled:opacity-50"
            >
              {submit.isPending ? (
                "Submitting…"
              ) : (
                <>
                  <Send size={15} />
                  Save and submit
                </>
              )}
            </button>
          )}
          {kind === "evidence" && file && (
            <button
              type="button"
              disabled={
                editingLocked ||
                save.isPending ||
                submit.isPending ||
                progress !== null
              }
              onClick={() => void saveEntry(false, true)}
              className="inline-flex items-center gap-2 rounded-lg border border-indigo-200 px-4 py-2.5 text-sm font-semibold text-indigo-800 hover:bg-indigo-50 disabled:opacity-50"
            >
              <Check size={15} />
              Save metadata and upload
            </button>
          )}
          {kind === "evidence" && (
            <button
              type="button"
              disabled={
                editingLocked ||
                save.isPending ||
                submit.isPending ||
                progress !== null
              }
              onClick={() => void saveEntry(true, Boolean(file))}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50"
            >
              {submit.isPending ? (
                "Submitting…"
              ) : (
                <>
                  <Send size={15} />
                  Save and submit
                </>
              )}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}
