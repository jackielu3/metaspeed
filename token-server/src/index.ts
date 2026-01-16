import { createAuthMiddleware } from '@bsv/auth-express-middleware'
import { createPaymentMiddleware } from '@bsv/payment-express-middleware'
import { P2PKH, PrivateKey, PublicKey, Utils } from '@bsv/sdk'
import bodyParser from 'body-parser'
import crypto, { randomBytes } from 'crypto'
import dotenv from 'dotenv'
import express, { Express, NextFunction, Request, Response } from 'express'
import { MongoClient } from 'mongodb'
import prettyjson from 'prettyjson'
import { LevelStorage } from './LevelStorage.js'
import { getWallet } from './utils/walletSingleton.js'

(global.self as any) = { crypto }

dotenv.config()

const PORT = process.env.PORT || 3000
const MONGO_URI = process.env.MONGO_URI as string
const DATABASE_NAME = process.env.DATABASE_NAME as string

const ENTRY_FEE_SATS = 100000
const POT_SHARE_SATS = 75000
const DEV_SHARE_SATS = 25000

const ADMIN_IDENTITY_KEY = '025a2cb22976ff42743e4b168f853021b1042aa392792743d60b1234e9d5de5efe'

declare module 'express-serve-static-core' {
  interface Request {
    authrite?: {
      identityKey: string
    }
    auth?: {
      identityKey: string
    }
  }
}

function getIdentityKey (req: Request): string | null {
  const r = req as any
  return r?.authrite?.identityKey || r?.auth?.identityKey || null
}

function requireAdmin (req: Request, res: Response, next: NextFunction): void {
  const identityKey = getIdentityKey(req)
  if (identityKey !== ADMIN_IDENTITY_KEY) {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}

const app: Express = express()
let dbClient: MongoClient
let storage: LevelStorage

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))

app.use((req, res, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*')
  res.header('Access-Control-Allow-Headers', '*')
  res.header('Access-Control-Allow-Methods', '*')
  res.header('Access-Control-Expose-Headers', '*')
  res.header('Access-Control-Allow-Private-Network', 'true')
  if (req.method === 'OPTIONS') {
    res.sendStatus(200)
  } else {
    next()
  }
})

