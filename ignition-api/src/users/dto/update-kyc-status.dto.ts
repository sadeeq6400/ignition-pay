import { IsEnum } from 'class-validator';

export enum KYCStatusEnum {
  VERIFIED = 'VERIFIED',
  REJECTED = 'REJECTED',
  PENDING = 'PENDING',
}

export class UpdateKYCStatusDto {
  @IsEnum(KYCStatusEnum)
  status: KYCStatusEnum;
}
