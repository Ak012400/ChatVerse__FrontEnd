import api from './client'
import type {
  CreateGameRoomRequest,
  GameRoomDto,
  GameRoomSnapshot,
  GameRole,
} from '../types/games'

// ============================================================
//  gamesApi — REST surface for the Gaming Hall.
//
//  See ChatVerse.API/Controllers/GameRoomController.cs for the
//  matching endpoints. Every response is wrapped in the standard
//  { success, data, error } envelope, so .data.data is the
//  payload (matching the project-wide pattern).
// ============================================================

export const gamesApi = {
  /** List active rooms (Lobby + Playing only — Ended filtered server-side). */
  listActive: () =>
    api.get<{ data: GameRoomDto[] }>('/game-rooms'),

  /** Host creates a room and is auto-joined as Player. Returns
   *  { slug, name, type } — redirect to /games/{slug} after. */
  create: (req: CreateGameRoomRequest) =>
    api.post<{ data: { slug: string; name: string; type: string } }>(
      '/game-rooms', req,
    ),

  /** Idempotent join — repeat calls return the existing assignment.
   *  If players are capped, the server transparently falls back to
   *  Spectator and the `note` field explains it. */
  join: (slug: string, role: GameRole) =>
    api.post<{ data: { slug: string; assignedRole: GameRole; note?: string } }>(
      `/game-rooms/${slug}/join`, { role },
    ),

  /** Pull a fresh snapshot. The room page calls this on first paint
   *  so it has something to render while the SignalR handshake is
   *  in flight (which would otherwise leave the UI blank for ~500ms). */
  snapshot: (slug: string) =>
    api.get<{ data: GameRoomSnapshot }>(`/game-rooms/${slug}`),
}
