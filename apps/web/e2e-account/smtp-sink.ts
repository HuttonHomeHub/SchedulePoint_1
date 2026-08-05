import { createServer, type Server, type Socket } from 'node:net';

/**
 * A throwaway SMTP server that captures what the API actually sends (ADR-0074 M5-T3).
 *
 * **This exists because there is no other way to get the reset link.** The invitation flow returns
 * its accept URL in the create response, so a journey can read it off the screen; a password-reset
 * token goes to the mailbox and **nowhere else**, and since M0 the verification row stores the
 * identifier **hashed**, so it cannot be recovered from the database either. That is B1 working as
 * designed — and it means an end-to-end reset is only testable by receiving the mail.
 *
 * It also makes this the **only** thing in the repo that exercises `SmtpMailService` against a real
 * socket. Everything else runs on the logging fallback, so a defect in the real transport — a
 * malformed address, an exception swallowed by the adapter's deliberate catch — would ship unseen.
 *
 * Deliberately minimal and deliberately not a dependency: enough of RFC 5321 for nodemailer's
 * happy path (EHLO, MAIL, RCPT, DATA, QUIT), no TLS advertised so the client never tries to
 * upgrade, no AUTH because the URL carries no credentials. Anything more would be a mail server.
 */
export interface CapturedMail {
  readonly to: string;
  readonly body: string;
}

export class SmtpSink {
  private readonly messages: CapturedMail[] = [];
  private server: Server | undefined;

  /** Start listening. Resolves with the port, which goes into `MAIL_SMTP_URL`. */
  start(port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer((socket) => {
        this.handle(socket);
      });
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        this.server = server;
        resolve(port);
      });
    });
  }

  async stop(): Promise<void> {
    const server = this.server;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    this.server = undefined;
  }

  /** Every message received so far, oldest first. */
  all(): readonly CapturedMail[] {
    return this.messages;
  }

  /** Drop what has been received. Call between phases so "the latest mail" is unambiguous. */
  clear(): void {
    this.messages.length = 0;
  }

  /**
   * Wait for a message to a given address whose body matches, then return it.
   *
   * Polls rather than takes a callback because the send is fire-and-forget from the API's point of
   * view: the HTTP response returns before the SMTP conversation finishes, so a journey that
   * asserted immediately after the click would race it.
   */
  async waitFor(
    to: string,
    /** Matched against the **decoded** body, so a URL folded across lines still matches. */
    matching: RegExp,
    { timeoutMs = 15_000 }: { timeoutMs?: number } = {},
  ): Promise<CapturedMail> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const hit = this.messages.find(
        (m) => m.to.includes(to) && matching.test(decodeQuotedPrintable(m.body)),
      );
      if (hit) return hit;
      if (Date.now() > deadline) {
        throw new Error(
          `No mail to ${to} matching ${matching.source} within ${timeoutMs}ms. ` +
            `Received ${this.messages.length}: ${this.messages.map((m) => m.to).join(', ')}`,
        );
      }
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  private handle(socket: Socket): void {
    let buffer = '';
    let inData = false;
    let data = '';
    let recipient = '';

    socket.write('220 localhost SchedulePoint test sink\r\n');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');

      for (;;) {
        if (inData) {
          // The DATA payload ends at a bare dot on its own line. Everything before it is the
          // message, dot-unstuffed only insofar as this sink needs (it never sends one).
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          data += buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          this.messages.push({ to: recipient, body: data });
          data = '';
          socket.write('250 2.0.0 Ok: queued\r\n');
          continue;
        }

        const lineEnd = buffer.indexOf('\r\n');
        if (lineEnd === -1) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        const verb = line.slice(0, 4).toUpperCase();

        if (verb === 'EHLO' || verb === 'HELO') {
          // No STARTTLS and no AUTH advertised — the client then never attempts either, which is
          // what keeps this under a hundred lines.
          socket.write('250-localhost\r\n250 8BITMIME\r\n');
        } else if (verb === 'MAIL') {
          socket.write('250 2.1.0 Ok\r\n');
        } else if (verb === 'RCPT') {
          recipient = /<([^>]*)>/.exec(line)?.[1] ?? line;
          socket.write('250 2.1.5 Ok\r\n');
        } else if (verb === 'DATA') {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (verb === 'QUIT') {
          socket.write('221 2.0.0 Bye\r\n');
          socket.end();
          return;
        } else if (verb === 'RSET' || verb === 'NOOP') {
          socket.write('250 2.0.0 Ok\r\n');
        } else {
          socket.write('502 5.5.1 Not implemented\r\n');
        }
      }
    });

    socket.on('error', () => {
      // A client hanging up mid-conversation is not a test failure; the assertion is on what
      // arrived, and a thrown socket error here would fail the run for the wrong reason.
    });
  }
}

/**
 * Pull the first `http(s)://…` URL out of a captured plain-text body.
 *
 * The mail templates are plain text (see `smtp-mail.service.ts`), so this is a scan rather than a
 * parse — and it deliberately does not know which link it is looking for, so the caller asserts
 * that separately and a template that emitted the wrong URL would fail there rather than here.
 */
export function firstUrlIn(body: string): string {
  const match = /https?:\/\/[^\s<>"]+/.exec(decodeQuotedPrintable(body));
  if (!match) throw new Error(`No URL found in message body:\n${body}`);
  // Trailing punctuation from a sentence is not part of the link.
  return match[0].replace(/[.,;)]+$/, '');
}

/**
 * Undo `Content-Transfer-Encoding: quoted-printable`.
 *
 * **Not optional, and the first real run proved it.** The templates contain an em dash, so
 * nodemailer picks quoted-printable over 7-bit — which encodes `=` as `=3D` and wraps lines past
 * 76 characters with a trailing `=`. A JWT in a URL hits both: the raw capture was
 * `…verify-email?token=3DeyJhbGciOiJIUzI1NiJ9.=`, i.e. an encoded `=` and a link truncated at the
 * fold. Reading the body without decoding it does not fail loudly; it yields a URL that looks
 * plausible and does not work.
 */
function decodeQuotedPrintable(body: string): string {
  return body
    .replace(/=\r?\n/g, '')
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}
