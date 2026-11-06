# Sea — project configuration

- Repository: `wnalstlr777/Sea`
- Engine: Three.js, browser-based game
- First QA target: aquaculture pens and fry school labels
- Relevant files: `src/aquaculture.js`, `src/aquaculture-visuals.js`, `src/style.css`
- Applicable rules: `rules/world-ui.md`

## First automated QA milestone
Use Playwright in GitHub Actions to launch the Sea web app, test desktop/mobile viewports, and collect screenshots. Introduce deterministic debug/test hooks for proximity, occlusion, and overview scenarios before asserting these behaviors. Do not mark scenarios as passed until they are actually exercised.

## Current status
Rulebook initialized. Automated browser checks are not yet installed or running.
