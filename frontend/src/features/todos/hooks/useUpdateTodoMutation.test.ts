import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useUpdateTodoMutation } from './useUpdateTodoMutation'

vi.mock('../api/todos')

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children)

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

it('replaces the task with the matching id and leaves the others untouched', async () => {
  const other = { ...todoFixture, id: 8 }
  const saved = { ...todoFixture, title: 'Renamed' }
  client.setQueryData(todoKeys.list, [todoFixture, other])
  vi.mocked(todosApi.update).mockResolvedValue(saved)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  result.current.mutate({ id: 7, input: { title: 'Renamed' } })
  await waitFor(() =>
    expect(client.getQueryData(todoKeys.list)).toEqual([saved, other]),
  )
  expect(todosApi.update).toHaveBeenCalledWith(7, { title: 'Renamed' })
})

it('leaves the list cache undefined when it was never loaded', async () => {
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  result.current.mutate({ id: 7, input: { title: 'Renamed' } })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(client.getQueryData(todoKeys.list)).toBeUndefined()
})

it('leaves the list unchanged when the saved id is not in it', async () => {
  const other = { ...todoFixture, id: 8 }
  client.setQueryData(todoKeys.list, [other])
  vi.mocked(todosApi.update).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useUpdateTodoMutation(), { wrapper })
  result.current.mutate({ id: 7, input: { title: 'Renamed' } })
  await waitFor(() => expect(result.current.isSuccess).toBe(true))
  expect(client.getQueryData(todoKeys.list)).toEqual([other])
})
