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

let popupWindow;
let tray = null;
let clipboardHistory = [];
const MAX_HISTORY_LENGTH = 50;
const CLIPBOARD_CHECK_INTERVAL = 1_000;
let previousClipboardText = '';

function updateClipboardHistory() {
  const currentText = clipboard.readText();
  if (currentText && currentText !== previousClipboardText) {
    const existingIndex = clipboardHistory.findIndex(
      (item) => item.text === currentText
    );
    if (existingIndex > -1) {
      clipboardHistory.splice(existingIndex, 1);
    }

    clipboardHistory.unshift({ text: currentText, timestamp: Date.now() });
    if (clipboardHistory.length > MAX_HISTORY_LENGTH) {
      clipboardHistory.length = MAX_HISTORY_LENGTH;
    }
    previousClipboardText = currentText;

    if (
      popupWindow &&
      !popupWindow.isDestroyed() &&
      popupWindow.webContents &&
      popupWindow.isVisible()
    ) {
      popupWindow.webContents.send(
        'clipboard-history-update',
        clipboardHistory
      );
    }
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
    if (popupWindow.webContents) {
      popupWindow.webContents.send(
        'clipboard-history-update',
        clipboardHistory
      );
    }
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

      if (popupWindow.webContents) {
        popupWindow.webContents.send(
          'clipboard-history-update',
          clipboardHistory
        );
      }
    });
  } else {
    if (!popupWindow.isVisible()) {
      popupWindow.show();
    }
    popupWindow.focus();

    if (popupWindow.webContents) {
      popupWindow.webContents.send(
        'clipboard-history-update',
        clipboardHistory
      );
    }
  }
}

app.whenReady().then(() => {
  const iconName =
    process.platform === 'darwin' ? 'iconTemplate.png' : 'icon.png';
  const iconPath = path.join(__dirname, 'assets', iconName);
  try {
    tray = new Tray(iconPath);
  } catch (error) {
    console.error(
      'Failed to create tray icon. Make sure an icon file exists at:',
      iconPath,
      error
    );
  }

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
    clipboardHistory.unshift({
      text: previousClipboardText,
      timestamp: Date.now(),
    });
    if (clipboardHistory.length > MAX_HISTORY_LENGTH) {
      clipboardHistory.length = MAX_HISTORY_LENGTH;
    }
  }

  setInterval(updateClipboardHistory, CLIPBOARD_CHECK_INTERVAL);

  globalShortcut.register('Control+Shift+Space', showPopup);

  ipcMain.on('copy-text-to-clipboard', (event, text) => {
    clipboard.writeText(text);

    const existingIndex = clipboardHistory.findIndex(
      (item) => item.text === text
    );
    if (existingIndex > -1) {
      clipboardHistory.splice(existingIndex, 1);
    }
    clipboardHistory.unshift({ text: text, timestamp: Date.now() });
    if (clipboardHistory.length > MAX_HISTORY_LENGTH) {
      clipboardHistory.length = MAX_HISTORY_LENGTH;
    }
    previousClipboardText = text;

    if (
      popupWindow &&
      !popupWindow.isDestroyed() &&
      popupWindow.webContents &&
      popupWindow.isVisible()
    ) {
      popupWindow.webContents.send(
        'clipboard-history-update',
        clipboardHistory
      );
    }
  });

  ipcMain.on('open-external-link', (event, url) => {
    shell.openExternal(url);
  });
});

app.on('window-all-closed', (event) => {});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  if (popupWindow && !popupWindow.isDestroyed()) {
    popupWindow.destroy();
  }
  if (tray) {
    tray.destroy();
  }
});