app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[${req.method}] <- ${req.url}`)
  const logObject = { ...req.body }
  console.log(prettyjson.render(logObject, { keysColor: 'blue' }))
  const originalJson = res.json.bind(res)
  res.json = (json: any) => {
    console.log(`[${req.method}] -> ${req.url}`)
    console.log(prettyjson.render(json, { keysColor: 'green' }))
    return originalJson(json)
  }
  next()
})

const wallet = await getWallet()

app.use(createAuthMiddleware({
  wallet,
  allowUnauthenticated: false,
  logger: console,
  logLevel: 'error'
}))

app.use(createPaymentMiddleware({
  wallet,
  calculateRequestPrice: async (req: any) => {
    if (!req.url.includes('/level/enter')) return 0
    if (!storage) return ENTRY_FEE_SATS

    const identityKey = getIdentityKey(req)
    if (!identityKey) return ENTRY_FEE_SATS

    const level = await storage.getActiveLevel()
    if (!level) return 0

    const admitted = await storage.isAdmitted(level.levelId, identityKey)
    return admitted ? 0 : ENTRY_FEE_SATS
  }
}))

app.get('/health', async (_req: Request, res: Response) => {
  return res.status(200).json({ ok: true })
})

app.post('/level/current', async (req: Request, res: Response) => {
  try {
    const identityKey = getIdentityKey(req)
    if (!identityKey) return res.status(401).json({ error: 'Missing identity key' })

    const level = await storage.getActiveLevel()
    if (!level) {
      return res.status(200).json({ active: false })
    }

    const admitted = await storage.isAdmitted(level.levelId, identityKey)
    const treasurySats = await storage.getTreasuryRevenueSats()

    return res.status(200).json({
      active: true,
      levelId: level.levelId,
      entryFeeSats: level.entryFeeSats,
      potSats: level.potSats,
      admitted,
      treasurySats
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to get current level' })
  }
})

app.post('/level/enter', async (req: Request, res: Response) => {
  try {
    const identityKey = getIdentityKey(req)
    if (!identityKey) return res.status(401).json({ error: 'Missing identity key' })

    const level = await storage.getActiveLevel()
    if (!level) return res.status(400).json({ error: 'No active level' })

    const { admitted, alreadyAdmitted } = await storage.admit(level.levelId, identityKey)

    if (!alreadyAdmitted) {
      await storage.recordEntryAllocation(level.levelId, POT_SHARE_SATS, DEV_SHARE_SATS)
    }

    const updated = await storage.getActiveLevel()

    return res.status(200).json({
      admitted,
      alreadyAdmitted,
      levelId: level.levelId,
      entryFeeSats: ENTRY_FEE_SATS,
      potSats: updated?.potSats ?? level.potSats
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to enter level' })
  }
})

app.post('/account/balance', async (req: Request, res: Response) => {
  try {
    const identityKey = getIdentityKey(req)
    const { publicKey } = (req.body as any) || {}

    if (!identityKey) return res.status(401).json({ error: 'Missing identity key' })
    if (!publicKey || publicKey !== identityKey) return res.status(403).json({ error: 'Invalid identity key' })

    const balance = await storage.getBalance(identityKey)
    return res.status(200).json({ success: true, balance })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to get balance' })
  }
})

app.post('/account/withdraw', async (req: Request, res: Response) => {
  try {
    const identityKey = getIdentityKey(req)
    const { publicKey } = (req.body as any) || {}

    if (!identityKey) return res.status(401).json({ error: 'Missing identity key' })
    if (!publicKey || publicKey !== identityKey) return res.status(403).json({ error: 'Invalid identity key' })

    const balance = await storage.getBalance(identityKey)
    if (balance <= 0) {
      return res.status(200).json({ message: 'No funds to withdraw.' })
    }

    const SERVER_PRIVATE_KEY = process.env.SERVER_PRIVATE_KEY as string
    const senderIdentityKey = PrivateKey.fromHex(SERVER_PRIVATE_KEY).toPublicKey().toString()

    const derivationPrefix = randomBytes(10).toString('base64')
    const derivationSuffix = randomBytes(10).toString('base64')

    const { publicKey: derivedPublicKey } = await wallet.getPublicKey({
      protocolID: [2, '3241645161d8'],
      keyID: `${derivationPrefix} ${derivationSuffix}`,
      counterparty: identityKey
    })

    const lockingScript = new P2PKH().lock(PublicKey.fromString(derivedPublicKey).toAddress()).toHex()

    const { tx } = await wallet.createAction({
      description: `Metaspeed withdrawal to ${identityKey}`,
      outputs: [{
        satoshis: balance,
        lockingScript,
        customInstructions: JSON.stringify({ derivationPrefix, derivationSuffix, payee: senderIdentityKey }),
        outputDescription: 'Metaspeed withdraw'
      }],
      options: {
        randomizeOutputs: false
      }
    })

    if (!tx) throw new Error('Error creating action')

    await storage.setBalance(identityKey, 0)

    return res.status(200).json({
      message: 'Withdraw partial tx created',
      transaction: Utils.toArray(tx, 'base64'),
      derivationPrefix,
      derivationSuffix,
      amount: balance,
      senderIdentityKey
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to withdraw balance' })
  }
})

app.post('/admin/status', requireAdmin, async (req: Request, res: Response) => {
  try {
    const level = await storage.getActiveLevel()
    const treasurySats = await storage.getTreasuryRevenueSats()
    return res.status(200).json({
      activeLevel: level,
      treasurySats
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to get admin status' })
  }
})

app.post('/admin/payout', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { winnerIdentityKey } = (req.body as any) || {}
    if (!winnerIdentityKey) return res.status(400).json({ error: 'Missing winnerIdentityKey' })

    const result = await storage.payoutAndCloseActiveLevel(winnerIdentityKey)
    if (!result) return res.status(400).json({ error: 'No active level to payout' })

    return res.status(200).json({
      success: true,
      levelId: result.levelId,
      paidOutSats: result.amount
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to payout level' })
  }
})

app.post('/admin/set-current-level', requireAdmin, async (req: Request, res: Response) => {
  try {
    const { levelId } = (req.body as any) || {}
    if (!levelId || typeof levelId !== 'string') return res.status(400).json({ error: 'Missing levelId' })

    const level = await storage.setActiveLevel(levelId, ENTRY_FEE_SATS)

    return res.status(200).json({
      success: true,
      level
    })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Failed to set current level' })
  }
})

async function start () {
  try {
    dbClient = new MongoClient(MONGO_URI)
    await dbClient.connect()
    console.log('Connected to MongoDB')

    const db = dbClient.db(DATABASE_NAME)
    storage = new LevelStorage(db)
    await storage.ensureIndexes()

    if (!await storage.getActiveLevel()) {
      await storage.setActiveLevel('level-1', ENTRY_FEE_SATS)
    }

    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`)
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

void start()
