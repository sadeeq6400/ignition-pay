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
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { LoginResponseDto } from './dto/login.dto';
import { PasswordActionResponseDto } from './dto/password.dto';
import { assertStrongPassword } from './password-policy';

interface PasswordSetupInput {
  userId?: string;
  walletAddress?: string;
  password: string;
}

interface PasswordChangeInput {
  userId?: string;
  walletAddress?: string;
  currentPassword: string;
  newPassword: string;
}

interface PasswordUser {
  id: string;
  walletAddress: string | null;
  email: string | null;
  displayName: string | null;
  name: string | null;
  passwordHash: string | null;
}

const PASSWORD_HISTORY_LIMIT = 5;
const userProfileInclude = {
  campaigns: {
    where: { status: 'ACTIVE' },
  },
  donations: true,
} satisfies Prisma.UserInclude;

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
      include: userProfileInclude,
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
      verifiedStatus: user.kycStatus === 'VERIFIED',
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

    // If email is being changed, ensure it's not already in use
    if (updateDto.email && updateDto.email !== user.email) {
      const existing = await this.prisma.user.findUnique({
        where: { email: updateDto.email },
      });
      if (existing) {
        throw new BadRequestException('Email already in use');
      }
    }

    // Parse preferences JSON if provided
    const updateData: Prisma.UserUpdateInput = {
      email: updateDto.email ?? user.email,
      name: updateDto.name ?? user.name,
      phone: updateDto.phone ?? user.phone,
      displayName: updateDto.displayName ?? user.displayName,
      bio: updateDto.bio ?? user.bio,
      avatarUrl: updateDto.avatarUrl ?? user.avatarUrl,
    };

    if (updateDto.preferences) {
      try {
        updateData.preferences = JSON.parse(
          updateDto.preferences,
        ) as Prisma.InputJsonValue;
      } catch {
        throw new BadRequestException('Invalid preferences JSON');
      }
    }

    if (updateDto.socialLinks) {
      try {
        updateData.socialLinks = JSON.parse(
          updateDto.socialLinks,
        ) as Prisma.InputJsonValue;
      } catch {
        throw new BadRequestException('Invalid socialLinks JSON');
      }
    }

    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: updateData,
      include: userProfileInclude,
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
      verifiedStatus: updated.kycStatus === 'VERIFIED',
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
      verifiedStatus: user.kycStatus === 'VERIFIED',
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

  async setupPassword(
    input: PasswordSetupInput,
  ): Promise<PasswordActionResponseDto> {
    const user = await this.findPasswordUser(input);

    if (user.passwordHash) {
      throw new BadRequestException('Password is already set');
    }

    assertStrongPassword(input.password, user);
    await this.assertPasswordNotReused(user.id, input.password);

    const passwordHash = await bcrypt.hash(
      input.password,
      this.getPasswordHashRounds(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash,
        },
      });
      await this.prunePasswordHistory(tx, user.id);
    });

    return { success: true, message: 'Password set successfully' };
  }

  async changePassword(
    input: PasswordChangeInput,
  ): Promise<PasswordActionResponseDto> {
    const user = await this.findPasswordUser(input);

    if (!user.passwordHash) {
      throw new BadRequestException('Password is not set');
    }

    const currentPasswordValid = await bcrypt.compare(
      input.currentPassword,
      user.passwordHash,
    );

    if (!currentPasswordValid) {
      throw new UnauthorizedException('Invalid current password');
    }

    assertStrongPassword(input.newPassword, user);
    await this.assertPasswordNotReused(user.id, input.newPassword);

    const passwordHash = await bcrypt.hash(
      input.newPassword,
      this.getPasswordHashRounds(),
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });
      await tx.passwordHistory.create({
        data: {
          userId: user.id,
          passwordHash,
        },
      });
      await this.prunePasswordHistory(tx, user.id);
    });

    return { success: true, message: 'Password changed successfully' };
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

  private async findPasswordUser(input: {
    userId?: string;
    walletAddress?: string;
  }): Promise<PasswordUser> {
    const userFilters = [
      ...(input.userId ? [{ id: input.userId }] : []),
      ...(input.walletAddress ? [{ walletAddress: input.walletAddress }] : []),
    ];

    if (userFilters.length === 0) {
      throw new UnauthorizedException('Invalid token');
    }

    const user = await this.prisma.user.findFirst({
      where: {
        OR: userFilters,
      },
      select: {
        id: true,
        walletAddress: true,
        email: true,
        displayName: true,
        name: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  private async assertPasswordNotReused(
    userId: string,
    password: string,
  ): Promise<void> {
    const history = await this.prisma.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: PASSWORD_HISTORY_LIMIT,
      select: { passwordHash: true },
    });

    for (const item of history) {
      if (await bcrypt.compare(password, item.passwordHash)) {
        throw new BadRequestException(
          'Password was recently used. Choose a different password',
        );
      }
    }
  }

  private async prunePasswordHistory(
    tx: Pick<PrismaService, 'passwordHistory'>,
    userId: string,
  ): Promise<void> {
    const history = await tx.passwordHistory.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip: PASSWORD_HISTORY_LIMIT,
      select: { id: true },
    });

    if (history.length === 0) {
      return;
    }

    await tx.passwordHistory.deleteMany({
      where: {
        id: { in: history.map((item) => item.id) },
      },
    });
  }

  private getPasswordHashRounds(): number {
    const configuredRounds = this.config.get<number | string>(
      'PASSWORD_BCRYPT_ROUNDS',
      12,
    );
    const parsedRounds = Number(configuredRounds);

    return Number.isInteger(parsedRounds) && parsedRounds > 0
      ? parsedRounds
      : 12;
  }
}
