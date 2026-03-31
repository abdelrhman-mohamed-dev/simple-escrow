"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

type TransactionType = "receive" | "send";
type Method = "bank" | "wallet";

interface Transaction {
  id: number;
  description: string;
  amount: number;
  type: TransactionType;
  method: Method;
  party: string;
  created_at?: string;
}

const supabase = createClient();

function calcWalletFee(amount: number, partyNumber: string): { fee: number; label: string } {
  const isVodafone = partyNumber.startsWith("010");
  if (isVodafone) return { fee: 1, label: "Vodafone to Vodafone" };
  const fee = Math.min(Math.max(amount * 0.005, 1), 15);
  return { fee: Math.round(fee * 100) / 100, label: "Transfer to other wallet" };
}

function formatMoney(n: number) {
  return "EGP " + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function formatDate(date: string) {
  return new Date(date).toLocaleString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTxTotal(t: Transaction) {
  if (t.type === "send" && t.method === "wallet") {
    const { fee } = calcWalletFee(t.amount, t.party);
    return t.amount + fee;
  }
  return t.amount;
}

const listItem: Variants = {
  hidden: { opacity: 0, y: 15, scale: 0.98 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 350, damping: 25 } },
};

const sheetVariants: Variants = {
  hidden: { y: "100%" },
  visible: { y: 0, transition: { type: "spring", damping: 30, stiffness: 350 } },
  exit: { y: "100%", transition: { duration: 0.3, ease: [0.25, 1, 0.5, 1] } },
};

const backdropVariants: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

export default function HistoryPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const fetchTransactions = useCallback(async () => {
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .order("created_at", { ascending: false });
    if (data) setTransactions(data as Transaction[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTransactions();
    const channel = supabase
      .channel("history-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        fetchTransactions();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTransactions]);

  // Group transactions by date
  const grouped = transactions.reduce<Record<string, Transaction[]>>((acc, t) => {
    const dateKey = t.created_at
      ? new Date(t.created_at).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
      : "Unknown";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(t);
    return acc;
  }, {});

  return (
    <main className="w-full max-w-md mx-auto pt-safe min-h-dvh flex flex-col relative bg-slate-50 overscroll-none overflow-x-hidden">
      {/* Header */}
      <motion.header
        className="sticky top-0 z-30 bg-slate-50/80 backdrop-blur-xl px-5 pt-8 pb-4 border-b border-slate-100"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-600 shadow-sm transition-transform active:scale-95 shrink-0"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m15 18-6-6 6-6" />
            </svg>
          </Link>
          <div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">Transaction History</h1>
            <p className="text-xs text-slate-500 font-medium mt-0.5">{transactions.length} transaction{transactions.length !== 1 ? "s" : ""}</p>
          </div>
        </div>
      </motion.header>

      {/* Transaction List */}
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-safe" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
        {loading && (
          <div className="flex justify-center py-16">
            <span className="w-8 h-8 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
          </div>
        )}

        {!loading && transactions.length === 0 && (
          <div className="text-center py-16 bg-white/50 rounded-[32px] border border-slate-100 border-dashed mt-4">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" />
              </svg>
            </div>
            <p className="text-[15px] font-bold text-slate-700">No transactions yet</p>
            <p className="text-sm text-slate-500 mt-1 pb-2">Your activity will show up here</p>
          </div>
        )}

        {!loading && transactions.length > 0 && (
          <div className="space-y-6 pb-8">
            {Object.entries(grouped).map(([date, txs]) => (
              <div key={date}>
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-3 px-1">{date}</p>
                <div className="space-y-3">
                  {txs.map((t, i) => (
                    <motion.div
                      key={t.id}
                      variants={listItem}
                      initial="hidden"
                      animate="visible"
                      transition={{ delay: i * 0.04 }}
                      onClick={() => setSelectedTx(t)}
                      className="flex items-center gap-4 bg-white p-4 rounded-[24px] border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] cursor-pointer active:scale-[0.98] transition-all overflow-hidden"
                    >
                      <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center shrink-0 ${
                        t.type === "receive"
                          ? "bg-teal-50 text-teal-600"
                          : t.method === "bank" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"
                      }`}>
                        {t.type === "receive" ? (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
                        ) : t.method === "bank" ? (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
                        ) : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-[15px] font-bold text-slate-900 truncate tracking-tight">{t.description}</p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5 truncate flex items-center gap-1">
                          {t.party}
                          <span className="w-1 h-1 rounded-full bg-slate-300 mx-0.5" />
                          <span className="capitalize">{t.method}</span>
                        </p>
                      </div>

                      <div className="text-right shrink-0">
                        <p className={`text-[15px] font-bold tracking-tight ${t.type === "receive" ? "text-teal-600" : "text-slate-900"}`}>
                          {t.type === "receive" ? "+" : "-"}{formatMoney(getTxTotal(t))}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium mt-1">
                          {t.created_at ? formatDate(t.created_at) : ""}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Transaction Details Sheet */}
      <AnimatePresence>
        {selectedTx && (
          <>
            <motion.div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={() => setSelectedTx(null)}
            />
            <motion.div
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-[32px] max-h-[90dvh] pb-safe max-w-md mx-auto shadow-2xl flex flex-col"
              variants={sheetVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={0.2}
              onDragEnd={(_, info) => { if (info.offset.y > 100) setSelectedTx(null); }}
            >
              <div className="w-full flex justify-center py-4 shrink-0 cursor-grab active:cursor-grabbing" onClick={() => setSelectedTx(null)}>
                <div className="w-12 h-1.5 rounded-full bg-slate-200" />
              </div>
              <div className="px-6 pb-8 overflow-y-auto flex-1" style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}>
                <div className="flex flex-col items-center mb-8 relative">
                  <div className="w-[88px] h-[88px] rounded-full bg-slate-100 border-4 border-white shadow-md flex items-center justify-center text-[36px] font-black text-slate-800 mb-6 z-10">
                    {selectedTx.party.charAt(0).toUpperCase()}
                  </div>
                  <h3 className="text-[44px] font-black tracking-tighter flex items-baseline gap-1.5">
                    <span className="text-[22px] text-slate-400 font-bold">EGP</span>
                    <span className={selectedTx.type === "receive" ? "text-teal-600" : "text-slate-900"}>
                      {selectedTx.type === "receive" ? "+" : "-"}{formatMoney(selectedTx.amount).replace("EGP ", "")}
                    </span>
                  </h3>
                  <p className="text-[17px] font-bold text-slate-500 mt-2">
                    {selectedTx.type === "receive" ? "From" : "To"} <span className="text-slate-900">{selectedTx.party}</span>
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-100 rounded-[24px] p-5 space-y-4 mb-8">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Status</span>
                    <span className="text-[15px] font-bold text-emerald-600 flex items-center gap-1.5">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                      Completed
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Method</span>
                    <span className="text-[15px] font-bold text-slate-900 capitalize flex items-center gap-1.5">
                      {selectedTx.method === "bank" ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4" /><path d="M3 5v14a2 2 0 0 0 2 2h16v-5" /><path d="M18 12a2 2 0 0 0 0 4h4v-4Z" /></svg>
                      )}
                      {selectedTx.method} Transfer
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Date</span>
                    <span className="text-[15px] font-bold text-slate-900">
                      {selectedTx.created_at ? formatDate(selectedTx.created_at) : "Recently"}
                    </span>
                  </div>
                  <div className="w-full h-px bg-slate-200 border-dashed" />
                  <div className="flex justify-between items-start">
                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Note</span>
                    <span className="text-[15px] font-bold text-slate-900 text-right max-w-[65%]">{selectedTx.description}</span>
                  </div>
                  {selectedTx.type === "send" && selectedTx.method === "wallet" && (() => {
                    const fee = calcWalletFee(selectedTx.amount, selectedTx.party);
                    return (
                      <>
                        <div className="w-full h-px bg-slate-200 border-dashed" />
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Amount</span>
                          <span className="text-[15px] font-bold text-slate-900">EGP {selectedTx.amount.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Fee</span>
                          <span className="text-[15px] font-bold text-rose-500">EGP {fee.fee.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-center text-[11px] -mt-2">
                          <span></span>
                          <span className="text-slate-400 font-medium">{fee.label}</span>
                        </div>
                        <div className="w-full h-px bg-slate-200 border-dashed" />
                        <div className="flex justify-between items-center">
                          <span className="text-[13px] font-black text-slate-900 uppercase tracking-wide">Total</span>
                          <span className="text-[17px] font-black text-slate-900">EGP {(selectedTx.amount + fee.fee).toFixed(2)}</span>
                        </div>
                      </>
                    );
                  })()}
                  <div className="flex justify-between items-start">
                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Trans. ID</span>
                    <span className="text-[13px] font-bold text-slate-400 font-mono text-right max-w-[65%]">#{selectedTx.id.toString().padStart(8, "0")}</span>
                  </div>
                </div>

                <motion.button
                  onClick={() => setSelectedTx(null)}
                  className="w-full py-4 h-[60px] rounded-[24px] bg-slate-100 text-slate-600 font-bold text-[15px] shadow-sm hover:bg-slate-200 transition-colors flex items-center justify-center"
                  whileTap={{ scale: 0.98 }}
                >
                  Close
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </main>
  );
}
