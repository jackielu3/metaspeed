import { useEffect, useState } from 'react'
import { LeaderboardOverlay } from '../leaderboard/LeaderboardOverlay'
import { TokenOverlay } from './TokenOverlay'

type Props = {
    startGame: () => void
}

export function OverlayRoot({ startGame }: Props)
{
    const [admitted, setAdmitted] = useState(false)

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
        if (admitted) {
            startGame()
        }
    }, [admitted, startGame])

    const widthStyle = canvasWidth ? { width: `${canvasWidth}px` } : { width: '100%' }

    return (
        <div style={{
            ...widthStyle,
            maxWidth: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'stretch'
        }}>
            <TokenOverlay onAdmitted={() => setAdmitted(true)} />
            <LeaderboardOverlay />
        </div>
    )
}
