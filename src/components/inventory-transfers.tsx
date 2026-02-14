'use client';

import { useEffect, useState, Fragment } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, RefreshCw, ArrowRight, CheckCircle, Clock, Truck, XCircle, Package, Trash2, ChevronDown, ChevronUp, Box } from 'lucide-react';

interface User {
  id: string;
  role: 'ADMIN' | 'BRANCH_MANAGER' | 'CASHIER';
  branchId?: string;
  name?: string;
}

interface Ingredient {
  id: string;
  name: string;
  unit: string;
}

interface Branch {
  id: string;
  branchName: string;
}

interface TransferItem {
  ingredientId: string;
  quantity: number;
  unit: string;
  ingredient?: Ingredient;
}

interface InventoryTransfer {
  id: string;
  transferNumber: string;
  status: 'PENDING' | 'APPROVED' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  sourceBranch: Branch;
  targetBranch: Branch;
  items: TransferItem[];
  requestedAt: string;
  completedAt?: string;
}

export default function InventoryTransfers() {
  const [transfers, setTransfers] = useState<InventoryTransfer[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [transferItems, setTransferItems] = useState<TransferItem[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Get user info
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [statusFilter, user]);

  const fetchData = async () => {
    setLoading(true);
    try {
      console.log('Fetching transfers data...');
      
      // Build query params based on user role
      let url = `/api/transfers?status=${statusFilter}`;
      if (user?.role === 'BRANCH_MANAGER' && user.branchId) {
        url += `&sourceBranchId=${user.branchId}`;
      }

      const [transfersRes, branchesRes, ingredientsRes] = await Promise.all([
        fetch(url),
        fetch('/api/branches'),
        fetch('/api/ingredients'),
      ]);

      console.log('Transfers response:', transfersRes.status);
      console.log('Branches response:', branchesRes.status);
      console.log('Ingredients response:', ingredientsRes.status);

      if (transfersRes.ok) {
        const data = await transfersRes.json();
        console.log('Transfers data:', data.transfers);
        setTransfers(data.transfers);
      } else {
        const errorText = await transfersRes.text();
        console.error('Failed to fetch transfers - Status:', transfersRes.status, 'Response:', errorText);
      }
      if (branchesRes.ok) {
        const data = await branchesRes.json();
        console.log('Branches:', data.branches);
        setBranches(data.branches);
      } else {
        const errorText = await branchesRes.text();
        console.error('Failed to fetch branches - Status:', branchesRes.status, 'Response:', errorText);
      }
      if (ingredientsRes.ok) {
        const data = await ingredientsRes.json();
        console.log('Ingredients:', data.ingredients);
        setIngredients(data.ingredients);
      } else {
        const errorText = await ingredientsRes.text();
        console.error('Failed to fetch ingredients - Status:', ingredientsRes.status, 'Response:', errorText);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
      console.log('Data fetch completed, loading:', false);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'PENDING':
        return <Clock className="h-4 w-4" />;
      case 'APPROVED':
        return <CheckCircle className="h-4 w-4" />;
      case 'IN_TRANSIT':
        return <Truck className="h-4 w-4" />;
      case 'COMPLETED':
        return <Package className="h-4 w-4" />;
      case 'CANCELLED':
        return <XCircle className="h-4 w-4" />;
      default:
        return <Package className="h-4 w-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PENDING':
        return 'bg-yellow-100 text-yellow-700';
      case 'APPROVED':
        return 'bg-blue-100 text-blue-700';
      case 'IN_TRANSIT':
        return 'bg-purple-100 text-purple-700';
      case 'COMPLETED':
        return 'bg-emerald-100 text-emerald-700';
      case 'CANCELLED':
        return 'bg-red-100 text-red-700';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const toggleRow = (id: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedRows(newExpanded);
  };

  const handleAddItem = () => {
    setTransferItems([...transferItems, { ingredientId: '', quantity: 1, unit: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    setTransferItems(transferItems.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...transferItems];
    updated[index] = { ...updated[index], [field]: value };
    
    // Set unit based on ingredient
    if (field === 'ingredientId') {
      const ingredient = ingredients.find(i => i.id === value);
      updated[index].unit = ingredient?.unit || 'unit';
    }
    
    setTransferItems(updated);
  };

  const createTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const formData = new FormData(e.target as HTMLFormElement);
    const sourceBranchId = formData.get('sourceBranchId');
    const targetBranchId = formData.get('targetBranchId');

    // For branch managers, ensure they're transferring from their own branch
    if (user?.role === 'BRANCH_MANAGER' && user.branchId && sourceBranchId !== user.branchId) {
      alert('You can only transfer from your own branch');
      return;
    }

    console.log('Creating transfer:', { sourceBranchId, targetBranchId, transferItems });

    if (sourceBranchId === targetBranchId) {
      alert('Source and target branches must be different');
      return;
    }

    const transferData = {
      sourceBranchId,
      targetBranchId,
      transferNumber: `TR-${Date.now()}`,
      notes: formData.get('notes'),
      items: transferItems
        .filter(item => item.ingredientId && item.quantity > 0)
        .map(item => ({
          ingredientId: item.ingredientId,
          quantity: item.quantity,
          unit: item.unit || ingredients.find(i => i.id === item.ingredientId)?.unit || 'unit',
        })),
    };

    console.log('Transfer data to send:', transferData);

    try {
      const response = await fetch('/api/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(transferData),
      });

      const responseData = await response.json();
      console.log('Transfer response:', { status: response.status, data: responseData });

      if (response.ok) {
        fetchData();
        setIsDialogOpen(false);
        setTransferItems([]);
      } else {
        console.error('Transfer error:', responseData);
        
        let errorMessage = 'Failed to create transfer';
        if (responseData.error) {
          errorMessage = responseData.error;
        }
        if (responseData.issues) {
          errorMessage = responseData.issues.map((i: any) => i.message).join(', ');
        }
        if (responseData.items && responseData.items.length > 0) {
          errorMessage += `\nInsufficient items:\n${responseData.items.map((i: any) => 
            `${i.ingredientId}: requested ${i.requested}, available ${i.available}`
          ).join('\n')}`;
        }
        
        alert(errorMessage);
      }
    } catch (error) {
      console.error('Failed to create transfer:', error);
      alert('Failed to create transfer');
    }
  };

  const updateTransferStatus = async (transferId: string, status: string) => {
    try {
      const response = await fetch(`/api/transfers/${transferId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, userId: user?.id }),
      });

      if (response.ok) {
        fetchData();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to update transfer');
      }
    } catch (error) {
      console.error('Failed to update transfer:', error);
    }
  };

  const deleteTransfer = async (transferId: string) => {
    if (!confirm('Are you sure you want to delete this transfer?')) return;
    
    try {
      const response = await fetch(`/api/transfers/${transferId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchData();
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to delete transfer');
      }
    } catch (error) {
      console.error('Failed to delete transfer:', error);
    }
  };

  const canManageTransfer = (transfer: InventoryTransfer) => {
    if (user?.role === 'ADMIN') return true;
    if (user?.role === 'BRANCH_MANAGER' && transfer.sourceBranch.id === user.branchId) return true;
    return false;
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white/80 backdrop-blur-sm">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5 text-emerald-600" />
                Inventory Transfers
              </CardTitle>
              <CardDescription>
                {user?.role === 'BRANCH_MANAGER' 
                  ? 'Transfer inventory from your branch'
                  : 'Transfer inventory between branches'
                }
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={statusFilter || 'all'} onValueChange={(val) => setStatusFilter(val === 'all' ? '' : val)}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="PENDING">Pending</SelectItem>
                  <SelectItem value="APPROVED">Approved</SelectItem>
                  <SelectItem value="IN_TRANSIT">In Transit</SelectItem>
                  <SelectItem value="COMPLETED">Completed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" onClick={fetchData}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-emerald-600 hover:bg-emerald-700">
                    <Plus className="h-4 w-4 mr-2" />
                    New Transfer
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create Inventory Transfer</DialogTitle>
                    <DialogDescription>Transfer inventory from one branch to another</DialogDescription>
                  </DialogHeader>
                  <form onSubmit={createTransfer}>
                    <div className="grid gap-4 py-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="grid gap-2">
                          <Label>Source Branch *</Label>
                          {user?.role === 'BRANCH_MANAGER' ? (
                            <>
                              <input
                                type="hidden"
                                name="sourceBranchId"
                                value={user.branchId}
                              />
                              <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-md">
                                <Package className="h-4 w-4 text-slate-500" />
                                <span className="font-medium">
                                  {branches.find(b => b.id === user.branchId)?.branchName || 'Your Branch'}
                                </span>
                              </div>
                              <p className="text-xs text-slate-500">You can only transfer from your branch</p>
                            </>
                          ) : (
                            <Select name="sourceBranchId" required>
                              <SelectTrigger>
                                <SelectValue placeholder="From" />
                              </SelectTrigger>
                              <SelectContent>
                                {branches.map(b => (
                                  <SelectItem key={b.id} value={b.id}>{b.branchName}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                        <div className="grid gap-2">
                          <Label>Target Branch *</Label>
                          <Select name="targetBranchId" required>
                            <SelectTrigger>
                              <SelectValue placeholder="To" />
                            </SelectTrigger>
                            <SelectContent>
                              {branches
                                .filter(b => b.id !== (user?.role === 'BRANCH_MANAGER' ? user.branchId : ''))
                                .map(b => (
                                  <SelectItem key={b.id} value={b.id}>{b.branchName}</SelectItem>
                                ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Transfer Items *</Label>
                        <div className="space-y-2">
                          {transferItems.map((item, index) => (
                            <div key={index} className="flex items-center gap-2">
                              <Select 
                                value={item.ingredientId} 
                                onValueChange={(val) => handleItemChange(index, 'ingredientId', val)}
                              >
                                <SelectTrigger className="flex-1">
                                  <SelectValue placeholder="Select ingredient" />
                                </SelectTrigger>
                                <SelectContent>
                                  {ingredients.map(ing => (
                                    <SelectItem key={ing.id} value={ing.id}>
                                      {ing.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <Input
                                type="number"
                                step="0.01"
                                placeholder="Qty"
                                value={item.quantity}
                                onChange={(e) => handleItemChange(index, 'quantity', parseFloat(e.target.value))}
                                className="w-24"
                              />
                              <span className="text-sm text-slate-500 w-16">{item.unit}</span>
                              <Button 
                                type="button" 
                                variant="ghost" 
                                size="sm"
                                onClick={() => handleRemoveItem(index)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                          <Button type="button" variant="outline" size="sm" onClick={handleAddItem}>
                            <Plus className="h-4 w-4 mr-2" />
                            Add Item
                          </Button>
                        </div>
                      </div>
                      <div className="grid gap-2">
                        <Label>Notes</Label>
                        <Input name="notes" placeholder="Any additional notes..." />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => { setIsDialogOpen(false); setTransferItems([]); }}>
                        Cancel
                      </Button>
                      <Button type="submit" className="bg-emerald-600 hover:bg-emerald-700">
                        Create Transfer
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin h-8 w-8 border-4 border-emerald-500 border-t-transparent rounded-full"></div>
            </div>
          ) : transfers.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-500">
              <Box className="h-12 w-12 mb-4 text-slate-400" />
              <p>No transfers found</p>
            </div>
          ) : (
            <ScrollArea className="h-[500px]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Transfer #</TableHead>
                    <TableHead>From → To</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    {user?.role === 'ADMIN' && <TableHead className="text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transfers.map((transfer) => (
                    <Fragment key={transfer.id}>
                      <TableRow>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleRow(transfer.id)}
                            className="h-8 w-8 p-0"
                          >
                            {expandedRows.has(transfer.id) ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </TableCell>
                        <TableCell className="font-medium">{transfer.transferNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1 text-sm">
                            <span>{transfer.sourceBranch.branchName}</span>
                            <ArrowRight className="h-3 w-3 text-slate-400" />
                            <span>{transfer.targetBranch.branchName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge className={getStatusColor(transfer.status)}>
                            <span className="flex items-center gap-1">
                              {getStatusIcon(transfer.status)}
                              {transfer.status.replace('_', ' ')}
                            </span>
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(transfer.requestedAt).toLocaleDateString()}
                          {transfer.completedAt && (
                            <span className="block text-xs text-slate-500">
                              Completed: {new Date(transfer.completedAt).toLocaleDateString()}
                            </span>
                          )}
                        </TableCell>
                        {user?.role === 'ADMIN' && (
                          <TableCell className="text-right">
                            {transfer.status === 'PENDING' && canManageTransfer(transfer) && (
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateTransferStatus(transfer.id, 'APPROVED')}
                                >
                                  <CheckCircle className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => deleteTransfer(transfer.id)}
                                >
                                  <XCircle className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                            {transfer.status === 'APPROVED' && canManageTransfer(transfer) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateTransferStatus(transfer.id, 'IN_TRANSIT')}
                              >
                                <Truck className="h-4 w-4 mr-1" />
                                Ship
                              </Button>
                            )}
                            {transfer.status === 'IN_TRANSIT' && canManageTransfer(transfer) && (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => updateTransferStatus(transfer.id, 'COMPLETED')}
                              >
                                <CheckCircle className="h-4 w-4 mr-1" />
                                Complete
                              </Button>
                            )}
                          </TableCell>
                        )}
                      </TableRow>
                      {expandedRows.has(transfer.id) && (
                        <TableRow>
                          <TableCell colSpan={user?.role === 'ADMIN' ? 6 : 5}>
                            <div className="p-4 bg-slate-50 rounded-lg">
                              <h4 className="font-semibold text-sm mb-3 flex items-center gap-2">
                                <Package className="h-4 w-4" />
                                Transfer Items ({(transfer.items || []).length})
                              </h4>
                              <div className="space-y-2">
                                {(transfer.items || []).map((item) => (
                                  <div key={`${transfer.id}-${item.ingredientId}`} className="flex items-center justify-between text-sm py-2 border-b border-slate-200 last:border-0">
                                    <span className="font-medium">{item.ingredient?.name || item.ingredientId}</span>
                                    <div className="flex items-center gap-3">
                                      <span className="text-slate-600">{item.quantity} {item.unit}</span>
                                    {item.ingredient?.costPerUnit && (
                                      <span className="text-slate-500">
                                        (${(item.quantity * (item.ingredient.costPerUnit || 0)).toFixed(2)})
                                      </span>
                                    )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                              {transfer.notes && (
                                <div className="mt-3 pt-3 border-t border-slate-200">
                                  <p className="text-xs text-slate-500"><strong>Notes:</strong> {transfer.notes}</p>
                                </div>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
