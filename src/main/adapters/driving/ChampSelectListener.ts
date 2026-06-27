import type { BrowserWindow } from 'electron'
import type { ChampSelectService } from '../../application/services/ChampSelect/ChampSelectService'

/**
 * Driving adapter (spec 007): bridges live champ-select state to the renderer.
 * On every update it pushes the DTO over `champSelect:changed`; on the
 * entered transition (inactive → active) it brings the window to the front so
 * the player sees Corky's read the moment champ select opens (point 1).
 *
 * It detects the transition from the pushed states themselves, keeping all
 * `electron` concerns here and out of the framework-free service.
 */
export class ChampSelectListener {
  private wasActive = false

  constructor(private readonly champSelect: ChampSelectService) {}

  bind(win: BrowserWindow): void {
    this.champSelect.setListener((state) => {
      if (!win.isDestroyed()) {
        win.webContents.send('champSelect:changed', state)
      }
      if (state.active && !this.wasActive && !win.isDestroyed()) {
        // Bring Corky forward as champ select opens (don't force-steal a
        // fullscreen game; flashFrame nudges the taskbar if focus is denied).
        if (win.isMinimized()) win.restore()
        win.show()
        win.focus()
        win.flashFrame(true)
      }
      this.wasActive = state.active
    })
  }
}
