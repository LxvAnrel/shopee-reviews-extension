const DEFAULT_STATE = {
  running: false,
  stopRequested: false,
  concurrency: 1,
  maxReviews: 0,
  total: 0,
  completed: 0,
  failed: 0,
  active: 0,
  queue: [],
  results: [],
  errors: [],
  logs: [],
  startedAt: null,
  finishedAt: null,
  downloadName: '',
  finishing: false,
  association: {
    running: false,
    handles: [],
    adsTotal: 0,
    scanned: 0,
    active: 0,
    pending: 0,
    matched: [],
    unmatched: [],
    fallbackCandidates: [],
    cancelRequested: false
  }
};

let state = structuredClone(DEFAULT_STATE);
const activeTabs = new Set();

function resetState() {
  state = structuredClone(DEFAULT_STATE);
}

function log(message) {
  const time = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  state.logs = [`${time} - ${message}`, ...state.logs].slice(0, 80);
}

function assertAssociationNotCancelled() {
  if (state.association.cancelRequested) {
    throw new Error('Associacao cancelada pelo usuario.');
  }
}

function getPublicState() {
  return {
    running: state.running,
    stopRequested: state.stopRequested,
    concurrency: state.concurrency,
    maxReviews: state.maxReviews,
    total: state.total,
    completed: state.completed,
    failed: state.failed,
    active: state.active,
    pending: state.queue.length,
    resultsTotal: state.results.length,
    errors: state.errors.slice(-20),
    logs: state.logs,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt,
    downloadName: state.downloadName,
    association: state.association
  };
}

function sanitizeFilename(value) {
  return String(value || 'reviews')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function getHandleFromUrl(url) {
  try {
    const parsed = new URL(url);
    const slug = decodeURIComponent(parsed.pathname.split('/').filter(Boolean).pop() || '');
    const cleaned = slug
      .replace(/-i\.\d+\.\d+$/i, '')
      .replace(/\.[\w-]+$/i, '')
      .trim();
    return sanitizeFilename(cleaned || 'produto');
  } catch (e) {
    return 'produto';
  }
}

function normalizeText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function tokenizeProduct(value) {
  const stopwords = new Set([
    'uvits',
    'produto',
    'produtos',
    'kit',
    'suplemento',
    'suplementos',
    'frasco',
    'sabor',
    'unidade',
    'unidades',
    'ml',
    'mg',
    'mcg',
    'ui',
    'pa'
  ]);

  return normalizeText(value)
    .split(/\s+/)
    .map(token => {
      if (token.length === 1) {
        return ['a', 'b', 'c', 'd', 'e', 'k'].includes(token) ? token : '';
      }
      if (/^b\d+$/.test(token)) return token;
      return token;
    })
    .filter(token => token && !stopwords.has(token));
}

function parseVitaminType(value) {
  const normalized = normalizeText(value);

  const patterns = [
    { type: 'vitamina a', regex: /\bvitamina\s*a\b/ },
    { type: 'vitamina b1', regex: /\bvitamina\s*b1\b/ },
    { type: 'vitamina b2', regex: /\bvitamina\s*b2\b/ },
    { type: 'vitamina b3', regex: /\bvitamina\s*b3\b/ },
    { type: 'vitamina b5', regex: /\bvitamina\s*b5\b/ },
    { type: 'vitamina b6', regex: /\bvitamina\s*b6\b/ },
    { type: 'vitamina b9', regex: /\bvitamina\s*b9\b/ },
    { type: 'vitamina b12', regex: /\bvitamina\s*b12\b/ },
    { type: 'vitamina c', regex: /\bvitamina\s*c\b|\bvitaminac\b|\bvit c\b/ },
    { type: 'vitamina d', regex: /\bvitamina\s*d\b|\bvit d\b/ },
    { type: 'vitamina e', regex: /\bvitamina\s*e\b|\bvit e\b/ },
    { type: 'vitamina k', regex: /\bvitamina\s*k\b|\bvit k\b/ },
    { type: 'vitamina b complexa', regex: /\bvitamina\s*b\s*complexa\b|\bcomplexa\s*b\b|\bb\s*complexa\b/ },
    { type: 'omega 3', regex: /\bomega\s*-?\s*3\b/ },
    { type: 'colageno', regex: /\bcolageno\b/ },
    { type: 'multivitamina', regex: /\bmultivitaminas?\b/ }
  ];

  for (const pattern of patterns) {
    if (pattern.regex.test(normalized)) {
      return pattern.type;
    }
  }

  const genericVitamin = normalized.match(/\bvitamina\b/);
  return genericVitamin ? 'vitamina' : '';
}

function parseVitaminForm(value) {
  const normalized = normalizeText(value);
  if (/\b(liquido|liquida|liquidos|liquidas|gota|gotas|spray|ampola)\b/.test(normalized)) {
    return 'liquido';
  }
  if (/\b(capsula|capsulas|caps|tablete|comprimido|comprimidos)\b/.test(normalized)) {
    return 'capsula';
  }
  if (/\b(po|pó|sache|sachees|saches|granulado|powder)\b/.test(normalized)) {
    return 'po';
  }
  return '';
}

function getProductMeta(value) {
  return {
    type: parseVitaminType(value),
    form: parseVitaminForm(value)
  };
}

function scoreAdForHandle(ad, handle) {
  const handleTokens = tokenizeProduct(handle);
  const titleTokens = new Set(tokenizeProduct(ad.title));
  if (!handleTokens.length || !titleTokens.size) return 0;

  let hits = 0;
  handleTokens.forEach(token => {
    if (titleTokens.has(token)) hits += 1;
  });

  const handleMeta = getProductMeta(handle);
  const titleMeta = getProductMeta(ad.title);

  const normalizedTitle = normalizeText(ad.title);
  const normalizedHandle = normalizeText(handle).replace(/\s+/g, ' ');
  const containsBonus = normalizedTitle.includes(normalizedHandle) ? 0.3 : 0;

  let score = hits / handleTokens.length + containsBonus;

  if (handleMeta.type && titleMeta.type) {
    score += handleMeta.type === titleMeta.type ? 0.25 : -0.25;
  }

  if (handleMeta.form && titleMeta.form) {
    score += handleMeta.form === titleMeta.form ? 0.15 : -0.15;
  }

  return Math.max(0, score);
}

function getAdIdentity(ad) {
  if (ad.shopId && ad.itemId) return `${ad.shopId}.${ad.itemId}`;
  const match = String(ad.url || '').match(/-i\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : String(ad.url || ad.title || '');
}

function getHandleValue(handle) {
  return typeof handle === 'string' ? handle : String(handle?.title || handle?.handle || '').trim();
}

function buildMatchPairs(handles, ads, threshold) {
  const pairs = [];

  handles.forEach(handle => {
    const handleText = getHandleValue(handle);
    ads.forEach(ad => {
      const score = scoreAdForHandle(ad, handle);
      if (score < threshold) return;

      pairs.push({
        handle: handleText,
        ad,
        score,
        reviewCount: Number(ad.reviewCount || 0)
      });
    });
  });

  return pairs.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.reviewCount - a.reviewCount;
  });
}

