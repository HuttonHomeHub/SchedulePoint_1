// Builds the measurement fixture's skeleton over the public REST API (ADR-0066): a user, an organisation,
// one client and N empty projects (one per scale plan), or — with --baselines — two baselines on each
// plan id given.
//
//   node fixture.mjs <baseUrl> projects <orgName> <email> <count>   → prints {"projects":[ids]}
//   node fixture.mjs <baseUrl> baselines <orgSlug> <email> <planId>…
//
// The plans themselves are seeded by `schedulepoint-seed --tier scale --activities 2000` (see
// m2-measurements.md), one per project, because that is the documented way to make a scale plan.
const [base, mode, ...rest] = process.argv.slice(2);
const origin = 'http://localhost:5173';
const PASSWORD = 'correct-horse-battery';
let cookie = '';

async function call(method, path, body) {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin, cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie();
  if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

if (mode === 'projects') {
  const [orgName, email, countArg] = rest;
  const slug = orgName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  await call('POST', '/api/auth/sign-up/email', {
    name: email.split('@')[0],
    email,
    password: PASSWORD,
  });
  await call('POST', '/api/v1/organizations', { name: orgName });
  const client = (
    await call('POST', `/api/v1/organizations/${slug}/clients`, { name: 'Scale client' })
  ).data;
  const projects = [];
  for (let i = 0; i < Number(countArg); i += 1) {
    const project = (
      await call('POST', `/api/v1/organizations/${slug}/clients/${client.id}/projects`, {
        name: `Scale project ${i + 1}`,
      })
    ).data;
    projects.push(project.id);
  }
  console.log(JSON.stringify({ projects }));
} else if (mode === 'baselines') {
  const [slug, email, ...planIds] = rest;
  await call('POST', '/api/auth/sign-in/email', { email, password: PASSWORD });
  for (const planId of planIds) {
    for (const name of ['Baseline A', 'Baseline B']) {
      const started = performance.now();
      await call('POST', `/api/v1/organizations/${slug}/plans/${planId}/baselines`, { name });
      console.log(planId, name, `${Math.round(performance.now() - started)} ms`);
    }
  }
} else {
  throw new Error('mode must be "projects" or "baselines"');
}
