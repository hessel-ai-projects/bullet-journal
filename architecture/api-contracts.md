# Bullet Journal — Jarvis API Contract Documentation

## Overview

The Jarvis Admin API provides programmatic access to the Bullet Journal system for external integrations (AI assistants, automation scripts, etc.).

**Base URL:** `https://<host>/api/jarvis`

**Authentication:** Bearer token in `Authorization` header
```
Authorization: Bearer <JARVIS_API_KEY>
```

**Content-Type:** All requests and responses use `application/json`

---

## Endpoints

### Entries

#### 1. List Entries

```http
GET /api/jarvis/entries?user_id=<uuid>&date=<YYYY-MM-DD>&log_type=<type>
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | UUID | Yes | Filter by user |
| `date` | Date | No | Filter by date (YYYY-MM-DD) |
| `log_type` | string | No | Filter by log type (`daily`, `monthly`, `future`, `collection`) |
| `type` | string | No | Filter by entry type (`task`, `event`, `note`) |
| `status` | string | No | Filter by status (`open`, `done`, `migrated`, `cancelled`) |
| `collection_id` | UUID | No | Filter by collection |

**Response (200 OK):**
```json
{
  "entries": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user-uuid",
      "type": "task",
      "content": "Review quarterly report",
      "status": "open",
      "log_type": "monthly",
      "collection_id": null,
      "date": "2024-01-01",
      "monthly_id": null,
      "task_uid": "task-uuid-123",
      "tags": [],
      "position": 0,
      "google_event_id": null,
      "source": "jarvis",
      "created_at": "2024-01-15T10:30:00Z",
      "updated_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

**Error Responses:**
- `401 Unauthorized` — Invalid or missing API key
- `400 Bad Request` — Missing required `user_id` parameter

---

#### 2. Create Entry

```http
POST /api/jarvis/entries
```

**Request Body:**
```json
{
  "user_id": "user-uuid",
  "type": "task",
  "content": "Review quarterly report",
  "log_type": "monthly",
  "date": "2024-01-01",
  "status": "open",
  "tags": ["work", "important"],
  "position": 0,
  "source": "jarvis"
}
```

**Required Fields:**
- `user_id` (UUID)
- `type` ("task" | "event" | "note")
- `content` (string)
- `log_type` ("daily" | "monthly" | "future" | "collection")
- `date` (string, YYYY-MM-DD)

**Optional Fields:**
- `status` (default: "open")
- `collection_id` (UUID, for collection entries)
- `monthly_id` (UUID, for daily entries with monthly parent)
- `task_uid` (UUID, will be auto-generated if not provided)
- `tags` (string[], default: [])
- `position` (number, default: 0)
- `source` (default: "jarvis")

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-uuid",
  "type": "task",
  "content": "Review quarterly report",
  "status": "open",
  "log_type": "monthly",
  "collection_id": null,
  "date": "2024-01-01",
  "monthly_id": null,
  "task_uid": "auto-generated-uuid",
  "tags": ["work", "important"],
  "position": 0,
  "google_event_id": null,
  "source": "jarvis",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Special Behaviors:**
- If `type='task'` and `log_type='daily'` and no `monthly_id` provided:
  - **D23 Auto-Creation**: Creates monthly parent automatically
  - Both entries share the same `task_uid`

---

#### 3. Get Single Entry

```http
GET /api/jarvis/entries/<id>
```

**Path Parameters:**
- `id` (UUID) — Entry ID

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-uuid",
  "type": "task",
  "content": "Review quarterly report",
  "status": "open",
  "log_type": "monthly",
  "collection_id": null,
  "date": "2024-01-01",
  "monthly_id": null,
  "task_uid": "task-uuid-123",
  "tags": [],
  "position": 0,
  "google_event_id": null,
  "source": "jarvis",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T10:30:00Z"
}
```

**Error Responses:**
- `404 Not Found` — Entry doesn't exist

---

#### 4. Update Entry

```http
PATCH /api/jarvis/entries/<id>
```

**Path Parameters:**
- `id` (UUID) — Entry ID

**Request Body (partial update):**
```json
{
  "content": "Updated content",
  "status": "done",
  "tags": ["work", "completed"]
}
```

**Updatable Fields:**
- `content`
- `status`
- `tags`
- `position`
- `date`

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "user_id": "user-uuid",
  "type": "task",
  "content": "Updated content",
  "status": "done",
  "log_type": "monthly",
  "collection_id": null,
  "date": "2024-01-01",
  "monthly_id": null,
  "task_uid": "task-uuid-123",
  "tags": ["work", "completed"],
  "position": 0,
  "google_event_id": null,
  "source": "jarvis",
  "created_at": "2024-01-15T10:30:00Z",
  "updated_at": "2024-01-15T11:00:00Z"
}
```

