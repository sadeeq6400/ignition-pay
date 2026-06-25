import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Req,
  Query,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { Request } from 'express';
import { CampaignsService } from './campaigns.service';
import { UpdateCampaignDto } from './dto/update-campaign.dto';
import { CreateCampaignDto } from './dto/create-campaign.dto';
import {
  BrowseCampaignsQueryDto,
  BrowseCampaignsResponseDto,
} from './dto/browse-campaigns.dto';

const FORBIDDEN_FIELDS = ['goalAmount', 'contractId', 'milestones', 'endDate'];

@ApiTags('campaigns')
@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
  ) {}

  @Post()
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Create a new campaign' })
  @ApiResponse({ status: 201, description: 'Campaign successfully created' })
  async create(
    @Body() body: CreateCampaignDto,
    @Req() req: Request & { user: any },
  ) {
    const userId = req.user?.sub as string;
    return this.campaignsService.createCampaign(userId, body);
  }

  @Patch(':id')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Update an existing campaign' })
  @ApiResponse({ status: 200, description: 'Campaign successfully updated' })
  @ApiResponse({ status: 400, description: 'Cannot update protected fields' })
  async update(
    @Param('id') id: string,
    @Body() body: UpdateCampaignDto,
    @Req() req: Request & { user: any },
  ) {
    // Reject attempts to update forbidden fields
    const sentKeys = Object.keys(body || {});
    const illegal = sentKeys.filter((k) => FORBIDDEN_FIELDS.includes(k));
    if (illegal.length > 0) {
      throw new BadRequestException(
        `Cannot update protected fields: ${illegal.join(', ')}`,
      );
    }
    const userId = req.user?.sub as string;
    return this.campaignsService.updateCampaign(userId, id, body);
  }

  /**
   * GET /campaigns
   * Browse public campaigns with pagination, filtering, and sorting
   * Query params: page, limit, category, status, search, sortBy
   * Cached for 30 seconds
   */
  @Get()
  @ApiOperation({ summary: 'Browse public campaigns with filtering and sorting' })
  @ApiResponse({ status: 200, description: 'List of campaigns matching criteria' })
  async browseCampaigns(
    @Query() query: BrowseCampaignsQueryDto,
  ): Promise<BrowseCampaignsResponseDto> {
    // Generate cache key based on query parameters
    const cacheKey = this.generateCacheKey(query);

    // Try to get from cache
    const cached =
      await this.cacheManager.get<BrowseCampaignsResponseDto>(cacheKey);
    if (cached) {
      return cached;
    }

    // If not cached, fetch from service
    const result = await this.campaignsService.browseCampaigns(query);

    // Cache the result for 30 seconds
    await this.cacheManager.set(cacheKey, result, 30000);

    return result;
  }

  /**
   * Generate a cache key based on query parameters
   */
  private generateCacheKey(query: BrowseCampaignsQueryDto): string {
    const parts = [
      'campaigns',
      `page:${query.page}`,
      `limit:${query.limit}`,
      `sortBy:${query.sortBy}`,
    ];

    if (query.category) {
      parts.push(`category:${query.category}`);
    }

    if (query.status) {
      parts.push(`status:${query.status}`);
    }

    if (query.search) {
      parts.push(`search:${query.search}`);
    }

    return parts.join(':');
  }
}
