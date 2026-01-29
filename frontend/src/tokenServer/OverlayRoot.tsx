import { Suspense, lazy, useEffect, useState } from 'react'
import { LeaderboardOverlay } from '../leaderboard/LeaderboardOverlay'

const TokenOverlay = lazy(async () => {
    const m = await import('./TokenOverlay')
    return { default: m.TokenOverlay }
})

type Props = {
    startGame: () => void
}

export function OverlayRoot({ startGame }: Props)
{
    const [admitted, setAdmitted] = useState(false)

    const noWalletMode = (window as any).METASPEED_NO_WALLET_MODE === true

    const [canvasWidth, setCanvasWidth] = useState<number | null>(null)

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
            setCanvasWidth(rect.width)
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

    useEffect(() => {
        if (noWalletMode) {
            startGame()
            return
        }

        if (admitted) {
            startGame()
        }
    }, [admitted, noWalletMode, startGame])

    const widthStyle = canvasWidth ? { width: `${canvasWidth}px` } : { width: '100%' }

    return (
        <div style={{
            ...widthStyle,
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch'
        }}>
            {!noWalletMode && (
                <Suspense fallback={null}>
                    <TokenOverlay onAdmitted={() => setAdmitted(true)} />
                </Suspense>
            )}
            <LeaderboardOverlay />
        </div>
    )
}
