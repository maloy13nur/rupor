// supabase/functions/livekit-token/index.ts
// Supabase Edge Function — генерирует LiveKit access-token.
// Деплой: supabase functions deploy livekit-token
// Секреты: supabase secrets set LIVEKIT_API_KEY=... LIVEKIT_API_SECRET=... LIVEKIT_URL=...

import { createClient } from 'jsr:@supabase/supabase-js@2'
import { AccessToken } from 'npm:livekit-server-sdk@2'

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  // Проверяем JWT пользователя
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401 })

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } },
  )

  const { data: { user }, error } = await db.auth.getUser()
  if (error || !user) return new Response('Unauthorized', { status: 401 })

  const { room, name } = await req.json() as { room: string; name: string }
  if (!room || !name) return new Response('room и name обязательны', { status: 400 })

  const apiKey = Deno.env.get('LIVEKIT_API_KEY')!
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET')!

  const at = new AccessToken(apiKey, apiSecret, {
    identity: user.id,
    name,
    ttl: '4h',
  })

  at.addGrant({
    room,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const token = await at.toJwt()

  return Response.json({ token }, {
    headers: { 'Access-Control-Allow-Origin': '*' },
  })
})
