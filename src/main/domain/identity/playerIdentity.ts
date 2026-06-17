import type { Account } from '@shared/types'

/**
 * Value object for the active player's identity (spec 006), independent of where
 * it came from (live client or local cache). `puuid` is the join key to all
 * stored data; `platform`/`region` carry Riot Web API routing.
 */
export class PlayerIdentity {
  constructor(
    public puuid: string,
    readonly gameName: string,
    readonly tagLine: string,
    readonly platform: string,
    readonly region: string
  ) { }

  get riotId(): string {
    return `${this.gameName}#${this.tagLine}`
  }

  toAccount(encryptedPuuid?: string): Account {
    if (!this.hasEncryptedPuuid() && !encryptedPuuid) {
      throw new Error('PlayerIdentity: Cannot create Account without encrypted puuid.')
    }

    return {
      puuid: encryptedPuuid ?? this.puuid,
      gameName: this.gameName,
      tagLine: this.tagLine,
      platform: this.platform,
      region: this.region
    }
  }

  hasEncryptedPuuid(): boolean {
    return this.puuid.length === 78
  }

  setEncryptedPuuid(encryptedPuuid: string): void {
    if (this.hasEncryptedPuuid()) {
      throw new Error('PlayerIdentity: Already has encrypted puuid.')
    }

    if (encryptedPuuid.length !== 78) {
      throw new Error('PlayerIdentity: Invalid encrypted puuid.')
    }

    this.puuid = encryptedPuuid
  }

  static fromAccount(a: Account): PlayerIdentity {
    return new PlayerIdentity(a.puuid, a.gameName, a.tagLine, a.platform, a.region)
  }

  /** True only when every field needed to load + route data is present. A
   *  player is never activated from an incomplete identity (FR-006). */
  static isComplete(p: Partial<Account> | null | undefined): p is Account {
    return (
      !!p &&
      !!p.puuid &&
      !!p.gameName &&
      !!p.tagLine &&
      !!p.platform &&
      !!p.region
    )
  }

  equalsTo(other: PlayerIdentity): boolean {
    if (other.hasEncryptedPuuid() && this.hasEncryptedPuuid()) {
      return this.puuid === other.puuid
    }

    return (
      this.gameName === other.gameName &&
      this.tagLine === other.tagLine &&
      this.platform === other.platform &&
      this.region === other.region
    )
  }
}
