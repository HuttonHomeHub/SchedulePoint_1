import { Injectable } from '@nestjs/common';
import type { Plan, Prisma } from '@prisma/client';
import { STANDARD_CALENDAR_NAME, SWIMLANE_LIMIT, type PageMeta } from '@repo/types';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

import type { Permission, Principal } from '../../common/auth/principal';
import { lockActiveProjectChainForShare } from '../../common/db/hierarchy-row-lock';
import { acquirePlanWriteLock } from '../../common/db/plan-advisory-lock';
import type { RequestContext } from '../../common/decorators/request-context.decorator';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { HierarchyLifecycleService } from '../../common/hierarchy/hierarchy-lifecycle.service';
import { markScheduleInputsChanged } from '../../common/schedule-inputs/mark-schedule-inputs-changed';
import {
  PLAN_FIELD_CLASS,
  changedInputs,
} from '../../common/schedule-inputs/schedule-input-fields';
import { parseCalendarDate } from '../../common/validation/calendar-date';
import { BATCH_TRANSACTION_TIMEOUT_MS, PrismaService } from '../../prisma/prisma.service';
import { auditActor } from '../audit/audit-actor';
import { AuditService } from '../audit/audit.service';
import { hierarchyAuditEvent } from '../audit/hierarchy-audit';
import { assertCalendarUsableBy } from '../calendars/calendar-scope.guard';
import { CalendarRepository } from '../calendars/calendar.repository';
import { CodeTypeRepository } from '../codes/code-type.repository';
import { OrganizationsService } from '../organizations/organizations.service';
import { PlanEditLockService } from '../plan-lock/plan-lock.service';
import { ProjectRepository } from '../projects/project.repository';

import type { CreatePlanDto } from './dto/create-plan.dto';
import type { UpdatePlanDto } from './dto/update-plan.dto';
import { diffGovernanceFields } from './plan-governance-fields';
import { isPlanNameConflict, planNameTakenError } from './plan-name-conflict';
import { PlanRepository, type PlanPatch } from './plan.repository';

/**
 * Business logic for plans — the leaf level of the Client → Project → Plan
 * hierarchy and the future host of activities and the TSLD. Create and list are
 * scoped to a parent project (loaded active and in-org first, 404 otherwise);
 * the organisation id is copied from that parent, never from input. Item
 * operations re-resolve the org scope from the caller's own memberships
 * (anti-IDOR) paired with a permission check. A plan has no children, so delete
 * is a plain soft-delete; restore requires the parent project to be active.
 */
@Injectable()
export class PlansService {
  constructor(
    private readonly organizations: OrganizationsService,
    private readonly projects: ProjectRepository,
    private readonly plans: PlanRepository,
    private readonly calendars: CalendarRepository,
    private readonly lifecycle: HierarchyLifecycleService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly editLock: PlanEditLockService,
    private readonly codeTypes: CodeTypeRepository,
    @InjectPinoLogger(PlansService.name) private readonly logger: PinoLogger,
  ) {}

  async list(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    query: { limit: number; cursor?: string },
  ): Promise<{ items: Plan[]; meta: PageMeta }> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:read', organization.id);
    await this.loadActiveProject(projectId, organization.id);

    const rows = await this.plans.findManyActiveByProject({
      organizationId: organization.id,
      projectId,
      take: query.limit + 1,
      ...(query.cursor ? { cursor: query.cursor } : {}),
    });

