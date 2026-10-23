const API_BASE_META = document.querySelector('meta[name="api-base"]');
// Same rule as session.js: when the page is opened from localhost, use the local API.
const API_BASE = (['localhost', '127.0.0.1'].includes(window.location.hostname)
  ? `http://${window.location.hostname}:5000`
  : (API_BASE_META?.content || 'https://api-programming.onrender.com')).replace(/\/+$/, '');

const ITEM_STATUSES = new Set(['unclaimed', 'claimed', 'pending-verification']);
const ITEM_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function requestJson(path) {
    const response = await fetch(`${API_BASE}${path}`, {
        headers: { Accept: 'application/json' }
    });
    const payload = await response.json();

    if (!response.ok) {
        throw new Error(payload.message || `Request failed with status ${response.status}.`);
    }

    return payload;
}

function formatCategory(category) {
    return category
        .split('-')
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
        return value;
    }
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

function showLoading(loadingElement, isLoading) {
    loadingElement.hidden = !isLoading;
}

function renderItemCard(item) {
    const link = document.createElement('a');
    link.className = 'item-card item-card-link';
    link.href = `item-detail.html?id=${encodeURIComponent(item.itemId)}`;
    link.dataset.category = item.category;

    const content = document.createElement('div');
    content.className = 'item-card-content';

    const title = document.createElement('h3');
    title.textContent = formatCategory(item.category);

    const meta = document.createElement('p');
    meta.className = 'item-meta';
    meta.textContent = `${item.location} · ${formatDate(item.dateFound)}`;

    const status = document.createElement('span');
    status.className = `item-status status-${item.status}`;
    status.textContent = item.status;

    const description = document.createElement('p');
    description.className = 'item-description';
    description.textContent = item.description;

    content.append(title, meta, status, description);
    link.append(content);
    return link;
}

function initializeItemList() {
    const itemsContainer = document.querySelector('#itemsContainer');
    const loadingSpinner = document.querySelector('#loadingSpinner');
    const categoryFilter = document.querySelector('#categoryFilter');
    const keywordFilter = document.querySelector('#keywordFilter');
    const statusFilter = document.querySelector('#statusFilter');
    const applyFilters = document.querySelector('#applyFilters');
    let latestListRequest = 0;

    if (!itemsContainer || !loadingSpinner || !categoryFilter || !keywordFilter || !statusFilter || !applyFilters) {
        return;
    }

    async function loadItems() {
        const requestId = ++latestListRequest;
        showLoading(loadingSpinner, true);
        itemsContainer.replaceChildren();

        const params = new URLSearchParams();
        if (categoryFilter.value) {
            params.set('category', categoryFilter.value);
        }
        if (keywordFilter.value.trim()) {
            params.set('keyword', keywordFilter.value.trim());
        }

        try {
            const query = params.size ? `?${params.toString()}` : '';
            const items = await requestJson(`/found-items${query}`);
            if (requestId !== latestListRequest) {
                return;
            }
            const filteredItems = items.filter((item) =>
                !statusFilter.value || item.status === statusFilter.value
            );

            if (filteredItems.length === 0) {
                const emptyMessage = document.createElement('p');
                emptyMessage.className = 'text-muted';
                emptyMessage.textContent = 'No found items match these filters.';
                itemsContainer.append(emptyMessage);
                return;
            }

            const fragment = document.createDocumentFragment();
            filteredItems.forEach((item) => fragment.append(renderItemCard(item)));
            itemsContainer.append(fragment);
        } catch (error) {
            if (requestId !== latestListRequest) {
                return;
            }
            const errorMessage = document.createElement('p');
            errorMessage.className = 'error-message';
            errorMessage.setAttribute('role', 'alert');
            errorMessage.textContent = `Could not load found items: ${error.message}`;
            itemsContainer.append(errorMessage);
        } finally {
            if (requestId === latestListRequest) {
                showLoading(loadingSpinner, false);
            }
        }
    }

    applyFilters.addEventListener('click', loadItems);
    keywordFilter.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            loadItems();
        }
    });
    loadItems();
}

async function initializeItemDetail() {
    const loadingSpinner = document.querySelector('#loadingSpinner');
    const itemContent = document.querySelector('#itemContent');
    const errorMessage = document.querySelector('#itemError');
    if (!loadingSpinner || !itemContent || !errorMessage) {
        return;
    }

    const itemId = new URLSearchParams(window.location.search).get('id');
    if (!itemId || !ITEM_ID_PATTERN.test(itemId)) {
        errorMessage.textContent = 'A valid found-item ID was not provided.';
        errorMessage.hidden = false;
        showLoading(loadingSpinner, false);
        return;
    }

    try {
        const item = await requestJson(`/found-items/${encodeURIComponent(itemId)}`);
        document.querySelector('#itemId').textContent = item.itemId;
        document.querySelector('#itemCategory').textContent = formatCategory(item.category);
        document.querySelector('#itemLocation').textContent = item.location;
        document.querySelector('#itemDate').textContent = formatDate(item.dateFound);
        document.querySelector('#itemDescription').textContent = item.description;

        const status = document.querySelector('#itemStatus');
        status.textContent = item.status;
        status.className = `item-status status-${ITEM_STATUSES.has(item.status) ? item.status : ''}`;
        itemContent.hidden = false;
    } catch (error) {
        errorMessage.textContent = `Could not load this found item: ${error.message}`;
        errorMessage.hidden = false;
    } finally {
        showLoading(loadingSpinner, false);
    }
}

initializeItemList();
initializeItemDetail();
