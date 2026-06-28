import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { CampaignsService } from './campaigns.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PermissionsService } from '../auth/permissions/permissions.service';
import { PermissionsGuard } from '../auth/permissions/permissions.guard';

@Module({
  imports: [PrismaModule],
  controllers: [CampaignsController],
  providers: [CampaignsService, PermissionsService, PermissionsGuard],
  exports: [CampaignsService],
})
export class CampaignsModule {}
