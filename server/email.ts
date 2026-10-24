import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { accessAssignments, institutions, userPreferences, users } from "../drizzle/schema";
import * as db from "./db";

type EmailContent = {
  to: string;
  subject: string;
  heading: string;
  preheader?: string;
  paragraphs: string[];
  action?: { label: string; href: string };
};

export type NotificationEmail = {
  userId: number;
  subject: string;
  heading: string;
  message: string;
  href: string;
};

function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    character =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!
  );
}

function publicOrigin() {
  const value = process.env.APP_BASE_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      (process.env.NODE_ENV === "production" && url.protocol !== "https:") ||
      url.username ||
      url.password
    )
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

function appLink(path: string) {
  const origin = publicOrigin();
  if (!origin || !path.startsWith("/") || path.startsWith("//")) return null;
  const url = new URL(path, origin);
  return url.origin === origin ? url.toString() : null;
}

function configured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() && process.env.RESEND_FROM_EMAIL?.trim()
  );
}

/** Send one transactional email. False means Resend did not accept it. */
export async function sendTeachfolioEmail(content: EmailContent) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM_EMAIL?.trim();
  if (!apiKey || !from) return false;

  const paragraphs = content.paragraphs
    .map(
      paragraph =>
        `<p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.65">${escapeHtml(paragraph)}</p>`
    )
    .join("");
  const action = content.action
    ? `<p style="margin:24px 0"><a href="${escapeHtml(content.action.href)}" style="display:inline-block;background:#285bc0;border-radius:8px;color:#fff;padding:12px 18px;text-decoration:none;font-weight:600">${escapeHtml(content.action.label)}</a></p><p style="color:#64748b;font-size:12px;line-height:1.6">If the button does not work, copy this address into your browser:<br><a href="${escapeHtml(content.action.href)}">${escapeHtml(content.action.href)}</a></p>`
    : "";
  const preheader = content.preheader ?? content.paragraphs[0] ?? content.heading;
  const markUrl = appLink("/teachfolio-mark.svg");
  const wordmark = markUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 28px"><tr><td style="vertical-align:middle;padding-right:12px"><img src="${escapeHtml(markUrl)}" width="42" height="42" alt="Teachfolio" style="display:block;width:42px;height:42px;border:0"></td><td style="vertical-align:middle"><strong style="display:block;color:#0f172a;font-size:16px;line-height:1.3">Teachfolio</strong><span style="display:block;margin-top:3px;color:#64748b;font-size:11px">Student Teacher E-Portfolio</span></td></tr></table>`
    : `<p style="margin:0 0 28px;color:#285bc0;font-size:15px;font-weight:700">Teachfolio <span style="font-size:11px;font-weight:400;color:#64748b">· Student Teacher E-Portfolio</span></p>`;
  const html = `<div style="display:none!important;visibility:hidden;opacity:0;color:transparent;height:0;width:0;overflow:hidden;mso-hide:all">${escapeHtml(preheader)}</div><div style="background:#f3f6fb;padding:36px 14px;font-family:Arial,Helvetica,sans-serif"><div style="max-width:560px;margin:0 auto"><div style="background:#fff;border:1px solid #e2e8f0;border-radius:14px;padding:34px 32px">${wordmark}<h1 style="margin:0 0 18px;color:#0f172a;font-size:25px;line-height:1.3;font-weight:700">${escapeHtml(content.heading)}</h1>${paragraphs}${action}<hr style="border:0;border-top:1px solid #e2e8f0;margin:30px 0 16px"><p style="margin:0;color:#64748b;font-size:12px;line-height:1.65">You received this message because of an action in Teachfolio. If you need help, contact your institution administrator.</p></div><p style="margin:16px 0 0;text-align:center;color:#94a3b8;font-size:11px">Teachfolio · Teaching Practice Portfolio</p></div></div>`;
  const text = [
    content.heading,
    "",
    ...content.paragraphs,
    ...(content.action
      ? ["", `${content.action.label}: ${content.action.href}`]
      : []),
    "",
    "Teachfolio · Student Teacher E-Portfolio",
  ].join("\n");

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [content.to],
        subject: content.subject.replace(/[\r\n]+/g, " ").slice(0, 180),
        html,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      console.warn(
        `[Email] Resend rejected a message (HTTP ${response.status}).`
      );
      return false;
    }
    return true;
  } catch (error) {
    console.warn(
      "[Email] Resend acceptance could not be confirmed.",
      error instanceof Error ? error.name : "UnknownError"
    );
    return false;
  }
}

