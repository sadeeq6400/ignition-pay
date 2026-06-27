import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtAuthGuard } from '../users/guards/jwt-auth.guard';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'stellaraid-default-secret'),
        signOptions: { expiresIn: '15m' },
      }),
    }),
  ],
  controllers: [WalletsController],
  providers: [WalletsService, JwtAuthGuard],
})
export class WalletsModule {}
