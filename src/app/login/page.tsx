'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  // 初始化檢測：若原本就已經是登入狀態，直接彈回主頁，不用重複登入
  useEffect(() => {
    const checkRedirect = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        router.push('/');
      }
    };
    checkRedirect();
  }, [router]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 🧠 關鍵核心修正：還原為能讓你 100% 成功驗證的 @system.local
      const virtualEmail = `${username.trim()}@system.local`;
      const { error } = await supabase.auth.signInWithPassword({
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
    // 🧠 視覺升級：與主頁面一致的「明亮科技白 (bg-slate-50)」與「高對比黑字 (text-slate-900)」
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 md:p-6 select-none font-sans">
      
      {/* 高對比純白登入卡片 */}
      <div className="w-full max-w-sm md:max-w-md bg-white border border-slate-300 rounded-xl shadow-md p-6 md:p-8 animate-in fade-in zoom-in-95 duration-200">
        
        <div className="text-center mb-6 md:mb-8 border-b border-slate-200 pb-4">
          <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-wider">通訊錄後台管理</h1>
          <p className="text-xs md:text-sm text-slate-700 font-bold mt-1.5">
            請輸入管理員帳號與密碼以解鎖權限
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-xs font-bold text-slate-800 mb-2 font-mono uppercase tracking-wide">管理員帳號</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如: admin"
              className="w-full px-4 py-2.5 bg-white border border-slate-400 rounded-lg text-black font-bold text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all placeholder-slate-400 shadow-2xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-800 mb-2 font-mono uppercase tracking-wide">密碼 (Password)</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-4 py-2.5 bg-white border border-slate-400 rounded-lg text-black font-bold text-sm md:text-base focus:outline-none focus:ring-2 focus:ring-blue-600 transition-all placeholder-slate-400 shadow-2xs"
            />
          </div>

          {/* 經典深維護藍按鈕 */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 md:py-3 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-bold text-sm md:text-base shadow-md transition-colors disabled:opacity-50 select-none touch-manipulation tracking-wider"
          >
            {loading ? '安全驗證中...' : '安全登入'}
          </button>
        </form>

        <div className="text-center mt-6 flex justify-center items-center text-xs">
          <button 
            onClick={() => router.push('/')} 
            className="text-slate-700 hover:text-blue-600 font-bold underline transition-colors p-1"
          >
            ← 返回客戶列表前台
          </button>
        </div>

      </div>
    </div>
  );
}