(function () {
  if (document.getElementById('__shopee_rv_host')) return;

  const host = document.createElement('div');
  host.id = '__shopee_rv_host';
  host.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-end;gap:8px;';
  document.body.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:Arial,Helvetica,sans-serif}
      .fab{width:52px;height:52px;border-radius:50%;background:#ee4d2d;color:#fff;font-weight:700;font-size:13px;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);display:flex;align-items:center;justify-content:center;letter-spacing:-.5px}
      .panel{width:420px;max-height:520px;background:#fff;border-radius:12px;box-shadow:0 8px 32px rgba(0,0,0,.18);display:flex;flex-direction:column;overflow:hidden;font-size:13px}
      .panel-header{background:#ee4d2d;color:#fff;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
      .panel-title{font-weight:700;font-size:14px}
      .hbtns{display:flex;gap:6px}
      .hbtns button{background:rgba(255,255,255,.22);border:none;color:#fff;border-radius:4px;width:24px;height:24px;cursor:pointer;font-size:15px;line-height:1;display:flex;align-items:center;justify-content:center}
      .stats{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:#e1e5ea;border-bottom:1px solid #e1e5ea;flex-shrink:0}
      .stat{background:#fff;padding:7px 4px;text-align:center}
      .stat span{display:block;font-size:9px;color:#6b7280;margin-bottom:2px;text-transform:uppercase}
      .stat strong{font-size:15px;color:#202124}
      .bar-wrap{height:3px;background:#e1e5ea;flex-shrink:0}
      .bar-fill{height:100%;background:#ee4d2d;transition:width .3s}
      .body{overflow-y:auto;flex:1}
      table{width:100%;border-collapse:collapse;font-size:11px}
      th{background:#f9fafb;color:#6b7280;font-size:9px;text-transform:uppercase;padding:6px 8px;text-align:left;border-bottom:1px solid #e9edf2;position:sticky;top:0}
      td{padding:6px 8px;border-bottom:1px solid #f3f4f6;vertical-align:middle;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .badge{display:inline-block;border-radius:3px;padding:1px 6px;font-size:9px;font-weight:700;color:#fff}
      .badge-pending{background:#6b7280}.badge-active{background:#2563eb}.badge-done{background:#16a34a}.badge-failed{background:#dc2626}.badge-skipped{background:#d97706}
      .btn-retry{background:#fee2e2;color:#dc2626;border:none;border-radius:4px;padding:2px 7px;font-size:9px;font-weight:700;cursor:pointer;white-space:nowrap}
      .btn-retry:hover{background:#fecaca}
      .footer{padding:8px 12px;border-top:1px solid #e1e5ea;display:flex;align-items:center;gap:8px;flex-shrink:0}
      .status-txt{flex:1;font-size:11px;color:#6b7280;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .btn-dl{background:#16a34a;color:#fff;border:none;border-radius:5px;padding:5px 12px;font-size:11px;font-weight:700;cursor:pointer;white-space:nowrap}
      .btn-dl:disabled{background:#d1d5db;color:#9ca3af;cursor:not-allowed}
      .empty{padding:28px;text-align:center;color:#9ca3af;font-size:12px}
      .err-txt{display:block;color:#dc2626;font-size:9px;margin-top:2px;white-space:normal}
    </style>

    <div id="panel" style="display:none">
      <div class="panel-header">
        <span class="panel-title">Shopee Reviews</span>
        <div class="hbtns">
          <button id="min-btn" title="Minimizar">−</button>
          <button id="close-btn" title="Fechar">×</button>
        </div>
      </div>
      <div class="stats">
        <div class="stat"><span>Total</span><strong id="s-total">0</strong></div>
        <div class="stat"><span>Concluídos</span><strong id="s-done">0</strong></div>
        <div class="stat"><span>Ativos</span><strong id="s-active">0</strong></div>
        <div class="stat"><span>Pendentes</span><strong id="s-pending">0</strong></div>
        <div class="stat"><span>Reviews</span><strong id="s-reviews">0</strong></div>
      </div>
      <div class="bar-wrap"><div class="bar-fill" id="s-bar" style="width:0%"></div></div>
      <div class="body">
        <div class="empty" id="s-empty">Nenhuma coleta ativa.</div>
        <table id="s-table" style="display:none">
          <thead><tr><th>Handle</th><th>Status</th><th>Reviews</th><th></th></tr></thead>
          <tbody id="s-tbody"></tbody>
        </table>
      </div>
      <div class="footer">
        <span class="status-txt" id="s-status">Pronto.</span>
        <button class="btn-dl" id="s-dl" disabled>⬇ CSV</button>
      </div>
    </div>

    <button class="fab" id="fab">SR</button>
  `;

  const panel = shadow.getElementById('panel');
  const fab   = shadow.getElementById('fab');
  const minBtn   = shadow.getElementById('min-btn');
  const closeBtn = shadow.getElementById('close-btn');
  const sTotal   = shadow.getElementById('s-total');
  const sDone    = shadow.getElementById('s-done');
  const sActive  = shadow.getElementById('s-active');
  const sPending = shadow.getElementById('s-pending');
  const sReviews = shadow.getElementById('s-reviews');
  const sBar     = shadow.getElementById('s-bar');
  const sEmpty   = shadow.getElementById('s-empty');
  const sTable   = shadow.getElementById('s-table');
  const sTbody   = shadow.getElementById('s-tbody');
  const sStatus  = shadow.getElementById('s-status');
  const sDl      = shadow.getElementById('s-dl');

  const STATUS_MAP = {
    pending: ['badge-pending','Pendente'],
    active:  ['badge-active', 'Coletando'],
    done:    ['badge-done',   'Concluído'],
    failed:  ['badge-failed', 'Erro'],
    skipped: ['badge-skipped','Pulado']
  };

  function esc(v) {
    return String(v||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  let pollTimer = null;
  let open = false;

  function show() {
    open = true;
    panel.style.display = 'flex';
    fab.style.display = 'none';
    poll();
    pollTimer = setInterval(poll, 1000);
  }

  function hide() {
    open = false;
    panel.style.display = 'none';
    fab.style.display = 'flex';
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function poll() {
    chrome.runtime.sendMessage({ action: 'getBatchStatus' }, state => {
      if (chrome.runtime.lastError || !state) return;
      render(state);
    });
  }

  function render(state) {
    const total   = state.total || 0;
    const finished = (state.completed||0) + (state.failed||0);
    const pct     = total > 0 ? Math.round((finished/total)*100) : 0;

    sTotal.textContent   = total;
    sDone.textContent    = state.completed || 0;
    sActive.textContent  = state.active || 0;
    sPending.textContent = state.pending || 0;
    sReviews.textContent = state.resultsTotal || 0;
    sBar.style.width     = pct + '%';

    sDl.disabled = state.running || !(state.resultsTotal > 0);

    if (state.running) {
      sStatus.textContent = 'Coletando... ' + pct + '%';
    } else if (state.finishedAt) {
      sStatus.textContent = 'Finalizado. ' + (state.resultsTotal||0) + ' reviews.';
    } else {
      sStatus.textContent = 'Pronto.';
    }

    const list = state.productList || [];
    if (!list.length) {
      sEmpty.style.display  = 'block';
      sTable.style.display  = 'none';
      return;
    }

    sEmpty.style.display = 'none';
    sTable.style.display = 'table';

    sTbody.innerHTML = list.map(p => {
      const [cls, label] = STATUS_MAP[p.status] || STATUS_MAP.pending;
      const retryBtn = p.status === 'failed'
        ? `<button class="btn-retry" data-url="${esc(p.url)}">↻</button>`
        : '';
      return `<tr>
        <td title="${esc(p.url)}">${esc(p.handle)}</td>
        <td>
          <span class="badge ${cls}">${label}</span>
          ${p.error ? `<span class="err-txt">${esc(p.error)}</span>` : ''}
        </td>
        <td>${p.reviews||0}</td>
        <td>${retryBtn}</td>
      </tr>`;
    }).join('');
  }

  sTbody.addEventListener('click', e => {
    const btn = e.target.closest('[data-url]');
    if (!btn) return;
    btn.disabled = true;
    chrome.runtime.sendMessage({ action: 'retryProduct', url: btn.getAttribute('data-url') }, () => poll());
  });

  sDl.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'downloadCSV' }, () => poll());
  });

  fab.addEventListener('click', show);
  minBtn.addEventListener('click', hide);
  closeBtn.addEventListener('click', hide);
})();
