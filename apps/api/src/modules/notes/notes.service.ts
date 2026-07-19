import { Injectable } from '@nestjs/common';
import type { Note } from '@prisma/client';
import type { ActivityNoteCount, PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';
import { ActivityRepository } from '../activities/activity.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanRepository } from '../plans/plan.repository';

import type { CreateNoteDto } from './dto/create-note.dto';
import type { UpdateNoteDto } from './dto/update-note.dto';
import { NoteRepository } from './note.repository';

/** A note plus its resolved author display name (or null) — the shape the DTO maps from. */
export interface NoteWithAuthor {
  note: Note;
  authorName: string | null;
}

/**
 * Business logic for notes (ADR-0046) — attributed, time-ordered threads on plans and activities.
 * Every operation resolves the org from the caller's memberships (anti-IDOR) and checks a `note:*`
 * permission. Create/list scope to a parent (plan or activity) loaded active-and-in-org first (a
 * foreign/other-org/deleted parent is an indistinguishable 404); the `organization_id`, `entity_type`,
 * `plan_id` and `activity_id` are DERIVED from that resolved parent, never from client input. Update
 * and delete additionally enforce **author-ownership** — only the note's author (`created_by ===
 * principal.userId`) may edit or delete it (a row-level check the RBAC permission cannot express);
 * anyone else is 403. The body is trimmed-then-validated (whitespace-only ⇒ 422) and edits are
 * optimistic-locked (stale `version` ⇒ 409). Notes are **non-structural**: writes are deliberately
 * NOT pen-gated — there is no `assertHoldsPen` anywhere here (the `activity:update_progress` precedent,
 * ADR-0028/0046).
 */
@Injectable()
export class NotesService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly plans: PlanRepository,
    private readonly activities: ActivityRepository,
    private readonly notes: NoteRepository,
    private readonly prisma: PrismaService,
    @InjectPinoLogger(NotesService.name) private readonly logger: PinoLogger,
  ) {}

  async listByPlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: NoteWithAuthor[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'note:read', organization.id);
    await this.loadActivePlan(planId, organization.id);

    const rows = await this.notes.listByPlan({
      organizationId: organization.id,
      planId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    return this.paginate(rows, query.limit);
  }

  async listByActivity(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: NoteWithAuthor[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'note:read', organization.id);
    await this.loadActiveActivity(activityId, organization.id);

    const rows = await this.notes.listByActivity({
      organizationId: organization.id,
      activityId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });
    return this.paginate(rows, query.limit);
  }

  /** Per-activity active-note counts for a plan — the badge read, one grouped query (no N+1). */
  async countByActivityForPlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
  ): Promise<ActivityNoteCount[]> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'note:read', organization.id);
    await this.loadActivePlan(planId, organization.id);

    return this.notes.countActiveByActivityForPlan(organization.id, planId);
  }

  /** Create a PLAN note — scope derived from the resolved parent plan. */
  async createForPlan(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: CreateNoteDto,
  ): Promise<NoteWithAuthor> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'note:create', organization.id);
    const plan = await this.loadActivePlan(planId, organization.id);
    const body = this.assertBody(dto.body);

    const note = await this.notes.create({
      organizationId: organization.id,
      entityType: 'PLAN',
      // Derived from the resolved parent — never client input.
      planId: plan.id,
      activityId: null,
      body,
      createdBy: principal.userId,
      updatedBy: principal.userId,
    });
    this.logger.info(
      { noteId: note.id, entityType: 'PLAN', planId: plan.id, userId: principal.userId },
      'note created',
    );
    return this.withAuthor(note);
  }

  /** Create an ACTIVITY note — plan id is COPIED from the activity's plan (the denormalised key). */
  async createForActivity(
    principal: Principal,
    orgSlug: string,
    activityId: string,
    dto: CreateNoteDto,
  ): Promise<NoteWithAuthor> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'note:create', organization.id);
    const activity = await this.loadActiveActivity(activityId, organization.id);
    const body = this.assertBody(dto.body);

    const note = await this.notes.create({
      organizationId: organization.id,
      entityType: 'ACTIVITY',
      // An activity note carries its activity's plan id (the denormalised cascade key) and the
      // activity id — both derived from the resolved parent, never client input.
      planId: activity.planId,
      activityId: activity.id,
      body,
      createdBy: principal.userId,
      updatedBy: principal.userId,
    });
    this.logger.info(
      {
        noteId: note.id,
        entityType: 'ACTIVITY',
        planId: activity.planId,
        activityId: activity.id,
        userId: principal.userId,
      },
      'note created',
    );
    return this.withAuthor(note);
  }

  /** Edit a note's body — author-only, optimistic-locked. NOT pen-gated. */
  async update(
    principal: Principal,
    orgSlug: string,
    noteId: string,
    dto: UpdateNoteDto,
  ): Promise<NoteWithAuthor> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'note:update', organization.id);

    const existing = await this.loadActiveNote(noteId, organization.id);
    this.assertAuthor(principal, existing);
    const body = this.assertBody(dto.body);

    const changed = await this.notes.updateIfVersionMatches(
      noteId,
      dto.version,
      { body },
      principal.userId,
    );
    if (changed === 0) {
      this.logger.warn(
        { noteId, expectedVersion: dto.version, userId: principal.userId },
        'optimistic-lock conflict on note update',
      );
      throw new ConflictError('This note was changed elsewhere. Refresh and try again.');
    }

    const updated = await this.loadActiveNote(noteId, organization.id);
    this.logger.info({ noteId, userId: principal.userId }, 'note updated');
    return this.withAuthor(updated);
  }

  /** Soft-delete a note — author-only. NOT pen-gated. */
  async remove(principal: Principal, orgSlug: string, noteId: string): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'note:delete', organization.id);

    const existing = await this.loadActiveNote(noteId, organization.id);
    this.assertAuthor(principal, existing);

    await this.prisma.$transaction((tx) => this.notes.softDelete(noteId, principal.userId, tx));
    this.logger.info({ noteId, userId: principal.userId }, 'note deleted');
  }

  /** Load a plan active and in the caller's org, or 404. */
  private async loadActivePlan(planId: string, organizationId: string) {
    const plan = await this.plans.findActiveByIdInOrg(planId, organizationId);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  /** Load an activity active and in the caller's org, or 404. */
  private async loadActiveActivity(activityId: string, organizationId: string) {
    const activity = await this.activities.findActiveByIdInOrg(activityId, organizationId);
    if (!activity) throw new NotFoundError('Activity not found.');
    return activity;
  }

  /** Load a note active and in the caller's org, or 404 (anti-IDOR). */
  private async loadActiveNote(noteId: string, organizationId: string): Promise<Note> {
    const note = await this.notes.findActiveByIdInOrg(noteId, organizationId);
    if (!note) throw new NotFoundError('Note not found.');
    return note;
  }

  /**
   * Author-ownership: only the note's author may edit/delete it. The `note:update`/`note:delete`
   * permission gates the *capability*; this is the row-level check RBAC cannot express (ADR-0046).
   * Org-Admin moderation of others' notes is out of v1.
   */
  private assertAuthor(principal: Principal, note: Note): void {
    if (note.createdBy !== principal.userId) {
      this.logger.warn(
        { noteId: note.id, authorId: note.createdBy, userId: principal.userId },
        'author-ownership check failed',
      );
      throw new ForbiddenError('Only the author can edit or delete this note.');
    }
  }

  /**
   * Trim-then-validate the body. The DTO already trims + bounds it, but a service-side guard is the
   * defence-in-depth the DB CHECK cannot provide (it bounds length but cannot trim): a whitespace-only
   * body collapses to `''` → 422.
   */
  private assertBody(body: string): string {
    const trimmed = body.trim();
    if (trimmed.length === 0) {
      throw new ValidationError('A note body cannot be empty.');
    }
    return trimmed;
  }

  private async withAuthor(note: Note): Promise<NoteWithAuthor> {
    const names = await this.notes.findAuthorNames(note.createdBy ? [note.createdBy] : []);
    return { note, authorName: note.createdBy ? (names.get(note.createdBy) ?? null) : null };
  }

  private async paginate(
    rows: Note[],
    limit: number,
  ): Promise<{ items: NoteWithAuthor[]; meta: PageMeta }> {
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    // Resolve every author in the page in ONE batched user lookup (no N+1).
    const names = await this.notes.findAuthorNames(
      page.map((n) => n.createdBy).filter((id): id is string => Boolean(id)),
    );
    const items = page.map((note) => ({
      note,
      authorName: note.createdBy ? (names.get(note.createdBy) ?? null) : null,
    }));
    return { items, meta: { nextCursor, hasMore } };
  }

  private assertCan(principal: Principal, permission: Permission, organizationId: string): void {
    if (!principal.can(permission, organizationId)) {
      this.logger.warn(
        { userId: principal.userId, permission, organizationId },
        'authorisation denied',
      );
      throw new ForbiddenError('You do not have permission to perform this action.');
    }
  }
}
