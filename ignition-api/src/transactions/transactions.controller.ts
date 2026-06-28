import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions/permissions.guard';
import { RequirePermissions } from '../auth/permissions/require-permissions.decorator';
import { Permission } from '../auth/permissions/permissions.map';
import { TransactionsService } from './transactions.service';
import { GetTransactionsQueryDto } from './dto/get-transactions.dto';

@ApiTags('transactions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  /**
   * GET /transactions
   * List transactions with pagination and optional filters:
   * page, limit, dateFrom, dateTo, status, type
   */
  @Get()
  @RequirePermissions(Permission.TRANSACTION_READ)
  @ApiOperation({ summary: 'Get paginated transactions with optional filters' })
  @ApiResponse({ status: 200, description: 'Paginated transaction list' })
  getTransactions(@Query() query: GetTransactionsQueryDto) {
    return this.transactionsService.getTransactions(query);
  }
}
