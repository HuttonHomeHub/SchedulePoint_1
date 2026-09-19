import { ApiPropertyOptional } from '@nestjs/swagger';
import type { Client } from '@prisma/client';
import type { ClientDetail } from '@repo/types';

import { ClientResponseDto } from './client-response.dto';

/**
 * A client's detail read — `ClientResponseDto` plus the child counts.
 *
 * **A SEPARATE class rather than two optional fields on the list's DTO, and that is the decision.**
 * `ClientResponseDto` is returned by both `list()` and `get()`, so a count added there would appear
 * on the list route **without anyone choosing it** — the bad outcome would be the default. Measured
 * at 2,124 clients / 50,004 projects, Prisma's `_count` on a page emits a grouped subquery with no
 * client restriction: **14.509 ms against 0.034 ms**, `Seq Scan on projects` over the whole child
 * table, and `clients_organization_id_created_at_id_idx` gone from the plan — so the cost is
 * O(all projects in the installation) rather than O(page). `client.repository.ts` records an
 * escalation trigger at "the list's p95 passes ~20 ms"; that shape trips it on the day it ships.
 *
 * `page-composition/falsification.md` FC-9(b) asserts the list plan keeps that index, so the
 * regression is gated and not merely commented.
 *
 * A count is **absent rather than zero** when it could not be taken (see the service): `0` is a
 * claim that there are none (ADR-0126), and nothing on a screen can tell a fabricated zero from a
 * real one.
 */
export class ClientDetailResponseDto extends ClientResponseDto implements ClientDetail {
  @ApiPropertyOptional({
    description:
      'Active projects directly under this client. Absent when the count could not be taken — ' +
      'never zero, which would be a claim that there are none.',
  })
  projectCount?: number;

  static fromDetail(entity: Client, counts: { projectCount?: number }): ClientDetailResponseDto {
    return {
      ...ClientResponseDto.from(entity),
      // Spread rather than assigned key by key: an undefined count must be ABSENT from the body,
      // and `projectCount: undefined` serialises away but still widens the type to include it.
      ...(counts.projectCount === undefined ? {} : { projectCount: counts.projectCount }),
    };
  }
}
