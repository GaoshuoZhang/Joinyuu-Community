import type { Article } from '@prisma/client'

export type ArticleWithComments = Article & { commentsEnabled: boolean }

export interface ArticleTakedownRecord {
  id: number
  articleId: string
  source: string
  reason: string | null
  takenDownAt: string
  takenDownBy: string
  restoredAt: string | null
  restoredBy: string | null
}

interface ArticleTakedownDelegate {
  create(args: {
    data: Omit<ArticleTakedownRecord, 'id' | 'restoredAt' | 'restoredBy'>
  }): Promise<ArticleTakedownRecord>
  findFirst(args: {
    where: { articleId: string; source?: string; restoredAt?: null }
    orderBy: { id: 'desc' }
  }): Promise<ArticleTakedownRecord | null>
  findMany(args: {
    where: { articleId: string }
    orderBy: { id: 'desc' }
  }): Promise<ArticleTakedownRecord[]>
  updateMany(args: {
    where: { id?: number; articleId?: string; restoredAt: null }
    data: { restoredAt: string; restoredBy: string }
  }): Promise<{ count: number }>
}

/** Temporary typed boundary until the integration migration regenerates Prisma Client. */
export function articleTakedowns(client: unknown): ArticleTakedownDelegate {
  return (client as { articleTakedown: ArticleTakedownDelegate }).articleTakedown
}
