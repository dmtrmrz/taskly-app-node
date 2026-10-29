import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { request } from './http'

const fetchMock = vi.fn()

beforeEach(() => {
  fetchMock.mockReset()
  vi.stubGlobal('fetch', fetchMock)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

it('reports a connection error when fetch rejects', async () => {
  fetchMock.mockRejectedValue(new TypeError('Failed to fetch'))
  await expect(request('/todos')).rejects.toThrow(
    'Cannot connect to the server. Please try again.',
  )
})

it('rethrows the original error when the request was aborted', async () => {
  const controller = new AbortController()
  controller.abort()
  const abortError = new DOMException('Aborted', 'AbortError')
  fetchMock.mockRejectedValue(abortError)
  await expect(request('/todos', { signal: controller.signal })).rejects.toBe(
    abortError,
  )
})

it('maps 422 to the fixed validation message', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: 'ignored' }), { status: 422 }),
  )
  await expect(request('/todos')).rejects.toThrow(
    'Check the task details: title up to 120 characters, description up to 2000 characters, and a valid due date.',
  )
})

it('passes a string detail through as the error message', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ detail: 'Task not found.' }), {
      status: 404,
    }),
  )
  await expect(request('/todos/1')).rejects.toThrow('Task not found.')
})

it.each([
  ['a non-string detail', JSON.stringify({ detail: [{ msg: 'x' }] })],
  ['a non-JSON body', 'oops'],
])('falls back to the generic message for %s', async (_, body) => {
  fetchMock.mockResolvedValue(new Response(body, { status: 500 }))
  await expect(request('/todos')).rejects.toThrow(
    'The operation failed. Please try again.',
  )
})

it('returns undefined for 204 responses', async () => {
  fetchMock.mockResolvedValue(new Response(null, { status: 204 }))
  await expect(
    request('/todos/1', { method: 'DELETE' }),
  ).resolves.toBeUndefined()
})

it('returns the parsed JSON body on success', async () => {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify([{ id: 1 }]), { status: 200 }),
  )
  await expect(request('/todos')).resolves.toEqual([{ id: 1 }])
})

it('prefixes the path with /api and merges caller headers with the JSON content type', async () => {
  fetchMock.mockResolvedValue(new Response('{}', { status: 200 }))
  await request('/todos', { method: 'POST', headers: { 'X-Test': '1' } })
  expect(fetchMock).toHaveBeenCalledWith('/api/todos', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Test': '1' },
  })
})