function matchAdsToHandles(handles, ads) {
  const matches = [];
  const usedHandles = new Set();
  const usedAds = new Set();
  const handleOrder = handles.map(getHandleValue);

  function acceptPairs(pairs, stage) {
    pairs.forEach(pair => {
      const adKey = getAdIdentity(pair.ad);
      if (usedHandles.has(pair.handle) || usedAds.has(adKey)) return;

      usedHandles.add(pair.handle);
      usedAds.add(adKey);
      matches.push({
        handle: pair.handle,
        url: pair.ad.url,
        title: pair.ad.title,
        imageUrl: pair.ad.imageUrl || '',
        reviewCount: Number(pair.ad.reviewCount || 0),
        score: Number(pair.score.toFixed(3)),
        stage
      });
    });
  }

  acceptPairs(buildMatchPairs(handles, ads, 0.42), 'nome');

  const remainingHandles = handles.filter(handle => !usedHandles.has(getHandleValue(handle)));
  const remainingAds = ads.filter(ad => !usedAds.has(getAdIdentity(ad)));
  acceptPairs(buildMatchPairs(remainingHandles, remainingAds, 0.22), 'revisao-comentarios');

  const unmatched = handleOrder.filter(handle => !usedHandles.has(handle));

  return {
    matches: matches.sort((a, b) => handleOrder.indexOf(a.handle) - handleOrder.indexOf(b.handle)),
    unmatched
  };
}

