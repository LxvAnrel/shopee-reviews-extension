function getProductIds() {
  const match = window.location.href.match(/i\.(\d+)\.(\d+)/);
  if (match) return { shopId: match[1], itemId: match[2] };
  return null;
}

function getProductTitle() {
  const titleEl = document.querySelector('h1, .WBVL_7, .product-briefing .attM6y');
  return titleEl ? titleEl.innerText.trim() : document.title.replace('| Shopee Brasil', '').trim();
}

function getProductMainImageUrl() {
  const selectors = [
    '.product-briefing img',
    '.shopee-product-hero-image img',
    '.flexible-image img',
    'img.shopee-image',
    'img'
  ];

  for (const selector of selectors) {
    const img = document.querySelector(selector);
    if (img && img.src) {
      const url = getImageUrl(img);
      if (url) return url;
    }
  }

  return '';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function prepareReviewsSection() {
  for (let i = 0; i < 18; i++) {
    if (document.querySelector('.q2b7Oq') || document.querySelector('.product-rating-overview__filters')) {
      return true;
    }

    window.scrollBy({ top: Math.max(500, window.innerHeight * 0.75), behavior: 'smooth' });
    await sleep(700);
  }

  return Boolean(document.querySelector('.q2b7Oq') || document.querySelector('.product-rating-overview__filters'));
}

function isVisible(el) {
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const style = window.getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
}

function parseSrcset(srcset) {
  if (!srcset) return '';

  const candidates = srcset
    .split(',')
    .map(part => part.trim().split(/\s+/))
    .filter(parts => parts[0])
    .map(parts => ({ url: parts[0], size: Number(parts[1]?.replace(/[^0-9]/g, '')) || 0 }));

  const best = candidates.sort((a, b) => b.size - a.size)[0];
  return best ? best.url : '';
}

function normalizeShopeeImageUrl(url) {
  if (!url) return '';
  let normalized = String(url).trim();

  if (normalized.includes('://') && normalized.match(/\.(jpg|jpeg|png|webp)(\?|$)/i)) {
    normalized = normalized.replace(/_tn\.(jpg|jpeg|png|webp)(\?|$)/i, '.$1$2');
    normalized = normalized.replace(/_75x75\.(jpg|jpeg|png|webp)(\?|$)/i, '.$1$2');
    normalized = normalized.replace(/_100x100\.(jpg|jpeg|png|webp)(\?|$)/i, '.$1$2');
    normalized = normalized.replace(/_200x200\.(jpg|jpeg|png|webp)(\?|$)/i, '.$1$2');
    normalized = normalized.replace(/\?x-oss-process=.*$/, '');
  }

  return normalized;
}

function getImageUrl(el) {
  if (!el) return '';

  const imageCandidates = [];
  const img = el.nodeName === 'IMG' ? el : el.querySelector('img');

  if (img) {
    imageCandidates.push(img.currentSrc, img.src, img.getAttribute('src'), img.getAttribute('data-src'));
    imageCandidates.push(parseSrcset(img.getAttribute('srcset')));
    imageCandidates.push(parseSrcset(img.getAttribute('data-srcset')));
  }

  imageCandidates.push(el.currentSrc, el.src, el.getAttribute('src'), el.getAttribute('data-src'));
  imageCandidates.push(parseSrcset(el.getAttribute('srcset')));
  imageCandidates.push(parseSrcset(el.getAttribute('data-srcset')));

  for (const candidate of imageCandidates) {
    if (candidate) {
      const normalized = normalizeShopeeImageUrl(candidate);
      if (normalized) return normalized;
    }
  }

  const backgroundImage = window.getComputedStyle(el).backgroundImage;
  const match = backgroundImage.match(/url\(["']?(.*?)["']?\)/);
  return normalizeShopeeImageUrl(match ? match[1] : '');
}

function getReviewDate(text) {
  return (text || '').split('|')[0].trim();
}

function getReviewKey(review) {
  return [
    review.reviewer_name,
    review.rating,
    review.review_date,
    review.body,
    review.picture_urls
  ].join('|');
}

function reviewHasMedia(review) {
  return Boolean(review.picture_urls);
}

function getReviewsSignature() {
  return Array.from(document.querySelectorAll('.q2b7Oq'))
    .map(el => el.innerText.trim())
    .join('||');
}

function getRatingCountsFromOverview() {
  const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const filters = document.querySelectorAll('.product-rating-overview__filter');

  filters.forEach(filter => {
    const text = filter.innerText || '';
    const match = text.match(/([1-5])\s*estrela\s*\(([\d.,]+)\)/i);
    if (!match) return;

    const rating = Number(match[1]);
    const count = Number(match[2].replace(/\D/g, ''));
    if (rating >= 1 && rating <= 5 && Number.isFinite(count)) {
      counts[rating] = count;
    }
  });

  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  return total > 0 ? counts : null;
}

function getRatingTotalFromOverview() {
  const counts = getRatingCountsFromOverview();
  if (!counts) return 0;
  return Object.values(counts).reduce((sum, count) => sum + count, 0);
}

function getRatingAverage(counts) {
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const stars = [1, 2, 3, 4, 5].reduce((sum, rating) => sum + (rating * counts[rating]), 0);
  return total > 0 ? stars / total : 0;
}

function getQuotaTotal(quotas) {
  return Object.values(quotas).reduce((sum, count) => sum + count, 0);
}

function getQuotaStars(quotas) {
  return [1, 2, 3, 4, 5].reduce((sum, rating) => sum + (rating * quotas[rating]), 0);
}

function calculateRatingQuotas(requestedTotal, counts) {
  const availableTotal = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const targetTotal = Math.min(requestedTotal, availableTotal);
  const sourceAverage = getRatingAverage(counts);
  const targetStars = Math.round(sourceAverage * targetTotal);
  const quotas = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const remainders = [];

  [1, 2, 3, 4, 5].forEach(rating => {
    const rawQuota = targetTotal * counts[rating] / availableTotal;
    quotas[rating] = Math.min(counts[rating], Math.floor(rawQuota));
    remainders.push({ rating, remainder: rawQuota - quotas[rating] });
  });

  remainders
    .sort((a, b) => b.remainder - a.remainder)
    .forEach(({ rating }) => {
      if (getQuotaTotal(quotas) < targetTotal && quotas[rating] < counts[rating]) {
        quotas[rating] += 1;
      }
    });

  let guard = 0;
  while (getQuotaStars(quotas) !== targetStars && guard < 1000) {
    guard += 1;
    const currentStars = getQuotaStars(quotas);
    const needsLowerAverage = currentStars > targetStars;
    let bestMove = null;

    [1, 2, 3, 4, 5].forEach(from => {
      if (quotas[from] <= 0) return;

      [1, 2, 3, 4, 5].forEach(to => {
        if (from === to || quotas[to] >= counts[to]) return;
        const delta = to - from;
        if (needsLowerAverage && delta >= 0) return;
        if (!needsLowerAverage && delta <= 0) return;

        const nextDiff = Math.abs((currentStars + delta) - targetStars);
        const currentDiff = Math.abs(currentStars - targetStars);
        if (nextDiff > currentDiff) return;

        const move = { from, to, nextDiff, distance: Math.abs(delta) };
        if (!bestMove || move.nextDiff < bestMove.nextDiff || move.distance < bestMove.distance) {
          bestMove = move;
        }
      });
    });

    if (!bestMove) break;
    quotas[bestMove.from] -= 1;
    quotas[bestMove.to] += 1;
  }

  return quotas;
}

function findRatingFilter(rating) {
  const filters = Array.from(document.querySelectorAll('.product-rating-overview__filter'));
  return filters.find(filter => {
    const text = filter.innerText || '';
    return new RegExp(`\\b${rating}\\s*estrela\\b`, 'i').test(text);
  }) || null;
}

async function clickRatingFilter(rating) {
  const filter = findRatingFilter(rating);
  if (!filter) return false;

  const previousSignature = getReviewsSignature();
  filter.scrollIntoView({ behavior: 'smooth', block: 'center' });
  await sleep(400);
  filter.click();
  await waitForReviewsChange(previousSignature, 10, 400);
  await sleep(800);
  return true;
}

function getReviewsArea() {
  const firstReview = document.querySelector('.q2b7Oq');
  let node = firstReview ? firstReview.parentElement : null;

  while (node && node !== document.body) {
    const hasReviews = node.querySelectorAll('.q2b7Oq').length > 0;
    const hasPagination = node.querySelector('.shopee-icon-button--right, button[aria-label*="next" i]');
    if (hasReviews && hasPagination) return node;
    node = node.parentElement;
  }

  return document;
}

function extractMediaUrlsFromExpandedModal() {
  const mediaUrls = [];

  // Procura containers de mídia na modal expandida
  const zoomedContainers = document.querySelectorAll('.rating-media-list__zoomed-image, [class*="media"][class*="zoom"], .modal-image-container, [class*="carousel"]');

  for (const container of zoomedContainers) {
    if (!container.offsetParent) continue; // Verifica se é visível

    // Extrai vídeos
    const videos = container.querySelectorAll('video[src]');
    videos.forEach(video => {
      const src = video.getAttribute('src');
      if (src && !mediaUrls.includes(src)) mediaUrls.push(src);
    });

    // Extrai imagens de <picture>
    const pictures = container.querySelectorAll('picture');
    pictures.forEach(picture => {
      const source = picture.querySelector('source[srcset]');
      if (source) {
        const srcset = source.getAttribute('srcset');
        const bestUrl = parseSrcset(srcset);
        if (bestUrl && !mediaUrls.includes(bestUrl)) {
          mediaUrls.push(normalizeShopeeImageUrl(bestUrl));
        }
      } else {
        const img = picture.querySelector('img[src]');
        if (img) {
          const url = getImageUrl(img);
          if (url && !mediaUrls.includes(url)) mediaUrls.push(url);
        }
      }
    });

    // Extrai imagens diretas <img>
    const imgs = container.querySelectorAll('img[src]');
    imgs.forEach(img => {
      const url = getImageUrl(img);
      if (url && !mediaUrls.includes(url)) mediaUrls.push(url);
    });
  }

  return mediaUrls;
}

async function extractMediaUrlsWithExpand(reviewEl) {
  const mediaUrls = [];

  // Procura elemento de mídia clicável (thumbnail)
  const mediaContainer = reviewEl.querySelector('[class*="media"], .rating-image-list, .review-image-wrapper');
  const mediaImages = reviewEl.querySelectorAll('.rating-image-list img, [class*="media"] img, .review-image img');

  if (!mediaImages.length) return [];

  // Clica na primeira imagem para abrir a modal
  const firstImage = mediaImages[0];
  if (firstImage) {
    const clickableParent = firstImage.closest('button') || firstImage.closest('[role="button"]') || firstImage.closest('div[style*="cursor"]') || firstImage;

    if (clickableParent) {
      clickableParent.scrollIntoView({ behavior: 'smooth', block: 'center' });
      await sleep(300);
      clickableParent.click();
      await sleep(800);

      // Extrai URLs da modal aberta
      mediaUrls.push(...extractMediaUrlsFromExpandedModal());

      // Tenta fechar a modal (ESC ou botão de fechar)
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape' }));
      await sleep(400);
    }
  }

  // Se não conseguiu abrir ou extrair, tenta diretamente do thumbnail
  if (!mediaUrls.length) {
    mediaImages.forEach(img => {
      const url = getImageUrl(img);
      if (url && !mediaUrls.includes(url)) mediaUrls.push(url);
    });
  }

  return mediaUrls;
}

async function coletarReviewsDOM(maxReviews = 0) {
  const reviews = [];
  const items = document.querySelectorAll('.q2b7Oq');

  for (const el of items) {
    if (maxReviews > 0 && reviews.length >= maxReviews) break;

    try {
      const nameEl = el.querySelector('.InK5kS');
      const reviewer_name = nameEl ? nameEl.innerText.trim() : '';

      const stars = el.querySelectorAll('svg.YBGCRA');
      const rating = stars.length || '';

      const dateEl = el.querySelector('.XYk98l');
      const review_date = dateEl ? getReviewDate(dateEl.innerText) : '';

      const bodyEl = el.querySelector('.YNedDV');
      const body = bodyEl ? bodyEl.innerText.trim() : '';

      // Extrai URLs de mídia (abre modal para pegar qualidade maior)
      const mediaUrls = await extractMediaUrlsWithExpand(el);
      const picture_urls = mediaUrls.join(', ');

      if (body || reviewer_name) {
        reviews.push({ reviewer_name, rating, review_date, body, picture_urls, has_media: Boolean(picture_urls) });
      }
    } catch (e) {}
  }

  return reviews;
}

function getNextReviewsButton() {
  const area = getReviewsArea();
  const lastReview = Array.from(document.querySelectorAll('.q2b7Oq')).filter(isVisible).pop();
  const lastReviewBottom = lastReview ? lastReview.getBoundingClientRect().bottom : 0;
  const rawCandidates = Array.from(area.querySelectorAll([
    'button.shopee-icon-button.shopee-icon-button--right',
    'button.shopee-icon-button--right',
    '.shopee-icon-button--right',
    'button[aria-label*="next" i]',
    'svg.icon-arrow-right',
    'svg.shopee-svg-icon.icon-arrow-right'
  ].join(',')));

  const candidates = rawCandidates
    .map(el => el.closest('button') || el)
    .filter((button, index, list) => list.indexOf(button) === index);

  const enabledButtons = candidates.filter(button => {
    const className = button.className || '';
    const disabledByClass = String(className).includes('disabled');
    const disabledByAttr = button.disabled || button.getAttribute('aria-disabled') === 'true';
    return isVisible(button) && !disabledByClass && !disabledByAttr;
  });

  const buttonsAfterReviews = enabledButtons
    .filter(button => button.getBoundingClientRect().top >= lastReviewBottom - 10)
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

  return buttonsAfterReviews[0] || enabledButtons[enabledButtons.length - 1] || null;
}

async function waitForReviewsChange(previousSignature, attempts = 30, interval = 500) {
  for (let i = 0; i < attempts; i++) {
    await sleep(interval);
    const currentSignature = getReviewsSignature();
    if (currentSignature && currentSignature !== previousSignature) return true;
  }

  return false;
}

async function coletarTodasPaginas(maxReviews = 0) {
  const collected = [];
  const seen = new Set();
  const maxPages = 200;

  for (let page = 1; page <= maxPages; page++) {
    const remaining = maxReviews > 0 ? maxReviews - collected.length : 0;
    const pageReviews = await coletarReviewsDOM(remaining);

    pageReviews.forEach(review => {
      const key = getReviewKey(review);
      if (!seen.has(key)) {
        seen.add(key);
        collected.push(review);
      }
    });

    if (maxReviews > 0 && collected.length >= maxReviews) break;

    const nextButton = getNextReviewsButton();
    if (!nextButton) break;

    const previousSignature = getReviewsSignature();
    nextButton.scrollIntoView({ behavior: 'smooth', block: 'center' });
    await sleep(400);
    nextButton.click();

    const changed = await waitForReviewsChange(previousSignature);
    if (!changed) break;
    await sleep(600);
  }

  return collected;
}

async function coletarPaginasDaNota(rating) {
  const clicked = await clickRatingFilter(rating);
  if (!clicked) return [];

  return coletarTodasPaginas(0);
}

function selectReviewsByQuotas(reviewsByRating, quotas, requestedTotal) {
  const selected = [];
  const selectedKeys = new Set();

  [1, 2, 3, 4, 5].forEach(rating => {
    const reviews = (reviewsByRating[rating] || [])
      .slice()
      .sort((a, b) => Number(reviewHasMedia(b)) - Number(reviewHasMedia(a)));

    reviews.slice(0, quotas[rating]).forEach(review => {
      const key = getReviewKey(review);
      selectedKeys.add(key);
      selected.push(review);
    });
  });

  if (selected.length < requestedTotal) {
    const remaining = [1, 2, 3, 4, 5]
      .flatMap(rating => reviewsByRating[rating] || [])
      .filter(review => !selectedKeys.has(getReviewKey(review)))
      .sort((a, b) => Number(reviewHasMedia(b)) - Number(reviewHasMedia(a)));

    remaining.slice(0, requestedTotal - selected.length).forEach(review => {
      selected.push(review);
    });
  }

  return selected.slice(0, requestedTotal);
}

async function coletarReviewsBalanceadas(maxReviews = 0) {
  await prepareReviewsSection();

  const ratingCounts = getRatingCountsFromOverview();

  if (!maxReviews || !ratingCounts) {
    return coletarTodasPaginas(maxReviews);
  }

  const quotas = calculateRatingQuotas(maxReviews, ratingCounts);
  const reviewsByRating = { 1: [], 2: [], 3: [], 4: [], 5: [] };

  for (const rating of [1, 2, 3, 4, 5]) {
    if (quotas[rating] <= 0) continue;
    reviewsByRating[rating] = await coletarPaginasDaNota(rating);
  }

  return selectReviewsByQuotas(reviewsByRating, quotas, Math.min(maxReviews, getQuotaTotal(quotas)));
}

function toCSV(reviews, productHandle) {
  const headers = ['title','body','rating','review_date','reviewer_name','reviewer_email','product_id','product_handle','reply','picture_urls'];
  const escapeCSV = value => {
    const text = String(value || '');
    return `"${text.replace(/"/g, '""')}"`;
  };

  const rows = reviews.map(r => {
    return [
      '',
      escapeCSV(r.body),
      r.rating || '',
      escapeCSV(r.review_date),
      escapeCSV(r.reviewer_name),
      '',
      '',
      escapeCSV(productHandle),
      '',
      escapeCSV(r.picture_urls)
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function downloadCSV(csv, filename) {
  const csvBlob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const downloadUrl = URL.createObjectURL(csvBlob);
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(downloadUrl);
}

function normalizeShopeeUrl(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    return `${parsed.origin}${parsed.pathname}`;
  } catch (e) {
    return url;
  }
}

function getShopeeItemKey(url) {
  const match = String(url).match(/-i\.(\d+)\.(\d+)/);
  return match ? `${match[1]}.${match[2]}` : normalizeShopeeUrl(url);
}

function getShopUsernameFromUrl() {
  const path = window.location.pathname.split('/').filter(Boolean)[0] || '';
  return decodeURIComponent(path).replace(/^@/, '');
}

function slugifyShopeeTitle(title) {
  return String(title || 'produto')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'produto';
}

function getItemReviewCount(item) {
  const basic = item.item_basic || item;
  const ratingCount = basic.item_rating?.rating_count || basic.item_rating?.rating_count_with_context;
  const ratingTotal = Array.isArray(ratingCount)
    ? ratingCount.reduce((sum, count) => sum + (Number(count) || 0), 0)
    : 0;

  return Number(basic.cmt_count || basic.comment_count || item.cmt_count || item.comment_count || ratingTotal || 0);
}

function getShopeeImageUrl(imageId) {
  if (!imageId) return '';
  if (String(imageId).startsWith('http')) return imageId;
  return `https://down-br.img.susercontent.com/file/${imageId}`;
}

function parseShopSearchItem(item) {
  const basic = item.item_basic || item;
  const itemId = basic.itemid || basic.item_id || item.itemid || item.item_id;
  const shopId = basic.shopid || basic.shop_id || item.shopid || item.shop_id;
  const title = basic.name || item.name || basic.title || item.title || '';

  if (!itemId || !shopId || !title) return null;

  return {
    url: `https://shopee.com.br/${slugifyShopeeTitle(title)}-i.${shopId}.${itemId}`,
    title,
    imageUrl: getShopeeImageUrl(basic.image || item.image),
    reviewCount: getItemReviewCount(item),
    itemId: String(itemId),
    shopId: String(shopId)
  };
}

async function fetchJSON(url) {
  const response = await fetch(url, {
    credentials: 'include',
    headers: {
      accept: 'application/json'
    }
  });

  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function collectShopAdLinksViaApi(limit = 260) {
  const username = getShopUsernameFromUrl();
  if (!username) return [];

  const shopDetail = await fetchJSON(`/api/v4/shop/get_shop_detail?username=${encodeURIComponent(username)}`);
  const shopId = shopDetail?.data?.shopid;
  const itemCount = Number(shopDetail?.data?.item_count || limit);
  if (!shopId) return [];

  const ads = new Map();
  const endpoints = [
    offset => `/api/v4/search/search_items?by=pop&limit=60&match_id=${shopId}&newest=${offset}&order=desc&page_type=shop&scenario=PAGE_OTHERS&version=2`,
    offset => `/api/v4/shop/search_items?by=pop&limit=60&match_id=${shopId}&newest=${offset}&order=desc&version=2`
  ];

  for (const makeUrl of endpoints) {
    ads.clear();

    for (let offset = 0; offset < Math.min(itemCount, limit); offset += 60) {
      let data;

      try {
        data = await fetchJSON(makeUrl(offset));
      } catch (e) {
        break;
      }

      const items = data.items || data.data?.items || [];
      if (!items.length) break;

      items
        .map(parseShopSearchItem)
        .filter(Boolean)
        .forEach(ad => {
          const key = `${ad.shopId}.${ad.itemId}`;
          if (!ads.has(key)) ads.set(key, ad);
        });

      if (ads.size >= itemCount || ads.size >= limit) break;
      await sleep(350);
    }

    if (ads.size > 0) return Array.from(ads.values());
  }

  return [];
}

async function collectShopAdLinks(limit = 240, selectors = {}) {
  try {
    const apiAds = await collectShopAdLinksViaApi(limit);
    if (apiAds.length) return apiAds;
  } catch (e) {}

  const itemSelector = String(selectors.item || '').trim();
  const linkSelector = String(selectors.link || '').trim();
  const titleSelector = String(selectors.title || '').trim();
  const imageSelector = String(selectors.image || '').trim();
  const manualMode = Boolean(itemSelector || linkSelector || titleSelector || imageSelector);

  const links = new Map();
  const maxScrolls = 80;
  let stableRounds = 0;

  for (let i = 0; i < maxScrolls && links.size < limit; i++) {
    const candidates = [];

    if (manualMode) {
      if (itemSelector) {
        candidates.push(...Array.from(document.querySelectorAll(itemSelector)));
      } else if (titleSelector) {
        candidates.push(...Array.from(document.querySelectorAll(titleSelector)).map(el => el.closest('a[href*="-i."]') || el));
      }
    } else {
      candidates.push(...Array.from(document.querySelectorAll('a[href*="-i."]')));
    }

    candidates.forEach(item => {
      const anchor = item.nodeName === 'A'
        ? item
        : (linkSelector ? item.querySelector(linkSelector) : item.querySelector('a[href*="-i."]')) || item.closest('a[href*="-i."]');
      const href = anchor ? (anchor.href || anchor.getAttribute('href') || '') : '';
      if (!href || !href.includes('-i.')) return;

      const url = normalizeShopeeUrl(href);
      const key = getShopeeItemKey(url);

      let title = '';
      if (titleSelector) {
        const titleEl = item.querySelector(titleSelector) || item;
        title = titleEl ? (titleEl.innerText || titleEl.getAttribute('title') || '').trim() : '';
      } else {
        title = (anchor.innerText || anchor.getAttribute('title') || '').trim();
      }
      if (!title) return;

      let shopImageUrl = '';
      if (imageSelector) {
        const imageEl = item.querySelector(imageSelector);
        if (imageEl) shopImageUrl = getImageUrl(imageEl);
      }

      const imageUrl = getImageUrl(anchor.querySelector('img') || anchor);

      if (!links.has(key)) {
        links.set(key, { url, title, imageUrl, shopImageUrl });
      } else if (title && title.length > links.get(key).title.length) {
        const existing = links.get(key);
        links.set(key, {
          url,
          title,
          imageUrl: imageUrl || existing.imageUrl,
          shopImageUrl: shopImageUrl || existing.shopImageUrl
        });
      }
    });

    const before = links.size;
    window.scrollBy({ top: Math.max(700, window.innerHeight * 0.85), behavior: 'smooth' });
    await sleep(900);

    stableRounds = links.size === before ? stableRounds + 1 : 0;
    if (stableRounds >= 8) break;
  }

  return Array.from(links.values());
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'getIds') {
    sendResponse(getProductIds());
    return false;
  }

  if (msg.action === 'exportReviews') {
    const { productHandle, maxReviews = 0 } = msg;

    coletarReviewsBalanceadas(Number(maxReviews) || 0)
      .then(reviews => {
        if (!reviews.length) {
          sendResponse({ error: 'Nenhuma review encontrada. Role a pagina para carregar as reviews e tente novamente.' });
          return;
        }

        const csv = toCSV(reviews, productHandle);
        const ts = new Date().toISOString().slice(0,19).replace(/[-:T]/g,'').slice(0,14);
        downloadCSV(csv, `shopee_reviews_${ts}.csv`);
        sendResponse({ success: true, total: reviews.length });
      })
      .catch(error => {
        sendResponse({ error: error.message || 'Erro ao coletar reviews.' });
      });

    return true;
  }

  if (msg.action === 'collectReviews') {
    const { maxReviews = 0 } = msg;

    coletarReviewsBalanceadas(Number(maxReviews) || 0)
      .then(reviews => {
        sendResponse({
          success: true,
          total: reviews.length,
          reviews,
          productIds: getProductIds(),
          url: window.location.href
        });
      })
      .catch(error => {
        sendResponse({ error: error.message || 'Erro ao coletar reviews.' });
      });

    return true;
  }

  if (msg.action === 'collectShopAds') {
    const { limit = 240, selectors = {} } = msg;

    collectShopAdLinks(Number(limit) || 240, selectors)
      .then(ads => sendResponse({ success: true, ads }))
      .catch(error => sendResponse({ error: error.message || 'Erro ao coletar anuncios da loja.' }));

    return true;
  }

  if (msg.action === 'getShopeeReviewStats') {
    prepareReviewsSection()
      .then(() => {
        sendResponse({
          success: true,
          url: window.location.href,
          title: getProductTitle(),
          ratingCounts: getRatingCountsFromOverview(),
          reviewCount: getRatingTotalFromOverview()
        });
      })
      .catch(error => sendResponse({ error: error.message || 'Erro ao ler comentarios do anuncio.' }));

    return true;
  }
});
