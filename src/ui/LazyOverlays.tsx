import { Suspense, lazy, useState } from 'react'
import type { ComponentType, LazyExoticComponent } from 'react'
import { useChrome } from './chrome.ts'
import type { Overlay } from './chrome.ts'

/*
 * The windows that are not needed to draw the first screen are loaded the
 * first time they open, so the page that opens the app is smaller. Once
 * loaded, a window stays mounted: it opens and closes like the others,
 * through `useModal`.
 */

function deferred<Name extends string>(
  load: () => Promise<Record<Name, ComponentType>>,
  name: Name,
): LazyExoticComponent<ComponentType> {
  return lazy(() => load().then((module) => ({ default: module[name] })))
}

const WINDOWS: readonly (readonly [Overlay, LazyExoticComponent<ComponentType>])[] = [
  ['home', deferred(() => import('./HomeScreen.tsx'), 'HomeScreen')],
  ['versions', deferred(() => import('./VersionsDialog.tsx'), 'VersionsDialog')],
  ['shortcuts', deferred(() => import('./ShortcutsSheet.tsx'), 'ShortcutsSheet')],
  ['calculator', deferred(() => import('./BaseCalculator.tsx'), 'BaseCalculator')],
  ['history', deferred(() => import('./HistoryDialog.tsx'), 'HistoryDialog')],
  ['describe', deferred(() => import('./DescribeDialog.tsx'), 'DescribeDialog')],
  ['machine', deferred(() => import('./MachineEditor.tsx'), 'MachineEditor')],
  ['expression', deferred(() => import('./ExpressionDialog.tsx'), 'ExpressionDialog')],
  ['verilog', deferred(() => import('./VerilogDialog.tsx'), 'VerilogDialog')],
  ['parts', deferred(() => import('./PartPicker.tsx'), 'PartPicker')],
]

export function LazyOverlays() {
  const overlay = useChrome((state) => state.overlay)
  const [opened, setOpened] = useState<readonly Overlay[]>([])
  // Noted while drawing, so the window mounts in the same pass that opens it.
  if (overlay !== null && !opened.includes(overlay) && WINDOWS.some(([name]) => name === overlay)) {
    setOpened([...opened, overlay])
  }
  // A boundary for each, so one that is loading never hides another.
  return WINDOWS.filter(([name]) => opened.includes(name)).map(([name, Window]) => (
    <Suspense key={name} fallback={null}>
      <Window />
    </Suspense>
  ))
}
