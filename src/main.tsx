import Phaser from 'phaser'
import { PlatformerScene } from './scenes/PlatformerScene'

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    width: 800,
    height: 600,
    parent: 'app',
    backgroundColor: '#fbe3d2',
    fps: {
        target: 60,
        smoothStep: false,
        deltaHistory: 1,
        panicMax: 0
    },
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { x: 0, y: 900 },
            debug: true
        }
    },
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH
    },
    scene: [PlatformerScene]
}

new Phaser.Game(config)
