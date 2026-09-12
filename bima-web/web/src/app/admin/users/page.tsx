'use client';

import React, { useState, useEffect } from 'react';
import Navbar from '@/components/Navbar';
import { TableSkeleton } from '@/components/SkeletonLoaders';
import { useToast } from '@/components/ToastProvider';
import {
  Users,
  Plus,
  Shield,
  User as UserIcon,
  CheckCircle2,
  Loader2,
  X,
  Edit2,
} from 'lucide-react';

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: 'surveyor' | 'admin';
  isActive: boolean;
  createdAt: string;
  _count: { surveySessions: number; reviewedSubmissions: number };
}

export default function AdminUsersPage() {
  const toast = useToast();
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserItem | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'surveyor' | 'admin'>('surveyor');

  const [saving, setSaving] = useState(false);
  const [alertMsg, setAlertMsg] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      if (data.success) {
        setUsers(data.users || []);
      }
    } catch (err) {
      console.error(err);
      toast.error('Gagal memuat data user.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openCreateModal = () => {
    setEditingUser(null);
    setName('');
    setEmail('');
    setPassword('');
    setRole('surveyor');
    setModalOpen(true);
  };

  const openEditModal = (u: UserItem) => {
    setEditingUser(u);
    setName(u.name);
    setEmail(u.email);
    setPassword('');
    setRole(u.role);
    setModalOpen(true);
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setAlertMsg(null);

    const payload: any = { name, role };
    if (!editingUser) {
      payload.email = email;
      payload.password = password;
    } else if (password.trim() !== '') {
      payload.password = password;
    }

    try {
      let res;
      if (editingUser) {
        res = await fetch(`/api/admin/users/${editingUser.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/admin/users', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (res.ok) {
        setModalOpen(false);
        const msg = editingUser ? 'Data user berhasil diperbarui.' : 'User baru berhasil didaftarkan.';
        toast.success(msg, 'Pengguna Tersimpan');
        setAlertMsg({ type: 'success', message: msg });
        fetchUsers();
      } else {
        toast.error(data.error || 'Gagal menyimpan user.');
      }
    } catch {
      toast.error('Koneksi error saat menyimpan data user.');
    } finally {
      setSaving(false);
    }
  };

  const toggleUserStatus = async (userItem: UserItem) => {
    try {
      const res = await fetch(`/api/admin/users/${userItem.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !userItem.isActive }),
      });
      if (res.ok) {
        toast.info(`Status user ${userItem.name} berhasil diubah.`, 'Status Diperbarui');
        fetchUsers();
      }
    } catch {
      toast.error('Koneksi error saat mengubah status user.');
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-24 sm:pb-16">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2.5">
              <Users className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
              Manajemen Pengguna & Hak Akses
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Kelola akun tim surveyor lapangan dan admin penilai survei.
            </p>
          </div>

          <button
            type="button"
            onClick={openCreateModal}
            className="w-full sm:w-auto px-4 py-2.5 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold text-xs rounded-xl shadow-md flex items-center justify-center gap-1.5 transition-all cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            Tambah User Baru
          </button>
        </div>

        {alertMsg && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{alertMsg.message}</span>
          </div>
        )}

        {/* Users Table */}
        {loading ? (
          <TableSkeleton rows={5} cols={5} />
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600 min-w-[560px]">
                <thead className="bg-slate-50 text-slate-700 font-bold uppercase tracking-wider text-[10px] border-b border-slate-200">
                  <tr>
                    <th className="py-3.5 px-4">Nama Lengkap</th>
                    <th className="py-3.5 px-4">Email</th>
                    <th className="py-3.5 px-4">Role Akses</th>
                    <th className="py-3.5 px-4">Aktivitas</th>
                    <th className="py-3.5 px-4">Status</th>
                    <th className="py-3.5 px-4 text-right">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-4 font-bold text-slate-900">{u.name}</td>
                      <td className="py-4 px-4 font-mono text-slate-600">{u.email}</td>
                      <td className="py-4 px-4">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            u.role === 'admin'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}
                        >
                          {u.role === 'admin' ? <Shield className="w-3 h-3" /> : <UserIcon className="w-3 h-3" />}
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-4 px-4 text-slate-500">
                        {u.role === 'surveyor'
                          ? `${u._count?.surveySessions || 0} Sesi Survei`
                          : `${u._count?.reviewedSubmissions || 0} Review Dilakukan`}
                      </td>
                      <td className="py-4 px-4">
                        <button
                          onClick={() => toggleUserStatus(u)}
                          className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold transition-all cursor-pointer ${
                            u.isActive
                              ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                              : 'bg-rose-100 text-rose-800 hover:bg-rose-200'
                          }`}
                        >
                          {u.isActive ? 'Aktif' : 'Dinonaktifkan'}
                        </button>
                      </td>
                      <td className="py-4 px-4 text-right">
                        <button
                          onClick={() => openEditModal(u)}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit User"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* CREATE / EDIT USER MODAL */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <form
            onSubmit={handleSaveUser}
            className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 sm:p-6 space-y-4 text-xs max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600 shrink-0" />
                {editingUser ? 'Edit Akun Pengguna' : 'Tambah Pengguna Baru'}
              </h3>
              <button type="button" onClick={() => setModalOpen(false)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nama Lengkap <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="Nama Pengguna"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Email Login <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="user@bima.id"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  {editingUser ? 'Ganti Password (Kosongkan jika tidak diubah)' : 'Password'} <span className="text-rose-500">{editingUser ? '' : '*'}</span>
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  placeholder="Min. 6 karakter"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Role Akses</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-xl bg-slate-50 text-xs sm:text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none font-medium"
                >
                  <option value="surveyor">Surveyor (Lapangan)</option>
                  <option value="admin">Admin (Review & Pengaturan)</option>
                </select>
              </div>
            </div>

            <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-xs font-semibold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-bold text-xs shadow-md cursor-pointer transition-all disabled:opacity-50"
              >
                {saving ? 'Menyimpan...' : 'Simpan User'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
