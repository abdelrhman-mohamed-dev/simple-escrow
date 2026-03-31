"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence, type Variants } from "framer-motion";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";

type TransactionType = "receive" | "send";
type Method = "bank" | "wallet";
type FlowStep = null | "method" | "details" | "confirm";

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

const MY_NUMBER = "01014269976";

// Vodafone Cash wallet fee calculation
function calcWalletFee(amount: number, partyNumber: string): { fee: number; label: string } {
  // Vodafone-to-Vodafone (starts with 010): flat 1 EGP
  const isVodafone = partyNumber.startsWith("010");
  if (isVodafone) {
    return { fee: 1, label: "Vodafone to Vodafone" };
  }
  // Other wallets: 0.5% (min 1 EGP, max 15 EGP)
  const fee = Math.min(Math.max(amount * 0.005, 1), 15);
  return { fee: Math.round(fee * 100) / 100, label: "Transfer to other wallet" };
}

// Utility for formatting money
function formatMoney(n: number) {
  return "EGP " + Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function timeAgo(date: string) {
  const diff = Date.now() - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// Animations
const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1, y: 0,
    transition: { delay: i * 0.08, duration: 0.5, ease: [0.25, 1, 0.5, 1] },
  }),
};

const listStagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

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

const stepVariants: Variants = {
  enter: { opacity: 0, x: 50 },
  center: { opacity: 1, x: 0, transition: { type: "spring", stiffness: 350, damping: 30 } },
  exit: { opacity: 0, x: -50, transition: { duration: 0.2 } },
};

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  // Flow state
  const [flowType, setFlowType] = useState<TransactionType>("receive");
  const [flowStep, setFlowStep] = useState<FlowStep>(null);
  const [method, setMethod] = useState<Method>("bank");
  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [party, setParty] = useState("");

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
      .channel("transactions-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "transactions" }, () => {
        fetchTransactions();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchTransactions]);

  function getTxTotal(t: Transaction) {
    if (t.type === "send" && t.method === "wallet") {
      const { fee } = calcWalletFee(t.amount, t.party);
      return t.amount + fee;
    }
    return t.amount;
  }

  const totalReceived = transactions
    .filter((t) => t.type === "receive")
    .reduce((s, t) => s + t.amount, 0);
  const totalSent = transactions
    .filter((t) => t.type === "send")
    .reduce((s, t) => s + getTxTotal(t), 0);
  const netBalance = totalReceived - totalSent;

  function openFlow(type: TransactionType) {
    setFlowType(type);
    setFlowStep("method");
    setMethod("bank");
    setDescription("");
    setAmount("");
    setParty("");
  }

  function closeFlow() {
    setFlowStep(null);
  }

  const walletFee = method === "wallet" && flowType === "send" && amount
    ? calcWalletFee(parseFloat(amount) || 0, party.trim())
    : null;

  async function handleConfirm() {
    const amt = parseFloat(amount);
    if (!description.trim() || isNaN(amt) || amt <= 0 || !party.trim()) return;

    setSaving(true);

    const { error } = await supabase.from("transactions").insert({
      description: description.trim(),
      amount: amt,
      type: flowType,
      method,
      party: party.trim(),
    });

    setSaving(false);

    if (!error) {
      closeFlow();
      fetchTransactions();
    }
  }


  const isReceive = flowType === "receive";

  return (
    <main className="w-full max-w-md mx-auto pt-safe min-h-dvh flex flex-col relative bg-slate-50 overscroll-none pb-20 overflow-x-hidden">
      
      {/* Background Decor (Subtle Native Feel) */}
      <div className="absolute top-0 inset-x-0 h-80 bg-gradient-to-b from-indigo-50/50 to-transparent pointer-events-none" />

      {/* Main Scrollable Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pt-8 pb-8" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        
        {/* Header / Greeting */}
        <motion.header 
          className="flex items-center justify-between mb-8"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-200 border-2 border-white shadow-sm shrink-0 relative">
              <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=Boody&backgroundColor=e2e8f0`} alt="Profile" className="w-full h-full object-cover" />
            </div>
            <div>
              <p className="text-xs text-slate-500 font-medium tracking-wide uppercase">Good Morning,</p>
              <h1 className="text-xl font-black text-slate-900 leading-tight tracking-tight">Boody</h1>
            </div>
          </div>
          <button className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center text-slate-600 shadow-sm relative transition-transform active:scale-95">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
            </svg>
            <span className="absolute top-2.5 right-2.5 w-2.5 h-2.5 bg-rose-500 rounded-full border-2 border-white" />
          </button>
        </motion.header>

        {/* Balance Card - Clean Professional Design */}
        <motion.div
          className="rounded-[28px] bg-white p-5 sm:p-7 mb-8 relative overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100"
          custom={0}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
          <div className="relative z-10 flex flex-col h-full justify-between">
            <div className="mb-8">
              <p className="text-[13px] text-slate-500 font-semibold mb-2 flex items-center gap-2 tracking-wide uppercase">
                Total Balance
                <button className="text-slate-400 hover:text-slate-600 transition-colors active:scale-90 overflow-hidden">
                   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </p>
              <motion.h2
                className={`text-[36px] sm:text-[44px] font-black tracking-tighter flex items-center gap-1.5 overflow-hidden ${netBalance < 0 ? "text-rose-500" : "text-slate-900"}`}
                key={netBalance}
                initial={{ scale: 1.05, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 300, damping: 20 }}
              >
                <span className={`text-[18px] sm:text-[20px] font-bold mt-1 font-sans ${netBalance < 0 ? "text-rose-400" : "text-slate-400"}`}>EGP</span>
                <span className="truncate">{netBalance < 0 && "-"}{Math.abs(netBalance).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}</span>
              </motion.h2>
            </div>
            
            <div className="flex border-t border-slate-100 pt-5 overflow-hidden">
              <div className="flex-1 min-w-0 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m19 12-7 7-7-7"/><path d="M12 19V5"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">Income</p>
                  <p className="text-[14px] font-bold text-slate-900 tracking-tight truncate">{formatMoney(totalReceived)}</p>
                </div>
              </div>
              <div className="w-px bg-slate-100 mx-3 shrink-0" />
              <div className="flex-1 min-w-0 flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center shrink-0">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 7-7 7 7"/><path d="M12 5v14"/></svg>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] text-slate-400 uppercase tracking-widest font-bold mb-0.5">Spent</p>
                  <p className="text-[14px] font-bold text-slate-900 tracking-tight truncate">{formatMoney(totalSent)}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions (Row) */}
        <motion.div
          className="flex justify-center gap-6 mb-10 px-1"
          custom={1}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
        >
          {/* Send */}
          <motion.div className="flex flex-col items-center gap-2.5" whileTap={{ scale: 0.9 }}>
            <button onClick={() => openFlow("send")} className="w-[72px] h-[72px] rounded-[24px] bg-white border border-slate-100 flex items-center justify-center shadow-sm text-slate-800 transition-colors">
               <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2 11 13"/><path d="m22 2-7 20-4-9-9-4Z"/></svg>
            </button>
            <span className="text-[13px] font-bold text-slate-600 tracking-wide">Send</span>
          </motion.div>
          {/* Receive */}
          <motion.div className="flex flex-col items-center gap-2.5" whileTap={{ scale: 0.9 }}>
            <button onClick={() => openFlow("receive")} className="w-[72px] h-[72px] rounded-[24px] bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
            </button>
            <span className="text-[13px] font-bold text-indigo-700 tracking-wide">Receive</span>
          </motion.div>
        </motion.div>

        {/* Transactions List */}
        <motion.div
           custom={2}
           initial="hidden"
           animate="visible"
           variants={fadeUp}
        >
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-xl font-bold text-slate-900 tracking-tight">Recent Activity</h3>
            <Link href="/history" className="text-sm font-bold text-indigo-600 hover:text-indigo-700 active:scale-95 transition-transform">See All</Link>
          </div>

          {loading && (
            <div className="flex justify-center py-10">
               <span className="w-8 h-8 rounded-full border-4 border-indigo-100 border-t-indigo-600 animate-spin" />
            </div>
          )}

          {!loading && transactions.length === 0 && (
             <div className="text-center py-16 bg-white/50 rounded-[32px] border border-slate-100 border-dashed">
               <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                 <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
               </div>
               <p className="text-[15px] font-bold text-slate-700">No recent transactions</p>
               <p className="text-sm text-slate-500 mt-1 pb-2">Your activity will show up here</p>
             </div>
          )}

          {!loading && transactions.length > 0 && (
            <div className="max-h-[400px] overflow-y-auto -mx-1 px-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            <motion.div
               className="space-y-3"
               variants={listStagger}
               initial="hidden"
               animate="visible"
            >
              <AnimatePresence mode="popLayout">
                {transactions.slice(0, 5).map((t) => (
                  <motion.div
                    key={t.id}
                    layout="position"
                    variants={listItem}
                    exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
                    onClick={() => setSelectedTx(t)}
                    className="flex items-center gap-3 bg-white p-4 rounded-[24px] border border-slate-100 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.02)] relative overflow-hidden group cursor-pointer active:scale-[0.98] transition-all"
                  >
                    {/* Native Avatar/Icon */}
                    <div className={`w-12 h-12 rounded-[16px] flex items-center justify-center shrink-0 ${
                      t.type === "receive" 
                        ? "bg-teal-50 text-teal-600" 
                        : t.method === "bank" ? "bg-indigo-50 text-indigo-600" : "bg-amber-50 text-amber-600"
                    }`}>
                      {t.type === "receive" ? (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>
                      ) : (
                         t.method === 'bank' ? (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                         ) : (
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                         )
                      )}
                    </div>
                    
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-bold text-slate-900 truncate tracking-tight">{t.description}</p>
                      <p className="text-xs font-medium text-slate-500 mt-0.5 truncate flex items-center gap-1">
                        {t.party}
                        <span className="w-1 h-1 rounded-full bg-slate-300 mx-0.5" />
                        <span className="capitalize">{t.method}</span>
                      </p>
                    </div>

                    {/* Amount & Date */}
                    <div className="text-right shrink-0 max-w-[110px]">
                       <p className={`text-[14px] font-bold tracking-tight truncate ${t.type === "receive" ? "text-teal-600" : "text-slate-900"}`}>
                         {t.type === "receive" ? "+" : "-"}{formatMoney(getTxTotal(t))}
                       </p>
                       <p className="text-[11px] text-slate-400 font-medium mt-1">
                          {t.created_at ? timeAgo(t.created_at) : ""}
                       </p>
                    </div>


                  </motion.div>
                ))}
              </AnimatePresence>
            </motion.div>
            </div>
          )}
        </motion.div>
      </div>

      {/* ===== Bottom Sheet Flow (Native Modals) ===== */}
      <AnimatePresence>
        {flowStep && (
          <>
            <motion.div
              className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-40"
              variants={backdropVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
              onClick={closeFlow}
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
              onDragEnd={(_, info) => { if (info.offset.y > 100) closeFlow(); }}
            >
              {/* Handle */}
              <div className="w-full flex justify-center py-4 shrink-0 cursor-grab active:cursor-grabbing">
                <div className="w-12 h-1.5 rounded-full bg-slate-200" />
              </div>

              <div className="px-6 pb-8 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                
                {/* Header */}
                <div className="mb-8">
                   <h2 className="text-[28px] font-black text-slate-900 mb-3 tracking-tighter">
                     {isReceive ? "Request Details" : "Send Details"}
                   </h2>
                   <div className="flex gap-1.5">
                     {[1, 2, 3].map((step) => (
                       <motion.div 
                          key={step} 
                          className={`h-1 rounded-full flex-1 ${
                            (flowStep === "method" && step === 1) || 
                            (flowStep === "details" && step <= 2) || 
                            (flowStep === "confirm" && step <= 3) 
                            ? "bg-indigo-600" : "bg-slate-100"
                          }`} 
                          layout
                       />
                     ))}
                   </div>
                </div>

                <AnimatePresence mode="wait">
                  {/* Step 1: Method */}
                  {flowStep === "method" && (
                    <motion.div key="method" variants={stepVariants} initial="enter" animate="center" exit="exit" className="flex flex-col h-full">
                      <p className="text-[15px] font-bold text-slate-500 mb-5">How would you like to transfer?</p>
                      
                      <div className="space-y-3 mb-8">
                        {/* Bank Card */}
                        <motion.button 
                           onClick={() => setMethod("bank")}
                           className={`w-full flex items-center p-4 rounded-[24px] border-2 text-left transition-colors ${
                             method === "bank" ? "border-indigo-600 bg-indigo-50/50 shadow-sm shadow-indigo-100" : "border-slate-100 bg-white"
                           }`}
                           whileTap={{ scale: 0.98 }}
                        >
                           <div className={`w-14 h-14 rounded-[16px] flex items-center justify-center mr-4 ${method === "bank" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>
                           </div>
                           <div className="flex-1">
                             <h4 className={`text-base font-bold tracking-tight ${method === "bank" ? "text-indigo-900" : "text-slate-800"}`}>Bank Transfer</h4>
                           </div>
                           <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${method === "bank" ? "border-indigo-600" : "border-slate-200"}`}>
                              {method === "bank" && <motion.div layoutId="radio" className="w-3 h-3 rounded-full bg-indigo-600" />}
                           </div>
                        </motion.button>
                        
                        {/* Wallet Card */}
                        <motion.button 
                           onClick={() => setMethod("wallet")}
                           className={`w-full flex items-center p-4 rounded-[24px] border-2 text-left transition-colors ${
                             method === "wallet" ? "border-indigo-600 bg-indigo-50/50 shadow-sm shadow-indigo-100" : "border-slate-100 bg-white"
                           }`}
                           whileTap={{ scale: 0.98 }}
                        >
                           <div className={`w-14 h-14 rounded-[16px] flex items-center justify-center mr-4 ${method === "wallet" ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                             <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>
                           </div>
                           <div className="flex-1">
                             <h4 className={`text-base font-bold tracking-tight ${method === "wallet" ? "text-indigo-900" : "text-slate-800"}`}>Digital Wallet</h4>
                           </div>
                           <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${method === "wallet" ? "border-indigo-600" : "border-slate-200"}`}>
                              {method === "wallet" && <motion.div layoutId="radio" className="w-3 h-3 rounded-full bg-indigo-600" />}
                           </div>
                        </motion.button>
                      </div>

                      <div className="mt-auto pt-4">
                        <motion.button
                          onClick={() => setFlowStep("details")}
                          className="w-full py-4 rounded-full bg-slate-900 text-white font-bold text-[15px] shadow-lg shadow-slate-900/20"
                          whileTap={{ scale: 0.98 }}
                        >
                          Continue
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 2: Details */}
                  {flowStep === "details" && (
                    <motion.div key="details" variants={stepVariants} initial="enter" animate="center" exit="exit" className="flex flex-col h-full">
                      
                      <div className="mb-10 flex flex-col items-center">
                         <p className="text-[15px] font-bold text-slate-400 mb-2">Amount to {isReceive ? "request" : "send"}</p>
                         <div className="flex items-center justify-center text-[56px] font-black text-slate-900 tracking-tighter w-full max-w-[250px] mx-auto border-b-2 border-slate-100 pb-2">
                            <span className="text-[28px] text-slate-300 mr-2 mt-2 font-sans">EGP</span>
                            <input
                              type="number"
                              value={amount}
                              onChange={(e) => setAmount(e.target.value)}
                              placeholder="0"
                              autoFocus
                              className="bg-transparent text-left w-full focus:outline-none placeholder-slate-200"
                            />
                         </div>
                      </div>

                      <div className="space-y-5 mb-8">
                        <div className="relative">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-2">
                            {isReceive ? "From Who?" : "To Who?"}
                          </label>
                          <div className="relative flex items-center">
                            <div className="absolute left-4 w-6 h-6 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                            </div>
                            <input
                              type="text"
                              value={party}
                              onChange={(e) => setParty(e.target.value)}
                              placeholder="Name, @username, or phone"
                              className="w-full pl-12 pr-5 py-4 rounded-[20px] bg-slate-50 border border-slate-200 text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all text-[15px]"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => setParty(MY_NUMBER)}
                            className="mt-2 ml-1 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-indigo-50 text-indigo-600 text-xs font-bold cursor-pointer active:scale-95 transition-transform"
                          >
                            @me
                            <span className="text-indigo-400 font-mono">{MY_NUMBER}</span>
                          </button>
                        </div>
                        <div className="relative">
                          <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-2">
                            Note (Optional)
                          </label>
                          <div className="relative flex items-center">
                             <div className="absolute left-4 w-6 h-6 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center">
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                            </div>
                            <input
                              type="text"
                              value={description}
                              onChange={(e) => setDescription(e.target.value)}
                              placeholder="What's this for?"
                              className="w-full pl-12 pr-5 py-4 rounded-[20px] bg-slate-50 border border-slate-200 text-slate-900 font-bold placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-4 focus:ring-indigo-50 transition-all text-[15px]"
                            />
                          </div>
                        </div>
                      </div>

                      <div className="flex gap-3 mt-auto pt-4">
                        <button onClick={() => setFlowStep("method")} className="w-[60px] h-[60px] rounded-[24px] bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 hover:bg-slate-200 transition-colors">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                        </button>
                        <motion.button
                          onClick={() => { if (amount && party && description) setFlowStep("confirm"); }}
                          disabled={!amount || !party || !description}
                          className="flex-1 h-[60px] rounded-[24px] bg-slate-900 text-white font-bold text-[15px] shadow-lg shadow-slate-900/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center"
                          whileTap={{ scale: 0.98 }}
                        >
                          Review details
                        </motion.button>
                      </div>
                    </motion.div>
                  )}

                  {/* Step 3: Confirm */}
                  {flowStep === "confirm" && (
                    <motion.div key="confirm" variants={stepVariants} initial="enter" animate="center" exit="exit" className="flex flex-col h-full">
                       
                       <div className="flex flex-col items-center mb-8 relative">
                         {/* Connecting lines decor */}
                         <div className="absolute top-10 w-32 h-px bg-slate-200 border-dashed" />
                         
                         <div className="flex items-center gap-8 relative z-10 mb-6">
                           <div className="w-[72px] h-[72px] rounded-full bg-slate-900 border-4 border-white shadow-md flex items-center justify-center overflow-hidden">
                             <img src={`https://api.dicebear.com/9.x/notionists/svg?seed=Boody&backgroundColor=0f172a`} alt="You" className="w-full h-full object-cover" />
                           </div>
                           <div className="w-[72px] h-[72px] rounded-full bg-indigo-100 border-4 border-white shadow-md flex items-center justify-center text-[28px] font-black text-indigo-700">
                              {party.charAt(0).toUpperCase()}
                           </div>
                         </div>
                         
                         <h3 className="text-[36px] font-black text-slate-900 tracking-tighter flex items-baseline gap-1.5">
                           <span className="text-xl text-slate-500 font-bold">EGP</span>
                           {formatMoney(parseFloat(amount) || 0).replace('EGP ','')}
                         </h3>
                         <p className="text-[15px] font-bold text-slate-500 mt-2">{isReceive ? "Request from" : "Sending to"} <span className="text-slate-900">{party}</span></p>
                       </div>

                       <div className="bg-slate-50 border border-slate-100 rounded-[24px] p-5 space-y-4 mb-8 mx-1">
                         <div className="flex justify-between items-center">
                           <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Method</span>
                           <span className="text-[15px] font-bold text-slate-900 capitalize flex items-center gap-1.5">
                             {method === "bank" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>}
                             {method} Transfer
                           </span>
                         </div>
                         <div className="flex justify-between items-center">
                           <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Date</span>
                           <span className="text-[15px] font-bold text-slate-900">Right now</span>
                         </div>
                         <div className="w-full h-px bg-slate-200 border-dashed" />
                         <div className="flex justify-between items-start">
                           <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Note</span>
                           <span className="text-[15px] font-bold text-slate-900 text-right max-w-[65%]">{description}</span>
                         </div>
                         {walletFee && (
                           <>
                             <div className="w-full h-px bg-slate-200 border-dashed" />
                             <div className="flex justify-between items-center">
                               <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Transfer Fee</span>
                               <span className="text-[15px] font-bold text-rose-500">EGP {walletFee.fee.toFixed(2)}</span>
                             </div>
                             <div className="flex justify-between items-center">
                               <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Fee Type</span>
                               <span className="text-[13px] font-semibold text-slate-500">{walletFee.label}</span>
                             </div>
                             <div className="w-full h-px bg-slate-200 border-dashed" />
                             <div className="flex justify-between items-center">
                               <span className="text-[13px] font-bold text-slate-900 uppercase tracking-wide">Total</span>
                               <span className="text-[17px] font-black text-slate-900">EGP {((parseFloat(amount) || 0) + walletFee.fee).toFixed(2)}</span>
                             </div>
                           </>
                         )}
                       </div>

                       <div className="flex gap-3 mt-auto pt-4">
                        <button onClick={() => setFlowStep("details")} className="w-[60px] h-[60px] rounded-[24px] bg-slate-100 flex items-center justify-center text-slate-600 shrink-0 hover:bg-slate-200 transition-colors">
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                        </button>
                        <motion.button
                          onClick={handleConfirm}
                          disabled={saving}
                          className={`flex-1 h-[60px] rounded-[24px] text-white font-bold text-[15px] shadow-lg transition-all flex items-center justify-center gap-2 ${
                            isReceive ? "bg-teal-500 shadow-teal-500/30" : "bg-indigo-600 shadow-indigo-600/30"
                          }`}
                          whileTap={{ scale: 0.98 }}
                        >
                          {saving && <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                          {!saving && (isReceive ? "Confirm Request" : "Confirm Send")}
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ===== Transaction Details Sheet ===== */}
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
              <div className="px-6 pb-8 overflow-y-auto flex-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                <div className="flex flex-col items-center mb-8 relative">
                   <div className="w-[88px] h-[88px] rounded-full bg-slate-100 border-4 border-white shadow-md flex items-center justify-center text-[36px] font-black text-slate-800 mb-6 z-10">
                      {selectedTx.party.charAt(0).toUpperCase()}
                   </div>
                   <h3 className="text-[44px] font-black tracking-tighter flex items-baseline gap-1.5">
                     <span className="text-[22px] text-slate-400 font-bold">EGP</span>
                     <span className={selectedTx.type === "receive" ? "text-teal-600" : "text-slate-900"}>
                       {selectedTx.type === "receive" ? "+" : "-"}{formatMoney(selectedTx.amount).replace('EGP ','')}
                     </span>
                   </h3>
                   <p className="text-[17px] font-bold text-slate-500 mt-2">{selectedTx.type === "receive" ? "From" : "To"} <span className="text-slate-900">{selectedTx.party}</span></p>
                </div>
                
                <div className="bg-slate-50 border border-slate-100 rounded-[24px] p-5 space-y-4 mb-8">
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Status</span>
                    <span className="text-[15px] font-bold text-emerald-600 flex items-center gap-1.5">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                      Completed
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Method</span>
                    <span className="text-[15px] font-bold text-slate-900 capitalize flex items-center gap-1.5">
                      {selectedTx.method === "bank" ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg> : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4Z"/></svg>}
                      {selectedTx.method} Transfer
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wide">Date</span>
                    <span className="text-[15px] font-bold text-slate-900">
                      {selectedTx.created_at ? new Date(selectedTx.created_at).toLocaleString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute:'2-digit' }) : "Recently"}
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
                    <span className="text-[13px] font-bold text-slate-400 font-mono text-right max-w-[65%]">#{selectedTx.id.toString().padStart(8, '0')}</span>
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
