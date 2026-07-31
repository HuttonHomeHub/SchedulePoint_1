/**
 * The seeder's **typed REST client** (ADR-0066).
 *
 * It is an ordinary API client and gets no special path: it authenticates as a real user, carries the
 * session cookie, obeys RBAC, and holds the ADR-0028 pen for structural writes. That is deliberate —
 * if the seeder cannot create something as a Planner, a Planner cannot either, and that is a finding
 * rather than a reason to reach for a privileged back door.
 *
 * Deliberately dependency-free: `fetch` and a cookie jar, no HTTP library. The surface it needs is
 * small, and a seeder that pulls in a client stack to talk to its own API is harder to run against a
 * production host than one that does not.
 */

/** Anything the API returns in the standard `{ data }` / `{ error }` envelope. */
interface ApiEnvelope<T> {
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

/** A non-2xx response, carrying the API's own machine-readable code and message. */
export class SeedHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: unknown,
    readonly path: string,
  ) {
    // `details` carries the class-validator field messages, and WITHOUT them a 422 reads only as
    // "Validation failed." — which names no field and makes every finding unactionable. The first
    // real run produced 79 of those before this was added; the detail is the whole value.
    super(`${status} ${code} on ${path}: ${message}${formatDetails(details)}`);
    this.name = 'SeedHttpError';
  }
}

/** Render the API's `details` (usually a string[] of field messages) onto the error message. */
function formatDetails(details: unknown): string {
  if (Array.isArray(details)) return ` — ${details.map(String).join('; ')}`;
  if (typeof details === 'string') return ` — ${details}`;
  if (details !== null && typeof details === 'object') return ` — ${JSON.stringify(details)}`;
  return '';
}

export interface SeedClientOptions {
  /** Base URL of the running instance, e.g. `http://localhost:3000`. No trailing slash. */
  baseUrl: string;
  /** Sent as `Origin`; Better Auth and the CSRF check both read it. Defaults to `baseUrl`. */
  origin?: string;
  /**
   * How many requests may be in flight at once. Kept modest by default: the seeder is a well-behaved
   * client of a possibly-production instance, not a load generator. Raise it only against a machine
   * you own.
   */
  concurrency?: number;
  /** Called for every request once it settles — the hook the runner's progress output uses. */
  onRequest?: (info: { method: string; path: string; status: number; ms: number }) => void;
}

/**
 * The rate-limit back-off schedule, in ms. The API's global throttle is a **60-second window**, so a
 * schedule that gives up inside a minute cannot clear it — the first version summed to 16 s and lost
 * six requests on a burst of calendar exceptions. These sum past the window, and `Retry-After` (when
 * the server sends one) overrides them.
 */
const BACKOFF_MS = [1_000, 5_000, 15_000, 30_000, 61_000];

export class SeedClient {
  private readonly baseUrl: string;
  private readonly origin: string;
  private readonly cookies = new Map<string, string>();
  private readonly onRequest: SeedClientOptions['onRequest'];
  private readonly limit: number;
  private inFlight = 0;
  private readonly queue: Array<() => void> = [];

  constructor(options: SeedClientOptions) {
    this.baseUrl = stripTrailingSlashes(options.baseUrl);
    this.origin = options.origin ?? this.baseUrl;
    this.onRequest = options.onRequest;
    this.limit = options.concurrency ?? 6;
  }

  /**
   * Sign in as an existing user, or sign up if `signUpName` is given and the sign-in fails. A seed run
   * against a production host should always sign IN — creating a user as a side effect of seeding is
   * the kind of surprise this tool must not spring on an operator.
   */
  async authenticate(params: {
    email: string;
    password: string;
    signUpName?: string;
  }): Promise<void> {
    try {
      await this.raw('POST', '/api/auth/sign-in/email', {
        email: params.email,
        password: params.password,
      });
      return;
    } catch (error) {
      if (params.signUpName === undefined) throw error;
    }
    await this.raw('POST', '/api/auth/sign-up/email', {
      name: params.signUpName,
      email: params.email,
      password: params.password,
    });
  }

  /** GET a `{ data }` envelope. */
  get<T>(path: string): Promise<T> {
    return this.envelope<T>('GET', path);
  }