    const hasMore = rows.length > query.limit;
    const items = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (items[items.length - 1]?.id ?? null) : null;
    return { items, meta: { nextCursor, hasMore } };
  }

  async get(principal: Principal, orgSlug: string, planId: string): Promise<Plan> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:read', organization.id);

    const plan = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!plan) throw new NotFoundError('Plan not found.');
    return plan;
  }

  async create(
    principal: Principal,
    orgSlug: string,
    projectId: string,
    dto: CreatePlanDto,
  ): Promise<Plan> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:create', organization.id);
    const project = await this.loadActiveProject(projectId, organization.id);

    // New plans default to the org's seeded Standard calendar (ADR-0024), looked up in the ORG
    // tier only: a bare by-name read could return another project's "Standard", which the
    // calendar-scope guard would then refuse. This read is an unlocked hint at the id; the
    // guard below re-reads it under the calendar lock. An archived Standard is not bound — an
    // archived calendar refuses every new binding (ADR-0053 §4) — and none at all falls back to
    // null (all-days-work).
    const standardHint = await this.calendars.findActiveHoldingNameInTier({
      organizationId: project.organizationId,
      name: STANDARD_CALENDAR_NAME,
      scope: 'ORG',
      projectId: null,
    });
    const standardHintId =
      standardHint && standardHint.archivedAt === null ? standardHint.id : null;

    try {
      // The read above is the 404 and the organisation check; the lock below is the guarantee. The
      // insert's own foreign-key check takes `FOR KEY SHARE`, which a delete's `FOR NO KEY UPDATE`
      // does not conflict with, so without this a plan can land in a project being deleted
      // (`docs/TECH_DEBT.md` #531). Ancestors top-down, the order every restore uses (ADR-0201 D3).
      const plan = await this.prisma.$transaction(async (tx) => {
        const active = await lockActiveProjectChainForShare(tx, {
          clientId: project.clientId,
          projectId: project.id,
        });
        if (!active) throw new NotFoundError('Project not found.');

        // The Standard binding is a `calendar_id` write seam, so it goes through the same guard as
        // every other (`docs/TECH_DEBT.md` #559): the calendar advisory lock the CALENDAR_IN_USE
        // delete takes, then a re-read as active. Lock order is the project chain FOR SHARE first,
        // THEN the calendar advisory lock — deliberately NOT restore/import's order (advisory
        // first). Advisory-first would let a plan create hold the calendar lock while it waits on a
        // project share that a project delete blocks, and that can cycle with an activity create
        // (plan lock, then calendar). It relies on a new FOR SHARE proceeding past a queued
        // FOR NO KEY UPDATE waiter in Postgres; that was reasoned from the lock-conflict table,
        // not measured. Only NotFoundError means "the Standard is gone": a ValidationError (wrong
        // scope) is a real defect and must surface.
        let standardId: string | null = null;
        if (standardHintId) {
          try {
            const standard = await assertCalendarUsableBy(tx, this.calendars, {
              calendarId: standardHintId,
              organizationId: project.organizationId,
              projectId: project.id,
              currentCalendarId: null,
            });
            standardId = standard.id;
          } catch (error) {
            if (!(error instanceof NotFoundError)) throw error;
          }
        }
        return this.plans.create(
          {
            // Copy the organisation id from the parent project, never from input.
            organizationId: project.organizationId,
            projectId: project.id,
            name: dto.name,
            description: dto.description ?? null,
            ...(dto.status ? { status: dto.status } : {}),
            // Required (ADR-0033 M1): the DTO guarantees a valid calendar date.
            plannedStart: parseCalendarDate(dto.plannedStart),
            ...(standardId ? { calendarId: standardId } : {}),
            createdBy: principal.userId,
            updatedBy: principal.userId,
          },
          tx,
        );
      });
      this.logger.info(
        {
          organizationId: organization.id,
          projectId: project.id,
          planId: plan.id,
          userId: principal.userId,
        },
        'plan created',
      );
      return plan;
    } catch (error) {
      if (isPlanNameConflict(error)) throw planNameTakenError();
      throw error;
    }
  }

  async update(
    principal: Principal,
    orgSlug: string,
    planId: string,
    dto: UpdatePlanDto,
    context?: RequestContext,
  ): Promise<Plan> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:update', organization.id);

    // Loaded (not merely existence-checked) because the calendar-scope guard below needs the
    // plan's own `projectId` — no extra query, the same single round-trip as before.
    const existing = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!existing) throw new NotFoundError('Plan not found.');

    const patch: PlanPatch = {};
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.status !== undefined) patch.status = dto.status;
    if (dto.progressRecalcMode !== undefined) patch.progressRecalcMode = dto.progressRecalcMode;
    if (dto.useExpectedFinishDates !== undefined) {
      patch.useExpectedFinishDates = dto.useExpectedFinishDates;
    }
    if (dto.criticalPathDefinition !== undefined) {
      patch.criticalPathDefinition = dto.criticalPathDefinition;
    }
    if (dto.criticalFloatThresholdMinutes !== undefined) {
      patch.criticalFloatThresholdMinutes = dto.criticalFloatThresholdMinutes;
    }
    if (dto.totalFloatMode !== undefined) patch.totalFloatMode = dto.totalFloatMode;
    if (dto.makeOpenEndsCritical !== undefined) {
      patch.makeOpenEndsCritical = dto.makeOpenEndsCritical;
    }
    // Resource-levelling plan options (ADR-0041 §7/§4): client-settable; dark until L2 wires the pass.
    if (dto.levelResources !== undefined) patch.levelResources = dto.levelResources;
    if (dto.levelWithinFloatOnly !== undefined) {
      patch.levelWithinFloatOnly = dto.levelWithinFloatOnly;
    }
    // Ignore external / inter-project relationships (ADR-0043 / ADR-0035 §30.4): client-settable
    // scheduling option; the recalc drops external bounds when on. Default false is byte-parity.
    if (dto.ignoreExternalRelationships !== undefined) {
      patch.ignoreExternalRelationships = dto.ignoreExternalRelationships;
    }
    // Earned-Value plan options (EV1, ADR-0042): client-settable passthrough; currencyCode null clears
    // to inherit the org default. Dark until the EV read (EV2b); nothing computes EV yet.
    if (dto.eacMethod !== undefined) patch.eacMethod = dto.eacMethod;
    if (dto.currencyCode !== undefined) patch.currencyCode = dto.currencyCode;
    // Swimlane source, level and code type (swimlanes spec §4.6; m4-spec §4.5). Presentation, so
    // none of them is a governance field or a scheduling input. They are one fact, tied together by
    // the database's `ck_plans_swimlane_source_level` (WBS needs a level of 1 to 3, a code source
    // needs a type, anything else neither), so they are resolved as a triple and written together;
    // a refusal here is a 422 where the CHECK would be a 500. The resolution happens inside the
    // transaction, against the row re-read under the plan lock.
    const carriesSwimlane =
      dto.swimlaneSource !== undefined ||
      dto.swimlaneWbsLevel !== undefined ||
      dto.swimlaneCodeTypeId !== undefined;
    if (carriesSwimlane) {
      // Before the transaction and its plan lock on purpose (ADR-0028): the pen is a plain read, and a
      // writer without it must be refused without queueing behind the lock.
      // Choosing where the swimlanes come from re-draws the diagram for everyone looking at it, so it
      // is a structural write like the swimlane routes themselves (spec §2, Permissions): the pen. A
      // rename or a scheduling option on the same route is not, and stays ungated.
      await this.editLock.assertHoldsPen(principal, planId, organization.id);
    }
    // May be moved, never cleared (ADR-0033 M1): the DTO rejects an explicit null, so a
    // defined value is always a valid calendar date.
    if (dto.plannedStart !== undefined) {
      patch.plannedStart = parseCalendarDate(dto.plannedStart);
    }
    // A null clears the calendar (all-days-work); a specific id is validated + written
    // under a calendar-scoped advisory lock below.
    const calendarId = dto.calendarId;
    if (calendarId === null) patch.calendarId = null;

    try {
      await this.prisma.$transaction(async (tx) => {
        if (carriesSwimlane) {
          // First statement, so the switch is serialised with a code type's delete (which takes the
          // same lock and refuses to delete the source type) and with a recalculation or a codes
          // write. The foreign key alone does not: a soft delete changes no key column, so it holds
          // `FOR NO KEY UPDATE` on the type, which the key check's `FOR KEY SHARE` does not conflict
          // with (m4-database-review §2.9, measured). The calendar guard follows, keeping plan →
          // calendar. A switch that carries no swimlane field takes no lock.
          await acquirePlanWriteLock(tx, planId);
          const current = await this.plans.findActiveByIdInOrg(planId, organization.id, tx);
          if (!current) throw new NotFoundError('Plan not found.');
          await this.resolveSwimlaneTriple(tx, organization.id, current, dto, patch);
        }
        if (calendarId !== undefined && calendarId !== null) {
          // Assigning a specific calendar goes through THE shared scope guard (ADR-0053 §2):
          // it takes the same advisory lock the delete-in-use guard uses (so a plan can never
          // be assigned a calendar that is being deleted — no TOCTOU dangling reference) AND
          // enforces the tier — an ORG calendar anywhere in the org, a PROJECT calendar only
          // inside its own project (422 CALENDAR_WRONG_SCOPE). A foreign / deleted / unknown
          // id stays indistinguishable from missing (404), leaking nothing.
          const calendar = await assertCalendarUsableBy(tx, this.calendars, {
            calendarId,
            organizationId: organization.id,
            projectId: existing.projectId,
            // The plan's CURRENT calendar: re-submitting it is not a new binding, so a plan
            // already on an archived calendar stays editable (ADR-0053 §4).
            currentCalendarId: existing.calendarId,
          });
          patch.calendarId = calendar.id;
        }
        const changed = await this.plans.updateIfVersionMatches(
          planId,
          dto.version,
          patch,
          principal.userId,
          tx,
        );
        if (changed === 0) {
          throw new ConflictError('This plan was changed elsewhere. Refresh and try again.');
        }
        // Only the scheduling options and the data date count: a rename or a currency change
        // cannot move a date. `existing` is the row the version gate just proved current.
        if (changedInputs(PLAN_FIELD_CLASS, existing, patch)) {
          await markScheduleInputsChanged(tx, organization.id, [planId]);
        }

        /*
         * A governance change re-dates work that other people own (ADR-0073 family E, Test 2), so
         * it earns a row where an ordinary update does not.
         *
         * Diffed by VALUE against the row loaded above, and only over the governance set. The
         * settings dialog resends the whole form on every save, so keying on "was it in the DTO?"
         * would record fifteen changes each time a planner moved one — and a name-only PATCH would
         * record a governance change that did not happen. `diffGovernanceFields` returns null when
         * nothing moved, and this writes nothing at all rather than an empty row.
         *
         * Inside the same transaction as the write, so a lost optimistic-lock race (409) records
         * nothing: the row above already threw.
         */
        const moved = diffGovernanceFields({ ...existing }, { ...patch });
        if (moved) {
          await this.audit.record(
            {
              action: 'plan.settings_changed',
              outcome: 'SUCCESS',
              organizationId: organization.id,
              subjectType: 'PLAN',
              subjectId: planId,
              subjectLabel: patch.name ?? existing.name,
              before: moved.before,
              after: { ...moved.after, planName: patch.name ?? existing.name },
              ...auditActor(principal, context),
            },
            tx,
          );
        }
      });
    } catch (error) {
      if (isPlanNameConflict(error)) throw planNameTakenError();
      throw error;
    }

    const updated = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!updated) throw new NotFoundError('Plan not found.');
    return updated;
  }

  /**
   * Resolve the swimlane source, WBS level and code type of an update into one consistent triple on
   * `patch`, refusing in domain terms what the database's CHECK would refuse as a 500. Runs under the
   * plan lock, against the row re-read there.
   *
   * A level or type the request did not name is kept only while the source stays WBS or ACTIVITY_CODE
   * respectively; leaving either clears it, in the same write (database probe P4: clearing the source
   * without the type is refused 23514). A code source is then checked as a choice the planner can
   * live with: the type is live, of this plan and organisation, and 1 to 100 of its values are in use
   * on live, non-summary activities. Only a request that changes the type or the source is checked —
   * one that restates the stored pair (a planner re-saving, a level cleared that was already null)
   * must not be refused because the count has since drifted over 100, which the diagram absorbs.
   */
  private async resolveSwimlaneTriple(
    tx: Prisma.TransactionClient,
    organizationId: string,
    current: Plan,
    dto: UpdatePlanDto,
    patch: PlanPatch,
  ): Promise<void> {
    const source = dto.swimlaneSource ?? current.swimlaneSource;
    const level =
      dto.swimlaneWbsLevel !== undefined
        ? dto.swimlaneWbsLevel
        : source === 'WBS'
          ? current.swimlaneWbsLevel
          : null;
    const typeId =
      dto.swimlaneCodeTypeId !== undefined
        ? dto.swimlaneCodeTypeId
        : source === 'ACTIVITY_CODE'
          ? current.swimlaneCodeTypeId
          : null;
    if (source === 'WBS' ? level === null : level !== null) {
      throw new ValidationError(
        source === 'WBS'
          ? 'A WBS swimlane source needs a level of 1 to 3.'
          : 'A swimlane level applies only to a WBS swimlane source.',
        { reason: 'SWIMLANE_LEVEL_MISMATCH' },
      );
    }
    if (source === 'ACTIVITY_CODE' ? typeId === null : typeId !== null) {
      throw new ValidationError(
        source === 'ACTIVITY_CODE'
          ? 'A code swimlane source needs the code to make the swimlanes from.'
          : 'A swimlane code applies only to a code swimlane source.',
        { reason: 'SWIMLANE_CODE_TYPE_MISMATCH' },
      );
    }
    if (
      source === 'ACTIVITY_CODE' &&
      typeId !== null &&
      (current.swimlaneSource !== 'ACTIVITY_CODE' || current.swimlaneCodeTypeId !== typeId)
    ) {
      await this.assertCodeTypeEligible(tx, organizationId, current.id, typeId);
    }
    patch.swimlaneSource = source;
    patch.swimlaneWbsLevel = level;
    patch.swimlaneCodeTypeId = typeId;
  }

  /**
   * The code type must be live and of this plan and organisation (locked `FOR SHARE`, so its liveness
   * and the write see the same row), and 1 to {@link SWIMLANE_LIMIT} of its values must be in use.
   * Never the foreign key's 23503: another plan's or organisation's type reads as missing (404), and a
   * type of this plan that has been deleted is a 422 the planner can act on.
   */
  private async assertCodeTypeEligible(
    tx: Prisma.TransactionClient,
    organizationId: string,
    planId: string,
    typeId: string,
  ): Promise<void> {
    const [type] = await this.codeTypes.lockActiveForShare(organizationId, planId, [typeId], tx);
    if (!type) {
      const known = await this.codeTypes.findInPlan(typeId, planId, organizationId, tx);
      if (!known) throw new NotFoundError('That code no longer exists. Choose another.');
      throw new ValidationError('That code has been deleted. Choose another.', {
        reason: 'SWIMLANE_CODE_TYPE_MISMATCH',
      });
    }
    const valuesInUse = await this.codeTypes.countValuesInUse(organizationId, planId, typeId, tx);
    if (valuesInUse < 1 || valuesInUse > SWIMLANE_LIMIT) {
      throw new ValidationError(
        valuesInUse < 1
          ? `${type.name} has no values in use. Give some activities a value of ${type.name} first.`
          : `${type.name} has ${valuesInUse} values in use. Swimlanes can show up to ${SWIMLANE_LIMIT}.`,
        { reason: 'SWIMLANE_CODE_TYPE_INELIGIBLE', valuesInUse, limit: SWIMLANE_LIMIT },
      );
    }
  }

  async remove(
    principal: Principal,
    orgSlug: string,
    planId: string,
    context?: RequestContext,
  ): Promise<void> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:delete', organization.id);

    const existing = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!existing) throw new NotFoundError('Plan not found.');

    await this.prisma.$transaction(
      async (tx) => {
        const result = await this.lifecycle.cascadeSoftDelete(tx, 'plan', planId, principal.userId);
        // Inside the cascade's own transaction, and carrying its batch id: a reader seeing forty
        // rows vanish needs to know that was one action and not forty. A failed audit write rolls
        // the whole cascade back, which is the trade ADR-0072 chose deliberately.
        await this.audit.record(
          hierarchyAuditEvent({
            entity: 'plan',
            kind: 'deleted',
            organizationId: organization.id,
            id: planId,
            name: existing.name,
            status: existing.status,
            deleteBatchId: result.batchId,
            counts: result.counts,
            principal,
            context,
          }),
          tx,
        );
      },
      { timeout: BATCH_TRANSACTION_TIMEOUT_MS },
    );
    this.logger.info(
      { organizationId: organization.id, planId, userId: principal.userId },
      'plan deleted',
    );
  }

  async restore(
    principal: Principal,
    orgSlug: string,
    planId: string,
    context?: RequestContext,
  ): Promise<Plan> {
    const { organization } = await this.organizations.resolveScope(principal, orgSlug);
    this.assertCan(principal, 'plan:restore', organization.id);

    const existing = await this.plans.findByIdInOrg(planId, organization.id);
    if (!existing) throw new NotFoundError('Plan not found.');
    if (!existing.deletedAt) return existing; // already active — restore is a no-op

    // The lifecycle enforces the top-down invariant: restoring a plan whose
    // parent project is still soft-deleted raises PARENT_DELETED (→ 409).
    await this.prisma.$transaction(
      async (tx) => {
        const counts = await this.lifecycle.restoreBatch(tx, 'plan', planId, principal.userId);
        // `existing.deleteBatchId` is read before the transaction, and that is safe here in a way
        // it is NOT in MembersService.changeRole: `restoreBatch` re-reads the root inside the
        // transaction and throws unless it is still soft-deleted, so a stale read cannot survive
        // to be recorded — the audit row is never written for a restore that did not happen.
        await this.audit.record(
          hierarchyAuditEvent({
            entity: 'plan',
            kind: 'restored',
            organizationId: organization.id,
            id: planId,
            name: existing.name,
            status: existing.status,
            deleteBatchId: existing.deleteBatchId,
            counts,
            principal,
            context,
          }),
          tx,
        );
      },
      { timeout: BATCH_TRANSACTION_TIMEOUT_MS },
    );
    this.logger.info(
      { organizationId: organization.id, planId, userId: principal.userId },
      'plan restored',
    );

    const restored = await this.plans.findActiveByIdInOrg(planId, organization.id);
    if (!restored) throw new NotFoundError('Plan not found.');
    return restored;
  }

  /** Load the parent project active and in the caller's org, or 404. */
  private async loadActiveProject(projectId: string, organizationId: string) {
    const project = await this.projects.findActiveByIdInOrg(projectId, organizationId);
    if (!project) throw new NotFoundError('Project not found.');
    return project;
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