**Special Behaviors:**
- Content updates sync bidirectionally via `monthly_id` link
- Status updates sync to linked entries
- Migrated entries cannot be updated (returns 409 Conflict)

---

#### 5. Delete Entry

```http
DELETE /api/jarvis/entries/<id>
```

**Path Parameters:**
- `id` (UUID) — Entry ID

**Response (200 OK):**
```json
{
  "success": true,
  "deleted_count": 4,
  "task_uid": "task-uuid-123"
}
```

**Special Behaviors:**
- **Nuclear Delete**: Deletes ALL entries with the same `task_uid`
- This includes monthly parents, daily children, and migrated copies across all months

**Error Responses:**
- `404 Not Found` — Entry doesn't exist

---

### Collections

#### 6. List Collections

```http
GET /api/jarvis/collections?user_id=<uuid>&type=<type>
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `user_id` | UUID | Yes | Filter by user |
| `type` | string | No | Filter by type (`meetings`, `ideas`, `custom`) |

**Response (200 OK):**
```json
{
  "collections": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "user_id": "user-uuid",
      "name": "Meeting Notes",
      "type": "meetings",
      "icon": "📝",
      "template": null,
      "created_at": "2024-01-01T00:00:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "user_id": "user-uuid",
      "name": "Ideas",
      "type": "ideas",
      "icon": "💡",
      "template": null,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ]
}
```

---

#### 7. Create Collection

```http
POST /api/jarvis/collections
```

**Request Body:**
```json
{
  "user_id": "user-uuid",
  "name": "Project Ideas",
  "type": "custom",
  "icon": "🚀",
  "template": {}
}
```

**Required Fields:**
- `user_id` (UUID)
- `name` (string)

**Optional Fields:**
- `type` (default: "custom")
- `icon` (default: "📋")
- `template` (object, default: null)

**Response (201 Created):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440003",
  "user_id": "user-uuid",
  "name": "Project Ideas",
  "type": "custom",
  "icon": "🚀",
  "template": {},
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

#### 8. Get Single Collection

```http
GET /api/jarvis/collections/<id>
```

**Path Parameters:**
- `id` (UUID) — Collection ID

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "user_id": "user-uuid",
  "name": "Meeting Notes",
  "type": "meetings",
  "icon": "📝",
  "template": null,
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

#### 9. Update Collection

```http
PATCH /api/jarvis/collections/<id>
```

**Request Body (partial update):**
```json
{
  "name": "Updated Name",
  "icon": "✅"
}
```

**Response (200 OK):**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440001",
  "user_id": "user-uuid",
  "name": "Updated Name",
  "type": "meetings",
  "icon": "✅",
  "template": null,
  "created_at": "2024-01-01T00:00:00Z"
}
```

---

#### 10. Delete Collection

```http
DELETE /api/jarvis/collections/<id>
```

**Response (200 OK):**
```json
{
  "success": true
}
```

**Special Behaviors:**
- Cascades: Deletes all entries with `collection_id = <id>`
- Does NOT delete meeting_notes (they have separate lifecycle)

---

#### 11. List Collection Items (Entries)

```http
GET /api/jarvis/collections/<id>/items
```

**Path Parameters:**
- `id` (UUID) — Collection ID

