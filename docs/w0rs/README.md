# W0-RS-1 evidence harness

This directory records repository-derived evidence for the clean rebaseline decision. It does not define or apply the Phase B baseline.

## Commands

```sh
npm run w0rs:inventory
npm run w0rs:inventory:check
npm run w0rs:reproduce
npm run w0rs:reproduce:check
npm run w0rs:tests -- --list
npm run w0rs:tests -- --group node-offline
```

The scripts use only Node built-ins. The TypeScript loader exists solely to resolve the repository's extensionless relative imports while running the current self-executing harnesses; it does not transpile application builds.

## Evidence boundaries

- `repository-truth-map.json` inventories ordered migrations, schema-definition events, callers, environment-variable names, and project-coupling locations. Secret values are never recorded.
- `privileged-objects.json` records privileged function/policy/grant evidence and duplicate definitions.
- `authority-paths.json` distinguishes Super Admin, generic admin, and School Admin authority for the four reviewed entry paths.
- `service-role-boundaries.json` records static authentication and caller signals. A missing signal is not proof of vulnerability, and a missing first-party caller is not proof that an endpoint is unused.
- `baseline-classification.json` contains Phase A recommendations only. It does not authorize migration edits, generic-admin retirement, or object exclusion.
- `test-manifest.json` separates fixed assertion counts, dynamic audits, and live benchmarks.
- `migration-failure-reproduction.json` deterministically proves the ordered SQL dependency failure. It is not a substitute for the Phase B Docker/Supabase database replay.

`api_keys` and `api_call_logs` are conservatively classified as **retain pending decision**. Their lack of an obvious first-party caller is evidence, not sufficient authority to remove them.

## Safety boundary

W0-RS-1 does not archive or rewrite migrations, create the canonical baseline, change authority, link a Supabase project, access credentials, or modify external state.
