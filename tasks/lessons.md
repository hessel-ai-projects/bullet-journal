# Lessons Learned — Bullet Journal

## Project-Specific Patterns

### Migration Approach
- Keep UI/UX identical — only change data layer
- Test each feature after migration before moving to next
- Nuclear delete pattern (task_uid) must be preserved

### Data Model
- task_uid = chain identity (never breaks)
- monthly_id = within-month sync only
- All entries in a chain share task_uid
- Delete WHERE task_uid = X kills entire chain
