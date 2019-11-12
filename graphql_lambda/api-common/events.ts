
export enum EventType {
  ROOM_CREATED = 'ROOM_CREATED',
  ROOM_RENAMED = 'ROOM_RENAMED',
  ROOM_DELETED = 'ROOM_DELETED',
  SESSION_SCHEDULED = 'SESSION_SCHEDULED',
  ENTITY_INVITED = 'ENTITY_INVITED'
}
interface UnknownEvent {
  type: "UNKNOWN"
}

interface RoomCreatedEvent {
  type: EventType.ROOM_CREATED;
  name: string;
  description?: string;
}

interface RoomRenamedEvent {
  type: EventType.ROOM_RENAMED;
  name: string;
}

interface RoomDeletedEvent {
  type: EventType.ROOM_DELETED;
}

interface SessionScheduledEvent {
  type: EventType.SESSION_SCHEDULED,
  id: string,
  cron: string,
  stopAfter: string
}

interface EntityInvitedEvent {
  type: EventType.ENTITY_INVITED,
  invitees: Array<{type: string, id: string}>
}

export type Event =
  RoomCreatedEvent |
  RoomRenamedEvent |
  RoomDeletedEvent |
  SessionScheduledEvent |
  EntityInvitedEvent |
  UnknownEvent
