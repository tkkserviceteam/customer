'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(false);

    try {
      setLoading(true);
      const virtualEmail = `${username.trim()}@portal.local`;

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

  return (
    // 使用 p-4 md:p-0 確保手機版邊距舒適，並在各種螢幕上完美居中
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 md:p-6">
      
      {/* 
        響應式容器設計：
        - 手機版: max-w-sm 撐滿寬度，適應手機螢幕比例
        - 電腦版: md:max-w-md 恢復專業寬度，精緻內斂 
      */}
      <div className="w-full max-w-sm md:max-w-md bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200">
        
        {/* 標題區塊 - 調整響應式字級 */}
        <div className="text-center mb-6 md:mb-8">
          <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">通訊錄後台管理登入</h1>
          <p className="text-xs md:text-sm text-gray-400 mt-1.5 leading-relaxed">
            請輸入管理員帳號與密碼以解鎖權限
          </p>
        </div>

        {/* 登入表單 - 增強觸控友善度 */}
        <form onSubmit={handleLogin} className="space-y-5 md:space-y-6">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-2">管理員帳號</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如: admin"
              // text-sm md:text-base 防止 iOS Safari 瀏覽器自動放大網頁、py-2.5 增大手機點擊範圍
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

          {/* 登入按鈕 - 增強手機按壓體感 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 md:py-3 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white rounded-lg font-medium text-sm md:text-base shadow-md transition-colors disabled:opacity-50 select-none touch-manipulation"
          >
            {loading ? '驗證中...' : '安全登入'}
          </button>
        </form>

        {/* 返回按鈕 */}
        <div className="text-center mt-6">
          <button 
            onClick={() => router.push('/')}
            className="text-xs text-gray-500 hover:text-gray-400 underline transition-colors p-2"
          >
            ← 返回客戶列表前台
          </button>
        </div>

      </div>
    </div>
  );
}