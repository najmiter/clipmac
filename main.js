const {
  app,
  globalShortcut,
  BrowserWindow,
  clipboard,
  ipcMain,
  shell,
  Tray,
  Menu,
} = require('electron');
const path = require('path');
const dbUtil = require('./utils/db');

let popupWindow;
let tray = null;
const MAX_HISTORY_LENGTH = 100;
const CLIPBOARD_CHECK_INTERVAL = 1_000;
let previousClipboardText = '';

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
    dbUtil.fetchHistoryFromDB((err, history) => {
      if (
        !err &&
        popupWindow &&
        !popupWindow.isDestroyed() &&
        popupWindow.webContents
      ) {
        popupWindow.webContents.send('clipboard-history-update', history);
        popupWindow.webContents.send('clear-search');
      }
    });
  });

  popupWindow.on('blur', () => {
    if (popupWindow && !popupWindow.isDestroyed()) {
      popupWindow.hide();
    }
  });

  popupWindow.on('closed', () => {
    popupWindow = null;
  });
}

function showPopup() {
  if (!popupWindow || popupWindow.isDestroyed()) {
    createPopup();
    popupWindow.once('ready-to-show', () => {
      popupWindow.show();

      dbUtil.fetchHistoryFromDB((err, history) => {
        if (
          !err &&
          popupWindow &&
          !popupWindow.isDestroyed() &&
          popupWindow.webContents
        ) {
          popupWindow.webContents.send('clipboard-history-update', history);
          popupWindow.webContents.send('clear-search');
        }
      });
    });
  } else {
    if (!popupWindow.isVisible()) {
      popupWindow.show();
    }
    popupWindow.focus();

    dbUtil.fetchHistoryFromDB((err, history) => {
      if (
        !err &&
        popupWindow &&
        !popupWindow.isDestroyed() &&
        popupWindow.webContents
      ) {
        popupWindow.webContents.send('clipboard-history-update', history);
        popupWindow.webContents.send('clear-search');
      }
    });
  }
}

app.whenReady().then(async () => {
  try {
    await dbUtil.initDB(app.getPath('userData'), MAX_HISTORY_LENGTH);
  } catch (dbInitError) {}

  const iconName =
    process.platform === 'darwin' ? 'iconTemplate.png' : 'icon.png';
  const iconPath = path.join(__dirname, 'assets', iconName);
  try {
    tray = new Tray(iconPath);
  } catch (error) {}

  if (tray) {
    const contextMenu = Menu.buildFromTemplate([
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
    // dev
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

  ipcMain.on('copy-text-to-clipboard', (event, text) => {
    clipboard.writeText(text);
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
  });

  ipcMain.on('open-external-link', (event, url) => {
    shell.openExternal(url);
  });

  ipcMain.on('close-popup-on-escape', () => {
    if (popupWindow && !popupWindow.isDestroyed() && popupWindow.isVisible()) {
      popupWindow.hide();
    }
  });

  ipcMain.on('search-history', (event, query) => {
    const searchCallback = (err, history) => {
      if (err) {
        // console.error('Error during search/fetch for history update:', err.message);
        if (
          popupWindow &&
          !popupWindow.isDestroyed() &&
          popupWindow.webContents
        ) {
          popupWindow.webContents.send('clipboard-history-update', []);
        }
        return;
      }
      if (
        popupWindow &&
        !popupWindow.isDestroyed() &&
        popupWindow.webContents
      ) {
        popupWindow.webContents.send('clipboard-history-update', history);
      }
    };

    if (query && query.trim() !== '') {
      dbUtil.searchHistoryInDB(query, searchCallback);
    } else {
      dbUtil.fetchHistoryFromDB(searchCallback);
    }
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
  } catch (dbCloseError) {
    // console.error('Error closing database during quit:', dbCloseError);
  }
});
