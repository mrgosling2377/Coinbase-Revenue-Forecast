# Project notes for Codex

This folder is the editable source for the Coinbase Revenue Forecast dashboard. It is a local copy of the October 9, 2026 export, not a synchronized checkout of the hosted school Site.

- Use the source files under `app/`, `components/`, and `lib/`. `dist/` is generated output.
- Keep revenue units consistent: model revenue is in thousands of dollars; volume and USDC balances are in billions.
- After calculation or workbook-import changes, run `npm test` and `npm run build`. If the original `Coinbase VERSION FINAL.xlsx` is available, also run `npm run test:workbook -- "/path/to/Coinbase VERSION FINAL.xlsx"`.
- Do not replace the embedded workbook data or claim parity with the later hosted Site without checking the source workbook or current Site source.
- Workbook uploads are processed in the visitor's browser tab. Preserve that privacy behavior unless a change is explicitly requested.
