import React, { useEffect } from 'react';
import { useNavigate, Navigate } from 'react-router-dom';
import { supabase } from '../../lib/supabaseClient';
import { useAuth } from '../../context/AuthContext';

const MindCoachLanding: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    async function checkExistingProfile() {
      if (!user?.id) return;
      
      const { data, error } = await supabase
        .from('mind_coach_profiles')
        .select('id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (active) {
        if (!error && data) {
          navigate(`/mind-coach/${data.id}`, { replace: true });
        } else {
          // If no profile, redirect to the official onboarding route
          navigate('/mind-coach/new', { replace: true });
        }
      }
    }
    checkExistingProfile();
    return () => { active = false; };
  }, [user?.id, navigate]);

  if (!user) {
    return <Navigate to="/mind-coach/login" replace />;
  }

  return (
    <div className="min-h-screen bg-[#FAFAF7] flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-10 h-10 border-2 border-[#6B8F71] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-[#2C2A26]/40 font-medium">Entering Mind Coach...</p>
      </div>
    </div>
  );
};

export default MindCoachLanding;
