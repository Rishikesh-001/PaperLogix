# PaperLogix

> A private demo-trading journal for reviewing MT5 history, decisions, and practice habits.

PaperLogix connects to **MetaQuotes-Demo** through MetaApi. Sign in to PaperLogix, connect your
MT5 account with its investor (read-only) password, and PaperLogix syncs up to 90 days of closed
trade history when you connect and when you next sign in.

**No MT5 terminal, Python package, EA, or Windows service is required on the user's computer.**
PaperLogix's Node.js backend runs on Render; Supabase provides user authentication and storage.

## Features

- Individual PaperLogix sign-in and account-specific MT5 data.
- MetaQuotes-Demo account connection using an investor password.
- Automatic history sync on sign-in, plus manual sync.
- Demo-account dashboard, trade history, metrics, reports, journal, and replay views.
- Account removal that also removes the MetaApi connection and imported PaperLogix history.
- Per-user account ownership and row-level access rules in Supabase.

> PaperLogix is a learning prototype. Some analytics, reports, and coach content are illustrative.
> Demo results do not predict future performance and are not financial advice.

## How the connection works

```text
Browser
  ├─ Supabase Auth (PaperLogix user sign-in)
  └─ PaperLogix Node.js API on Render
       ├─ verifies the signed-in user
       ├─ stores account ownership and imported deals in Supabase
       └─ connects to MetaApi using a server-only API token
             └─ MetaQuotes-Demo account
```

The MT5 investor password is sent from the browser to the PaperLogix backend over HTTPS and then
to MetaApi to establish its cloud connection. PaperLogix does not write that password to its
database. MetaApi is a third-party service and handles the credentials needed for its connection;
review its current security and privacy terms before connecting. Use an investor/read-only password
only, and never connect a live account.

## Deploying PaperLogix

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com/).
2. Open **SQL Editor** and run the contents of [`supabase-schema.sql`](./supabase-schema.sql).
3. In **Authentication → URL Configuration**, set the site URL to your deployed PaperLogix URL.
   Add that URL to the allowed redirect URLs.
4. In **Project Settings → API**, note the project URL, publishable/anon key, and service-role key.
   The service-role key is secret and belongs only in Render's environment variables.

### 2. Create a MetaApi token

Create a MetaApi account and generate an API token in its dashboard. Check MetaApi's current plan,
trial, and account/server support before proceeding; availability and pricing can change. Do not
put the token in the frontend or commit it to this repository.

### 3. Deploy the Node.js service to Render

1. Push this repository to your Git provider and create a Render service from the repository.
2. Use the included [`render.yaml`](./render.yaml) Blueprint, or configure a Node web service with:
   - Build command: `npm install`
   - Start command: `npm start`
3. Set these environment variables in Render:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `SUPABASE_URL` | Your Supabase project URL |
   | `SUPABASE_ANON_KEY` | Your Supabase publishable/anon key |
   | `SUPABASE_SERVICE_ROLE_KEY` | Your Supabase service-role key (**secret**) |
   | `METAAPI_TOKEN` | Your MetaApi token (**secret**) |

4. Wait for the deploy to finish, then open the Render URL and create a PaperLogix account.
5. In PaperLogix, go to **MT5 connection**, enter your numeric MetaQuotes-Demo login and
   investor password, confirm the demo account, and connect.

The first MetaApi connection can take a few minutes while its cloud terminal starts and synchronizes.
Afterward, signing in to PaperLogix starts a history sync for each linked account.

## MT5 account requirements

- The server name must be exactly `MetaQuotes-Demo`.
- Enter the account's investor/read-only password only. PaperLogix cannot independently verify
  that the password has investor-only permissions; never enter a master password.
- Confirm that the account is a demo account before connecting.
- MetaApi must support the account and permit the required history access.

PaperLogix imports closed buy/sell exit deals from the preceding 90 days. It stores deal identifiers,
symbol, direction, volume, close time, and realised profit after available commission, swap, and
fee values. It does not expose trade-placement API routes.

## Local development

Node.js 20 or later is needed to run the backend locally. The browser UI by itself cannot safely
connect to MetaApi because the MetaApi token must stay on a server.

1. Copy `.env.example` to `.env` and fill in the Supabase and MetaApi values.
2. Run the SQL schema in your Supabase project as described above.
3. Install dependencies and start the web server:

   ```sh
   npm install
   npm start
   ```

4. Open `http://localhost:3000`.

Keep `.env` private. `.env` files are excluded from Git by `.gitignore`.

## Project structure

| File | Purpose |
| --- | --- |
| `index.html` | App pages, PaperLogix sign-in, and MT5 connection form |
| `styles.css` | Theme, layout, and responsive styling |
| `app.js` | Supabase sign-in and browser interactions |
| `server.js` | Authenticated Node API and MetaApi integration |
| `supabase-schema.sql` | Per-user account and deal tables with row-level security |
| `render.yaml` | Render web-service configuration |
| `.env.example` | Required server environment-variable names |

## Troubleshooting

**The app says the backend is unavailable**

Open the deployed Render URL, not the HTML file directly. Check the Render service health endpoint
at `/api/health` and confirm all required environment variables are set.

**PaperLogix cannot sign in or create an account**

Check that Supabase email/password authentication is enabled, the Supabase URL and anon key are
correct, and the deployed URL is listed in Supabase's Auth URL configuration.

**The MT5 account cannot connect**

Confirm the server is `MetaQuotes-Demo`, the investor password is correct, and the account supports
MetaApi access. Check Render logs for the request failure; credentials are intentionally omitted
from those logs.

**A linked account does not sync**

Use **Sync now** in PaperLogix. The MetaApi cloud terminal must be connected and synchronized, and
the selected MetaApi plan must allow the account and history access.
