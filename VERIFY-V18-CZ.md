# Ověření FlatCloud Rent V18

Ověření zdrojového archivu proběhlo 17. 7. 2026 v oddělené kontrolní kopii.

## Provedené kontroly

- instalace přes `npm ci` podle dodaného lockfile,
- `prisma format` a `prisma validate`,
- generování Prisma klienta pro buildovou kontrolu,
- `npx tsc --noEmit`,
- optimalizovaný `next build` v Next.js 16.2.10,
- kontrola 125 TypeScript/TSX souborů na syntaktické chyby,
- funkční test normalizace účtů a převodu českého čísla účtu na IBAN,
- kontrola JSON souborů,
- kontrola, že `.npmrc` a `package-lock.json` používají veřejný npm registry,
- kontrola, že ZIP neobsahuje `node_modules`, `.next`, tajné `.env` ani interní registry URL,
- test integrity výsledného ZIPu.

## Výsledek

Prisma schéma je validní, TypeScript i produkční Next.js build prošly bez chyby. Prisma engine není součástí zdrojového ZIPu; při standardním Render buildu jej doplní příkaz `prisma generate`.
