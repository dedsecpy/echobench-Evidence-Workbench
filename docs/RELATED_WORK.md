# Related work and novelty audit

The initial conversation's novelty assessment was preliminary. Do not describe EchoBench as the first benchmark or claim a new failure mode until a current systematic comparison establishes that boundary. Source dependence and circular reporting are longstanding problems; the candidate contribution is their controlled measurement and mitigation in research agents.

| Work | Relevant contribution | Candidate difference to investigate |
| --- | --- | --- |
| [DeepResearch Bench](https://arxiv.org/abs/2506.11763) | Research-report and citation evaluation | Whether an explicit gold genealogy, unknown independence, and duplication interventions are included |
| [BrowseComp-Plus](https://arxiv.org/abs/2508.06600) | Fixed-corpus reproducible deep-research evaluation | Source-family interventions and natural derivative origins rather than answer retrieval alone |
| [DeepTRACE](https://arxiv.org/abs/2509.04499) | Statement-level source and citation audit | Causal copy-count sensitivity and origin-family labelling |
| [FIRE](https://aclanthology.org/2025.findings-naacl.158/) | Iterative evidence retrieval and verification | Independence-aware retrieval/verification under controlled evidence repetition |
| [CLAIM-BENCH](https://aclanthology.org/2025.ijcnlp-long.127/) | Scientific claim–evidence extraction and validation | Dependence across multiple source documents |
| [CiteShade](https://arxiv.org/abs/2609.15660) | Adversarial misattribution and counterfactual defense | Naturally occurring false corroboration and informational ancestry; assess overlap carefully |

Read full papers and code, not just abstracts, before claiming any of the differences above. These are audit questions, not established absences. Search existing literature on multi-source truth discovery, source copying/dependence, Bayesian evidence aggregation, news syndication detection, document genealogy, fact-checking, misinformation laundering, semantic provenance, and correlated uncertainty. Include 2026 work and preprints shortly before submission.

Recommended novelty table for the paper: source-family ground truth; unresolved lineage; natural and synthetic examples; translations; missing originals; cycles; mixed-origin reporting; controlled copy-count experiments; calibrated output confidence; adaptive corroboration retrieval; matched-budget baselines. Mark a feature only when a paper explicitly implements it.

The prototype by itself supplies established engineering components—union-find, text overlap, evidence aggregation and bootstrap evaluation. A strong methods paper needs a validated methodological contribution beyond that combination. A datasets paper needs well-curated natural data, reliable labels, useful diagnostic tasks, and measured insights that existing benchmarks cannot supply.
