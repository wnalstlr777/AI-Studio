# QA rollout

## Implemented
- Independent AI-Studio Playwright configuration.
- Desktop Chrome and mobile emulation smoke checks for deployed Sea.
- Failure screenshots, traces, and HTML report.
- Manual GitHub Actions execution (once workflow is installed).

## Not yet implemented
- Deterministic Sea debug hooks to place camera/avatar/fry at known coordinates.
- Actual world-label proximity, occlusion, overlap and overview assertions.
- Automatic triggers on Sea commits or pull requests.
- Autonomous code-fixing agents.

A passing smoke test **does not** mean that world-space label behavior is verified.
Avoid enabling production-impacting automatic changes without approval.
