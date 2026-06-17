import type { BrowserWindow } from 'electron'
import type { IdentityService } from '../../application/services/Identity/IdentityService'

/**
 * Driving adapter (spec 006): bridges the IdentityService's active-player /
 * connection changes to the renderer. When the active player switches or the
 * client state changes, it pushes the fresh `ClientStatus` over `identity:changed`
 * so the renderer re-bootstraps for whoever logged in.
 *
 * The IdentityService owns the LCU lifecycle (gateway subscription); this adapter
 * owns only the renderer push, keeping `electron` out of the application layer.
 */
export class LcuEventListener {
  constructor(private readonly identity: IdentityService) {}

  bind(win: BrowserWindow): void {
    this.identity.setListener((status) => {
      if (!win.isDestroyed()) {
        win.webContents.send('identity:changed', status)
      }
    })
  }
}
