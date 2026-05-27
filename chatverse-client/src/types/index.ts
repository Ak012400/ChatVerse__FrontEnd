// src/types/index.ts

export interface User {
  userId: string;
  username: string;
  isGuest: boolean;
  trustScore: number;
  isEmailVerified: boolean;
  ageVerified: boolean;
}

export interface Room {
  id: string;
  slug: string;
  name: string;
  description?: string;
  onlineCount?: number;
}

export interface Message {
  id: string;
  roomId: string; // ya slug
  senderId: string;
  senderName: string;
  content: string;
  modStatus?: 'pending' | 'approved' | 'rejected' | 'flagged';
  replyToId?: string;
  timestamp?: string;
}

export interface TrustScore {
  score: number;
  level?: string;
}

// Video Calling Types
export type VideoStatus = 'idle' | 'searching' | 'matched' | 'connected' | 'ended';

export interface VideoParticipant {
  id: string;
  username: string;
  isGuest?: boolean;
}