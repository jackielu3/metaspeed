import Phaser from 'phaser'
import { PlatformerHud } from './PlatformerHud'

const WORLD_SCALE = 3

const PLAYER_TUNING = {
    accelX: 400,
    jumpVelocity: 215,
    maxVelocityX: 180,
    maxVelocityY: 350,
    dragX: 900,
    wallSlideMaxFallSpeed: 80,
    wallJumpVelocityX: 120,
    wallCoyoteTimeMs: 120
} as const

enum MovementState
{
    Grounded = 'Grounded',
    Airborne = 'Airborne',
    WallSlide = 'WallSlide'
}

enum RunState
{
    Countdown = 'Countdown',
    Running = 'Running',
    Finished = 'Finished'
}

export class PlatformerScene extends Phaser.Scene
{
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
    private restartKey!: Phaser.Input.Keyboard.Key
    private jumpKey!: Phaser.Input.Keyboard.Key
    private player!: Phaser.Physics.Arcade.Sprite
    private tilemap!: Phaser.Tilemaps.Tilemap
    private groundLayer!: Phaser.Tilemaps.TilemapLayer
    private platformLayer!: Phaser.Tilemaps.TilemapLayer
    private levelWidthPx = 0
    private levelHeightPx = 0
    private hud!: PlatformerHud
    private goalZone!: Phaser.GameObjects.Zone
    private isDead = false
    private movementState: MovementState = MovementState.Airborne

    private runState: RunState = RunState.Countdown
    private runStartTimeMs = -1
    private finalTimeMs = -1
    private countdownEvent?: Phaser.Time.TimerEvent

    private lastWallContactTime = -1
    private lastWallDir: -1 | 0 | 1 = 0

    constructor ()
    {
        super('PlatformerScene')
    }

    preload ()
    {
        this.load.tilemapTiledJSON('level-0', 'assets/maps/level-0.tmj')
        this.load.image('kenny-tiles', 'assets/tiles/kenny_pixel-line-platformer.png')
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

        if (!this.input.keyboard)
        {
            throw new Error('Keyboard input plugin not available')
        }

        this.cursors = this.input.keyboard.createCursorKeys()
        this.restartKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC)
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

        this.hud = new PlatformerHud(this)

        this.tilemap = this.make.tilemap({ key: 'level-0' })
        this.levelWidthPx = this.tilemap.widthInPixels
        this.levelHeightPx = this.tilemap.heightInPixels

        this.physics.world.setBounds(0, 0, this.levelWidthPx, this.levelHeightPx)
        this.physics.world.setBoundsCollision(true, true, false, false)

        const tileset = this.tilemap.addTilesetImage('kenny_pixel-line-platformer', 'kenny-tiles', 8, 8, 0, 0, 1)
        if (!tileset)
        {
            throw new Error('Tileset "kenny_pixel-line-platformer" not found in tilemap. In Tiled, embed the tileset into the map and re-export.')
        }

        const groundLayer = this.tilemap.createLayer('Ground and Wall', tileset, 0, 0)
        const platformLayer = this.tilemap.createLayer('Platforms', tileset, 0, 0)

        if (!groundLayer || !platformLayer)
        {
            throw new Error('Expected Tiled layers "Ground and Wall" and "Platforms" were not found in the tilemap.')
        }

        this.groundLayer = groundLayer
        this.platformLayer = platformLayer

        this.groundLayer.setCollisionByExclusion([-1], true)

        this.platformLayer.setCollisionByExclusion([-1], true)
        this.platformLayer.forEachTile((tile) =>
        {
            if (tile.index === -1)
            {
                return
            }

            tile.setCollision(false, false, true, false)
        })

        this.player = this.physics.add.sprite(64, this.levelHeightPx - 64, 'playerIdle')
        if (this.player.body)
        {
            this.player.body.setSize(this.player.width, this.player.height, true)
        }

        this.player.setCollideWorldBounds(true)
        this.player.setMaxVelocity(PLAYER_TUNING.maxVelocityX, PLAYER_TUNING.maxVelocityY)
        this.player.setDragX(PLAYER_TUNING.dragX)
        this.player.setAccelerationX(0)

        const worldCamera = this.cameras.main
        worldCamera.setBounds(0, 0, this.levelWidthPx, this.levelHeightPx)
        worldCamera.setZoom(WORLD_SCALE)
        worldCamera.roundPixels = true
        worldCamera.startFollow(this.player)

        this.physics.add.collider(this.player, this.groundLayer)
        this.physics.add.collider(this.player, this.platformLayer)

        const goalW = 40
        const goalH = 110
        const goalX = this.levelWidthPx - goalW
        const goalY = this.levelHeightPx - (goalH / 2) - 16

