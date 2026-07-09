import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import type { Principal } from '../../common/auth/principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Paginated } from '../../common/dto/paginated';
import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';
import { ParseUuidPipe } from '../../common/validation/uuid';

import { ClientsService } from './clients.service';
import { ClientResponseDto } from './dto/client-response.dto';
import { CreateClientDto } from './dto/create-client.dto';
import { UpdateClientDto } from './dto/update-client.dto';

/**
 * Clients HTTP surface, nested under the organisation scope. Every route
 * resolves the org from `:orgSlug` against the caller's memberships (404 for
 * non-members). Reading is open to any member; create/update/delete/restore are
 * Planner + Org Admin. Delete is a soft cascade; restore brings the batch back.
 */
@ApiTags('clients')
@ApiCookieAuth('schedulepoint.session_token')
@ApiUnauthorizedResponse({ description: 'No valid session.' })
@ApiNotFoundResponse({
  description: 'Organisation or client not found (or the caller is not a member).',
})
@ApiForbiddenResponse({ description: 'Insufficient role in this organisation.' })
@Controller({ path: 'organizations/:orgSlug/clients', version: '1' })
export class ClientsController {
  constructor(private readonly service: ClientsService) {}

  @Get()
  @ApiOperation({ summary: "List an organisation's clients (cursor-paginated)." })
  @ApiOkResponse({ type: ClientResponseDto, isArray: true })
  async list(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Query() query: PaginationQueryDto,
  ): Promise<Paginated<ClientResponseDto>> {
    const { items, meta } = await this.service.list(principal, orgSlug, query);
    return new Paginated(
      items.map((client) => ClientResponseDto.from(client)),
      meta,
    );
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a client (Planner or Org Admin).' })
  @ApiCreatedResponse({ type: ClientResponseDto })
  @ApiConflictResponse({ description: 'A client with this name already exists.' })
  async create(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Body() dto: CreateClientDto,
  ): Promise<ClientResponseDto> {
    return ClientResponseDto.from(await this.service.create(principal, orgSlug, dto));
  }

  @Get(':clientId')
  @ApiOperation({ summary: 'Get a client by id.' })
  @ApiOkResponse({ type: ClientResponseDto })
  async get(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('clientId', ParseUuidPipe) clientId: string,
  ): Promise<ClientResponseDto> {
    return ClientResponseDto.from(await this.service.get(principal, orgSlug, clientId));
  }

  @Patch(':clientId')
  @ApiOperation({ summary: 'Update a client (Planner or Org Admin; optimistic locking).' })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiConflictResponse({ description: 'Stale version, or a name collision.' })
  async update(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('clientId', ParseUuidPipe) clientId: string,
    @Body() dto: UpdateClientDto,
  ): Promise<ClientResponseDto> {
    return ClientResponseDto.from(await this.service.update(principal, orgSlug, clientId, dto));
  }

  @Delete(':clientId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a client and its projects/plans (soft cascade).' })
  @ApiNoContentResponse()
  async remove(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('clientId', ParseUuidPipe) clientId: string,
  ): Promise<void> {
    await this.service.remove(principal, orgSlug, clientId);
  }

  @Post(':clientId/restore')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Restore a soft-deleted client and everything deleted with it.' })
  @ApiOkResponse({ type: ClientResponseDto })
  @ApiConflictResponse({ description: 'A restored name would collide with an active client.' })
  async restore(
    @CurrentUser() principal: Principal,
    @Param('orgSlug') orgSlug: string,
    @Param('clientId', ParseUuidPipe) clientId: string,
  ): Promise<ClientResponseDto> {
    return ClientResponseDto.from(await this.service.restore(principal, orgSlug, clientId));
  }
}
