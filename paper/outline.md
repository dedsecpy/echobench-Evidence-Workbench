# Ten Citations, One Witness: Measuring Source Dependence in Research Agents

**Manuscript outline. No actual model results have been measured. Replace all placeholders only with reproducible observations.**

## Abstract

Research agents synthesize web evidence, but multiple documents may derive from one informational origin. We investigate whether repeated reporting changes agent conclusions and confidence without adding independent observations. We introduce [dataset size and domains after adjudication], origin-family annotations with unresolved relationships, and controlled duplication interventions. We evaluate [actual model IDs] against [actual baselines] and propose [final validated method]. Results show [measured effect sizes and uncertainty]. We release [reviewed artifacts].

Do not substitute the synthetic demo's score arithmetic for a measured agent result.

## 1. Introduction

Motivate one fully inspected natural false-corroboration example. Distinguish truth, passage support, visible citation and informational independence. State falsifiable questions and contributions. Qualify novelty against prior work on correlated sources, truth discovery and citation audits.

## 2. Problem definition

Define atomic claim, observation, reporting document, derivative relation and uncertain genealogy. Model origin dependence at the claim-bearing passage level. Describe why common conclusions and textual similarity do not imply copying. Separate single-observation repetition from independent replications and shared biases.

## 3. EchoBench

Describe collection window, domains/languages, scope, source permissions, annotator expertise, codebook, independent review, adjudication, and uncertainty labels. Present natural cases separately from generated interventions. Define event/source splits and transformation validity checks. Quantify inter-annotator agreement and unresolved cases.

## 4. EchoGuard

Explain the final provenance inference model and its uncertainty. Describe evidence aggregation, contradiction handling, confidence calibration, and active search policy. The current software baseline groups observed attributions and overlapping text, and uses an uncalibrated logistic score; extending it is a research milestone, not a completed contribution.

## 5. Experimental design

Give precise corpus, model IDs, prompts, configuration hashes, repetitions, budgets and comparator implementations. Specify calibration/validation/test boundaries. Include learned and simple baselines, oracle genealogy as a separately labelled upper-bound condition, and no-links/no-text ablations.

## 6. Results — placeholders

- Main paired copy-count confidence effect with event-cluster intervals.
- False acceptance conditional on repetition, with denominators and matched coverage.
- Family inference precision/recall/F1/ARI, including unknown-label exclusions.
- True independent-observation controls and same-topic false-merging tests.
- Natural versus generated, domain/language and missing-origin strata.
- Calibration, selective risk, citation auditing and total inference cost.
- Failure cases and significance of negative findings.

## 7. Limitations

Unobservable origins, unavailable sources, mixed-origin documents, fallible timestamps, shared quoted observations, imperfect human labels, content access and redistribution restrictions, collection selection bias, model changes and calibration drift. Report abstention tradeoffs and failed hypotheses.

## 8. Conclusion

State only conclusions supported by the actual held-out experiments.

## Appendices and release

Annotation instructions, disagreement examples, prompts, source schemas, split rules, transformation templates, leakage audit, statistical plan, model requests/usage, dataset card, code/data licenses, reproducibility instructions, and complete failure counts.
