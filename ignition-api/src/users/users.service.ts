import {
  Injectable,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserProfileDto, PublicUserProfileDto } from './dto/user-profile.dto';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { LoginResponseDto } from './dto/login.dto';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Get authenticated user's full profile
   */
  async getMyProfile(walletAddress: string): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { walletAddress },
      include: {
        campaigns: {
          where: { status: 'ACTIVE' },
        },
        donations: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Calculate stats
    const totalRaised = user.campaigns.reduce(
      (sum, campaign) => sum + parseFloat(campaign.raisedAmount.toString()),
      0,
    );

    const totalDonated = user.donations.reduce(
      (sum, donation) => sum + parseFloat(donation.amount.toString()),
      0,
    );

    return {
      id: user.id,
      walletAddress: user.walletAddress || '',
      displayName: user.displayName || undefined,
      bio: user.bio || undefined,
      avatarUrl: user.avatarUrl || undefined,
      role: user.role,
      kycStatus: user.kycStatus,
      verifiedStatus: user.verifiedStatus,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      totalRaised,
      totalDonated,
      campaignCount: user.campaigns.length,
    };
  }

  /**
   * Update authenticated user's profile
   */
  async updateMyProfile(
    walletAddress: string,
    updateDto: UpdateUserDto,
  ): Promise<UserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: {
        displayName: updateDto.displayName ?? user.displayName,
        bio: updateDto.bio ?? user.bio,
        avatarUrl: updateDto.avatarUrl ?? user.avatarUrl,
        socialLinks: updateDto.socialLinks ?? user.socialLinks,
      },
      include: {
        campaigns: {
          where: { status: 'ACTIVE' },
        },
        donations: true,
      },
    });

    // Calculate stats
    const totalRaised = updated.campaigns.reduce(
      (sum, campaign) => sum + parseFloat(campaign.raisedAmount.toString()),
      0,
    );

    const totalDonated = updated.donations.reduce(
      (sum, donation) => sum + parseFloat(donation.amount.toString()),
      0,
    );

    return {
      id: updated.id,
      walletAddress: updated.walletAddress || '',
      displayName: updated.displayName || undefined,
      bio: updated.bio || undefined,
      avatarUrl: updated.avatarUrl || undefined,
      role: updated.role,
      kycStatus: updated.kycStatus,
      verifiedStatus: updated.verifiedStatus,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      totalRaised,
      totalDonated,
      campaignCount: updated.campaigns.length,
    };
  }

  /**
   * Get public profile for a user by wallet address
   */
  async getPublicProfile(
    walletAddress: string,
  ): Promise<PublicUserProfileDto> {
    const user = await this.prisma.user.findUnique({
      where: { walletAddress },
      include: {
        campaigns: {
          where: { status: 'ACTIVE' },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(
        `User with wallet address ${walletAddress} not found`,
      );
    }

    // Calculate stats
    const totalRaised = user.campaigns.reduce(
      (sum, campaign) => sum + parseFloat(campaign.raisedAmount.toString()),
      0,
    );

    return {
      displayName: user.displayName || undefined,
      avatarUrl: user.avatarUrl || undefined,
      bio: user.bio || undefined,
      verifiedStatus: user.verifiedStatus,
      campaignCount: user.campaigns.length,
      totalRaised,
    };
  }

  /**
   * Update KYC status for a user (admin only)
   */
  async updateKYCStatus(
    userId: string,
    status: 'VERIFIED' | 'REJECTED' | 'PENDING',
    adminId: string,
  ): Promise<{ success: boolean; message: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Update KYC status
    await this.prisma.user.update({
      where: { id: userId },
      data: { kycStatus: status },
    });

    // Log to AuditLog
    await this.prisma.auditLog.create({
      data: {
        userId: adminId,
        action: 'ADMIN_ACTION',
        resourceType: 'User',
        resourceId: userId,
        details: JSON.stringify({
          action: 'KYC_STATUS_UPDATE',
          previousStatus: user.kycStatus,
          newStatus: status,
        }),
      },
    });

    // TODO: Send email notification to user
    // await this.emailService.sendKYCStatusUpdate(user.email, status);

    return {
      success: true,
      message: `User KYC status updated to ${status}`,
    };
  }

  /**
   * Login with email + password, returning JWT access and refresh tokens.
   * Enforces account lockout after too many failed attempts.
   */
  async login(email: string, password: string): Promise<LoginResponseDto> {
    const maxAttempts = this.config.get<number>('LOGIN_MAX_ATTEMPTS', 5);
    const lockoutSeconds = this.config.get<number>(
      'LOGIN_LOCKOUT_SECONDS',
      900,
    );

    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check lockout
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      const retryAfter = Math.ceil(
        (user.lockedUntil.getTime() - Date.now()) / 1000,
      );
      throw new UnauthorizedException(
        `Account locked. Try again in ${retryAfter}s`,
      );
    }

    if (!user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.passwordHash);

    if (!valid) {
      const attempts = user.loginAttempts + 1;
      const lockedUntil =
        attempts >= maxAttempts
          ? new Date(Date.now() + lockoutSeconds * 1000)
          : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: { loginAttempts: attempts, lockedUntil },
      });

      throw new UnauthorizedException('Invalid credentials');
    }

    // Reset attempts on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null },
    });

    const payload = { sub: user.id, email: user.email, role: user.role };

    const accessToken = this.jwt.sign(payload, {
      secret: this.config.get<string>('JWT_SECRET', 'default-secret'),
      expiresIn: '15m',
    });

    const refreshToken = this.jwt.sign(
      { sub: user.id },
      {
        secret: this.config.get<string>(
          'REFRESH_TOKEN_SECRET',
          'default-refresh-secret',
        ),
        expiresIn: '7d',
      },
    );

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  /**
   * Get or create user by wallet address
   */
  async getOrCreateUser(walletAddress: string, email?: string) {
    let user = await this.prisma.user.findUnique({
      where: { walletAddress },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          walletAddress,
          email: email || `${walletAddress}@stellaraid.local`,
          role: 'DONOR',
        },
      });

      // Log user creation in AuditLog
      await this.prisma.auditLog.create({
        data: {
          userId: user.id,
          action: 'USER_CREATED',
          resourceType: 'User',
          resourceId: user.id,
          details: JSON.stringify({ walletAddress }),
        },
      });
    }

    return user;
  }
}
