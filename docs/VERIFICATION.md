# Version 0.1 verification

Environment: Windows, Node.js v22.20.0. No npm dependencies were installed.

The automated suite passes 40 tests. JavaScript syntax checks pass across source modules, workbench scripts, utility scripts and tests. Coverage here means exercised workflows, not a measured code-coverage percentage.

Checked workflows include:

- CLI generation, default seed, schema validation, evaluation, protected outputs and splits.
- Gold-label isolation and scenario masking in model requests.
- Exact-copy grouping, translated attribution, missing ancestors, circular attribution and date conflicts.
- Order invariance, independent-measurement controls, deliberate hidden-rewrite failure and ablations.
- Family votes, conflicting evidence, deletion sensitivity, calibration metrics and clustered bootstrap.
- End-to-end HTML/SVG report artifacts and completion markers.
- Reviewer histories, revision conflicts, explicit gold export and descriptive agreement.
- Loopback workbench routes, hidden gold, save operations, origin checks and invalid paths.
- Mock model response validation, caching, repetition identity, request budgets and endpoint configuration.
- Network target validation, robots policy, extraction, redirects, snapshots and error records.

A live collector smoke test retrieved two public Common Crawl documentation pages successfully. Its one claim remains unannotated. The offline demo generated 288 synthetic cases and 2,016 predictions. Neither is a real-model publication result.

Model requests have been tested using mocked responses. No paid model calls or local model inference have run. No browser was connected for rendered visual QA; HTTP/API integration checks passed. The workbench must still receive a visual interaction review when a browser is available.

Reproduce checks from the project folder:

```powershell
rtk proxy node scripts/check.js
rtk proxy node --test --test-reporter=spec
```
