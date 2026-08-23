import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  HealthCheck,
  HealthCheckService,
  PrismaHealthIndicator,
  type HealthCheckResult,
} from '@nestjs/terminus';

import { Public } from '../common/decorators/public.decorator';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Liveness and readiness probes (see docs/OBSERVABILITY.md). Both are public.
 * - `GET /api/v1/health`        — liveness: the process is up.
 * - `GET /api/v1/health/ready`  — readiness: critical dependencies (DB) are reachable.
 *
 * The paths carry the `/api` global prefix and the URI version, because this controller opts out
 * of neither (`app-setup.ts` calls `setGlobalPrefix('api')` with no `exclude`, and versioning
 * defaults to `1`). This docblock said `/health` until 2026-08-23, and a probe against the booted
 * server returns **404** for that — so an orchestrator wired to it would mark the container
 * unhealthy forever.
 */
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  @Public()
  @HealthCheck()
  liveness(): Promise<HealthCheckResult> {
    return this.health.check([]);
  }

  @Get('ready')
  @Public()
  @HealthCheck()
  readiness(): Promise<HealthCheckResult> {
    return this.health.check([() => this.prismaHealth.pingCheck('database', this.prisma)]);
  }
}
