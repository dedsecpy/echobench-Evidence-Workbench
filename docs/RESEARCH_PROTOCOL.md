# Research protocol — draft to preregister

This document proposes experiments; it is not a preregistration and contains no measured model-performance claims. Freeze and timestamp the finalized protocol before testing the held-out set.

## Questions and hypotheses

**H1: duplication sensitivity.** Holding underlying observations constant, additional derivative reports increase some agents' probability assigned to the repeated claim.

**H2: lineage intervention.** Grouping derivatives by informational origin reduces this duplication sensitivity while maintaining useful answer coverage on independent-evidence controls.

**H3: evidence diversity.** An explicit instruction to use diverse sources is less robust to hidden common origins than a method with an inferred genealogy.

**H4: limits.** Attribution removal, multilingual rewriting, and mixed-origin reporting degrade lineage inference. We expect failures and will report them by condition.

These hypotheses may fail. No accuracy improvement, FCR reduction, or novelty claim is assumed.

## Dataset

Begin with 30–50 manually reviewed pilot claims to validate the codebook. Expand toward 300–500 claims from several domains, languages, publishers and event types. Keep a clean independent-evidence control group, single-origin groups, and uncertain origin groups. Do not limit the set to cases selected because one particular model already failed.

Natural data should include inspected primary observations and derivative reporting with documented provenance. Controlled transformations should preserve the underlying informational evidence while changing copy count, wording or language. Include naturally occurring multilingual examples separately from generated translations. Validate transformations with humans and retain original/transformed linkage. All siblings of a claim belong to one evaluation group.

Aim for about 6–12 documents per natural claim. Separate claim truth, passage entailment and origin-family ground truth. Keep unresolved truth and lineage rather than coercing labels. Use two independent human annotators and adjudication, with disagreements and reliability diagnostics reported. Release URLs, hashes, permitted excerpts and annotations; redistribution rights for full text are separate from public accessibility.

## Splits and contamination

Use event-disjoint train/validation/test partitions. Link all variants and exact-source overlap before splitting. Audit near duplicates, shared upstream reports and common studies across partitions. Document the collection window and source publication times. Claims dated after a model's training cutoff do not alone guarantee no contamination; corpus memorization and exposure to related events remain possible.

Freeze lexical/semantic thresholds, confidence calibration, prompts and extraction policies on validation. Do not adapt them to the held-out test. Record hashes for splits and configurations, plus exact model IDs/endpoints, timestamps, prompt versions, token usage and refusals.

## Comparison methods

Grouping baselines: raw document counts; hostname grouping; exact passage deduplication; lexical clustering; multilingual embedding similarity; EchoGuard; no-links and no-text ablations. Embedding similarity alone should be challenged with independent articles on the same topic.

Agent baselines: fixed-corpus synthesis; the same agent with source-diversity prompting; EchoGuard synthesis. Add an iterative verifier/research agent as a further baseline before a main conference claim. Evaluate at least two open and two proprietary model families using the same controlled corpus. Freeze retrieval and document-reader behavior.

Budget comparison must include all assessment/inference requests required by a standalone method. The v0.1 harness shares document assessments across methods for diagnostic comparison. Its per-call logs are available, but report normalized standalone costs: a raw synthesis request and an EchoGuard assessment+synthesis pair have different budgets. Compare both equal-budget and best-performance settings before claiming efficiency.

## Outcomes

Primary diagnostic: paired change in probability assigned to the claim between one-origin and repeated-origin conditions. Report false-claim and true-claim changes separately. For independent-observation controls, increasing confidence may be appropriate and should not be mechanically suppressed.

Secondary outcomes:

- High-confidence false acceptance, with numerator and denominator.
- Conditional false acceptance on claims with repeated gold origins, explicitly labelled a **false-corroboration proxy**.
- Pairwise family precision, recall, F1 and adjusted Rand index, excluding unknown pairs.
- Known-truth accuracy, answer coverage, and selective accuracy/risk.
- Brier score, reliability diagram and expected calibration error.
- Citation support/contradiction relation, evidence coverage and human citation-faithfulness audits.
- Tokens, wall time, document reads, retrieval calls and failures.

The proxy alone does not establish that duplication caused the wrong answer. Use the paired intervention for that attribution. Family deletion is a sensitivity analysis, not a proof of factual truth or a complete causal explanation of a model's internal reasoning.

## Statistical analysis

Resample at the event level so variants and repetitions remain together. Use paired differences between methods at matched events, and report confidence intervals and effect sizes. Repeated model calls capture output variability; they do not increase the number of independent real-world claims. Analyze domain/language strata and annotate the number of independent events in each.

Predeclare the main comparison and correction for multiple secondary comparisons. Estimate sample size after the pilot using event-level variance and a minimum useful effect, rather than selecting a convenient target only. Inspect abstention alongside error reduction: an agent that abstains on everything is not an adequate success result.

For confidence calibration, train temperature/logistic/isotonic calibration on validation or a dedicated calibration subset. Gold truths can supervise calibration there; they must not enter test inference. The current heuristic score is explicitly **uncalibrated**. Standard ECE is sensitive to bin choice and does not replace proper scoring rules.

## Failure criteria

Reconsider the proposed method if raw/diversity agents are already invariant, inferred genealogy performs no better than exact deduplication, improvements vanish at comparable coverage/budget, the graph merges independent reporting frequently, or human origin labels remain too unreliable. Negative findings should be preserved.

## Required before paper submission

Complete the novelty audit; publish a codebook and data provenance statement; provide human-validated natural data; run actual models; include learned provenance or a substantially stronger method if targeting a methods track; implement controlled adaptive retrieval for claims about research agents; calibrate confidence; audit citations and failures; and release a reproducibility package. The current synthetic numbers cannot substitute for those experiments.