  /** POST a body and unwrap `{ data }`. */
  post<T>(path: string, body?: unknown): Promise<T> {
    return this.envelope<T>('POST', path, body);
  }

  /** PATCH a body and unwrap `{ data }`. */
  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.envelope<T>('PATCH', path, body);
  }

  /** PUT a body and unwrap `{ data }`. */
  put<T>(path: string, body?: unknown): Promise<T> {
    return this.envelope<T>('PUT', path, body);
  }

  /** DELETE; the API's deletes return `204`, so there is nothing to unwrap. */
  async del(path: string): Promise<void> {
    await this.raw('DELETE', path);
  }

  /** Run `tasks` with at most `concurrency` in flight, preserving result order. */
  async all<T>(tasks: ReadonlyArray<() => Promise<T>>): Promise<T[]> {
    return Promise.all(tasks.map((task) => this.withSlot(task)));
  }

  private async withSlot<T>(task: () => Promise<T>): Promise<T> {
    if (this.inFlight >= this.limit) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.inFlight += 1;
    try {
      return await task();
    } finally {
      this.inFlight -= 1;
      this.queue.shift()?.();
    }
  }

  private async envelope<T>(method: string, path: string, body?: unknown): Promise<T> {
    const parsed = (await this.raw(method, path, body)) as ApiEnvelope<T>;
    if (parsed.data === undefined) {
      throw new SeedHttpError(200, 'MALFORMED_ENVELOPE', 'response had no `data`', parsed, path);
    }
    return parsed.data;
  }

  /**
   * One request, with rate-limit back-off. A 429 is retried on the {@link BACKOFF_MS} schedule; every
   * other non-2xx throws immediately, because a seeder that retries a 422 is a seeder that turns a
   * clear rejection into a slow one.
   */
  private async raw(method: string, path: string, body?: unknown): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      const started = Date.now();
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: {
          Origin: this.origin,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(this.cookies.size > 0 ? { Cookie: this.cookieHeader() } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        redirect: 'manual',
      });
      this.absorbCookies(response);
      this.onRequest?.({ method, path, status: response.status, ms: Date.now() - started });

      const text = await response.text();
      const parsed: unknown = text.length > 0 ? safeJson(text) : undefined;

      if (response.ok) return parsed;

      if (response.status === 429 && attempt < BACKOFF_MS.length) {
        const retryAfter = Number(response.headers.get('Retry-After'));
        await sleep(
          Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : BACKOFF_MS[attempt]!,
        );
        continue;
      }

      const envelope = parsed as ApiEnvelope<never> | undefined;
      throw new SeedHttpError(
        response.status,
        envelope?.error?.code ?? 'UNKNOWN',
        envelope?.error?.message ?? text.slice(0, 200),
        envelope?.error?.details,
        path,
      );
    }
  }

  /**
   * Keep the session cookie across requests. `fetch` has no cookie jar, so this is hand-rolled — and
   * it must be, because the seeder's whole premise is that it authenticates like any other client.
   */
  private absorbCookies(response: Response): void {
    const raw = response.headers.getSetCookie?.() ?? [];
    for (const cookie of raw) {
      const [pair] = cookie.split(';');
      const index = pair?.indexOf('=') ?? -1;
      if (pair === undefined || index <= 0) continue;
      this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
  }

  private cookieHeader(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
}

/**
 * Trim trailing `/` so `baseUrl` and a leading-slash path concatenate cleanly.
 *
 * Deliberately not `replace(/\/+$/, '')`. That regex backtracks quadratically on a long run of
 * slashes *before* a non-slash character — measured at 166/642/2,520 ms for 20k/40k/80k slashes,
 * the 4×-per-doubling signature — which CodeQL flagged as `js/polynomial-redos`. The finding stands
 * even though the input here is an operator's own `--url` rather than a remote one: a scan cannot
 * see that distinction, and neither can the next caller who reuses this client with an input that
 * *is* remote. A backward walk is O(n), needs no engine, and reads more plainly than the pattern it
 * replaces.
 */
export function stripTrailingSlashes(url: string): string {
  let end = url.length;
  while (end > 0 && url.charCodeAt(end - 1) === SLASH) end -= 1;
  return url.slice(0, end);
}

const SLASH = '/'.charCodeAt(0);

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
