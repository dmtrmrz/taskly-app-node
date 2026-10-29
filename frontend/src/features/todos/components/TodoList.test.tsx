import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoList } from './TodoList'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))
vi.mock('./TodoEmptyState', () => ({
  TodoEmptyState: ({
    hasTodos,
    disabled,
    onCreate,
  }: {
    hasTodos: boolean
    disabled: boolean
    onCreate: () => void
  }) => (
    <>
      <p>Empty task list</p>
      <p>{hasTodos ? 'has todos' : 'no todos'}</p>
      <button disabled={disabled} onClick={onCreate}>
        Create task
      </button>
    </>
  ),
}))
vi.mock('./TodoItem', () => ({
  TodoItem: ({
    todo,
    busy,
    onToggle,
    onEdit,
    onDelete,
  }: {
    todo: Todo
    busy: boolean
    onToggle: () => void
    onEdit: () => void
    onDelete: () => void
  }) => (
    <li>
      {todo.title}
      <span>{busy ? 'item busy' : 'item idle'}</span>
      <button onClick={onToggle}>Toggle {todo.title}</button>
      <button onClick={onEdit}>Edit {todo.title}</button>
      <button onClick={onDelete}>Delete {todo.title}</button>
    </li>
  ),
}))

const second = { ...todoFixture, id: 8, title: 'Second task' }
const listProps = {
  todos: [todoFixture, second],
  hasTodos: true,
  loading: false,
  failed: false,
  busy: false,
  onCreate: vi.fn(),
  onToggle: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
}

it('shows the unavailable message when loading failed and there are no tasks', () => {
  render(<TodoList {...listProps} todos={[]} hasTodos={false} failed />)
  expect(
    screen.getByRole('heading', {
      name: 'The task list is temporarily unavailable',
    }),
  ).toBeVisible()
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
})

it('still lists tasks when a refetch failed but tasks are cached', () => {
  render(<TodoList {...listProps} failed />)
  expect(screen.getByText(todoFixture.title)).toBeVisible()
  expect(
    screen.queryByText('The task list is temporarily unavailable'),
  ).not.toBeInTheDocument()
})

it('passes busy to every item', () => {
  render(<TodoList {...listProps} busy />)
  expect(screen.getAllByText('item busy')).toHaveLength(2)
  expect(screen.queryByText('item idle')).not.toBeInTheDocument()
})

it('forwards hasTodos and the disabled state to the empty state', () => {
  render(<TodoList {...listProps} todos={[]} hasTodos={false} busy />)
  expect(screen.getByText('no todos')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Create task' })).toBeDisabled()
})

it('tells the empty state that tasks exist when filters hide them all', () => {
  render(<TodoList {...listProps} todos={[]} hasTodos />)
  expect(screen.getByText('has todos')).toBeVisible()
  expect(screen.getByRole('button', { name: 'Create task' })).toBeEnabled()
})

it('calls onCreate from the empty state', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  render(
    <TodoList {...listProps} todos={[]} hasTodos={false} onCreate={onCreate} />,
  )
  await user.click(screen.getByRole('button', { name: 'Create task' }))
  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('passes the matching task to each item callback', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const onEdit = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoList
      {...listProps}
      onToggle={onToggle}
      onEdit={onEdit}
      onDelete={onDelete}
    />,
  )
  await user.click(screen.getByRole('button', { name: 'Toggle Second task' }))
  await user.click(screen.getByRole('button', { name: 'Edit Second task' }))
  await user.click(screen.getByRole('button', { name: 'Delete Second task' }))
  expect(onToggle).toHaveBeenCalledWith(second)
  expect(onEdit).toHaveBeenCalledWith(second)
  expect(onDelete).toHaveBeenCalledWith(second)
})

it('shows loading feedback before showing an empty list', () => {
  const props = {
    todos: [],
    hasTodos: false,
    failed: false,
    busy: false,
    onCreate: vi.fn(),
    onToggle: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
  }
  const { rerender } = render(<TodoList {...props} loading />)
  expect(screen.getByRole('status')).toHaveTextContent('Loading your tasks…')
  expect(screen.queryByText('Empty task list')).not.toBeInTheDocument()
  rerender(<TodoList {...props} loading={false} />)
  expect(screen.queryByRole('status')).not.toBeInTheDocument()
  expect(screen.getByText('Empty task list')).toBeVisible()
})
