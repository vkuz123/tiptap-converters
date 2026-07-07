# Paligo export test fixture

`data-file.xml` is a **sanitized** Paligo `<e:export>` transfer file used to test
`parsePaligoExport` (`src/import/paligo.ts`). It is adapted from a publicly available
Paligo export sample; the `instance` attribute has been neutralized to
`https://example.paligoapp.com` and it contains only generic placeholder content
("Sample Publication", demo topics/tables) — no real or private data.

It exercises: `<e:structure>` manifest, `type="text"`/`type="component"` resources,
`xinfo:text` fragment resolution, `<informaltable>` conversion, and (via the synthetic
fixture inline in `tests/import/paligo.test.ts`) shared-fragment reuse detection.
