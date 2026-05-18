'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  // 1. 將狀態從 email 改為 username
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(false);

    try {
      setLoading(true);

      // 2. 智慧映射：自動將純帳號轉化為虛擬信箱送給 Supabase
      const virtualEmail = `${username.trim()}@system.local`;

      const { error } = await supabase.auth.signInWithPassword({
        email: virtualEmail, // 背後依然走信箱欄位驗證
        password,
      });

      if (error) throw error;

      alert('登入成功！已解鎖管理員權限。');
      router.push('/'); // 登入成功後跳回主頁
      router.refresh();
    } catch (error: any) {
      console.error('登入失敗:', error.message);
      alert('登入失敗：帳號或密碼錯誤。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-gray-800 border border-gray-700 rounded-xl shadow-2xl p-8">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-white tracking-tight">通訊錄後台管理登入</h1>
          <p className="text-sm text-gray-400 mt-1">請輸入管理員帳號與密碼以解鎖權限</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            {/* 3. 欄位改為純帳號輸入 */}
            <label className="block text-xs font-medium text-gray-400 mb-2">管理員帳號</label>
            <input
              type="text"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如: admin"
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
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
              className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium shadow transition-colors disabled:opacity-50"
          >
            {loading ? '驗證中...' : '安全登入'}
          </button>
        </form>

        <div className="text-center mt-6">
          <button 
            onClick={() => router.push('/')}
            className="text-xs text-gray-500 hover:text-gray-400 underline transition-colors"
          >
            ← 返回客戶列表前台
          </button>
        </div>
      </div>
    </div>
  );
}