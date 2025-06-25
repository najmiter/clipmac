const historyContainer = document.getElementById('history-container');
const externalLink = document.getElementById('external-link');
const searchInput = document.getElementById('search-input');
const paginationContainer = document.getElementById('pagination-container');
const prevBtn = document.getElementById('prev-btn');
const nextBtn = document.getElementById('next-btn');
const paginationInfo = document.getElementById('pagination-info');

let currentHistory = [];
let currentPaginationInfo = {
  total: 0,
  page: 1,
  hasMore: false,
  totalPages: 1,
};

function updatePaginationControls(paginationData) {
  if (!paginationData) return;

  currentPaginationInfo = paginationData;

  if (paginationData.total <= 20) {
    paginationContainer.style.display = 'none';
    return;
  }

  paginationContainer.style.display = 'flex';

  prevBtn.disabled = paginationData.page <= 1;
  nextBtn.disabled = !paginationData.hasMore;

  const startItem = (paginationData.page - 1) * 20 + 1;
  const endItem = Math.min(paginationData.page * 20, paginationData.total);

  paginationInfo.textContent = `${startItem}-${endItem} of ${paginationData.total}`;
}

function displayHistory(history, paginationData) {
  historyContainer.innerHTML = '';
  updatePaginationControls(paginationData);

  if (!history || history.length === 0) {
    historyContainer.innerText = searchInput.value
      ? '(No results found for your search)'
      : '(Clipboard history is empty)';
    historyContainer.style.padding = '20px';
    paginationContainer.style.display = 'none';
    return;
  } else {
    historyContainer.style.padding = '10px';
  }

  const ul = document.createElement('ul');
  ul.id = 'history-list';

  history.forEach((entry, index) => {
    const li = document.createElement('li');
    li.className = 'history-item';
    li.title = 'Click text area to copy';
    li.style.cursor = 'default';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'history-content';

    if (entry.title && !li.classList.contains('editing')) {
      const titleSpan = document.createElement('div');
      titleSpan.className = 'history-title';
      titleSpan.textContent = entry.title;
      contentDiv.appendChild(titleSpan);
    }

    if (entry.description && !li.classList.contains('editing')) {
      const descSpan = document.createElement('div');
      descSpan.className = 'history-description';
      descSpan.textContent = entry.description;
      contentDiv.appendChild(descSpan);
    }

    if (
      entry.tags &&
      entry.tags.length > 0 &&
      !li.classList.contains('editing')
    ) {
      const tagsDiv = document.createElement('div');
      tagsDiv.className = 'history-tags';
      entry.tags.forEach((tag) => {
        const tagSpan = document.createElement('span');
        tagSpan.className = 'tag';
        tagSpan.textContent = tag;
        tagsDiv.appendChild(tagSpan);
      });
      contentDiv.appendChild(tagsDiv);
    }

    const textSpan = document.createElement('span');
    textSpan.className = 'history-text';
    textSpan.textContent = entry.text.substring(0, 100);
    textSpan.style.cursor = 'pointer';
    textSpan.title = 'Click to copy';
    textSpan.onclick = (e) => {
      e.stopPropagation();
      window.clipboardAPI.copyTextToClipboard(entry.text);

      const originalColor = textSpan.style.color;
      textSpan.style.color = 'green';
      setTimeout(() => {
        textSpan.style.color = originalColor;
      }, 1000);
    };

    const timestampSpan = document.createElement('span');
    timestampSpan.className = 'history-timestamp';
    const timestamp = new Date(entry.timestamp).toLocaleTimeString('en-us', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
    timestampSpan.textContent = `${timestamp}`;

    contentDiv.appendChild(textSpan);
    contentDiv.appendChild(timestampSpan);

    const buttonGroup = document.createElement('div');
    buttonGroup.className = 'button-group';

    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.textContent = 'Copy';
    copyButton.onclick = (e) => {
      e.stopPropagation();
      copyButton.textContent = 'Copied';
      copyButton.style.color = 'green';
      window.clipboardAPI.copyTextToClipboard(entry.text);
      setTimeout(() => {
        copyButton.textContent = 'Copy';
        copyButton.style.color = '';
      }, 1000);
    };

    const metadataToggle = document.createElement('button');
    metadataToggle.className = 'metadata-toggle';
    metadataToggle.textContent = 'Edit';
    metadataToggle.onclick = (e) => {
      e.stopPropagation();
      toggleMetadataEdit(li, entry, index);
    };

    buttonGroup.appendChild(copyButton);
    buttonGroup.appendChild(metadataToggle);

    li.appendChild(contentDiv);
    li.appendChild(buttonGroup);
    ul.appendChild(li);
  });
  historyContainer.appendChild(ul);
}

function toggleMetadataEdit(li, entry, index) {
  const existingMetadata = li.querySelector('.metadata-section');
  if (existingMetadata) {
    existingMetadata.remove();
    li.classList.remove('editing');
    return;
  }

  li.classList.add('editing');

  const metadataSection = document.createElement('div');
  metadataSection.className = 'metadata-section';

  const titleField = document.createElement('div');
  titleField.className = 'metadata-field';
  titleField.innerHTML = `
          <label>Title:</label>
          <input type="text" class="title-input" value="${entry.title || ''}" placeholder="Add a title...">
        `;

  const descField = document.createElement('div');
  descField.className = 'metadata-field';
  descField.innerHTML = `
          <label>Description:</label>
          <textarea class="desc-input" placeholder="Add a description...">${entry.description || ''}</textarea>
        `;

  const tagsField = document.createElement('div');
  tagsField.className = 'metadata-field';
  tagsField.innerHTML = `
          <label>Tags (comma-separated):</label>
          <input type="text" class="tags-input" value="${entry.tags ? entry.tags.join(', ') : ''}" placeholder="tag1, tag2, tag3...">
        `;

  const actionsDiv = document.createElement('div');
  actionsDiv.className = 'metadata-actions';

  const saveBtn = document.createElement('button');
  saveBtn.className = 'save-btn';
  saveBtn.textContent = 'Save';
  saveBtn.onclick = (e) => {
    e.stopPropagation();
    saveMetadata(li, entry, index, metadataSection);
  };

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'cancel-btn';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.onclick = (e) => {
    e.stopPropagation();
    metadataSection.remove();
    li.classList.remove('editing');
  };

  actionsDiv.appendChild(saveBtn);
  actionsDiv.appendChild(cancelBtn);

  metadataSection.appendChild(titleField);
  metadataSection.appendChild(descField);
  metadataSection.appendChild(tagsField);
  metadataSection.appendChild(actionsDiv);

  li.querySelector('.history-content').appendChild(metadataSection);

  metadataSection.querySelector('.title-input').focus();
}

function saveMetadata(li, entry, index, metadataSection) {
  const titleInput = metadataSection.querySelector('.title-input');
  const descInput = metadataSection.querySelector('.desc-input');
  const tagsInput = metadataSection.querySelector('.tags-input');

  const updatedEntry = {
    ...entry,
    title: titleInput.value.trim() || null,
    description: descInput.value.trim() || null,
    tags: tagsInput.value.trim()
      ? tagsInput.value
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag)
      : null,
  };

  currentHistory[index] = updatedEntry;

  window.clipboardAPI.updateHistoryEntry(index, updatedEntry);

  metadataSection.remove();
  li.classList.remove('editing');
  displayHistory(currentHistory);
}

window.clipboardAPI.onClipboardHistoryUpdate((history, paginationInfo) => {
  currentHistory = history;
  displayHistory(history, paginationInfo);
});

prevBtn.addEventListener('click', () => {
  if (currentPaginationInfo.page > 1) {
    window.clipboardAPI.loadPage(currentPaginationInfo.page - 1);
  }
});

nextBtn.addEventListener('click', () => {
  if (currentPaginationInfo.hasMore) {
    window.clipboardAPI.loadPage(currentPaginationInfo.page + 1);
  }
});

searchInput.addEventListener('input', () => {
  const query = searchInput.value.trim();
  window.clipboardAPI.searchHistory(query);
});

window.clipboardAPI.onClearSearch(() => {
  if (searchInput) {
    searchInput.value = '';
  }
});

externalLink.addEventListener('click', (event) => {
  event.preventDefault();
  window.clipboardAPI.openExternalLink(externalLink.href);
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    window.clipboardAPI.closePopupOnEscape();
  }
});

window.addEventListener('DOMContentLoaded', () => {
  searchInput?.focus();
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    searchInput?.focus();
  }
});