        this.goalZone = this.add.zone(goalX, goalY, goalW, goalH)
        this.physics.add.existing(this.goalZone, true)

        const goalDebugRect = this.add.rectangle(goalX, goalY, goalW, goalH, 0x2dff6c, 0.25)

        this.physics.add.overlap(this.player, this.goalZone, this.handleFinish, undefined, this)

        const uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height)
        uiCamera.setScroll(0, 0)
        uiCamera.setZoom(1)
        uiCamera.roundPixels = true

        worldCamera.ignore(this.hud.getGameObjects())
        uiCamera.ignore([this.groundLayer, this.platformLayer, this.player, this.goalZone, goalDebugRect])
        if (this.physics.world.debugGraphic)
        {
            uiCamera.ignore(this.physics.world.debugGraphic)
        }

        this.game.loop.resetDelta()

        this.startCountdown()
    }

    update ()
    {
        if (Phaser.Input.Keyboard.JustDown(this.restartKey))
        {
            this.scene.restart()
            return
        }

        if (this.runState === RunState.Running && this.runStartTimeMs >= 0)
        {
            this.hud.setTimerMs(this.time.now - this.runStartTimeMs)
        }

        if (!this.isDead)
        {
            if (this.player.y > this.levelHeightPx + 100 || this.player.y < -100)
            {
                this.handleDeath()
                return
            }
        }
        else
        {
            return
        }

        if (this.runState !== RunState.Running)
        {
            return
        }

        const body = this.player.body as Phaser.Physics.Arcade.Body

        const moveAxis = this.getMoveAxis()

        const wallDir = this.getWallDir(body, moveAxis)
        if (wallDir !== 0)
        {
            this.lastWallContactTime = this.time.now
            this.lastWallDir = wallDir
        }

        this.updateMovementState(body, wallDir)
        this.applyHorizontalMovement(moveAxis, wallDir)
        this.applyJump(wallDir)
        this.applyWallSlide(body)
        this.updatePlayerVisuals(body, moveAxis)
    }

    private startCountdown ()
    {
        this.runState = RunState.Countdown
        this.runStartTimeMs = -1
        this.finalTimeMs = -1

        this.hud.hideTimer()
        this.hud.hideFinish()
        this.hud.hideDeathPrompt()

        this.freezePlayer()

        this.countdownEvent?.destroy()

        let remaining = 3
        this.hud.showCountdown(remaining)

        this.countdownEvent = this.time.addEvent({
            delay: 1000,
            repeat: 2,
            callback: () =>
            {
                remaining -= 1

                if (remaining > 0)
                {
                    this.hud.showCountdown(remaining)
                }
                else
                {
                    this.hud.hideCountdown()
                    this.beginRun()
                }
            }
        })
    }

    private beginRun ()
    {
        this.runState = RunState.Running
        this.runStartTimeMs = this.time.now
        this.hud.setTimerMs(0)
        this.hud.showTimer()
        this.unfreezePlayer()
    }

    private handleFinish ()
    {
        if (this.runState !== RunState.Running || this.runStartTimeMs < 0)
        {
            return
        }

        this.runState = RunState.Finished
        this.finalTimeMs = this.time.now - this.runStartTimeMs

        this.freezePlayer()

        this.hud.showFinish(this.finalTimeMs)
    }

    private freezePlayer ()
    {
        const body = this.player.body as Phaser.Physics.Arcade.Body
        body.stop()
        body.enable = false
        this.player.setAccelerationX(0)
    }

    private unfreezePlayer ()
    {
        const body = this.player.body as Phaser.Physics.Arcade.Body
        body.enable = true
        this.player.setAccelerationX(0)
    }

    private getMoveAxis (): -1 | 0 | 1
    {
        const leftDown = this.cursors.left?.isDown ?? false
        const rightDown = this.cursors.right?.isDown ?? false

        if (leftDown === rightDown)
        {
            return 0
        }

        return leftDown ? -1 : 1
    }

    private updateMovementState (body: Phaser.Physics.Arcade.Body, wallDir: -1 | 0 | 1)
    {
        const onGround = body.blocked.down

        if (onGround)
        {
            this.movementState = MovementState.Grounded
            return
        }

        if (wallDir !== 0)
        {
            this.movementState = MovementState.WallSlide
            return
        }

        this.movementState = MovementState.Airborne
    }

    private applyHorizontalMovement (moveAxis: -1 | 0 | 1, wallDir: -1 | 0 | 1)
    {
        if (this.movementState === MovementState.WallSlide)
        {
            if (wallDir !== 0 && moveAxis === -wallDir)
            {
                this.player.setAccelerationX(moveAxis * PLAYER_TUNING.accelX)
                return
            }

            this.player.setAccelerationX(0)

            const body = this.player.body as Phaser.Physics.Arcade.Body
            if ((wallDir === -1 && body.velocity.x < 0) || (wallDir === 1 && body.velocity.x > 0))
            {
                this.player.setVelocityX(0)
            }

            return
        }

        if (moveAxis === 0)
        {
            this.player.setAccelerationX(0)
            return
        }

        this.player.setAccelerationX(moveAxis * PLAYER_TUNING.accelX)
    }

    private applyJump (wallDir: -1 | 0 | 1)
    {
        if (!this.isJumpJustDown())
        {
            return
        }

        if (this.movementState === MovementState.Grounded)
        {
            this.player.setVelocityY(-PLAYER_TUNING.jumpVelocity)
            this.movementState = MovementState.Airborne
            return
        }

        const now = this.time.now
        const coyoteOk = this.lastWallContactTime >= 0 && (now - this.lastWallContactTime) <= PLAYER_TUNING.wallCoyoteTimeMs
        const jumpWallDir = wallDir !== 0 ? wallDir : (coyoteOk ? this.lastWallDir : 0)

        if (jumpWallDir !== 0)
        {
            const pushDir = -jumpWallDir

            this.player.setVelocityX(pushDir * PLAYER_TUNING.wallJumpVelocityX)
            this.player.setVelocityY(-PLAYER_TUNING.jumpVelocity)

            this.movementState = MovementState.Airborne
        }
    }

    private getWallDir (body: Phaser.Physics.Arcade.Body, moveAxis: -1 | 0 | 1): -1 | 0 | 1
    {
        const anyBody = body as unknown as {
            wasTouching?: { left: boolean, right: boolean },
            wasBlocked?: { left: boolean, right: boolean }
        }

        const touchingLeft = body.blocked.left || body.touching.left || (anyBody.wasTouching?.left ?? false) || (anyBody.wasBlocked?.left ?? false)
        const touchingRight = body.blocked.right || body.touching.right || (anyBody.wasTouching?.right ?? false) || (anyBody.wasBlocked?.right ?? false)

        if (touchingLeft && !touchingRight)
        {
            return -1
        }

        if (touchingRight && !touchingLeft)
        {
            return 1
        }

        if (touchingLeft && touchingRight)
        {
            if (moveAxis !== 0)
            {
                return moveAxis
            }

            return body.velocity.x <= 0 ? -1 : 1
        }

        return 0
    }

    private isJumpJustDown (): boolean
    {
        const upJustDown = this.cursors.up ? Phaser.Input.Keyboard.JustDown(this.cursors.up) : false
        const spaceJustDown = Phaser.Input.Keyboard.JustDown(this.jumpKey)

        return upJustDown || spaceJustDown
    }

    private applyWallSlide (body: Phaser.Physics.Arcade.Body)
    {
        if (this.movementState !== MovementState.WallSlide)
        {
            return
        }

        if (body.velocity.y > PLAYER_TUNING.wallSlideMaxFallSpeed)
        {
            this.player.setVelocityY(PLAYER_TUNING.wallSlideMaxFallSpeed)
        }
    }

    private updatePlayerVisuals (body: Phaser.Physics.Arcade.Body, moveAxis: -1 | 0 | 1)
    {
        const onGround = body.blocked.down

        if (moveAxis !== 0)
        {
            this.player.setFlipX(moveAxis === -1)
        }
        else if (body.velocity.x < -5)
        {
            this.player.setFlipX(true)
        }
        else if (body.velocity.x > 5)
        {
            this.player.setFlipX(false)
        }

        if (this.movementState === MovementState.WallSlide)
        {
            this.player.setTexture('playerJump')
            return
        }

        if (!onGround)
        {
            this.player.setTexture('playerJump')
        }
        else if (Math.abs(body.velocity.x) > 10)
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
        this.hud.showDeathPrompt()

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
        const placeholderKeys = ['ground', 'platform', 'playerIdle', 'playerRun', 'playerJump'] as const
        for (const key of placeholderKeys)
        {
            if (this.textures.exists(key))
            {
                this.textures.remove(key)
            }
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
        g.fillRect(0, 0, 8, 12)
        g.generateTexture('playerIdle', 8, 12)
        g.clear()

        g.fillStyle(0x2dff6c, 1)
        g.fillRect(0, 0, 8, 12)
        g.generateTexture('playerRun', 8, 12)
        g.clear()

        g.fillStyle(0xffd34d, 1)
        g.fillRect(0, 0, 8, 12)
        g.generateTexture('playerJump', 8, 12)
        g.clear()

        g.destroy()
    }
}
