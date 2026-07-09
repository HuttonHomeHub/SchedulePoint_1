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
 * - `GET /health`        — liveness: the process is up.
 * - `GET /health/ready`  — readiness: critical dependencies (DB) are reachable.
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
