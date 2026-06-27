import { IsString, IsNumber, IsPositive, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreatePaymentDto {
  @ApiProperty({ description: 'Recipient Stellar address' })
  @IsString()
  @IsNotEmpty()
  recipientAddress: string;

  @ApiProperty({ description: 'Payment amount' })
  @IsNumber()
  @IsPositive()
  amount: number;

  @ApiProperty({ description: 'Asset code (e.g. XLM, USDC)' })
  @IsString()
  @IsNotEmpty()
  assetCode: string;
}
