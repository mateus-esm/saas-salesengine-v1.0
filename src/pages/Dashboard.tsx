import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { Users, Calendar, TrendingUp, DollarSign, Loader2, RefreshCcw, Download, CalendarDays, UserX, BadgeCheck, Banknote, Percent, Target, Phone, Award } from "lucide-react";
import { useDashboardMetrics } from "@/hooks/useDashboardMetrics";
import { useAuth } from "@/contexts/AuthContext";
import { startOfMonth, endOfMonth, subMonths, subYears, format } from "date-fns";
import { ptBR } from "date-fns/locale";

const Dashboard = () => {
  const { profile, loading: authLoading } = useAuth();
  // Keep the date stable per mount to avoid changing react-query keys on every render
  const [currentDate, setCurrentDate] = useState(() => new Date());

  const [selectedPeriod, setSelectedPeriod] = useState<string>("all"); // Default to 'all' (Geral)

  const getDateRange = () => {
    switch (selectedPeriod) {
      case "current":
        return { start: startOfMonth(currentDate), end: endOfMonth(currentDate) };
      case "last": {
        const lastMonth = subMonths(currentDate, 1);
        return { start: startOfMonth(lastMonth), end: endOfMonth(lastMonth) };
      }
      case "last3":
        return { start: startOfMonth(subMonths(currentDate, 2)), end: endOfMonth(currentDate) };
      case "year":
        return { start: new Date(currentDate.getFullYear(), 0, 1), end: currentDate };
      case "all":
      default:
        // All time - 5 years back to now
        return { start: subYears(currentDate, 5), end: currentDate };
    }
  };

  const dateRange = getDateRange();

  const { data: metrics, isLoading, refetch } = useDashboardMetrics({
    startDate: dateRange.start,
    endDate: dateRange.end,
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);
  };

  const exportToCSV = () => {
    if (!metrics) return;

    const headers = ["Métrica", "Valor"];
    const rows = [
      ["Total de Leads", metrics.totalLeads],
      ["Reuniões Agendadas", metrics.meetingsScheduled],
      ["Reuniões Realizadas", metrics.meetingsDone],
      ["No-Shows", metrics.noShowCount],
      ["Reuniões Hoje", metrics.meetingsToday],
      ["Valor Total Pipeline", metrics.totalPipelineValue],
      ["Taxa de Conversão (%)", metrics.conversionRate.toFixed(1)],
      ["Taxa No-Show (%)", metrics.noShowRate.toFixed(1)],
    ];

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(",")),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `dashboard_${format(dateRange.start, "yyyy-MM")}.csv`;
    link.click();
  };

  // Wait for auth to load before checking team
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!profile?.equipe_id) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <p className="text-muted-foreground">Você não está associado a uma equipe.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const STAGE_COLORS = metrics?.leadsByStage.map(s => s.color) || [];
  const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--chart-2))", "hsl(var(--chart-3))", "hsl(var(--chart-4))", "hsl(var(--chart-5))"];

  const periodLabel = selectedPeriod === "all"
    ? "Geral (Todo o período)"
    : selectedPeriod === "current"
      ? format(currentDate, "MMMM yyyy", { locale: ptBR })
      : selectedPeriod === "last"
        ? format(subMonths(currentDate, 1), "MMMM yyyy", { locale: ptBR })
        : selectedPeriod === "year"
          ? `Ano ${currentDate.getFullYear()}`
          : "Últimos 3 meses";

  return (
    <div className="flex-1 flex flex-col">
      {/* Header */}
      <div className="border-b border-border bg-gradient-to-r from-background to-muted/30">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                Dashboard <span className="text-primary">Proprietário</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Métricas do CRM • {periodLabel}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Geral (Todos)</SelectItem>
                  <SelectItem value="current">Mês Atual</SelectItem>
                  <SelectItem value="last">Mês Anterior</SelectItem>
                  <SelectItem value="last3">Últimos 3 Meses</SelectItem>
                  <SelectItem value="year">Este Ano</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => {
                  setCurrentDate(new Date());
                  refetch();
                }}
                variant="outline"
                size="icon"
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
              <Button onClick={exportToCSV} variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                CSV
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 container mx-auto px-4 py-6 space-y-6">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total de Leads</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{metrics?.totalLeads || 0}</div>
              <p className="text-xs text-muted-foreground">No período</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reuniões Agendadas</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{metrics?.meetingsScheduled || 0}</div>
              <p className="text-xs text-muted-foreground">
                {metrics?.conversionRate.toFixed(1)}% conversão
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reuniões Realizadas</CardTitle>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{metrics?.meetingsDone || 0}</div>
              <p className="text-xs text-muted-foreground">Concluídas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">No-Shows</CardTitle>
              <UserX className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{metrics?.noShowCount || 0}</div>
              <p className="text-xs text-muted-foreground">
                {metrics?.noShowRate.toFixed(1)}% taxa
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Reuniões Hoje</CardTitle>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">{metrics?.meetingsToday || 0}</div>
              <p className="text-xs text-muted-foreground">Agendadas</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Pipeline</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono">
                {formatCurrency(metrics?.totalPipelineValue || 0)}
              </div>
              <p className="text-xs text-muted-foreground">Em aberto</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Negócios Fechados</CardTitle>
              <BadgeCheck className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-green-600">{metrics?.closedDealsCount || 0}</div>
              <p className="text-xs text-muted-foreground">No período</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Valor Ganho</CardTitle>
              <Banknote className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-green-600">
                {formatCurrency(metrics?.closedDealsValue || 0)}
              </div>
              <p className="text-xs text-muted-foreground">Fechados</p>
            </CardContent>
          </Card>
        </div>

        {/* New KPIs Row - PRD v3.5 */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Taxa de Fechamento</CardTitle>
              <Percent className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-primary">
                {(metrics?.closingRate || 0).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">
                {metrics?.closedDealsCount || 0} de {metrics?.totalLeads || 0} leads
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-green-500/5 to-green-500/10 border-green-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ticket Médio</CardTitle>
              <Target className="h-4 w-4 text-green-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-green-600">
                {formatCurrency(metrics?.avgTicket || 0)}
              </div>
              <p className="text-xs text-muted-foreground">Por negócio fechado</p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-blue-500/5 to-blue-500/10 border-blue-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Touchpoints</CardTitle>
              <Phone className="h-4 w-4 text-blue-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-mono text-blue-600">
                {metrics?.totalTouchpoints || 0}
              </div>
              <p className="text-xs text-muted-foreground">
                ~{(metrics?.avgTouchpointsPerLead || 0).toFixed(1)} por lead
              </p>
            </CardContent>
          </Card>

          <Card className="bg-gradient-to-br from-amber-500/5 to-amber-500/10 border-amber-500/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Conversão Pós-Reunião</CardTitle>
              <Award className="h-4 w-4 text-amber-600" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">
                {(metrics?.closingRatePostMeeting || 0).toFixed(1)}%
              </div>
              <p className="text-xs text-muted-foreground">Fecham após reunião</p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Pipeline Funnel */}
          <Card>
            <CardHeader>
              <CardTitle>Leads por Fase</CardTitle>
              <CardDescription>Distribuição no pipeline</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={metrics?.leadsByStage || []} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" className="text-muted-foreground" />
                  <YAxis dataKey="stage_name" type="category" width={120} className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                  />
                  <Bar dataKey="count" name="Leads">
                    {(metrics?.leadsByStage || []).map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Leads Over Time */}
          <Card>
            <CardHeader>
              <CardTitle>Leads ao Longo do Tempo</CardTitle>
              <CardDescription>Novos leads por dia</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={metrics?.leadsOverTime || []}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="date"
                    className="text-muted-foreground"
                    tickFormatter={(value) => format(new Date(value), "dd/MM")}
                  />
                  <YAxis className="text-muted-foreground" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px"
                    }}
                    labelFormatter={(value) => format(new Date(value), "dd/MM/yyyy")}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Leads"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))" }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Charts Row 2 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Leads by Responsible */}
          <Card>
            <CardHeader>
              <CardTitle>Leads por Responsável</CardTitle>
              <CardDescription>Distribuição da equipe</CardDescription>
            </CardHeader>
            <CardContent>
              {(metrics?.leadsByResponsible?.length || 0) > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={metrics?.leadsByResponsible || []}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ responsible_name, count }) => `${responsible_name}: ${count}`}
                      outerRadius={100}
                      fill="hsl(var(--primary))"
                      dataKey="count"
                      nameKey="responsible_name"
                    >
                      {(metrics?.leadsByResponsible || []).map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "hsl(var(--popover))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px"
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  Nenhum lead atribuído ainda
                </div>
              )}
            </CardContent>
          </Card>

          {/* Conversion Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Métricas de Conversão</CardTitle>
              <CardDescription>Performance do funil</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Taxa de Agendamento</span>
                    <span className="font-medium">{metrics?.conversionRate.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${Math.min(metrics?.conversionRate || 0, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metrics?.meetingsScheduled} de {metrics?.totalLeads} leads
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Taxa de Realização</span>
                    <span className="font-medium">
                      {metrics?.meetingsScheduled ? ((metrics.meetingsDone / metrics.meetingsScheduled) * 100).toFixed(1) : 0}%
                    </span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{
                        width: `${metrics?.meetingsScheduled ? Math.min((metrics.meetingsDone / metrics.meetingsScheduled) * 100, 100) : 0}%`
                      }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metrics?.meetingsDone} de {metrics?.meetingsScheduled} reuniões
                  </p>
                </div>

                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Taxa de No-Show</span>
                    <span className="font-medium text-destructive">{metrics?.noShowRate.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-destructive rounded-full transition-all"
                      style={{ width: `${Math.min(metrics?.noShowRate || 0, 100)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {metrics?.noShowCount} de {metrics?.meetingsScheduled} reuniões
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
