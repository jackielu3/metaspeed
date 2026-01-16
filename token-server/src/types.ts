export interface LevelRecord {
  levelId: string
  active: boolean
  entryFeeSats: number
  potSats: number
  createdAt: number
  endedAt?: number
}

export interface AdmissionRecord {
  levelId: string
  identityKey: string
  admittedAt: number
}

export interface BalanceRecord {
  identityKey: string
  balance: number
}

export interface TreasuryRecord {
  _id: 'treasury'
  devRevenueSats: number
}

export interface PayoutRecord {
  levelId: string
  winnerIdentityKey: string
  amount: number
  paidAt: number
}
