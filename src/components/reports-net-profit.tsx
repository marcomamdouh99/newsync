'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DollarSign, TrendingUp, TrendingDown, Package, ShoppingCart, Calendar, RefreshCw, ArrowUpRight, ArrowDownRight, AlertCircle } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { formatCurrency } from '@/lib/utils';

interface Branch {
  id: string;
  branchName: string;
}

interface NetProfitData {
  period: string;
  sales: {
    revenue: number;
    productCost: number;
    netProfitFromOperations: number;
    grossMargin: number;
  };
  costs: {
    operational: number;
    entries: number;
    byCategory: Record<string, number>;
  };
  netProfit: {
    amount: number;
    margin: number;
    isProfitable: boolean;
  };
  items: {
    sold: number;
    orders: number;
  };
  costsBreakdown: Array<{
    id: string;
    category: string;
    amount: number;
    branch: string;
    notes: string | null;
    date: Date;
  }>;
}

export default function NetProfitReport() {
  const { user: currentUser } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<string>(currentUser?.role === 'BRANCH_MANAGER' ? currentUser.branchId || '' : 'all');
  const [selectedPeriod, setSelectedPeriod] = useState<string>('');
  const [data, setData] = useState<NetProfitData | null>(null);
  const [loading, setLoading] = useState(false);

  // Get current period (YYYY-MM)
  const getCurrentPeriod = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  };

  // Generate period options (last 6 months + current month)
  const getPeriodOptions = () => {
    const periods: Array<{ value: string; label: string }> = [];
    const now = new Date();
    
    for (let i = -6; i <= 0; i++) {
      const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
      const period = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
      periods.push({ value: period, label });
    }
    
    return periods.reverse();
  };

  // Fetch branches
  useEffect(() => {
    const fetchBranches = async () => {
      try {
        const response = await fetch('/api/branches');
        const data = await response.json();
        if (response.ok && data.branches) {
          setBranches(data.branches);
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      }
    };
    fetchBranches();
  }, []);

  // Set default period
  useEffect(() => {
    setSelectedPeriod(getCurrentPeriod());
  }, []);

  // Fetch data when filters change
  useEffect(() => {
    if (selectedPeriod) {
      fetchData();
    }
  }, [selectedBranch, selectedPeriod]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedBranch !== 'all') params.append('branchId', selectedBranch);
      if (selectedPeriod) params.append('period', selectedPeriod);

      const response = await fetch(`/api/reports/net-profit?${params.toString()}`);
      const result = await response.json();

      if (result.success) {
        setData(result.data);
      }
    } catch (error) {
      console.error('Failed to fetch net profit data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPeriodLabel = (period: string) => {
    const [year, month] = period.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long' });
  };

  const ProfitCard = ({
    title,
    amount,
    subtitle,
    icon: Icon,
    isPositive,
    percentage
  }: {
    title: string;
    amount: number;
    subtitle?: string;
    icon: any;
    isPositive?: boolean;
    percentage?: number;
  }) => (
    <Card className={`border-2 ${isPositive === false ? 'border-red-200 bg-red-50/50' : isPositive === true ? 'border-green-200 bg-green-50/50' : 'border-slate-200'}`}>
      <CardHeader className="pb-3">
        <CardDescription className="text-xs font-medium flex items-center gap-2">
          <Icon className={`h-3.5 w-3.5 ${isPositive === false ? 'text-red-600' : isPositive === true ? 'text-green-600' : 'text-slate-600'}`} />
          {title}
        </CardDescription>
        <CardTitle className={`text-2xl font-bold ${isPositive === false ? 'text-red-900' : isPositive === true ? 'text-green-900' : 'text-slate-900'}`}>
          {formatCurrency(Math.abs(amount))}
        </CardTitle>
        {subtitle && (
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{subtitle}</p>
        )}
        {percentage !== undefined && (
          <div className="flex items-center gap-1 mt-2">
            {isPositive ? (
              <ArrowUpRight className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <ArrowDownRight className="h-3.5 w-3.5 text-red-600" />
            )}
            <span className={`text-xs font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {percentage.toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500">margin</span>
          </div>
        )}
      </CardHeader>
    </Card>
  );

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin h-10 w-10 border-4 border-emerald-600 border-t-transparent rounded-full"></div>
          <p className="text-slate-600">Loading net profit data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-emerald-200">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${data?.netProfit.isProfitable ? 'bg-green-500' : 'bg-red-500'} shadow-lg`}>
                {data?.netProfit.isProfitable ? (
                  <TrendingUp className="h-6 w-6 text-white" />
                ) : (
                  <TrendingDown className="h-6 w-6 text-white" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white">صافي الربح/الخسارة</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">Net Profit/Loss Report</p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {currentUser?.role === 'ADMIN' && (
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <DollarSign className="h-4 w-4 mr-2 text-emerald-600" />
                    <SelectValue placeholder="All Branches" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Branches</SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        {branch.branchName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <Calendar className="h-4 w-4 mr-2 text-emerald-600" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {getPeriodOptions().map((period) => (
                    <SelectItem key={period.value} value={period.value}>
                      {period.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                onClick={fetchData}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {data && (
        <>
          {/* Main KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ProfitCard
              title="Total Revenue"
              amount={data.sales.revenue}
              subtitle={`${data.items.orders} orders`}
              icon={ShoppingCart}
              isPositive={true}
            />
            <ProfitCard
              title="Product Cost"
              amount={data.sales.productCost}
              subtitle={`${data.items.sold} items sold`}
              icon={Package}
              isPositive={false}
            />
            <ProfitCard
              title="Net from Operations"
              amount={data.sales.netProfitFromOperations}
              subtitle="Revenue - Product Cost"
              icon={DollarSign}
              isPositive={data.sales.netProfitFromOperations >= 0}
              percentage={data.sales.grossMargin}
            />
            <ProfitCard
              title="Net Profit/Loss"
              amount={data.netProfit.amount}
              subtitle="After operational costs"
              icon={data.netProfit.isProfitable ? TrendingUp : TrendingDown}
              isPositive={data.netProfit.isProfitable}
              percentage={data.netProfit.margin}
            />
          </div>

          {/* Final Net Profit Summary */}
          <Card className={`border-2 ${data.netProfit.isProfitable ? 'border-green-300 bg-gradient-to-br from-green-50 to-emerald-50' : 'border-red-300 bg-gradient-to-br from-red-50 to-orange-50'} shadow-xl`}>
            <CardHeader>
              <CardTitle className={`flex items-center gap-3 ${data.netProfit.isProfitable ? 'text-green-900' : 'text-red-900'}`}>
                {data.netProfit.isProfitable ? (
                  <div className="w-10 h-10 bg-green-500 rounded-xl flex items-center justify-center">
                    <TrendingUp className="h-5 w-5 text-white" />
                  </div>
                ) : (
                  <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center">
                    <TrendingDown className="h-5 w-5 text-white" />
                  </div>
                )}
                <span>
                  {data.netProfit.isProfitable ? 'صافي الربح' : 'صافي الخسارة'}
                  <span className="text-sm font-normal text-slate-600 ml-2">
                    ({getPeriodLabel(data.period)})
                  </span>
                </span>
              </CardTitle>
              <CardDescription>
                {data.sales.revenue} (Sales) - {data.sales.productCost} (Product Cost) - {data.costs.operational} (Operational Costs) = {formatCurrency(Math.abs(data.netProfit.amount))}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">Total Revenue</p>
                  <p className="text-2xl font-bold text-slate-900">{formatCurrency(data.sales.revenue)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">Total Costs (Product + Operations)</p>
                  <p className="text-2xl font-bold text-slate-900">{formatCurrency(data.sales.productCost + data.costs.operational)}</p>
                  <p className="text-xs text-slate-500">Product: {formatCurrency(data.sales.productCost)} | Operations: {formatCurrency(data.costs.operational)}</p>
                </div>
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">Net Margin</p>
                  <p className={`text-2xl font-bold ${data.netProfit.isProfitable ? 'text-green-600' : 'text-red-600'}`}>
                    {data.netProfit.margin.toFixed(1)}%
                  </p>
                  <p className="text-xs text-slate-500">{formatCurrency(data.netProfit.amount)} net profit/loss</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Costs Breakdown by Category */}
          {Object.keys(data.costs.byCategory).length > 0 && (
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-5 w-5 text-slate-700" />
                  Operational Costs by Category
                </CardTitle>
                <CardDescription>
                  Total: {formatCurrency(data.costs.operational)} ({data.costs.entries} entries)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                  {Object.entries(data.costs.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([category, amount]) => (
                      <div key={category} className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                        <p className="text-xs font-medium text-slate-600 truncate mb-1">{category}</p>
                        <p className="text-lg font-bold text-slate-900">{formatCurrency(amount)}</p>
                      </div>
                    ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Detailed Costs Table */}
          {data.costsBreakdown.length > 0 && (
            <Card className="border-slate-200">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-slate-700" />
                  Cost Entries Details
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Category</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Branch</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Notes</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {data.costsBreakdown.map((cost) => (
                        <TableRow key={cost.id}>
                          <TableCell className="font-medium">{cost.category}</TableCell>
                          <TableCell className="font-semibold">{formatCurrency(cost.amount)}</TableCell>
                          <TableCell>{cost.branch}</TableCell>
                          <TableCell>{new Date(cost.date).toLocaleDateString()}</TableCell>
                          <TableCell className="text-slate-500">{cost.notes || '-'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
