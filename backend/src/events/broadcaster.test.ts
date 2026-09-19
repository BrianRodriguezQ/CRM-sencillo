import { describe, it, expect } from 'vitest'
import {
  onConnect,
  onDisconnect,
  emitToUser,
  emitToRole,
  emitToAll,
  sseStats,
} from './broadcaster.js'

function makeSink() {
  const received: Array<{ event: string; data: unknown }> = []
  const write = (event: string, data: unknown) => {
    received.push({ event, data })
  }
  return { received, write }
}

describe('broadcaster SSE (WP1)', () => {
  it('entrega eventos a todas las pestañas de un usuario', () => {
    const a = makeSink()
    const b = makeSink()
    const idA = onConnect(7, 'vendedor', a.write)
    const idB = onConnect(7, 'vendedor', b.write)

    emitToUser(7, 'notification', { title: 'Hola' })

    expect(a.received).toHaveLength(1)
    expect(b.received).toHaveLength(1)
    expect(a.received[0]).toEqual({ event: 'notification', data: { title: 'Hola' } })

    onDisconnect(7, idA)
    onDisconnect(7, idB)
  })

  it('no entrega a otros usuarios', () => {
    const a = makeSink()
    const b = makeSink()
    const idA = onConnect(7, 'vendedor', a.write)
    const idB = onConnect(8, 'conductor', b.write)

    emitToUser(7, 'order_changed', { orderId: 1 })

    expect(a.received).toHaveLength(1)
    expect(b.received).toHaveLength(0)

    onDisconnect(7, idA)
    onDisconnect(8, idB)
  })

  it('emitToRole llega solo al rol indicado', () => {
    const admin = makeSink()
    const seller = makeSink()
    const idAdmin = onConnect(1, 'superadmin', admin.write)
    const idSeller = onConnect(2, 'vendedor', seller.write)

    emitToRole('superadmin', 'order_changed', { orderId: 5 })

    expect(admin.received).toHaveLength(1)
    expect(admin.received[0].event).toBe('order_changed')
    expect(seller.received).toHaveLength(0)

    onDisconnect(1, idAdmin)
    onDisconnect(2, idSeller)
  })

  it('onDisconnect elimina la conexión (deja de recibir)', () => {
    const a = makeSink()
    const id = onConnect(9, 'vendedor', a.write)
    onDisconnect(9, id)

    emitToUser(9, 'notification', { title: 'nadie' })
    expect(a.received).toHaveLength(0)
  })

  it('sseStats refleja conexiones activas', () => {
    const a = makeSink()
    const b = makeSink()
    const idA = onConnect(1, 'superadmin', a.write)
    const idB = onConnect(2, 'vendedor', b.write)

    expect(sseStats()).toEqual({ connections: 2, users: 2 })

    onDisconnect(1, idA)
    expect(sseStats()).toEqual({ connections: 1, users: 1 })

    onDisconnect(2, idB)
    expect(sseStats()).toEqual({ connections: 0, users: 0 })
  })

  it('no lanza si el write del stream falla (stream roto)', () => {
    const failing = { write: () => { throw new Error('stream cerrado') } }
    const id = onConnect(3, 'vendedor', failing.write)

    // No debe lanzar: safeWrite atrapa el error y el onAbort limpiará.
    expect(() => emitToUser(3, 'notification', { title: 'x' })).not.toThrow()

    onDisconnect(3, id)
  })
})