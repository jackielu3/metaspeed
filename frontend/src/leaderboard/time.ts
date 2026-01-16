export function formatTimeMs(ms: number): string {
    const clamped = Math.max(0, Math.floor(ms))
    const minutes = Math.floor(clamped / 60000)
    const seconds = Math.floor((clamped % 60000) / 1000)
    const millis = clamped % 1000

    const s = String(seconds).padStart(2, '0')
    const m = String(millis).padStart(3, '0')

    return `${minutes}:${s}.${m}`
}
