import {
  IsEmail,
  IsString,
  MinLength,
  Matches,
  MaxLength,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  email!: string;

  @IsString()
  // Stellar wallet addresses are typically long; validate length only.
  @MinLength(10)
  @MaxLength(64)
  walletAddress!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  @Matches(/^\S*$/, {
    message: 'password must not contain whitespace',
  })
  @Matches(/[a-z]/, {
    message: 'password must contain at least one lowercase letter',
  })
  @Matches(/[A-Z]/, {
    message: 'password must contain at least one uppercase letter',
  })
  @Matches(/\d/, {
    message: 'password must contain at least one number',
  })
  @Matches(/[^A-Za-z0-9]/, {
    message: 'password must contain at least one special character',
  })
  password!: string;
}
