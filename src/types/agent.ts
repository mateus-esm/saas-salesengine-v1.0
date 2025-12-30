export interface AgentTraining {
  id: string;
  type: 'TEXT' | 'WEBSITE' | 'VIDEO' | 'DOCUMENT';
  text: string;
  image?: string;
  createdAt?: string;
}

export interface CreditUsageDetail {
  credits: number;
  year: number;
  month: number;
  day: number;
  model: string;
}

export interface AgentUsageData {
  creditsSpent: number;
  creditsBalance: number;
  totalCredits: number;
  periodo: string;
  details: CreditUsageDetail[];
}

export interface ModelBreakdown {
  model: string;
  credits: number;
  percentage: number;
  color: string;
}
