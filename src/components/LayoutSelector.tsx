import type { LayoutCount } from '@/types/layout'

const LAYOUTS: LayoutCount[] = [1, 2, 3, 4]

interface Props {
  value: LayoutCount
  onChange: (count: LayoutCount) => void
}

export function LayoutSelector({ value, onChange }: Props) {
  return (
    <div className="layout-selector" role="group" aria-label="Layout">
      {LAYOUTS.map((n) => (
        <button
          key={n}
          type="button"
          className={`layout-btn${n === value ? ' active' : ''}`}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
    </div>
  )
}
