import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode } from 'react'
import { beforeEach, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { todoKeys } from '../api/queryKeys'
import { todosApi } from '../api/todos'
import { useCreateTodoMutation } from './useCreateTodoMutation'

vi.mock('../api/todos')

let client: QueryClient
const wrapper = ({ children }: { children: ReactNode }) =>
  createElement(QueryClientProvider, { client }, children)

beforeEach(() => {
  vi.clearAllMocks()
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
})

const input = {
  title: todoFixture.title,
  description: '',
  priority: 'medium' as const,
  due_date: null,
  completed: false,
}

it('prepends the saved task and removes a stale copy with the same id', async () => {
  const saved = { ...todoFixture, id: 5, title: 'Saved' }
  const other = { ...todoFixture, id: 6 }
  client.setQueryData(todoKeys.list, [other, { ...todoFixture, id: 5 }])
  vi.mocked(todosApi.create).mockResolvedValue(saved)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  result.current.mutate(input)
  await waitFor(() =>
    expect(client.getQueryData(todoKeys.list)).toEqual([saved, other]),
  )
})

it('creates the list cache when it is empty', async () => {
  vi.mocked(todosApi.create).mockResolvedValue(todoFixture)
  const { result } = renderHook(() => useCreateTodoMutation(), { wrapper })
  result.current.mutate(input)
  await waitFor(() =>
    expect(client.getQueryData(todoKeys.list)).toEqual([todoFixture]),
  )
})
