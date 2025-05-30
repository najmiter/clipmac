const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('clipboardAPI', {
  onClipboardHistoryUpdate: (callback) =>
    ipcRenderer.on('clipboard-history-update', (_, history) =>
      callback(history)
    ),
  copyTextToClipboard: (text) =>
    ipcRenderer.send('copy-text-to-clipboard', text),
  openExternalLink: (url) => ipcRenderer.send('open-external-link', url),
  closePopupOnEscape: () => ipcRenderer.send('close-popup-on-escape'),
});
