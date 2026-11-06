# AI-Studio — Agent Operating Rules

This repository is the shared development rulebook for Sea, HINA SURVIVAL, and future projects.

## Roles
- **Coordinator**: classify requests, identify applicable rules, define scope, report outcomes.
- **Developer**: make focused code changes in the target project; do not perform unrelated refactors.
- **QA**: independently verify affected behaviors, including regression cases; report evidence and limitations.

These are roles, not claims that autonomous agents are already running.

## Mandatory workflow
1. Identify project, engine, and affected feature.
2. Read relevant files under `rules/` and `projects/`.
3. Apply the smallest safe change.
4. Run the relevant checks and record pass/fail/not-tested.
5. Report commit IDs and distinguish code inspection from actual browser verification.
6. When a defect repeats, propose a reusable regression test and update the rulebook.

## Guardrails
- Never claim a visual test passed without actually executing it.
- Never commit secrets or credentials. Use GitHub Actions secrets where needed.
- Limit automated retry loops and avoid expensive full-project audits for small changes.
- Do not merge or deploy unreviewed changes to production unless explicitly authorized.
