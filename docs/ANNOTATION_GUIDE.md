# Annotation guide

Annotate a claim–passage relationship separately from the claim's real-world truth and the passage's informational origin. A false claim can be faithfully supported by a false report.

## Evidence relation

- **Supports:** the quoted source passage asserts or supplies evidence for the exact scoped claim.
- **Contradicts:** it asserts an incompatible value or supplies evidence against the scoped claim.
- **Insufficient:** it is unrelated, ambiguous, conditional, missing necessary scope, or supplies neither direction.

Use an exact passage from the source. Match entities, time, place, units and population before deciding whether two statements disagree. A source about last year's count cannot automatically contradict this year's count.

## Informational origin

- **Copied from:** source content reproduces an upstream passage or observation.
- **Translated from:** the claim-bearing passage translates an upstream source.
- **Cites for claim:** it attributes the evidence for this particular claim to an upstream source.
- **Independent observation:** inspectable evidence establishes a separately collected observation, experiment, record or interview. Merely using different words, a different hostname or different authors is insufficient.
- **Unknown:** origin or independence cannot be resolved from available evidence.

Assign a shared family ID to passages deriving from one observation. A press release and five summaries of it are one family. Two independent experiments are separate families even if their conclusions match. A source that copies background text but supplies a new measurement may be independent for that measurement; document-level labels are an approximation, and mixed-origin cases should be marked for passage-level adjudication.

Choose a parent document for derivative relations and use the same family ID for parent and derivative. A circular chain may point both directions; do not infer an original merely from article timestamps. Timestamps can reflect republication or correction. Use `unknown:<documentId>` for unresolved origin. Unknown labels are excluded from pairwise family scoring rather than treated as independent singleton truth.

## Claim truth

Truth can be `true`, `false` or `unknown`. Known truth needs a written rationale and an inspectable primary reference. Agreement among copies does not establish truth. Primary sources also make mistakes; assess whether their measurement or record actually resolves the claim. Scope disputed claims carefully and retain uncertainty.

For real benchmark test data, use two human reviewers working independently with model genealogy hidden, then a third adjudicator. Maintain a disagreement log. Measure relation agreement, truth agreement and same-family pair agreement separately. Kappa alone is not a validity certificate. Use expertise appropriate to the selected domain.

## Review checklist

1. Verify article text and time against the snapshot.
2. Identify the exact atomic claim and evidence passage.
3. Follow quoted/cited origins until the original observation or an unresolved boundary.
4. Document translations, syndication, shared quotations and new original reporting.
5. Record relation, origin, parent, family and rationale.
6. Resolve disagreement without overwriting reviewers' histories.

The workbench keeps an append-only history inside each atomically replaced annotation file. Changing the dataset case after annotation triggers a hash mismatch and requires a new annotation directory. Do not rename reviewer labels to imply human adjudication if they were produced by a model.
