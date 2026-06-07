import api from './client'

// ============================================================
//  techNewsApi — REST client for the Tech Talk news feed.
//
//  See ChatVerse.API/Controllers/TechNewsController.cs for the
//  matching backend. Cached server-side for 10 min; clients can
//  safely poll every 30s with no real cost.
// ============================================================

export interface TechNewsItem {
  source: 'HackerNews' | 'dev.to'
  title: string
  url: string
  points: number
  author: string
  commentsUrl: string
  createdAtUtc: string
}

export const techNewsApi = {
  list: () => api.get<{ data: TechNewsItem[] }>('/tech-news'),
}
