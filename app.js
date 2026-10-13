require('dotenv').config();

const path = require('node:path');
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const requiredEnvironment = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'METAAPI_TOKEN',
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]?.trim());
let supabaseOrigin = null;
if (process.env.SUPABASE_URL) {
  try {
    const parsed = new URL(process.env.SUPABASE_URL);
    if (parsed.hostname.includes('supabase.com') && parsed.pathname.includes('/dashboard/project/')) {
      const match = parsed.pathname.match(/\/dashboard\/project\/([^/?#]+)/);
      const projectRef = match ? match[1] : '<project-ref>';
      missingEnvironment.push(
        `SUPABASE_URL is set to the dashboard URL. Change it to https://${projectRef}.supabase.co in Vercel`,
      );
    }
    supabaseOrigin = parsed.origin;
  } catch {
    missingEnvironment.push('SUPABASE_URL (must be a valid URL)');
  }
}

const configurationReady = missingEnvironment.length === 0;
let supabaseAdmin;
let metaApi;
let supabaseAuthClient;
let integrationInitializationFailed = false;

function initializeIntegrations() {
  if (!configurationReady || integrationInitializationFailed) return false;
  if (supabaseAdmin && metaApi) return true;

  try {
    const { createClient } = require('@supabase/supabase-js');
    const MetaApi = require('metaapi.cloud-sdk').default;

    supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
    metaApi = new MetaApi(process.env.METAAPI_TOKEN);
    return true;
  } catch (error) {
    integrationInitializationFailed = true;
    console.error('PaperLogix integration initialization failed', {
      name: error.name,
      message: error.message,
    });
    return false;
  }
}

const app = express();
const frontendDirectory = path.join(__dirname, 'public');
const allowedMt5Server = 'MetaQuotes-Demo';

app.disable('x-powered-by');
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'", ...(supabaseOrigin ? [supabaseOrigin] : [])],
        fontSrc: ["'self'", 'https:', 'data:'],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", 'data:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        styleSrc: ["'self'", "'unsafe-inline'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }),
);
app.use(express.json({ limit: '32kb' }));

const connectLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

function sendError(res, status, message) {
  return res.status(status).json({ error: message });
}

function sendSupabaseAuthError(res, error) {
  const message = error.message || '';
  if (
    /failed to fetch|fetch failed|networkerror|unexpected token '<'|is not valid json/i.test(message) ||
    /supabase\.com\/dashboard/i.test(process.env.SUPABASE_URL || '')
  ) {
    console.error('Supabase Auth is unreachable', {
      name: error.name,
      cause: error.cause?.code,
    });
    return sendError(
      res,
      502,
      'Could not reach Supabase Auth. In Vercel, set SUPABASE_URL to the API URL from Supabase Project Settings → API (usually https://<project-ref>.supabase.co), and verify the project is active.',
    );
  }

  const status = Number(error.status);
  return sendError(
    res,
    status >= 400 && status < 500 ? status : 502,
    error.message || 'Supabase could not complete the authentication request.',
  );
}

function requireConfiguration(_req, res, next) {
  if (!configurationReady) {
    return sendError(
      res,
      503,
      'PaperLogix backend configuration is incomplete. Check the required Vercel environment variables.',
    );
  }
  if (!initializeIntegrations()) {
    return sendError(
      res,
      503,
      'PaperLogix integrations could not initialize. Check the Vercel Node.js runtime and function logs.',
    );
  }
  return next();
}

