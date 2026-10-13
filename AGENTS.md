# PaperLogix Agent Guidelines

## Preventing unsupported claims

- Treat the checked-out files and current command output as the source of truth. Re-check them before relying on prior chat summaries, issue descriptions, or assumptions.
- Never invent environment-variable values, service configuration, deployment status, logs, test results, or provider behavior. If something cannot be inspected, say so plainly and give a specific way to verify it.
- Distinguish local validation from a remote Vercel deployment. A local pass does not prove that a commit was pushed, deployed, or works with production credentials.
- Do not claim a user-facing problem is fixed until the relevant behavior has been tested. When a production-only failure cannot be reproduced locally, request the exact current deployment URL and relevant runtime/build output instead of guessing.
- Separate warnings from errors. Diagnose the first actual failing line and its context; do not present nearby warnings as the cause without evidence.
- Do not ask users to paste secrets. Refer to environment-variable names and where to set them; ask them to redact tokens, passwords, keys, and personal data from logs.
- Do not describe the MT5 password as verified read-only. The app asks for an investor password, but cannot confirm its permissions.

## Current architecture

- This is a plain HTML/CSS/JavaScript application with an Express backend, not a React or Next.js project.
- `public/index.html`, `public/styles.css`, and `public/app.js` are the browser application.
- Root `app.js` defines and exports the Express application for Vercel. It must not call `listen()`.
- Root `server.js` is the local development bootstrap and starts the Express listener.
- `vercel.json` configures Vercel's Express function and includes `public/**`, which the Express routes serve.
- Supabase provides authentication and Postgres storage. MetaApi connects MT5 accounts. Their secrets are configured outside source control.
- Follow `README.md` for the current setup and deployment details; verify details in source files if the README and implementation differ.

## Change and validation rules

- Keep changes focused on the reported issue and preserve the existing architecture unless the requested fix requires changing it.
- Before changing deployment behavior, inspect `app.js`, `server.js`, `vercel.json`, and `package.json` together.
- Run `npm run check` after JavaScript changes. Use targeted smoke tests when changing API routes or static-file serving.
- Report exactly which checks ran and whether they passed. Do not claim a test was run if it was not.
- For Vercel problems, distinguish build configuration, function invocation, and application-level/API failures. Use the deployment's current logs and URL; old logs or URLs may refer to a different deployment.
- Avoid exposing backend source or `.env` files as static assets. Never put server-only credentials in `public/` or browser code.
