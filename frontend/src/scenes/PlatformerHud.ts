import Phaser from 'phaser';

export class PlatformerHud {
  private scene: Phaser.Scene;

  private deathText: Phaser.GameObjects.Text;
  private countdownText: Phaser.GameObjects.Text;
  private timerText: Phaser.GameObjects.Text;
  private introSkipText: Phaser.GameObjects.Text;
  private finishText: Phaser.GameObjects.Text;

  private leaderboardTopText: Phaser.GameObjects.Text;
  private leaderboardPromptText: Phaser.GameObjects.Text;
  private leaderboardSubmitText: Phaser.GameObjects.Text;
  private leaderboardStatusText: Phaser.GameObjects.Text;

  private pauseBg: Phaser.GameObjects.Rectangle;
  private pausePanel: Phaser.GameObjects.Rectangle;
  private pauseTitleText: Phaser.GameObjects.Text;
  private pauseCountdownLabelText: Phaser.GameObjects.Text;
  private pauseCountdownValueText: Phaser.GameObjects.Text;
  private pauseCountdownHelpText: Phaser.GameObjects.Text;
  private pauseMainMenuText: Phaser.GameObjects.Text;
  private pauseCloseText: Phaser.GameObjects.Text;
  private pauseContainer: Phaser.GameObjects.Container;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.deathText = this.scene.add
      .text(
        this.scene.scale.width / 2,
        this.scene.scale.height / 2,
        'Press ESC to restart\nPress P for settings',
        {
          color: '#ff3b3b',
          fontSize: '24px',
        }
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.countdownText = this.scene.add
      .text(this.scene.scale.width / 2, this.scene.scale.height / 2, '3', {
        color: '#000000',
        fontSize: '72px',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.timerText = this.scene.add
      .text(this.scene.scale.width - 16, 16, '0:00.000', {
        color: '#000000',
        fontSize: '18px',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.introSkipText = this.scene.add
      .text(this.scene.scale.width - 16, 40, 'Space to skip', {
        color: '#000000',
        fontSize: '14px',
      })
      .setOrigin(1, 0)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.finishText = this.scene.add
      .text(this.scene.scale.width / 2, this.scene.scale.height / 2 - 140, '', {
        color: '#000000',
        fontSize: '28px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.leaderboardTopText = this.scene.add
      .text(this.scene.scale.width / 2, this.scene.scale.height / 2 - 40, '', {
        color: '#000000',
        fontSize: '18px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.leaderboardPromptText = this.scene.add
      .text(this.scene.scale.width / 2, this.scene.scale.height / 2 + 40, '', {
        color: '#000000',
        fontSize: '18px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.leaderboardSubmitText = this.scene.add
      .text(
        this.scene.scale.width / 2,
        this.scene.scale.height / 2 + 95,
        'Submit (Y)',
        {
          color: '#0ec3c9',
          fontSize: '18px',
        }
      )
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    this.leaderboardStatusText = this.scene.add
      .text(this.scene.scale.width / 2, this.scene.scale.height / 2 + 140, '', {
        color: '#000000',
        fontSize: '16px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1000)
      .setVisible(false);

    const w = this.scene.scale.width
    const h = this.scene.scale.height

    this.pauseBg = this.scene.add
      .rectangle(0, 0, w, h, 0x000000, 0.6)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false)

    this.pausePanel = this.scene.add
      .rectangle(w / 2, h / 2, Math.min(520, w - 40), Math.min(360, h - 40), 0xffffff, 0.95)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false)

    this.pauseTitleText = this.scene.add
      .text(w / 2, h / 2 - 140, 'Paused', {
        color: '#000000',
        fontSize: '28px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false)

    this.pauseCountdownLabelText = this.scene.add
      .text(w / 2, h / 2 - 70, 'Restart countdown (0-10 seconds):', {
        color: '#000000',
        fontSize: '18px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false)

    this.pauseCountdownValueText = this.scene.add
      .text(w / 2, h / 2 - 35, '0', {
        color: '#0ec3c9',
        fontSize: '22px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false)

    this.pauseCountdownHelpText = this.scene.add
      .text(w / 2, h / 2 + 5, 'Type a number and press Enter to save', {
        color: '#000000',
        fontSize: '14px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false)

    this.pauseMainMenuText = this.scene.add
      .text(w / 2, h / 2 + 70, 'Main Menu (No main menu... yet ehe...)', {
        color: '#000000',
        fontSize: '18px',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false)
      .setInteractive({ useHandCursor: true })

    this.pauseCloseText = this.scene.add
      .text(w / 2, h / 2 + 120, 'Press P to close', {
        color: '#000000',
        fontSize: '16px',
        align: 'center',
      })
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1100)
      .setVisible(false)

    this.pauseContainer = this.scene.add
      .container(0, 0, [
        this.pauseBg,
        this.pausePanel,
        this.pauseTitleText,
        this.pauseCountdownLabelText,
        this.pauseCountdownValueText,
        this.pauseCountdownHelpText,
        this.pauseMainMenuText,
        this.pauseCloseText,
      ])
      .setDepth(1100)
      .setVisible(false)
  }

  showDeathPrompt() {
    this.deathText.setVisible(true);
  }

  hideDeathPrompt() {
    this.deathText.setVisible(false);
  }

  showCountdown(value: number) {
    this.countdownText.setText(String(value)).setVisible(true);
  }

  hideCountdown() {
    this.countdownText.setVisible(false);
  }

  showTimer() {
    this.timerText.setVisible(true);
  }

  hideTimer() {
    this.timerText.setVisible(false);
  }

  showIntroSkipHint() {
    this.introSkipText.setVisible(true);
  }

  hideIntroSkipHint() {
    this.introSkipText.setVisible(false);
  }

  setTimerMs(elapsedMs: number) {
    this.timerText.setText(this.formatTimeMs(elapsedMs));
  }

  showFinish(finalTimeMs: number) {
    const formatted = this.formatTimeMs(finalTimeMs);
    this.finishText
      .setText(`Finished!\nTime: ${formatted}\n\nPress ESC to retry\nPress P for settings`)
      .setVisible(true);
  }

  showPauseMenu(countdownSeconds: number, inputText: string | null) {
    const value = inputText && inputText.length > 0 ? inputText : String(countdownSeconds)
    this.pauseCountdownValueText.setText(value)

    this.pauseBg.setVisible(true)
    this.pausePanel.setVisible(true)
    this.pauseTitleText.setVisible(true)
    this.pauseCountdownLabelText.setVisible(true)
    this.pauseCountdownValueText.setVisible(true)
    this.pauseCountdownHelpText.setVisible(true)
    this.pauseMainMenuText.setVisible(true)
    this.pauseCloseText.setVisible(true)
    this.pauseContainer.setVisible(true)
  }

  hidePauseMenu() {
    this.pauseContainer.setVisible(false)
    this.pauseBg.setVisible(false)
    this.pausePanel.setVisible(false)
    this.pauseTitleText.setVisible(false)
    this.pauseCountdownLabelText.setVisible(false)
    this.pauseCountdownValueText.setVisible(false)
    this.pauseCountdownHelpText.setVisible(false)
    this.pauseMainMenuText.disableInteractive().setVisible(false)
    this.pauseMainMenuText.setInteractive({ useHandCursor: true })
    this.pauseCloseText.setVisible(false)
  }

  setPauseCountdownValue(countdownSeconds: number, inputText: string | null) {
    const value = inputText && inputText.length > 0 ? inputText : String(countdownSeconds)
    this.pauseCountdownValueText.setText(value)
  }

  showFinishLeaderboardControls(
    feeSats: number,
    onSubmit: () => void,
    onSkip: () => void
  ) {
    this.leaderboardTopText.setText('1st place: Loading…').setVisible(true);
    this.leaderboardPromptText
      .setText(
        `Submit your time to the leaderboard?\nFee: ${feeSats.toLocaleString()} sats`
      )
      .setVisible(true);

    this.leaderboardStatusText.setText('').setVisible(false);

    this.leaderboardSubmitText
      .setVisible(true)
      .setInteractive({ useHandCursor: true });

    this.leaderboardSubmitText.removeAllListeners();
    this.leaderboardSubmitText.on('pointerdown', onSubmit);
  }

  setFinishLeaderboardButtonsEnabled(enabled: boolean) {
    if (enabled) {
      this.leaderboardSubmitText
        .setAlpha(1)
        .setInteractive({ useHandCursor: true });
      return;
    }

    this.leaderboardSubmitText.disableInteractive().setAlpha(0.6);
  }

  setLeaderboardTop(playerLabel: string | null, timeMs: number | null) {
    if (!playerLabel || timeMs === null) {
      this.leaderboardTopText.setText('1st place: —').setVisible(true);
      return;
    }

    const formatted = this.formatTimeMs(timeMs);
    this.leaderboardTopText
      .setText(`1st place: ${playerLabel}\nTime: ${formatted}`)
      .setVisible(true);
  }

  setLeaderboardStatus(message: string) {
    this.leaderboardStatusText.setText(message).setVisible(true);
  }

  hideFinishLeaderboardPrompt() {
    this.leaderboardPromptText.setVisible(false);
    this.leaderboardSubmitText.disableInteractive().setVisible(false);
    this.leaderboardStatusText.setVisible(false);
  }

  hideFinishLeaderboardControls() {
    this.leaderboardTopText.setVisible(false);
    this.hideFinishLeaderboardPrompt();
  }

  hideFinish() {
    this.finishText.setVisible(false);
    this.hideFinishLeaderboardControls();
  }

  getGameObjects(): Phaser.GameObjects.GameObject[] {
    return [
      this.deathText,
      this.countdownText,
      this.timerText,
      this.introSkipText,
      this.finishText,
      this.leaderboardTopText,
      this.leaderboardPromptText,
      this.leaderboardSubmitText,
      this.leaderboardStatusText,
      this.pauseContainer,
    ];
  }

  private formatTimeMs(ms: number): string {
    const clamped = Math.max(0, Math.floor(ms));
    const minutes = Math.floor(clamped / 60000);
    const seconds = Math.floor((clamped % 60000) / 1000);
    const millis = clamped % 1000;

    const s = String(seconds).padStart(2, '0');
    const m = String(millis).padStart(3, '0');

    return `${minutes}:${s}.${m}`;
  }
}

