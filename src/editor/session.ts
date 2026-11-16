import { SimBridge } from './simBridge.ts'
import { useEditor } from './store.ts'

/**
 * The simulator behind the drawing on screen. It follows every edit, so the
 * circuit exists in the engine at all times, as it does in CedarLogic.
 */
export const simBridge = new SimBridge()

simBridge.sync(useEditor.getState().doc)
useEditor.subscribe((state, previous) => {
  if (state.doc !== previous.doc) simBridge.sync(state.doc)
})
