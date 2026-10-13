# PaperLogix

> A private demo-trading journal for reviewing MT5 history, decisions, and practice habits.

PaperLogix connects to **MetaQuotes-Demo** through MetaApi. Sign in to PaperLogix, connect your
MT5 account with its investor (read-only) password, and sync up to 90 days of closed trade history.

**No MT5 terminal, Python package, EA, or Windows service is required on your computer.** Vercel
hosts the static app and Node.js API; Supabase provides authentication and storage.

## Features

- Individual PaperLogix accounts and account-specific MT5 data.
- MetaQuotes-Demo account connection using an investor password.
- Automatic history sync on sign-in, plus manual sync.
- Demo-account dashboard, trade history, metrics, journal, and replay views.
- Account removal that also removes its MetaApi connection and imported history.
- Per-user account ownership and row-level access rules in Supabase.

> PaperLogix is a learning prototype. Some analytics, reports, and coach content are illustrative.
> Demo results do not predict future performance and are not financial advice.

## How it works

```text
Browser
  ├─ Supabase Auth (PaperLogix user sign-in)
  └─ Vercel Node.js Function
       ├─ verifies the signed-in user
       ├─ stores account ownership and imported deals in Supabase
       └─ connects to MetaApi using a server-only API token
             └─ MetaQuotes-Demo account
```

The MT5 investor password is sent over HTTPS to the PaperLogix function and then to MetaApi.
PaperLogix does not save that password in its database. MetaApi is a third-party service and
handles the credentials required for its cloud connection; review its current privacy and security
terms before connecting. Use an investor/read-only password only, and never connect a live account.

## Deploy to Vercel

### 1. Configure Supabase

1. Create a project at [supabase.com](https://supabase.com/).
2. Open **SQL Editor** and run [`supabase-schema.sql`](./supabase-schema.sql).
3. Enable email/password sign-in under **Authentication → Providers**.
4. Under **Authentication → URL Configuration**, set the site URL to your Vercel deployment URL
   and add that URL to the allowed redirect URLs.
5. In **Project Settings → API**, copy the project URL, publishable/anon key, and service-role key.
   Keep the service-role key private.

### 2. Create a MetaApi token

Create a MetaApi account and generate an API token in its dashboard. Check current plan, pricing,
and MetaQuotes-Demo server/account support. Do not put the token in the frontend or commit it.

### 3. Deploy the project

1. Push this repository to GitHub, GitLab, or Bitbucket.
2. In Vercel, select **Add New → Project** and import the repository.
3. Keep the project root as the **Root Directory**. The included [`vercel.json`](./vercel.json)
   publishes the `public` folder and routes `/api/*` requests to a Node.js function. No framework
   preset or custom build command is required.
4. Add these environment variables in **Project Settings → Environment Variables** for every
   environment you plan to deploy:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_ANON_KEY` | Your Supabase publishable/anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service-role key (**secret**) |
   | `METAAPI_TOKEN` | Your MetaApi token (**secret**) |

5. Deploy (and redeploy whenever you change environment variables).
6. Open the deployment, create a PaperLogix login, then go to **MT5 connection** and enter your
   numeric MetaQuotes-Demo login and investor password.

The API function is limited to 60 seconds per request. A new MetaApi terminal may take longer to
become ready, so PaperLogix saves the connection first and starts its history sync separately. If
the first sync is not ready before the function limit, the account remains connected; retry with
**Sync now** after a short wait.

## MT5 account requirements

- The server must be exactly `MetaQuotes-Demo`.
- Enter the investor/read-only password only. PaperLogix cannot independently verify password
  permissions; never enter a master password.
- Confirm that the account is a demo account before connecting.
- MetaApi must support the account and allow history access.

PaperLogix imports closed buy/sell exit deals from the preceding 90 days. It stores deal identifiers,
symbol, direction, volume, close time, and realised profit after available commission, swap, and fee
values. The app does not expose trade-placement API routes.

## Local development

Node.js 20 or later is required. The browser-only app cannot safely connect to MetaApi because the
MetaApi token must remain server-side.

1. Copy `.env.example` to `.env` and fill in the Supabase and MetaApi values.
2. Run the SQL schema in your Supabase project as described above.
3. Install dependencies and start the local Express server:

   ```sh
   npm install
   npm start
   ```

4. Open `http://localhost:3000`.

Keep `.env` private; `.env` files are excluded from Git.

## Project structure

| Path | Purpose |
| --- | --- |
| `public/index.html` | App pages, sign-in, and MT5 connection form |
| `public/styles.css` | Theme, layout, and responsive styling |
| `public/app.js` | Supabase sign-in and browser interactions |
| `api/[...path].js` | Vercel serverless function entry point |
| `server.js` | Authenticated Express API and MetaApi integration |
| `supabase-schema.sql` | Per-user account and deal tables with row-level security |
| `vercel.json` | Static output and function configuration |

## Troubleshooting

**The page or API is unavailable**

Check the Vercel deployment and function logs. Visit `/api/health` to verify that the function is
running, and confirm all four server environment variables are set for the deployment environment.

**PaperLogix cannot sign in**

Check that Supabase email/password authentication is enabled, the project URL and anon key are
correct, and the Vercel deployment URL is configured in Supabase's Auth URL settings.

**The MT5 account cannot connect**

Confirm the server is `MetaQuotes-Demo`, the investor password is correct, and MetaApi supports the
account. Review Vercel function logs; credentials are intentionally omitted from application logs.

**A connected account does not sync**

Use **Sync now** in PaperLogix after a short wait. The MetaApi terminal must be connected and
synchronized. Requests that take longer than Vercel's configured 60-second function limit time out
and can be retried.
