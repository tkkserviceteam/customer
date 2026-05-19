'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { InsertCustomerInput } from '@/types/customer';
import { taiwanDistricts } from '@/lib/taiwanDistricts';

interface CustomerLog {
  id: string;
  operator: string;
  action_type: string;
  customer_name: string;
  details: string;
  created_at: string;
}

interface ExtendedInsertInput extends InsertCustomerInput {
  status: '在職' | '離職';
  mobile: string;
}

export default function CustomerPage() {
  const router = useRouter();
  
  // --- 1. 所有狀態統一在最上方宣告 ---
  const [customers, setCustomers] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [isMounted, setIsMounted] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [operatorName, setOperatorName] = useState('');
  const [logs, setLogs] = useState<CustomerLog[]>([]);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);
  const [activeLineId, setActiveLineId] = useState<string | null>(null);
  
  // 供電腦版表格使用的折疊展開狀態
  const [expandedCustomerIds, setExpandedCustomerIds] = useState<Record<string, boolean>>({});

  const [isPwdModalOpen, setIsPwdModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdUpdating, setPwdUpdating] = useState(false);

  const [isLogPanelOpen, setIsLogPanelOpen] = useState(false);
  const logPanelRef = useRef<HTMLDivElement>(null);

  // 限制每頁顯示 5 筆，電腦表格與手機卡片同步連動
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 5;

  // 手機版滑動控制 Ref 與 Index 紀錄
  const [currentMobileIndex, setCurrentMobileIndex] = useState(0);
  const mobileContainerRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState<ExtendedInsertInput>({
    company_name: '', facility_name: '', facility_floor: '',
    contact_name: '', title: '', phone: '', extension: '',
    line_id: '', email: '', address: '', notes: '',
    status: '在職', mobile: ''
  });

  const [city, setCity] = useState('');
  const [dist, setDist] = useState('');
  const [detailAddress, setDetailAddress] = useState('');

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_TIMEOUT_DURATION = 10 * 60 * 1000;

  // --- 2. 核心函式頂層宣告（確保 TypeScript 100% 找得到） ---
  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data: fetchRes, error: fetchErr } = await supabase.from('customers').select('*').order('company_name', { ascending: true });
      if (fetchErr) throw fetchErr;
      setCustomers(fetchRes || []);
    } catch (error) {
      console.error('讀取資料失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const { data: logRes, error: logErr } = await supabase.from('customer_logs').select('*').order('created_at', { ascending: false }).limit(5);
      if (logErr) throw logErr;
      setLogs(logRes || []);
    } catch (error) {
      console.error('撈取日誌失敗:', error);
    }
  };

  const updateAuthState = (session: any) => {
    setIsAdmin(!!session);
    if (session?.user?.email) {
      setOperatorName(session.user.email.split('@')[0]);
    } else {
      setOperatorName('');
    }
  };

  const handleAutoLogout = async () => {
    await supabase.auth.signOut();
    setIsAdmin(false);
    setOperatorName('');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    alert('偵測到您已超過 10 分鐘未操作系統，後台管理權限已自動安全登出。');
    router.refresh();
  };

  const resetIdleTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (isAdmin) {
      timeoutRef.current = setTimeout(() => { handleAutoLogout(); }, IDLE_TIMEOUT_DURATION);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    alert('已安全登出後台管理身分。');
    setIsAdmin(false);
    setOperatorName('');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    router.refresh();
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  // 🧠 核心位置修正：將修改密碼功能移至全局頂層，澈底排除 Cannot find name 的變數作用域阻斷
  const handleUpdatePassword = async (newE: React.FormEvent) => {
    newE.preventDefault();
    if (newPassword.length < 6) {
      alert('資安防護提示：新密碼長度不可少於 6 位數。');
      return;
    }
    if (newPassword !== confirmPassword) {
      alert('密碼變更失敗：兩次輸入的新密碼不一致，請重新檢查。');
      return;
    }

    try {
      setPwdUpdating(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      alert(`密碼變更成功！新密碼已即刻生效。`);
      setIsPwdModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      alert(`密碼變更失敗：${error.message}`);
    } finally {
      setPwdUpdating(false);
    }
  };

  // --- 3. 副作用處理 ---
  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      updateAuthState(session);
      
      const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => { 
        updateAuthState(session); 
      });

      await fetchCustomers();
      await fetchLogs();
      setIsMounted(true);

      return () => {
        subscription.unsubscribe();
      };
    };
    checkAuthAndFetch();

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll'];
    activityEvents.forEach(event => { window.addEventListener(event, resetIdleTimeout); });
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      activityEvents.forEach(event => { window.removeEventListener(event, resetIdleTimeout); });
    };
  }, [isAdmin]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, showArchived]);

  // --- 4. 業務方法邏輯 ---
  const formatMobileDisplay = (num: string) => {
    if (!num) return '--';
    const clean = num.replace(/\D/g, '');
    if (clean.length === 10) {
      return `${clean.slice(0, 4)}-${clean.slice(4, 7)}-${clean.slice(7)}`;
    }
    return num;
  };

  const formatPhoneDisplay = (num: string) => {
    if (!num) return '';
    const clean = num.replace(/\D/g, '');
    if (clean.startsWith('02') || clean.startsWith('03') || clean.startsWith('04') || clean.startsWith('05') || clean.startsWith('06') || clean.startsWith('07') || clean.startsWith('08')) {
      if (clean.length === 9) {
        return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
      } else if (clean.length === 10) {
        return `${clean.slice(0, 2)}-${clean.slice(2, 6)}-${clean.slice(6)}`;
      }
    }
    if (clean.length >= 9 && (clean.startsWith('037') || clean.startsWith('049') || clean.startsWith('082') || clean.startsWith('089'))) {
      return `${clean.slice(0, 3)}-${clean.slice(3, 6)}-${clean.slice(6)}`;
    }
    return num;
  };

  const toggleRowExpand = (id: string) => {
    setExpandedCustomerIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCity(e.target.value);
    setDist('');
  };

  const handleVcfImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const orgMatch = text.match(/ORG:(.*?)(?:\r?\n|;)/);
      const fnMatch = text.match(/FN:(.*?)(?:\r?\n|;)/);
      const emailMatch = text.match(/EMAIL(?:;.*?):(.*)/);
      const titleMatch = text.match(/TITLE:(.*?)(?:\r?\n|;)/);

      const mobileMatch = text.match(/TEL;[^:\n]*?CELL[^:\n]*?:([\d\- ]+)/i) || text.match(/TEL;[^:\n]*?TYPE=cell[^:\n]*?:([\d\- ]+)/i);
      const phoneMatch = text.match(/TEL;[^:\n]*?WORK[^:\n]*?:([\d\- ]+)/i) || text.match(/TEL;[^:\n]*?TYPE=work[^:\n]*?:([\d\- ]+)/i) || text.match(/TEL:(.*?)(?:\r?\n)/);

      setFormData((prev) => ({
        ...prev,
        company_name: orgMatch ? orgMatch[1].trim() : prev.company_name,
        contact_name: fnMatch ? fnMatch[1].trim() : prev.contact_name,
        mobile: mobileMatch ? mobileMatch[1].trim().replace(/[- ]/g, '') : prev.mobile,
        phone: phoneMatch ? phoneMatch[1].trim().replace(/[- ]/g, '') : prev.phone,
        email: emailMatch ? emailMatch[1].trim() : prev.email,
        title: titleMatch ? titleMatch[1].trim() : prev.title,
        status: '在職'
      }));

      alert('vCard (.vcf) 電子名片解析完成！資訊已自動歸格。');
      e.target.value = '';
    };
    reader.readAsText(file);
  };

  const handleOpenCreateModal = () => {
    setEditingCustomerId(null);
    setFormData({ company_name: '', facility_name: '', facility_floor: '', contact_name: '', title: '', phone: '', extension: '', line_id: '', email: '', address: '', notes: '', status: '在職', mobile: '' });
    setCity(''); setDist(''); setDetailAddress('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (customer: any) => {
    setEditingCustomerId(customer.id);
    setFormData({ 
      company_name: customer.company_name, 
      facility_name: customer.facility_name || '', 
      facility_floor: customer.facility_floor || '', 
      contact_name: customer.contact_name, 
      title: customer.title || '', 
      phone: customer.phone || '', 
      extension: customer.extension || '', 
      line_id: customer.line_id || '', 
      email: customer.email || '', 
      address: customer.address || '', 
      notes: customer.notes || '',
      status: customer.status || '在職',
      mobile: customer.mobile || ''
    });

    let foundCity = ''; let foundDist = ''; let foundDetail = customer.address || '';
    if (customer.address) {
      for (const cityName of Object.keys(taiwanDistricts)) {
        if (customer.address.startsWith(cityName)) {
          foundCity = cityName;
          for (const distName of taiwanDistricts[cityName]) {
            if (customer.address.startsWith(cityName + distName)) {
              foundDist = distName; foundDetail = customer.address.replace(cityName + distName, '');
              break;
            }
          }
          break;
        }
      }
    }
    setCity(foundCity); setDist(foundDist); setDetailAddress(foundDetail);
    setIsModalOpen(true);
  };

  const writeLog = async (actionType: string, customerName: string, details: string) => {
    try {
      const { error } = await supabase.from('customer_logs').insert([{ operator: operatorName || '訪客', action_type: actionType, customer_name: customerName, details: details }]);
      if (error) throw error;
      await fetchLogs();
    } catch (error: any) {
      alert(`日誌寫入失敗: ${error.message}`);
    }
  };

  const handleDeleteCustomer = async (id: string, name: string, company: string) => {
    if (!confirm(`確定要將客戶「${name}」的通訊資料徹底從資料庫中刪除嗎？`)) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      alert('資料已成功刪除！');
      await writeLog('刪除', company, `移成了聯絡窗口: ${name}`);
      await fetchCustomers();
    } catch (error) {
      alert('刪除失敗，權限被拒絕。');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.mobile) {
      const cleanedMobile = formData.mobile.replace(/[- ]/g, '');
      const mobileRegex = /^09\d{8}$/;
      
      if (!mobileRegex.test(cleanedMobile)) {
        alert(`❌ 行動電話格式錯誤：\n必須為 09 開頭且剛好「10 碼純數字」！\n(您目前輸入了 ${cleanedMobile.length} 碼，請檢查是否少填或多填)`);
        return;
      }
      formData.mobile = cleanedMobile;
    }

    try {
      setIsSubmitting(true);
      const fullAddress = city ? `${city}${dist}${detailAddress}` : detailAddress;
      const finalData = { ...formData, address: fullAddress === '' ? null : fullAddress };
      const cleanedData = Object.fromEntries(Object.entries(finalData).map(([key, value]) => [key, value === '' ? null : value]));

      if (editingCustomerId) {
        const { error } = await supabase.from('customers').update(cleanedData).eq('id', editingCustomerId);
        if (error) throw error;
        alert('客戶資料更新成功！');
        await writeLog('編輯', formData.company_name, `修改了窗口 ${formData.contact_name} 的通訊錄資料`);
      } else {
        const { error } = await supabase.from('customers').insert([cleanedData]);
        if (error) throw error;
        alert('客戶資料新增成功！');
        await writeLog('新增', formData.company_name, `建立了新窗口: ${formData.contact_name}`);
      }
      setIsModalOpen(false);
      await fetchCustomers();
    } catch (error) {
      alert('儲存失敗，請檢查管理員登入權限。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMobileScroll = () => {
    if (mobileContainerRef.current) {
      const { scrollLeft, clientWidth } = mobileContainerRef.current;
      if (clientWidth > 0) {
        const index = Math.round(scrollLeft / clientWidth);
        if (index !== currentMobileIndex) {
          setCurrentMobileIndex(index);
        }
      }
    }
  };

  // --- 5. 過濾與範圍切片計算 ---
  const filteredCustomers = customers.filter((customer) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = (
      customer.company_name?.toLowerCase().includes(search) ||
      customer.facility_name?.toLowerCase().includes(search) ||
      customer.contact_name?.toLowerCase().includes(search) ||
      customer.title?.toLowerCase().includes(search) ||
      customer.address?.toLowerCase().includes(search) ||
      customer.mobile?.toLowerCase().includes(search)
    );
    const isArchived = customer.status === '離職';
    if (isAdmin) return matchesSearch;
    if (!isAdmin && !showArchived && isArchived) return false;
    return matchesSearch;
  });

  const totalPages = Math.ceil(filteredCustomers.length / ITEMS_PER_PAGE) || 1;
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedCustomers = filteredCustomers.slice(startIndex, startIndex + ITEMS_PER_PAGE);

  if (!isMounted) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm font-bold bg-white text-slate-600" suppressHydrationWarning={true}>
        系統初始化安全驗證中...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 md:p-12 pb-32 overflow-x-hidden font-sans select-none" suppressHydrationWarning={true}>
      <div className="max-w-7xl mx-auto">
        
        {/* Top Title Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8 border-b border-slate-200 pb-6">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-wide text-black">客戶通訊錄管理系統</h1>
            <div className="text-xs md:text-sm mt-1 flex flex-wrap items-center gap-2">
              {isAdmin ? (
                <>
                  <span className="text-blue-700 font-bold font-mono">🟢 歡迎管理員 [{operatorName}] 登入模式 (10分閒置安全防護中)</span>
                  <button 
                    onClick={() => setIsPwdModalOpen(true)}
                    className="text-[11px] bg-white text-amber-700 border border-slate-400 px-2 py-0.5 rounded hover:bg-slate-100 transition-colors font-mono font-semibold shadow-2xs"
                  >
                    🔐 修改密碼
                  </button>
                </>
              ) : (
                <span className="text-slate-600 font-medium">🔵 訪客唯讀模式</span>
              )}
            </div>
          </div>
          <div className="flex gap-2 md:gap-3">
            {isAdmin ? (
              <>
                <button onClick={handleOpenCreateModal} className="flex-1 md:flex-initial bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 text-sm md:text-base rounded-lg font-bold shadow transition-colors tracking-wide">+ 新增客戶</button>
                <button onClick={handleLogout} className="flex-1 md:flex-initial bg-white border border-slate-400 text-slate-700 hover:bg-slate-100 px-4 py-2 text-sm md:text-base rounded-lg font-bold shadow transition-colors">安全登出</button>
              </>
            ) : (
              <button onClick={() => router.push('/login')} className="w-full md:w-auto bg-white hover:bg-slate-100 text-slate-800 border border-slate-400 px-4 py-2 text-sm md:text-base rounded-lg font-bold shadow transition-colors">管理員登入</button>
            )}
          </div>
        </div>

        {/* 工具列區塊 */}
        <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <input 
            type="text" 
            placeholder="搜尋 company、廠區、聯絡人..." 
            value={searchTerm} 
            onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} 
            className="w-full md:w-96 px-4 py-2 bg-white border border-slate-400 rounded-lg text-black focus:outline-none focus:ring-2 focus:ring-blue-600 font-medium placeholder-slate-500 shadow-2xs text-[16px]" 
          />
          
          {!isAdmin && (
            <label className="flex items-center gap-2 text-xs md:text-sm text-slate-800 font-bold cursor-pointer select-none bg-white border border-slate-400 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors shadow-2xs">
              <input type="checkbox" checked={showArchived} onChange={(e) => { setShowArchived(e.target.checked); setCurrentPage(1); }} className="rounded bg-slate-100 border-slate-400 text-blue-600 focus:ring-0 w-4 h-4" />
              <span>顯示已離職窗口人員</span>
            </label>
          )}
        </div>

        {/* 資料呈現區區塊 */}
        <div className="w-full">
          {/* 1. Desktop View */}
          <div className="hidden md:block bg-white border border-slate-300 rounded-xl overflow-hidden shadow-sm">
            {filteredCustomers.length === 0 ? (
              <div className="text-center py-12 text-slate-500 font-bold">找不到客戶資料</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 text-slate-800 text-sm font-bold tracking-wide">
                      <th className="p-4 w-24">現況</th>
                      <th className="p-4 cursor-pointer hover:text-black select-none">Company / 廠區 / 樓層 (點擊展開)</th>
                      <th className="p-4">聯絡人 / 職稱</th>
                      <th className="p-4">行動電話 (手機)</th>
                      <th className="p-4">聯絡電話 (分機)</th>
                      <th className="p-4">Line ID</th>
                      {isAdmin && <th className="p-4 text-center w-32">操作</th>}
                    </tr>
                  </thead>
                  {paginatedCustomers.map((customer) => {
                    const isLeft = customer.status === '離職';
                    const isExpanded = !!expandedCustomerIds[customer.id];
                    return (
                      <tbody key={customer.id} className="divide-y divide-slate-300 text-sm font-medium text-slate-900 border-b border-slate-200">
                        <tr className={`transition-colors ${isLeft ? 'bg-slate-100/80 opacity-50' : 'hover:bg-slate-50'}`}>
                          <td className="p-4 whitespace-nowrap">
                            <span className={`px-2 py-0.5 text-xs font-bold rounded-md ${isLeft ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'} border`}>
                              {customer.status || '在職'}
                            </span>
                          </td>
                          <td className="p-4 cursor-pointer select-none group" onClick={() => toggleRowExpand(customer.id)}>
                            <div className="flex items-center gap-2">
                              <span className={`text-xs text-slate-400 group-hover:text-blue-600 transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-600' : ''}`}>▶</span>
                              <div className={`font-bold ${isLeft ? 'text-slate-500' : 'text-black group-hover:text-blue-600 transition-colors'}`}>{customer.company_name}</div>
                            </div>
                            <div className="text-xs text-slate-600 font-bold mt-0.5 ml-4 font-mono">{customer.facility_name || '--'} {customer.facility_floor ? `(${customer.facility_floor}F)` : ''}</div>
                          </td>
                          <td className="p-4">
                            <div className={`font-bold ${isLeft ? 'text-slate-500' : 'text-slate-900'}`}>{customer.contact_name}</div>
                            <div className="text-xs text-slate-600 font-semibold mt-0.5">{customer.title || '--'}</div>
                          </td>
                          <td className="p-4 text-blue-700 font-mono font-bold tracking-wide">
                            {!isLeft && customer.mobile ? <a href={`tel:${customer.mobile}`} className="hover:text-blue-600 hover:underline transition-colors">{formatMobileDisplay(customer.mobile)}</a> : <span className="text-slate-400">{formatMobileDisplay(customer.mobile)}</span>}
                          </td>
                          <td className="p-4 text-slate-900 font-mono font-medium">
                            {!isLeft && customer.phone ? <a href={`tel:${customer.phone}`} className="text-blue-700 hover:text-blue-600 hover:underline transition-colors">{formatPhoneDisplay(customer.phone)}{customer.extension ? ` #${customer.extension}` : ''}</a> : <span className="text-gray-400">{formatPhoneDisplay(customer.phone) || '--'}</span>}
                          </td>
                          <td className="p-4 font-mono font-semibold">
                            {!isLeft && customer.line_id ? <button onClick={() => setActiveLineId(customer.line_id)} className="text-emerald-700 hover:text-emerald-600 hover:underline flex items-center gap-1 font-bold transition-colors"><span>{customer.line_id}</span><span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-300 px-1.5 py-0.2 rounded font-bold">QR</span></button> : <span className="text-slate-400">{customer.line_id || '--'}</span>}
                          </td>
                          {isAdmin && (
                            <td className="p-4 text-center space-x-2 whitespace-nowrap text-xs font-bold">
                              <button onClick={() => handleOpenEditModal(customer)} className="text-amber-700 hover:text-amber-600 transition-colors">編輯</button>
                              <span className="text-slate-300">|</span>
                              <button onClick={() => handleDeleteCustomer(customer.id, customer.contact_name, customer.company_name)} className="text-red-600 hover:text-red-400 transition-colors">刪除</button>
                            </td>
                          )}
                        </tr>
                        {isExpanded && (
                          <tr className="bg-slate-100/50 animate-in fade-in slide-in-from-top-2 duration-200">
                            <td colSpan={isAdmin ? 7 : 6} className="p-4 border-l-2 border-blue-600">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm text-slate-900 font-semibold">
                                <div className="space-y-2 text-xs">
                                  <h4 className="text-[11px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-300 pb-1">詳細聯絡資訊</h4>
                                  <div><span className="text-slate-500 font-bold mr-2">電子郵件:</span>{customer.email ? <a href={`mailto:${customer.email}`} className="text-blue-700 font-bold hover:underline">{customer.email}</a> : <span className="text-slate-400">未提供</span>}</div>
                                  <div><span className="text-slate-500 font-bold mr-2">公司地址:</span>{customer.address ? (
                                    <a href={`http://maps.google.com/?q=${encodeURIComponent(customer.address.split(/[\s\(\（]/)[0])}`} target="_blank" rel="noopener noreferrer" className="text-blue-700 font-bold hover:underline inline-flex items-center gap-1">
                                      {customer.address}
                                      <span className="text-[10px] bg-purple-100 text-purple-800 border border-purple-300 px-1 rounded font-bold">地圖</span>
                                    </a>
                                  ) : <span className="text-slate-400">未提供</span>}</div>
                                </div>
                                <div className="space-y-2">
                                  <h4 className="text-[11px] font-bold tracking-wider text-slate-400 uppercase border-b border-slate-300 pb-1">備註說明</h4>
                                  <div className="bg-white p-3 rounded-lg border border-slate-300 text-slate-900 font-mono text-xs shadow-2xs leading-relaxed font-medium">{customer.notes || '暫無額外備註說明資訊。'}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </tbody>
                    );
                  })}
                </table>
              </div>
            )}
          </div>

          {/* 2. Mobile View */}
          <div className="block md:hidden relative w-full overflow-hidden">
            <div 
              ref={mobileContainerRef}
              onScroll={handleMobileScroll}
              className="flex flex-row flex-nowrap overflow-x-auto snap-x snap-mandatory scrollbar-none w-full pb-2 touch-pan-x"
              style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
            >
              {paginatedCustomers.length === 0 ? (
                <div className="bg-white border border-slate-300 rounded-xl p-12 text-center text-slate-500 font-bold w-full max-w-full snap-start snap-always shrink-0 shadow-2xs min-h-[350px] flex flex-col items-center justify-center">
                  <div className="text-2xl mb-2">🔍</div>
                  <div>找不到符合的客戶資料</div>
                </div>
              ) : (
                paginatedCustomers.map((customer) => {
                  const isLeft = customer.status === '離職';
                  return (
                    <div 
                      key={customer.id} 
                      className="bg-white border border-slate-300 rounded-xl p-4 shadow-2xs space-y-3 w-full max-w-full snap-start snap-always shrink-0 min-h-[420px] h-auto flex flex-col justify-between transition-all"
                    >
                      <div className="space-y-3">
                        <div className="flex justify-between items-start border-b border-slate-200 pb-2">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className={`px-1.5 py-0.2 text-[10px] font-bold rounded ${isLeft ? 'bg-rose-100 text-rose-800 border border-rose-300' : 'bg-emerald-100 text-emerald-800 border border-emerald-300'} border font-mono`}>{customer.status || '在職'}</span>
                              <div className="text-base font-bold text-black">{customer.company_name}</div>
                            </div>
                            <div className="text-xs text-slate-600 font-bold mt-1 ml-0.5">{customer.facility_name || '無特定廠區'} {customer.facility_floor ? ` • ${customer.facility_floor}F` : ''}</div>
                          </div>
                          {isAdmin && (
                            <div className="flex gap-1.5 text-xs shrink-0">
                              <button onClick={() => handleOpenEditModal(customer)} className="text-amber-800 font-bold bg-amber-50 px-2 py-1 rounded border border-amber-300">編輯</button>
                              <button onClick={() => handleDeleteCustomer(customer.id, customer.contact_name, customer.company_name)} className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded border border-red-200">刪除</button>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-sm bg-slate-50 p-2.5 rounded-lg font-semibold">
                          <div><span className="text-xs text-slate-500 block mb-0.5">聯絡窗口</span><span className="text-black font-bold">{customer.contact_name}</span></div>
                          <div><span className="text-xs text-slate-500 block mb-0.5">職稱</span><span className="text-slate-800 font-mono">{customer.title || '--'}</span></div>
                        </div>

                        <div className="text-xs space-y-1 bg-slate-50 p-2 rounded-lg font-mono font-bold">
                          {customer.mobile && <div><span className="text-blue-700">手機：</span>{formatMobileDisplay(customer.mobile)}</div>}
                          {customer.phone && <div><span className="text-slate-700">總機：</span>{formatPhoneDisplay(customer.phone)}{customer.extension ? ` #${customer.extension}` : ''}</div>}
                        </div>

                        <div className="pt-2 border-t border-slate-150 space-y-2 text-xs font-semibold">
                          <div>
                            <span className="text-slate-400 block mb-0.5 font-mono">Email：</span>
                            {customer.email ? <a href={`mailto:${customer.email}`} className="text-blue-700 font-bold underline break-all">{customer.email}</a> : <span className="text-slate-400 font-medium">未提供</span>}
                          </div>
                          <div>
                            <span className="text-slate-400 block mb-0.5 font-mono">完整地址：</span>
                            <div className="text-slate-800 leading-relaxed font-bold">{customer.address || '未提供公司地址'}</div>
                          </div>
                          <div>
                            <span className="text-slate-400 block mb-0.5 font-mono">備註說明：</span>
                            <div className="bg-white p-2 rounded border border-slate-200 text-slate-700 text-[11px] whitespace-pre-wrap leading-normal shadow-2xs font-medium min-h-[50px]">{customer.notes || '暫無備註資訊'}</div>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-100 font-mono text-[11px] font-bold mt-2">
                        {!isLeft && customer.mobile ? <a href={`tel:${customer.mobile}`} className="bg-blue-600 hover:bg-blue-700 text-white text-center py-2 rounded-lg transition-colors shadow-2xs"><span>撥打手機</span></a> : <div className="bg-slate-100 text-slate-400 border border-slate-200 text-center py-2 rounded-lg flex items-center justify-center">無手機</div>}
                        {!isLeft && customer.phone ? <a href={`tel:${customer.phone}`} className="bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 text-center py-2 rounded-lg shadow-2xs"><span>總機分機</span></a> : <div className="bg-slate-100 text-slate-400 border border-slate-200 text-center py-2 rounded-lg flex items-center justify-center">無總機</div>}
                        {!isLeft && customer.line_id ? <button onClick={() => setActiveLineId(customer.line_id)} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 text-center py-2 rounded-lg shadow-2xs"><span>LINE</span></button> : <div className="bg-slate-100 text-slate-400 border border-slate-200 text-center py-2 rounded-lg flex items-center justify-center">無 LINE</div>}
                        {customer.address ? (
                          <a href={`http://maps.google.com/?q=${encodeURIComponent(customer.address.split(/[\s\(\環境]/)[0])}`} target="_blank" rel="noopener noreferrer" className="bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-300 text-slate-200 rounded-lg shadow-2xs text-center py-2"><span>導航</span></a>
                        ) : <div className="bg-slate-100 text-slate-400 border border-slate-200 text-center py-2 rounded-lg flex items-center justify-center">無地址</div>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* 手機版 5 筆分頁指示點 */}
            {!loading && paginatedCustomers.length > 0 && (
              <div className="flex flex-col items-center justify-center mt-2 select-none">
                <div className="flex justify-center items-center gap-1.5 flex-wrap max-w-full px-4">
                  {paginatedCustomers.map((_, idx) => (
                    <span 
                      key={idx}
                      className={`h-1.5 rounded-full transition-all duration-200 ${idx === currentMobileIndex ? 'w-4 bg-blue-600' : 'w-1.5 bg-slate-300'}`}
                    />
                  ))}
                </div>
                <div className="text-center text-[10px] text-slate-500 font-mono font-bold mt-1">
                  ◀ 左右滑動瀏覽本頁資料 (目前: {currentMobileIndex + 1} / {paginatedCustomers.length}) ▶
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 跨平台共用導航分頁列（每頁 5 筆） */}
        {!loading && filteredCustomers.length > 0 && (
          <div className="bg-white border border-slate-300 rounded-xl px-4 py-3.5 flex flex-col sm:flex-row items-center justify-between text-slate-700 font-mono text-xs select-none gap-3 shadow-2xs mt-4">
            <div>
              顯示第 <span className="font-bold text-slate-900">{startIndex + 1}</span> 至 <span className="font-bold text-slate-900">{Math.min(startIndex + ITEMS_PER_PAGE, filteredCustomers.length)}</span> 筆，共 <span className="font-bold text-slate-900">{filteredCustomers.length}</span> 筆客戶資料
            </div>
            <div className="flex items-center gap-1 flex-wrap justify-center">
              <button onClick={() => setCurrentPage(1)} disabled={currentPage === 1} className="px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors disabled:opacity-40 font-bold text-[11px] sm:text-xs">≪ 首頁</button>
              <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors disabled:opacity-40 font-bold text-[11px] sm:text-xs">＜ 上頁</button>
              <span className="px-2 sm:px-4 font-bold text-slate-900 text-[11px] sm:text-xs">頁碼 {currentPage} / {totalPages}</span>
              <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors disabled:opacity-40 font-bold text-[11px] sm:text-xs">下頁 ＞</button>
              <button onClick={() => setCurrentPage(totalPages)} disabled={currentPage === totalPages} className="px-2 py-1 bg-white border border-slate-300 rounded hover:bg-slate-100 transition-colors disabled:opacity-40 font-bold text-[11px] sm:text-xs">末頁 ≫</button>
            </div>
          </div>
        )}

      </div>

      {/* 中央彈出視窗 (Modal) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white border border-slate-300 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200 text-black font-semibold">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-100">
              <h2 className="text-lg font-bold text-slate-900 tracking-wide">{editingCustomerId ? '修改客戶通訊資料' : '新增客戶通訊資料'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700 transition-colors text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 max-h-[80vh] overflow-y-auto text-slate-900 text-[16px]">
              
              {!editingCustomerId && (
                <div className="bg-slate-50 border border-dashed border-slate-400 rounded-xl p-3 md:p-4 space-y-2">
                  <div className="text-xs font-bold text-blue-700 tracking-wider">⚡ 管理員電子名片快捷匯入</div>
                  <div className="bg-white p-2.5 rounded-lg border border-slate-300 text-xs shadow-2xs">
                    <input type="file" accept=".vcf" onChange={handleVcfImport} className="w-full text-[11px] text-slate-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-blue-50 file:text-blue-600 hover:file:bg-blue-100 cursor-pointer" />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2"><label className="block text-xs font-bold text-slate-600 mb-1">Company *</label><input type="text" name="company_name" required value={formData.company_name} onChange={handleInputChange} placeholder="e.g. TSMC" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none text-[16px] focus:ring-2 focus:ring-blue-600" /></div>
                <div><label className="block text-xs font-bold text-slate-600 mb-1">Facility</label><input type="text" name="facility_name" value={formData.facility_name || ''} onChange={handleInputChange} placeholder="e.g. 中科廠" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none text-[16px] focus:ring-2 focus:ring-blue-600" /></div>
                <div><label className="block text-xs font-bold text-slate-600 mb-1">Floor</label><input type="text" name="facility_floor" value={formData.facility_floor || ''} onChange={handleInputChange} placeholder="e.g. 3" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none text-[16px] focus:ring-2 focus:ring-blue-600" /></div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-bold text-slate-600 mb-1">Contact Name *</label><input type="text" name="contact_name" required value={formData.contact_name} onChange={handleInputChange} placeholder="Name" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none text-[16px] focus:ring-2 focus:ring-blue-600" /></div>
                <div><label className="block text-xs font-bold text-slate-600 mb-1">Title</label><input type="text" name="title" value={formData.title || ''} onChange={handleInputChange} placeholder="Title" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none text-[16px] focus:ring-2 focus:ring-blue-600" /></div>
                <div>
                  <label className="block text-xs font-bold text-blue-700 mb-1">現況 *</label>
                  <select name="status" value={formData.status} onChange={handleInputChange} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold text-[16px] focus:outline-none focus:ring-2 focus:ring-blue-600">
                    <option value="InService">🟢 在職 </option>
                    <option value="Left">🔴 離職 </option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-blue-700 mb-1">行動電話 (手機)</label>
                  <input type="text" name="mobile" value={formData.mobile || ''} onChange={handleInputChange} placeholder="e.g. 0912345678" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-blue-700 font-bold tracking-wide focus:outline-none focus:ring-2 focus:ring-blue-600 text-[16px]" />
                </div>
                <div className="md:col-span-1">
                  <label className="block text-xs font-bold text-slate-600 mb-1">公司電話 (總機)</label>
                  <input type="text" name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="033123456" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none text-[16px] focus:ring-2 focus:ring-blue-600" />
                </div>
                <div><label className="block text-xs font-bold text-slate-600 mb-1">Ext.</label><input type="text" name="extension" value={formData.extension || ''} onChange={handleInputChange} placeholder="Ext" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none text-[16px] focus:ring-2 focus:ring-blue-600" /></div>
                <div><label className="block text-xs font-bold text-slate-600 mb-1">Line ID</label><input type="text" name="line_id" value={formData.line_id || ''} onChange={handleInputChange} placeholder="Line ID" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-bold focus:outline-none text-[16px] focus:ring-2 focus:ring-blue-600" /></div>
              </div>

              <div><label className="block text-xs font-bold text-slate-600 mb-1">Email</label><input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none text-[16px] focus:ring-2 focus:ring-blue-600" /></div>
              
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-600">Address</label>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div><select value={city} onChange={handleCityChange} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none text-[16px]"><option value="">選擇縣市</option>{Object.keys(taiwanDistricts).map((c) => (<option key={c} value={c}>{c}</option>))}</select></div>
                  <div><select value={dist} disabled={!city} onChange={(e) => setDist(e.target.value)} className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none text-[16px] disabled:opacity-40"><option value="">選擇區域</option>{city && taiwanDistricts[city].map((d) => (<option key={d} value={d}>{d}</option>))}</select></div>
                  <div><input type="text" value={detailAddress} onChange={(e) => setDetailAddress(e.target.value)} placeholder="詳細路名..." className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-800 focus:outline-none text-[16px]" /></div>
                </div>
              </div>
              <div><label className="block text-xs font-bold text-slate-600 mb-1">Notes</label><textarea name="notes" rows={5} value={formData.notes || ''} onChange={handleInputChange} placeholder="Notes..." className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-slate-900 font-medium focus:outline-none resize-none font-mono text-[16px] leading-relaxed" /></div>
              <div className="pt-4 border-t border-slate-200 flex justify-end gap-3 bg-slate-50 px-6 py-3 -mx-6 -mb-6">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-white border border-slate-400 text-slate-800 rounded-lg font-bold text-sm hover:bg-slate-100">取消</button>
                <button type="submit" disabled={isSubmitting} className="px-5 py-2 bg-blue-600 text-white rounded-lg font-bold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors shadow-2xs">確認更新</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LINE QR Code */}
      {activeLineId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs">
          <div className="w-full max-w-xs bg-white border border-slate-200 rounded-xl p-6 text-center shadow-2xl font-bold text-black">
            <h3 className="text-lg font-bold text-slate-900 mb-1 tracking-wide font-mono">LINE QR CODE</h3>
            <p className="text-xs text-blue-700 font-bold mb-4 font-mono">ID: <span className="select-all">{activeLineId}</span></p>
            <div className="bg-slate-50 p-3 rounded-lg inline-block mb-4 border border-slate-200">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`https://line.me/R/ti/p/~${activeLineId}`)}`} alt="Line QR Code" width={180} height={180} className="mx-auto" />
            </div>
            <p className="text-xs text-slate-400 mb-5">請使用手機 LINE 應用程式掃描</p>
            <button onClick={() => setActiveLineId(null)} className="w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg font-bold border border-slate-300 text-xs font-mono transition-colors">CLOSE</button>
          </div>
        </div>
      )}

      {/* 📊 最近變更紀錄智慧抽屜籤 */}
      <div ref={logPanelRef} className="fixed bottom-4 right-4 z-40 flex flex-col items-end font-sans font-bold">
        {isLogPanelOpen ? (
          <div className="w-80 bg-white border border-slate-300 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-slate-900">
            <div className="bg-slate-100 px-4 py-2.5 border-b border-slate-300 flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 tracking-wider">📊 最近變更紀錄</span>
              <button onClick={() => setIsLogPanelOpen(false)} className="text-slate-500 hover:text-black text-xs font-bold p-1">✕</button>
            </div>
            <div className="p-4 space-y-4 max-h-64 overflow-y-auto text-xs">
              {logs.length === 0 ? (
                <div className="text-center py-6 text-slate-500 tracking-wider font-bold">暫無變更紀錄</div>
              ) : (
                <div className="relative border-l border-slate-200 space-y-4 pl-3.5 ml-1">
                  {logs.map((log) => (
                    <div key={log.id} className="relative group">
                      <span className="absolute -left-[19.5px] top-1.5 w-1.5 h-1.5 rounded-full bg-slate-400 group-hover:bg-blue-600 transition-colors"></span>
                      <div className="flex items-center gap-1.5 text-slate-500 text-[11px] font-semibold">
                        <span className="text-slate-600">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        <span>|</span>
                        <span className="font-bold text-slate-900 truncate max-w-[160px]" title={log.customer_name}>{log.customer_name}</span>
                      </div>
                      <p className="text-slate-800 text-[11px] mt-0.5 leading-relaxed break-all font-bold">[{log.action_type}] {log.details}</p>
                      <div className="text-[10px] text-slate-500 text-right mt-0.5 font-medium">User: {log.operator}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : (
          <button
            onClick={() => setIsLogPanelOpen(true)}
            className="px-4 h-10 bg-white hover:bg-slate-100 text-slate-900 border border-slate-400 rounded-full flex items-center gap-2 shadow-md transition-all hover:scale-102 active:scale-98 text-xs font-bold select-none group relative tracking-wider"
          >
            <span>📊</span>
            <span>最近變更紀錄</span>
            {logs.length > 0 && (
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-pulse"></span>
            )}
          </button>
        )}
      </div>

      {/* 修改密碼彈出視窗 */}
      {isPwdModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs">
          <div className="w-full max-w-sm bg-white border border-slate-300 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-black font-bold">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-100">
              <h2 className="text-sm font-bold text-slate-900 flex items-center gap-1.5 tracking-wider">
                <span>🔐 修改管理員密碼</span>
              </h2>
              <button onClick={() => { setIsPwdModalOpen(false); setNewPassword(''); setConfirmPassword(''); }} className="text-gray-400 hover:text-slate-700 transition-colors text-sm">✕</button>
            </div>
            {/* 🧠 確保對應呼叫無誤 */}
            <form onSubmit={handleUpdatePassword} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-400 mb-2">輸入新密碼 (至少 6 位數)</label>
                <input type="password" required autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="請輸入全新安全密碼" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div>
                <label className="block font-bold text-slate-400 mb-2">再次確認新密碼</label>
                <input type="password" required autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="請再次輸入新密碼" className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-black text-sm focus:outline-none focus:ring-2 focus:ring-blue-600" />
              </div>
              <div className="pt-2 flex justify-end gap-2 bg-slate-50 p-3 -mx-5 -mb-5 border-t border-slate-200">
                <button type="button" onClick={() => { setIsPwdModalOpen(false); setNewPassword(''); setConfirmPassword(''); }} className="px-4 py-2 bg-white border border-slate-400 text-slate-700 rounded-md font-bold">CANCEL</button>
                <button type="submit" disabled={pwdUpdating} className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-md font-bold shadow transition-colors disabled:opacity-50">{pwdUpdating ? '同步更新中...' : '確認重設密碼'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}