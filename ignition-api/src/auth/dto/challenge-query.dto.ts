import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsStellarPublicKey } from '../../common/decorators/is-stellar-public-key.decorator';

export class ChallengeQueryDto {
  @ApiProperty({
    description: 'The Stellar wallet address',
    example: 'G...wallet-address',
  })
  @IsString()
  @IsNotEmpty()
  @IsStellarPublicKey()
  walletAddress: string;
}
