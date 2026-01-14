import Phaser from 'phaser'

const PLAYER_TUNING = {
    moveSpeed: 180,
    jumpVelocity: 430,
    maxVelocityX: 220,
    maxVelocityY: 700,
    dragX: 900
} as const

const LEVEL_BOUNDS = {
    width: 2400,
    height: 600
} as const

export class PlatformerScene extends Phaser.Scene
{
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
    private restartKey!: Phaser.Input.Keyboard.Key
    private player!: Phaser.Physics.Arcade.Sprite
    private platforms!: Phaser.Physics.Arcade.StaticGroup
    private deathText!: Phaser.GameObjects.Text
    private isDead = false

    constructor ()
    {
        super('PlatformerScene')
    }

    create ()
    {
        this.createPlaceholderTextures()

        this.isDead = false

        // Handle window focus/blur events to pause/resume the game
        this.game.events.on(Phaser.Core.Events.BLUR, this.handleBlur, this)
        this.game.events.on(Phaser.Core.Events.HIDDEN, this.handleBlur, this)
        this.game.events.on(Phaser.Core.Events.FOCUS, this.handleFocus, this)
        this.game.events.on(Phaser.Core.Events.VISIBLE, this.handleFocus, this)

        this.events.once(Phaser.Scenes.Events.SHUTDOWN, () =>
        {
            this.game.events.off(Phaser.Core.Events.BLUR, this.handleBlur, this)
            this.game.events.off(Phaser.Core.Events.HIDDEN, this.handleBlur, this)
            this.game.events.off(Phaser.Core.Events.FOCUS, this.handleFocus, this)
            this.game.events.off(Phaser.Core.Events.VISIBLE, this.handleFocus, this)
        })

        this.physics.world.setBounds(0, 0, LEVEL_BOUNDS.width, LEVEL_BOUNDS.height)
        this.physics.world.setBoundsCollision(true, true, false, false)

        if (!this.input.keyboard)
        {
            throw new Error('Keyboard input plugin not available')
        }

        this.cursors = this.input.keyboard.createCursorKeys()
        this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)

        this.deathText = this.add.text(
            this.scale.width / 2,
            this.scale.height / 2,
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

        this.platforms = this.physics.add.staticGroup()

        const groundY = LEVEL_BOUNDS.height - 16

        for (let x = 64; x <= LEVEL_BOUNDS.width - 1400; x += 128)
        {
            this.platforms.create(x, groundY, 'ground')
        }

        this.platforms.create(500, 460, 'platform')
        this.platforms.create(650, 340, 'platform')
        this.platforms.create(250, 360, 'platform')

        this.player = this.physics.add.sprite(120, 520, 'playerIdle')

        this.player.setCollideWorldBounds(true)
        this.player.setMaxVelocity(PLAYER_TUNING.maxVelocityX, PLAYER_TUNING.maxVelocityY)
        this.player.setDragX(PLAYER_TUNING.dragX)

        this.cameras.main.setBounds(0, 0, LEVEL_BOUNDS.width, LEVEL_BOUNDS.height)
        this.cameras.main.startFollow(this.player)

        this.physics.add.collider(this.player, this.platforms)

        this.game.loop.resetDelta()
    }

    update ()
    {
        if (Phaser.Input.Keyboard.JustDown(this.restartKey))
        {
            this.scene.restart()
            return
        }

        if (!this.isDead)
        {
            if (this.player.y > LEVEL_BOUNDS.height + 100 || this.player.y < -100)
            {
                this.handleDeath()
                return
            }
        }
        else
        {
            return
        }

        const body = this.player.body as Phaser.Physics.Arcade.Body
        const onGround = body.blocked.down

        if (this.cursors.left?.isDown)
        {
            this.player.setVelocityX(-PLAYER_TUNING.moveSpeed)
            this.player.setFlipX(true)
        }
        else if (this.cursors.right?.isDown)
        {
            this.player.setVelocityX(PLAYER_TUNING.moveSpeed)
            this.player.setFlipX(false)
        }

        if (this.cursors.up && Phaser.Input.Keyboard.JustDown(this.cursors.up) && onGround)
        {
            this.player.setVelocityY(-PLAYER_TUNING.jumpVelocity)
        }

        if (!onGround)
        {
            this.player.setTexture('playerJump')
        }
        else if (this.cursors.left?.isDown || this.cursors.right?.isDown)
        {
            this.player.setTexture('playerRun')
        }
        else
        {
            this.player.setTexture('playerIdle')
        }
    }

    private handleDeath ()
    {
        this.isDead = true
        this.deathText.setVisible(true)

        const body = this.player.body as Phaser.Physics.Arcade.Body
        body.stop()
        body.enable = false
    }

    private handleBlur ()
    {
        this.scene.pause()
    }

    private handleFocus ()
    {
        this.game.loop.resetDelta()
        this.scene.resume()
    }

    private createPlaceholderTextures ()
    {
        if (this.textures.exists('ground'))
        {
            return
        }

        const g = this.add.graphics()

        g.fillStyle(0x4a4a4a, 1)
        g.fillRect(0, 0, 128, 32)
        g.generateTexture('ground', 128, 32)
        g.clear()

        g.fillStyle(0x6a6a6a, 1)
        g.fillRect(0, 0, 128, 18)
        g.generateTexture('platform', 128, 18)
        g.clear()

        g.fillStyle(0x2aa7ff, 1)
        g.fillRect(0, 0, 32, 48)
        g.generateTexture('playerIdle', 32, 48)
        g.clear()

        g.fillStyle(0x2dff6c, 1)
        g.fillRect(0, 0, 32, 48)
        g.generateTexture('playerRun', 32, 48)
        g.clear()

        g.fillStyle(0xffd34d, 1)
        g.fillRect(0, 0, 32, 48)
        g.generateTexture('playerJump', 32, 48)
        g.clear()

        g.destroy()
    }
}
