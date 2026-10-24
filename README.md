# Rakuten affiliate GitHub/Cloudflare correction v3

This archive fixes the missing `src/worker.js` error by adding a real Workers entrypoint and `wrangler.jsonc` referencing it. The application is a demonstration shell, not the previous full affiliate system. API credentials, ranking, article generation, SNS publishing and D1 production integration are not implemented.

## Cloudflare Workers connected to GitHub

Use root directory `/`, build command `npm run build`, deploy command `npx wrangler deploy`. The `wrangler.jsonc` points to `src/worker.js` and static output `dist`.

## Cloudflare Pages connected to GitHub

Pages build command `npm run build`, output directory `dist`, root `/`. If the Cloudflare project is a Workers project, do not configure it as Pages; follow Workers settings above. The Pages Function in `functions/api/health.js` is for Pages only.

## IMPORTANT when replacing existing GitHub repository files

Remove obsolete `wrangler.toml`, duplicate Wrangler configs, and old Worker entrypoint settings if they conflict. GitHub upload of a ZIP does not automatically delete old files already in the repository. The error can recur if an older config/deployment setting wins.

Locally: `npm run check` and `npm run build`.
