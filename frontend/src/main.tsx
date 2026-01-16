import Phaser from 'phaser'
import { PlatformerScene } from './scenes/PlatformerScene'
import { createRoot } from 'react-dom/client'
import { OverlayRoot } from './tokenServer/OverlayRoot'

const debug = new URLSearchParams(window.location.search).has('debug')

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'app',
    backgroundColor: '#fcdfcd',
    pixelArt: true,
    fps: {
        target: 60,
        smoothStep: false,
        deltaHistory: 1,
        panicMax: 0
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 1800 },
            debug
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [PlatformerScene]
}

let game: Phaser.Game | null = null

function startGame()
{
    if (game)
    {
        return
    }
    game = new Phaser.Game(config)

    window.setTimeout(() => {
        game?.scale.refresh()
    }, 0)
}

const overlayRootEl = document.getElementById('overlay-root')
if (overlayRootEl)
{
    createRoot(overlayRootEl).render(<OverlayRoot startGame={startGame} />)
}
