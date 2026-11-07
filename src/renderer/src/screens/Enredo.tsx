import type { ReactElement } from 'react'
import type { ScreenProps } from '../screen'

export function Enredo(_props: ScreenProps): ReactElement {
  return (
    <div className="screen">
      <div className="empty">
        <span className="disp">Enredo</span>
        Em construção.
      </div>
    </div>
  )
}
