import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import type { Todo } from '../types'
import { TodoItem } from './TodoItem'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

function renderItem(todo: Todo, handlers = {}) {
  return render(
    <TodoItem
      todo={todo}
      busy={false}
      onEdit={vi.fn()}
      onToggle={vi.fn()}
      onDelete={vi.fn()}
      {...handlers}
    />,
  )
}

it('shows a completed task with the Completed badge and a Mark as active label', () => {
  renderItem({ ...todoFixture, completed: true })
  expect(screen.getByText('Completed')).toBeVisible()
  expect(screen.queryByText('To do')).not.toBeInTheDocument()
  expect(
    screen.getByRole('checkbox', {
      name: `Mark as active: ${todoFixture.title}`,
    }),
  ).toBeChecked()
})

it('marks a past due date as overdue', () => {
  renderItem({ ...todoFixture, due_date: '2020-01-01' })
  expect(screen.getByText(/1 Jan 2020 · overdue/)).toBeVisible()
})

it('does not mark a future due date as overdue', () => {
  renderItem({ ...todoFixture, due_date: '2999-01-01' })
  expect(screen.getByText(/1 Jan 2999/)).toBeVisible()
  expect(screen.queryByText(/overdue/)).not.toBeInTheDocument()
})

it('disables the checkbox, Edit and Delete while busy', () => {
  renderItem(todoFixture, { busy: true })
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  ).toBeDisabled()
  expect(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  ).toBeDisabled()
})

it('enables the checkbox, Edit and Delete when not busy', () => {
  renderItem(todoFixture)
  expect(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  ).toBeEnabled()
  expect(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  ).toBeEnabled()
  expect(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  ).toBeEnabled()
})

it('shows the description when present', () => {
  renderItem({ ...todoFixture, description: 'Remember the slides' })
  expect(screen.getByText('Remember the slides')).toBeVisible()
})

it('shows no date badge when there is no due date', () => {
  renderItem({ ...todoFixture, due_date: null })
  expect(screen.queryByText(/20\d\d/)).not.toBeInTheDocument()
})

it('forwards toggle and delete requests', async () => {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  const onEdit = vi.fn()
  renderItem(todoFixture, { onToggle, onDelete, onEdit })
  await user.click(
    screen.getByRole('checkbox', { name: `Complete: ${todoFixture.title}` }),
  )
  await user.click(
    screen.getByRole('button', { name: `Delete: ${todoFixture.title}` }),
  )
  expect(onToggle).toHaveBeenCalledTimes(1)
  expect(onDelete).toHaveBeenCalledTimes(1)
  expect(onEdit).not.toHaveBeenCalled()
})

it('shows an active task and forwards edit requests', async () => {
  const user = userEvent.setup()
  const onEdit = vi.fn()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(
    <TodoItem
      todo={todoFixture}
      busy={false}
      onEdit={onEdit}
      onToggle={onToggle}
      onDelete={onDelete}
    />,
  )
  expect(screen.getByRole('heading', { name: todoFixture.title })).toBeVisible()
  expect(screen.getByText('To do')).toBeVisible()
  expect(screen.getByText('Medium')).toBeVisible()
  expect(screen.getByRole('checkbox')).not.toBeChecked()
  await user.click(
    screen.getByRole('button', { name: `Edit: ${todoFixture.title}` }),
  )
  expect(onEdit).toHaveBeenCalledTimes(1)
  expect(onToggle).not.toHaveBeenCalled()
  expect(onDelete).not.toHaveBeenCalled()
})
