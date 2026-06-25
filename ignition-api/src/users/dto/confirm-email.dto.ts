import { IsString, MinLength } from 'class-validator';

export class ConfirmEmailDto {
  @IsString()
  @MinLength(16)
  token!: string;
}