function asyncRoute(handler) {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

async function requireUser(req, res, next) {
  try {
    const authorization = req.get('authorization') || '';
    const accessToken = authorization.startsWith('Bearer ')
      ? authorization.slice('Bearer '.length)
      : '';

    if (!accessToken) {
      return sendError(res, 401, 'Sign in to PaperLogix to continue.');
    }

    const { data, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !data.user) {
      return sendError(res, 401, 'Your session has expired. Sign in again.');
    }

    req.user = data.user;
    return next();
  } catch (error) {
    return next(error);
  }
}

function normalizeDealTime(value) {
  const date =
    typeof value === 'number'
      ? new Date(value < 1_000_000_000_000 ? value * 1000 : value)
      : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizeDeals(accountId, deals) {
  return deals.flatMap((deal) => {
    const entryType = String(deal.entryType || '').toUpperCase();
    const dealType = String(deal.type || '').toUpperCase();
    const dealId = deal.id ?? deal.ticket;
    const dealTime = normalizeDealTime(deal.time);

    if (
      dealId === undefined ||
      !dealTime ||
      !entryType.includes('OUT') ||
      (!dealType.includes('BUY') && !dealType.includes('SELL'))
    ) {
      return [];
    }

    return [
      {
        account_id: accountId,
        deal_id: String(dealId),
        symbol: String(deal.symbol || 'Unknown'),
        deal_time: dealTime,
        side: dealType.includes('BUY') ? 'BUY' : 'SELL',
        volume: Number(deal.volume) || 0,
        pnl:
          (Number(deal.profit) || 0) +
          (Number(deal.swap) || 0) +
          (Number(deal.commission) || 0) +
          (Number(deal.fee) || 0),
        setup: 'Unclassified',
        status: 'flag',
        position_id: deal.positionId ? String(deal.positionId) : null,
      },
    ];
  });
}

async function syncMetaApiAccount(accountRow) {
  const account = await metaApi.metatraderAccountApi.getAccount(accountRow.metaapi_account_id);
  const connection = account.getRPCConnection();

  try {
    await connection.connect();
    await connection.waitSynchronized(40);
    const [accountInformation, deals] = await Promise.all([
      connection.getAccountInformation(),
      connection.getDealsByTimeRange(new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), new Date()),
    ]);

    if (
      accountInformation.server &&
      accountInformation.server.toLowerCase() !== allowedMt5Server.toLowerCase()
    ) {
      throw new Error('The connected account server does not match MetaQuotes-Demo.');
    }

    const rows = normalizeDeals(accountRow.id, deals);
    for (let start = 0; start < rows.length; start += 500) {
      const { error } = await supabaseAdmin
        .from('paperlogix_mt5_deals')
        .upsert(rows.slice(start, start + 500), { onConflict: 'account_id,deal_id' });
      if (error) throw error;
    }

    const updatedAt = new Date().toISOString();
    const { data, error } = await supabaseAdmin
      .from('paperlogix_mt5_accounts')
      .update({
        balance: Number(accountInformation.balance) || 0,
        currency: accountInformation.currency || 'USD',
        last_sync: updatedAt,
      })
      .eq('id', accountRow.id)
      .eq('owner_id', accountRow.owner_id)
      .select('id,name,server,balance,currency,last_sync,login_suffix')
      .single();

    if (error) throw error;

    return {
      account: toPublicAccount(data),
      trades: rows.map(toPublicDeal),
    };
  } finally {
    await connection.close();
  }
}

function toPublicAccount(account) {
  return {
    id: account.id,
    name: account.name,
    server: account.server,
    balance: Number(account.balance) || 0,
    currency: account.currency,
    lastSync: account.last_sync || 'Not synced',
    loginSuffix: account.login_suffix,
  };
}

function toPublicDeal(deal) {
  return {
    id: deal.deal_id,
    symbol: deal.symbol,
    date: new Date(deal.deal_time).toLocaleString(),
    side: deal.side,
    volume: `${Number(deal.volume).toFixed(2)} lots`,
    pnl: Number(deal.pnl),
    setup: deal.setup,
    status: deal.status,
    account: deal.account_id,
  };
}

async function findOwnedAccount(userId, accountId) {
  const { data, error } = await supabaseAdmin
    .from('paperlogix_mt5_accounts')
    .select('id,owner_id,metaapi_account_id,name,login_suffix,server,balance,currency,last_sync')
    .eq('id', accountId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

app.get('/api/config', (_req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY,
    configured: configurationReady,
    missingEnvironment,
    integrationError:
      integrationInitializationFailed
        ? 'Server integrations could not initialize. Check the Vercel Node.js runtime and function logs.'
        : null,
  });
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    configured: configurationReady && initializeIntegrations(),
  });
});

app.post(
  '/api/auth/sign-up',
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return sendError(res, 400, 'Enter your email address and password.');
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return sendError(
        res,
        503,
        'Supabase sign-in is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.',
      );
    }

    try {
      supabaseAuthClient ??= require('@supabase/supabase-js').createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data, error } = await supabaseAuthClient.auth.signUp({ email, password });
      if (error) return sendSupabaseAuthError(res, error);
      return res.json({ user: data.user, session: data.session });
    } catch (error) {
      console.error('Supabase sign-up request failed', {
        name: error.name,
        cause: error.cause?.code,
      });
      return sendError(
        res,
        502,
        'PaperLogix could not reach Supabase Auth. Verify that SUPABASE_URL is the Project URL (https://<project-ref>.supabase.co), the project is active, and its Auth service is available.',
      );
    }
  }),
);

app.post(
  '/api/auth/sign-in',
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || '').trim();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return sendError(res, 400, 'Enter your email address and password.');
    }
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
      return sendError(
        res,
        503,
        'Supabase sign-in is not configured. Set SUPABASE_URL and SUPABASE_ANON_KEY in Vercel.',
      );
    }

    try {
      supabaseAuthClient ??= require('@supabase/supabase-js').createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { data, error } = await supabaseAuthClient.auth.signInWithPassword({ email, password });
      if (error) return sendSupabaseAuthError(res, error);
      return res.json({ user: data.user, session: data.session });
    } catch (error) {
      console.error('Supabase sign-in request failed', {
        name: error.name,
        cause: error.cause?.code,
      });
      return sendError(
        res,
        502,
        'PaperLogix could not reach Supabase Auth. Verify that SUPABASE_URL is the Project URL (https://<project-ref>.supabase.co), the project is active, and its Auth service is available.',
      );
    }
  }),
);

