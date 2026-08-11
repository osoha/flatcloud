# Ověření FlatCloud Rent V19

Kontroly provedené 11. 8. 2026 při přípravě zdrojového ZIPu:

- validace JSON (`package.json`, `package-lock.json`, `tsconfig.json`),
- validace YAML struktury `render.yaml` a vazeb `fromService` pro `SESSION_SECRET`, `BANK_TOKEN_ENCRYPTION_KEY` a SMTP fallback,
- syntaktické parsování všech TypeScript/TSX souborů přes TypeScript 5.8.3,
- samostatná transpilační kontrola všech změněných TypeScript/TSX souborů,
- runtime test kompatibility šifrování: SESSION klíč, BANK klíč, čtení staršího SESSION ciphertextu po doplnění BANK klíče a guard pro chybějící klíč,
- smoke test časové osy upomínek 3 / 10 / 20 / 30 dní a kontrola catch-up podmínek,
- kontrola, že retry blokuje pouze stav `SENT`, nikoli `FAILED` / `SKIPPED`,
- kontrola veřejného npm registry v `.npmrc` i `package-lock.json` a absence interních artifactory URL,
- potvrzení, že V19 nepřidává databázovou migraci,
- kontrola čistoty archivu: bez `node_modules`, `.next` a tajných `.env` / klíčových souborů.

## Omezení lokálního ověření

V tomto pracovním sandboxu není dostupné DNS připojení k veřejnému npm registry, takže zde nebylo možné zopakovat čisté `npm ci` a celý `next build`. Závislosti i jejich verze jsou beze změny proti V18, u které byl čistý produkční build ověřen. Render při nasazení V19 provede vlastní `npm ci` a `npm run build` podle `render.yaml`.