**Query Parameters:**
- `type` — Filter by entry type
- `status` — Filter by status

**Response (200 OK):**
```json
{
  "collection": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Meeting Notes",
    "type": "meetings"
  },
  "entries": [
    {
      "id": "entry-uuid-1",
      "type": "note",
      "content": "Ideas from brainstorm session",
      "status": "open",
      "tags": ["ideas"],
      "created_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

---

#### 12. Create Collection Item

```http
POST /api/jarvis/collections/<id>/items
```

**Request Body:**
```json
{
  "user_id": "user-uuid",
  "type": "note",
  "content": "New idea from meeting",
  "tags": ["ideas"]
}
```

**Response (201 Created):**
```json
{
  "id": "entry-uuid-2",
  "user_id": "user-uuid",
  "type": "note",
  "content": "New idea from meeting",
  "status": "open",
  "log_type": "collection",
  "collection_id": "550e8400-e29b-41d4-a716-446655440001",
  "date": "2024-01-15",
  "tags": ["ideas"],
  "created_at": "2024-01-15T10:30:00Z"
}
```

---

### Migration

#### 13. Migrate Entry to Month

```http
POST /api/jarvis/migrate
```

**Request Body:**
```json
{
  "entry_id": "entry-uuid",
  "target_month": "2024-02-01"
}
```

**Required Fields:**
- `entry_id` (UUID) — Entry to migrate
- `target_month` (string, YYYY-MM-DD, day must be 01)

**Response (200 OK):**
```json
{
  "success": true,
  "original_entry": {
    "id": "entry-uuid",
    "status": "migrated"
  },
  "new_entry": {
    "id": "new-entry-uuid",
    "type": "task",
    "content": "Same content",
    "log_type": "monthly",
    "date": "2024-02-01",
    "status": "open",
    "task_uid": "same-task-uid"
  }
}
```

**Special Behaviors:**
- Original entry marked as `status: 'migrated'`
- New entry created in target month with SAME `task_uid`
- If original was a daily entry, its monthly parent is also migrated
- New entry is unlinked (no `monthly_id`) — fresh start in new month

---

## Data Types

### Entry

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Owner reference |
| `type` | enum | `task`, `event`, `note` |
| `content` | string | Entry text |
| `status` | enum | `open`, `done`, `migrated`, `cancelled` |
| `log_type` | enum | `daily`, `monthly`, `future`, `collection` |
| `collection_id` | UUID? | For collection entries |
| `date` | string (YYYY-MM-DD) | Entry date |
| `monthly_id` | UUID? | Links daily → monthly parent |
| `task_uid` | UUID | Chain identity (all copies share this) |
| `tags` | string[] | Array of tags |
| `position` | number | Display order |
| `google_event_id` | string? | Google Calendar sync |
| `source` | enum | `user`, `jarvis`, `calendar` |
| `created_at` | ISO8601 | Creation timestamp |
| `updated_at` | ISO8601 | Last update timestamp |

### Collection

| Field | Type | Description |
|-------|------|-------------|
| `id` | UUID | Primary key |
| `user_id` | UUID | Owner reference |
| `name` | string | Collection name |
| `type` | enum | `meetings`, `ideas`, `custom` |
| `icon` | string | Emoji icon |
| `template` | object? | Template schema |
| `created_at` | ISO8601 | Creation timestamp |

---

## Error Responses

All errors follow this format:

```json
{
  "error": "Error code",
  "message": "Human-readable description"
}
```

### Common Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | `BAD_REQUEST` | Missing required fields |
| 401 | `UNAUTHORIZED` | Invalid or missing API key |
| 403 | `FORBIDDEN` | User not in allowed_users whitelist |
| 404 | `NOT_FOUND` | Resource doesn't exist |
| 409 | `CONFLICT` | Invalid operation (e.g., editing migrated entry) |
| 422 | `VALIDATION_ERROR` | Invalid field values |
| 500 | `INTERNAL_ERROR` | Server error |

---

## Implementation Notes for Developer

### Authentication Middleware

```typescript
// middleware pattern for all Jarvis routes
export function verifyJarvisAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization');
  const apiKey = process.env.JARVIS_API_KEY;
  
  if (!apiKey) {
    console.error('JARVIS_API_KEY not configured');
    return false;
  }
  
  return authHeader === `Bearer ${apiKey}`;
}

