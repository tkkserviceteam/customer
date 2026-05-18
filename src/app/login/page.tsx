'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 當前登入身分檢測狀態
  const [currentSessionUser, setCurrentSessionUser] = useState<string | null>(null);

  // 修改密碼控制狀態
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [updating, setUpdating] = useState(false);

  // 初始化與身份變更檢測：抓取當前是否已有登入的管理員
  useEffect(() => {
    const checkCurrentUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setCurrentSessionUser(session.user.email.split('@')[0]);
      } else {
        setCurrentSessionUser(null);
      }
    };
    checkCurrentUser();
  }, []);

  // 核心登入邏輯
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const virtualEmail = `${username.trim()}@system.local`;
      const { data, error } = await supabase.auth.signInWithPassword({
        email: virtualEmail,
        password,
      });

      if (error) throw error;

      alert('登入成功！已解鎖管理員權限。');
      router.push('/'); 
      router.refresh();
    } catch (error: any) {
      console.error('登入失敗:', error.message);
      alert('登入失敗：帳號或密碼錯誤。');
    } finally {
      setLoading(false);
    }
  };

  // 核心修改密碼邏輯 (免舊密碼，直接透過目前 Session 機制更新加密憑證)
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (newPassword.length < 6) {
      alert('資安防護提示：新密碼長度不可少於 6 位數。');
      return;
    }

    if (newPassword !== confirmPassword) {
      alert('密碼變更失敗：兩次輸入的新密碼不一致，請重新檢查。');
      return;
    }

    try {
      setUpdating(true);
      // 調用 Supabase 用戶自主更新密碼 API
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) throw error;

      alert(`密碼變更成功！目前管理員 [${currentSessionUser}] 的新密碼已即刻生效。`);
      setIsUpdateModalOpen(false);
      setNewPassword('');
      setConfirmPassword('');
    } catch (error: any) {
      alert(`密碼變更失敗：${error.message}`);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 md:p-6">
      
      {/* 登入主容器 */}
      <div className="w-full max-w-sm md:max-w-md bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* 標題區 */}
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">通訊錄後台管理</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1.5 leading-relaxed">
            {currentSessionUser ? (
              <span className="text-green-400 font-semibold">🟢 目前已登入管理員: [{currentSessionUser}]</span>
            ) : (
              '請輸入管理員帳號與密碼以解鎖權限'
            )}
          </p>
        </div>

        {/* 表單區塊 */}
        {!currentSessionUser ? (
          // 情況 A：尚未登入 -> 顯示登入表單
          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">管理員帳號</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="例如: admin"
                className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-400 mb-2">密碼 (Password)</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-4 py-2.5 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 md:py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg font-medium text-sm md:text-base shadow-md transition-colors disabled:opacity-50 select-none touch-manipulation"
            >
              {loading ? '驗證中...' : '安全登入'}
            </button>
          </form>
        ) : (
          // 情況 B：已經登入 -> 快捷引導與密碼修改入口
          <div className="space-y-4 text-center">
            <div className="bg-gray-850 p-4 rounded-xl border border-gray-700/60 text-sm text-gray-300">
              您當前已具備系統最高維護權限，可以直接返回主頁面進行通訊錄的資料編輯與匯入。
            </div>
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => router.push('/')}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors shadow-md"
              >
                進入管理主頁
              </button>
              <button
                onClick={() => setIsUpdateModalOpen(true)}
                className="w-full py-2.5 bg-gray-700 hover:bg-gray-600 text-amber-400 border border-amber-900/40 rounded-lg text-sm font-medium transition-colors"
              >
                🔐 修改密碼
              </button>
            </div>
          </div>
        )}

        {/* 底層導航連結 */}
        <div className="text-center mt-6 flex justify-center items-center gap-4 text-xs text-gray-500">
          <button onClick={() => router.push('/')} className="hover:text-gray-400 underline transition-colors p-1">
            ← 返回客戶列表前台
          </button>
        </div>

      </div>

      {/* ==================== 🔐 獨立修改密碼彈出視窗 (Modal Layer) ==================== */}
      {isUpdateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-gray-800 border border-gray-700 rounded-xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-5 py-4 border-b border-gray-700 flex items-center justify-between bg-gray-850">
              <h2 className="text-base font-bold text-white flex items-center gap-1.5">
                <span>🔐 變更管理員密碼</span>
                <span className="text-xs text-amber-400 font-mono">[{currentSessionUser}]</span>
              </h2>
              <button 
                onClick={() => { setIsUpdateModalOpen(false); setNewPassword(''); setConfirmPassword(''); }} 
                className="text-gray-400 hover:text-white transition-colors text-sm"
              >
                ✕
              </button>
            </div>
            
            <form onSubmit={handleUpdatePassword} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">輸入新密碼 (至少 6 位數)</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="請輸入全新安全密碼"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2">再次確認新密碼</label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="請再次輸入新密碼"
                  className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2 text-xs">
                <button 
                  type="button" 
                  onClick={() => { setIsUpdateModalOpen(false); setNewPassword(''); setConfirmPassword(''); }} 
                  className="px-4 py-2 bg-gray-700 text-gray-200 rounded-md font-medium"
                >
                  取消
                </button>
                <button 
                  type="submit" 
                  disabled={updating}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-md font-medium shadow transition-colors disabled:opacity-50"
                >
                  {updating ? '同步更新中...' : '確認重設密碼'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}