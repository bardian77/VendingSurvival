import { beforeEach, describe, expect, test } from 'vitest'
import { selectCurrentTick, useSimStore } from './useSimStore'
import { normalizeTick } from '../schema'

function tickAt(day: number, balance: number) {
  return normalizeTick({
    day,
    agents: [
      {
        id: 1,
        balance,
        profit: 0,
        computeCost: 0,
        consumptionCost: 0,
        tokensUsed: 0,
        isAlive: balance > 0,
        inventory: [],
        decisionText: '',
      },
    ],
  })
}

beforeEach(() => {
  useSimStore.setState({
    ticks: [],
    latestDay: -1,
    viewDay: 0,
    following: true,
    isPlaying: false,
    speed: 1,
    status: 'idle',
    statusDetail: '',
    source: null,
  })
})

describe('useSimStore', () => {
  test('ingest accumulates ticks and follows the live edge', () => {
    const { ingest } = useSimStore.getState()
    ingest(tickAt(0, 500))
    ingest(tickAt(1, 480))
    const state = useSimStore.getState()
    expect(state.latestDay).toBe(1)
    expect(state.viewDay).toBe(1)
    expect(selectCurrentTick(state)!.agents[0].balance).toBe(480)
  })

  test('scrubbing back freezes the view while the sim advances', () => {
    const { ingest, scrubTo } = useSimStore.getState()
    ingest(tickAt(0, 500))
    ingest(tickAt(1, 480))
    ingest(tickAt(2, 470))

    scrubTo(0)
    expect(useSimStore.getState().viewDay).toBe(0)
    expect(useSimStore.getState().following).toBe(false)

    ingest(tickAt(3, 460))
    expect(useSimStore.getState().viewDay).toBe(0) // view stays put
    expect(useSimStore.getState().latestDay).toBe(3) // sim moves on
  })

  test('jumpToLive re-attaches the view to the latest day', () => {
    const { ingest, scrubTo, jumpToLive } = useSimStore.getState()
    ingest(tickAt(0, 500))
    ingest(tickAt(1, 480))
    scrubTo(0)
    jumpToLive()
    expect(useSimStore.getState().viewDay).toBe(1)
    expect(useSimStore.getState().following).toBe(true)
  })

  test('completing the run stops playback', () => {
    useSimStore.setState({ isPlaying: true })
    useSimStore.getState().setStatus('complete', 'done')
    expect(useSimStore.getState().isPlaying).toBe(false)
    expect(useSimStore.getState().status).toBe('complete')
  })

  test('setSpeed clamps to the supported range', () => {
    useSimStore.getState().setSpeed(999)
    expect(useSimStore.getState().speed).toBe(16)
    useSimStore.getState().setSpeed(0.01)
    expect(useSimStore.getState().speed).toBe(0.25)
  })
})
