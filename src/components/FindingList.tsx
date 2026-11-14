import { severityLabel, type Severity } from '../lib/rules'

export interface FindingListItem {
  key: string
  label: string
  severity: Severity
  note: string
  fix: string
  excerpt: string
  count: number
  countLabel?: string
  more?: string
}

export function FindingList({ items }: { items: FindingListItem[] }) {
  return (
    <ul className="findings">
      {items.map((item) => {
        const unit = item.countLabel ?? (item.count === 1 ? 'hit' : 'hits')
        return (
          <li className="finding" key={item.key}>
            <div className="finding__head">
              <span className={`tag tag--${item.severity}`}>
                {severityLabel[item.severity]}
              </span>
              <h4 className="finding__title">{item.label}</h4>
              <span className="finding__count">
                {item.count} {unit}
              </span>
            </div>
            <p className="finding__excerpt">{item.excerpt}</p>
            {item.more ? <p className="finding__more">{item.more}</p> : null}
            <p className="finding__note">{item.note}</p>
            <p className="finding__fix">
              <span className="finding__fix-label">Fix</span>
              {item.fix}
            </p>
          </li>
        )
      })}
    </ul>
  )
}
