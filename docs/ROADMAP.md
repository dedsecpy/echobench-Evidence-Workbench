# Milestones

## Completed in version 0.1

- Runnable repository with no installation dependencies.
- Deterministic synthetic transformations and a restricted diagnostic parser.
- Gold-free model inputs, inference graphs, family scoring and sensitivity analysis.
- Seven default grouping methods, optional imported semantic embeddings, three synthesis prompts.
- API caching, explicit call budgets, repetitions and resumable partial runs.
- Coverage/calibration/family metrics, event bootstrap and paired duplication effects.
- Source collection with snapshots, robots checks and error logs.
- Local annotation, reviewer histories, agreement, explicit adjudicator export.
- Event/exact-source split grouping and reproducible HTML/SVG artifacts.

## Next research milestones

1. **Pilot dataset:** select 30–50 diverse naturally occurring claims and have two people label claim-bearing passages and origins. The two-page Common Crawl example is only a technical smoke test.
2. **Claim-level attribution extraction:** automatically link quoted/attributed passages to observed references without assuming every hyperlink is a lineage edge. Preserve uncertainty and compare against human labels.
3. **Stronger provenance model:** combine multilingual paraphrase detection, unusual shared anchors, temporal constraints, publisher/author information and missing-origin inference. Evaluate against same-topic independent reporting.
4. **Calibration:** fit and freeze confidence on a held-out calibration subset. Propagate uncertainty about unresolved dependence instead of counting all graph components as confirmed independent.
5. **Adaptive retrieval:** implement an agent over a frozen corpus that seeks new observations and counterevidence. Track read/search/token budgets. Current follow-up queries are planned only.
6. **Real model evaluation:** run the pilot on local/open and API models, analyze failures and preregister the larger experiment. API configuration and actual model runtimes/credentials are required.
7. **Benchmark expansion:** curate 300–500 claims with source/event-disjoint splits, multilingual strata and independently observed controls.
8. **Publication package:** complete current related-work comparison, measured results, ablations, sample-size justification, artifacts and a conference-specific manuscript.

The immediate dependency for empirical publication results is access to actual model inference plus independent human adjudication of natural-source genealogy. These are external research inputs, not completed by the software tests.
