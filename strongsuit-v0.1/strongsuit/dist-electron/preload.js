"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
electron_1.contextBridge.exposeInMainWorld('electronAPI', {
    /** Renderer-side TitleBar.tsx uses this to decide whether to draw itself
     *  at all — mac keeps its native inset traffic lights, nothing to render. */
    platform: process.platform,
    windowMinimize: () => electron_1.ipcRenderer.invoke('window-minimize'),
    windowMaximizeToggle: () => electron_1.ipcRenderer.invoke('window-maximize-toggle'),
    windowClose: () => electron_1.ipcRenderer.invoke('window-close'),
    windowIsMaximized: () => electron_1.ipcRenderer.invoke('window-is-maximized'),
    showAppMenu: () => electron_1.ipcRenderer.invoke('show-app-menu'),
    onWindowMaximizedChange: (callback) => {
        const handler = (_event, maximized) => callback(maximized);
        electron_1.ipcRenderer.on('window-maximized-change', handler);
        return () => { electron_1.ipcRenderer.removeListener('window-maximized-change', handler); };
    },
    /** Native menu → router. The main process never touches the renderer's
     *  history directly; it just names a route and the app navigates itself.
     *  Returns an unsubscribe so a remount doesn't stack duplicate listeners. */
    onMenuNavigate: (callback) => {
        const handler = (_event, path) => callback(path);
        electron_1.ipcRenderer.on('menu-navigate', handler);
        return () => { electron_1.ipcRenderer.removeListener('menu-navigate', handler); };
    },
});
