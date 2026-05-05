const productsEl = document.getElementById('products');
const maxReviewsEl = document.getElementById('maxReviews');
const concurrencyEl = document.getElementById('concurrency');
const shopeeShopUrlEl = document.getElementById('shopeeShopUrl');
const associateEl = document.getElementById('associate');
const cancelAssociationEl = document.getElementById('cancelAssociation');
const startEl = document.getElementById('start');
const stopEl = document.getElementById('stop');
const saveEl = document.getElementById('save');
const previewEl = document.getElementById('preview');
const previewSummaryEl = document.getElementById('previewSummary');
const previewRowsEl = document.getElementById('previewRows');
const unmatchedPreviewEl = document.getElementById('unmatchedPreview');
const applyPreviewEl = document.getElementById('applyPreview');
const addPreviewAssociationEl = document.getElementById('addPreviewAssociation');
const copyPreviewEl = document.getElementById('copyPreview');
const clearPreviewEl = document.getElementById('clearPreview');
const statusTextEl = document.getElementById('statusText');
const logsEl = document.getElementById('logs');
const progressBarEl = document.getElementById('progressBar');
const statTotalEl = document.getElementById('statTotal');
const statDoneEl = document.getElementById('statDone');
const statActiveEl = document.getElementById('statActive');
const statPendingEl = document.getElementById('statPending');
const statReviewsEl = document.getElementById('statReviews');

let pollTimer = null;
let previewLines = '';
let previewMatches = [];
let previewUnmatched = [];
let editingPreviewIndex = -1;

function escapeHTML(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderImagePreview(match) {
  if (!match.imageUrl && !match.shopImageUrl) return '<div class="no-image">Sem imagem</div>';

  const shoopingImg = match.imageUrl
    ? `<div class="product-preview-image"><img src="${escapeHTML(match.imageUrl)}" alt="Shopee"><span>Shopee</span></div>`
    : '';
  const shopImg = match.shopImageUrl
    ? `<div class="product-preview-image"><img src="${escapeHTML(match.shopImageUrl)}" alt="Loja"><span>Loja</span></div>`
    : '';

  if (shoopingImg && shopImg) {
    return `<div class="product-preview-images">${shoopingImg}${shopImg}</div>`;
  }

  return shoopingImg || shopImg || '<div class="no-image">Sem imagem</div>';
}

function parseProductLines(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('|').map(part => part.trim());
      const urlMatch = parts[0].match(/https:\/\/shopee\.com\.br\/\S+/i);

      return {
        url: urlMatch ? urlMatch[0] : parts[0],
        handle: parts[1] || ''
      };
    })
    .filter(product => /^https:\/\/shopee\.com\.br\//i.test(product.url));
}

function extractHandleFromUrl(url) {
  try {
    const parsed = new URL(url.trim());
    const parts = parsed.pathname.split('/').filter(Boolean);
    const productIndex = parts.findIndex(part => part.toLowerCase() === 'products');
    if (productIndex >= 0 && parts.length > productIndex + 1) {
      return parts[productIndex + 1];
    }
    return parts.length ? parts[parts.length - 1] : '';
  } catch (e) {
    return url.trim();
  }
}

function parseHandles(text) {
  return text
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const parts = line.split('|').map(part => part.trim());
      let productUrl = '';
      let handle = '';

      if (parts.length > 1) {
        if (/^https?:\/\//i.test(parts[0])) {
          productUrl = parts[0];
          handle = parts[1];
        } else if (/^https?:\/\//i.test(parts[1])) {
          productUrl = parts[1];
          handle = parts[0];
        } else {
          handle = parts[1] || parts[0];
        }
      } else {
        const maybe = parts[0];
        if (/^https?:\/\//i.test(maybe)) {
          productUrl = maybe;
          handle = extractHandleFromUrl(maybe);
        } else {
          handle = maybe;
        }
      }

      return {
        handle: handle.trim(),
        productUrl: productUrl.trim()
      };
    })
    .filter(item => item.handle);
}

function setStatus(text) {
  statusTextEl.textContent = text;
}

