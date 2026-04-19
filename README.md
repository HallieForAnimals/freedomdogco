# page-updater-proto-site

Static pages managed with the **Page Updater** app (`page-updater-proto`).

## Local dev server with form + applicant storage

From this folder:

```bash
node server.js
```

- Serves the site at `http://localhost:8787` (override with `PORT`).
- **`POST /api/submissions`** — stores each submission in `data/inbox.json` (full detail).
- **`data/applicants-index.json`** — dummy rollup keyed by **email**: which kinds someone submitted (adoption / foster / volunteer / contact), counts, first/last time. Created/updated automatically when an email is present on the submission.
- **`GET /api/inbox`** and **`GET /api/applicants`** — same auth as before (`Authorization: Bearer …` or `X-HFA-Inbox-Token` matching `INBOX_SECRET` / `demo-inbox-secret`).

Production/GitHub Pages usually posts to your hosted worker instead; the rollup file above is for **local prototype** use unless you add the same logic to the worker.

## Cloudflare Pages

This repo is static files at the root (no bundler). In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect to Git**. Use the repo that contains this folder, then:

- **Framework preset**: None  
- **Build command**: *(empty)*  
- **Build output directory**: `/` (root)

`wrangler.toml` and `_headers` are included for CLI deploys and response headers. Optional CLI after `npm install` and `npx wrangler login`:

```bash
npm run deploy
```

Change the `deploy` script’s `--project-name` if the Pages project name differs. Ensure this Git remote points at the repo you connect to Pages (not a template upstream).

### Forms and analytics in production

`server.js` does not run on Pages. Submissions still go to `window.HFA_SITE.submissionsEndpoint` or the default Worker URL in `site-runtime.js`. Point that at **your** Cloudflare Worker (or another backend) before launch.

### Zero Trust (Cloudflare Access) in front of Pages

Use this when the site (or a hostname) should require login—**not** for a normal public marketing site.

1. In **Zero Trust → Access → Applications → Add an application**, choose **Self-hosted**.  
2. Set the **Application domain** to your Pages hostname (for example `freedom-dog-site.pages.dev` or `www.yourdomain.com` after you attach the custom domain in Pages).  
3. Add a **policy** (for example: allow emails in a Google Workspace group, OTP to approved addresses, or SAML).  
4. Under **Settings**, tune session duration and cookie attributes as needed.

If only **preview deployments** should be locked, use an Access application that matches the `*.pages.dev` preview pattern Cloudflare documents for Pages, separate from production.

**Secure Web Gateway** (DNS filtering, HTTP policies on managed devices) is configured under **Zero Trust → Gateway** and is orthogonal to hosting the site on Pages.

## Privacy

Form storage is **server-side** (or your form provider)—you do **not** need cookies just to keep an application log. Optional cookies (e.g. analytics or admin sessions) are described in `privacy.html`.