export async function sendInvitationEmail(input: {
  email: string;
  role: string;
  institutionName: string;
  token: string;
}) {
  const href = appLink(`/?invite=${encodeURIComponent(input.token)}`);
  if (!configured() || !href) return false;
  return sendTeachfolioEmail({
    to: input.email,
    subject: `Your Teachfolio invitation to ${input.institutionName}`,
    heading: "You have been invited to Teachfolio",
    paragraphs: [
      `${input.institutionName} has invited you to join its Student Teacher E-Portfolio workspace as ${input.role.replaceAll("_", " ")}.`,
      "Sign in or create an account using this exact email address, then follow the invitation link to activate your access. The link expires in seven days and can be used once.",
      "If you were not expecting this invitation, contact the institution that sent it.",
    ],
    action: { label: "Accept invitation", href },
  });
}

export async function sendAccessActivatedEmail(input: {
  email: string;
  role: string;
  institutionName: string;
}) {
  const href = appLink("/");
  return sendTeachfolioEmail({
    to: input.email,
    subject: "Your Teachfolio access is ready",
    heading: "Your portfolio access is active",
    paragraphs: [
      `Your ${input.role.replaceAll("_", " ")} access to ${input.institutionName} is now active.`,
      "Sign in to continue to your institution workspace.",
    ],
    ...(href ? { action: { label: "Open Teachfolio", href } } : {}),
  });
}

/** Email only active users who hold an assignment in this institution. */
export async function emailNotificationRecipients(input: {
  institutionId: number;
  notifications: NotificationEmail[];
}) {
  if (!configured() || !input.notifications.length) return;
  try {
    const database = await db.getDb();
    if (!database) return;
    const institutionRows = await database
      .select({ name: institutions.name, active: institutions.active })
      .from(institutions)
      .where(eq(institutions.id, input.institutionId))
      .limit(1);
    const institution = institutionRows[0];
    if (!institution?.active) return;

    const notificationsByUser = new Map(
      input.notifications.map(item => [item.userId, item])
    );
    const userIds = [...notificationsByUser.keys()];
    const recipients = await database
      .select({ userId: users.id, email: users.email })
      .from(accessAssignments)
      .innerJoin(users, eq(accessAssignments.userId, users.id))
      .leftJoin(userPreferences, eq(userPreferences.userId, users.id))
      .where(
        and(
          eq(accessAssignments.institutionId, input.institutionId),
          eq(accessAssignments.status, "active"),
          or(eq(userPreferences.emailNotifications, true), isNull(userPreferences.emailNotifications)),
          inArray(accessAssignments.userId, userIds)
        )
      );
    const uniqueRecipients = [
      ...new Map(
        recipients.map(recipient => [recipient.userId, recipient])
      ).values(),
    ];
    const results = await Promise.all(
      uniqueRecipients.flatMap(recipient => {
        const notification = notificationsByUser.get(recipient.userId);
        if (!notification || !recipient.email) return [];
        const href = appLink(notification.href);
        return [
          sendTeachfolioEmail({
            to: recipient.email,
            subject: notification.subject,
            heading: notification.heading,
            paragraphs: [
              notification.message,
              `Institution: ${institution.name}.`,
            ],
            ...(href ? { action: { label: "Open Teachfolio", href } } : {}),
          }),
        ];
      })
    );
    const failedCount = results.filter(sent => !sent).length;
    if (failedCount)
      console.warn(
        `[Email] ${failedCount} notification email(s) were not accepted.`
      );
  } catch (error) {
    console.warn(
      "[Email] Notification email processing failed.",
      error instanceof Error ? error.name : "UnknownError"
    );
  }
}