function renderPreview(matches = [], unmatched = []) {
  previewMatches = matches;
  previewUnmatched = unmatched;
  previewLines = matches.map(match => `${match.url} | ${match.handle}`).join('\n');

  previewEl.classList.toggle('active', Boolean(matches.length || unmatched.length));
  previewSummaryEl.textContent = `${matches.length} associados. ${unmatched.length} sem correspondencia.`;
  previewRowsEl.innerHTML = matches.map((match, index) => {
    const isEditing = index === editingPreviewIndex;
    if (isEditing) {
      return `
        <tr>
          <td><input class="preview-edit-input" id="previewHandle${index}" value="${escapeHTML(match.handle)}" placeholder="Handle Shopify"></td>
          <td>
            <div class="product-preview">
              ${renderImagePreview(match)}
              <div>
                <input class="preview-edit-input" id="previewUrl${index}" value="${escapeHTML(match.url)}" placeholder="URL Shopee">
                <input class="preview-edit-input" id="previewTitle${index}" value="${escapeHTML(match.title || '')}" placeholder="Título do anúncio">
              </div>
            </div>
          </td>
          <td><input class="preview-edit-input" id="previewReviewCount${index}" type="number" min="0" value="${Number(match.reviewCount || 0)}"></td>
          <td><input class="preview-edit-input" id="previewScore${index}" value="${escapeHTML(match.score ?? '')}" placeholder="Score"></td>
          <td><input class="preview-edit-input" id="previewStage${index}" value="${escapeHTML(match.stage || '')}" placeholder="Etapa"></td>
          <td class="cell-actions">
            <button class="secondary" data-action="save" data-index="${index}">Salvar</button>
            <button class="danger" data-action="cancel">Cancelar</button>
          </td>
        </tr>
      `;
    }

    return `
      <tr>
        <td>${escapeHTML(match.handle)}</td>
        <td>
          <div class="product-preview">
            ${renderImagePreview(match)}
            <div>
              <a class="product-preview-title" href="${escapeHTML(match.url)}" target="_blank" rel="noreferrer">${escapeHTML(match.title || match.url)}</a>
              <div class="hint">${escapeHTML(match.url)}</div>
            </div>
          </div>
        </td>
        <td>${Number(match.reviewCount || 0)}</td>
        <td class="score">${escapeHTML(match.score ?? '')}</td>
        <td>${escapeHTML(match.stage || '')}</td>
        <td class="cell-actions">
          <button class="secondary" data-action="edit" data-index="${index}">Editar</button>
          <button class="danger" data-action="delete" data-index="${index}">Excluir</button>
        </td>
      </tr>
    `;
  }).join('');

  unmatchedPreviewEl.textContent = unmatched.length
    ? `Sem correspondencia:\n${unmatched.join('\n')}`
    : '';
}

function savePreviewMatch(index) {
  const urlInput = document.getElementById(`previewUrl${index}`);
  const handleInput = document.getElementById(`previewHandle${index}`);
  const titleInput = document.getElementById(`previewTitle${index}`);
  const reviewCountInput = document.getElementById(`previewReviewCount${index}`);
  const scoreInput = document.getElementById(`previewScore${index}`);
  const stageInput = document.getElementById(`previewStage${index}`);

  if (!urlInput || !handleInput) return;

  const url = urlInput.value.trim();
  const handle = handleInput.value.trim();
  const title = titleInput?.value.trim() || url;
  const reviewCount = Number(reviewCountInput?.value) || 0;
  const score = scoreInput?.value.trim() || '';
  const stage = stageInput?.value.trim() || 'manual';

  if (!url || !handle) {
    setStatus('URL e handle são obrigatórios para salvar a associação.');
    return;
  }

  previewMatches[index] = {
    ...previewMatches[index],
    url,
    handle,
    title,
    reviewCount,
    score,
    stage
  };

  editingPreviewIndex = -1;
  renderPreview(previewMatches, previewUnmatched);
  setStatus('Associação editada.');
}

function beginEditPreviewMatch(index) {
  editingPreviewIndex = index;
  renderPreview(previewMatches, previewUnmatched);
}

function cancelEditPreviewMatch() {
  editingPreviewIndex = -1;
  renderPreview(previewMatches, previewUnmatched);
}

function deletePreviewMatch(index) {
  previewMatches.splice(index, 1);
  if (editingPreviewIndex === index) {
    editingPreviewIndex = -1;
  } else if (editingPreviewIndex > index) {
    editingPreviewIndex -= 1;
  }
  renderPreview(previewMatches, previewUnmatched);
  setStatus('Associação removida.');
}

function addPreviewAssociation() {
  previewMatches = [
    ...previewMatches,
    {
      handle: '',
      url: '',
      title: '',
      imageUrl: '',
      reviewCount: 0,
      score: '',
      stage: 'manual'
    }
  ];
  editingPreviewIndex = previewMatches.length - 1;
  renderPreview(previewMatches, previewUnmatched);
  previewEl.classList.add('active');
  setStatus('Nova associação adicionada. Preencha os campos e clique em Salvar.');
}

function handlePreviewRowClick(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;

  const action = button.getAttribute('data-action');
  const index = Number(button.getAttribute('data-index'));

  if (action === 'edit') {
    beginEditPreviewMatch(index);
  } else if (action === 'delete') {
    deletePreviewMatch(index);
  } else if (action === 'save') {
    savePreviewMatch(index);
  } else if (action === 'cancel') {
    cancelEditPreviewMatch();
  }
}

previewRowsEl.addEventListener('click', handlePreviewRowClick);

function applyPreviewToList() {
  if (!previewLines) {
    setStatus('Nenhum preview para aplicar.');
    return;
  }

  productsEl.value = previewLines;
  saveSettings();
  setStatus('Preview aplicado na lista.');
}

