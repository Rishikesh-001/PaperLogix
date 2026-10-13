const trades = [];
const accounts = [];
trades.forEach((trade, index) => (trade.account = index < 5 ? 'alpha' : 'beta'));
let activeAccount = 'all';
const rules = [];
const fmt = (n) => `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
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
      accounts.map((a) => `<option value="${a.id}">${a.name}</option>`).join('');
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
            `<div class="rule-row"><div class="rule-top"><span>${a.name} <span class="status connected">DEMO</span></span><div class="account-actions"><button class="btn small account-select" data-account="${a.id}">${activeAccount === a.id ? 'Selected' : 'View account'}</button><button class="btn small danger account-delete" data-account="${a.id}" aria-label="Delete ${a.name}">Delete</button></div></div><div class="rule-detail">${a.server} · Balance $${a.balance.toFixed(2)} · Synced ${a.lastSync}</div></div>`,
        )
        .join('')
    : '<div class="empty"><div class="empty-icon">◉</div><b>No MT5 demo accounts connected</b>Add an account, then use the local connector to import its first history.</div>';
  document.getElementById('accountCount').textContent = `${accounts.length} connected`;
  document
    .querySelectorAll('.account-select')
    .forEach((b) => b.addEventListener('click', () => setAccount(b.dataset.account)));
  document
    .querySelectorAll('.account-delete')
    .forEach((b) => b.addEventListener('click', () => deleteAccount(b.dataset.account)));
}
function deleteAccount(id) {
  const accountIndex = accounts.findIndex((account) => account.id === id);
  if (accountIndex === -1) return;

  const account = accounts[accountIndex];
  if (
    !window.confirm(
      `Delete demo account "${account.name}" and its synced trades from this session?`,
    )
  )
    return;

  accounts.splice(accountIndex, 1);
  trades.splice(0, trades.length, ...trades.filter((trade) => trade.account !== id));

  if (activeAccount === id) activeAccount = 'all';

  updateAccountOptions();
  renderAccounts();
  renderTrades();
  showToast(`Deleted demo account ${account.name}.`);
}
function setAccount(id) {
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
  `<tr><td><div class="symbol">${t.symbol}</div><div class="trade-meta">${t.date} · ${t.id}</div></td><td>${t.side}<div class="trade-meta">${t.volume}</div></td><td class="${t.pnl >= 0 ? 'positive' : 'negative'}"><b>${fmt(t.pnl)}</b></td><td><span class="tag">${t.setup}</span></td><td><span class="tag ${t.status === 'ok' ? 'ok' : 'flag'}">${t.status === 'ok' ? '✓ In plan' : '! Review'}</span></td></tr>`;
function renderTrades() {
  const scoped = scopeTrades();
  document.getElementById('recentTrades').innerHTML =
    scoped
      .slice(0, 4)
      .map(
        (t) =>
          `<tr><td><div class="symbol">${t.symbol}</div><div class="trade-meta">${t.side} · ${t.date}</div></td><td class="${t.pnl >= 0 ? 'positive' : 'negative'}"><b>${fmt(t.pnl)}</b></td><td><span class="tag">${t.setup}</span></td><td><span class="tag ${t.status === 'ok' ? 'ok' : 'flag'}">${t.status === 'ok' ? '✓ In plan' : '! Review'}</span></td></tr>`,
      )
      .join('') ||
    '<tr><td colspan="4" class="empty">No synced trades for this account yet.</td></tr>';
  filterHistory();
  updateScopedMetrics();
  document.getElementById('rulesList').innerHTML = rules.length
    ? rules
        .map(
          (r, i) =>
            `<div class="rule-row"><div class="rule-top"><span>${r[0]}</span><button class="btn small" onclick="showToast('Rule editor is ready for ${r[0].toLowerCase()}.')">Edit</button></div><div class="rule-detail"><b style="color:#ddd7eb">${r[1]}</b> · ${r[2]}</div></div>`,
        )
        .join('')
    : '<div class="empty"><b>No active rules yet</b>Add your first risk or process rule to begin tracking adherence.</div>';
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
  .forEach((b) =>
    b.addEventListener('click', () =>
      showToast('Sync started. MT5 data will refresh after records are processed.'),
    ),
  );
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
  .addEventListener('click', () => reflectionDialog.showModal());
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
  .getElementById('disconnectBtn')
  .addEventListener('click', () =>
    showToast('Disconnect requires confirmation in a production account flow.'),
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
  document.querySelector('#connection .two-col').innerHTML =
    '<div class="card empty"><div class="empty-icon">◉</div><b>No demo account connected</b>Use Demo accounts to add your first read-only MT5 demo connection.</div>';
}
async function connectLocalMt5() {
  const button = document.getElementById('connectLocalMt5');
  if (button) {
    button.disabled = true;
    button.textContent = 'Checking MT5…';
  }
  try {
    const health = await fetch('http://127.0.0.1:8766/health');
    const healthData = await health.json();
    if (!health.ok) throw new Error(healthData.error || 'Local MT5 connector is unavailable.');
    if (
      !confirm(
        'Confirm that the active MT5 terminal account is a DEMO account. PaperLogix will import read-only account and closed-deal data.',
      )
    )
      throw new Error('Demo-account confirmation is required before importing.');
    if (button) button.textContent = 'Importing demo history…';
    const response = await fetch('http://127.0.0.1:8766/sync', { method: 'POST' });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Sync failed.');
    const idx = accounts.findIndex((a) => a.id === data.account.id);
    data.account.demoConfirmed = true;
    if (idx >= 0) accounts[idx] = data.account;
    else accounts.push(data.account);
    trades.splice(
      0,
      trades.length,
      ...data.trades.map((t) => ({ ...t, account: data.account.id })),
    );
    activeAccount = data.account.id;
    updateAccountOptions();
    renderAccounts();
    renderTrades();
    showToast(`Imported ${data.trades.length} closed demo deals from MT5.`);
  } catch (error) {
    showToast(error.message || 'Could not connect to the local MT5 connector.');
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = 'Connect local MT5 demo';
    }
  }
}
document.addEventListener('click', (e) => {
  if (e.target.id === 'connectLocalMt5') connectLocalMt5();
});
document
  .getElementById('dashboardAccount')
  .addEventListener('change', (e) => setAccount(e.target.value));
document.getElementById('addAccount').addEventListener('click', () => {
  const id = `account-${accounts.length + 1}`;
  accounts.push({
    id,
    name: `New demo account · ${String(30000000 + accounts.length * 711).slice(-8)}`,
    server: 'Awaiting local MT5 connector',
    balance: 0,
    lastSync: 'Not synced',
  });
  updateAccountOptions();
  renderAccounts();
  showToast(
    'Demo account added. Run the local MT5 connector to complete its first read-only sync.',
  );
});
resetSeededContent();
document.querySelector('#connection .two-col').innerHTML =
  '<div class="card empty"><div class="empty-icon">◉</div><b>Connect your running MT5 demo terminal</b><p class="caption" style="margin:8px auto 16px;max-width:440px">Start the local connector on this computer, keep MT5 open and signed in to a demo account, then import read-only account and closed-deal data.</p><button class="btn primary" id="connectLocalMt5">Connect local MT5 demo</button></div>';
updateAccountOptions();
renderAccounts();
renderTrades();
renderStrategies();
renderReplay();
