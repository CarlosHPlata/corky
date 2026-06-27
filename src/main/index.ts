import { app, BrowserWindow, shell } from 'electron'
import { join } from 'path'
import { closeDatabase } from './infrastructure/database'
import { buildContainer } from './infrastructure/container'
import { registerTelemetryConsoleLogger } from './infrastructure/telemetryLogger'
import { registerIpcHandlers } from './adapters/driving/IpcController'

let container: ReturnType<typeof buildContainer> | null = null

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return win
}

app.whenReady().then(() => {
  try {
    // Subscribe the console observer BEFORE the container wires the observed
    // proxies, so even initialisation-time calls are visible.
    registerTelemetryConsoleLogger()
    container = buildContainer()
    registerIpcHandlers(container)
  } catch (err) {
    console.error('Failed to initialise Corky:', err)
  }

  const win = createWindow()

  // League client identity (spec 006) + LCU connection observer (spec 007):
  // bind the renderer push to this window, wire identity to the live client,
  // then start the shared connection observer. identity.start() registers its
  // observer subscription synchronously and resolves the cached player so the
  // app works offline; starting the observer last begins emitting up/down edges
  // to the now-subscribed gateway. When a player logs in, the listener pushes
  // `identity:changed` and the app reloads.
  if (container) {
    container.lcuEventListener.bind(win)
    container.champSelectListener.bind(win)
    container.identityService
      .start()
      .catch((err) => console.error('identity service failed to start:', err))
    // Live game feed (spec 007): register the gameflow + champ-select
    // subscriptions, then start the shared gateway (which opens the WS on the
    // observer's 'up' edge), then start the observer — so by the first 'up' the
    // topics are already subscribed.
    container.liveGameService.start()
    container.champSelectService.start()
    container.liveClient.start()
    container.lcuConnection.start()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  container?.identityService.stop()
  container?.liveGameService.stop()
  container?.champSelectService.stop()
  container?.liveClient.stop()
  container?.lcuConnection.stop()
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})
