import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { SessionService } from './session.service';
import { SessionGuard } from './session.guard';
import { SessionController } from './session.controller';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET', 'stellaraid-default-secret'),
        signOptions: {
          expiresIn: `${config.get<number>('SESSION_ACCESS_TTL_SECONDS', 900)}s`,
        },
      }),
    }),
  ],
  controllers: [SessionController],
  providers: [SessionService, SessionGuard],
  exports: [SessionService, SessionGuard, JwtModule],
})
export class SessionModule {}
