# Editorial Korean gloss manifest

`editorial-glosses.json` is the only permitted fallback when the dated Korean
Wiktionary source has no usable Korean meaning. Each array item must contain:

| Field | Requirement |
| --- | --- |
| `term` | One normalized English word or phrasal verb. It must appear only once. |
| `meaning` | A human-reviewed Korean gloss containing Hangul. |
| `sourceKind` | The literal string `editorial`; it is never represented as a source-derived gloss. |
| `reviewer` | Responsible reviewer identifier. |
| `reviewDate` | Review date in `YYYY-MM-DD` form. |
| `evidenceUrl` | HTTP(S) URL to the review evidence or source comparison. |

The build rejects an incomplete, ambiguous, or untraceable record. An empty
manifest is valid, but it contributes no fallback meanings.
