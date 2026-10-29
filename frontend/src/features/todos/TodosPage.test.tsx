import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { useNotice } from '../../hooks/useNotice'
import { useClearCompletedMutation } from './hooks/useClearCompletedMutation'
import { useTodoFilters } from './hooks/useTodoFilters'
import { useTodosBusy } from './hooks/useTodosBusy'
import { useTodosQuery } from './hooks/useTodosQuery'
import { useUpdateTodoMutation } from './hooks/useUpdateTodoMutation'
import { todoFixture } from '../../test/todoFixture'
import type { Todo } from './types'
import { TodosPage } from './TodosPage'

vi.mock('../../design-system', () => import('../../design-system/mocks'))
vi.mock('../../hooks/useNotice', () => ({ useNotice: vi.fn() }))
vi.mock('./hooks/useTodoFilters', () => ({ useTodoFilters: vi.fn() }))
vi.mock('./hooks/useTodosBusy', () => ({ useTodosBusy: vi.fn() }))
vi.mock('./hooks/useTodosQuery', () => ({ useTodosQuery: vi.fn() }))
vi.mock('./hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./hooks/useClearCompletedMutation', () => ({
  useClearCompletedMutation: vi.fn(),
}))
vi.mock('./components/TodosHeader', () => ({
  TodosHeader: ({
    onCreate,
    onClearCompleted,
    completedCount,
  }: {
    onCreate: () => void
    onClearCompleted: () => void
    completedCount: number
  }) => (
    <>
      <h1>Tasks</h1>
      <button onClick={onCreate}>Open editor</button>
      <button onClick={onClearCompleted}>Clear ({completedCount})</button>
    </>
  ),
}))
vi.mock('./components/TodoFilters', () => ({ TodoFilters: () => null }))
vi.mock('./components/TodoList', () => ({
  TodoList: ({
    todos,
    onToggle,
    onDelete,
  }: {
    todos: Todo[]
    onToggle: (todo: Todo) => void
    onDelete: (todo: Todo) => void
  }) => (
    <>
      <p>Task list</p>
      {todos.map((todo) => (
        <div key={todo.id}>
          <button onClick={() => onToggle(todo)}>Toggle {todo.title}</button>
          <button onClick={() => onDelete(todo)}>Delete {todo.title}</button>
        </div>
      ))}
    </>
  ),
}))
vi.mock('./components/TodoEditor', () => ({
  TodoEditor: ({ onSaved }: { onSaved: (message: string) => void }) => (
    <button onClick={() => onSaved('Editor notice.')}>Finish editing</button>
  ),
}))
vi.mock('./components/DeleteTodoDialog', () => ({
  DeleteTodoDialog: ({ onDeleted }: { onDeleted: () => void }) => (
    <button onClick={onDeleted}>Finish deleting</button>
  ),
}))
vi.mock('../../components/SuccessNotice', () => ({ SuccessNotice: () => null }))

function setup({
  busy = false,
  isFetching = false,
  queryError = null,
  mutationError = null,
  mutateAsync = vi.fn(),
  clearMutateAsync = vi.fn(),
  clearError = null,
  todo = todoFixture,
}: {
  busy?: boolean
  isFetching?: boolean
  queryError?: Error | null
  mutationError?: Error | null
  mutateAsync?: () => unknown
  clearMutateAsync?: () => unknown
  clearError?: Error | null
  todo?: Todo
} = {}) {
  const notify = vi.fn()
  vi.mocked(useClearCompletedMutation).mockReturnValue({
    error: clearError,
    reset: vi.fn(),
    mutateAsync: clearMutateAsync,
  } as unknown as ReturnType<typeof useClearCompletedMutation>)
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [todo],
    isPending: false,
    isFetching,
    isError: !!queryError,
    error: queryError,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: mutationError,
    reset: vi.fn(),
    mutateAsync,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(busy)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [todo],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  return { notify, mutateAsync, clearMutateAsync }
}

it('counts only completed tasks for the clear button', () => {
  setup({ todo: { ...todoFixture, completed: true } })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'Clear (1)' })).toBeVisible()
})

it('does not count active tasks for the clear button', () => {
  setup({ todo: { ...todoFixture, completed: false } })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'Clear (0)' })).toBeVisible()
})

it('notifies that completed tasks were cleared', async () => {
  const user = userEvent.setup()
  const clearMutateAsync = vi.fn().mockResolvedValue({ deleted: 1 })
  const { notify } = setup({ clearMutateAsync })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Clear (0)' }))
  expect(clearMutateAsync).toHaveBeenCalledTimes(1)
  expect(notify).toHaveBeenCalledWith('Completed tasks cleared.')
})

it('does not notify when clearing fails', async () => {
  const user = userEvent.setup()
  const clearMutateAsync = vi.fn().mockRejectedValue(new Error('boom'))
  const { notify } = setup({ clearMutateAsync })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Clear (0)' }))
  expect(clearMutateAsync).toHaveBeenCalledTimes(1)
  expect(notify).not.toHaveBeenCalledWith('Completed tasks cleared.')
})

