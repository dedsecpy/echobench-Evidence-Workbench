# EchoBench / EchoGuard

A research prototype for measuring how repeated web evidence changes an agent's conclusions and confidence. EchoBench records evidence genealogy; EchoGuard groups likely derivatives before synthesizing a claim assessment.

**Working version 0.1:** offline experiment, seven grouping methods, six controlled scenarios, model API adapter, public-source collector, local annotation workbench, annotation agreement/export, grouped dataset splits, trace logs, bootstrap intervals, and HTML/SVG reports. No dependencies need installing. Node.js 22+ is required.

This repository is a foundation for a conference project. The synthetic demo tests the machinery; it is not evidence of performance on real agents. The source-family detector and numeric aggregation are conservative research baselines, not a trained or calibrated method. Novelty and publication suitability remain hypotheses requiring a full related-work review and real experiments.

## Open the project

On this machine, the repository is at `C:\Users\Aejaz\echobench`. From a PowerShell terminal in that folder:

```powershell
rtk proxy node --test
rtk proxy node scripts/check.js
rtk proxy node src/cli.js demo
rtk proxy node src/cli.js serve
```

The demo creates `outputs/demo/report.html` and a JSONL dataset. The workbench opens at **http://127.0.0.1:4317/**. The first demo has already been generated; rerunning `demo` requires a new output directory, such as `--output outputs/demo-2`. Completed runs are protected against accidental replacement.

## What the demo measures

The generator creates 12 fictional events, each with six scenarios and supporting-document counts 1, 3, 5, and 10: **288 cases**. Each case also contains two conflicting independent readings. Methods are raw counting, hostname grouping, exact-text grouping, lexical grouping, EchoGuard, and two ablations. The resulting run contains **2,016 predictions**.

Scenarios:

| Scenario | Observation available to detector | Purpose |
| --- | --- | --- |
| `exact` | Identical text on different domains | Copy-count invariance |
| `paraphrase` | Rewritten text with an explicit upstream attribution | Attributed derivation |
| `translation` | Spanish/French text with explicit upstream attribution | Cross-language provenance; not semantic translation detection |
| `circular` | Attribution cycle and contradictory publication ordering | Cycle and temporal diagnostics |
| `independent` | Different stated measurement procedures | Control against merging by topic alone |
| `hidden_paraphrase` | Rewrites without disclosed upstream source | Known failure case |

The fixture parser reads numbers from fictional text to classify passage support. It is restricted to the bundled generator and cannot process real claims. Truth is counterbalanced while sources disagree; source majority is deliberately insufficient to infer truth. Consequently, demo accuracy is not a meaningful claim of fact-checking ability. The primary useful diagnostic is change in score between the one-source and ten-source conditions for the same event.

## Research workflow

1. **Collect permitted public sources.** Supply explicit claim IDs, event IDs and URLs in a manifest. Collection is bounded, checks robots.txt, rate-limits requests, preserves hashes and snapshots, follows checked redirects, and records errors. It supports UTF-8 HTML/plain text, not PDFs or browser-rendered pages. It does not discover claim sets automatically.
2. **Review passages and provenance.** Clean extraction noise and find the original observation. URL links alone are not evidence of dependence. The basic collector deliberately leaves claim-specific attributions empty for review.
3. **Have two people annotate independently.** Assign passage relation, evidence quote, origin relation, parent document and family ID. Use `unknown:<documentId>` for unresolved lineage. Record an inspectable truth rationale for known truth.
4. **Measure agreement and adjudicate.** Reviewer histories are retained separately. Choose an adjudicator explicitly when exporting gold labels. No automatic majority vote creates ground truth.
5. **Split by event and shared source.** Event variants, common URLs and exact text remain together. Audit missing/near-duplicate source overlap separately. Freeze thresholds on validation before running test.
6. **Run assessments and experiments.** Use the API adapter or imported per-document assessments. Keep gold labels out of model inputs. Run baseline agents and EchoGuard under the same corpus and comparable read/token budgets.
7. **Audit results and write the paper.** Inspect trace graphs and model requests, score coverage as well as errors, and report unknown lineage and failed detection. See [research protocol](docs/RESEARCH_PROTOCOL.md).

### Collect and annotate

```powershell
rtk proxy node src/cli.js collect --manifest data/manifest.example.json --output data/collected
rtk proxy node src/cli.js serve --dataset data/collected/cases.jsonl --annotations annotations/pilot
rtk proxy node src/cli.js agreement --dataset data/collected/cases.jsonl --annotations annotations/pilot --annotators reviewer-1,reviewer-2
rtk proxy node src/cli.js export --dataset data/collected/cases.jsonl --annotations annotations/pilot --annotator adjudicator --output data/annotated.jsonl
rtk proxy node src/cli.js split --dataset data/annotated.jsonl --output data/splits
```

