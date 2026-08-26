# Adaptive Learning Engine external API — retired

The historical cross-project Adaptive Learning Engine gateway is retired. It
was created for an abandoned external AI-coder experiment and is not Lumina's
primary model API.

The tracked `ale-api` edge function is now a fail-closed tombstone: every
non-preflight request returns `410 Gone` and cannot inspect a credential, query
legacy key state, provision a learner, mint a session, or forward to an
adaptive-learning function.

Internal Lumina adaptive-learning and psychometric functions remain available
through their ordinary authenticated application paths. The separate Lumina
API gateway and its credential records are outside this retirement scope.

Database retirement is performed by
`20260826000000_retire_legacy_ale_external_api.sql`. The migration deactivates
all legacy ALE key rows if the historical table exists and safely records a
table-absent outcome otherwise. It never creates the obsolete table.

Repository state alone does not prove deployment. SEC-003 remains open until an
authorized Lovable deployment supplies non-secret resulting-state evidence for
the exact release candidate and that evidence passes the SEC-003 retirement
evaluator.
