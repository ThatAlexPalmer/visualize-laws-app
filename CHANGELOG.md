# Changelog

## 1.2.0

- Open a law and see the penalty it states — the amount or range, whether each day counts again, and whether jail is on the table.
- Filter to laws that state a fine, mention jail, or charge per day.
- Colour the map by how much of a place's code carries a stated dollar penalty, with the typical fine shown as a figure beside the legend.

Adds the [LOCUS-Fines](https://huggingface.co/datasets/LocalLaws/LOCUS-Fines) supplement as
`law_fines` (632,005 model-read rows) plus `place_penalties` aggregates. Only rows the
supplement's model actually read are stored, so a law with no penalty record was not annotated
— it does not mean the law carries no penalty. Amounts are checked against the source text;
the surrounding judgements are not.

Production: merge does not migrate or seed. After the Vercel deploy, from a workstation with
`.env.prod`: `pnpm prisma:deploy:prod` then `pnpm build:fines:prod`. Do not `seed:prod`.

## 1.1.1

- Type a state name (`colorado`) and go to that state, not a city that shares the name.
- See that state’s full law list, not only laws that mention the word.
- Read law titles and bodies as formatted text — headings and tables, not raw `####` or `<table>` marks.

## 1.1.0

After zoom, one-county city codes paint county shapes. Hover says `{County} · {City} code`. Cities in several counties stay empty. Native county scores still win.

- `city_county` / `county_fills` cache from Census 2020 + existing `laws` (no parquet recopy)
- missing or empty `county_fills` falls back to native county rows (does not blank the map)
- native FIPS only bind when they exist on the atlas mesh
- `pnpm build:city-county` (local) and `pnpm build:city-county:prod` (workstation → prod)

Production: merge does not migrate or seed. After the Vercel deploy, from a laptop with `.env.prod`: `pnpm prisma:deploy:prod` then `pnpm build:city-county:prod`. Do not `seed:prod`.
