# GDRIVE-STORAGE-1 implementation notes

Production uses `FILE_STORAGE_DRIVER=gdrive`. OAuth client credentials and the refresh token are configured only in Render environment variables and are never stored in PostgreSQL or Git.

Canonical production folders:

- `00_Aplikace FlatCloud`: `1_607SwL_B2U5STzmQ_t3YpruZWUplH5R`
- `01_Nemovitosti`: `1qU43zssxRLstikUe1qm7WpiRlry0Bf6f`
- `02_Reporty`: `1W7-UKk5TW4o0pdA6MjaSoBhm1Qqgq_Po`
- `03_Šablony`: `1zBbbmsJamoHS6hPBoH25r2Mnn7AHJUGn`
- `99_Archiv`: `1JbUZCEJjtdfyEwDlFM65emCh93r34Kv4`

Required Render variables are documented in `.env.example`. Existing historical folders directly below `_Flat Cloud` are intentionally untouched. This checkpoint does not migrate or automatically index manually uploaded Drive files.
