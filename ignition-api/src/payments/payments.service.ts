import { Injectable, BadRequestException } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';

@Injectable()
export class PaymentsService {
  async initiatePayment(dto: CreatePaymentDto) {
    if (!dto.recipientAddress || dto.amount <= 0) {
      throw new BadRequestException('Invalid payment details');
    }
    return {
      id: crypto.randomUUID(),
      status: 'queued',
      recipientAddress: dto.recipientAddress,
      amount: dto.amount,
      assetCode: dto.assetCode,
      createdAt: new Date().toISOString(),
    };
  }
}
