import { IsString, MinLength } from 'class-validator';

export class SetupPasswordDto {
  @IsString()
  @MinLength(12)
  password: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(12)
  newPassword: string;
}

export class PasswordActionResponseDto {
  success: boolean;
  message: string;
}
