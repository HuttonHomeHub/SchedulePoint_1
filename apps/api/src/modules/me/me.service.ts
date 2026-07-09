import { Injectable } from '@nestjs/common';

import type { Principal } from '../../common/auth/principal';
import { NotFoundError } from '../../common/errors/domain-errors';
import { PrismaService } from '../../prisma/prisma.service';

import { MeResponseDto } from './dto/me-response.dto';

/**
 * Reads the current user's profile and memberships. Thin by design: the
 * principal (identity + resolved memberships) is established by the auth seam;
 * this only loads the persisted profile fields the principal does not carry.
 */
@Injectable()
export class MeService {
  constructor(private readonly prisma: PrismaService) {}

  async getProfile(principal: Principal): Promise<MeResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: principal.userId } });
    if (!user) {
      // A valid session whose user row is gone (e.g. deleted account).
      throw new NotFoundError('User profile not found.');
    }
    return MeResponseDto.from(user, principal.memberships);
  }
}
