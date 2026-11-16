import type { EmailVerificationEmail, InvitationEmail, PasswordResetEmail } from './mail.service';

/** One rendered message: the same wording as plain text and as branded HTML. */
export interface RenderedMail {
  subject: string;
  text: string;
  html: string;
}

/**
 * Brand colours. The button is copper with navy text (4.98:1); white on that copper is only 3.13:1,
 * which fails WCAG AA for button text.
 */
const NAVY = '#1C2433';
const COPPER = '#C9822E';
const PAGE_BACKGROUND = '#F3F4F6';
const BODY_TEXT = '#1F2937';
const MUTED_TEXT = '#4B5563';
const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** Where the web app serves the mark. A PNG, because mail clients do not render SVG reliably. */
const MARK_PATH = '/brand/mark-email.png';

/**
 * Every interpolated value goes through this. An organisation name is typed by a user, and a URL
 * lands inside an attribute, so quotes matter as much as angle brackets.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * The role words the app itself uses (`ROLE_LABELS` in the web's members feature), with the article
 * that reads right before each. An unknown value is passed through rather than hidden.
 */
const ROLE_PHRASES: Record<string, string> = {
  ORG_ADMIN: 'an Org Admin',
  PLANNER: 'a Planner',
  CONTRIBUTOR: 'a Contributor',
  VIEWER: 'a Viewer',
};

function rolePhrase(role: string): string {
  return ROLE_PHRASES[role] ?? `a ${role}`;
}

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/**
 * The mark is served by the same origin as the link the message carries, so the two can never
 * disagree and the mail adapter needs no web-origin setting of its own.
 */
function markUrl(linkUrl: string): string {
  return new URL(MARK_PATH, new URL(linkUrl).origin).toString();
}

interface Layout {
  title: string;
  preheader: string;
  paragraphs: string[];
  buttonLabel: string;
  url: string;
  notes: string[];
  footer: string;
}

function renderHtml(layout: Layout): string {
  const paragraphs = layout.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px 0;font-size:16px;line-height:24px;color:${BODY_TEXT};">${p}</p>`,
    )
    .join('');
  const notes = layout.notes
    .map(
      (n) =>
        `<p style="margin:0 0 16px 0;font-size:14px;line-height:20px;color:${MUTED_TEXT};">${n}</p>`,
    )
    .join('');
  const url = escapeHtml(layout.url);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(layout.title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${PAGE_BACKGROUND};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(layout.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${PAGE_BACKGROUND};">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td style="background-color:${NAVY};padding:16px 24px;border-radius:8px 8px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="padding-right:12px;"><img src="${escapeHtml(markUrl(layout.url))}" width="32" height="32" alt="" style="display:block;border:0;border-radius:6px;"></td>
<td style="font-family:${FONT};font-size:20px;font-weight:bold;color:#FFFFFF;">SchedulePoint</td>
</tr></table>
</td></tr>
<tr><td style="background-color:#FFFFFF;padding:32px 24px;font-family:${FONT};border-radius:0 0 8px 8px;">
${paragraphs}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px 0;"><tr>
<td align="center" bgcolor="${COPPER}" style="background-color:${COPPER};border-radius:6px;"><a href="${url}" style="display:inline-block;padding:14px 28px;font-family:${FONT};font-size:16px;font-weight:bold;color:${NAVY};text-decoration:none;">${escapeHtml(layout.buttonLabel)}</a></td>
</tr></table>
<p style="margin:0 0 4px 0;font-size:14px;line-height:20px;color:${MUTED_TEXT};">If the button does not work, copy this link into your browser:</p>
<p style="margin:0 0 24px 0;font-size:14px;line-height:20px;word-break:break-all;"><a href="${url}" style="color:${NAVY};">${url}</a></p>
${notes}
<p style="margin:0;font-size:14px;line-height:20px;color:${MUTED_TEXT};">${layout.footer}</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>
`;
}

/**
 * The closing line of a reset is deliberate: a reset arriving unrequested is the one signal an
 * account holder gets that somebody is probing their address, so it says the password is unchanged,
 * which is what makes ignoring it safe.
 */
export function renderPasswordReset(email: PasswordResetEmail): RenderedMail {
  const footer =
    'If you did not ask to reset your password, you can ignore this message — your password has ' +
    'not been changed.';
  const expiry = 'This link works once and expires in an hour.';
  const intro = 'Choose a new password for your SchedulePoint account:';
  return {
    subject: 'Reset your SchedulePoint password',
    text: [intro, '', email.resetUrl, '', expiry, '', footer].join('\n'),
    html: renderHtml({
      title: 'Reset your SchedulePoint password',
      preheader: intro,
      paragraphs: [escapeHtml(intro)],
      buttonLabel: 'Choose a new password',
      url: email.resetUrl,
      notes: [escapeHtml(expiry)],
      footer: escapeHtml(footer),
    }),
  };
}

export function renderEmailVerification(email: EmailVerificationEmail): RenderedMail {
  const intro =
    'Open this link, then press “Confirm my email address” to finish setting up your ' +
    'SchedulePoint account:';
  const expiry = 'The link works for an hour.';
  const footer = 'If you did not create an account, you can ignore this message.';
  return {
    subject: 'Confirm your email address for SchedulePoint',
    text: [intro, '', email.verifyUrl, '', expiry, '', footer].join('\n'),
    html: renderHtml({
      title: 'Confirm your email address for SchedulePoint',
      preheader: intro,
      paragraphs: [escapeHtml(intro)],
      buttonLabel: 'Open the confirmation page',
      url: email.verifyUrl,
      notes: [escapeHtml(expiry)],
      footer: escapeHtml(footer),
    }),
  };
}

export function renderInvitation(email: InvitationEmail): RenderedMail {
  const intro = `You have been invited to join ${email.organizationName} on SchedulePoint as ${rolePhrase(email.role)}.`;
  const expiry = `This invitation expires on ${DATE_FORMAT.format(email.expiresAt)}.`;
  const footer = 'If you were not expecting this invitation, you can ignore this message.';
  return {
    subject: `You have been invited to ${email.organizationName} on SchedulePoint`,
    text: [intro, '', 'Accept the invitation:', email.acceptUrl, '', expiry, '', footer].join('\n'),
    html: renderHtml({
      title: `You have been invited to ${email.organizationName} on SchedulePoint`,
      preheader: intro,
      paragraphs: [escapeHtml(intro)],
      buttonLabel: 'Accept the invitation',
      url: email.acceptUrl,
      notes: [escapeHtml(expiry)],
      footer: escapeHtml(footer),
    }),
  };
}
