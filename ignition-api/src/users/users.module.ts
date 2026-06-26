import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { CacheModule } from '@nestjs/cache-manager';
import { UsersService } from './users.service';
import { UsersController, AdminUsersController } from './users.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AdminGuard } from './guards/admin.guard';
import { SessionModule } from '../session/session.module';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    SessionModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'default-secret'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    CacheModule,
  ],
  controllers: [UsersController, AdminUsersController],
  providers: [UsersService, JwtAuthGuard, AdminGuard, RolesGuard],
  exports: [UsersService],
})
export class UsersModule {}
