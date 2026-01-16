import { Collection, Db, Document } from 'mongodb'
import { AdmissionRecord, BalanceRecord, LevelRecord, PayoutRecord, TreasuryRecord } from './types.js'

export class LevelStorage {
  private readonly levels: Collection<LevelRecord>
  private readonly admissions: Collection<AdmissionRecord>
  private readonly balances: Collection<BalanceRecord>
  private readonly treasury: Collection<TreasuryRecord>
  private readonly payouts: Collection<PayoutRecord>

  constructor (private readonly db: Db) {
    const LEVELS_COLLECTION_NAME = (process.env.LEVELS_COLLECTION_NAME || 'levels') as string
    const ADMISSIONS_COLLECTION_NAME = (process.env.ADMISSIONS_COLLECTION_NAME || 'admissions') as string
    const BALANCE_COLLECTION_NAME = (process.env.BALANCE_COLLECTION_NAME || 'balance') as string
    const TREASURY_COLLECTION_NAME = (process.env.TREASURY_COLLECTION_NAME || 'treasury') as string
    const PAYOUTS_COLLECTION_NAME = (process.env.PAYOUTS_COLLECTION_NAME || 'payouts') as string

    this.levels = db.collection<LevelRecord>(LEVELS_COLLECTION_NAME)
    this.admissions = db.collection<AdmissionRecord>(ADMISSIONS_COLLECTION_NAME)
    this.balances = db.collection<BalanceRecord>(BALANCE_COLLECTION_NAME)
    this.treasury = db.collection<TreasuryRecord>(TREASURY_COLLECTION_NAME)
    this.payouts = db.collection<PayoutRecord>(PAYOUTS_COLLECTION_NAME)
  }

  async ensureIndexes (): Promise<void> {
    await this.levels.createIndex({ levelId: 1 }, { unique: true })
    await this.levels.createIndex({ active: 1 })
    await this.admissions.createIndex({ levelId: 1, identityKey: 1 }, { unique: true })
    await this.balances.createIndex({ identityKey: 1 }, { unique: true })
    await this.payouts.createIndex({ levelId: 1 })
  }

  async getActiveLevel (): Promise<LevelRecord | null> {
    return await this.levels.findOne({ active: true })
  }

  async setActiveLevel (levelId: string, entryFeeSats: number): Promise<LevelRecord> {
    await this.levels.updateMany({ active: true }, { $set: { active: false, endedAt: Date.now() } })

    const createdAt = Date.now()

    await this.levels.updateOne(
      { levelId },
      {
        $set: {
          levelId,
          active: true,
          entryFeeSats,
          potSats: 0,
          createdAt
        }
      },
      { upsert: true }
    )

    const level = await this.levels.findOne({ levelId })
    if (!level) throw new Error('Failed to set active level')

    return level
  }

  async isAdmitted (levelId: string, identityKey: string): Promise<boolean> {
    const record = await this.admissions.findOne({ levelId, identityKey })
    return Boolean(record)
  }

  async admit (levelId: string, identityKey: string): Promise<{ admitted: boolean, alreadyAdmitted: boolean }> {
    const admittedAt = Date.now()

    try {
      await this.admissions.insertOne({ levelId, identityKey, admittedAt })
      return { admitted: true, alreadyAdmitted: false }
    } catch (e) {
      const err = e as Document & { code?: number }
      if (err && err.code === 11000) {
        return { admitted: true, alreadyAdmitted: true }
      }
      throw e
    }
  }

  async recordEntryAllocation (levelId: string, potSats: number, devSats: number): Promise<void> {
    await this.levels.updateOne(
      { levelId },
      { $inc: { potSats } }
    )

    await this.treasury.updateOne(
      { _id: 'treasury' },
      { $inc: { devRevenueSats: devSats } },
      { upsert: true }
    )
  }

  async getTreasuryRevenueSats (): Promise<number> {
    const doc = await this.treasury.findOne({ _id: 'treasury' })
    return doc?.devRevenueSats || 0
  }

  async getBalance (identityKey: string): Promise<number> {
    const doc = await this.balances.findOne({ identityKey })
    return doc?.balance || 0
  }

  async incrementBalance (identityKey: string, amount: number): Promise<void> {
    if (amount <= 0) return

    await this.balances.updateOne(
      { identityKey },
      { $inc: { balance: amount } },
      { upsert: true }
    )
  }

  async setBalance (identityKey: string, newBalance: number): Promise<void> {
    await this.balances.updateOne(
      { identityKey },
      { $set: { balance: newBalance } },
      { upsert: true }
    )
  }

  async payoutAndCloseActiveLevel (winnerIdentityKey: string): Promise<{ levelId: string, amount: number } | null> {
    const active = await this.getActiveLevel()
    if (!active) return null

    const pot = active.potSats
    if (!pot || pot <= 0) {
      await this.levels.updateOne(
        { levelId: active.levelId },
        { $set: { active: false, endedAt: Date.now() } }
      )
      return { levelId: active.levelId, amount: 0 }
    }

    const updateRes = await this.levels.findOneAndUpdate(
      { levelId: active.levelId, active: true },
      { $set: { active: false, endedAt: Date.now(), potSats: 0 } },
      { returnDocument: 'before' }
    )

    const prev = (updateRes as any)?.value as LevelRecord | null | undefined
    if (!prev) return null

    const amount = prev.potSats || 0

    await this.incrementBalance(winnerIdentityKey, amount)

    await this.payouts.insertOne({
      levelId: prev.levelId,
      winnerIdentityKey,
      amount,
      paidAt: Date.now()
    })

    return { levelId: prev.levelId, amount }
  }
}
