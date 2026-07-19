import { ApiProperty } from '@nestjs/swagger';
import type { Note } from '@prisma/client';
import type { NoteEntityType, NoteSummary } from '@repo/types';

/**
 * Public representation of a note (ADR-0046) — an attributed, timestamped free-text entry in an
 * entity's thread. `planId` is always present (an activity note carries its activity's plan id, the
 * denormalised cascade key); `activityId` is set iff `entityType` is `ACTIVITY`. `authorId` is the
 * opaque id of the user who wrote it (its owner — only the author may edit/delete); `authorName` is
 * that user's display name, resolved server-side from the user directory (or null if it can't be
 * resolved). `edited` is true once the body has been revised via the update endpoint — keyed on
 * `version > 1`, which (unlike `updatedAt > createdAt`) is immune to the cascade soft-delete/restore
 * stamp that bumps `updatedAt` without touching the body. Timestamps are ISO instants.
 */
export class NoteResponseDto implements NoteSummary {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ enum: ['PLAN', 'ACTIVITY'], description: 'Which entity the note is attached to.' })
  entityType!: NoteEntityType;

  @ApiProperty({
    format: 'uuid',
    description: 'The owning plan (a PLAN note or an activity note).',
  })
  planId!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'The owning activity — present iff `entityType` is `ACTIVITY`, else null.',
  })
  activityId!: string | null;

  @ApiProperty({ description: 'The note text (plain, 1–5000 chars; no markdown).' })
  body!: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'The opaque id of the author (its owner), or null if unattributed.',
  })
  authorId!: string | null;

  @ApiProperty({
    nullable: true,
    type: String,
    description: "The author's display name resolved server-side, or null if it can't be resolved.",
  })
  authorName!: string | null;

  @ApiProperty({ description: 'True once the body has been revised since it was first posted.' })
  edited!: boolean;

  @ApiProperty({ description: 'Optimistic-locking version.' })
  version!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;

  /**
   * Map a persisted {@link Note} to its public shape. `authorName` is resolved from a caller-supplied
   * id→name map (a single batched user lookup upstream — no N+1); an unresolved id yields null.
   */
  static from(note: Note, authorName: string | null = null): NoteResponseDto {
    return {
      id: note.id,
      entityType: note.entityType,
      planId: note.planId,
      activityId: note.activityId,
      body: note.body,
      authorId: note.createdBy,
      authorName,
      edited: note.version > 1,
      version: note.version,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }
}
