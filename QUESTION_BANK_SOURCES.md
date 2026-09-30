# Question bank sources and review state

The preview file keeps records marked `pending`. The deployment importer validates their schema, source metadata, answer choices, stable identifiers, and sensitive-topic filter before promoting the new bank. It replaces older shared questions in the same six categories while retaining player-submitted questions for moderation. Moderator-rejected records stay rejected on repeat deployments.

## Multiplayer room categories

| Category | New pending records | Source and method |
| --- | ---: | --- |
| `general-knowledge` | 809 | Referenced Wikidata facts about capitals and cities. Ambiguous city names were removed, malformed repeated `مدينة` prefixes were corrected, and the Surat answer was normalized to India. Questions about Jerusalem were removed. International film questions were removed to keep cinema in the Egyptian-movies category. |
| `egyptian-movies` | 319 | Referenced Wikidata film-director facts for Egyptian films. The multi-director film `البنات والصيف` was removed. |
| `flags` | 144 | New country flags only; duplicates and the listed dependent territories were excluded. Myanmar uses the current `mm.png` flag image. Country names and ISO codes come from Wikidata, paired with PNG flag images from FlagCDN. The [Flagpedia download page](https://flagpedia.net/download) marks its country flags as public domain. |
| `describe-it` | 196 | Common word targets from the Arabic Swadesh list, rendered as charades prompts. Ambiguous, rare, malformed, and function-word entries were removed. No AI-written riddles are included. |
| `word-in-song` | 196 | Single-word prompts from the same filtered list. The bank contains no song lyrics or copied lyric excerpts. |
| `reversed-words` | 72 | New single-word entries only; duplicates from the local bank were excluded. Letters are reversed by deterministic character order. |

Wikidata structured data is marked CC0 1.0 in each sourced record. Fact-backed questions store a Wikidata item URL and source identifier. Records still need human review before approval.

Word-game terms come from [Wiktionary's Arabic Swadesh list](https://en.wiktionary.org/wiki/Appendix:Arabic_Swadesh_list). The list describes its entries as Classical Arabic, so reviewers should check fit for Egyptian players. Each derived record stores attribution and CC BY-SA 4.0 metadata. Keep the derived word-game bank under the same share-alike terms when distributing it, and include the attribution in the game's credits/source notice. Wikimedia's [Terms of Use](https://foundation.wikimedia.org/wiki/Terms_of_Use) describe the applicable reuse terms.

## Other game question categories

The separate managed bank in `services/gameQuestionBank.js` builds 93 `dont-say-my-word` questions and now builds 60 `predict-questions` (up from 30) from its existing curated topic list. These are open-ended prompt pools, not fact quizzes, and remain managed separately from the sourced multiplayer preview. Stable bank keys preserve the existing records; the 30 extra Predict prompts are added on the next normal bank sync.

Other modes such as drawing, chess, and codenames do not select from the `Question` category bank.

## Preview files

- `question-bank-all-categories-preview.json` — all 1,736 new pending records for the six multiplayer room categories.
- `wikidata-question-bank-preview.json` — 1,128 Wikidata general-knowledge and Egyptian-cinema records.
- `wikidata-flags-preview.json` — flag records.
- `wiktionary-word-games-preview.json` — word-game prompt records and attribution.
