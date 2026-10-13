# Coinbase Revenue Forecast — local Codex project

Independent student project. Forecast assumptions are provisional. This local React/Vite source was exported on October 9, 2026. The hosted school Site was edited after this export, so do not assume the two versions have identical defaults or text. This project does not alter the hosted Site.

## Run locally

Use Node.js 22.13 or newer (Node 24 recommended).

```sh
npm install
npm test
npm run build
npm run preview
```

Open the local URL printed by the preview command. Do not double-click index.html: this app needs an HTTP server. `npm run dev` starts the development server.

## Publish on Vercel

1. Unzip this folder. Create a personal GitHub repository, then upload the contents of this folder with package.json at the repository root. A private repository is fine; the deployed site can still be public.
2. In your Vercel account, import that repository as a new project.
3. Choose the Vite preset, build command `npm run build`, and output directory `dist`. Use Node 24. No environment variables or database are required.
4. Deploy. Check the deployment's visitor-access settings and test its URL in a signed-out browser before sharing it.

The original delivery ZIP also contains a prebuilt static copy. This local project builds its own `dist/` folder from source.

## Preserved behavior

- Bear/Worst, Base/Base and Bull/Best mapping; Q3/Q4 2026 selection.
- All ten inputs, separate quarterly values, percent and basis-point units, five shared inputs, and Q4 compounding from forecast Q3.
- Revenue cards, historical chart, comparison, mix, revenue detail, explanations, sources, rationale, light/dark styling and reset.
- Reset restores every scenario from the active workbook; it does not discard an uploaded workbook. Refresh discards the uploaded workbook and restores built-in defaults.

## Excel files and privacy

Uploads are parsed and validated entirely in the browser and held in memory for the current tab. The file is not transmitted or persisted. Only the theme preference uses localStorage. Select the original final workbook template with unchanged sheets, layout, formulas and units. Arbitrary Excel models are not supported. The original XLSX is not included in this export; its model data and formula reference are included.

Anyone viewing a public deployment can inspect its bundled historical data, assumptions, notes and source URLs. Review those before publishing. No workspace authentication, account storage, credentials, project IDs, private Git history, or server routes are included.

## Verification

`npm test` repeats 168 comparisons against the previously recalculated workbook reference, including all three scenarios, both forecast quarters, all revenue lines, driver levels, edited input propagation and historical subtotal identities. Maximum difference: zero. Reference outputs were calculated with a spreadsheet engine and checked against available saved Excel Base-case results; this is not a fresh native Microsoft Excel recalculation.

For a direct check against the supplied final workbook:

```sh
npm run test:workbook -- "/path/to/Coinbase VERSION FINAL.xlsx"
```

This passed 211 template/data checks plus equality of historical data, assumptions, source links and all scenario outputs. It also checks an edited Q3 input propagates to Q4, stale historical caches are recomputed, and altered formulas/invalid files are rejected. The numerical model and rationale components were copied without calculation edits.

TypeScript and the production build passed. A live browser click-through and public deployment were not completed in this environment. Before sharing, test scenario buttons, quarter selection, an input edit/reset, all tabs, dark mode, a valid workbook and an invalid workbook, and refresh behavior.

## Model limitations retained

- The pending Q3 earn-out roll-off adjustment remains provisional; no new standalone adjustment was invented.
- The 2025–2026 revenue classification difference remains disclosed.
- The workbook has five scenario-specific drivers and five shared growth inputs. Rationale examples for other Bear/Bull inputs do not automatically replace the workbook's shared inputs.
- Formula agreement verifies implementation, not the accuracy of source financial disclosures or the predictive quality of assumptions. No new external financial-data audit was performed for this export.

## Development record

Prepared with AI-assisted development: preserved the existing model and interface, replaced account-based upload storage with browser parsing, removed platform-specific hosting files, and reran numerical, importer and build checks. The verification scripts and JSON report provide a reproducible record. Future edits should rerun these checks.
