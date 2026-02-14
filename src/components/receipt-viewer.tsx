'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Printer, Download, Search, Receipt, X, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { useI18n } from '@/lib/i18n-context';

interface OrderItem {
  id: string;
  menuItemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  recipeVersion: number;
  createdAt: string;
}

interface Order {
  id: string;
  branchId: string;
  orderNumber: number;
  orderTimestamp: string;
  cashierId: string;
  cashier?: {
    id: string;
    username: string;
    name?: string;
  };
  totalAmount: number;
  subtotal?: number;
  paymentMethod: string;
  orderType?: string;
  deliveryFee?: number;
  deliveryAddress?: string;
  deliveryAreaId?: string;
  isRefunded: boolean;
  refundReason?: string;
  transactionHash: string;
  synced: boolean;
  shiftId?: string;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
  branch?: {
    id: string;
    branchName: string;
  };
  customerPhone?: string;
  customerName?: string;
  loyaltyPointsRedeemed?: number | null;
  loyaltyDiscount?: number | null;
}

interface ReceiptViewerProps {
  open: boolean;
  onClose: () => void;
  order?: Order | null;
}

export function ReceiptViewer({ open, onClose, order }: ReceiptViewerProps) {
  const { currency, t } = useI18n();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);

  const handlePrint = () => {
    if (receiptRef.current) {
      const printContent = receiptRef.current.innerHTML;
      const printWindow = window.open('', '', 'width=400,height=800');
      
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Receipt #${order?.orderNumber}</title>
            <style>
              body {
                font-family: 'Courier New', monospace;
                max-width: 80mm;
                margin: 0 auto;
                padding: 5mm;
                font-size: 12px;
                line-height: 1.4;
              }
              .header {
                text-align: center;
                margin-bottom: 15px;
                border-bottom: 2px dashed #000;
                padding-bottom: 10px;
              }
              .header h1 {
                margin: 0;
                font-size: 18px;
                font-weight: bold;
              }
              .info {
                margin-bottom: 15px;
                font-size: 11px;
              }
              .info div {
                margin: 3px 0;
              }
              .items {
                margin-bottom: 15px;
              }
              .item {
                display: flex;
                justify-content: space-between;
                margin: 5px 0;
              }
              .item-qty {
                flex: 0 0 30px;
                text-align: left;
                font-weight: bold;
              }
              .item-name {
                flex: 1;
                text-align: left;
              }
              .item-price {
                flex: 0 0 80px;
                text-align: right;
              }
              .totals {
                border-top: 2px dashed #000;
                padding-top: 10px;
              }
              .total-row {
                display: flex;
                justify-content: space-between;
                margin: 5px 0;
              }
              .total-row.grand-total {
                font-weight: bold;
                font-size: 14px;
                margin-top: 10px;
              }
              .footer {
                text-align: center;
                margin-top: 20px;
                padding-top: 10px;
                border-top: 2px dashed #000;
                font-size: 10px;
              }
              .refunded {
                color: #ff0000;
                font-weight: bold;
                text-align: center;
                padding: 10px;
                border: 2px solid #ff0000;
                margin: 10px 0;
              }
            </style>
          </head>
          <body>
            ${printContent}
          </body>
          </html>
        `);
        
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
        }, 500);
      }
    }
  };

  const handleDownload = () => {
    if (!order) return;
    
    const receiptContent = receiptRef.current?.innerHTML;
    if (!receiptContent) return;

    const blob = new Blob([receiptContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `receipt-${order.orderNumber}-${new Date().toISOString().split('T')[0]}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Receipt className="h-5 w-5 text-primary" />
              <DialogTitle>Receipt #{order.orderNumber}</DialogTitle>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Receipt Preview */}
          <Card>
            <CardContent className="pt-6">
              <div ref={receiptRef} className="bg-white p-6 border-2 border-slate-200">
                <div className="header">
                  <h1>Emperor Coffee</h1>
                  <div>{order.branch?.branchName || 'Coffee Shop'}</div>
                  <div>Receipt #{order.orderNumber}</div>
                </div>

                {order.isRefunded && (
                  <div className="refunded">
                    *** REFUNDED ***
                    {order.refundReason && <div>Reason: {order.refundReason}</div>}
                  </div>
                )}

                <div className="info">
                  <div>Date: {formatDate(order.orderTimestamp)} {formatTime(order.orderTimestamp)}</div>
                  <div>Cashier: {order.cashier?.name || order.cashier?.username}</div>
                  {order.orderType && (
                    <div>Type: {order.orderType === 'dine-in' ? 'Dine In' : order.orderType === 'take-away' ? 'Take Away' : 'Delivery'}</div>
                  )}
                  {order.customerPhone && <div>Phone: {order.customerPhone}</div>}
                  {order.customerName && <div>Customer: {order.customerName}</div>}
                </div>

                {order.orderType === 'delivery' && order.deliveryAddress && (
                  <div className="info" style={{ marginTop: '10px', borderTop: '1px dashed #000', paddingTop: '10px' }}>
                    <div style={{ fontWeight: 'bold', marginBottom: '5px' }}>Delivery Details:</div>
                    <div>{order.deliveryAddress}</div>
                  </div>
                )}

                <div className="items">
                  {order?.items && order.items.map((item) => (
                    <div key={item.id} className="item">
                      <span className="item-qty">{item.quantity}x</span>
                      <span className="item-name">{item.itemName}</span>
                      <span className="item-price">{formatCurrency(item.subtotal, currency)}</span>
                    </div>
                  ))}
                </div>

                <div className="totals">
                  {order.subtotal !== undefined && (
                    <div className="total-row">
                      <span>Subtotal:</span>
                      <span>{formatCurrency(order.subtotal, currency)}</span>
                    </div>
                  )}
                  {order.deliveryFee && order.deliveryFee > 0 && (
                    <div className="total-row">
                      <span>Delivery Fee:</span>
                      <span>{formatCurrency(order.deliveryFee, currency)}</span>
                    </div>
                  )}
                  {order.loyaltyDiscount && order.loyaltyDiscount > 0 && (
                    <div className="total-row" style={{ color: '#8b5cf6' }}>
                      <span>Loyalty Discount ({order.loyaltyPointsRedeemed} pts):</span>
                      <span>-{formatCurrency(order.loyaltyDiscount, currency)}</span>
                    </div>
                  )}
                  <div className="total-row grand-total">
                    <span>TOTAL:</span>
                    <span>{formatCurrency(order.totalAmount, currency)}</span>
                  </div>
                  <div className="total-row">
                    <span>Payment:</span>
                    <span>{order.paymentMethod === 'card' ? 'Card' : 'Cash'}</span>
                  </div>
                </div>

                <div className="footer">
                  <div>Thank you for your purchase!</div>
                  <div>Emperor Coffee Franchise</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button onClick={handlePrint} className="flex-1" size="lg">
              <Printer className="h-4 w-4 mr-2" />
              Print Receipt
            </Button>
            <Button onClick={handleDownload} variant="outline" size="lg">
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface ReceiptSearchProps {
  onOrderSelect: (order: Order) => void;
}

export function ReceiptSearch({ onOrderSelect }: ReceiptSearchProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const { currency, t } = useI18n();

  useEffect(() => {
    if (searchQuery.length >= 3) {
      searchOrders();
    } else {
      setOrders([]);
    }
  }, [searchQuery]);

  const searchOrders = async () => {
    setLoading(true);
    try {
      // In production, fetch from API
      // const response = await fetch(`/api/orders?search=${searchQuery}`);
      // const data = await response.json();
      // setOrders(data.orders);

      // For now, use sample data
      const sampleOrders: Order[] = [
        {
          id: '1',
          branchId: 'cml46do4q0000ob5g27krklqe',
          orderNumber: 1,
          orderTimestamp: new Date(Date.now() - 3600000).toISOString(),
          cashierId: 'cashier1',
          cashier: { id: 'cashier1', username: 'cashier1', name: 'Jane Doe' },
          subtotal: 13.60,
          totalAmount: 15.50,
          paymentMethod: 'card',
          isRefunded: false,
          transactionHash: 'abc123',
          synced: true,
          createdAt: new Date(Date.now() - 3600000).toISOString(),
          updatedAt: new Date(Date.now() - 3600000).toISOString(),
          items: [
            {
              id: '1',
              menuItemId: 'item1',
              itemName: 'Cappuccino',
              quantity: 2,
              unitPrice: 4.50,
              subtotal: 9.00,
              recipeVersion: 1,
              createdAt: new Date(Date.now() - 3600000).toISOString(),
            },
            {
              id: '2',
              menuItemId: 'item2',
              itemName: 'Latte',
              quantity: 1,
              unitPrice: 4.60,
              subtotal: 4.60,
              recipeVersion: 1,
              createdAt: new Date(Date.now() - 3600000).toISOString(),
            },
          ],
          branch: { id: 'cml46do4q0000ob5g27krklqe', branchName: 'Downtown' },
        },
      ];

      const filtered = sampleOrders.filter(
        (order) =>
          order.orderNumber.toString().includes(searchQuery) ||
          order.transactionHash.includes(searchQuery)
      );

      setOrders(filtered);
    } catch (error) {
      console.error('Failed to search orders:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          Receipt Search
        </CardTitle>
        <CardDescription>
          Search for orders to view and print receipts
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Search by order number or transaction ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full"></div>
          </div>
        )}

        {!loading && searchQuery.length >= 3 && orders.length === 0 && (
          <div className="text-center py-8 text-slate-400">
            No orders found matching "{searchQuery}"
          </div>
        )}

        {!loading && orders.length > 0 && (
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {orders.map((order) => (
              <div
                key={order.id}
                onClick={() => onOrderSelect(order)}
                className="p-4 border rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Receipt className="h-4 w-4 text-primary" />
                    <span className="font-semibold">Order #{order.orderNumber}</span>
                  </div>
                  <span className="text-sm text-slate-500">
                    {formatDate(order.orderTimestamp)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-600">
                      {order.cashier?.name || order.cashier?.username}
                    </span>
                    <span className="text-slate-400">•</span>
                    <span className="text-slate-600">
                      {order.branch?.branchName}
                    </span>
                  </div>
                  <span className="font-semibold">
                    {formatCurrency(order.totalAmount, currency)}
                  </span>
                </div>
                {order.isRefunded && (
                  <div className="mt-2 text-sm text-red-600 font-medium">
                    Refunded: {order.refundReason || 'No reason provided'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {!loading && searchQuery.length > 0 && searchQuery.length < 3 && (
          <div className="text-center py-8 text-slate-400">
            Type at least 3 characters to search
          </div>
        )}
      </CardContent>
    </Card>
  );
}
