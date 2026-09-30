# Case format

JSONL contains one complete case per line. Validate it with `rtk proxy node src/cli.js validate --dataset FILE`.

```json
{
  "schemaVersion": "1.0",
  "id": "claim-001",
  "eventId": "event-001",
  "kind": "real",
  "claim": "An exact, scoped atomic claim.",
  "documents": [
    {
      "id": "doc-1",
      "url": "https://example.org/report",
      "title": "Report title",
      "text": "Full extracted text or the inspected claim-bearing passage.",
      "language": "en",
      "publishedAt": null,
      "author": null,
      "attributions": [],
      "outgoingLinks": []
    }
  ],
  "gold": {
    "truth": "unknown",
    "documentLabels": {
      "doc-1": {
        "relation": "insufficient",
        "familyId": "unknown:doc-1"
      }
    }
  }
}
```

Case and document IDs allow letters, digits, underscore, hyphen and dot. Each document URL is unique within the case. Claim and document text are nonempty. Gold is optional during collection/inference but every document needs a label if gold exists. Family IDs prefixed `unknown:` represent unresolved informational origins. Truth is `true`, `false` or `unknown`.

An observed attribution is `{ "url": "https://upstream.example/report", "quote": "Exact observed passage naming the upstream source." }`. The quote must occur in the document text. It represents evidence for the origin of this claim-bearing passage, not a generic hyperlink. Attributions are observed inputs, while family IDs and adjudicated parent relationships are private gold outputs.

The basic HTML collector preserves links as `{url, anchor}` and leaves attributions empty. Reviewing a link's context and claim relevance is necessary before adding an observed attribution. A gold parent cannot simply be copied into model-visible attribution metadata: that would be an oracle experiment and must be labelled as such. Missing dates and authors are null; retrieval time is not substituted for publication time.

Gold-free model exports have only id, claim and allowlisted document fields. The API adapter further hashes the case ID to avoid revealing scenario names embedded in synthetic case identifiers. Experimental scenario, truth, event group, copy count, generator metadata and family labels never enter model prompts.

For collection, the manifest is a JSON array of `{id,eventId,claim,urls:[...]}`. Limit each batch to 100 claims and 500 pages. URLs are selected explicitly. The collector writes `cases.jsonl`, `errors.jsonl`, and local raw snapshots. Snapshot metadata includes requested/final URLs, retrieval time, content SHA-256 and robots policy. Large copyrighted text remains a local research artifact; prepare a permitted excerpt/metadata release separately.
