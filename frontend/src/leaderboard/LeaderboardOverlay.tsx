import { useEffect, useMemo, useRef, useState } from 'react'
import { LeaderLibClient } from '@leaderlib/client'
import type { LeaderboardEntry } from '@leaderlib/client'

import { LEADERBOARD_ID, LEADERBOARD_REFRESH_MS, LEADERBOARD_TOP_N, NETWORK_PRESET } from './leaderboardConfig'
import { formatTimeMs } from './time'
import { isLikelyIdentityKey, resolveIdentityKey, shortenIdentityKey } from './identity'

type LeaderboardRow = {
    score: number
    playerId?: string
    submittedAt: number
    txid: string
}

function useCanvasWidth(): number | null {
    const [width, setWidth] = useState<number | null>(null)

    useEffect(() => {
        const root = document.getElementById('app')
        if (!root) {
            return
        }

        let ro: ResizeObserver | null = null
        let attachedCanvas: HTMLCanvasElement | null = null
        const update = () => {
            if (!attachedCanvas) {
                return
            }
            const rect = attachedCanvas.getBoundingClientRect()
            setWidth(rect.width)
        }

        const attach = (canvas: HTMLCanvasElement) => {
            attachedCanvas = canvas
            update()

            ro?.disconnect()
            ro = new ResizeObserver(update)
            ro.observe(canvas)
            window.addEventListener('resize', update)
        }

        const maybeAttach = () => {
            const canvas = root.querySelector('canvas') as HTMLCanvasElement | null
            if (canvas && canvas !== attachedCanvas) {
                attach(canvas)
            }
        }

        const mo = new MutationObserver(() => {
            maybeAttach()
        })
        mo.observe(root, { childList: true, subtree: true })
        maybeAttach()

        return () => {
            mo.disconnect()
            ro?.disconnect()
            window.removeEventListener('resize', update)
        }
    }, [])

    return width
}

export function LeaderboardOverlay() {
    const canvasWidth = useCanvasWidth()

    const [rows, setRows] = useState<LeaderboardRow[]>([])
    const [loading, setLoading] = useState(true)
    const [resolvedNames, setResolvedNames] = useState<Map<string, string>>(new Map())

    const resolvingRef = useRef<Set<string>>(new Set())

    const client = useMemo(() => {
        return new LeaderLibClient(LEADERBOARD_ID, {
            networkPreset: NETWORK_PRESET
        })
    }, [])

    const refresh = async () => {
        setLoading(true)
        try {
            const results = await client.getTop(LEADERBOARD_TOP_N)
            setRows((results as LeaderboardEntry[]).map((r) => ({
                score: r.score,
                playerId: r.playerId,
                submittedAt: r.submittedAt,
                txid: r.txid
            })))
        } catch {
            setRows([])
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        refresh()

        const interval = window.setInterval(() => {
            refresh()
        }, LEADERBOARD_REFRESH_MS)

        const onRefresh = () => {
            refresh()
        }

        window.addEventListener('metaspeed:leaderboard-refresh', onRefresh)

        return () => {
            window.clearInterval(interval)
            window.removeEventListener('metaspeed:leaderboard-refresh', onRefresh)
        }
    }, [client])

    useEffect(() => {
        const identityKeys = rows
            .map((r) => r.playerId)
            .filter((id): id is string => !!id && isLikelyIdentityKey(id))

        for (const key of identityKeys) {
            if (resolvedNames.has(key) || resolvingRef.current.has(key)) {
                continue
            }

            resolvingRef.current.add(key)
            resolveIdentityKey(key)
                .then((identity) => {
                    if (identity?.name) {
                        setResolvedNames((prev) => {
                            const next = new Map(prev)
                            next.set(key, identity.name)
                            return next
                        })
                    }
                })
                .finally(() => {
                    resolvingRef.current.delete(key)
                })
        }
    }, [rows, resolvedNames])

    const widthStyle = canvasWidth ? { width: `${canvasWidth}px` } : { width: '100%' }

    return (
        <div style={{
            ...widthStyle,
            maxWidth: '100%',
            height: '240px',
            background: 'rgba(0,0,0,0.92)',
            color: 'rgba(255,255,255,0.92)',
            borderTop: '1px solid rgba(255,255,255,0.12)',
            boxSizing: 'border-box',
            display: 'flex',
            flexDirection: 'column'
        }}>
            <div style={{
                padding: '10px 12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline'
            }}>
                <div style={{ fontSize: '14px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                    Leaderboard
                </div>
                <div style={{ fontSize: '12px', opacity: 0.7 }}>
                    {loading ? 'Loading…' : `Top ${LEADERBOARD_TOP_N}`}
                </div>
            </div>

            <div style={{ flex: 1, overflow: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                    <thead>
                        <tr style={{ opacity: 0.7 }}>
                            <th style={{ textAlign: 'left', padding: '6px 12px', width: '52px' }}>#</th>
                            <th style={{ textAlign: 'left', padding: '6px 12px' }}>Player</th>
                            <th style={{ textAlign: 'right', padding: '6px 12px', width: '110px' }}>Time</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row, idx) => {
                            const playerId = row.playerId
                            const fallback = playerId ? shortenIdentityKey(playerId) : 'Anonymous'
                            const playerName = playerId && resolvedNames.get(playerId) ? resolvedNames.get(playerId)! : fallback

                            return (
                                <tr key={row.txid} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                                    <td style={{ padding: '8px 12px', opacity: 0.8 }}>{idx + 1}</td>
                                    <td style={{ padding: '8px 12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 1 }}>
                                        {playerName}
                                    </td>
                                    <td style={{ padding: '8px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                                        {formatTimeMs(row.score)}
                                    </td>
                                </tr>
                            )
                        })}
                        {rows.length === 0 && !loading && (
                            <tr>
                                <td colSpan={3} style={{ padding: '14px 12px', opacity: 0.7 }}>
                                    No scores yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
