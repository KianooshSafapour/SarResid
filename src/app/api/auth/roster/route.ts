import { db } from '@/lib/db'
import { ok } from '@/lib/api'

/** Public roster for the login screen */
export async function GET() {
  const users = await db.user.findMany({
    where: { active: true },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      username: true,
      fullName: true,
      honorific: true,
      role: true,
      title: true,
      avatarJson: true,
      pin: true,
    },
  })
  return ok({
    users: users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      honorific: u.honorific,
      role: u.role,
      title: u.title,
      avatarJson: u.avatarJson,
      hasPin: !!u.pin,
    })),
  })
}