it('ignores clearing while the page is busy', async () => {
  const user = userEvent.setup()
  const { clearMutateAsync, notify } = setup({ busy: true })
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Clear (0)' }))
  expect(clearMutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('shows the clear error in the page alert', () => {
  setup({ clearError: new Error('Clear failed.') })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Clear failed.')
})

it.each([
  ['completes', false, true, 'Another task complete. Well done!'],
  ['reopens', true, false, 'Task marked as active.'],
])(
  'toggling a task that %s it notifies the user',
  async (_, completed, savedCompleted, message) => {
    const user = userEvent.setup()
    const mutateAsync = vi
      .fn()
      .mockResolvedValue({ ...todoFixture, completed: savedCompleted })
    const { notify } = setup({
      mutateAsync,
      todo: { ...todoFixture, completed },
    })
    render(<TodosPage />)
    await user.click(
      screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
    )
    expect(mutateAsync).toHaveBeenCalledWith({
      id: 7,
      input: { completed: savedCompleted },
    })
    expect(notify).toHaveBeenCalledWith(message)
  },
)

it('ignores a toggle while the page is busy', async () => {
  const user = userEvent.setup()
  const { mutateAsync, notify } = setup({ busy: true })
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(notify).not.toHaveBeenCalled()
})

it('does not notify when the toggle fails', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockRejectedValue(new Error('boom'))
  const { notify } = setup({ mutateAsync })
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Toggle ${todoFixture.title}` }),
  )
  expect(mutateAsync).toHaveBeenCalledTimes(1)
  expect(notify).not.toHaveBeenCalled()
})

it.each([
  ['a refetch is running', true, false],
  ['the page is busy', false, true],
])('disables Try again when %s', (_, isFetching, busy) => {
  setup({ isFetching, busy, queryError: new Error('Query failed.') })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'Try again' })).toBeDisabled()
})

it('enables Try again when idle', () => {
  setup({ queryError: new Error('Query failed.') })
  render(<TodosPage />)
  expect(screen.getByRole('button', { name: 'Try again' })).toBeEnabled()
})

it('notifies with the editor message and closes the editor after saving', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(screen.getByRole('button', { name: 'Open editor' }))
  await user.click(screen.getByRole('button', { name: 'Finish editing' }))
  expect(notify).toHaveBeenCalledWith('Editor notice.')
  expect(
    screen.queryByRole('button', { name: 'Finish editing' }),
  ).not.toBeInTheDocument()
})

it('notifies that the task was deleted and closes the dialog', async () => {
  const user = userEvent.setup()
  const { notify } = setup()
  render(<TodosPage />)
  await user.click(
    screen.getByRole('button', { name: `Delete ${todoFixture.title}` }),
  )
  await user.click(screen.getByRole('button', { name: 'Finish deleting' }))
  expect(notify).toHaveBeenCalledWith('Task deleted.')
  expect(
    screen.queryByRole('button', { name: 'Finish deleting' }),
  ).not.toBeInTheDocument()
})

it('shows the mutation error instead of the query error', () => {
  setup({
    queryError: new Error('Query failed.'),
    mutationError: new Error('Mutation failed.'),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent('Mutation failed.')
  expect(screen.getByTestId('alert')).not.toHaveTextContent('Query failed.')
})

it('displays a query failure and resets mutation errors before retrying', async () => {
  const user = userEvent.setup()
  const refetch = vi.fn().mockResolvedValue(undefined)
  const reset = vi.fn()
  const clearReset = vi.fn()
  vi.mocked(useClearCompletedMutation).mockReturnValue({
    error: null,
    reset: clearReset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useClearCompletedMutation>)
  vi.mocked(useTodosQuery).mockReturnValue({
    data: [],
    isPending: false,
    isFetching: false,
    isError: true,
    error: new Error('The server is unavailable.'),
    refetch,
  } as unknown as ReturnType<typeof useTodosQuery>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    error: null,
    reset,
    mutateAsync: vi.fn(),
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  vi.mocked(useTodosBusy).mockReturnValue(false)
  vi.mocked(useNotice).mockReturnValue({ message: '', notify: vi.fn() })
  vi.mocked(useTodoFilters).mockReturnValue({
    filter: 'all',
    search: '',
    sort: 'newest',
    visible: [],
    setFilter: vi.fn(),
    setSearch: vi.fn(),
    setSort: vi.fn(),
  })
  render(<TodosPage />)
  expect(screen.getByTestId('alert')).toHaveTextContent(
    'The server is unavailable.',
  )
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(refetch).toHaveBeenCalledTimes(1))
  expect(reset).toHaveBeenCalledTimes(1)
  expect(clearReset).toHaveBeenCalledTimes(1)
  expect(reset.mock.invocationCallOrder[0]).toBeLessThan(
    refetch.mock.invocationCallOrder[0],
  )
})