A real collection smoke test is available locally at `data/pilot-public/cases.jsonl`: two Common Crawl documentation pages, one unannotated claim, and snapshot hashes. This is a collector check, not a representative benchmark. A separate blocked sandbox attempt is retained at `data/pilot/errors.jsonl` for diagnosis.

### Model experiments

Create a local `.env` using `.env.example` as a reference. Set `ECHOBENCH_MODEL` to a model available on your endpoint, and `ECHOBENCH_API_KEY` when required. Credentials never enter run files. API request/response caches do contain the evidence text; keep them private if your data requires it.

```powershell
rtk proxy node --env-file=.env src/cli.js evaluate --dataset data/annotated.jsonl --provider model --limit 3 --max-calls 12 --output outputs/pilot-model
```

The default model experiment uses `agent-raw`, `agent-diverse`, and `agent-echo`. It makes one shared document-assessment request plus three synthesis requests per case/repetition: 3 cases need 12 calls. Raw/diversity agents never receive the graph or assessment scores. EchoGuard receives the estimated graph and family deletion sensitivity. It can override the heuristic score after inspecting source text. These are **fixed-corpus synthesis agents**, not unrestricted live-web research agents; follow-up search queries are generated but not executed in version 0.1.

The adapter uses the Chat Completions interface with strict JSON Schema, following [official structured-output documentation](https://developers.openai.com/api/docs/guides/structured-outputs). An OpenAI-compatible local server can use `ECHOBENCH_API_BASE=http://127.0.0.1:1234/v1`; use `--json-mode` if it supports only JSON objects. Supported schemas and model availability depend on the endpoint. This project's API adapter has been verified against mocked responses; no paid model run has been performed.

`--limit` is required for model runs. `--max-calls` limits uncached requests. No automatic retry hides failed or refused outputs. Completed calls are cached, and an identical interrupted run can resume with `--resume`. Different repetitions have separate cache keys; repeated API responses may still be identical if the backend is deterministic. Model self-reported probabilities require independent calibration.

### Imported assessments and embeddings

`--assessments` accepts a JSON object keyed by case ID:

```json
{
  "your-case-id": {
    "documents": [
      { "documentId": "doc-1", "relation": "supports", "confidence": 0.85, "quote": "Exact text from doc-1." }
    ]
  }
}
```

Every document must appear exactly once. Quotes for support/contradiction must occur verbatim in the source. `confidence` represents certainty about the textual relation, not a source's reliability. Gold annotations must not be reused as assessment predictions when reporting an end-to-end result; if used for an oracle study, label that setting explicitly.

The `semantic` baseline accepts `--embeddings` with `{ "case-id": { "document-id": [0.1, 0.2] } }`. All documents need finite vectors with matching dimensions. Embeddings are supplied externally, and topic similarity alone does not prove shared origin.

## Outputs

| File | Content |
| --- | --- |
| `request.json` | Resume identity and dataset/configuration hashes |
| `predictions.jsonl` | Verdicts, scores, citations, gold evaluation fields, repetitions |
| `traces.jsonl` | Document assessments, grouping evidence and graph diagnostics |
| `summary.json` | Coverage, selective accuracy, Brier/ECE, pairwise F1/ARI, false-acceptance proxy, clustered intervals |
| `inflation.json` | Matched one-source versus repeated-source differences |
| `run.json` | Environment, dataset/source-code hashes, model endpoint/name, methods and parameters |
| `complete.json` | Completion marker, written only after the full report |
| `cache/*.json` | Exact prompts/outputs, usage, timestamps and fingerprints; no API keys |
| `report.html`, `figure-*.svg` | Local report and standalone vector figures |

## Layout

```text
src/          Schema, genealogy, scoring, collection, models, metrics, CLI, server
web/          Local evidence annotation and lineage inspection interface
test/         Scientific invariants, end-to-end runs, annotation and API checks
data/         Example collection manifest
docs/         Protocol, annotation guidance, architecture, schema, related work
paper/        Manuscript outline with explicit placeholders for unmeasured results
scripts/      Syntax verification
outputs/      Local generated experiments (ignored)
annotations/  Local reviewer histories (ignored)
```

## Current limits

Exact text, lexical overlap and observed attributions establish only candidate dependence. Subtle rewriting, missing originals, shared factual descriptions, genuine quotations, and translated evidence without links require further work. A merged family can also contain independent additional reporting: passage-level genealogy is a necessary research extension. The present numeric score is an uncalibrated logistic transform of family support minus contradiction. It must not be presented as a probability of truth in production.

Publication work still requires a diverse human-adjudicated dataset, stronger learned provenance models, multilingual evaluation, calibrated confidence, adaptive retrieval with controlled budgets, several actual model families, and an updated novelty comparison. See [remaining milestones](docs/ROADMAP.md).