function renderState(state) {
  const total = state.total || 0;
  const done = (state.completed || 0) + (state.failed || 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  statTotalEl.textContent = total;
  statDoneEl.textContent = state.completed || 0;
  statActiveEl.textContent = state.active || 0;
  statPendingEl.textContent = state.pending || 0;
  statReviewsEl.textContent = state.resultsTotal || 0;
  progressBarEl.style.width = `${percent}%`;

  startEl.disabled = Boolean(state.running || state.association?.running);
  stopEl.disabled = !state.running;
  associateEl.disabled = Boolean(state.running || state.association?.running);
  cancelAssociationEl.disabled = !state.association?.running;

  if (state.running) {
    setStatus(`Coletando... ${percent}% concluido. Abas simultaneas: ${state.concurrency}.`);
  } else if (state.association?.running) {
    const association = state.association;
    setStatus(`Associando anuncios... ${association.scanned}/${association.adsTotal} lidos.`);
  } else if (state.downloadName) {
    setStatus(`Finalizado. Arquivo baixado: ${state.downloadName}`);
  } else if (state.failed) {
    setStatus('Finalizado com erros. Veja o registro abaixo.');
  } else {
    setStatus('Pronto para iniciar.');
  }

  logsEl.textContent = state.logs && state.logs.length ? state.logs.join('\n') : 'Sem atividade ainda.';
}

function requestStatus() {
  chrome.runtime.sendMessage({ action: 'getBatchStatus' }, renderState);
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  requestStatus();
  pollTimer = setInterval(requestStatus, 1000);
}

function saveSettings() {
  chrome.storage.local.set({
    managerProducts: productsEl.value,
    managerMaxReviews: maxReviewsEl.value,
    managerConcurrency: concurrencyEl.value,
    managerShopeeShopUrl: shopeeShopUrlEl.value
  });
}

function loadSettings() {
  chrome.storage.local.get([
    'managerProducts',
    'managerMaxReviews',
    'managerConcurrency',
    'managerShopeeShopUrl'
  ], data => {
    productsEl.value = data.managerProducts || '';
    maxReviewsEl.value = data.managerMaxReviews || '100';
    concurrencyEl.value = data.managerConcurrency || '1';
    shopeeShopUrlEl.value = data.managerShopeeShopUrl || shopeeShopUrlEl.value;
  });
}

associateEl.addEventListener('click', () => {
  const handles = parseHandles(productsEl.value);

  if (!handles.length) {
    setStatus('Cole pelo menos um handle para associar.');
    return;
  }

  associateEl.disabled = true;
  startEl.disabled = true;
  setStatus('Coletando informações e buscando na Shopee...');
  saveSettings();
  startPolling();

  chrome.runtime.sendMessage({
    action: 'associateShopeeAds',
    shopUrl: shopeeShopUrlEl.value,
    handles,
    concurrency: Number(concurrencyEl.value) || 1
  }, response => {
    associateEl.disabled = false;
    startEl.disabled = false;
    cancelAssociationEl.disabled = true;

    if (response?.error) {
      setStatus(response.error);
      return;
    }

    const matches = response.matches || [];
    const unmatchedList = response.unmatched || [];
    renderPreview(matches, unmatchedList);
    const unmatched = response.unmatched?.length ? ` ${response.unmatched.length} sem correspondencia.` : '';
    setStatus(`${matches.length} produtos associados.${unmatched} Confira o preview.`);
    requestStatus();
  });
});

cancelAssociationEl.addEventListener('click', () => {
  cancelAssociationEl.disabled = true;
  setStatus('Cancelando associacao...');

  chrome.runtime.sendMessage({ action: 'cancelAssociation' }, response => {
    if (response) renderState(response);
    setStatus('Associacao cancelada.');
  });
});

applyPreviewEl.addEventListener('click', applyPreviewToList);

copyPreviewEl.addEventListener('click', async () => {
  if (!previewLines) {
    setStatus('Nenhum texto direto para copiar.');
    return;
  }

  try {
    await navigator.clipboard.writeText(previewLines);
    setStatus('Texto direto copiado.');
  } catch (e) {
    setStatus('Nao foi possivel copiar automaticamente. Use Aplicar na lista.');
  }
});

clearPreviewEl.addEventListener('click', () => {
  editingPreviewIndex = -1;
  renderPreview([], []);
  previewEl.classList.remove('active');
  setStatus('Preview limpo.');
});

addPreviewAssociationEl.addEventListener('click', addPreviewAssociation);

startEl.addEventListener('click', () => {
  const products = parseProductLines(productsEl.value);

  if (!products.length) {
    setStatus('Adicione pelo menos uma URL valida da Shopee.');
    return;
  }

  saveSettings();

  chrome.runtime.sendMessage({
    action: 'startBatch',
    products,
    maxReviews: Number(maxReviewsEl.value) || 0,
    concurrency: Number(concurrencyEl.value) || 1
  }, response => {
    if (response?.error) {
      setStatus(response.error);
      return;
    }

    renderState(response);
    startPolling();
  });
});

stopEl.addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'stopBatch' }, response => {
    if (response) renderState(response);
  });
});

saveEl.addEventListener('click', () => {
  saveSettings();
  setStatus('Lista e configuracoes salvas.');
});

loadSettings();
startPolling();
