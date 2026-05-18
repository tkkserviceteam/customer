'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Customer, InsertCustomerInput } from '@/types/customer';
import { taiwanDistricts } from '@/lib/taiwanDistricts';
// 引入開源名片 OCR 套件
import { createWorker } from 'tesseract.js';

interface CustomerLog {
  id: string;
  operator: string;
  action_type: string;
  customer_name: string;
  details: string;
  created_at: string;
}

export default function CustomerPage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(true);

  // 管理員狀態
  const [isAdmin, setIsAdmin] = useState(false);
  const [operatorName, setOperatorName] = useState('');

  // 日誌狀態
  const [logs, setLogs] = useState<CustomerLog[]>([]);

  // 彈出視窗控制狀態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingCustomerId, setEditingCustomerId] = useState<string | null>(null);

  // 智慧匯入與快篩提取狀態
  const [importLoading, setImportLoading] = useState(false);
  const [extractedSuggestions, setExtractedSuggestions] = useState<{
    phone?: string;
    email?: string;
  }>({});

  // Line QR Code Modal 狀態
  const [activeLineId, setActiveLineId] = useState<string | null>(null);

  // 表單資料狀態
  const [formData, setFormData] = useState<InsertCustomerInput>({
    company_name: '', facility_name: '', facility_floor: '',
    contact_name: '', title: '', phone: '', extension: '',
    line_id: '', email: '', address: '', notes: '',
  });

  // 地址下拉狀態
  const [city, setCity] = useState('');
  const [dist, setDist] = useState('');
  const [detailAddress, setDetailAddress] = useState('');

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const IDLE_TIMEOUT_DURATION = 10 * 60 * 1000;

  const handleCityChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setCity(e.target.value);
    setDist('');
  };

  // 智慧匯入：處理 VCF 檔案解析
  const handleVcfImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      if (!text) return;

      const orgMatch = text.match(/ORG:(.*?)(?:\r?\n|;)/);
      const fnMatch = text.match(/FN:(.*?)(?:\r?\n|;)/);
      const telMatch = text.match(/TEL(?:;.*?):(.*)/);
      const emailMatch = text.match(/EMAIL(?:;.*?):(.*)/);
      const titleMatch = text.match(/TITLE:(.*?)(?:\r?\n|;)/);

      setFormData((prev) => ({
        ...prev,
        company_name: orgMatch ? orgMatch[1].trim() : prev.company_name,
        contact_name: fnMatch ? fnMatch[1].trim() : prev.contact_name,
        phone: telMatch ? telMatch[1].trim().replace(/[- ]/g, '') : prev.phone,
        email: emailMatch ? emailMatch[1].trim() : prev.email,
        title: titleMatch ? titleMatch[1].trim() : prev.title,
      }));

      alert('vCard (.vcf) 聯絡人解析完成！請檢查下方欄位。');
    };
    reader.readAsText(file);
  };

  // 🧠 核心優化：前端 Canvas 影像預處理濾鏡（灰階化 + 降噪高對比）
  const preprocessImage = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) { resolve(event.target?.result as string); return; }

          canvas.width = img.width;
          canvas.height = img.height;
          ctx.drawImage(img, 0, 0);

          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const data = imgData.data;

          // 走訪像素點進行高對比二值化處理
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            // 灰階權重公式
            const gray = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            
            // 提高對比度閾值：低於 130 變純黑，高於 130 變純白
            const v = gray < 130 ? 0 : 255;
            data[i] = v;     // R
            data[i + 1] = v; // G
            data[i + 2] = v; // B
          }
          ctx.putImageData(imgData, 0, 0);
          resolve(canvas.toDataURL());
        };
        img.src = event.target?.result as string;
      };
      reader.readAsDataURL(file);
    });
  };

  // 智慧匯入：名片圖片 OCR 辨識
  const handleImageOcrImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setImportLoading(true);
      setExtractedSuggestions({});
      
      // 1. 先進濾鏡將圖片黑白高對比化
      const processedImageUrl = await preprocessImage(file);

      // 2. 送交 OCR 引擎辨識
      const worker = await createWorker('chi_tra+eng');
      const ret = await worker.recognize(processedImageUrl);
      const ocrText = ret.data.text;
      await worker.terminate();

      if (!ocrText.trim()) {
        alert('經過影像黑白過濾後仍未能辨識文字，請確保圖片文字清晰、無嚴重反光。');
        return;
      }

      // 用 Regex 提取可能的手機或信箱
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
      const phoneRegex = /(?:09\d{8})|(?:0\d{1,2}-\d{6,8})/g;
      
      const foundEmails = ocrText.match(emailRegex);
      const foundPhones = ocrText.match(phoneRegex);

      setExtractedSuggestions({
        email: foundEmails ? foundEmails[0] : undefined,
        phone: foundPhones ? foundPhones[0].replace(/[- ]/g, '') : undefined,
      });

      setFormData((prev) => ({
        ...prev,
        notes: `【名片自動 OCR 辨識結果】：\n${ocrText}\n\n${prev.notes || ''}`
      }));

      alert('名片已進行黑白去噪預處理並掃描完成！文字已提取至備註。');
    } catch (error) {
      console.error('OCR 失敗:', error);
      alert('名片辨識發生錯誤，請稍後再試。');
    } finally {
      setImportLoading(false);
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

  const resetIdleTimeout = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (isAdmin) {
      timeoutRef.current = setTimeout(() => { handleAutoLogout(); }, IDLE_TIMEOUT_DURATION);
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    alert('已安全登出後台管理身分。');
    setIsAdmin(false);
    setOperatorName('');
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    router.refresh();
  };

  useEffect(() => {
    const checkAuthAndFetch = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      updateAuthState(session);
      supabase.auth.onAuthStateChange((_event, session) => { updateAuthState(session); });
      await fetchCustomers();
      await fetchLogs();
    };
    checkAuthAndFetch();

    const activityEvents = ['mousemove', 'keydown', 'click', 'scroll'];
    activityEvents.forEach(event => { window.addEventListener(event, resetIdleTimeout); });
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      activityEvents.forEach(event => { window.removeEventListener(event, resetIdleTimeout); });
    };
  }, [isAdmin]);

  const fetchCustomers = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.from('customers').select('*').order('company_name', { ascending: true });
      if (error) throw error;
      setCustomers(data || []);
    } catch (error) {
      console.error('讀取資料失敗:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase.from('customer_logs').select('*').order('created_at', { ascending: false }).limit(5);
      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('撈取日誌失敗:', error);
    }
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

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleOpenCreateModal = () => {
    setEditingCustomerId(null);
    setExtractedSuggestions({});
    setFormData({ company_name: '', facility_name: '', facility_floor: '', contact_name: '', title: '', phone: '', extension: '', line_id: '', email: '', address: '', notes: '' });
    setCity(''); setDist(''); setDetailAddress('');
    setIsModalOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setEditingCustomerId(customer.id);
    setExtractedSuggestions({});
    setFormData({ company_name: customer.company_name, facility_name: customer.facility_name || '', facility_floor: customer.facility_floor || '', contact_name: customer.contact_name, title: customer.title || '', phone: customer.phone || '', extension: customer.extension || '', line_id: customer.line_id || '', email: customer.email || '', address: customer.address || '', notes: customer.notes || '' });

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

  const handleDeleteCustomer = async (id: string, name: string, company: string) => {
    if (!confirm(`確定要刪除客戶「${name}」的通訊資料嗎？`)) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('id', id);
      if (error) throw error;
      alert('資料已成功刪除！');
      await writeLog('刪除', company, `移除了聯絡窗口: ${name}`);
      fetchCustomers();
    } catch (error) {
      alert('刪除失敗，權限被拒絕。');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setIsSubmitting(true);
      const fullAddress = city ? `${city}${dist}${detailAddress}` : detailAddress;
      const finalData = { ...formData, address: fullAddress === '' ? null : fullAddress };
      const cleanedData = Object.fromEntries(Object.entries(finalData).map(([key, value]) => [key, value === '' ? null : value]));

      if (editingCustomerId) {
        const { error } = await supabase.from('customers').update(cleanedData).eq('id', editingCustomerId);
        if (error) throw error;
        alert('客戶資料更新成功！');
        await writeLog('編輯', formData.company_name, `修改了 ${formData.contact_name}${formData.title ? ` (${formData.title})` : ''} 的聯絡資料`);
      } else {
        const { error } = await supabase.from('customers').insert([cleanedData]);
        if (error) throw error;
        alert('客戶資料新增成功！');
        await writeLog('新增', formData.company_name, `建立了新窗口: ${formData.contact_name}${formData.title ? ` (${formData.title})` : ''}`);
      }
      setIsModalOpen(false);
      fetchCustomers();
    } catch (error) {
      alert('儲存失敗，請檢查管理員登入權限。');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCustomers = customers.filter((customer) => {
    const search = searchTerm.toLowerCase();
    return customer.company_name?.toLowerCase().includes(search) || customer.facility_name?.toLowerCase().includes(search) || customer.contact_name?.toLowerCase().includes(search) || customer.title?.toLowerCase().includes(search) || customer.address?.toLowerCase().includes(search);
  });

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-12 pb-32">
      <div className="max-w-7xl mx-auto">
        
        {/* Top Title Bar */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-xl md:text-2xl font-bold tracking-tight text-white">客戶通訊錄管理系統</h1>
            <p className="text-xs md:text-sm mt-1">
              {isAdmin ? <span className="text-green-400">🟢 歡迎管理員 [{operatorName}] 登入模式 (10分閒置安全防護中)</span> : <span className="text-gray-400">🔵 訪客唯讀模式</span>}
            </p>
          </div>
          <div className="flex gap-2 md:gap-3">
            {isAdmin ? (
              <>
                <button onClick={handleOpenCreateModal} className="flex-1 md:flex-initial bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 text-sm md:text-base rounded-lg font-medium shadow transition-colors">+ 新增客戶</button>
                <button onClick={handleLogout} className="flex-1 md:flex-initial bg-gray-700 hover:bg-gray-600 text-gray-300 px-3 py-2 text-sm md:text-base rounded-lg font-medium shadow transition-colors">安全登出</button>
              </>
            ) : (
              <button onClick={() => router.push('/login')} className="w-full md:w-auto bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700 px-4 py-2 text-sm md:text-base rounded-lg font-medium shadow transition-colors">管理員登入</button>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input type="text" placeholder="搜尋公司、廠區、聯絡人、職稱或地址..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full md:w-96 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">資料載入中...</div>
        ) : filteredCustomers.length === 0 ? (
          <div className="text-center py-12 text-gray-400">找不到客戶資料</div>
        ) : (
          <>
            {/* 1. Desktop Table */}
            <div className="hidden md:block bg-gray-800 border border-gray-700 rounded-xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-750 border-b border-gray-700 text-gray-400 text-sm font-medium">
                      <th className="p-4">公司 / 廠區 / 樓層</th>
                      <th className="p-4">聯絡人 / 職稱</th>
                      <th className="p-4">聯絡電話 (分機)</th>
                      <th className="p-4">Line ID</th>
                      <th className="p-4">公司地址 (點擊導航)</th>
                      <th className="p-4">備註</th>
                      {isAdmin && <th className="p-4 text-center">操作</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-700 text-sm">
                    {filteredCustomers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-gray-750 transition-colors">
                        <td className="p-4">
                          <div className="font-semibold text-white">{customer.company_name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{customer.facility_name || '--'} {customer.facility_floor ? `(${customer.facility_floor}F)` : ''}</div>
                        </td>
                        <td className="p-4">
                          <div className="text-gray-200">{customer.contact_name}</div>
                          <div className="text-xs text-gray-400 mt-0.5">{customer.title || '--'}</div>
                        </td>
                        <td className="p-4 text-gray-300 font-mono">
                          {customer.phone ? <a href={`tel:${customer.phone}`} className="text-blue-400 hover:text-blue-300 hover:underline transition-colors">{customer.phone}{customer.extension ? ` #${customer.extension}` : ''}</a> : '--'}
                        </td>
                        <td className="p-4">
                          {customer.line_id ? <button onClick={() => setActiveLineId(customer.line_id)} className="text-green-400 hover:text-green-300 hover:underline flex items-center gap-1 font-medium transition-colors"><span>{customer.line_id}</span><span className="text-xs bg-green-950 text-green-400 border border-green-800 px-1.5 py-0.5 rounded">QR</span></button> : <span className="text-gray-500">--</span>}
                        </td>
                        <td className="p-4 max-w-xs">
                          {customer.address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address.split(/[\s\(\環境]/)[0])}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 hover:underline flex items-center gap-1 transition-colors truncate">{customer.address}</a> : <span className="text-gray-500">--</span>}
                        </td>
                        <td className="p-4 text-gray-400 max-w-xs truncate" title={customer.notes || ''}>{customer.notes || '--'}</td>
                        {isAdmin && (
                          <td className="p-4 text-center space-x-2 whitespace-nowrap">
                            <button onClick={() => handleOpenEditModal(customer)} className="text-amber-400 hover:text-amber-300 hover:underline font-medium transition-colors">編輯</button>
                            <span className="text-gray-600">|</span>
                            <button onClick={() => handleDeleteCustomer(customer.id, customer.contact_name, customer.company_name)} className="text-red-400 hover:text-red-300 hover:underline font-medium transition-colors">刪除</button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* 2. Mobile Cards */}
            <div className="block md:hidden space-y-4">
              {filteredCustomers.map((customer) => (
                <div key={customer.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 shadow-md space-y-3">
                  <div className="flex justify-between items-start border-b border-gray-700 pb-2">
                    <div>
                      <div className="text-base font-bold text-white">{customer.company_name}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{customer.facility_name || '無特定廠區'} {customer.facility_floor ? ` • ${customer.facility_floor}F` : ''}</div>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-3 text-xs pt-0.5">
                        <button onClick={() => handleOpenEditModal(customer)} className="text-amber-400 font-semibold bg-amber-950/40 px-2 py-1 rounded border border-amber-900/60">編輯</button>
                        <button onClick={() => handleDeleteCustomer(customer.id, customer.contact_name, customer.company_name)} className="text-red-400 font-semibold bg-red-950/40 px-2 py-1 rounded border border-red-900/60">刪除</button>
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm bg-gray-750 p-2.5 rounded-lg">
                    <div><span className="text-xs text-gray-400 block mb-0.5">聯絡窗口</span><span className="text-gray-200 font-medium">{customer.contact_name}</span></div>
                    <div><span className="text-xs text-gray-400 block mb-0.5">職稱</span><span className="text-gray-300">{customer.title || '--'}</span></div>
                  </div>
                  <div className="space-y-1.5 text-xs text-gray-300 px-1">
                    {customer.address && <div className="leading-relaxed"><span className="text-gray-500 font-medium">地址：</span>{customer.address}</div>}
                    {customer.notes && <div className="leading-relaxed"><span className="text-gray-500 font-medium">備註：</span>{customer.notes}</div>}
                  </div>
                  <div className="grid grid-cols-3 gap-2 pt-1">
                    {customer.phone ? <a href={`tel:${customer.phone}`} className="bg-blue-900/60 hover:bg-blue-900 text-blue-300 border border-blue-800 text-center py-2 rounded-lg text-xs font-medium flex flex-col items-center justify-center gap-0.5 transition-colors"><span className="text-[10px] text-blue-400 font-mono">撥打總機</span><span className="truncate max-w-full px-1">{customer.phone}{customer.extension ? `#${customer.extension}` : ''}</span></a> : <div className="bg-gray-850 text-gray-600 border border-gray-800 text-center py-2 rounded-lg text-xs flex items-center justify-center">無電話</div>}
                    {customer.line_id ? <button onClick={() => setActiveLineId(customer.line_id)} className="bg-green-900/60 hover:bg-green-900 text-green-300 border border-green-800 text-center py-2 rounded-lg text-xs font-medium flex flex-col items-center justify-center gap-0.5 transition-colors"><span className="text-[10px] text-green-400">LINE 掃碼</span><span className="truncate max-w-full px-1">{customer.line_id}</span></button> : <div className="bg-gray-850 text-gray-600 border border-gray-800 text-center py-2 rounded-lg text-xs flex items-center justify-center">無 LINE</div>}
                    {customer.address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(customer.address.split(/[\s\(\環境]/)[0])}`} target="_blank" rel="noopener noreferrer" className="bg-purple-900/60 hover:bg-purple-900 text-purple-300 border border-purple-800 text-center py-2 rounded-lg text-xs font-medium flex flex-col items-center justify-center gap-0.5 transition-colors"><span className="text-[10px] text-purple-400">Google</span><span>開啟導航</span></a> : <div className="bg-gray-850 text-gray-600 border border-gray-800 text-center py-2 rounded-lg text-xs flex items-center justify-center">無地址</div>}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* 新增/編輯視窗 (Modal) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 border-b border-gray-700 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">{editingCustomerId ? '修改客戶通訊資料' : '新增客戶通訊資料'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white transition-colors text-xl">✕</button>
            </div>
            <form onSubmit={handleSubmit} className="p-4 md:p-6 space-y-4 max-h-[80vh] overflow-y-auto">
              
              {/* 管理員智慧快捷匯入專區 */}
              {!editingCustomerId && (
                <div className="bg-gray-850 border border-dashed border-gray-600 rounded-xl p-3 md:p-4 space-y-3">
                  <div className="text-xs font-bold text-blue-400 tracking-wider flex items-center gap-1.5">
                    <span>⚡ 管理員智慧表單快捷匯入</span>
                    {importLoading && <span className="text-amber-400 text-[11px] animate-pulse">(影像加壓去噪中，請稍候...)</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="bg-gray-800 p-2.5 rounded-lg border border-gray-700">
                      <label className="block text-gray-400 mb-1.5 font-medium">① 匯入電子名片 (.vcf)</label>
                      <input type="file" accept=".vcf" onChange={handleVcfImport} disabled={importLoading} className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-blue-950 file:text-blue-400 hover:file:bg-blue-900 cursor-pointer disabled:opacity-40" />
                    </div>
                    <div className="bg-gray-800 p-2.5 rounded-lg border border-gray-700">
                      <label className="block text-gray-400 mb-1.5 font-medium">② 濾鏡掃描實體名片 (強效黑白 OCR)</label>
                      <input type="file" accept="image/*" onChange={handleImageOcrImport} disabled={importLoading} className="w-full text-[11px] text-gray-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-[11px] file:font-semibold file:bg-purple-950 file:text-purple-400 hover:file:bg-purple-900 cursor-pointer disabled:opacity-40" />
                    </div>
                  </div>
                </div>
              )}

              {/* 表單主要輸入欄位 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div><label className="block text-xs font-medium text-gray-400 mb-1">Company *</label><input type="text" name="company_name" required value={formData.company_name} onChange={handleInputChange} placeholder="e.g. TSMC" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" /></div>
                <div><label className="block text-xs font-medium text-gray-400 mb-1">Facility</label><input type="text" name="facility_name" value={formData.facility_name || ''} onChange={handleInputChange} placeholder="e.g. 中科廠" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" /></div>
                <div><label className="block text-xs font-medium text-gray-400 mb-1">Floor</label><input type="text" name="facility_floor" value={formData.facility_floor || ''} onChange={handleInputChange} placeholder="e.g. 3" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" /></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div><label className="block text-xs font-medium text-gray-400 mb-1">Contact Name *</label><input type="text" name="contact_name" required value={formData.contact_name} onChange={handleInputChange} placeholder="Name" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" /></div>
                <div><label className="block text-xs font-medium text-gray-400 mb-1">Title</label><input type="text" name="title" value={formData.title || ''} onChange={handleInputChange} placeholder="Title" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" /></div>
              </div>
              
              {/* 電話與 Email 欄位整合智慧快篩提取按鈕 */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <div className="flex justify-between items-center mb-1">
                    <label className="block text-xs font-medium text-gray-400">Phone</label>
                    {extractedSuggestions.phone && (
                      <button 
                        type="button" 
                        onClick={() => {
                          setFormData(prev => ({ ...prev, phone: extractedSuggestions.phone! }));
                          setExtractedSuggestions(prev => ({ ...prev, phone: undefined }));
                        }}
                        className="text-[10px] bg-blue-950 text-blue-400 border border-blue-800 px-1.5 py-0.5 rounded font-bold animate-bounce"
                      >
                        ⚡ 填入名片電話: {extractedSuggestions.phone}
                      </button>
                    )}
                  </div>
                  <input type="text" name="phone" value={formData.phone || ''} onChange={handleInputChange} placeholder="Phone" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" />
                </div>
                <div><label className="block text-xs font-medium text-gray-400 mb-1">Ext.</label><input type="text" name="extension" value={formData.extension || ''} onChange={handleInputChange} placeholder="Ext" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" /></div>
                <div><label className="block text-xs font-medium text-gray-400 mb-1">Line ID</label><input type="text" name="line_id" value={formData.line_id || ''} onChange={handleInputChange} placeholder="Line ID" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" /></div>
              </div>
              
              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="block text-xs font-medium text-gray-400">Email</label>
                  {extractedSuggestions.email && (
                    <button 
                      type="button" 
                      onClick={() => {
                        setFormData(prev => ({ ...prev, email: extractedSuggestions.email! }));
                        setExtractedSuggestions(prev => ({ ...prev, email: undefined }));
                      }}
                      className="text-[10px] bg-purple-950 text-purple-400 border border-purple-800 px-1.5 py-0.5 rounded font-bold animate-bounce"
                    >
                      ⚡ 填入名片 Email: {extractedSuggestions.email}
                    </button>
                  )}
                </div>
                <input type="email" name="email" value={formData.email || ''} onChange={handleInputChange} placeholder="Email" className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-gray-400">Address</label>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div><select value={city} onChange={handleCityChange} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none"><option value="">選擇縣市</option>{Object.keys(taiwanDistricts).map((c) => (<option key={c} value={c}>{c}</option>))}</select></div>
                  <div><select value={dist} disabled={!city} onChange={(e) => setDist(e.target.value)} className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none disabled:opacity-40"><option value="">選擇區域</option>{city && taiwanDistricts[city].map((d) => (<option key={d} value={d}>{d}</option>))}</select></div>
                  <div className="md:col-span-2"><input type="text" value={detailAddress} onChange={(e) => setDetailAddress(e.target.value)} placeholder="詳細路名..." className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none" /></div>
                </div>
              </div>
              <div><label className="block text-xs font-medium text-gray-400 mb-1">Notes</label><textarea name="notes" rows={5} value={formData.notes || ''} onChange={handleInputChange} placeholder="Notes..." className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none resize-none font-mono text-xs leading-relaxed" /></div>
              <div className="pt-4 border-t border-gray-700 flex justify-end gap-3">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-gray-700 text-gray-200 rounded-lg font-medium">取消</button>
                <button type="submit" disabled={isSubmitting || importLoading} className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium disabled:opacity-50">{isSubmitting ? '儲存中...' : editingCustomerId ? '確認更新' : '確認新增'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* LINE QR Code */}
      {activeLineId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-xs bg-gray-800 border border-gray-700 rounded-xl p-6 text-center">
            <h3 className="text-lg font-bold text-white mb-1">LINE 行動條碼</h3>
            <p className="text-xs text-gray-400 mb-4">ID: <span className="text-green-400 font-mono select-all">{activeLineId}</span></p>
            <div className="bg-white p-4 rounded-lg inline-block mb-4">
              <img src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(`https://line.me/R/ti/p/~${activeLineId}`)}`} alt="Line QR Code" width={180} height={180} className="mx-auto" />
            </div>
            <p className="text-xs text-gray-400 mb-5">請使用手機 LINE 掃描條碼</p>
            <button onClick={() => setActiveLineId(null)} className="w-full py-2 bg-gray-750 text-white rounded-lg font-medium border border-gray-600">關閉視窗</button>
          </div>
        </div>
      )}

      {/* 右下角更新日誌懸浮面板 */}
      <div className="fixed bottom-4 right-4 z-40 w-80 bg-gray-850 border border-gray-700 rounded-xl shadow-2xl overflow-hidden hidden md:block">
        <div className="bg-gray-800 px-4 py-2.5 border-b border-gray-700 flex items-center justify-between">
          <span className="text-xs font-bold text-gray-300 tracking-wider flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></span>
            近日更新日誌 (最新5筆)
          </span>
          <span className="text-[10px] text-gray-500 font-mono">Realtime</span>
        </div>
        <div className="p-3 space-y-2 max-h-60 overflow-y-auto divide-y divide-gray-800">
          {logs.length === 0 ? (
            <div className="text-center py-6 text-xs text-gray-500">暫無近日變更紀錄</div>
          ) : (
            logs.map((log, index) => (
              <div key={log.id} className={`text-xs pt-2 ${index === 0 ? 'pt-0' : ''}`}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 ${log.action_type === '新增' ? 'bg-blue-950 text-blue-400 border border-blue-900' : log.action_type === '編輯' ? 'bg-amber-950 text-amber-400 border border-amber-900' : 'bg-red-950 text-red-400 border border-red-900'}`}>{log.action_type}</span>
                    <span className="font-bold text-white truncate text-[13px]" title={log.customer_name}>{log.customer_name}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 font-mono shrink-0">{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                </div>
                <p className="text-gray-400 text-[11px] pl-1 leading-relaxed">{log.details}</p>
                <div className="text-[10px] text-gray-600 text-right mt-0.5">經辦人: {log.operator}</div>
              </div>
            ))
          )}
        </div>
      </div>

    </div>
  );
}