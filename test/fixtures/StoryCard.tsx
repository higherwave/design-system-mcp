import { ClickableTile, ProgressBar, Tag } from '@carbon/react'
import styles from './StoryCard.module.scss'

export type StoryCardProps = {
  title: string
  themeLabel: string
  priority: 'low' | 'medium' | 'high'
  status: 'todo' | 'in_progress' | 'in_review' | 'done'
  criteriaMet: number
  criteriaTotal: number
  selected: boolean
  onSelect: () => void
}

// Presentational only: data and handlers come from the container.
export function StoryCard(props: StoryCardProps) {
  const { title, themeLabel, priority, status, criteriaMet, criteriaTotal, selected, onSelect } = props
  return (
    <ClickableTile
      className={styles.card}
      data-status={status}
      data-selected={selected}
      onClick={onSelect}
    >
      <Tag size="sm" type={priority === 'high' ? 'red' : 'gray'}>
        {status === 'done' ? 'Done' : priority}
      </Tag>
      <p className={styles.title}>{title}</p>
      <p className={styles.theme}>{themeLabel}</p>
      {criteriaTotal > 0 && (
        <ProgressBar
          label="Criteria met"
          hideLabel
          size="small"
          value={criteriaMet}
          max={criteriaTotal}
          helperText={`${criteriaMet} of ${criteriaTotal} criteria met`}
        />
      )}
    </ClickableTile>
  )
}
