import { IdentityClient, WalletClient } from '@bsv/sdk'
import type { DisplayableIdentity } from '@bsv/sdk'

const identityCache = new Map<string, DisplayableIdentity | null>()
let identityClient: IdentityClient | null = null

export function shortenIdentityKey(key: string): string {
    if (key.length <= 12) {
        return key
    }

    return `${key.slice(0, 6)}...`
}

export function isLikelyIdentityKey(str: string): boolean {
    return /^[0-9a-fA-F]{66}$/.test(str)
}

export async function resolveIdentityKey(identityKey: string): Promise<DisplayableIdentity | null> {
    if (!isLikelyIdentityKey(identityKey)) {
        return null
    }

    if (identityCache.has(identityKey)) {
        return identityCache.get(identityKey) ?? null
    }

    if (!identityClient) {
        identityClient = new IdentityClient(new WalletClient())
    }

    try {
        const identities = await identityClient.resolveByIdentityKey({ identityKey })
        const identity = identities.length > 0 ? identities[0] : null
        identityCache.set(identityKey, identity)
        return identity
    } catch {
        identityCache.set(identityKey, null)
        return null
    }
}
