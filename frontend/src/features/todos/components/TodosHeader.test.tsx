import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { TodosHeader } from './TodosHeader'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

it('invokes creation when enabled and blocks it when disabled', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn()
  const { rerender } = render(
    <TodosHeader
      disabled={false}
      completedCount={0}
      onCreate={onCreate}
      onClearCompleted={vi.fn()}
    />,
  )
  expect(screen.getByRole('heading', { name: 'Tasks' })).toBeVisible()
  expect(
    screen.getByText('Create, organize, and complete tasks.'),
  ).toBeVisible()
  const button = screen.getByRole('button', { name: 'New task' })
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
  rerender(
    <TodosHeader
      disabled
      completedCount={0}
      onCreate={onCreate}
      onClearCompleted={vi.fn()}
    />,
  )
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onCreate).toHaveBeenCalledTimes(1)
})

it('shows the completed count and clears on click', async () => {
  const user = userEvent.setup()
  const onClearCompleted = vi.fn()
  render(
    <TodosHeader
      disabled={false}
      completedCount={3}
      onCreate={vi.fn()}
      onClearCompleted={onClearCompleted}
    />,
  )
  const button = screen.getByRole('button', { name: 'Clear completed (3)' })
  expect(button).toBeEnabled()
  await user.click(button)
  expect(onClearCompleted).toHaveBeenCalledTimes(1)
})

it.each([
  ['there are no completed tasks', false, 0],
  ['the header is disabled', true, 2],
])('disables Clear completed when %s', async (_, disabled, completedCount) => {
  const user = userEvent.setup()
  const onClearCompleted = vi.fn()
  render(
    <TodosHeader
      disabled={disabled}
      completedCount={completedCount}
      onCreate={vi.fn()}
      onClearCompleted={onClearCompleted}
    />,
  )
  const button = screen.getByRole('button', {
    name: `Clear completed (${completedCount})`,
  })
  expect(button).toBeDisabled()
  await user.click(button)
  expect(onClearCompleted).not.toHaveBeenCalled()
})
