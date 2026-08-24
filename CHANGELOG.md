# Changelog

## 1.1.0

After zoom, one-county city codes paint county shapes. Hover says `{County} · {City} code`. Cities in several counties stay empty. Native county scores still win.

- `city_county` / `county_fills` cache from Census 2020 + existing `laws` (no parquet recopy)
- missing or empty `county_fills` falls back to native county rows (does not blank the map)
- native FIPS only bind when they exist on the atlas mesh
- `pnpm build:city-county` (local) and `pnpm build:city-county:prod` (workstation → prod)

Production: merge does not migrate or seed. After the Vercel deploy, from a laptop with `.env.prod`: `pnpm prisma:deploy:prod` then `pnpm build:city-county:prod`. Do not `seed:prod`.
