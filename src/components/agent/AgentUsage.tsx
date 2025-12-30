import { UsageCreditsCards } from "./UsageCreditsCards";
import { UsageChart } from "./UsageChart";
import { UsageModelBreakdown } from "./UsageModelBreakdown";
import { AgentUsageData, ModelBreakdown } from "@/types/agent";

// Mock data for demonstration
const mockUsageData: AgentUsageData = {
  creditsSpent: 1250,
  creditsBalance: 750,
  totalCredits: 2000,
  periodo: "Dezembro 2024",
  details: Array.from({ length: 20 }, (_, i) => ({
    credits: Math.floor(Math.random() * 80) + 20,
    year: 2024,
    month: 12,
    day: i + 1,
    model: ["gpt-4-turbo", "gpt-3.5-turbo", "claude-3-sonnet"][Math.floor(Math.random() * 3)],
  })),
};

const mockModelBreakdown: ModelBreakdown[] = [
  { model: "gpt-4-turbo", credits: 820, percentage: 65, color: "hsl(var(--primary))" },
  { model: "gpt-3.5-turbo", credits: 340, percentage: 27, color: "#3b82f6" },
  { model: "claude-3-sonnet", credits: 90, percentage: 8, color: "#10b981" },
];

export function AgentUsage() {
  return (
    <div className="space-y-6">
      <UsageCreditsCards data={mockUsageData} />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <UsageChart data={mockUsageData.details} periodo={mockUsageData.periodo} />
        </div>
        <div>
          <UsageModelBreakdown models={mockModelBreakdown} />
        </div>
      </div>
    </div>
  );
}
