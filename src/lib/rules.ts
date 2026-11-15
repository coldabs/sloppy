// Stage 4 split: the rules live in per-group modules under
// src/lib/rules/ (one file per rule group). This file is only a
// re-export barrel, so every existing import from './rules' —
// analyzer.ts, the tests, the site analyzer, the UI — keeps working
// unchanged. The rule order below is the original order: voice,
// claims, actions, format, structure, diversity, substance.
export * from './rules/common'
export * from './rules/voice'
export * from './rules/claims'
export * from './rules/actions'
export * from './rules/format'
export * from './rules/structure'
export * from './rules/diversity'
export * from './rules/substance'

import { actionsRules } from './rules/actions'
import { claimsRules } from './rules/claims'
import { diversityRules } from './rules/diversity'
import { formatRules } from './rules/format'
import { structureRules } from './rules/structure'
import { substanceRules } from './rules/substance'
import { voiceRules } from './rules/voice'
import type { GroupId, RuleDefinition } from './rules/common'

export const rules: RuleDefinition[] = [
  ...voiceRules,
  ...claimsRules,
  ...actionsRules,
  ...formatRules,
  ...structureRules,
  ...diversityRules,
  ...substanceRules,
]

export const rulesByGroup = (groupId: GroupId) =>
  rules.filter((rule) => rule.group === groupId)
