import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

import { CreateOrganizationDto } from './dto/create-organization.dto';
import { OrganizationResponseDto } from './dto/organization-response.dto';
import { OrganizationsService } from './organizations.service';

/**
 * Organisations HTTP surface. All routes are authenticated (deny-by-default).
 * Creating is a non-scoped capability (any authenticated user); reads are scoped
 * to the caller's memberships — a non-member gets 404, not 403 (anti-enumeration).
 */
@ApiTags('organizations')
@ApiCookieAuth('schedulepoint.session_token')
@Controller({ path: 'organizations', version: '1' })
export class OrganizationsController {
  constructor(private readonly service: OrganizationsService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an organisation (the creator becomes its Org Admin).' })
  @ApiCreatedResponse({ type: OrganizationResponseDto })
  async create(
    @CurrentUser() principal: Principal,
    @Body() dto: CreateOrganizationDto,
  ): Promise<OrganizationResponseDto> {
    const { organization, role } = await this.service.create(principal, dto);
    return OrganizationResponseDto.from(organization, role);
  }

  @Get()
  @ApiOperation({ summary: "List the caller's organisations." })
  @ApiOkResponse({ type: OrganizationResponseDto, isArray: true })
  async list(@CurrentUser() principal: Principal): Promise<OrganizationResponseDto[]> {
    const scoped = await this.service.list(principal);
    return scoped.map(({ organization, role }) => OrganizationResponseDto.from(organization, role));
  }

  @Get(':orgSlug')
  @ApiOperation({ summary: "Get one of the caller's organisations by slug." })
  @ApiOkResponse({ type: OrganizationResponseDto })
  @ApiNotFoundResponse({ description: 'No such organisation, or the caller is not a member.' })
  async getBySlug(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') slug: string,
  ): Promise<OrganizationResponseDto> {
    const { organization, role } = await this.service.resolveScope(principal, slug);
    return OrganizationResponseDto.from(organization, role);
  }
}
