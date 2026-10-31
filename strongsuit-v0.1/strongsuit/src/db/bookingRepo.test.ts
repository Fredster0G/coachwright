import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from './schema'
import { trainerRepo, messagesRepo } from './repo'
import type { CoachMessage } from './types'

const inFuture = (h: number) => new Date(Date.now() + h * 3_600_000)
const at = (d: Date) => d.toISOString()

beforeEach(async () => {
  for (const table of db.tables) await table.clear()
  await trainerRepo.getOrCreate()
})

function request(id: string, start: Date, over: Partial<CoachMessage> = {}): CoachMessage {
  return {
    id, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', clientId: 'c1',
    date: '2026-01-01T00:00:00.000Z', direction: 'inbound', channel: 'app', content: 'Session request',
    booking: { start: at(start), end: at(new Date(start.getTime() + 3_600_000)) }, ...over,
  }
}

describe('booking requests (coach side)', () => {
  it('accept creates the appointment, links it, replies, and can\'t be answered twice', async () => {
    const start = inFuture(48)
    await db.messages.add(request('r1', start))
    expect((await messagesRepo.pendingBookings()).map(m => m.id)).toEqual(['r1'])

    const apptId = await messagesRepo.answerBooking('r1', true, 'Confirmed')
    const appt = await db.appointments.get(apptId!)
    expect(appt).toMatchObject({ clientId: 'c1', start: at(start), status: 'scheduled' })
    expect((await db.messages.get('r1'))!.booking).toMatchObject({ status: 'accepted', appointmentId: apptId })
    const reply = (await db.messages.toArray()).find(m => m.direction === 'outbound')!
    expect(reply).toMatchObject({ clientId: 'c1', content: 'Confirmed', channel: 'app' })
    expect(await messagesRepo.pendingBookings()).toEqual([])
    await expect(messagesRepo.answerBooking('r1', false, 'x')).rejects.toThrow(/already answered/)
  })

  it('decline replies and books nothing', async () => {
    await db.messages.add(request('r2', inFuture(30)))
    expect(await messagesRepo.answerBooking('r2', false, 'Sorry')).toBeUndefined()
    expect(await db.appointments.count()).toBe(0)
    expect((await db.messages.get('r2'))!.booking!.status).toBe('declined')
  })

  it('past and coach-side rows are not pending', async () => {
    await db.messages.bulkAdd([request('old', new Date(Date.now() - 48 * 3_600_000)), request('out', inFuture(5), { direction: 'outbound' })])
    expect(await messagesRepo.pendingBookings()).toEqual([])
  })

  it('publishes slots only when they change, holding requested ones', async () => {
    const tomorrow = inFuture(24)
    const day = tomorrow.getDay()
    await trainerRepo.patch({ booking: { enabled: true, slotMinutes: 60, noticeHours: 0, windows: [{ day, start: '09:00', end: '11:00' }] } })
    expect(await trainerRepo.publishBookingSlots()).toBe(true)
    expect(await trainerRepo.publishBookingSlots()).toBe(false)              // unchanged → no write
    const nine = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate(), 9)
    const before = (await trainerRepo.get())!.bookingSlots!.map(s => s.start)
    expect(before).toContain(at(nine))
    await db.messages.add(request('r3', nine))
    expect(await trainerRepo.publishBookingSlots()).toBe(true)
    expect((await trainerRepo.get())!.bookingSlots!.map(s => s.start)).not.toContain(at(nine))
  })
})
