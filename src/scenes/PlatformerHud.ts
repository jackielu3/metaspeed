import Phaser from 'phaser'

export class PlatformerHud
{
    private scene: Phaser.Scene

    private deathText: Phaser.GameObjects.Text
    private countdownText: Phaser.GameObjects.Text
    private timerText: Phaser.GameObjects.Text
    private finishText: Phaser.GameObjects.Text

    constructor (scene: Phaser.Scene)
    {
        this.scene = scene

        this.deathText = this.scene.add.text(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
            'Press ESC to restart',
            {
                color: '#ff3b3b',
                fontSize: '24px'
            }
        )
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(1000)
            .setVisible(false)

        this.countdownText = this.scene.add.text(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
            '3',
            {
                color: '#ffffff',
                fontSize: '72px'
            }
        )
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(1000)
            .setVisible(false)

        this.timerText = this.scene.add.text(
            this.scene.scale.width - 16,
            16,
            '0:00.000',
            {
                color: '#ffffff',
                fontSize: '18px'
            }
        )
            .setOrigin(1, 0)
            .setScrollFactor(0)
            .setDepth(1000)
            .setVisible(false)

        this.finishText = this.scene.add.text(
            this.scene.scale.width / 2,
            this.scene.scale.height / 2,
            '',
            {
                color: '#ffffff',
                fontSize: '28px',
                align: 'center'
            }
        )
            .setOrigin(0.5)
            .setScrollFactor(0)
            .setDepth(1000)
            .setVisible(false)
    }

    showDeathPrompt ()
    {
        this.deathText.setVisible(true)
    }

    hideDeathPrompt ()
    {
        this.deathText.setVisible(false)
    }

    showCountdown (value: number)
    {
        this.countdownText.setText(String(value)).setVisible(true)
    }

    hideCountdown ()
    {
        this.countdownText.setVisible(false)
    }

    showTimer ()
    {
        this.timerText.setVisible(true)
    }

    hideTimer ()
    {
        this.timerText.setVisible(false)
    }

    setTimerMs (elapsedMs: number)
    {
        this.timerText.setText(this.formatTimeMs(elapsedMs))
    }

    showFinish (finalTimeMs: number)
    {
        const formatted = this.formatTimeMs(finalTimeMs)
        this.finishText
            .setText(`Finished!\nTime: ${formatted}\n\nPress ESC to retry`)
            .setVisible(true)
    }

    hideFinish ()
    {
        this.finishText.setVisible(false)
    }

    getGameObjects (): Phaser.GameObjects.GameObject[]
    {
        return [this.deathText, this.countdownText, this.timerText, this.finishText]
    }

    private formatTimeMs (ms: number): string
    {
        const clamped = Math.max(0, Math.floor(ms))
        const minutes = Math.floor(clamped / 60000)
        const seconds = Math.floor((clamped % 60000) / 1000)
        const millis = clamped % 1000

        const s = String(seconds).padStart(2, '0')
        const m = String(millis).padStart(3, '0')

        return `${minutes}:${s}.${m}`
    }
}
