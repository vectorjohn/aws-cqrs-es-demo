
export type RoomSchedule = {
  id: string
  cron: string
  stopAfter: string
}

export type Invitee = {
  type: string
  id: string
}

export type RoomDTO = {
  id: string
  version: number
  name?: string
  nr_id?: string
  description?: string
  deleted: boolean
  invitees: Invitee[]
  schedules: RoomSchedule[]
}
