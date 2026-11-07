export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline'
export type MemberRole = 'OWNER' | 'ADMIN' | 'MEMBER'
export type FriendshipStatus = 'pending' | 'accepted' | 'blocked'
export type ChannelType = 'TEXT' | 'VOICE'

export interface Profile {
  id: string
  username: string
  display_name: string
  avatar_url: string | null
  status: UserStatus
  last_seen_at: string
  created_at: string
  updated_at: string
}

export type ProfileBrief = Pick<Profile, 'id' | 'username' | 'display_name' | 'avatar_url' | 'status'>

export interface Server {
  id: string
  name: string
  icon_url: string | null
  owner_id: string
  invite_code: string
  created_at: string
  updated_at: string
}

export interface Member {
  server_id: string
  user_id: string
  role: MemberRole
  joined_at: string
}

export interface Channel {
  id: string
  server_id: string
  name: string
  topic: string | null
  type: ChannelType
  position: number
  created_at: string
}

export interface Message {
  id: string
  channel_id: string
  author_id: string
  content: string
  client_nonce: string | null
  edited_at: string | null
  created_at: string
  author?: ProfileBrief
}

export interface Friendship {
  id: string
  requester_id: string
  addressee_id: string
  status: FriendshipStatus
  created_at: string
  updated_at: string
}

export interface DmChannel {
  id: string
  friendship_id: string
  participant_a: string
  participant_b: string
  created_at: string
}

export interface DmMessage {
  id: string
  channel_id: string
  author_id: string
  content: string
  client_nonce: string | null
  edited_at: string | null
  created_at: string
}
