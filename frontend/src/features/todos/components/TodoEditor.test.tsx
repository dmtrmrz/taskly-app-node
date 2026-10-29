import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { useCreateTodoMutation } from '../hooks/useCreateTodoMutation'
import { useUpdateTodoMutation } from '../hooks/useUpdateTodoMutation'
import type { TodoInput } from '../types'
import { TodoEditor } from './TodoEditor'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('../hooks/useCreateTodoMutation', () => ({
  useCreateTodoMutation: vi.fn(),
}))
vi.mock('../hooks/useUpdateTodoMutation', () => ({
  useUpdateTodoMutation: vi.fn(),
}))
vi.mock('./TodoForm', () => ({
  TodoForm: ({
    onSubmit,
    error,
  }: {
    onSubmit: (input: TodoInput) => Promise<void>
    error: string | null
  }) => (
    <>
      <button onClick={() => void onSubmit(todoFixture)}>Submit form</button>
      <p>{error}</p>
    </>
  ),
}))

function mockMutations(
  update: {
    mutateAsync: () => unknown
    error?: Error | null
    isPending?: boolean
  },
  create: {
    mutateAsync?: () => unknown
    error?: Error | null
    isPending?: boolean
  } = {},
) {
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: vi.fn(),
    ...create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    ...update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
}

it.each([
  ['the page is busy', false, true],
  ['the mutation is pending', true, false],
])('does not save while %s', async (_, isPending, busy) => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn()
  mockMutations({ mutateAsync, isPending })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={busy}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  expect(mutateAsync).not.toHaveBeenCalled()
  expect(onSaved).not.toHaveBeenCalled()
})

it('passes the create mutation error to the form in new mode', () => {
  mockMutations(
    { mutateAsync: vi.fn(), error: new Error('Update error.') },
    { error: new Error('Create error.') },
  )
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={vi.fn()} />,
  )
  expect(screen.getByText('Create error.')).toBeVisible()
  expect(screen.queryByText('Update error.')).not.toBeInTheDocument()
})

it('updates an existing task and reports the saved changes', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockResolvedValue(todoFixture)
  mockMutations({ mutateAsync })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  expect(screen.getByRole('dialog', { name: 'Edit task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('Changes saved.'))
  expect(mutateAsync).toHaveBeenCalledWith({ id: 7, input: todoFixture })
})

it('does not report a save when the mutation rejects', async () => {
  const user = userEvent.setup()
  const mutateAsync = vi.fn().mockRejectedValue(new Error('boom'))
  mockMutations({ mutateAsync })
  const onSaved = vi.fn()
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={onSaved}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1))
  expect(onSaved).not.toHaveBeenCalled()
})

it('passes the mutation error message to the form', () => {
  mockMutations({ mutateAsync: vi.fn(), error: new Error('Server said no.') })
  render(
    <TodoEditor
      todo={todoFixture}
      busy={false}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  )
  expect(screen.getByText('Server said no.')).toBeVisible()
})

it('creates a new task and reports a successful save', async () => {
  const user = userEvent.setup()
  const create = vi.fn().mockResolvedValue(todoFixture)
  const update = vi.fn()
  vi.mocked(useCreateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: create,
  } as unknown as ReturnType<typeof useCreateTodoMutation>)
  vi.mocked(useUpdateTodoMutation).mockReturnValue({
    isPending: false,
    error: null,
    mutateAsync: update,
  } as unknown as ReturnType<typeof useUpdateTodoMutation>)
  const onSaved = vi.fn()
  render(
    <TodoEditor todo="new" busy={false} onClose={vi.fn()} onSaved={onSaved} />,
  )
  expect(screen.getByRole('dialog', { name: 'New task' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: 'Submit form' }))
  await waitFor(() => expect(onSaved).toHaveBeenCalledWith('New task added.'))
  expect(create).toHaveBeenCalledWith(todoFixture)
  expect(update).not.toHaveBeenCalled()
})
