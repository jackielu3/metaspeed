import Phaser from 'phaser'
import { PlatformerHud } from './PlatformerHud'

const PLAYER_TUNING = {
    accelX: 1000,
    jumpVelocity: 430,
    maxVelocityX: 400,
    maxVelocityY: 700,
    dragX: 900,
    wallSlideMaxFallSpeed: 160,
    wallJumpVelocityX: 240,
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

const LEVEL_BOUNDS = {
    width: 2400,
    height: 600
} as const

export class PlatformerScene extends Phaser.Scene
{
    private cursors!: Phaser.Types.Input.Keyboard.CursorKeys
    private restartKey!: Phaser.Input.Keyboard.Key
    private jumpKey!: Phaser.Input.Keyboard.Key
    private player!: Phaser.Physics.Arcade.Sprite
    private platforms!: Phaser.Physics.Arcade.StaticGroup
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
        this.jumpKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)

        this.hud = new PlatformerHud(this)

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
        this.player.setAccelerationX(0)

        this.cameras.main.setBounds(0, 0, LEVEL_BOUNDS.width, LEVEL_BOUNDS.height)
        this.cameras.main.startFollow(this.player)

        this.physics.add.collider(this.player, this.platforms)

        const goalX = LEVEL_BOUNDS.width - 1000
        const goalY = LEVEL_BOUNDS.height - 110
        const goalW = 80
        const goalH = 220

        this.goalZone = this.add.zone(goalX, goalY, goalW, goalH)
        this.physics.add.existing(this.goalZone, true)

        this.add.rectangle(goalX, goalY, goalW, goalH, 0x2dff6c, 0.25)

        this.physics.add.overlap(this.player, this.goalZone, this.handleFinish, undefined, this)

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
