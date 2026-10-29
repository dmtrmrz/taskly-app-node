import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TodoForm } from './TodoForm'

vi.mock('../../../design-system', () => import('../../../design-system/mocks'))

describe('TodoForm', () => {
  it('rejects a whitespace-only title without submitting', async () => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '   ')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText('Enter a task title.')).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('prefills the fields from the initial task', () => {
    render(
      <TodoForm
        initial={{
          title: 'Existing',
          description: 'Some notes',
          priority: 'low',
          due_date: '2026-11-05',
          completed: false,
        }}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    expect(screen.getByLabelText(/Task title/)).toHaveValue('Existing')
    expect(screen.getByLabelText(/Description/)).toHaveValue('Some notes')
    expect(screen.getByLabelText('Priority')).toHaveValue('low')
    expect(screen.getByLabelText(/Due date/)).toHaveValue('2026-11-05')
  })

  it('submits a null due date after the date is cleared', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        initial={{
          title: 'Existing',
          description: '',
          priority: 'medium',
          due_date: '2026-11-05',
          completed: false,
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.clear(screen.getByLabelText(/Due date/))
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Existing',
      description: '',
      priority: 'medium',
      due_date: null,
      completed: false,
    })
  })

  it('shows the server error', () => {
    render(
      <TodoForm
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        busy={false}
        error="Server said no."
      />,
    )
    expect(screen.getByTestId('alert')).toHaveTextContent('Server said no.')
  })

  it('shows Saving… and disables the controls while busy', () => {
    render(<TodoForm onSubmit={vi.fn()} onCancel={vi.fn()} busy error={null} />)
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled()
    expect(screen.getByLabelText(/Task title/)).toBeDisabled()
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const onCancel = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={vi.fn()}
        onCancel={onCancel}
        busy={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('trims the description on submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        initial={{
          title: 'Existing',
          description: '  notes  ',
          priority: 'medium',
          due_date: null,
          completed: false,
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Existing',
      description: 'notes',
      priority: 'medium',
      due_date: null,
      completed: false,
    })
  })

  it.each([
    ['an invalid due date', { due_date: '2026-02-30' }, 'Enter a valid date.'],
    [
      'an over-long description',
      { description: 'a'.repeat(2001) },
      'The description must be at most 2000 characters.',
    ],
  ])('shows the error and blocks submit for %s', async (_, patch, message) => {
    const onSubmit = vi.fn()
    const user = userEvent.setup()
    render(
      <TodoForm
        initial={{
          title: 'Existing',
          description: '',
          priority: 'medium',
          due_date: null,
          completed: false,
          ...patch,
        }}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(screen.getByText(message)).toBeVisible()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('submits trimmed values and the selected priority', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(
      <TodoForm
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        busy={false}
        error={null}
      />,
    )
    await user.type(screen.getByLabelText(/Task title/), '  Prepare a demo  ')
    await user.selectOptions(screen.getByLabelText('Priority'), 'high')
    await user.click(screen.getByRole('button', { name: 'Save task' }))
    expect(onSubmit).toHaveBeenCalledWith({
      title: 'Prepare a demo',
      description: '',
      priority: 'high',
      due_date: null,
      completed: false,
    })
  })
})
