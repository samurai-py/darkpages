import type { ReactElement } from 'react'
import type { ScreenProps } from '../screen'

export function Arte(_props: ScreenProps): ReactElement {
  return (
    <div className="screen">
      <div className="empty">
        <span className="disp">Arte</span>
        Em construção.
      </div>
    </div>
  )
}