app.get(
  '/api/mt5/accounts',
  requireConfiguration,
  requireUser,
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from('paperlogix_mt5_accounts')
      .select('id,name,server,balance,currency,last_sync,login_suffix')
      .eq('owner_id', req.user.id)
      .order('created_at', { ascending: true });

    if (error) throw error;
    res.json({ accounts: data.map(toPublicAccount) });
  }),
);

app.post(
  '/api/mt5/accounts',
  requireConfiguration,
  requireUser,
  connectLimiter,
  asyncRoute(async (req, res) => {
    const login = String(req.body.login || '').trim();
    const password = String(req.body.password || '');
    const server = String(req.body.server || '').trim();

    if (!/^\d{4,16}$/.test(login)) {
      return sendError(res, 400, 'Enter a valid numeric MT5 login.');
    }
    if (password.length < 1 || password.length > 256) {
      return sendError(res, 400, 'Enter your MT5 investor password.');
    }
    if (server !== allowedMt5Server) {
      return sendError(res, 400, `This connection is limited to ${allowedMt5Server}.`);
    }
    if (req.body.demoConfirmed !== true) {
      return sendError(res, 400, 'Confirm that this is your MetaQuotes-Demo account.');
    }

    let providerAccount;
    try {
      providerAccount = await metaApi.metatraderAccountApi.createAccount({
        name: `PaperLogix ${server} · ••••${login.slice(-4)}`,
        type: 'cloud',
        login,
        password,
        server,
        platform: 'mt5',
        magic: 1,
      });
      await providerAccount.deploy();

      const { data, error } = await supabaseAdmin
        .from('paperlogix_mt5_accounts')
        .insert({
          owner_id: req.user.id,
          metaapi_account_id: providerAccount.id,
          name: `${server} · ••••${login.slice(-4)}`,
          login_suffix: login.slice(-4),
          server,
          balance: 0,
          currency: 'USD',
        })
        .select(
          'id,owner_id,metaapi_account_id,name,login_suffix,server,balance,currency,last_sync',
        )
        .single();

      if (error) throw error;

      return res.status(201).json({
        account: toPublicAccount(data),
        trades: [],
        syncPending: true,
        syncWarning: 'Account connected. Starting the first history sync now.',
      });
    } catch (error) {
      if (providerAccount) {
        try {
          await providerAccount.remove();
        } catch (_cleanupError) {
          console.error('Could not remove MetaApi account after an unsuccessful connection.');
        }
      }
      console.error('MetaApi account connection failed', { name: error.name });
      return sendError(
        res,
        502,
        'Could not connect this account. Verify the MT5 investor password and server, then try again.',
      );
    }
  }),
);

app.post(
  '/api/mt5/accounts/:id/sync',
  requireConfiguration,
  requireUser,
  asyncRoute(async (req, res) => {
    const account = await findOwnedAccount(req.user.id, req.params.id);
    if (!account) return sendError(res, 404, 'Demo account not found.');

    try {
      res.json(await syncMetaApiAccount(account));
    } catch (error) {
      console.error('MetaApi history sync failed', { name: error.name });
      return sendError(
        res,
        502,
        'Could not sync this account. Check its MetaApi connection and try again.',
      );
    }
  }),
);

app.delete(
  '/api/mt5/accounts/:id',
  requireConfiguration,
  requireUser,
  asyncRoute(async (req, res) => {
    const account = await findOwnedAccount(req.user.id, req.params.id);
    if (!account) return sendError(res, 404, 'Demo account not found.');

    try {
      const providerAccount = await metaApi.metatraderAccountApi.getAccount(
        account.metaapi_account_id,
      );
      await providerAccount.remove();
    } catch (error) {
      console.error('MetaApi account removal failed', { name: error.name });
      return sendError(res, 502, 'Could not remove the MetaApi connection. Please try again.');
    }

    const { error } = await supabaseAdmin
      .from('paperlogix_mt5_accounts')
      .delete()
      .eq('id', account.id)
      .eq('owner_id', req.user.id);

    if (error) throw error;
    return res.status(204).end();
  }),
);

app.get('/', (_req, res) => {
  res.sendFile(path.join(frontendDirectory, 'index.html'));
});
app.get('/app.js', (_req, res) => {
  res.sendFile(path.join(frontendDirectory, 'app.js'));
});
app.get('/styles.css', (_req, res) => {
  res.sendFile(path.join(frontendDirectory, 'styles.css'));
});

app.use((error, req, res, _next) => {
  console.error('Unhandled PaperLogix API error', {
    method: req.method,
    path: req.path,
    name: error.name,
  });
  if (res.headersSent) return;
  return sendError(res, 500, 'PaperLogix could not complete the request. Please try again.');
});

module.exports = app;
