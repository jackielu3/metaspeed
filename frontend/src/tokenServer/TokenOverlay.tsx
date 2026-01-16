import { useCallback, useEffect, useMemo, useState } from 'react'
import BabbageGo from '@babbage/go'
import { AuthFetch } from '@bsv/sdk'

import { ADMIN_IDENTITY_KEY, TOKEN_SERVER } from './tokenServerConfig'

type LevelStatus = {
    active: boolean
    levelId?: string
    entryFeeSats?: number
    potSats?: number
    admitted?: boolean
    treasurySats?: number
}

type WithdrawResponse = {
    transaction: number[]
    derivationPrefix: string
    derivationSuffix: string
    amount: number
    senderIdentityKey: string
}

type Props = {
    onAdmitted: () => void
}

export function TokenOverlay({ onAdmitted }: Props)
{
    const wallet = useMemo(() => {
        return new BabbageGo(undefined, {
            showModal: true,
            design: {
                preset: 'auroraPulse'
            }
        })
    }, [])

    const authFetch = useMemo(() => {
        return new AuthFetch(wallet)
    }, [wallet])

    const [identityKey, setIdentityKey] = useState<string | null>(null)
    const [status, setStatus] = useState<LevelStatus | null>(null)
    const [loading, setLoading] = useState(true)
    const [entering, setEntering] = useState(false)
    const [view, setView] = useState<'game' | 'account' | 'admin'>('game')

    const [accountBalance, setAccountBalance] = useState<number | null>(null)
    const [accountLoading, setAccountLoading] = useState(false)

    const [adminWinnerIdentityKey, setAdminWinnerIdentityKey] = useState('')
    const [adminNextLevelId, setAdminNextLevelId] = useState('')
    const [adminStatus, setAdminStatus] = useState<any>(null)
    const [adminLoading, setAdminLoading] = useState(false)

    const isAdmin = identityKey === ADMIN_IDENTITY_KEY

    const refreshLevelStatus = useCallback(async () => {
        setLoading(true)
        try {
            const pk = await wallet.getPublicKey({ identityKey: true })
            const key = pk.publicKey.toString()
            setIdentityKey(key)

            const resp = await authFetch.fetch(`${TOKEN_SERVER}/level/current`, {
                method: 'POST',
                body: JSON.stringify({}),
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (!resp) {
                throw new Error('Failed to reach token server')
            }

            const json = (await resp.json()) as LevelStatus
            setStatus(json)

            if (json.active && json.admitted) {
                onAdmitted()
            }
        }
        catch {
            setStatus(null)
        }
        finally {
            setLoading(false)
        }
    }, [authFetch, onAdmitted, wallet])

    const enterLevel = useCallback(async () => {
        setEntering(true)
        try {
            const resp = await authFetch.fetch(`${TOKEN_SERVER}/level/enter`, {
                method: 'POST',
                body: JSON.stringify({}),
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (!resp) {
                throw new Error('Failed to enter level')
            }

            const json = await resp.json()

            if (json?.admitted) {
                await refreshLevelStatus()
                onAdmitted()
            }
        }
        catch {
        }
        finally {
            setEntering(false)
        }
    }, [authFetch, onAdmitted, refreshLevelStatus])

    const refreshAccount = useCallback(async () => {
        if (!identityKey) {
            return
        }

        setAccountLoading(true)
        try {
            const resp = await authFetch.fetch(`${TOKEN_SERVER}/account/balance`, {
                method: 'POST',
                body: JSON.stringify({ publicKey: identityKey }),
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (!resp) {
                throw new Error('Failed to fetch balance')
            }

            const json = await resp.json()
            setAccountBalance(typeof json?.balance === 'number' ? json.balance : 0)
        }
        catch {
            setAccountBalance(null)
        }
        finally {
            setAccountLoading(false)
        }
    }, [authFetch, identityKey])

    const withdraw = useCallback(async () => {
        if (!identityKey) {
            return
        }

        setAccountLoading(true)
        try {
            const resp = await authFetch.fetch(`${TOKEN_SERVER}/account/withdraw`, {
                method: 'POST',
                body: JSON.stringify({ publicKey: identityKey }),
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (!resp) {
                throw new Error('Failed to withdraw')
            }

            const json = (await resp.json()) as WithdrawResponse

            if (!json?.transaction || !Array.isArray(json.transaction)) {
                await refreshAccount()
                return
            }

            await wallet.internalizeAction({
                tx: json.transaction as any,
                outputs: [
                    {
                        paymentRemittance: {
                            derivationPrefix: json.derivationPrefix,
                            derivationSuffix: json.derivationSuffix,
                            senderIdentityKey: json.senderIdentityKey
                        },
                        outputIndex: 0,
                        protocol: 'wallet payment'
                    }
                ],
                description: 'Withdraw from Metaspeed'
            })

            await refreshAccount()
        }
        catch {
        }
        finally {
            setAccountLoading(false)
        }
    }, [authFetch, identityKey, refreshAccount, wallet])

    const refreshAdminStatus = useCallback(async () => {
        if (!isAdmin) {
            return
        }

        setAdminLoading(true)
        try {
            const resp = await authFetch.fetch(`${TOKEN_SERVER}/admin/status`, {
                method: 'POST',
                body: JSON.stringify({}),
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (!resp) {
                throw new Error('Failed to fetch admin status')
            }

            setAdminStatus(await resp.json())
        }
        catch {
            setAdminStatus(null)
        }
        finally {
            setAdminLoading(false)
        }
    }, [authFetch, isAdmin])

    const adminPayout = useCallback(async () => {
        if (!isAdmin) {
            return
        }

        setAdminLoading(true)
        try {
            const resp = await authFetch.fetch(`${TOKEN_SERVER}/admin/payout`, {
                method: 'POST',
                body: JSON.stringify({ winnerIdentityKey: adminWinnerIdentityKey }),
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (!resp) {
                throw new Error('Failed to payout')
            }

            await resp.json()
            await refreshAdminStatus()
            await refreshLevelStatus()
        }
        catch {
        }
        finally {
            setAdminLoading(false)
        }
    }, [adminWinnerIdentityKey, authFetch, isAdmin, refreshAdminStatus, refreshLevelStatus])

    const adminSetCurrentLevel = useCallback(async () => {
        if (!isAdmin) {
            return
        }

        setAdminLoading(true)
        try {
            const resp = await authFetch.fetch(`${TOKEN_SERVER}/admin/set-current-level`, {
                method: 'POST',
                body: JSON.stringify({ levelId: adminNextLevelId }),
                headers: {
                    'Content-Type': 'application/json'
                }
            })

            if (!resp) {
                throw new Error('Failed to set current level')
            }

            await resp.json()
            await refreshAdminStatus()
            await refreshLevelStatus()
        }
        catch {
        }
        finally {
            setAdminLoading(false)
        }
    }, [adminNextLevelId, authFetch, isAdmin, refreshAdminStatus, refreshLevelStatus])

    useEffect(() => {
        refreshLevelStatus()
    }, [refreshLevelStatus])

    useEffect(() => {
        if (view === 'account') {
            refreshAccount()
        }
        if (view === 'admin') {
            refreshAdminStatus()
        }
    }, [refreshAccount, refreshAdminStatus, view])

    if (view === 'account') {
        return (
            <div style={{ width: '100%', background: 'rgba(0,0,0,0.92)', color: 'rgba(255,255,255,0.92)', borderTop: '1px solid rgba(255,255,255,0.12)', padding: '12px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '13px' }}>Account</div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        {isAdmin && <button className="button" onClick={() => setView('admin')}>Admin</button>}
                        <button className="button" onClick={() => setView('game')}>Back</button>
                    </div>
                </div>

                <div style={{ marginTop: '10px', fontSize: '13px', opacity: 0.85 }}>
                    <div>Identity: {identityKey || '—'}</div>
                    <div style={{ marginTop: '6px' }}>Balance: {accountBalance == null ? '—' : `${accountBalance} sats`}</div>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                    <button className="button" disabled={accountLoading} onClick={refreshAccount}>{accountLoading ? 'Loading…' : 'Refresh'}</button>
                    <button className="button" disabled={accountLoading || !accountBalance} onClick={withdraw}>{accountLoading ? 'Working…' : 'Withdraw'}</button>
                </div>
            </div>
        )
    }

    if (view === 'admin') {
        return (
            <div style={{ width: '100%', background: 'rgba(0,0,0,0.92)', color: 'rgba(255,255,255,0.92)', borderTop: '1px solid rgba(255,255,255,0.12)', padding: '12px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '13px' }}>Admin</div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="button" onClick={() => setView('account')}>Account</button>
                        <button className="button" onClick={() => setView('game')}>Back</button>
                    </div>
                </div>

                <div style={{ marginTop: '10px', fontSize: '13px', opacity: 0.85 }}>
                    <div>Identity: {identityKey || '—'}</div>
                    <div style={{ marginTop: '6px' }}>Active level: {adminStatus?.activeLevel?.levelId || '—'}</div>
                    <div style={{ marginTop: '6px' }}>Pot: {typeof adminStatus?.activeLevel?.potSats === 'number' ? `${adminStatus.activeLevel.potSats} sats` : '—'}</div>
                    <div style={{ marginTop: '6px' }}>Treasury: {typeof adminStatus?.treasurySats === 'number' ? `${adminStatus.treasurySats} sats` : '—'}</div>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button className="button" disabled={adminLoading} onClick={refreshAdminStatus}>{adminLoading ? 'Loading…' : 'Refresh'}</button>
                </div>

                <div style={{ marginTop: '14px', display: 'grid', gridTemplateColumns: '1fr', gap: '10px' }}>
                    <div>
                        <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>Winner identity key</div>
                        <input value={adminWinnerIdentityKey} onChange={(e) => setAdminWinnerIdentityKey(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
                        <div style={{ marginTop: '6px' }}>
                            <button className="button" disabled={adminLoading || !adminWinnerIdentityKey} onClick={adminPayout}>{adminLoading ? 'Working…' : 'Payout + Close Current Level'}</button>
                        </div>
                    </div>

                    <div>
                        <div style={{ fontSize: '12px', opacity: 0.8, marginBottom: '4px' }}>New levelId</div>
                        <input value={adminNextLevelId} onChange={(e) => setAdminNextLevelId(e.target.value)} style={{ width: '100%', padding: '8px', boxSizing: 'border-box' }} />
                        <div style={{ marginTop: '6px' }}>
                            <button className="button" disabled={adminLoading || !adminNextLevelId} onClick={adminSetCurrentLevel}>{adminLoading ? 'Working…' : 'Set Current Level'}</button>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    const showGate = !loading && status?.active && !status?.admitted

    return (
        <>
            <div style={{ width: '100%', background: 'rgba(0,0,0,0.92)', color: 'rgba(255,255,255,0.92)', borderTop: '1px solid rgba(255,255,255,0.12)', padding: '12px', boxSizing: 'border-box' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <div style={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '13px' }}>Metaspeed</div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="button" onClick={() => setView('account')}>Account</button>
                        {isAdmin && <button className="button" onClick={() => setView('admin')}>Admin</button>}
                    </div>
                </div>

                <div style={{ marginTop: '10px', fontSize: '13px', opacity: 0.85 }}>
                    <div>Level: {status?.active ? status.levelId : '—'}</div>
                    <div style={{ marginTop: '6px' }}>Pot: {typeof status?.potSats === 'number' ? `${status.potSats} sats` : '—'}</div>
                </div>

                <div style={{ marginTop: '12px', display: 'flex', gap: '10px' }}>
                    <button className="button" disabled={loading} onClick={refreshLevelStatus}>{loading ? 'Loading…' : 'Refresh'}</button>
                    {showGate && (
                        <button className="button" disabled={entering} onClick={enterLevel}>{entering ? 'Paying…' : `Pay ${status?.entryFeeSats ?? 100000} sats to Play`}</button>
                    )}
                </div>
            </div>

            {showGate && (
                <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                    <div style={{ width: 'min(560px, calc(100% - 24px))', background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: '10px', padding: '18px', boxSizing: 'border-box' }}>
                        <div style={{ fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', fontSize: '13px' }}>Entry Required</div>
                        <div style={{ marginTop: '10px', fontSize: '14px', opacity: 0.9, lineHeight: 1.4 }}>
                            You must pay {status?.entryFeeSats ?? 100000} sats to enter this level.
                        </div>
                        <div style={{ marginTop: '8px', fontSize: '13px', opacity: 0.75 }}>
                            Level: {status?.levelId}
                        </div>
                        <div style={{ marginTop: '14px', display: 'flex', gap: '10px' }}>
                            <button className="button" disabled={entering} onClick={enterLevel}>{entering ? 'Paying…' : 'Pay to Enter'}</button>
                            <button className="button" disabled={entering} onClick={refreshLevelStatus}>Retry</button>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}
