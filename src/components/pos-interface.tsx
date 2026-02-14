'use client';

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  Coffee, Cake, Cookie, IceCream, Trash2, Plus, Minus, CreditCard, DollarSign,
  Printer, ShoppingCart, Store, X, CheckCircle, Package, Truck,
  Search, User, Clock, MapPin, Phone, Star, Flame, Zap,
  TrendingUp, AlertTriangle, Grid, Filter, Menu as MenuIcon,
  Sparkles, Bell, Layers, Wallet, Calendar, Barcode, Receipt, Utensils,
  ChevronRight, Tag, Gift
} from 'lucide-react';
import { useI18n } from '@/lib/i18n-context';
import { formatCurrency } from '@/lib/utils';
import { ReceiptViewer } from '@/components/receipt-viewer';
import CustomerSearch from '@/components/customer-search';
import { useOfflineData, offlineDataFetchers } from '@/hooks/use-offline-data';
import { useAutoSync } from '@/hooks/use-auto-sync';

// Helper function to create order offline
async function createOrderOffline(orderData: any, shift: any, cartItems: CartItem[]): Promise<any> {
  try {
    console.log('[Order] Creating order offline, orderData:', orderData);
    console.log('[Order] Cart items:', cartItems);

    // Import localStorageService
    const { localStorageService } = await import('@/lib/storage/local-storage');
    console.log('[Order] localStorageService imported');

    // Initialize storage if not already initialized
    await localStorageService.init();
    console.log('[Order] localStorageService initialized');

    // Create a temporary order ID (will be replaced on sync)
    const tempId = `temp-order-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    console.log('[Order] Created tempId:', tempId);

    // Get the last order number from local storage to generate a new one
    const allOrders = await localStorageService.getAllOrders();
    const lastOrderNum = allOrders.reduce((max: number, order: any) => {
      return order.orderNumber ? Math.max(max, order.orderNumber) : max;
    }, 0);

    // Prepare items in the format expected by the API
    const preparedItems = cartItems.map((cartItem) => {
      const unitPrice = cartItem.price || 0;
      const totalPrice = unitPrice * cartItem.quantity;

      return {
        menuItemId: cartItem.menuItemId,
        quantity: cartItem.quantity,
        menuItemVariantId: cartItem.variantId || null,
        unitPrice,
        totalPrice,
        specialInstructions: null,
      };
    });

    // Calculate total amount including tax
    const taxAmount = orderData.subtotal * (orderData.taxRate || 0.14);
    const totalAmount = orderData.total || (orderData.subtotal + taxAmount + (orderData.deliveryFee || 0) - (orderData.loyaltyDiscount || 0));

    // Create order object with fields matching API expectations
    const newOrder = {
      id: tempId,
      branchId: orderData.branchId,
      orderNumber: lastOrderNum + 1,
      customerId: orderData.customerId || null,
      orderType: orderData.orderType,
      totalAmount,
      status: 'completed',
      paymentStatus: 'paid',
      paymentMethod: orderData.paymentMethod,
      notes: orderData.notes || null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // Include shift ID to associate order with the shift
      shiftId: shift.id,
      // Store additional fields that will be synced separately
      _offlineData: {
        items: preparedItems,
        subtotal: orderData.subtotal,
        taxRate: orderData.taxRate,
        tax: taxAmount,
        deliveryFee: orderData.deliveryFee || 0,
        loyaltyPointsRedeemed: orderData.loyaltyPointsRedeemed || 0,
        loyaltyDiscount: orderData.loyaltyDiscount || 0,
        deliveryAddress: orderData.deliveryAddress || null,
        deliveryAreaId: orderData.deliveryAreaId || null,
        courierId: orderData.courierId || null,
        customerAddressId: orderData.customerAddressId || null,
        customerPhone: orderData.customerPhone || null,
        customerName: orderData.customerName || null,
      },
    };

    console.log('[Order] Created order object:', newOrder);

    // Save order to IndexedDB
    await localStorageService.saveOrder(newOrder);
    console.log('[Order] Order saved to IndexedDB');

    // Queue operation for sync
    await localStorageService.addOperation({
      type: 'CREATE_ORDER',
      data: {
        ...orderData,
        id: tempId,
        orderNumber: newOrder.orderNumber,
        status: newOrder.status,
        totalAmount,
        paymentStatus: 'paid',
        notes: newOrder.notes,
        items: preparedItems,
        createdAt: newOrder.createdAt,
        updatedAt: newOrder.updatedAt,
      },
      branchId: orderData.branchId,
      retryCount: 0,
    });
    console.log('[Order] Operation queued for sync');

    console.log('[Order] Order created offline successfully:', newOrder);
    return { order: newOrder, success: true };
  } catch (error) {
    console.error('[Order] Failed to create order offline, error:', error);
    throw error;
  }
}

interface CartItem {
  id: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
  variantName?: string;
  variantId?: string;
}

interface MenuItemVariant {
  id: string;
  menuItemId: string;
  variantTypeId: string;
  variantOptionId: string;
  priceModifier: number;
  sortOrder: number;
  isActive: boolean;
  variantType: {
    id: string;
    name: string;
  };
  variantOption: {
    id: string;
    name: string;
  };
}

interface MenuItem {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  price: number;
  isActive: boolean;
  hasVariants: boolean;
  imagePath?: string;
  variants?: MenuItemVariant[];
}

interface Category {
  id: string;
  name: string;
  description?: string | null;
  sortOrder: number;
  isActive: boolean;
  defaultVariantTypeId?: string | null;
}

export default function POSInterface() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [selectedBranch, setSelectedBranch] = useState<string>('');
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptData, setReceiptData] = useState<any>(null);
  const [lowStockAlerts, setLowStockAlerts] = useState<any[]>([]);
  const [currentShift, setCurrentShift] = useState<any>(null);
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [orderType, setOrderType] = useState<'dine-in' | 'take-away' | 'delivery'>('dine-in');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [deliveryArea, setDeliveryArea] = useState('');
  const [deliveryAreas, setDeliveryAreas] = useState<any[]>([]);
  const [selectedAddress, setSelectedAddress] = useState<any>(null);
  const [couriers, setCouriers] = useState<any[]>([]);
  const [selectedCourierId, setSelectedCourierId] = useState<string>('none');
  const [lastOrderNumber, setLastOrderNumber] = useState<number>(0);
  const [processing, setProcessing] = useState(false);

  // Loyalty redemption state
  const [redeemedPoints, setRedeemedPoints] = useState<number>(0);
  const [loyaltyDiscount, setLoyaltyDiscount] = useState<number>(0);

  // Variant selection dialog state
  const [variantDialogOpen, setVariantDialogOpen] = useState(false);
  const [selectedItemForVariant, setSelectedItemForVariant] = useState<MenuItem | null>(null);
  const [selectedVariant, setSelectedVariant] = useState<MenuItemVariant | null>(null);

  // Add New Address dialog state
  const [showAddAddressDialog, setShowAddAddressDialog] = useState(false);
  const [newAddress, setNewAddress] = useState({
    building: '',
    streetAddress: '',
    floor: '',
    apartment: '',
    deliveryAreaId: '',
  });
  const [creatingAddress, setCreatingAddress] = useState(false);

  const { currency, t } = useI18n();

  // Offline-capable data fetching
  const { data: categoriesData, loading: categoriesLoading } = useOfflineData(
    '/api/categories?active=true',
    {
      fetchFromDB: offlineDataFetchers.categories,
    }
  );

  const { data: menuItemsData, loading: menuItemsLoading, refetch: refetchMenuItems } = useOfflineData(
    '/api/menu-items?active=true&includeVariants=true',
    {
      fetchFromDB: offlineDataFetchers.menuItems,
    }
  );

  const { data: branchesData } = useOfflineData(
    '/api/branches',
    {
      fetchFromDB: offlineDataFetchers.branches,
    }
  );

  const { data: deliveryAreasData } = useOfflineData(
    '/api/delivery-areas',
    {
      fetchFromDB: offlineDataFetchers.deliveryAreas,
    }
  );

  const { data: couriersData } = useOfflineData(
    '',
    {
      fetchFromDB: offlineDataFetchers.couriers,
      enabled: !!user?.branchId,
      deps: [selectedBranch, user?.branchId, user?.role],
    }
  );

  // Update local state when data changes
  useEffect(() => {
    if (categoriesData && Array.isArray(categoriesData)) {
      setCategories(categoriesData);
    }
  }, [categoriesData]);

  useEffect(() => {
    if (menuItemsData && Array.isArray(menuItemsData)) {
      setMenuItems(menuItemsData);
      setLoading(false);
    } else if (!menuItemsLoading) {
      setLoading(false);
    }
  }, [menuItemsData, menuItemsLoading]);

  // Update branches from offline data
  useEffect(() => {
    if (branchesData) {
      const branchesList = Array.isArray(branchesData) 
        ? branchesData.map((branch: any) => ({
            id: branch.id,
            name: branch.branchName,
          }))
        : (branchesData.branches || []).map((branch: any) => ({
            id: branch.id,
            name: branch.branchName,
          }));
      setBranches(branchesList);
    }
  }, [branchesData]);

  // Update delivery areas from offline data
  useEffect(() => {
    if (deliveryAreasData) {
      const areas = Array.isArray(deliveryAreasData) 
        ? deliveryAreasData 
        : (deliveryAreasData.areas || []);
      setDeliveryAreas(areas);
    }
  }, [deliveryAreasData]);

  // Update couriers from offline data
  useEffect(() => {
    if (couriersData && user) {
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) {
        setCouriers([]);
        return;
      }
      const allCouriers = Array.isArray(couriersData) ? couriersData : [];
      const filtered = allCouriers.filter((c: any) => 
        c.branchId === branchId && c.isActive
      );
      setCouriers(filtered);
    }
  }, [couriersData, selectedBranch, user?.branchId, user?.role]);

  // Fetch branches (fallback if offline data not available)
  useEffect(() => {
    if (branchesData) return; // Already have data from offline hook

    const fetchBranches = async () => {
      try {
        const response = await fetch('/api/branches');
        const data = await response.json();
        if (response.ok && data.branches) {
          const branchesList = data.branches.map((branch: any) => ({
            id: branch.id,
            name: branch.branchName,
          }));
          setBranches(branchesList);
        }
      } catch (error) {
        console.error('Failed to fetch branches:', error);
      }
    };
    fetchBranches();
  }, [branchesData]);

  // Fetch delivery areas (fallback if offline data not available)
  useEffect(() => {
    if (deliveryAreasData) return; // Already have data from offline hook

    const fetchDeliveryAreas = async () => {
      try {
        const response = await fetch('/api/delivery-areas');
        const data = await response.json();
        if (response.ok && data.areas) {
          setDeliveryAreas(data.areas);
        }
      } catch (error) {
        console.error('Failed to fetch delivery areas:', error);
      }
    };
    fetchDeliveryAreas();
  }, [deliveryAreasData]);

  // Fetch couriers (fallback if offline data not available)
  useEffect(() => {
    if (couriersData) return; // Already have data from offline hook

    const fetchCouriers = async () => {
      try {
        const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
        if (!branchId) {
          setCouriers([]);
          return;
        }
        const response = await fetch(`/api/couriers?branchId=${branchId}`);
        const data = await response.json();
        if (response.ok && data.couriers) {
          setCouriers(data.couriers.filter((c: any) => c.isActive));
        }
      } catch (error) {
        console.error('Failed to fetch couriers:', error);
      }
    };
    fetchCouriers();
  }, [couriersData, selectedBranch, user?.branchId, user?.role]);

  // Load user on mount
  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      setUser(JSON.parse(userStr));
    }
  }, []);

  // Refresh shift when window/tab becomes visible
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && user?.role === 'CASHIER') {
        const fetchCurrentShift = async () => {
          try {
            const branchId = user.branchId;
            if (!branchId) {
              setCurrentShift(null);
              return;
            }
            const params = new URLSearchParams({
              branchId,
              cashierId: user.id,
              status: 'open',
            });
            const response = await fetch(`/api/shifts?${params.toString()}`);
            const data = await response.json();
            if (response.ok && data.shifts && data.shifts.length > 0) {
              setCurrentShift(data.shifts[0]);
            } else {
              setCurrentShift(null);
            }
          } catch (error) {
            console.error('Failed to refresh shift on tab visibility:', error);
          }
        };
        fetchCurrentShift();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [user, user?.branchId]);

  // Set default branch for admin
  useEffect(() => {
    if (user?.role === 'ADMIN' && branches.length > 0 && !selectedBranch) {
      setSelectedBranch(branches[0].id);
    }
  }, [user, branches, selectedBranch]);

  // Auto-sync when connection is restored
  const currentBranchId = user?.role === 'CASHIER' ? user?.branchId : selectedBranch;
  useAutoSync(currentBranchId);

  // Fetch current shift for cashiers
  useEffect(() => {
    const fetchCurrentShift = async () => {
      if (!user || user.role !== 'CASHIER') {
        setCurrentShift(null);
        return;
      }
      const branchId = user.role === 'CASHIER' ? user.branchId : selectedBranch;
      if (!branchId) {
        setCurrentShift(null);
        return;
      }
      try {
        const params = new URLSearchParams({
          branchId,
          cashierId: user.id,
          status: 'open',
        });
        const response = await fetch(`/api/shifts?${params.toString()}`);
        const data = await response.json();
        if (response.ok && data.shifts && data.shifts.length > 0) {
          setCurrentShift(data.shifts[0]);
        } else {
          // API failed or no shift found - check IndexedDB for offline shift
          const { localStorageService } = await import('@/lib/storage/local-storage');
          await localStorageService.init();
          const allShifts = await localStorageService.getAllShifts();
          
          // Find open shift for this cashier and branch
          const offlineShift = allShifts.find(
            (s: any) => 
              s.cashierId === user.id && 
              s.branchId === branchId && 
              !s.isClosed
          );
          
          if (offlineShift) {
            console.log('[POS] Using offline shift:', offlineShift);
            setCurrentShift(offlineShift);
          } else {
            setCurrentShift(null);
          }
        }
      } catch (error) {
        console.error('Failed to fetch current shift, trying offline:', error);
        
        // On error, check IndexedDB
        try {
          const { localStorageService } = await import('@/lib/storage/local-storage');
          await localStorageService.init();
          const allShifts = await localStorageService.getAllShifts();
          
          const offlineShift = allShifts.find(
            (s: any) => 
              s.cashierId === user.id && 
              s.branchId === branchId && 
              !s.isClosed
          );
          
          if (offlineShift) {
            setCurrentShift(offlineShift);
          } else {
            setCurrentShift(null);
          }
        } catch (dbError) {
          console.error('Failed to fetch offline shift:', dbError);
          setCurrentShift(null);
        }
      }
    };
    fetchCurrentShift();
  }, [user, user?.branchId, selectedBranch]);

  // Fetch low stock alerts
  useEffect(() => {
    const fetchLowStockAlerts = async () => {
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) {
        setLowStockAlerts([]);
        return;
      }
      try {
        const response = await fetch(`/api/inventory/low-stock?branchId=${branchId}`);
        const data = await response.json();
        if (response.ok && data.alerts) {
          setLowStockAlerts(data.alerts);
        }
      } catch (error) {
        console.error('Failed to fetch low stock alerts:', error);
      }
    };
    fetchLowStockAlerts();
  }, [selectedBranch, user?.branchId, user?.role]);

  // Auto-fill delivery info when address is selected
  useEffect(() => {
    if (selectedAddress) {
      const parts = [];
      if (selectedAddress.building) parts.push(selectedAddress.building);
      parts.push(selectedAddress.streetAddress);
      if (selectedAddress.floor) parts.push(`${selectedAddress.floor} Floor`);
      if (selectedAddress.apartment) parts.push(`Apt ${selectedAddress.apartment}`);
      setDeliveryAddress(parts.join(', '));
      if (selectedAddress.deliveryAreaId) {
        setDeliveryArea(selectedAddress.deliveryAreaId);
      }
    }
  }, [selectedAddress]);

  // Reset selected courier when order type changes
  useEffect(() => {
    if (orderType !== 'delivery') {
      setSelectedCourierId('none');
    }
  }, [orderType]);

  // Filter menu items by category and search
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      const matchesCategory = selectedCategory === 'all' || 
                            item.categoryId === selectedCategory ||
                            item.category === selectedCategory;
      const matchesSearch = searchQuery === '' || 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.category.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  const getCategoryColor = (categoryName: string): string => {
    const name = categoryName.toLowerCase();
    const colors = {
      coffee: 'from-amber-500 to-orange-600',
      hot: 'from-red-500 to-pink-600',
      ice: 'from-cyan-500 to-blue-600',
      cold: 'from-blue-500 to-indigo-600',
      cake: 'from-pink-500 to-rose-600',
      pastry: 'from-purple-500 to-violet-600',
      snack: 'from-yellow-500 to-amber-600',
      food: 'from-orange-500 to-red-600',
      bean: 'from-green-500 to-emerald-600',
    };
    for (const [key, color] of Object.entries(colors)) {
      if (name.includes(key)) return color;
    }
    return 'from-emerald-500 to-teal-600';
  };

  const allCategories = useMemo(() => {
    const cats = [
      { id: 'all', name: 'All Products', color: 'from-slate-600 to-slate-700' },
      ...categories.map(cat => ({
        id: cat.id,
        name: cat.name,
        color: getCategoryColor(cat.name),
      }))
    ];
    return cats;
  }, [categories]);

  const handleItemClick = (item: MenuItem) => {
    if (item.hasVariants && item.variants && item.variants.length > 0) {
      setSelectedItemForVariant(item);
      setSelectedVariant(null);
      setVariantDialogOpen(true);
    } else {
      addToCart(item, null);
    }
  };

  const addToCart = (item: MenuItem, variant: MenuItemVariant | null) => {
    const uniqueId = variant ? `${item.id}-${variant.id}` : item.id;
    const finalPrice = variant ? item.price + variant.priceModifier : item.price;
    const variantName = variant ? `${variant.variantType.name}: ${variant.variantOption.name}` : undefined;

    setCart((prevCart) => {
      const existingItem = prevCart.find((i) => i.id === uniqueId);
      if (existingItem) {
        return prevCart.map((i) =>
          i.id === uniqueId ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prevCart, {
        id: uniqueId,
        menuItemId: item.id,
        name: item.name,
        price: finalPrice,
        quantity: 1,
        variantName,
        variantId: variant?.id,
      }];
    });
  };

  const handleVariantConfirm = () => {
    if (selectedItemForVariant && selectedVariant) {
      addToCart(selectedItemForVariant, selectedVariant);
      setVariantDialogOpen(false);
      setSelectedItemForVariant(null);
      setSelectedVariant(null);
    }
  };

  const updateQuantity = (itemId: string, delta: number) => {
    setCart((prevCart) =>
      prevCart
        .map((item) =>
          item.id === itemId ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== itemId));
  };

  const clearCart = () => {
    setCart([]);
    setRedeemedPoints(0);
    setLoyaltyDiscount(0);
  };

  const getDeliveryFee = () => {
    if (orderType === 'delivery' && deliveryArea) {
      const area = deliveryAreas.find(a => a.id === deliveryArea);
      return area ? area.fee : 0;
    }
    return 0;
  };

  const subtotal = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const deliveryFee = getDeliveryFee();
  const total = subtotal + deliveryFee - loyaltyDiscount;
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  // Reset loyalty redemption when customer changes or cart is cleared
  useEffect(() => {
    setRedeemedPoints(0);
    setLoyaltyDiscount(0);
  }, [selectedAddress]);

  const handleRedeemPoints = () => {
    if (!selectedAddress || selectedAddress.loyaltyPoints === undefined) {
      alert('Please select a customer first');
      return;
    }

    const customerPoints = selectedAddress.loyaltyPoints || 0;
    if (customerPoints < 15) {
      alert('Customer needs at least 15 loyalty points to redeem');
      return;
    }

    // Calculate maximum redeemable points (multiples of 15)
    const maxRedeemable = Math.floor(customerPoints / 15) * 15;

    // Ask user how many points to redeem
    const pointsToRedeem = prompt(
      `Enter points to redeem (multiples of 15, max ${maxRedeemable}):`,
      maxRedeemable.toString()
    );

    if (!pointsToRedeem) return;

    const pointsToRedeemNum = parseInt(pointsToRedeem);

    // Validate the input
    if (isNaN(pointsToRedeemNum)) {
      alert('Please enter a valid number');
      return;
    }

    if (pointsToRedeemNum < 15) {
      alert('Minimum 15 points required for redemption');
      return;
    }

    if (pointsToRedeemNum > customerPoints) {
      alert(`Customer only has ${customerPoints} points available`);
      return;
    }

    if (pointsToRedeemNum % 15 !== 0) {
      alert('Points must be redeemed in multiples of 15');
      return;
    }

    // Set the redemption
    setRedeemedPoints(pointsToRedeemNum);
    setLoyaltyDiscount(pointsToRedeemNum); // 1 point = 1 EGP discount
  };

  const handleClearRedemption = () => {
    setRedeemedPoints(0);
    setLoyaltyDiscount(0);
  };

  const handleAddAddress = async () => {
    if (!selectedAddress) return;

    if (!newAddress.streetAddress.trim()) {
      alert('Please enter a street address');
      return;
    }

    setCreatingAddress(true);
    try {
      const response = await fetch(`/api/customers/${selectedAddress.customerId}/addresses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          building: newAddress.building || null,
          streetAddress: newAddress.streetAddress,
          floor: newAddress.floor || null,
          apartment: newAddress.apartment || null,
          deliveryAreaId: newAddress.deliveryAreaId || null,
          isDefault: false,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        alert(data.error || 'Failed to add address');
        setCreatingAddress(false);
        return;
      }

      // Get the created address
      if (data.address) {
        const newAddressObj: Address = {
          id: data.address.id,
          customerId: data.address.customerId,
          customerName: selectedAddress.customerName,
          customerPhone: selectedAddress.customerPhone,
          building: data.address.building,
          streetAddress: data.address.streetAddress,
          floor: data.address.floor,
          apartment: data.address.apartment,
          deliveryAreaId: data.address.deliveryAreaId,
          orderCount: 0,
          isDefault: data.address.isDefault,
          loyaltyPoints: selectedAddress.loyaltyPoints,
        };

        // Auto-select the new address
        setSelectedAddress(newAddress);
        setShowAddAddressDialog(false);

        // Reset form
        setNewAddress({
          building: '',
          streetAddress: '',
          floor: '',
          apartment: '',
          deliveryAreaId: '',
        });
      }
    } catch (error) {
      console.error('Add address error:', error);
      alert('Failed to add address. Please try again.');
    } finally {
      setCreatingAddress(false);
    }
  };

  const handlePrint = () => {
    if (receiptData) {
      setShowReceipt(true);
    }
  };

  const handleCheckout = async (paymentMethod: 'cash' | 'card') => {
    if (cart.length === 0) return;

    // For cashiers, check if they have an active shift
    if (user?.role === 'CASHIER' && !currentShift) {
      alert('Please open a shift in the Shifts tab before processing sales.');
      return;
    }

    // Validate branch selection for admin
    if (user?.role === 'ADMIN' && !selectedBranch) {
      alert('Please select a branch to process this sale');
      return;
    }

    setProcessing(true);

    try {
      const branchId = user?.role === 'ADMIN' ? selectedBranch : user?.branchId;
      if (!branchId) {
        alert('Branch not found. Please contact administrator.');
        return;
      }

      // Prepare order items with variant info
      const orderItems = cart.map(item => ({
        menuItemId: item.menuItemId,
        quantity: item.quantity,
        menuItemVariantId: item.variantId || null,
      }));

      // Validate delivery fields
      if (orderType === 'delivery') {
        if (!deliveryArea) {
          alert('Please select a delivery area for delivery orders.');
          setProcessing(false);
          return;
        }
        if (!deliveryAddress.trim()) {
          alert('Please enter a delivery address for delivery orders.');
          setProcessing(false);
          return;
        }
      }

      const orderData: any = {
        branchId,
        orderType,
        items: orderItems,
        subtotal,
        taxRate: 0.14,
        total,
        paymentMethod,
        cashierId: user?.id,
      };

      // Add shiftId to order data
      orderData.shiftId = currentShift?.id;

      // Add customer data for all order types (not just delivery)
      if (selectedAddress) {
        orderData.customerId = selectedAddress.customerId;
        orderData.customerAddressId = selectedAddress.id;
        if (selectedAddress.customerPhone) {
          orderData.customerPhone = selectedAddress.customerPhone;
        }
        if (selectedAddress.customerName) {
          orderData.customerName = selectedAddress.customerName;
        }

        // Add loyalty redemption if points are being redeemed
        if (redeemedPoints > 0) {
          orderData.loyaltyPointsRedeemed = redeemedPoints;
          orderData.loyaltyDiscount = loyaltyDiscount;
        }
      }

      // Add delivery-specific fields
      if (orderType === 'delivery') {
        orderData.deliveryAddress = deliveryAddress;
        orderData.deliveryAreaId = deliveryArea;
        orderData.deliveryFee = deliveryFee;
        if (selectedCourierId && selectedCourierId !== 'none') {
          orderData.courierId = selectedCourierId;
        }
      }

      console.log('Order data prepared:', orderData);

      // Check actual network connectivity before trying API
      let isActuallyOnline = navigator.onLine;

      if (navigator.onLine) {
        // Verify with actual network request
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          await fetch('/api/branches', {
            method: 'HEAD',
            signal: controller.signal,
            cache: 'no-store',
          });
          clearTimeout(timeoutId);
          isActuallyOnline = true;
          console.log('[Order] Network check passed, trying API...');
        } catch (netError) {
          console.log('[Order] Network check failed, assuming offline:', netError.message);
          isActuallyOnline = false;
        }
      }

      if (isActuallyOnline) {
        // Try API first
        const response = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(orderData),
        });

        const data = await response.json();

        if (response.ok && data.success) {
          setReceiptData(data.order);
          setLastOrderNumber(data.order.orderNumber);
          clearCart();
          setShowReceipt(true);
          setDeliveryAddress('');
          setDeliveryArea('');
          setSelectedCourierId('none');
          // Clear customer selection for all order types
          setSelectedAddress(null);
          // Clear loyalty redemption
          setRedeemedPoints(0);
          setLoyaltyDiscount(0);
        } else {
          // API failed - check if it's a network error
          const isNetworkError = !response.ok && (
            response.status === 0 || // Network error
            response.type === 'error' ||
            response.statusText === 'Failed to fetch' ||
            data.error?.includes('Failed to fetch') ||
            data.error?.includes('network') ||
            data.error?.includes('ENOTFOUND') ||
            data.error?.includes('ERR_NAME_NOT_RESOLVED') ||
            data.error?.includes('TypeError') ||
            data.error?.includes('Failed to fetch\n') ||
            data.error?.includes('net::ERR_NAME_NOT_RESOLVED')
          );

          if (isNetworkError) {
            console.log('[Order] Network error detected (API), trying offline mode');
            try {
              const result = await createOrderOffline(orderData, currentShift, cart);
              setReceiptData(result.order);
              setLastOrderNumber(result.order.orderNumber);
              clearCart();
              setShowReceipt(true);
              setDeliveryAddress('');
              setDeliveryArea('');
              setSelectedCourierId('none');
              setSelectedAddress(null);
              setRedeemedPoints(0);
              setLoyaltyDiscount(0);
              alert('Order created (offline mode - will sync when online)');
            } catch (offlineError) {
              console.error('[Order] Offline order creation failed:', offlineError);
              throw new Error(`Failed to create order offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
            }
          } else {
            console.error('Order creation failed:', {
              status: response.status,
              data,
              orderData,
            });
            const errorMessage = data.error || data.details || 'Failed to create order';
            if (data.errorName || data.details) {
              console.error('Error details:', {
                name: data.errorName,
                details: data.details,
              });
            }
            throw new Error(errorMessage);
          }
        }
      } else {
        // Offline mode - create order locally
        console.log('[Order] Offline mode detected, creating order locally');
        try {
          const result = await createOrderOffline(orderData, currentShift, cart);
          setReceiptData(result.order);
          setLastOrderNumber(result.order.orderNumber);
          clearCart();
          setShowReceipt(true);
          setDeliveryAddress('');
          setDeliveryArea('');
          setSelectedCourierId('none');
          setSelectedAddress(null);
          setRedeemedPoints(0);
          setLoyaltyDiscount(0);
          alert('Order created (offline mode - will sync when online)');
        } catch (offlineError) {
          console.error('[Order] Offline order creation failed:', offlineError);
          throw new Error(`Failed to create order offline: ${offlineError instanceof Error ? offlineError.message : String(offlineError)}`);
        }
      }
    } catch (error) {
      console.error('Checkout error:', error);
      alert(error instanceof Error ? error.message : 'Failed to process order');
    } finally {
      setProcessing(false);
    }
  };

  // If no user, show loading
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 via-slate-100 to-slate-200 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 overflow-hidden">
      {/* Left Sidebar - Modern Categories */}
      <div className="hidden md:flex flex-col w-72 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-800/50 shadow-2xl">
        {/* Logo/Brand Section */}
        <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/20 dark:to-teal-950/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/30 ring-1 ring-emerald-500/20">
              <Store className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="font-bold text-xl text-slate-900 dark:text-white tracking-tight">Emperor</h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium tracking-wide uppercase">POS System</p>
            </div>
          </div>
        </div>

        {/* Categories Section */}
        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-200/50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-800/30">
            <h2 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest flex items-center gap-2">
              <Filter className="h-3 w-3" />
              Categories
            </h2>
          </div>
          
          <ScrollArea className="flex-1 px-4 py-4">
            <div className="space-y-2">
              {allCategories.map((category) => {
                const isActive = selectedCategory === category.id;
                return (
                  <button
                    key={category.id}
                    onClick={() => {
                      setSelectedCategory(category.id);
                      setSearchQuery('');
                    }}
                    className={`w-full group relative overflow-hidden rounded-2xl p-4 text-left transition-all duration-300 ${
                      isActive
                        ? 'bg-gradient-to-r shadow-lg shadow-emerald-500/20 ring-1 ring-emerald-500/30'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                    }`}
                    style={isActive ? { background: `linear-gradient(to right, var(--tw-gradient-stops))`, '--tw-gradient-from': `var(--color-${category.color.split('-')[0]}-500)`, '--tw-gradient-to': `var(--color-${category.color.split('-')[2]}-600)` } as React.CSSProperties : {}}
                  >
                    <div className={`bg-gradient-to-r ${category.color} absolute inset-0 opacity-0 ${isActive ? 'opacity-100' : ''} transition-opacity duration-300`} />
                    
                    <div className="relative flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <span className={`font-semibold text-sm block truncate transition-colors ${
                          isActive ? 'text-white' : 'text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-white'
                        }`}>
                          {category.name}
                        </span>
                        {category.id !== 'all' && (
                          <span className={`text-xs mt-1 block font-medium transition-colors ${
                            isActive ? 'text-white/80' : 'text-slate-400 dark:text-slate-500'
                          }`}>
                            {menuItems.filter(m => m.categoryId === category.id || m.category === categories.find(c => c.id === category.id)?.name).length} items
                          </span>
                        )}
                      </div>
                      
                      {isActive ? (
                        <div className="w-6 h-6 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center flex-shrink-0 ml-2">
                          <CheckCircle className="h-3.5 w-3.5 text-white" />
                        </div>
                      ) : (
                        <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors flex-shrink-0 ml-2" />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </ScrollArea>
        </div>

        {/* Low Stock Alert */}
        {lowStockAlerts.length > 0 && (
          <div className="p-4 border-t border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/30">
                <AlertTriangle className="h-4 w-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-0.5">Low Stock Alert</p>
                <p className="text-xs text-amber-600 dark:text-amber-500">
                  {lowStockAlerts.length} {lowStockAlerts.length === 1 ? 'item' : 'items'} running low
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Center - Menu Items */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Modern Top Bar */}
        <div className="flex-shrink-0 px-6 py-4 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-slate-800/50 shadow-sm">
          <div className="flex items-center gap-4">
            {/* Enhanced Search */}
            <div className="flex-1 relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md" />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-hover:text-emerald-500 transition-colors z-10" />
              <Input
                type="text"
                placeholder="Search products, categories..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-12 bg-slate-100/80 dark:bg-slate-800/80 border-0 focus:ring-2 focus:ring-emerald-500/50 rounded-xl transition-all relative z-0"
              />
            </div>
            
            {/* Order Type Toggle - Pill Style */}
            <div className="flex bg-slate-100/80 dark:bg-slate-800/80 rounded-2xl p-1.5 border border-slate-200/50 dark:border-slate-700/50">
              {(['dine-in', 'take-away', 'delivery'] as const).map((type) => {
                const icons = {
                  'dine-in': <Utensils className="h-3.5 w-3.5" />,
                  'take-away': <Package className="h-3.5 w-3.5" />,
                  'delivery': <Truck className="h-3.5 w-3.5" />,
                };
                return (
                  <button
                    key={type}
                    onClick={() => setOrderType(type)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold transition-all duration-200 ${
                      orderType === type
                        ? 'bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 shadow-md'
                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-200/50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    {icons[type]}
                    {type === 'dine-in' && 'Dine In'}
                    {type === 'take-away' && 'Take Away'}
                    {type === 'delivery' && 'Delivery'}
                  </button>
                );
              })}
            </div>

            {/* Branch Selector for Admin */}
            {user?.role === 'ADMIN' && (
              <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                <SelectTrigger className="w-44 h-12 bg-slate-100/80 dark:bg-slate-800/80 border-0 focus:ring-2 focus:ring-emerald-500/50 rounded-xl">
                  <SelectValue placeholder="Select Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Modern Products Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <div className="relative">
                  <div className="animate-spin h-12 w-12 border-4 border-emerald-500/30 border-t-emerald-500 rounded-full mx-auto mb-4" />
                  <div className="absolute inset-0 animate-pulse bg-emerald-500/10 rounded-full" />
                </div>
                <p className="text-slate-600 dark:text-slate-400 font-medium">Loading menu...</p>
              </div>
            </div>
          ) : filteredMenuItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400">
              <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-4">
                <Search className="h-10 w-10 opacity-40" />
              </div>
              <p className="text-lg font-semibold text-slate-600 dark:text-slate-400 mb-1">No products found</p>
              <p className="text-sm">Try adjusting your search or category filter</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredMenuItems.map((item) => {
                const categoryColor = getCategoryColor(item.category);
                return (
                  <Card
                    key={item.id}
                    onClick={() => handleItemClick(item)}
                    className="group cursor-pointer border-0 bg-white dark:bg-slate-900 rounded-3xl overflow-hidden shadow-sm hover:shadow-2xl hover:shadow-emerald-500/10 transition-all duration-500 transform hover:-translate-y-1"
                  >
                    {/* Modern Product Image/Icon Section */}
                    <div className="aspect-[4/3] bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 to-slate-850 relative overflow-hidden">
                      {/* Animated Gradient Background */}
                      <div className={`absolute inset-0 bg-gradient-to-br ${categoryColor} opacity-0 group-hover:opacity-10 transition-all duration-500`} />
                      
                      {/* Decorative Pattern */}
                      <div className="absolute inset-0 opacity-5">
                        <div className="absolute top-4 right-4 w-20 h-20 border-2 border-slate-300 dark:border-slate-600 rounded-full" />
                        <div className="absolute bottom-4 left-4 w-16 h-16 border-2 border-slate-300 dark:border-slate-600 rounded-full" />
                      </div>

                      {/* Icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Coffee className="h-16 w-16 text-slate-200 dark:text-slate-700 group-hover:scale-110 transition-transform duration-500" />
                      </div>
                      
                      {/* Category Tag */}
                      <div className="absolute top-3 left-3">
                        <Badge 
                          variant="secondary" 
                          className="bg-white/95 dark:bg-slate-700/95 backdrop-blur-sm text-xs font-semibold px-3 py-1.5 rounded-full shadow-md border border-slate-100 dark:border-slate-600"
                        >
                          {item.category}
                        </Badge>
                      </div>

                      {/* Variants Badge */}
                      {item.hasVariants && (
                        <div className="absolute top-3 right-3">
                          <div className={`bg-gradient-to-br ${categoryColor} text-white text-xs font-bold px-2.5 py-1.5 rounded-full shadow-lg flex items-center gap-1.5`}>
                            <Layers className="h-3 w-3" />
                            <span>{item.variants?.length || 0}</span>
                          </div>
                        </div>
                      )}

                      {/* Add Button - Modern Overlay */}
                      <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-slate-900/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex flex-col items-center justify-end pb-6">
                        <Button 
                          className={`bg-gradient-to-r ${categoryColor} hover:opacity-90 text-white rounded-full px-6 py-2.5 shadow-xl shadow-emerald-500/30 transform translate-y-4 group-hover:translate-y-0 transition-all duration-300 font-semibold`}
                        >
                          <Plus className="h-4 w-4 mr-2" />
                          Add to Order
                        </Button>
                      </div>
                    </div>
                    
                    {/* Product Info */}
                    <CardContent className="p-4 bg-gradient-to-b from-white to-slate-50 dark:from-slate-900 dark:to-slate-800">
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <h3 className="font-bold text-base text-slate-900 dark:text-white leading-tight line-clamp-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                          {item.name}
                        </h3>
                      </div>
                      
                      <div className="flex items-center justify-between">
                        <div className="flex items-baseline gap-1">
                          <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                            {formatCurrency(item.price, currency)}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                          <Tag className="h-3 w-3" />
                          <span className="text-xs font-medium">ID: {item.id.slice(0, 6)}</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right Sidebar - Cart */}
      <div className="hidden lg:flex flex-col h-full w-[440px] bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-l border-slate-200/50 dark:border-slate-800/50 shadow-2xl">
        {/* Cart Header */}
        <div className="p-6 border-b border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-r from-slate-50 to-slate-100/50 dark:from-slate-800/50 dark:to-slate-850/50">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
                <ShoppingCart className="h-5 w-5 text-white" />
              </div>
              <h2 className="text-xl font-bold text-slate-900 dark:text-white">Current Order</h2>
            </div>
            <Badge variant="outline" className="bg-white dark:bg-slate-700 text-emerald-600 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800 font-semibold px-3 py-1.5 rounded-full">
              {totalItems} {totalItems === 1 ? 'item' : 'items'}
            </Badge>
          </div>
          {lastOrderNumber > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 ml-13">
              <Receipt className="h-3 w-3" />
              Last Order: <span className="font-semibold text-slate-700 dark:text-slate-300">#{lastOrderNumber}</span>
            </div>
          )}
        </div>

        {/* Cart Items */}
        <div className="flex-1 min-h-0 overflow-hidden">
          <ScrollArea className="h-full p-4">
            {cart.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8">
                <div className="w-20 h-20 bg-slate-100 dark:bg-slate-800 rounded-3xl flex items-center justify-center mb-4">
                  <ShoppingCart className="h-10 w-10 opacity-40" />
                </div>
                <p className="text-sm font-semibold text-slate-600 dark:text-slate-400 mb-1">Cart is empty</p>
                <p className="text-xs">Add items to start order</p>
              </div>
            ) : (
              <div className="space-y-3">
                {cart.map((item) => (
                <div
                  key={item.id}
                  className="group bg-gradient-to-br from-white to-slate-50 dark:from-slate-800 dark:to-slate-850 rounded-2xl p-4 border border-slate-200/50 dark:border-slate-700/50 hover:border-emerald-300 dark:hover:border-emerald-700/50 hover:shadow-lg hover:shadow-emerald-500/5 transition-all duration-300"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1 min-w-0 pr-3">
                      <h4 className="font-bold text-sm text-slate-900 dark:text-white mb-1.5 line-clamp-2 leading-snug">
                        {item.name}
                      </h4>
                      {item.variantName && (
                        <div className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 text-xs font-semibold px-2 py-1 rounded-lg">
                          <Layers className="h-3 w-3" />
                          {item.variantName}
                        </div>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/50 flex-shrink-0 rounded-xl transition-all"
                      onClick={() => removeFromCart(item.id)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 transition-all"
                        onClick={() => updateQuantity(item.id, -1)}
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <span className="w-11 text-center font-bold text-lg text-slate-900 dark:text-white">
                        {item.quantity}
                      </span>
                      <Button
                        variant="outline"
                        size="icon"
                        className="h-9 w-9 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700 transition-all"
                        onClick={() => updateQuantity(item.id, 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(item.price * item.quantity, currency)}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        {formatCurrency(item.price, currency)} each
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        </div>

        {/* Customer Section - Available for All Order Types */}
        <div className="p-5 border-t border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-br from-emerald-50/80 to-teal-50/80 dark:from-emerald-950/20 dark:to-teal-950/20">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <User className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-700 dark:text-emerald-400">Customer</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Link customer to earn loyalty points</p>
            </div>
          </div>
          <CustomerSearch
            onAddressSelect={setSelectedAddress}
            selectedAddress={selectedAddress}
            deliveryAreas={deliveryAreas}
            branchId={user?.role === 'ADMIN' ? selectedBranch : user?.branchId}
          />
          {selectedAddress && (
            <div className="space-y-3">
              <div className="p-3 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <span className="text-slate-700 dark:text-slate-300">
                      <strong>{selectedAddress.customerName}</strong> - {selectedAddress.customerPhone}
                    </span>
                  </div>
                  <Button
                    onClick={() => setShowAddAddressDialog(true)}
                    size="sm"
                    variant="outline"
                    className="text-emerald-600 hover:bg-emerald-50 border-emerald-200 dark:border-emerald-800 dark:hover:bg-emerald-950/50 text-emerald-700 dark:text-emerald-400"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add Address
                  </Button>
                </div>
              </div>

              {/* Loyalty Redemption Section */}
              {redeemedPoints === 0 && selectedAddress.loyaltyPoints !== undefined && selectedAddress.loyaltyPoints >= 15 && (
                <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                      <div>
                        <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">
                          {selectedAddress.loyaltyPoints.toFixed(0)} pts available
                        </p>
                        <p className="text-xs text-purple-600 dark:text-purple-400">
                          Redeem 15 pts = 15 EGP off
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleRedeemPoints}
                      size="sm"
                      className="bg-purple-600 hover:bg-purple-700 text-white"
                    >
                      <Gift className="h-4 w-4 mr-2" />
                      Redeem Points
                    </Button>
                  </div>
                </div>
              )}

              {/* Active Redemption Display */}
              {redeemedPoints > 0 && (
                <div className="p-3 bg-green-50 dark:bg-green-950/30 rounded-xl border border-green-200 dark:border-green-800">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="text-sm font-bold text-green-700 dark:text-green-300">
                          {redeemedPoints} pts redeemed
                        </p>
                        <p className="text-xs text-green-600 dark:text-green-400">
                          Discount: {formatCurrency(loyaltyDiscount, currency)}
                        </p>
                      </div>
                    </div>
                    <Button
                      onClick={handleClearRedemption}
                      size="sm"
                      variant="outline"
                      className="text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950/50"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Delivery Section - Only for Delivery Orders */}
        {orderType === 'delivery' && (
          <div className="p-5 border-t border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-br from-amber-50/80 to-orange-50/80 dark:from-amber-950/20 dark:to-orange-950/20">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-amber-400 to-orange-500 rounded-xl flex items-center justify-center shadow-lg shadow-amber-500/30">
                <Truck className="h-4 w-4 text-white" />
              </div>
              <h3 className="text-sm font-bold text-amber-700 dark:text-amber-400">Delivery Information</h3>
            </div>
            <div className="space-y-3">
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Delivery Address</Label>
                <Textarea
                  value={deliveryAddress}
                  onChange={(e) => setDeliveryAddress(e.target.value)}
                  placeholder="Enter full delivery address..."
                  rows={2}
                  className="text-sm mt-1.5 resize-none rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Delivery Area</Label>
                <Select value={deliveryArea} onValueChange={setDeliveryArea}>
                  <SelectTrigger className="text-sm h-10 mt-1.5 rounded-xl">
                    <SelectValue placeholder="Select area" />
                  </SelectTrigger>
                  <SelectContent>
                    {deliveryAreas.map((area) => (
                      <SelectItem key={area.id} value={area.id}>
                        {area.name} ({formatCurrency(area.fee, currency)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {couriers.length > 0 && (
                <div>
                  <Label className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wide">Assign Courier</Label>
                  <Select value={selectedCourierId} onValueChange={setSelectedCourierId}>
                    <SelectTrigger className="text-sm h-10 mt-1.5 rounded-xl">
                      <SelectValue placeholder="Select courier (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No courier assigned</SelectItem>
                      {couriers.map((courier: any) => (
                        <SelectItem key={courier.id} value={courier.id}>
                          {courier.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Order Summary */}
        <div className="p-6 border-t border-slate-200/50 dark:border-slate-800/50 bg-gradient-to-t from-slate-50/80 to-white dark:from-slate-800/80 dark:to-slate-900">
          <div className="space-y-3 mb-5">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Subtotal</span>
              <span className="font-bold text-slate-900 dark:text-white">
                {formatCurrency(subtotal, currency)}
              </span>
            </div>
            {deliveryFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-600 dark:text-slate-400 font-medium">Delivery</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {formatCurrency(deliveryFee, currency)}
                </span>
              </div>
            )}
            {loyaltyDiscount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-purple-600 dark:text-purple-400 font-medium">Loyalty Discount ({redeemedPoints} pts)</span>
                <span className="font-bold text-purple-600 dark:text-purple-400">
                  -{formatCurrency(loyaltyDiscount, currency)}
                </span>
              </div>
            )}
            <Separator className="bg-slate-200 dark:bg-slate-700 my-3" />
            <div className="flex justify-between items-center">
              <span className="text-lg font-bold text-slate-900 dark:text-white">Total</span>
              <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                {formatCurrency(total, currency)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              onClick={() => handleCheckout('cash')}
              disabled={processing || cart.length === 0}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white shadow-xl shadow-emerald-500/30 font-bold h-12 text-base rounded-xl transition-all hover:shadow-emerald-500/40"
            >
              <DollarSign className="h-4.5 w-4.5 mr-2" />
              Cash
            </Button>
            <Button
              onClick={() => handleCheckout('card')}
              disabled={processing || cart.length === 0}
              variant="outline"
              className="border-2 border-slate-300 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-400 dark:hover:border-slate-600 font-bold h-12 text-base rounded-xl transition-all"
            >
              <CreditCard className="h-4.5 w-4.5 mr-2" />
              Card
            </Button>
          </div>
        </div>
      </div>

      {/* Variant Selection Dialog */}
      <Dialog open={variantDialogOpen} onOpenChange={setVariantDialogOpen}>
        <DialogContent className="sm:max-w-[520px] rounded-3xl">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                <Layers className="h-5 w-5 text-white" />
              </div>
              <DialogTitle className="text-xl font-bold">Select Variant</DialogTitle>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 pl-13">
              Choose an option for <span className="font-semibold text-slate-900 dark:text-white">{selectedItemForVariant?.name}</span>
            </p>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {selectedItemForVariant?.variants?.map((variant) => {
              const finalPrice = selectedItemForVariant.price + variant.priceModifier;
              return (
                <button
                  key={variant.id}
                  type="button"
                  onClick={() => setSelectedVariant(variant)}
                  className={`w-full p-4 border-2 rounded-2xl text-left transition-all duration-300 group hover:shadow-lg ${
                    selectedVariant?.id === variant.id
                      ? 'border-emerald-500 bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-950/30 dark:to-teal-950/30 shadow-lg shadow-emerald-500/10'
                      : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <div className="font-bold text-slate-900 dark:text-white mb-1.5 text-base">
                        {variant.variantType.name}: {variant.variantOption.name}
                      </div>
                      {variant.priceModifier !== 0 && (
                        <div className={`inline-flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1 rounded-lg ${
                          variant.priceModifier > 0 
                            ? 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-400' 
                            : 'bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-400'
                        }`}>
                          {variant.priceModifier > 0 ? <Plus className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
                          {formatCurrency(Math.abs(variant.priceModifier), currency)}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end ml-4">
                      <div className="font-black text-xl text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(finalPrice, currency)}
                      </div>
                      {selectedVariant?.id === variant.id && (
                        <div className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 text-xs font-bold mt-1">
                          <CheckCircle className="h-3 w-3" />
                          Selected
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          <DialogFooter className="gap-3">
            <Button 
              variant="outline" 
              onClick={() => setVariantDialogOpen(false)}
              className="rounded-xl h-11 px-6 font-semibold"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleVariantConfirm}
              disabled={!selectedVariant}
              className="bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 rounded-xl h-11 px-6 font-semibold shadow-lg shadow-emerald-500/30"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add to Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add New Address Dialog */}
      <Dialog open={showAddAddressDialog} onOpenChange={setShowAddAddressDialog}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Add New Address</DialogTitle>
            <DialogDescription>
              Add a new delivery address for {selectedAddress?.customerName}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="building">Building (Optional)</Label>
              <Input
                id="building"
                value={newAddress.building}
                onChange={(e) => setNewAddress(prev => ({ ...prev, building: e.target.value }))}
                placeholder="Building name/number"
              />
            </div>
            <div>
              <Label htmlFor="streetAddress">Street Address *</Label>
              <Input
                id="streetAddress"
                value={newAddress.streetAddress}
                onChange={(e) => setNewAddress(prev => ({ ...prev, streetAddress: e.target.value }))}
                placeholder="Street address"
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="floor">Floor (Optional)</Label>
                <Input
                  id="floor"
                  value={newAddress.floor}
                  onChange={(e) => setNewAddress(prev => ({ ...prev, floor: e.target.value }))}
                  placeholder="Floor"
                />
              </div>
              <div>
                <Label htmlFor="apartment">Apartment (Optional)</Label>
                <Input
                  id="apartment"
                  value={newAddress.apartment}
                  onChange={(e) => setNewAddress(prev => ({ ...prev, apartment: e.target.value }))}
                  placeholder="Apt #"
                />
              </div>
            </div>
            <div>
              <Label htmlFor="deliveryArea">Delivery Area</Label>
              <Select value={newAddress.deliveryAreaId} onValueChange={(value) => setNewAddress(prev => ({ ...prev, deliveryAreaId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select delivery area" />
                </SelectTrigger>
                <SelectContent>
                  {deliveryAreas.map((area) => (
                    <SelectItem key={area.id} value={area.id}>
                      {area.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-3 pt-4">
              <Button
                variant="outline"
                onClick={() => setShowAddAddressDialog(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={handleAddAddress}
                disabled={creatingAddress}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {creatingAddress ? 'Adding...' : 'Add Address'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Receipt Viewer */}
      <ReceiptViewer
        open={showReceipt}
        onClose={() => setShowReceipt(false)}
        order={receiptData}
      />
    </div>
  );
}
