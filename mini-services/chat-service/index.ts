import { createServer } from 'http'
import { Server } from 'socket.io'

const PORT = 3003

const httpServer = createServer()
const io = new Server(httpServer, {
  // DO NOT change the path, it is used by Caddy to forward the request to the correct port
  path: '/',
  cors: { origin: '*', methods: ['GET', 'POST'] },
  pingTimeout: 60000,
  pingInterval: 25000,
})

interface PresenceUser {
  socketId: string
  userId: string
  name: string
}

const online = new Map<string, PresenceUser>() // userId -> presence

io.on('connection', (socket) => {
  let presence: PresenceUser | null = null

  socket.on('chat:join', (data: { userId: string; name: string; conversationId?: string }) => {
    presence = { socketId: socket.id, userId: data.userId, name: data.name }
    online.set(data.userId, presence)
    io.emit('chat:online', Array.from(online.values()).map((p) => ({ userId: p.userId, name: p.name })))
    if (data.conversationId) socket.join(`conv-${data.conversationId}`)
    socket.join(`user-${data.userId}`)
  })

  socket.on('chat:enter', (conversationId: string) => {
    socket.join(`conv-${conversationId}`)
  })

  socket.on('chat:leave', (conversationId: string) => {
    socket.leave(`conv-${conversationId}`)
  })

  // relay message to everyone in the conversation room + notify recipients personally
  socket.on('chat:message', (data: { conversationId: string; message: { id: string; conversationId: string; senderId: string; senderName?: string; content: string; createdAt: string }; toUserIds: string[] }) => {
    io.to(`conv-${data.conversationId}`).emit('chat:message', data.message)
    for (const uid of data.toUserIds || []) {
      if (uid === data.message.senderId) continue
      io.to(`user-${uid}`).emit('chat:notify', {
        conversationId: data.conversationId,
        message: data.message,
      })
    }
  })

  socket.on('chat:typing', (data: { conversationId: string; userId: string; name: string }) => {
    socket.to(`conv-${data.conversationId}`).emit('chat:typing', data)
  })

  socket.on('disconnect', () => {
    if (presence) {
      online.delete(presence.userId)
      io.emit('chat:online', Array.from(online.values()).map((p) => ({ userId: p.userId, name: p.name })))
    }
  })
})

httpServer.listen(PORT, () => {
  console.log(`Hyper Zeytoon chat service listening on :${PORT}`)
})
