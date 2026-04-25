import React from 'react';
import { motion } from 'framer-motion';
import { useUnityCardStore } from '../../store/unityCardStore';
import { CreditCard, ShoppingBag, ArrowRightLeft, Info, Zap, Send, Plus, Bell, MoreHorizontal, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function UnityCardDashboard() {
  const { creditLimit, pan } = useUnityCardStore();
  const navigate = useNavigate();

  // If someone lands here without completing onboarding
  if (!creditLimit) {
    navigate('/unity-card');
    return null;
  }

  // Format currency
  const formattedLimit = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(creditLimit);

  const availableLimit = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(creditLimit * 0.85); // Dummy 85% available

  return (
    <div className="min-h-screen bg-[#F5F2EB] text-[#2C2A26] font-sans pb-24 relative overflow-hidden">
      {/* Subtle Background Elements */}
      <div className="absolute top-[-10%] right-[-10%] w-[500px] h-[500px] bg-[#0070F3]/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[500px] h-[500px] bg-[#FF0080]/5 rounded-full blur-[100px] pointer-events-none" />

      <div className="max-w-md mx-auto relative z-10 p-6 pt-10">
        
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-[#2C2A26] rounded-full flex items-center justify-center text-[#F5F2EB] font-bold text-lg shadow-md border-2 border-[#D6D1C7]">
              {useUnityCardStore.getState().nameOnCard?.charAt(0) || 'U'}
            </div>
            <div>
              <p className="text-[#2C2A26]/60 text-sm font-bold">Good Morning,</p>
              <h1 className="text-xl font-black text-[#2C2A26] tracking-tight">{useUnityCardStore.getState().nameOnCard || 'User'}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm border border-[#D6D1C7] hover:bg-[#F5F2EB] transition-colors relative">
              <Bell className="w-5 h-5 text-[#2C2A26]" />
              <div className="absolute top-2 right-2 w-2 h-2 bg-[#FF0080] rounded-full border border-white" />
            </button>
          </div>
        </div>

        {/* Limit Overview & Virtual Card */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="mb-8"
        >
          <div className="bg-[#2C2A26] text-[#F5F2EB] rounded-[2rem] p-6 shadow-xl relative overflow-hidden">
            {/* Decorative shapes inside card */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-[#0070F3] to-[#FF0080] rounded-full blur-3xl opacity-20 -translate-y-1/2 translate-x-1/4" />
            <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#50E3C2] rounded-full blur-2xl opacity-20 translate-y-1/2 -translate-x-1/4" />

            <div className="relative z-10 flex justify-between items-start mb-6">
              <div>
                <p className="text-white/60 text-sm font-medium mb-1">Available Balance</p>
                <h2 className="text-4xl font-black tracking-tight">{availableLimit}</h2>
              </div>
              <img src="https://upload.wikimedia.org/wikipedia/commons/c/cb/Rupay-Logo.png" alt="RuPay" className="h-6 opacity-90 grayscale brightness-200" />
            </div>

            <div className="relative z-10 flex items-center gap-2 mb-8">
              <div className="w-full h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-[#50E3C2] to-[#0070F3] w-[85%] rounded-full relative">
                  <div className="absolute inset-0 bg-white/30 w-1/2 -skew-x-12 translate-x-[-150%] animate-[shimmer_2s_infinite]" />
                </div>
              </div>
            </div>

            <div className="relative z-10 flex justify-between items-end">
              <div>
                <div className="text-lg font-mono tracking-widest text-white/90 mb-1">
                  •••• •••• •••• {pan ? pan.slice(-4) : '4092'}
                </div>
                <p className="text-white/50 text-xs font-bold">Total Limit: {formattedLimit}</p>
              </div>
              <div className="w-10 h-6 rounded-md bg-white/20 backdrop-blur-sm border border-white/10 flex items-center justify-center">
                <div className="w-6 h-3 bg-gradient-to-r from-yellow-200 to-yellow-500 rounded-sm opacity-80" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <div className="mb-8">
          <h3 className="text-[#2C2A26] font-black text-lg mb-4">Quick Actions</h3>
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex justify-between items-center"
          >
            {[
              { icon: <Send className="w-6 h-6" />, label: "Send", color: "bg-[#0070F3]/10 text-[#0070F3]" },
              { icon: <Plus className="w-6 h-6" />, label: "Add", color: "bg-[#50E3C2]/10 text-[#00B386]" },
              { icon: <Zap className="w-6 h-6" />, label: "EMI", color: "bg-[#F5A623]/10 text-[#F5A623]" },
              { icon: <MoreHorizontal className="w-6 h-6" />, label: "More", color: "bg-[#2C2A26]/5 text-[#2C2A26]" },
            ].map((action, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <button className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-transform hover:-translate-y-1 shadow-sm border border-[#D6D1C7]/50 ${action.color}`}>
                  {action.icon}
                </button>
                <span className="text-xs font-bold text-[#2C2A26]/70">{action.label}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Recent Transactions */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-[#2C2A26] font-black text-lg">Recent Transactions</h3>
            <button className="text-[#0070F3] text-sm font-bold hover:underline">View All</button>
          </div>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="space-y-4"
          >
            {[
              { title: "Apple Store", category: "Electronics", amount: "₹85,000", type: "debit", icon: <ShoppingBag className="w-5 h-5 text-[#FF0080]" />, bg: "bg-[#FF0080]/10", date: "Today, 10:45 AM" },
              { title: "Starbucks", category: "Food & Beverage", amount: "₹450", type: "debit", icon: <Zap className="w-5 h-5 text-[#F5A623]" />, bg: "bg-[#F5A623]/10", date: "Yesterday, 4:20 PM" },
              { title: "Cashback Received", category: "Rewards", amount: "+₹1,250", type: "credit", icon: <ArrowDownLeft className="w-5 h-5 text-[#50E3C2]" />, bg: "bg-[#50E3C2]/10", date: "12 Oct, 09:00 AM" },
            ].map((tx, i) => (
              <div key={i} className="flex items-center justify-between bg-white p-4 rounded-2xl border border-[#D6D1C7] shadow-sm hover:shadow-md transition-shadow">
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${tx.bg}`}>
                    {tx.icon}
                  </div>
                  <div>
                    <h4 className="font-bold text-[#2C2A26]">{tx.title}</h4>
                    <p className="text-xs font-medium text-[#2C2A26]/50">{tx.date}</p>
                  </div>
                </div>
                <div className={`font-black ${tx.type === 'credit' ? 'text-[#00B386]' : 'text-[#2C2A26]'}`}>
                  {tx.amount}
                </div>
              </div>
            ))}
          </motion.div>
        </div>

      </div>
    </div>
  );
}
