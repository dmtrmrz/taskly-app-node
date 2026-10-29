import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { todoFixture } from '../../../test/todoFixture'
import { formatDate, isOverdue, selectTodos, validateTodo } from './todos'
import type { Todo } from '../types'

const validInput = {
  title: 'Plan',
  description: '',
  priority: 'medium' as const,
  due_date: null,
  completed: false,
}

describe('validateTodo', () => {
  it('accepts a valid task', () => {
    expect(validateTodo(validInput)).toEqual({})
  })

  it('rejects an empty title', () => {
    expect(validateTodo({ ...validInput, title: '   ' })).toEqual({
      title: 'Enter a task title.',
    })
  })

  it.each([
    [120, {}],
    [121, { title: 'The title must be at most 120 characters.' }],
  ])('checks a title of %i characters', (length, expected) => {
    expect(validateTodo({ ...validInput, title: 'a'.repeat(length) })).toEqual(
      expected,
    )
  })

  it.each([
    [2000, {}],
    [2001, { description: 'The description must be at most 2000 characters.' }],
  ])('checks a description of %i characters', (length, expected) => {
    expect(
      validateTodo({ ...validInput, description: 'a'.repeat(length) }),
    ).toEqual(expected)
  })

  it.each(['2026-02-30', '2026-2-3', 'tomorrow'])(
    'rejects the invalid due date %s',
    (due_date) => {
      expect(validateTodo({ ...validInput, due_date })).toEqual({
        due_date: 'Enter a valid date.',
      })
    },
  )

  it('accepts a valid leap day', () => {
    expect(validateTodo({ ...validInput, due_date: '2028-02-29' })).toEqual({})
  })
})

describe('selectTodos', () => {
  it('keeps only completed tasks for the completed filter', () => {
    const done = { ...todoFixture, id: 2, completed: true }
    expect(selectTodos([todoFixture, done], 'completed', '', 'newest')).toEqual(
      [done],
    )
  })

  it('sorts by due date with tasks without a date last', () => {
    const none = { ...todoFixture, id: 1 }
    const late = { ...todoFixture, id: 2, due_date: '2026-12-01' }
    const soon = { ...todoFixture, id: 3, due_date: '2026-11-01' }
    expect(selectTodos([none, late, soon], 'all', '', 'due')).toEqual([
      soon,
      late,
      none,
    ])
  })

  it('sorts newest first', () => {
    const older = {
      ...todoFixture,
      id: 1,
      created_at: '2026-09-01T12:00:00Z',
    }
    const newer = {
      ...todoFixture,
      id: 2,
      created_at: '2026-10-05T12:00:00Z',
    }
    expect(selectTodos([older, newer], 'all', '', 'newest')).toEqual([
      newer,
      older,
    ])
  })

  it.each(['priority', 'due', 'newest'] as const)(
    'puts the higher id first when the %s sort keys are equal',
    (sort) => {
      const lower = { ...todoFixture, id: 1, due_date: '2026-11-01' }
      const higher = { ...todoFixture, id: 2, due_date: '2026-11-01' }
      expect(selectTodos([lower, higher], 'all', '', sort)).toEqual([
        higher,
        lower,
      ])
    },
  )

  it('returns an empty list when the search matches nothing', () => {
    expect(selectTodos([todoFixture], 'all', 'zzz', 'newest')).toEqual([])
  })

  it('combines status with a case-insensitive search in the description', () => {
    const matching = { ...todoFixture, description: 'Discuss the API' }
    const todos = [
      matching,
      { ...matching, id: 2, completed: true },
      { ...todoFixture, id: 3 },
    ]
    expect(selectTodos(todos, 'active', ' api ', 'newest')).toEqual([matching])
  })

  it('sorts by priority without changing the source array', () => {
    const high: Todo = { ...todoFixture, id: 2, priority: 'high' }
    const todos = [todoFixture, high]
    expect(selectTodos(todos, 'all', '', 'priority')).toEqual([
      high,
      todoFixture,
    ])
    expect(todos).toEqual([todoFixture, high])
  })
})

describe('isOverdue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0, 0))
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it.each([
    ['a past date', '2026-10-14', false, true],
    ['today', '2026-10-15', false, false],
    ['a future date', '2026-10-16', false, false],
    ['a past date when completed', '2026-10-14', true, false],
    ['no date', null, false, false],
  ])('for %s', (_, due_date, completed, expected) => {
    expect(isOverdue({ ...todoFixture, due_date, completed })).toBe(expected)
  })
})

describe('formatDate', () => {
  it('formats an ISO date as day, short month and year', () => {
    expect(formatDate('2026-10-05')).toBe('5 Oct 2026')
  })
})
