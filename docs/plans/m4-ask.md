# M4 (stretch): Ask the rules in plain English

## Goal

On a phone at the table, ask "can I retreat into a system with only my opponent's mech?" by typing or using the keyboard's dictation mic. Get a 1–3 sentence answer that **links to and quotes the exact paragraphs** it relied on, highlighted on the rules page (`/rules/R_space_combat#78.4c`).

## Shape

- `POST /api/ask` is a Pages Function. It runs the existing local search (`words`/`some` modes) server-side, or receives candidate paragraphs from the client, to pick about 15 candidate paragraphs. Those are sent to the Claude API with the question, and the reply is a short answer plus the paragraph ids it cites. The API key is a Pages secret and never reaches the browser.
- The client renders the answer above normal search results, with each cited paragraph as a tappable quote.
- The official text is always shown next to the answer. The model can misread an edge case, and the quoted rule settles arguments.
- Rate-limit per signed-in user (M3 auth) or per IP. Cache identical questions.

## Before building

- Read the `claude-api` skill for current model ids, pricing and prompt caching. The rules corpus is a good fit for a cached system prompt.
- Measure how often the M1 word search alone finds the right paragraph for 20 real questions from game nights. That decides how much this is worth.
