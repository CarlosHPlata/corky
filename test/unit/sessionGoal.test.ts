import { describe, it, expect } from 'vitest'
import { normalizeSessionGoal, hasContent, GOAL_MAX_LEN, NOTES_MAX_LEN } from '../../src/main/domain/sessionGoal'

describe('normalizeSessionGoal', () => {
  it('trims surrounding whitespace on goal and notes', () => {
    expect(normalizeSessionGoal({ goal: '  climb to gold  ', notes: '\n ward more \n' })).toEqual({
      goal: 'climb to gold',
      notes: 'ward more'
    })
  })

  it('treats whitespace-only fields as empty', () => {
    expect(normalizeSessionGoal({ goal: '   ', notes: '\n\t  ' })).toEqual({ goal: '', notes: '' })
  })

  it('caps the goal at 200 characters', () => {
    const long = 'a'.repeat(250)
    const out = normalizeSessionGoal({ goal: long, notes: '' })
    expect(out.goal).toHaveLength(GOAL_MAX_LEN)
    expect(GOAL_MAX_LEN).toBe(200)
  })

  it('caps the notes at 1000 characters', () => {
    const long = 'b'.repeat(1500)
    const out = normalizeSessionGoal({ goal: '', notes: long })
    expect(out.notes).toHaveLength(NOTES_MAX_LEN)
    expect(NOTES_MAX_LEN).toBe(1000)
  })

  it('trims before capping (outer whitespace does not consume the budget)', () => {
    const out = normalizeSessionGoal({ goal: '  ' + 'x'.repeat(200) + '  ', notes: '' })
    expect(out.goal).toHaveLength(200)
    expect(out.goal).toBe('x'.repeat(200))
  })

  it('preserves interior newlines in notes (line structure is a render concern)', () => {
    const out = normalizeSessionGoal({ goal: 'g', notes: 'line one\nline two' })
    expect(out.notes).toBe('line one\nline two')
  })

  it('leaves already-clean input unchanged', () => {
    const clean = { goal: 'win lane, close game', notes: 'group at 15' }
    expect(normalizeSessionGoal(clean)).toEqual(clean)
  })
})

describe('hasContent', () => {
  it('is false when both fields are blank or whitespace', () => {
    expect(hasContent({ goal: '', notes: '' })).toBe(false)
    expect(hasContent({ goal: '   ', notes: '\n' })).toBe(false)
  })

  it('is true when the goal has content', () => {
    expect(hasContent({ goal: 'climb', notes: '' })).toBe(true)
  })

  it('is true when only the notes have content', () => {
    expect(hasContent({ goal: '', notes: 'ward river' })).toBe(true)
  })
})