// Usage in route handlers
export async function GET(request: Request) {
  if (!verifyJarvisAuth(request)) {
    return Response.json(
      { error: 'UNAUTHORIZED', message: 'Invalid API key' },
      { status: 401 }
    );
  }
  // ... handle request
}
```

### D23 Auto-Creation in API

```typescript
// POST /api/jarvis/entries
if (body.type === 'task' && body.log_type === 'daily' && !body.monthly_id) {
  const sharedUid = crypto.randomUUID();
  
  // Create monthly parent first
  const [monthlyEntry] = await db.insert(entries)
    .values({
      userId: body.user_id,
      type: 'task',
      content: body.content,
      logType: 'monthly',
      date: body.date,
      taskUid: sharedUid,
      source: 'jarvis'
    })
    .returning();
  
  // Create daily child with monthly_id
  const [dailyEntry] = await db.insert(entries)
    .values({
      ...body,
      monthlyId: monthlyEntry.id,
      taskUid: sharedUid
    })
    .returning();
  
  return Response.json(dailyEntry, { status: 201 });
}
```

### Nuclear Delete in API

```typescript
// DELETE /api/jarvis/entries/[id]
const [entry] = await db.select({ taskUid: entries.taskUid })
  .from(entries)
  .where(eq(entries.id, params.id));

if (!entry) {
  return Response.json(
    { error: 'NOT_FOUND', message: 'Entry not found' },
    { status: 404 }
  );
}

// Nuclear delete
const result = await db.delete(entries)
  .where(eq(entries.taskUid, entry.taskUid))
  .returning();

return Response.json({
  success: true,
  deleted_count: result.length,
  task_uid: entry.taskUid
});
```

### Query Parameter Handling

```typescript
// GET /api/jarvis/entries
const { searchParams } = new URL(request.url);
const userId = searchParams.get('user_id');
const date = searchParams.get('date');
const logType = searchParams.get('log_type');

if (!userId) {
  return Response.json(
    { error: 'BAD_REQUEST', message: 'user_id is required' },
    { status: 400 }
  );
}

let query = db.select().from(entries).where(eq(entries.userId, userId));

if (date) {
  query = query.where(eq(entries.date, date));
}

if (logType) {
  query = query.where(eq(entries.logType, logType));
}

const result = await query.orderBy(entries.position);
return Response.json({ entries: result });
```

---

## Backwards Compatibility

All existing Jarvis API integrations must continue to work after migration. The following must be preserved:

1. **Same URL structure** — All endpoints remain at `/api/jarvis/*`
2. **Same request format** — JSON bodies with identical field names
3. **Same response format** — Identical JSON structure
4. **Same authentication** — `Authorization: Bearer <key>` header
5. **Same behaviors**:
   - D23 auto-creation for daily tasks
   - Nuclear delete for all entries
   - Bidirectional sync (handled internally)

### Testing Checklist

- [ ] GET /api/jarvis/entries returns entries list
- [ ] POST /api/jarvis/entries creates entry
- [ ] POST /api/jarvis/entries with daily task auto-creates monthly parent
- [ ] GET /api/jarvis/entries/[id] returns single entry
- [ ] PATCH /api/jarvis/entries/[id] updates entry
- [ ] DELETE /api/jarvis/entries/[id] performs nuclear delete
- [ ] GET /api/jarvis/collections returns collections
- [ ] POST /api/jarvis/collections creates collection
- [ ] DELETE /api/jarvis/collections/[id] deletes collection
- [ ] POST /api/jarvis/migrate migrates entry to new month
- [ ] All endpoints require valid API key
- [ ] All endpoints respect user scoping
