import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useClearCompletedMutation } from './useClearCompletedMutation'

vi.mock('../api/todos')

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children)

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

it('removes completed tasks from the list cache and keeps active ones', async () => {
  const active = { ...todoFixture, id: 8, completed: false }
  const done = { ...todoFixture, id: 9, completed: true }
  client.setQueryData(todoKeys.list, [done, active])
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 1 })
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  result.current.mutate()
  await waitFor(() =>
    expect(client.getQueryData(todoKeys.list)).toEqual([active]),
  )
  expect(todosApi.clearCompleted).toHaveBeenCalledTimes(1)
})

it('cancels in-flight list queries before updating the cache', async () => {
  const cancel = vi.spyOn(client, 'cancelQueries')
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  result.current.mutate()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(cancel).toHaveBeenCalledWith({ queryKey: todoKeys.list })
})

it('leaves the list cache undefined when it was never loaded', async () => {
  vi.mocked(todosApi.clearCompleted).mockResolvedValue({ deleted: 0 })
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  result.current.mutate()
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('keeps the cache and exposes the error when clearing fails', async () => {
  const done = { ...todoFixture, completed: true }
  client.setQueryData(todoKeys.list, [done])
  vi.mocked(todosApi.clearCompleted).mockRejectedValue(new Error('boom'))
  const { result } = renderHook(() => useClearCompletedMutation(), { wrapper })
  result.current.mutate()
  await waitFor(() => expect(result.current.error).toEqual(new Error('boom')))
  expect(client.getQueryData(todoKeys.list)).toEqual([done])
})
