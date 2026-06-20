/**
 * Lightweight UI-only state, kept separate from the data store: which agent is
 * hovered (cross-highlight across chart / grid / leaderboard) and which agent's
 * detail drawer is open.
 */
import { create } from 'zustand'

interface UiState {
  highlightId: number | null
  selectedId: number | null
  setHighlight: (id: number | null) => void
  setSelected: (id: number | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  highlightId: null,
  selectedId: null,
  setHighlight: (highlightId) => set({ highlightId }),
  setSelected: (selectedId) => set({ selectedId }),
}))
