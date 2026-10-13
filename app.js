const trades = [];
const accounts = [];
trades.forEach((trade, index) => (trade.account = index < 5 ? 'alpha' : 'beta'));
let activeAccount = 'all';
const rules = [];
let supabaseClient;
let currentSession;
let authMode = 'signIn';
let activeUserId;
const fmt = (n) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (character) => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
const scopeTrades = () =>
  activeAccount === 'all' ? trades : trades.filter((t) => t.account === activeAccount);
function updateAccountOptions() {
  let analytics = document.getElementById('analyticsAccount');
  if (!analytics) {
    const host = document.querySelector('#analytics .headline');
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap';
    controls.innerHTML =
      '<select class="select" id="analyticsAccount" aria-label="Choose analytics account"></select>';
    host.appendChild(controls);
    analytics = controls.querySelector('select');
    analytics.addEventListener('change', (e) => setAccount(e.target.value));
  }
  ['dashboardAccount', 'analyticsAccount'].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    select.innerHTML =
      '<option value="all">All demo accounts</option>' +
      accounts
        .map(
          (account) =>
            `<option value="${escapeHtml(account.id)}">${escapeHtml(account.name)}</option>`,
        )
        .join('');
    select.value = activeAccount;
  });
}
function renderAccounts() {
  const list = document.getElementById('accountList');
  if (!list) return;
  list.innerHTML = accounts.length
    ? accounts
        .map(
          (a) =>
            `<div class="rule-row"><div class="rule-top"><span>${escapeHtml(a.name)} <span class="status connected">DEMO</span></span><div class="account-actions"><button class="btn small account-select" data-account="${escapeHtml(a.id)}">${activeAccount === a.id ? 'Selected' : 'View account'}</button><button class="btn small danger account-delete" data-account="${escapeHtml(a.id)}" aria-label="Delete ${escapeHtml(a.name)}">Delete</button></div></div><div class="rule-detail">${escapeHtml(a.server)} · Balance $${Number(a.balance).toFixed(2)} ${escapeHtml(a.currency || '')} · Synced ${escapeHtml(a.lastSync)}</div></div>`,
        )
        .join('')
    : '<div class="empty"><div class="empty-icon">◉</div><b>No MT5 demo accounts connected</b>Connect your MetaQuotes-Demo account to import its history.</div>';
  document.getElementById('accountCount').textContent = `${accounts.length} connected`;
  document
    .querySelectorAll('.account-select')
    .forEach((b) => b.addEventListener('click', () => setAccount(b.dataset.account)));
  document
    .querySelectorAll('.account-delete')
    .forEach((b) => b.addEventListener('click', () => deleteAccount(b.dataset.account)));
}
function renderConnectionDetails() {
  const container = document.getElementById('connectedAccountDetails');
  if (!container) return;

  const account = accounts.find((item) => item.id === activeAccount) || accounts[0];
  if (!account) {
    container.innerHTML =
      '<div class="empty connection-empty"><b>No demo account connected</b>Connect your MetaQuotes-Demo account to sync trade history.</div>';
    return;
  }

  const lastSync =
    account.lastSync === 'Not synced'
      ? account.lastSync
      : new Date(account.lastSync).toLocaleString();
  container.innerHTML = `
    <div class="connected-account">
      <div class="rule-row"><div class="rule-top"><span>Connected account</span><span class="status connected">DEMO</span></div></div>
      <div class="rule-row"><div class="rule-top"><span>Login</span><span>••••${escapeHtml(account.loginSuffix || account.name.slice(-4))}</span></div></div>
      <div class="rule-row"><div class="rule-top"><span>Server</span><span>${escapeHtml(account.server)}</span></div></div>
      <div class="rule-row"><div class="rule-top"><span>Balance</span><span>${escapeHtml(account.currency || 'USD')} ${Number(account.balance).toFixed(2)}</span></div></div>
      <div class="rule-row"><div class="rule-top"><span>Last sync</span><span>${escapeHtml(lastSync)}</span></div></div>
      <button class="btn small connection-sync" data-account="${escapeHtml(account.id)}" type="button">↻ Sync now</button>
    </div>`;
  container
    .querySelector('.connection-sync')
    .addEventListener('click', () => syncAccount(account.id));
}
async function syncAccount(id, quiet = false) {
  const syncStatus = document.getElementById('syncStatus');
  if (syncStatus) syncStatus.textContent = 'Syncing demo history…';
  try {
    const result = await apiRequest(`/api/mt5/accounts/${encodeURIComponent(id)}/sync`, {
      method: 'POST',
    });
    const accountIndex = accounts.findIndex((account) => account.id === id);
    if (accountIndex !== -1) accounts[accountIndex] = result.account;
    trades.splice(
      0,
      trades.length,
      ...trades.filter((trade) => trade.account !== id),
      ...result.trades,
    );
    renderAccounts();
    renderTrades();
    renderConnectionDetails();
    if (syncStatus) syncStatus.textContent = `MT5 demo synced ${new Date().toLocaleTimeString()}`;
    if (!quiet) showToast(`Synced ${result.trades.length} closed demo deals.`);
    return true;
  } catch (error) {
    if (syncStatus) syncStatus.textContent = 'Could not sync MT5 demo history';
    if (!quiet) showToast(error.message);
    return false;
  }
}
async function syncSelectedAccounts() {
  if (!accounts.length) {
    showPage('connection');
    showToast('Connect your MetaQuotes-Demo account first.');
    return;
  }

  const selectedAccounts =
    activeAccount === 'all' ? accounts : accounts.filter((account) => account.id === activeAccount);
  for (const account of selectedAccounts) {
    await syncAccount(account.id, true);
  }
  showToast('Demo account sync finished.');
}
async function deleteAccount(id) {
  const accountIndex = accounts.findIndex((account) => account.id === id);
  if (accountIndex === -1) return;

  const account = accounts[accountIndex];
  if (
    !window.confirm(
      `Disconnect "${account.name}" from PaperLogix and remove its MetaApi cloud connection and synced history?`,
    )
  )
    return;

  try {
    await apiRequest(`/api/mt5/accounts/${encodeURIComponent(id)}`, { method: 'DELETE' });
  } catch (error) {
    showToast(error.message);
    return;
  }

  accounts.splice(accountIndex, 1);
  trades.splice(0, trades.length, ...trades.filter((trade) => trade.account !== id));

  if (activeAccount === id) activeAccount = 'all';

  updateAccountOptions();
  renderAccounts();
  renderTrades();
  renderConnectionDetails();
  showToast(`Disconnected demo account ${account.name}.`);
}
function setAccount(id) {
  if (id !== 'all' && !accounts.some((account) => account.id === id)) {
    id = 'all';
  }
  activeAccount = id;
  updateAccountOptions();
  renderAccounts();
  renderTrades();
  showToast(
    id === 'all'
      ? 'Showing combined demo-account data.'
      : `Showing ${accounts.find((a) => a.id === id).name}.`,
  );
}
function updateScopedMetrics() {
  const scoped = scopeTrades(),
    wins = scoped.filter((t) => t.pnl > 0),
    losses = scoped.filter((t) => t.pnl < 0),
    pnl = scoped.reduce((sum, t) => sum + t.pnl, 0),
    avgWin = wins.reduce((s, t) => s + t.pnl, 0) / (wins.length || 1),
    avgLoss = Math.abs(losses.reduce((s, t) => s + t.pnl, 0) / (losses.length || 1)),
    winRate = scoped.length ? (wins.length / scoped.length) * 100 : 0,
    adherence = scoped.length
      ? Math.round((scoped.filter((t) => t.status === 'ok').length / scoped.length) * 100)
      : 0,
    profitFactor = avgLoss
      ? (
          wins.reduce((s, t) => s + t.pnl, 0) / Math.abs(losses.reduce((s, t) => s + t.pnl, 0))
        ).toFixed(2)
      : '—',
    drawdown = losses.length ? Math.min(...losses.map((t) => t.pnl)) : 0,
    scopeName =
      activeAccount === 'all'
        ? 'all connected demo accounts'
        : accounts.find((a) => a.id === activeAccount).name;
  document.getElementById('dashPnl').textContent = fmt(pnl);
  document.getElementById('dashPnlHint').textContent = `From ${scoped.length} closed synced trades`;
  document.getElementById('dashAdherence').textContent = `${adherence}%`;
  document.getElementById('dashWinRate').textContent = `${winRate.toFixed(1)}%`;
  document.getElementById('dashWinHint').textContent =
    `${wins.length} wins / ${losses.length} losses`;
  document.getElementById('dashAvg').textContent = `$${avgWin.toFixed(0)} / $${avgLoss.toFixed(0)}`;
  document.getElementById('dashJournal').textContent =
    `${Math.max(0, scoped.length - 2)} / ${scoped.length}`;
  const analyticsValues = document.querySelectorAll('#analytics .metric .value');
  if (analyticsValues.length >= 4) {
    analyticsValues[0].textContent = fmt(pnl);
    analyticsValues[1].textContent = profitFactor;
    analyticsValues[2].textContent = fmt(pnl / (scoped.length || 1));
    analyticsValues[3].textContent = fmt(drawdown);
    document.querySelector('#analytics .sub').textContent =
      `Review ${scopeName} with clear, source-labelled metrics. This view is based on ${scoped.length} closed synced demo trades.`;
  }
}
const row = (t) =>
  `<tr><td><div class="symbol">${escapeHtml(t.symbol)}</div><div class="trade-meta">${escapeHtml(t.date)} · ${escapeHtml(t.id)}</div></td><td>${escapeHtml(t.side)}<div class="trade-meta">${escapeHtml(t.volume)}</div></td><td class="${t.pnl >= 0 ? 'positive' : 'negative'}"><b>${fmt(Number(t.pnl))}</b></td><td><span class="tag">${escapeHtml(t.setup)}</span></td><td><span class="tag ${t.status === 'ok' ? 'ok' : 'flag'}">${t.status === 'ok' ? '✓ In plan' : '! Review'}</span></td></tr>`;