function getTopAdsForUnmatched(unmatched, ads, usedUrls) {
  return unmatched.map(handle => {
    const candidates = ads
      .filter(ad => !usedUrls.has(ad.url))
      .map(ad => ({
        handle,
        url: ad.url,
        title: ad.title,
        imageUrl: ad.imageUrl || '',
        reviewCount: Number(ad.reviewCount || 0),
        score: Number(scoreAdForHandle(ad, handle).toFixed(3))
      }))
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.reviewCount - a.reviewCount;
      })
      .slice(0, 5);

    return { handle, candidates };
  });
}

function attachFallbackCandidates(result, ads) {
  const usedUrls = new Set(result.matches.map(match => match.url));
  return {
    ...result,
    fallbackCandidates: getTopAdsForUnmatched(result.unmatched, ads, usedUrls)
  };
}

function sortAdsByComments(ads) {
  return ads.slice().sort((a, b) => Number(b.reviewCount || 0) - Number(a.reviewCount || 0));
}

function toAssociationLine(match) {
  return `${match.url} | ${match.handle}`;
}

function getAssociationPreview(matches) {
  return matches.map(toAssociationLine).join('\n');
}

function assertUniqueMatches(matches) {
  const seen = new Set();
  return matches.filter(match => {
    const key = getAdIdentity(match);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeAssociationMatches(matches) {
  return assertUniqueMatches(matches).map(match => ({
    handle: match.handle,
    url: match.url,
    title: match.title,
    imageUrl: match.imageUrl || '',
    reviewCount: match.reviewCount || 0,
    score: match.score,
    stage: match.stage
  }));
}

function matchAdsToHandlesWithFallback(handles, ads) {
  const sortedAds = sortAdsByComments(ads);
  const result = matchAdsToHandles(handles, sortedAds);
  result.matches = normalizeAssociationMatches(result.matches);
  result.preview = getAssociationPreview(result.matches);
  return attachFallbackCandidates(result, sortedAds);
}

function normalizeProducts(products) {
  return products
    .map((product, index) => {
      const url = String(product.url || '').trim();
      if (!url) return null;

      return {
        id: `${Date.now()}-${index}`,
        url,
        handle: sanitizeFilename(product.handle || getHandleFromUrl(url))
      };
    })
    .filter(Boolean);
}

function escapeCSV(value) {
  const text = String(value || '');
  return `"${text.replace(/"/g, '""')}"`;
}

function reviewsToCSV(reviews) {
  const headers = [
    'title',
    'body',
    'rating',
    'review_date',
    'reviewer_name',
    'reviewer_email',
    'product_id',
    'product_handle',
    'reply',
    'picture_urls',
    'product_url'
  ];

  const rows = reviews.map(review => [
    '',
    escapeCSV(review.body),
    review.rating || '',
    escapeCSV(review.review_date),
    escapeCSV(review.reviewer_name),
    '',
    '',
    escapeCSV(review.product_handle),
    '',
    escapeCSV(review.picture_urls),
    escapeCSV(review.product_url)
  ].join(','));

  return [headers.join(','), ...rows].join('\n');
}

async function downloadCSV() {
  if (!state.results.length) return;

  const ts = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '').slice(0, 14);
  const filename = `shopee_reviews_lote_${ts}.csv`;
  const csv = reviewsToCSV(state.results);
  const dataUrl = `data:text/csv;charset=utf-8,${encodeURIComponent('\uFEFF' + csv)}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename,
    saveAs: false
  });

  state.downloadName = filename;
}

function waitForTabLoaded(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('Tempo esgotado ao carregar a pagina.'));
    }, timeoutMs);

    function listener(updatedTabId, info) {
      if (updatedTabId !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }

    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then(tab => {
      if (tab.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {});
  });
}

async function sendCollectMessage(tabId, maxReviews) {
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await chrome.tabs.sendMessage(tabId, {
        action: 'collectReviews',
        maxReviews
      });
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error('Nao foi possivel conectar ao coletor da pagina.');
}

async function sendTabMessage(tabId, payload) {
  let lastError = null;

  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      return await chrome.tabs.sendMessage(tabId, payload);
    } catch (error) {
      lastError = error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  throw lastError || new Error('Nao foi possivel conectar ao script da pagina.');
}

async function processProduct(product) {
  let tab = null;

  try {
    tab = await chrome.tabs.create({ url: product.url, active: false });
    activeTabs.add(tab.id);
    await waitForTabLoaded(tab.id);
    await new Promise(resolve => setTimeout(resolve, 1800));

    const response = await sendCollectMessage(tab.id, state.maxReviews);
    if (response?.error) throw new Error(response.error);

    const reviews = (response?.reviews || []).map(review => ({
      ...review,
      product_handle: product.handle,
      product_url: product.url
    }));

    state.results.push(...reviews);
    state.completed += 1;
    log(`${product.handle}: ${reviews.length} reviews coletadas.`);
  } catch (error) {
    state.failed += 1;
    state.errors.push({
      url: product.url,
      handle: product.handle,
      error: error.message || 'Erro desconhecido'
    });
    log(`${product.handle}: erro - ${error.message || 'falha na coleta'}.`);
  } finally {
    if (tab?.id) {
      activeTabs.delete(tab.id);
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {}
    }
  }
}

async function collectShopAdsFromUrl(shopUrl, selectors = {}) {
  let tab = null;

  try {
    assertAssociationNotCancelled();
    tab = await chrome.tabs.create({ url: shopUrl, active: false });
    activeTabs.add(tab.id);
    await waitForTabLoaded(tab.id);
    assertAssociationNotCancelled();
    await new Promise(resolve => setTimeout(resolve, 2500));
    assertAssociationNotCancelled();

    const response = await sendTabMessage(tab.id, {
      action: 'collectShopAds',
      limit: 260,
      selectors
    });

    if (response?.error) throw new Error(response.error);
    return response?.ads || [];
  } finally {
    if (tab?.id) {
      activeTabs.delete(tab.id);
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {}
    }
  }
}

async function enrichAdWithStats(ad) {
  let tab = null;

  try {
    assertAssociationNotCancelled();
    tab = await chrome.tabs.create({ url: ad.url, active: false });
    activeTabs.add(tab.id);
    await waitForTabLoaded(tab.id);
    assertAssociationNotCancelled();
    await new Promise(resolve => setTimeout(resolve, 1800));
    assertAssociationNotCancelled();

    const response = await sendTabMessage(tab.id, {
      action: 'getShopeeReviewStats'
    });

    if (response?.error) throw new Error(response.error);
    return {
      ...ad,
      title: response.title || ad.title,
      imageUrl: ad.imageUrl || '',
      reviewCount: response.reviewCount || 0,
      ratingCounts: response.ratingCounts || null
    };
  } catch (error) {
    return {
      ...ad,
      reviewCount: 0,
      error: error.message || 'Erro ao ler anuncio'
    };
  } finally {
    if (tab?.id) {
      activeTabs.delete(tab.id);
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {}
    }
  }
}

async function enrichAdsWithStats(ads, concurrency) {
  const queue = ads.slice();
  const enriched = [];
  let active = 0;

  state.association.adsTotal = ads.length;
  state.association.pending = queue.length;
  state.association.scanned = 0;
  state.association.active = 0;

  return new Promise(resolve => {
    function pump() {
      if (state.association.cancelRequested) {
        queue.length = 0;
        if (active === 0) resolve(enriched);
        return;
      }

      while (active < concurrency && queue.length) {
        if (state.association.cancelRequested) {
          queue.length = 0;
          break;
        }

        const ad = queue.shift();
        active += 1;
        state.association.active = active;
        state.association.pending = queue.length;

        enrichAdWithStats(ad)
          .then(result => {
            enriched.push(result);
            state.association.scanned += 1;
          })
          .finally(() => {
            active -= 1;
            state.association.active = active;
            state.association.pending = queue.length;

            if (!queue.length && active === 0) {
              resolve(enriched);
              return;
            }

            pump();
          });
      }
    }

    pump();
  });
}

async function collectHandleMetadata(handleObj) {
  const rawProductUrl = String(handleObj.productUrl || '').trim();
  const handleText = String(handleObj.handle || '').trim();

  const isFullUrl = /^https?:\/\//i.test(handleText);
  const productUrl = rawProductUrl || (isFullUrl ? handleText : '');
  const shouldOpen = productUrl || /-i\./.test(handleText);
  if (!shouldOpen) {
    return { ...handleObj, title: handleText, previewHandle: handleText };
  }

  let url = productUrl;
  if (!url) {
    url = `https://shopee.com.br/${handleText}`;
  }

  let tab = null;

  try {
    tab = await chrome.tabs.create({ url, active: false });
    activeTabs.add(tab.id);
    await waitForTabLoaded(tab.id);
    await new Promise(resolve => setTimeout(resolve, 1800));

    const response = await sendTabMessage(tab.id, { action: 'collectProductMeta' });
    if (response?.error) {
      return { ...handleObj, title: handleText, previewHandle: handleText, productUrl: url };
    }

    return {
      ...handleObj,
      title: response.title || handleText,
      imageUrl: response.imageUrl || '',
      productUrl: url,
      previewHandle: handleText
    };
  } catch (error) {
    return { ...handleObj, title: handleText, previewHandle: handleText, productUrl: url };
  } finally {
    if (tab?.id) {
      activeTabs.delete(tab.id);
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {}
    }
  }
}

async function searchShopeeByBrand(brandName, limit = 100) {
  let tab = null;
  try {
    assertAssociationNotCancelled();
    const searchUrl = `https://shopee.com.br/search?keyword=${encodeURIComponent(brandName)}`;
    tab = await chrome.tabs.create({ url: searchUrl, active: false });
    activeTabs.add(tab.id);
    await waitForTabLoaded(tab.id);
    assertAssociationNotCancelled();
    await new Promise(resolve => setTimeout(resolve, 2500));
    assertAssociationNotCancelled();

    const response = await sendTabMessage(tab.id, {
      action: 'collectShopAds',
      limit: limit,
      selectors: {}
    });

    if (response?.error) throw new Error(response.error);
    return response?.ads || [];
  } finally {
    if (tab?.id) {
      activeTabs.delete(tab.id);
      try {
        await chrome.tabs.remove(tab.id);
      } catch (e) {}
    }
  }
}

async function matchAdsToHandles(enrichedHandles, ads) {
  const matched = [];
  const unmatched = [];

  for (const handle of enrichedHandles) {
    const normalized = normalizeText(handle.title || handle.handle);
    let bestMatch = null;
    let bestScore = 0;

    for (const ad of ads) {
      const adNormalized = normalizeText(ad.title || '');
      let score = 0;

      // Score por palavras iguais
      const normalizedWords = normalized.split(/\s+/);
      const adWords = adNormalized.split(/\s+/);
      const commonWords = normalizedWords.filter(w => adWords.includes(w));
      score += commonWords.length * 10;

      // Score por substring
      if (adNormalized.includes(normalized) || normalized.includes(adNormalized)) {
        score += 50;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = ad;
      }
    }

    if (bestMatch && bestScore >= 10) {
      matched.push({
        handle: handle.handle,
        title: bestMatch.title,
        imageUrl: bestMatch.imageUrl,
        url: bestMatch.url,
        reviewCount: bestMatch.reviewCount || 0,
        previewHandle: handle.previewHandle
      });
    } else {
      unmatched.push(handle);
    }
  }

  return { matched, unmatched };
}

async function startAssociation(message) {
  const rawHandles = (message.handles || []).filter(Boolean);
  const handles = rawHandles.map(handle => {
    if (typeof handle === 'string') {
      return { handle: handle.trim(), productUrl: '' };
    }
    return {
      handle: String(handle.handle || '').trim(),
      productUrl: String(handle.productUrl || '').trim()
    };
  }).filter(item => item.handle);
  const concurrency = Math.max(1, Math.min(Number(message.concurrency) || 1, 6));

  if (!handles.length) throw new Error('Cole pelo menos um handle para associar.');

  state.association = {
    running: true,
    handles,
    adsTotal: 0,
    scanned: 0,
    active: 0,
    pending: 0,
    matched: [],
    unmatched: [],
    fallbackCandidates: [],
    cancelRequested: false
  };

  log(`Coletando informacoes de ${handles.length} handles...`);
  assertAssociationNotCancelled();

  // Coleta metadados de cada handle (marca, título, etc)
  const enrichedHandles = await Promise.all(handles.map(handle => collectHandleMetadata(handle)));
  assertAssociationNotCancelled();

  log(`Buscando produtos na Shopee por marca...`);
  const brands = new Set(enrichedHandles.map(h => h.title?.split(/\s+/)[0] || '').filter(Boolean));
  let allAds = [];

  for (const brand of brands) {
    const ads = await searchShopeeByBrand(brand, 120);
    allAds = [...allAds, ...ads];
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  state.association.adsTotal = allAds.length;
  state.association.scanned = allAds.filter(ad => Number(ad.reviewCount || 0) > 0).length;
  log(`${allAds.length} produtos encontrados na Shopee. Fazendo associacao...`);
  assertAssociationNotCancelled();

  // Enriquece anúncios com estatísticas
  const enrichedAds = await enrichAdsWithStats(allAds, concurrency);
  assertAssociationNotCancelled();

  // Faz o matching
  const { matched, unmatched } = await matchAdsToHandles(enrichedHandles, enrichedAds);

  const fallbackCandidates = unmatched.length > 0 ? allAds.slice(0, 10) : [];

  state.association.running = false;
  state.association.matched = matched;
  state.association.unmatched = unmatched;
  state.association.fallbackCandidates = fallbackCandidates;
  log(`${matched.length} handles associados. ${unmatched.length} sem correspondencia.`);

  return { matches: matched, unmatched, fallbackCandidates, ads: enrichedAds };
}

async function finishBatchIfDone() {
  if (!state.running || state.finishing || state.active > 0 || state.queue.length > 0) return;

  state.finishing = true;
  state.running = false;
  state.finishedAt = new Date().toISOString();

  if (state.results.length) {
    await downloadCSV();
    log(`CSV consolidado gerado com ${state.results.length} reviews.`);
  } else {
    log('Finalizado sem reviews coletadas.');
  }

  state.finishing = false;
}

function pumpQueue() {
  if (!state.running || state.stopRequested) {
    finishBatchIfDone();
    return;
  }

  while (state.active < state.concurrency && state.queue.length > 0) {
    const product = state.queue.shift();
    state.active += 1;

    processProduct(product)
      .finally(() => {
        state.active = Math.max(0, state.active - 1);
        pumpQueue();
        finishBatchIfDone();
      });
  }

  finishBatchIfDone();
}

async function stopBatch() {
  state.stopRequested = true;
  state.queue = [];
  log('Parada solicitada. Fechando abas ativas...');

  await Promise.all(Array.from(activeTabs).map(async tabId => {
    try {
      await chrome.tabs.remove(tabId);
    } catch (e) {}
  }));

  activeTabs.clear();
  state.running = false;
  state.finishedAt = new Date().toISOString();
}

async function cancelAssociation() {
  if (!state.association.running) return;

  state.association.cancelRequested = true;
  state.association.running = false;
  state.association.pending = 0;
  log('Associacao cancelada. Fechando abas ativas...');

  await Promise.all(Array.from(activeTabs).map(async tabId => {
    try {
      await chrome.tabs.remove(tabId);
    } catch (e) {}
  }));

  activeTabs.clear();
  state.association.active = 0;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'openManager') {
    chrome.tabs.create({ url: chrome.runtime.getURL('manager.html') });
    sendResponse({ success: true });
    return false;
  }

  if (message.action === 'getBatchStatus') {
    sendResponse(getPublicState());
    return false;
  }

  if (message.action === 'startBatch') {
    if (state.running) {
      sendResponse({ error: 'Ja existe uma coleta em andamento.' });
      return false;
    }

    const products = normalizeProducts(message.products || []);
    if (!products.length) {
      sendResponse({ error: 'Adicione pelo menos uma URL de produto.' });
      return false;
    }

    resetState();
    state.running = true;
    state.concurrency = Math.max(1, Math.min(Number(message.concurrency) || 1, 8));
    state.maxReviews = Math.max(0, Number(message.maxReviews) || 0);
    state.queue = products;
    state.total = products.length;
    state.startedAt = new Date().toISOString();
    log(`Iniciando ${products.length} produtos com ${state.concurrency} paginas por vez.`);

    pumpQueue();
    sendResponse(getPublicState());
    return false;
  }

  if (message.action === 'stopBatch') {
    stopBatch().then(() => sendResponse(getPublicState()));
    return true;
  }

  if (message.action === 'associateShopeeAds') {
    if (state.association.running) {
      sendResponse({ error: 'Ja existe uma associacao em andamento.' });
      return false;
    }

    startAssociation(message)
      .then(result => sendResponse({ success: true, ...result, state: getPublicState() }))
      .catch(error => {
        state.association.running = false;
        state.association.pending = 0;
        state.association.active = 0;
        log(`Erro na associacao: ${error.message || 'falha desconhecida'}.`);
        sendResponse({ error: error.message || 'Erro ao associar anuncios.' });
      });

    return true;
  }

  if (message.action === 'cancelAssociation') {
    cancelAssociation().then(() => sendResponse(getPublicState()));
    return true;
  }
});
