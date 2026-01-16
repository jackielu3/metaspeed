import Phaser from 'phaser'
import { PlatformerHud } from './PlatformerHud'
import { LeaderLibClient } from '@leaderlib/client'
import { WalletClient } from '@bsv/sdk'
import BabbageGo from '@babbage/go'
import { LEADERBOARD_ID, SIGNER_URL, NETWORK_PRESET, DEVELOPER_IDENTITY, SUBMIT_FEE_SATS } from '../leaderboard/leaderboardConfig'
import { resolveIdentityKey, shortenIdentityKey } from '../leaderboard/identity'

const WORLD_SCALE = 1

const STICKMAN_FRAME_W = 64
const STICKMAN_FRAME_H = 80
const STICKMAN_OUTPUT_SCALE = 1

let stickmanTrimCache: { originY: number, pivotY: number } | null = null

const PLAYER_TUNING = {
    accelX: 1400,
    jumpVelocity: 800,
    maxVelocityX: 720,
    maxVelocityY: 700,
    dragX: 900 * 4,
    wallSlideMaxFallSpeed: 320,
    wallJumpVelocityX: 480,
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
    private submitKey!: Phaser.Input.Keyboard.Key
    private skipKey!: Phaser.Input.Keyboard.Key
    private player!: Phaser.Physics.Arcade.Sprite
    private tilemap!: Phaser.Tilemaps.Tilemap
    private groundLayer!: Phaser.Tilemaps.TilemapLayer
    private platformLayer!: Phaser.Tilemaps.TilemapLayer
    private levelWidthPx = 0
    private levelHeightPx = 0
    private hud!: PlatformerHud
    private isDead = false
    private movementState: MovementState = MovementState.Airborne

    private runState: RunState = RunState.Countdown
    private runStartTimeMs = -1
    private finalTimeMs = -1
    private countdownEvent?: Phaser.Time.TimerEvent

    private leaderboardPromptVisible = false
    private leaderboardSubmitting = false
    private leaderboardSubmitted = false
    private finishNonce = 0

    private lastWallContactTime = -1
    private lastWallDir: -1 | 0 | 1 = 0
    private lastWallTouchTime = -1
    private lastWallTouchDir: -1 | 0 | 1 = 0

    private stickmanOriginY = 1
    private stickmanPivotY = STICKMAN_FRAME_H

    private lastPlayedAnimKey: string | null = null

    constructor ()
    {
        super('PlatformerScene')
    }

    preload ()
    {
        this.load.tilemapTiledJSON('level-0', 'assets/maps/level-0.tmj')
        this.load.image('kenny-tiles', 'assets/tiles/32x32-kenny_pixel-line-platformer.png')

        this.load.spritesheet('stickmanIdleRaw', 'assets/MoNsTeR12360_stickman/Idle/stickman_idle.png', { frameWidth: STICKMAN_FRAME_W, frameHeight: STICKMAN_FRAME_H })
        this.load.spritesheet('stickmanRunRaw', 'assets/MoNsTeR12360_stickman/Running/stickman_running.png', { frameWidth: STICKMAN_FRAME_W, frameHeight: STICKMAN_FRAME_H })
        this.load.spritesheet('stickmanWallHoldRaw', 'assets/MoNsTeR12360_stickman/wallhold/stickman_wallhold.png', { frameWidth: STICKMAN_FRAME_W, frameHeight: STICKMAN_FRAME_H })
        this.load.spritesheet('stickmanJumpRaw', 'assets/MoNsTeR12360_stickman/Jump%20up%5Cdown/stickman_jump.png', { frameWidth: STICKMAN_FRAME_W, frameHeight: STICKMAN_FRAME_H })
        this.load.spritesheet('stickmanFallRaw', 'assets/MoNsTeR12360_stickman/Jump%20up%5Cdown/stickman_fall.png', { frameWidth: STICKMAN_FRAME_W, frameHeight: STICKMAN_FRAME_H })
    }

    create ()
    {
        this.createStickmanAnimations()

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
        this.submitKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.Y)
        this.skipKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.N)

        this.hud = new PlatformerHud(this)

        this.tilemap = this.make.tilemap({ key: 'level-0' })
        this.levelWidthPx = this.tilemap.widthInPixels
        this.levelHeightPx = this.tilemap.heightInPixels

        this.physics.world.setBounds(0, 0, this.levelWidthPx, this.levelHeightPx)
        this.physics.world.setBoundsCollision(true, true, false, false)

        const tileset = this.tilemap.addTilesetImage('32x32-kenny_pixel-line-platformer', 'kenny-tiles', 32, 32, 0, 0, 1)
            ?? this.tilemap.addTilesetImage('kenny_pixel-line-platformer', 'kenny-tiles', 32, 32, 0, 0, 1)
        if (!tileset)
        {
            throw new Error('Tileset "kenny_pixel-line-platformer" not found in tilemap. In Tiled, embed the tileset into the map and re-export.')
        }

        const groundLayer = this.tilemap.createLayer('Ground and Wall', tileset, 0, 0)
        const platformLayer = this.tilemap.createLayer('Platform', tileset, 0, 0)
            ?? this.tilemap.createLayer('Platforms', tileset, 0, 0)
        const decorationLayer = this.tilemap.createLayer('Decoration', tileset, 0, 0)
        const victoryLayer = this.tilemap.createLayer('Victory', tileset, 0, 0)

        if (!groundLayer || !platformLayer || !victoryLayer)
        {
            throw new Error('Expected Tiled layers "Ground and Wall", "Platforms", and "Victory" were not found in the tilemap.')
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

        const spawnTilesX = 8
        const spawnTilesFromBottom = 8
        const spawnX = spawnTilesX * this.tilemap.tileWidth
        const spawnY = this.levelHeightPx - (spawnTilesFromBottom * this.tilemap.tileHeight)

        this.player = this.physics.add.sprite(spawnX, spawnY, 'stickman_idle_0')
        this.player.setOrigin(0.5, this.stickmanOriginY)
        this.player.anims.play('stickman-idle')
        this.lastPlayedAnimKey = 'stickman-idle'
        if (this.player.body)
        {
            const body = this.player.body as Phaser.Physics.Arcade.Body
            const bodyW = Math.max(2, Math.round(this.player.width * 0.55))
            const bodyH = Math.max(2, Math.round(this.player.height * 0.85))
            body.setSize(bodyW, bodyH)
            const offsetX = Math.round((this.player.width * this.player.originX) - (bodyW / 2))
            const offsetY = Math.round((this.player.height * this.player.originY) - bodyH)
            body.setOffset(offsetX, offsetY)
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

        const victoryGroup = this.physics.add.staticGroup()
        victoryLayer.forEachTile((tile) =>
        {
            if (tile.index === -1)
            {
                return
            }

            const zone = this.add.zone(tile.getCenterX(), tile.getCenterY(), this.tilemap.tileWidth, this.tilemap.tileHeight)
            this.physics.add.existing(zone, true)
            victoryGroup.add(zone)
        })
        this.physics.add.overlap(this.player, victoryGroup, this.handleFinish, undefined, this)

        const uiCamera = this.cameras.add(0, 0, this.scale.width, this.scale.height)
        uiCamera.setScroll(0, 0)
        uiCamera.setZoom(1)
        uiCamera.roundPixels = true

        worldCamera.ignore(this.hud.getGameObjects())

        const uiIgnore: Phaser.GameObjects.GameObject[] = [this.groundLayer, this.platformLayer, victoryLayer, this.player]
        if (decorationLayer)
        {
            uiIgnore.push(decorationLayer)
        }
        uiCamera.ignore(uiIgnore)
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

        if (this.runState === RunState.Finished)
        {
            this.handleFinishLeaderboardInput()
            return
        }

        if (this.runState === RunState.Running && this.runStartTimeMs >= 0)
        {
            this.hud.setTimerMs(this.time.now - this.runStartTimeMs)
        }

        if (!this.isDead)
        {
            const deathMargin = 13 * this.tilemap.tileHeight
            if (this.player.y > this.levelHeightPx + deathMargin || this.player.y < -deathMargin)
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

        this.leaderboardPromptVisible = false
        this.leaderboardSubmitting = false
        this.leaderboardSubmitted = false

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

        this.beginLeaderboardPrompt()
    }

    private beginLeaderboardPrompt ()
    {
        this.leaderboardPromptVisible = true
        this.leaderboardSubmitting = false
        this.leaderboardSubmitted = false

        const nonce = ++this.finishNonce

        this.hud.showFinishLeaderboardControls(
            SUBMIT_FEE_SATS,
            () =>
            {
                this.submitToLeaderboard()
            },
            () =>
            {
                this.skipLeaderboardSubmit()
            }
        )

        this.loadAndShowTopEntry(nonce)
    }

    private handleFinishLeaderboardInput ()
    {
        if (!this.leaderboardPromptVisible)
        {
            return
        }

        if (this.leaderboardSubmitting || this.leaderboardSubmitted)
        {
            return
        }

        if (Phaser.Input.Keyboard.JustDown(this.submitKey))
        {
            this.submitToLeaderboard()
        }
        else if (Phaser.Input.Keyboard.JustDown(this.skipKey))
        {
            this.skipLeaderboardSubmit()
        }
    }

    private skipLeaderboardSubmit ()
    {
        if (!this.leaderboardPromptVisible)
        {
            return
        }

        this.leaderboardPromptVisible = false
        this.hud.hideFinishLeaderboardPrompt()
    }

    private async loadAndShowTopEntry (nonce: number)
    {
        try
        {
            const client = new LeaderLibClient(LEADERBOARD_ID, { networkPreset: NETWORK_PRESET })
            const top = await client.getTop(1)

            if (nonce !== this.finishNonce)
            {
                return
            }

            if (top.length === 0)
            {
                this.hud.setLeaderboardTop(null, null)
                return
            }

            const entry = top[0]
            const playerId = entry.playerId ?? null
            const fallback = playerId ? shortenIdentityKey(playerId) : 'Anonymous'
            this.hud.setLeaderboardTop(fallback, entry.score)

            if (!playerId)
            {
                return
            }

            const identity = await resolveIdentityKey(playerId)
            if (nonce !== this.finishNonce)
            {
                return
            }

            if (identity?.name)
            {
                this.hud.setLeaderboardTop(identity.name, entry.score)
            }
        }
        catch
        {
            if (nonce !== this.finishNonce)
            {
                return
            }

            this.hud.setLeaderboardTop(null, null)
        }
    }

    private async submitToLeaderboard ()
    {
        if (!this.leaderboardPromptVisible || this.leaderboardSubmitting || this.leaderboardSubmitted)
        {
            return
        }

        if (this.finalTimeMs < 0)
        {
            return
        }

        this.leaderboardSubmitting = true
        this.hud.setFinishLeaderboardButtonsEnabled(false)
        this.hud.setLeaderboardStatus('Submitting…')

        try
        {
            const baseWallet = new WalletClient()
            let playerId = 'Anonymous'
            try
            {
                const { publicKey } = await baseWallet.getPublicKey({ identityKey: true })
                playerId = publicKey
            }
            catch
            {
                playerId = 'Anonymous'
            }

            const monetizedWallet = new BabbageGo(undefined, {
                showModal: true,
                monetization: {
                    developerIdentity: DEVELOPER_IDENTITY,
                    developerFeeSats: SUBMIT_FEE_SATS
                }
            })

            const client = new LeaderLibClient(LEADERBOARD_ID, {
                wallet: monetizedWallet,
                signerUrl: SIGNER_URL,
                networkPreset: NETWORK_PRESET
            })

            const score = Math.max(0, Math.floor(this.finalTimeMs))

            console.log(playerId, score)
            await client.submit({ playerId, score })

            this.leaderboardSubmitted = true
            this.leaderboardPromptVisible = false
            this.hud.hideFinishLeaderboardPrompt()
            this.hud.setLeaderboardStatus('Submitted!')

            window.dispatchEvent(new Event('metaspeed:leaderboard-refresh'))

            const nonce = ++this.finishNonce
            this.loadAndShowTopEntry(nonce)
        }
        catch (e)
        {
            const message = e instanceof Error ? e.message : 'Submission failed'
            this.hud.setLeaderboardStatus(message)
            this.hud.setFinishLeaderboardButtonsEnabled(true)
        }
        finally
        {
            this.leaderboardSubmitting = false
        }
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
        const touchingWall = body.blocked.left || body.blocked.right || body.touching.left || body.touching.right

        const now = this.time.now
        if (touchingWall)
        {
            this.lastWallTouchTime = now

            if (body.blocked.left || body.touching.left)
            {
                this.lastWallTouchDir = -1
            }
            else if (body.blocked.right || body.touching.right)
            {
                this.lastWallTouchDir = 1
            }
        }

        const wallholdVisualCoyoteMs = 120
        const recentWallTouch = this.lastWallTouchTime >= 0 && (now - this.lastWallTouchTime) <= wallholdVisualCoyoteMs
        const notMovingAwayFromWall = this.lastWallTouchDir === 0
            || (body.velocity.x * this.lastWallTouchDir) > -80

        const wallholdOk = !onGround && (touchingWall || (recentWallTouch && notMovingAwayFromWall))

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

        let desiredAnim = 'stickman-idle'
        if (wallholdOk)
        {
            desiredAnim = 'stickman-wallhold'
        }
        else if (!onGround)
        {
            desiredAnim = body.velocity.y < 0 ? 'stickman-jump' : 'stickman-fall'
        }
        else if (Math.abs(body.velocity.x) > 10)
        {
            desiredAnim = 'stickman-run'
        }

        if (this.lastPlayedAnimKey !== desiredAnim)
        {
            this.player.anims.play(desiredAnim)
            this.lastPlayedAnimKey = desiredAnim
        }
    }

    private createStickmanAnimations ()
    {
        if (this.anims.exists('stickman-idle'))
        {
            if (stickmanTrimCache)
            {
                this.stickmanOriginY = stickmanTrimCache.originY
                this.stickmanPivotY = stickmanTrimCache.pivotY
            }
            return
        }

        this.textures.get('stickmanIdleRaw').setFilter(Phaser.Textures.FilterMode.NEAREST)
        this.textures.get('stickmanRunRaw').setFilter(Phaser.Textures.FilterMode.NEAREST)
        this.textures.get('stickmanWallHoldRaw').setFilter(Phaser.Textures.FilterMode.NEAREST)
        this.textures.get('stickmanJumpRaw').setFilter(Phaser.Textures.FilterMode.NEAREST)
        this.textures.get('stickmanFallRaw').setFilter(Phaser.Textures.FilterMode.NEAREST)

        const sheets = [
            { key: 'stickmanIdleRaw', frames: 6, prefix: 'stickman_idle' },
            { key: 'stickmanRunRaw', frames: 8, prefix: 'stickman_run' },
            { key: 'stickmanWallHoldRaw', frames: 1, prefix: 'stickman_wallhold' },
            { key: 'stickmanJumpRaw', frames: 1, prefix: 'stickman_jump' },
            { key: 'stickmanFallRaw', frames: 1, prefix: 'stickman_fall' }
        ] as const

        this.stickmanPivotY = this.measureStickmanPivotY([
            { key: 'stickmanIdleRaw', frames: 6 },
            { key: 'stickmanRunRaw', frames: 8 }
        ])

        let leftMax = 0
        let rightMax = 0
        let topMax = 0
        let bottomMax = 0

        for (const sheet of sheets)
        {
            const e = this.measureStickmanExtents(sheet.key, sheet.frames, this.stickmanPivotY)
            if (e.leftMax > leftMax) leftMax = e.leftMax
            if (e.rightMax > rightMax) rightMax = e.rightMax
            if (e.topMax > topMax) topMax = e.topMax
            if (e.bottomMax > bottomMax) bottomMax = e.bottomMax
        }

        const halfW = Math.max(1, Math.ceil(Math.max(leftMax, rightMax) * STICKMAN_OUTPUT_SCALE))
        const outTop = Math.max(1, Math.ceil(topMax * STICKMAN_OUTPUT_SCALE))
        const outBottom = Math.max(0, Math.ceil(bottomMax * STICKMAN_OUTPUT_SCALE))

        const outW = Math.max(1, halfW * 2)
        const outH = Math.max(1, outTop + outBottom)
        const pivotXdst = halfW
        const pivotYdst = outTop

        this.stickmanOriginY = pivotYdst / outH

        stickmanTrimCache = { originY: this.stickmanOriginY, pivotY: this.stickmanPivotY }

        const idleFrames = this.createTrimmedFrameTextures('stickmanIdleRaw', 6, 'stickman_idle', outW, outH, pivotXdst, pivotYdst, this.stickmanPivotY)
        const runFrames = this.createTrimmedFrameTextures('stickmanRunRaw', 8, 'stickman_run', outW, outH, pivotXdst, pivotYdst, this.stickmanPivotY)
        const wallholdFrames = this.createTrimmedFrameTextures('stickmanWallHoldRaw', 1, 'stickman_wallhold', outW, outH, pivotXdst, pivotYdst, this.stickmanPivotY)
        const jumpFrames = this.createTrimmedFrameTextures('stickmanJumpRaw', 1, 'stickman_jump', outW, outH, pivotXdst, pivotYdst, this.stickmanPivotY)
        const fallFrames = this.createTrimmedFrameTextures('stickmanFallRaw', 1, 'stickman_fall', outW, outH, pivotXdst, pivotYdst, this.stickmanPivotY)

        this.anims.create({
            key: 'stickman-idle',
            frames: idleFrames.map((key) => ({ key })),
            frameRate: 8,
            repeat: -1
        })

        this.anims.create({
            key: 'stickman-run',
            frames: runFrames.map((key) => ({ key })),
            frameRate: 12,
            repeat: -1
        })

        this.anims.create({
            key: 'stickman-wallhold',
            frames: wallholdFrames.map((key) => ({ key })),
            frameRate: 1,
            repeat: -1
        })

        this.anims.create({
            key: 'stickman-jump',
            frames: jumpFrames.map((key) => ({ key })),
            frameRate: 1,
            repeat: -1
        })

        this.anims.create({
            key: 'stickman-fall',
            frames: fallFrames.map((key) => ({ key })),
            frameRate: 1,
            repeat: -1
        })
    }

    private measureStickmanPivotY (sheets: ReadonlyArray<{ key: string, frames: number }>): number
    {
        let pivotY = 1

        const tmp = document.createElement('canvas')
        tmp.width = STICKMAN_FRAME_W
        tmp.height = STICKMAN_FRAME_H

        const tmpCtx = tmp.getContext('2d', { willReadFrequently: true })
        if (!tmpCtx)
        {
            throw new Error('Failed to get 2D canvas context')
        }

        tmpCtx.imageSmoothingEnabled = false

        for (const sheet of sheets)
        {
            const srcTexture = this.textures.get(sheet.key)
            const sourceImage = srcTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement

            for (let i = 0; i < sheet.frames; i++)
            {
                tmpCtx.clearRect(0, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H)
                tmpCtx.drawImage(sourceImage, i * STICKMAN_FRAME_W, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H, 0, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H)

                const data = tmpCtx.getImageData(0, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H).data

                for (let y = STICKMAN_FRAME_H - 1; y >= 0; y--)
                {
                    for (let x = 0; x < STICKMAN_FRAME_W; x++)
                    {
                        const a = data[(y * STICKMAN_FRAME_W + x) * 4 + 3]
                        if (a !== 0)
                        {
                            const candidate = y + 1
                            if (candidate > pivotY) pivotY = candidate
                            x = STICKMAN_FRAME_W
                            break
                        }
                    }
                }
            }
        }

        return Math.min(STICKMAN_FRAME_H, Math.max(1, pivotY))
    }

    private measureStickmanExtents (srcKey: string, frameCount: number, pivotY: number): { leftMax: number, rightMax: number, topMax: number, bottomMax: number }
    {
        const srcTexture = this.textures.get(srcKey)
        const sourceImage = srcTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement

        const tmp = document.createElement('canvas')
        tmp.width = STICKMAN_FRAME_W
        tmp.height = STICKMAN_FRAME_H

        const tmpCtx = tmp.getContext('2d', { willReadFrequently: true })
        if (!tmpCtx)
        {
            throw new Error('Failed to get 2D canvas context')
        }

        tmpCtx.imageSmoothingEnabled = false

        const pivotX = STICKMAN_FRAME_W / 2

        let leftMax = 0
        let rightMax = 0
        let topMax = 0
        let bottomMax = 0

        for (let i = 0; i < frameCount; i++)
        {
            tmpCtx.clearRect(0, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H)
            tmpCtx.drawImage(sourceImage, i * STICKMAN_FRAME_W, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H, 0, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H)

            const data = tmpCtx.getImageData(0, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H).data

            let minX = STICKMAN_FRAME_W
            let minY = STICKMAN_FRAME_H
            let maxX = -1
            let maxY = -1

            for (let y = 0; y < STICKMAN_FRAME_H; y++)
            {
                for (let x = 0; x < STICKMAN_FRAME_W; x++)
                {
                    const a = data[(y * STICKMAN_FRAME_W + x) * 4 + 3]
                    if (a !== 0)
                    {
                        if (x < minX) minX = x
                        if (y < minY) minY = y
                        if (x > maxX) maxX = x
                        if (y > maxY) maxY = y
                    }
                }
            }

            if (maxX < minX || maxY < minY)
            {
                continue
            }

            maxY = Math.min(maxY, pivotY - 1)

            const left = pivotX - minX
            const right = (maxX + 1) - pivotX
            const top = pivotY - minY
            const bottom = Math.max(0, (maxY + 1) - pivotY)

            if (left > leftMax) leftMax = left
            if (right > rightMax) rightMax = right
            if (top > topMax) topMax = top
            if (bottom > bottomMax) bottomMax = bottom
        }

        return { leftMax, rightMax, topMax, bottomMax }
    }

    private createTrimmedFrameTextures (srcKey: string, frameCount: number, dstPrefix: string, outW: number, outH: number, pivotXdst: number, pivotYdst: number, pivotY: number): string[]
    {
        const srcTexture = this.textures.get(srcKey)
        const sourceImage = srcTexture.getSourceImage() as HTMLImageElement | HTMLCanvasElement

        const tmp = document.createElement('canvas')
        tmp.width = STICKMAN_FRAME_W
        tmp.height = STICKMAN_FRAME_H

        const tmpCtx = tmp.getContext('2d', { willReadFrequently: true })
        if (!tmpCtx)
        {
            throw new Error('Failed to get 2D canvas context')
        }

        tmpCtx.imageSmoothingEnabled = false

        const pivotX = STICKMAN_FRAME_W / 2

        const keys: string[] = []
        for (let i = 0; i < frameCount; i++)
        {
            tmpCtx.clearRect(0, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H)
            tmpCtx.drawImage(sourceImage, i * STICKMAN_FRAME_W, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H, 0, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H)

            const data = tmpCtx.getImageData(0, 0, STICKMAN_FRAME_W, STICKMAN_FRAME_H).data

            let minX = STICKMAN_FRAME_W
            let minY = STICKMAN_FRAME_H
            let maxX = -1
            let maxY = -1

            for (let y = 0; y < STICKMAN_FRAME_H; y++)
            {
                for (let x = 0; x < STICKMAN_FRAME_W; x++)
                {
                    const a = data[(y * STICKMAN_FRAME_W + x) * 4 + 3]
                    if (a !== 0)
                    {
                        if (x < minX) minX = x
                        if (y < minY) minY = y
                        if (x > maxX) maxX = x
                        if (y > maxY) maxY = y
                    }
                }
            }

            if (maxX < minX || maxY < minY)
            {
                minX = 0
                minY = 0
                maxX = 0
                maxY = 0
            }

            maxY = Math.min(maxY, pivotY - 1)

            const sw = (maxX - minX) + 1
            const sh = (maxY - minY) + 1

            const dstKey = `${dstPrefix}_${i}`
            if (this.textures.exists(dstKey))
            {
                this.textures.remove(dstKey)
            }

            const canvasTexture = this.textures.createCanvas(dstKey, outW, outH)
            if (!canvasTexture)
            {
                throw new Error(`Failed to create canvas texture: ${dstKey}`)
            }

            canvasTexture.setFilter(Phaser.Textures.FilterMode.NEAREST)

            const ctx = canvasTexture.getContext()
            ctx.clearRect(0, 0, outW, outH)
            ctx.imageSmoothingEnabled = false

            const sx = (i * STICKMAN_FRAME_W) + minX
            const sy = minY

            const dx = pivotXdst - Math.round((pivotX - minX) * STICKMAN_OUTPUT_SCALE)
            const dy = pivotYdst - Math.round((pivotY - minY) * STICKMAN_OUTPUT_SCALE)

            const dw = Math.max(1, Math.round(sw * STICKMAN_OUTPUT_SCALE))
            const dh = Math.max(1, Math.round(sh * STICKMAN_OUTPUT_SCALE))

            ctx.drawImage(sourceImage, sx, sy, sw, sh, dx, dy, dw, dh)
            canvasTexture.refresh()

            keys.push(dstKey)
        }

        return keys
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
}