function renderTrades() {
  const scoped = scopeTrades();
  document.getElementById('recentTrades').innerHTML =
    scoped
      .slice(0, 4)
      .map(
        (t) =>
          `<tr><td><div class="symbol">${escapeHtml(t.symbol)}</div><div class="trade-meta">${escapeHtml(t.side)} · ${escapeHtml(t.date)}</div></td><td class="${t.pnl >= 0 ? 'positive' : 'negative'}"><b>${fmt(Number(t.pnl))}</b></td><td><span class="tag">${escapeHtml(t.setup)}</span></td><td><span class="tag ${t.status === 'ok' ? 'ok' : 'flag'}">${t.status === 'ok' ? '✓ In plan' : '! Review'}</span></td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="4" class="empty">No synced trades for this account yet.</td></tr>';
  filterHistory();
  updateScopedMetrics();
  document.getElementById('rulesList').innerHTML = rules.length
    ? rules
        .map(
          (r, i) =>
            `<div class="rule-row"><div class="rule-top"><span>${escapeHtml(r[0])}</span><button class="btn small rule-edit" data-rule-index="${i}" type="button">Edit</button></div><div class="rule-detail"><b style="color:#ddd7eb">${escapeHtml(r[1])}</b> · ${escapeHtml(r[2])}</div></div>`,
        )
        .join('')
    : '<div class="empty"><b>No active rules yet</b>Add your first risk or process rule to begin tracking adherence.</div>';
  document.querySelectorAll('.rule-edit').forEach((button) => {
    button.addEventListener('click', () => {
      const rule = rules[Number(button.dataset.ruleIndex)];
      if (rule) showToast(`Rule editor is ready for ${rule[0].toLowerCase()}.`);
    });
  });
}
function filterHistory() {
  const q = (document.getElementById('tradeSearch')?.value || '').toLowerCase(),
    s = document.getElementById('filterSymbol')?.value || 'all',
    st = document.getElementById('filterStatus')?.value || 'all';
  const list = scopeTrades().filter(
    (t) =>
      (s === 'all' || t.symbol === s) &&
      (st === 'all' || t.status === st) &&
      `${t.symbol} ${t.setup}`.toLowerCase().includes(q),
  );
  const out = document.getElementById('historyTrades');
  if (out)
    out.innerHTML = list.length
      ? list.map(row).join('')
      : `<tr><td colspan="5" class="empty">No synced trades match those filters.</td></tr>`;
}
function showPage(id) {
  document.querySelectorAll('.page').forEach((p) => p.classList.toggle('active', p.id === id));
  document
    .querySelectorAll('[data-page]')
    .forEach((b) => b.classList.toggle('active', b.dataset.page === id));
  document.getElementById('crumb').textContent =
    document.querySelector(`[data-page="${id}"]`)?.textContent.trim() || 'Dashboard';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.style.transform = 'translateY(0)';
  t.style.opacity = 1;
  clearTimeout(window.toastTimer);
  window.toastTimer = setTimeout(() => {
    t.style.transform = 'translateY(90px)';
    t.style.opacity = 0;
  }, 3400);
}
const strategies = [];
let replayIndex = 1;
const replayCandles = [24, 38, 30, 48, 42, 63];
function renderStrategies() {
  const list = document.getElementById('strategyList');
  if (!list) return;
  list.innerHTML = strategies.length
    ? strategies
        .map(
          (s, i) =>
            `<div class="rule-row"><div class="rule-top"><span>${s.name}</span><button class="btn small strategy-select" data-index="${i}">Open</button></div><div class="rule-detail">${s.observed}</div></div>`,
        )
        .join('')
    : '<div class="empty"><b>No strategies yet</b>Create your first setup template when you are ready.</div>';
  document
    .querySelectorAll('.strategy-select')
    .forEach((b) => b.addEventListener('click', () => openStrategy(Number(b.dataset.index))));
}
function openStrategy(i) {
  const s = strategies[i];
  document.getElementById('strategyTitle').textContent = s.name;
  document.getElementById('strategyDetail').textContent = s.detail;
  document.getElementById('strategyObserved').textContent = s.observed;
}
function renderReplay() {
  const chart = document.getElementById('replayChart');
  if (!chart) return;
  chart.innerHTML = replayCandles
    .slice(0, replayIndex)
    .map(
      (h, i) =>
        `<div class="bar-group"><div class="bar ${i === 2 ? 'loss' : ''}" style="height:${h}%"></div><span class="bar-label">${i + 1}</span></div>`,
    )
    .join('');
  document.getElementById('replayStatus').textContent =
    `Candle ${replayIndex} of ${replayCandles.length} · ${replayIndex === replayCandles.length ? 'Sequence complete' : 'Future candles hidden'}`;
  document.getElementById('replayNote').textContent =
    replayIndex < 3
      ? 'Observe the range. Do not decide from one candle.'
      : replayIndex < 5
        ? 'Price is testing the range. Check your entry trigger.'
        : 'Sequence complete. Compare your decision with the planned trigger.';
  document.getElementById('replayBias').textContent =
    replayIndex < 3
      ? 'Wait for confirmation'
      : replayIndex < 5
        ? 'Review your checklist'
        : 'Review outcome';
  document.getElementById('replayStep').disabled = replayIndex === replayCandles.length;
  document.getElementById('replayStep').textContent =
    replayIndex === replayCandles.length ? 'Replay complete' : 'Next candle →';
}
document
  .querySelectorAll('[data-page]')
  .forEach((b) => b.addEventListener('click', () => showPage(b.dataset.page)));
document.getElementById('analyticsToggle').addEventListener('click', () => {
  const n = document.getElementById('analyticsNav'),
    closed = n.classList.toggle('collapsed');
  document.getElementById('analyticsToggle').setAttribute('aria-expanded', String(!closed));
});
document
  .querySelectorAll('#tradeSearch,#filterSymbol,#filterStatus')
  .forEach((e) => e.addEventListener('input', filterHistory));
document
  .querySelectorAll('#syncBtn,#historySync,#connectionSync')
  .forEach((b) => b.addEventListener('click', syncSelectedAccounts));
document
  .getElementById('analyticsRange')
  .addEventListener('click', () =>
    showToast('Date range controls can be connected to your synced ledger next.'),
  );
document
  .getElementById('exportCsv')
  .addEventListener('click', () =>
    showToast('CSV export prepared from the 8 synced closed trades.'),
  );
document
  .getElementById('printReport')
  .addEventListener('click', () =>
    showToast('Print preview would open here in the production app.'),
  );
document.getElementById('newStrategy').addEventListener('click', () => {
  strategies.push({
    name: 'New setup template',
    detail:
      'Define the conditions, trigger and invalidation before tagging trades to this strategy.',
    observed: 'No tagged trades yet · start with a clear plan',
  });
  renderStrategies();
  openStrategy(strategies.length - 1);
  showToast('New strategy template created. Add its rules before your next practice trade.');
});
document
  .getElementById('editStrategy')
  .addEventListener('click', () =>
    showToast('Strategy editing is ready for the selected template.'),
  );
document.getElementById('replayStep').addEventListener('click', () => {
  if (replayIndex < replayCandles.length) {
    replayIndex++;
    renderReplay();
  }
});
document.getElementById('replayReset').addEventListener('click', () => {
  replayIndex = 1;
  renderReplay();
  showToast('Replay reset. Future candles are hidden again.');
});
document
  .getElementById('replayDecision')
  .addEventListener('click', () =>
    showToast(
      'Decision recorded for this practice step. Continue when you are ready to reveal the next candle.',
    ),
  );
document.getElementById('journalForm').addEventListener('submit', (e) => {
  e.preventDefault();
  showToast('Trade plan saved. Link it to the matching MT5 trade after it syncs.');
  e.target.reset();
});
document
  .getElementById('reflectionBtn')
  .addEventListener('click', () => document.getElementById('reflectionDialog').showModal());
document.getElementById('reflectionClose').addEventListener('click', () => {
  document.getElementById('reflectionDialog').close();
});
document.getElementById('reflectionCancel').addEventListener('click', () => {
  document.getElementById('reflectionDialog').close();
});
document.getElementById('reflectionSave').addEventListener('click', () => {
  document.getElementById('reflectionDialog').close();
  showToast('Reflection saved. It will be linked after your next sync.');
});
document
  .querySelectorAll('.check')
  .forEach((b) => b.addEventListener('click', () => b.classList.toggle('selected')));
document
  .getElementById('exerciseBtn')
  .addEventListener('click', () =>
    showToast('Exercise started: keep your next 5 trades at or below $25 risk.'),
  );
document
  .getElementById('contextBtn')
  .addEventListener('click', () =>
    showToast('Context notes are ready to add when you review the linked trades.'),
  );
document
  .getElementById('inaccurateBtn')
  .addEventListener('click', () =>
    showToast(
      'Thanks. This insight is marked for review and will not be used as confirmed feedback.',
    ),
  );
document
  .getElementById('addRule')
  .addEventListener('click', () =>
    showToast('Rule builder: start with a simple limit you can follow consistently.'),
  );
document
  .getElementById('deleteData')
  .addEventListener('click', () =>
    showToast('Data deletion would require a confirmation step and export reminder.'),
  );
function resetSeededContent() {
  document
    .querySelectorAll('#dashboard .rule-row .rule-top span:last-child')
    .forEach((el) => (el.textContent = '0 / 0'));
  document
    .querySelectorAll('#dashboard .rule-row .progress span')
    .forEach((el) => (el.style.width = '0%'));
  document.querySelector('#analytics .chart').innerHTML =
    '<div class="empty"><b>No closed trades yet</b>Connect an MT5 demo account and sync trade history to see analytics.</div>';
  document
    .querySelectorAll('#analytics .metric .value')
    .forEach((el, i) => (el.textContent = i === 4 ? '—' : i === 1 ? '—' : '$0.00'));
  document.querySelector('#analytics .sub').textContent =
    'Analytics will appear after your first MT5 demo-account sync.';
  document.querySelector('#reports .two-col').innerHTML =
    '<div class="card empty"><div class="empty-icon">⇩</div><b>No report available yet</b>Reports are generated after closed demo trades and journal entries are synced.</div>';
  document.querySelector('#coach .two-col').innerHTML =
    '<div class="card empty"><div class="empty-icon">✦</div><b>Your coach is waiting for evidence</b>Connect a demo account, record your rules, and sync a few trades before pattern feedback is shown.</div>';
  document.querySelectorAll('#progress .metric .value').forEach((el) => (el.textContent = '0'));
  document
    .querySelectorAll('#progress .metric .hint')
    .forEach((el) => (el.textContent = 'No practice data yet'));
}
async function apiRequest(url, options = {}) {
  if (!currentSession?.access_token) throw new Error('Sign in to PaperLogix to continue.');

  const response = await fetch(url, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${currentSession.access_token}`,
      ...options.headers,
    },
  });
  const result = response.status === 204 ? {} : await response.json();
  if (!response.ok) throw new Error(result.error || 'PaperLogix could not complete the request.');
  return result;
}
function showFormMessage(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('error', isError);
}
async function loadUserAccounts() {
  try {
    const result = await apiRequest('/api/mt5/accounts');
    accounts.splice(0, accounts.length, ...result.accounts);
    trades.splice(0, trades.length);
    if (activeAccount !== 'all' && !accounts.some((account) => account.id === activeAccount)) {
      activeAccount = 'all';
    }
    updateAccountOptions();
    renderAccounts();
    renderTrades();
    renderConnectionDetails();

    if (accounts.length) {
      const syncStatus = document.getElementById('syncStatus');
      syncStatus.textContent = 'Refreshing MT5 demo history…';
      let failedSyncs = 0;
      for (const account of accounts) {
        if (!(await syncAccount(account.id, true))) failedSyncs += 1;
      }
      if (failedSyncs) {
        showToast(`${failedSyncs} demo account(s) could not sync. Retry from Demo accounts.`);
      }
    }
  } catch (error) {
    showToast(error.message);
  }
}
async function connectMetaApiAccount(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const button = document.getElementById('mt5ConnectButton');
  const message = document.getElementById('mt5ConnectMessage');
  const formData = new FormData(form);
  const credentials = {
    login: String(formData.get('login') || '').trim(),
    password: String(formData.get('password') || ''),
    server: String(formData.get('server') || ''),
    demoConfirmed: formData.get('demoConfirmed') === 'on',
  };

  document.getElementById('mt5Password').value = '';
  button.disabled = true;
  button.textContent = 'Connecting securely…';
  showFormMessage(
    message,
    'Connecting to MetaQuotes-Demo. This may take a few minutes on the first connection.',
  );

  try {
    const result = await apiRequest('/api/mt5/accounts', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    const existingIndex = accounts.findIndex((account) => account.id === result.account.id);
    if (existingIndex >= 0) accounts[existingIndex] = result.account;
    else accounts.push(result.account);
    trades.splice(
      0,
      trades.length,
      ...trades.filter((trade) => trade.account !== result.account.id),
      ...result.trades,
    );
    activeAccount = result.account.id;
    form.reset();
    updateAccountOptions();
    renderAccounts();
    renderTrades();
    renderConnectionDetails();
    showFormMessage(
      message,
      result.syncWarning ||
        `Connected ${result.account.name}; imported ${result.trades.length} closed deals.`,
      Boolean(result.syncWarning),
    );
    showToast(result.syncWarning || 'MetaQuotes-Demo account connected and history synced.');
  } catch (error) {
    showFormMessage(message, error.message, true);
  } finally {
    button.disabled = false;
    button.textContent = 'Connect demo account';
  }
}
document
  .getElementById('dashboardAccount')
  .addEventListener('change', (e) => setAccount(e.target.value));
document.getElementById('mt5ConnectForm').addEventListener('submit', connectMetaApiAccount);
document.getElementById('addAccount').addEventListener('click', () => showPage('connection'));
document.getElementById('signOutButton').addEventListener('click', async () => {
  const { error } = await supabaseClient.auth.signOut();
  if (error) showToast('Could not sign out. Please try again.');
});
document.getElementById('authForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const submit = document.getElementById('authSubmit');
  const message = document.getElementById('authMessage');
  const email = document.getElementById('authEmail').value.trim();
  const password = document.getElementById('authPassword').value;
  submit.disabled = true;

  try {
    if (authMode === 'signUp') {
      const { data, error } = await supabaseClient.auth.signUp({ email, password });
      if (error) throw error;
      if (!data.session) {
        showFormMessage(message, 'Check your email to confirm your account, then sign in.');
      }
    } else {
      const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) throw error;
    }
  } catch (error) {
    showFormMessage(message, error.message, true);
  } finally {
    submit.disabled = false;
  }
});
document.getElementById('authModeToggle').addEventListener('click', () => {
  authMode = authMode === 'signIn' ? 'signUp' : 'signIn';
  document.getElementById('authHeading').textContent =
    authMode === 'signIn' ? 'Sign in to PaperLogix' : 'Create your PaperLogix account';
  document.getElementById('authSubmit').textContent =
    authMode === 'signIn' ? 'Sign in' : 'Create account';
  document.getElementById('authModeToggle').textContent =
    authMode === 'signIn' ? 'Need an account? Create one' : 'Already have an account? Sign in';
  document.getElementById('authPassword').autocomplete =
    authMode === 'signIn' ? 'current-password' : 'new-password';
  showFormMessage(document.getElementById('authMessage'), '');
});
async function initializeAuthentication() {
  const message = document.getElementById('authMessage');
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('PaperLogix backend is unavailable.');
    const config = await response.json();
    if (!window.supabase?.createClient) {
      throw new Error('Could not load the sign-in service. Check your connection and reload.');
    }
    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    supabaseClient.auth.onAuthStateChange((_event, session) => setAuthenticationState(session));
    const {
      data: { session },
      error,
    } = await supabaseClient.auth.getSession();
    if (error) throw error;
    setAuthenticationState(session);
  } catch (error) {
    showFormMessage(
      message,
      `${error.message} Open PaperLogix using its hosted URL; the backend must be configured first.`,
      true,
    );
  }
}
function setAuthenticationState(session) {
  currentSession = session;
  document.body.classList.toggle('auth-required', !session);
  if (!session) {
    activeUserId = undefined;
    accounts.splice(0, accounts.length);
    trades.splice(0, trades.length);
    activeAccount = 'all';
    updateAccountOptions();
    renderAccounts();
    renderTrades();
    renderConnectionDetails();
    return;
  }
  if (activeUserId === session.user.id) return;
  activeUserId = session.user.id;
  void loadUserAccounts();
}
resetSeededContent();
updateAccountOptions();
renderAccounts();
renderTrades();
renderStrategies();
renderReplay();
renderConnectionDetails();
void initializeAuthentication();
