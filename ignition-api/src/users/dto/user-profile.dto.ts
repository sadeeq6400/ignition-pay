export class UserProfileDto {
  id: string;
  walletAddress: string;
  displayName?: string;
  bio?: string;
  avatarUrl?: string;
  role: string;
  kycStatus: string;
  verifiedStatus: boolean;
  createdAt: Date;
  updatedAt: Date;

  // Stats
  totalRaised?: number;
  totalDonated?: number;
  campaignCount?: number;
}

export class PublicUserProfileDto {
  displayName?: string;
  avatarUrl?: string;
  bio?: string;
  verifiedStatus: boolean;
  campaignCount: number;
  totalRaised: number;
}
