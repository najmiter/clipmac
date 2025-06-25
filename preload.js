const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardAPI', {
  onClipboardHistoryUpdate: (callback) =>
    ipcRenderer.on('clipboard-history-update', (_, history, paginationInfo) =>
      callback(history, paginationInfo)
    ),
  copyTextToClipboard: (text) =>
    ipcRenderer.send('copy-text-to-clipboard', text),
  openExternalLink: (url) => ipcRenderer.send('open-external-link', url),
  closePopupOnEscape: () => ipcRenderer.send('close-popup-on-escape'),
  searchHistory: (query) => ipcRenderer.send('search-history', query),
  onClearSearch: (callback) => ipcRenderer.on('clear-search', callback),
  updateHistoryEntry: (index, updatedEntry) =>
    ipcRenderer.send('update-history-entry', index, updatedEntry),
  loadPage: (page) => ipcRenderer.send('load-page', page),
});
