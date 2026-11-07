// src/features/friends/friendsService.ts
import { supabase } from '@/lib/supabase'
import type { Friendship, Profile } from '@/lib/db-types'

export type FriendWithProfile = {
  friendship: Friendship
  profile: Profile
}

/** Загрузить список друзей (принятые заявки) */
export async function fetchFriends(myId: string): Promise<FriendWithProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select(`
      *,
      requester:profiles!friendships_requester_id_fkey(*),
      addressee:profiles!friendships_addressee_id_fkey(*)
    `)
    .eq('status', 'accepted')
    .or(`requester_id.eq.${myId},addressee_id.eq.${myId}`)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => {
    const isRequester = (row.requester as Profile).id === myId
    return {
      friendship: row as unknown as Friendship,
      profile: (isRequester ? row.addressee : row.requester) as unknown as Profile,
    }
  })
}

/** Загрузить входящие заявки в друзья */
export async function fetchPendingRequests(myId: string): Promise<FriendWithProfile[]> {
  const { data, error } = await supabase
    .from('friendships')
    .select('*, requester:profiles!friendships_requester_id_fkey(*)')
    .eq('status', 'pending')
    .eq('addressee_id', myId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => ({
    friendship: row as unknown as Friendship,
    profile: row.requester as unknown as Profile,
  }))
}

/** Отправить заявку в друзья по username */
export async function sendFriendRequestByUsername(username: string): Promise<void> {
  // Ищем пользователя по нику
  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('id')
    .ilike('username', username.trim())
    .maybeSingle()
  if (pErr) throw new Error(pErr.message)
  if (!profile) throw new Error('Пользователь не найден')

  const { error } = await supabase.rpc('send_friend_request', { p_addressee_id: profile.id })
  if (error) {
    if (error.message.includes('ALREADY_EXISTS')) throw new Error('Заявка уже отправлена или вы уже друзья')
    if (error.message.includes('SELF_FRIEND')) throw new Error('Нельзя добавить себя')
    throw new Error(error.message)
  }
}

/** Принять заявку */
export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId)
  if (error) throw new Error(error.message)
}

/** Отклонить или удалить друга */
export async function removeFriend(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .delete()
    .eq('id', friendshipId)
  if (error) throw new Error(error.message)
}

/** Открыть или найти DM-канал с пользователем */
export async function openDm(otherId: string): Promise<string> {
  const { data, error } = await supabase.rpc('open_dm', { p_other_id: otherId })
  if (error) throw new Error(error.message)
  return data as string
}
