import { describe, expect, it } from 'vitest';

import {
  escapeHtml,
  renderEmailVerification,
  renderInvitation,
  renderPasswordReset,
} from './mail-templates';

const HOSTILE = `Hutton & Sons <script>alert("x")</script> 'Ltd'`;

const invitation = {
  to: 'invitee@example.com',
  organizationName: HOSTILE,
  role: 'PLANNER',
  acceptUrl: 'https://app.example.com/invitations/accept?a=1&b=2#tok_secret',
  expiresAt: new Date('2026-09-01T00:00:00Z'),
};
const verification = { to: 'a@example.com', verifyUrl: 'https://app.example.com/verify?t=1&x="2"' };
const reset = { to: 'a@example.com', resetUrl: 'https://app.example.com/reset/tok_reset_secret' };

const mark = 'https://app.example.com/brand/mark-email.png';

describe('escapeHtml', () => {
  it('escapes the five characters that matter in text and attributes', () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;');
  });
});

describe('mail templates', () => {
  const cases = [
    ['invitation', renderInvitation(invitation), invitation.acceptUrl],
    ['verification', renderEmailVerification(verification), verification.verifyUrl],
    ['password reset', renderPasswordReset(reset), reset.resetUrl],
  ] as const;

  it.each(cases)(
    '%s carries text and html, with the link as href and visible text',
    (_n, mail, url) => {
      expect(mail.subject.length).toBeGreaterThan(0);
      expect(mail.text).toContain(url);
      const escaped = escapeHtml(url);
      expect(mail.html).toContain(`href="${escaped}"`);
      expect(mail.html).toContain(`>${escaped}</a>`);
      expect(mail.html).toContain('<html lang="en">');
      expect(mail.html).toContain('<title>');
    },
  );

  it.each(cases)('%s names the mark on the link’s own origin, absolute', (_n, mail) => {
    expect(mail.html).toContain(`src="${mark}"`);
  });

  it('escapes a hostile organisation name everywhere in the html and never emits a script', () => {
    const mail = renderInvitation(invitation);
    expect(mail.html).not.toContain('<script');
    expect(mail.html).toContain(escapeHtml(HOSTILE));
    // The text part is not HTML, so it keeps the name as typed.
    expect(mail.text).toContain(HOSTILE);
  });

  it('names the role as the app does, with the right article, and dates in words', () => {
    const mail = renderInvitation(invitation);
    for (const part of [mail.text, mail.html]) {
      expect(part).toContain('as a Planner.');
      expect(part).not.toContain('PLANNER');
      expect(part).toContain('expires on 1 September 2026.');
    }
    expect(renderInvitation({ ...invitation, role: 'ORG_ADMIN' }).text).toContain(
      'as an Org Admin.',
    );
  });

  it('keeps the expiry wording to an hour, with no "about"', () => {
    expect(renderPasswordReset(reset).text).toContain(
      'This link works once and expires in an hour.',
    );
    expect(renderEmailVerification(verification).text).toContain('The link works for an hour.');
    for (const [, mail] of cases) expect(mail.text).not.toContain('about an hour');
  });

  it('says the password is unchanged on a reset', () => {
    expect(renderPasswordReset(reset).html).toContain('has not been changed');
  });
});
