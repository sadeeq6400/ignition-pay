import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UsersService } from './users.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UpdateKYCStatusDto } from './dto/update-kyc-status.dto';
import { UserProfileDto, PublicUserProfileDto } from './dto/user-profile.dto';
import { LoginDto, LoginResponseDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * POST /users/login
   * Authenticate with email + password, returns access and refresh tokens.
   * Rate-limited to 10 requests per minute per IP.
   */
  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async login(@Body() dto: LoginDto): Promise<LoginResponseDto> {
    return this.usersService.login(dto.email, dto.password);
  }

  /**
   * GET /users/me
   * Retrieve authenticated user's full profile
   */
  @UseGuards(JwtAuthGuard)
  @Get('me')
  async getMyProfile(@Request() req: any): Promise<UserProfileDto> {
    return this.usersService.getMyProfile(req.user.walletAddress);
  }

  /**
   * PATCH /users/me
   * Update authenticated user's profile
   */
  @UseGuards(JwtAuthGuard)
  @Patch('me')
  async updateMyProfile(
    @Request() req: any,
    @Body() updateDto: UpdateUserDto,
  ): Promise<UserProfileDto> {
    return this.usersService.updateMyProfile(req.user.walletAddress, updateDto);
  }

  /**
   * GET /users/:walletAddress
   * Retrieve public profile for a user by wallet address
   */
  @Get(':walletAddress')
  async getPublicProfile(
    @Param('walletAddress') walletAddress: string,
  ): Promise<PublicUserProfileDto> {
    return this.usersService.getPublicProfile(walletAddress);
  }
}

@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * PATCH /admin/users/:id/kyc
   * Update user's KYC status (admin only)
   */
  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch(':id/kyc')
  async updateKYCStatus(
    @Param('id') userId: string,
    @Body() updateDto: UpdateKYCStatusDto,
    @Request() req: any,
  ): Promise<{ success: boolean; message: string }> {
    return this.usersService.updateKYCStatus(
      userId,
      updateDto.status as 'VERIFIED' | 'REJECTED' | 'PENDING',
      req.user.walletAddress,
    );
  }
}
