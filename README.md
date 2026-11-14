# Duel Arcade

Three 2-player games in an Arabian desert style: **Recoil** (gun duel), **Throw** (ball fight) and **Spikes** (dodge the stakes). Play against a bot, a friend on the same phone, or online 1 vs 1 with push-to-talk voice.

## Hosting on Cloudflare

The game runs on Cloudflare Workers:

- `public/` holds the game (static assets).
- `src/worker.js` relays online duels over WebSocket (`/ws`) through one Durable Object.
- `wrangler.jsonc` holds the configuration.

Deploy:

```
npm install
npx wrangler deploy
```

Or connect this repository in the Cloudflare dashboard (Workers & Pages → Create → Import a repository). Every push to `main` then deploys automatically.

Run it locally with `npx wrangler dev`.

`server.js` is the old Node version (Railway) and is no longer needed on Cloudflare.
