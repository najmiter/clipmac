const {
  app,
  globalShortcut,
  BrowserWindow,
  clipboard,
  ipcMain,
  shell,
  Tray,
  Menu,
  dialog,
} = require('electron');
const path = require('path');
const dbUtil = require('./utils/db');

let popupWindow;
let tray = null;
const MAX_HISTORY_LENGTH = 100;
const CLIPBOARD_CHECK_INTERVAL = 1_000;
const ITEMS_PER_PAGE = 20;
let previousClipboardText = '';
let currentPage = 1;
let currentSearchQuery = '';

function updateClipboardHistory() {
  const currentText = clipboard.readText();
  if (currentText && currentText !== previousClipboardText) {
    previousClipboardText = currentText;
    dbUtil.addTextToHistoryDB(currentText, (err, history) => {
      if (err) return;
      if (
        popupWindow &&
        !popupWindow.isDestroyed() &&
        popupWindow.webContents &&
        popupWindow.isVisible()
      ) {
        popupWindow.webContents.send('clipboard-history-update', history);
      }
    });
  } else if (!currentText && previousClipboardText) {
    previousClipboardText = '';
  }
}

function createPopup() {
  popupWindow = new BrowserWindow({
    width: 500,
    height: 600,
    alwaysOnTop: true,
    frame: false,
    transparent: false,
    resizable: false,
    movable: true,
    darkTheme: true,
    show: false,
    backgroundColor: '#181818',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  popupWindow.loadFile('popup.html');

  popupWindow.once('ready-to-show', () => {
    currentPage = 1;
    currentSearchQuery = '';
    dbUtil.fetchHistoryFromDB(
      (err, history, paginationInfo) => {
        if (
          !err &&
          popupWindow &&
          !popupWindow.isDestroyed() &&
          popupWindow.webContents
        ) {
          popupWindow.webContents.send(
            'clipboard-history-update',
            history,
            paginationInfo
          );
          popupWindow.webContents.send('clear-search');
        }
      },
      currentPage,
      ITEMS_PER_PAGE
    );
  });

  popupWindow.on('blur', () => {
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.hide();
      if (process.platform === 'darwin') {
        app.hide();
      }
    }
  });

  popupWindow.on('closed', () => {
    popupWindow = null;
  });
}

function showPopup() {
  if (process.platform === 'darwin') {
    app.show();
  }

  if (!popupWindow || popupWindow.isDestroyed()) {
    createPopup();
    popupWindow.once('ready-to-show', () => {
      popupWindow.show();
      currentPage = 1;
      currentSearchQuery = '';

      dbUtil.fetchHistoryFromDB(
        (err, history, paginationInfo) => {
          if (
            !err &&
            popupWindow &&
            !popupWindow.isDestroyed() &&
            popupWindow.webContents
          ) {
            popupWindow.webContents.send(
              'clipboard-history-update',
              history,
              paginationInfo
            );
            popupWindow.webContents.send('clear-search');
          }
        },
        currentPage,
        ITEMS_PER_PAGE
      );
    });
  } else {
    if (!popupWindow.isVisible()) {
      popupWindow.show();
    }
    popupWindow.focus();
    currentPage = 1;
    currentSearchQuery = '';

    dbUtil.fetchHistoryFromDB(
      (err, history, paginationInfo) => {
        if (
          !err &&
          popupWindow &&
          !popupWindow.isDestroyed() &&
          popupWindow.webContents
        ) {
          popupWindow.webContents.send(
            'clipboard-history-update',
            history,
            paginationInfo
          );
          popupWindow.webContents.send('clear-search');
        }
      },
      currentPage,
      ITEMS_PER_PAGE
    );
  }
}

app.whenReady().then(async () => {
  try {
    await dbUtil.initDB(app.getPath('userData'), MAX_HISTORY_LENGTH);
  } catch (dbInitError) {}

  const iconName = 'iconTemplate.png';
  const iconPath = path.join(__dirname, 'assets', iconName);
  try {
    tray = new Tray(iconPath);
  } catch (error) {}

  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
      {
        label: 'Clear History',
        click: async () => {
          const { response } = await dialog.showMessageBox(
            popupWindow || null,
            {
              type: 'question',
              buttons: ['Cancel', 'Yes, Clear'],
              defaultId: 0,
              title: 'Confirm Clear History',
              message: 'Are you sure you want to clear all clipboard history?',
              detail: 'This action cannot be undone.',
            }
          );

          if (response === 1) {
            dbUtil.clearHistoryDB((err) => {
              if (err) {
                dialog.showErrorBox('Error', 'Failed to clear history.');
                return;
              }
              if (
                popupWindow &&
                !popupWindow.isDestroyed() &&
                popupWindow.webContents
              ) {
                popupWindow.webContents.send('clipboard-history-update', []);
              }
            });
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit ClipMac',
        click: () => {
          app.isQuitting = true;
          app.quit();
        },
      },
    ]);
    tray.setToolTip('ClipMac - Clipboard Manager');
    tray.setContextMenu(contextMenu);

    tray.on('click', showPopup);
  }

  if (process.platform === 'darwin') {
    app.dock.hide();
  }

  if (!app.isPackaged) {
  } else {
    app.setLoginItemSettings({
      openAtLogin: true,
    });
  }

  previousClipboardText = clipboard.readText();
  if (previousClipboardText) {
    dbUtil.addTextToHistoryDB(previousClipboardText, (err, initialHistory) => {
      if (err) {
      }
    });
  }

  setInterval(updateClipboardHistory, CLIPBOARD_CHECK_INTERVAL);

  globalShortcut.register('Control+Shift+Space', showPopup);

  ipcMain.on('copy-text-to-clipboard', (_, text) => {
    clipboard.writeText(text);
    new Promise(
      (
        r = () => {
          previousClipboardText = text;
          dbUtil.addTextToHistoryDB(text, (err, history) => {
            if (err) return;
            if (
              popupWindow &&
              !popupWindow.isDestroyed() &&
              popupWindow.webContents &&
              popupWindow.isVisible()
            ) {
              popupWindow.webContents.send('clipboard-history-update', history);
            }
          });
        }
      ) => setTimeout(r, 1500)
    );
  });

  ipcMain.on('open-external-link', (_, url) => {
    shell.openExternal(url);
  });

  ipcMain.on('close-popup-on-escape', () => {
    if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
      popupWindow.hide();
      if (process.platform === 'darwin') {
        app.hide();
      }
    }
  });

  ipcMain.on('search-history', (_, query) => {
    currentSearchQuery = query;
    currentPage = 1;

    const searchCallback = (err, history, paginationInfo) => {
      if (err) {
        if (
          popupWindow &&
          !popupWindow.isDestroyed() &&
          popupWindow.webContents
        ) {
          popupWindow.webContents.send('clipboard-history-update', [], {
            total: 0,
            page: 1,
            hasMore: false,
          });
        }
        return;
      }
      if (
        popupWindow &&
        !popupWindow.isDestroyed() &&
        popupWindow.webContents
      ) {
        popupWindow.webContents.send(
          'clipboard-history-update',
          history,
          paginationInfo
        );
      }
    };

    if (query && query.trim() !== '') {
      dbUtil.searchHistoryInDB(
        query,
        searchCallback,
        currentPage,
        ITEMS_PER_PAGE
      );
    } else {
      dbUtil.fetchHistoryFromDB(searchCallback, currentPage, ITEMS_PER_PAGE);
    }
  });

  ipcMain.on('load-page', (_, page) => {
    currentPage = page;

    const loadCallback = (err, history, paginationInfo) => {
      if (err) {
        if (
          popupWindow &&
          !popupWindow.isDestroyed() &&
          popupWindow.webContents
        ) {
          popupWindow.webContents.send('clipboard-history-update', [], {
            total: 0,
            page: 1,
            hasMore: false,
          });
        }
        return;
      }
      if (
        popupWindow &&
        !popupWindow.isDestroyed() &&
        popupWindow.webContents
      ) {
        popupWindow.webContents.send(
          'clipboard-history-update',
          history,
          paginationInfo
        );
      }
    };

    if (currentSearchQuery && currentSearchQuery.trim() !== '') {
      dbUtil.searchHistoryInDB(
        currentSearchQuery,
        loadCallback,
        currentPage,
        ITEMS_PER_PAGE
      );
    } else {
      dbUtil.fetchHistoryFromDB(loadCallback, currentPage, ITEMS_PER_PAGE);
    }
  });

  ipcMain.on('update-history-entry', (_, index, updatedEntry) => {
    dbUtil.updateHistoryEntryDB(updatedEntry, (err, history) => {
      if (err) {
        console.error('Error updating history entry:', err.message);
        return;
      }
      if (
        popupWindow &&
        !popupWindow.isDestroyed() &&
        popupWindow.webContents
      ) {
        popupWindow.webContents.send('clipboard-history-update', history);
      }
    });
  });
});

app.on('will-quit', async () => {
  globalShortcut.unregisterAll();
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.destroy();
  }
  if (tray) {
    tray.destroy();
  }

  try {
    await dbUtil.closeDB();
  } catch (dbCloseError) {}
});
